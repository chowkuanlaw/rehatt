'use strict';
const { createHash } = require('node:crypto');
const PROVIDERS = Object.freeze({
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  claude: { name: 'Claude', url: 'https://claude.ai/' }
});
const hash = text => createHash('sha256').update(text || '').digest('hex');
const clean = text => String(text || '').replace(/\r/g, '').trim();
const STOP = /^(stop( generating| response| streaming| answering)?|henti(kan)?( menjana)?)$/i;
const SEND = /^(send( message| prompt)?|send now|hantar( mesej)?)$/i;
const LOGIN = /^(log in|login|sign in|log masuk)$/i;
const ERROR = /^(something went wrong|an error occurred|failed to generate|network error|usage limit reached|you.ve reached your limit)/i;
const HALTED = /^(stopped generating|response stopped|generation cancelled)$/i;
const ASSISTANT = /^(ChatGPT said|Claude said|Claude.s response|Assistant)\s*:?\s*$/i;
const USER = /^(You said|User)\s*:?\s*$/i;
const RESPONSE_CLASS = /(?:^|[\s_-])(font-claude-message|assistant-message|assistant-response|agent-message)(?:$|[\s_-])/i;
const COMPOSER = /^(prompt-textarea|chat-input|message-input|composer)/i;
// ChatGPT says "Ask ChatGPT anything" on its input field.
const INPUT_LABEL = /(message (ChatGPT|Claude)|reply to Claude|ask (anything|Claude|ChatGPT)|tanya (apa-apa|ChatGPT|Claude)|hantar mesej|how can (I|Claude) help|write (a|your) (message|reply)|reply\.\.\.|jawab)/i;

// Current claude.ai: each turn is a group "Message 52 of 52" that starts with a summary text
// "Claude responded: …" or "You said: …".
const MESSAGE = /^(message|mesej) \d+ (of|daripada) \d+$/i;
const ROLE_ASSISTANT = /^(Claude responded|Claude said|ChatGPT said)\s*:/i;
const ROLE_USER = /^You said\s*:/i;

function descendants(nodes, parent) {
  const ids = new Set([parent]);
  return nodes.filter(n => { if (ids.has(n.parent)) { ids.add(n.index); return true; } return false; });
}
// Joins inline pieces ("Press ", "Ctrl+O", " and …") into one line per paragraph or list item.
function blockText(nodes, scope) {
  const byIndex = new Map(nodes.map(n => [n.index, n]));
  const block = n => { let p = byIndex.get(n.parent); while (p && p.type === 'Text') p = byIndex.get(p.parent); return p?.index; };
  const lines = [], guards = []; let lastBlock;
  for (const n of scope) {
    const name = String(n.name || '').replace(/\r/g, '');
    if (!name.trim() || n.type !== 'Text' || nodes.some(child => child.parent === n.index && clean(child.name))) continue;
    const b = block(n);
    if (lines.length && b === lastBlock) lines[lines.length - 1] += name; else lines.push(name);
    lastBlock = b; guards.push({ id: n.id, name: n.name });
  }
  return { text: lines.map(clean).filter(Boolean).join('\n').slice(0, 40000), guards };
}
function lastMessageTurn(nodes) {
  const turns = nodes.filter(n => n.type === 'Group' && MESSAGE.test(clean(n.name)));
  if (!turns.length) return undefined;
  const anchor = turns.at(-1), inside = descendants(nodes, anchor.index);
  if (inside.some(n => ROLE_USER.test(clean(n.name)))) return null; // Newest turn is yours: no reply yet.
  if (!inside.some(n => ROLE_ASSISTANT.test(clean(n.name)))) return undefined;
  // Skip the summary line, the thinking status and the action toolbar.
  const skip = new Set();
  for (const n of inside) {
    if (skip.has(n.parent) || ROLE_ASSISTANT.test(clean(n.name)) || ['ToolBar', 'StatusBar', 'Button'].includes(n.type)) skip.add(n.index);
  }
  const { text, guards } = blockText(nodes, inside.filter(n => !skip.has(n.index)));
  if (!text) return null;
  return { text, fingerprint: hash(text), guards, anchor: anchor.index };
}
function lastAssistant(nodes) {
  const turn = lastMessageTurn(nodes);
  if (turn !== undefined) return turn;
  const groups = nodes.filter(n => RESPONSE_CLASS.test(n.className || '') && ['Group', 'Pane', 'Document'].includes(n.type));
  let scope, anchor;
  if (groups.length) {
    anchor = groups.at(-1); scope = descendants(nodes, anchor.index);
  } else {
    const markers = nodes.filter(n => ASSISTANT.test(clean(n.name)) && n.type !== 'Button');
    anchor = markers.at(-1);
    if (!anchor) return null;
    scope = nodes.filter(n => n.index > anchor.index);
  }
  const parts = [], guards = [];
  if (!scope.length && clean(anchor.name) && !ASSISTANT.test(clean(anchor.name))) scope = [anchor];
  for (const n of scope) {
    const name = clean(n.name);
    if (USER.test(name)) return null; // A newer user turn: the old reply is no longer awaiting input.
    if (n.type === 'Edit' || COMPOSER.test(n.automationId || '')) break;
    if (!name || ASSISTANT.test(name) || !['Text', 'Group', 'Pane'].includes(n.type)) continue;
    if (nodes.some(child => child.parent === n.index && clean(child.name))) continue;
    if (/^(ChatGPT can make mistakes|Claude can make mistakes|check important info)/i.test(name)) continue;
    if (parts.at(-1) !== name) { parts.push(name); guards.push({ id: n.id, name: n.name }); }
  }
  const text = parts.join('\n').slice(0, 40000);
  if (!text) return null;
  return { text, fingerprint: hash(text), guards, anchor: anchor.index };
}
function questionFrom(text) {
  // Conservative text recognition; examples, quotes and code do not prove an input request.
  // Only the closing lines count: a real question near the end ("Do you want A or B?"),
  // or a last line that asks you to answer ("Type 1 or 2.", "Let me know.", "Beritahu saya.").
  let fenced = false;
  const lines = clean(text).split(/\n+/).map(l => l.trim()).filter(l => {
    if (l.startsWith('```')) { fenced = !fenced; return false; }
    return l && !fenced;
  });
  const plain = l => l.replace(/[*_`]/g, '').trim();
  const asks = l => /\?\s*[*_]*$/.test(l) && !/^([>`]|\*?contoh|example|question \d|soalan \d)/i.test(l) &&
    /\b(you|your|would|which|what|how|can|should|do you|anda|awak|kamu|mahu|hendak|boleh|mana|apa|bagaimana|pilih|patut)\b/i.test(l);
  const invites = l => /^(type|pick|choose|reply|let me know|tell me|taip|pilih|jawab|beritahu)\b/i.test(plain(l)) ||
    /\b(let me know|beritahu (saya|aku))[.!]?$/i.test(plain(l));
  const tail = lines.slice(-3), last = tail.at(-1) || '';
  if (!tail.some(asks) && !invites(last)) return '';
  return text.slice(-6000);
}
function observe(snapshot, provider) {
  if (!snapshot?.ok) return { valid: false, detail: snapshot?.error || 'Window not available.' };
  if (!PROVIDERS[provider] || snapshot.provider !== provider) return { valid: false, detail: 'The chosen window no longer shows this chat.' };
  if (snapshot.truncated) return { valid: false, detail: 'This window does not show enough readable text yet. Open the latest answer.' };
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const buttons = nodes.filter(n => n.type === 'Button' && n.enabled !== false);
  const login = buttons.find(n => LOGIN.test(clean(n.name)));
  if (login) return { valid: false, login: true, detail: 'First log in to ' + PROVIDERS[provider].name + '.' };
  const richEditors = nodes.filter(n => !n.password && n.type === 'Edit' && /(?:^|\s)ProseMirror(?:\s|$)/.test(n.className || ''));
  const edits = nodes.filter(n => !n.password && n.enabled !== false &&
    (n.type === 'Edit' || COMPOSER.test(n.automationId || '')) &&
    (COMPOSER.test(n.automationId || '') || INPUT_LABEL.test(clean(n.name)) || INPUT_LABEL.test(clean(n.helpText)) ||
      (richEditors.length === 1 && n.id === richEditors[0].id))); // the one rich text box of the chat (claude.ai and chatgpt.com)
  // Never guess an arbitrary edit field, search box or address bar.
  const composer = edits.length === 1 ? edits[0] : null;
  // claude.ai also announces streaming in a status line, e.g. "Claude is responding".
  const stop = buttons.find(n => STOP.test(clean(n.name))) ||
    nodes.find(n => n.type === 'Text' && /^Claude is (responding|thinking|writing)\b/i.test(clean(n.name)));
  const send = buttons.find(n => SEND.test(clean(n.name)));
  const assistant = lastAssistant(nodes);
  const tail = assistant ? nodes.filter(n => n.index > assistant.anchor) : [];
  const error = tail.find(n => n.type === 'Text' && ERROR.test(clean(n.name)));
  const halted = tail.find(n => n.type === 'Text' && HALTED.test(clean(n.name)));
  const completed = Boolean(assistant && composer && tail.some(n => n.type === 'Button' &&
    /^(copy( response| message)?|salin|good response|bad response|retry|regenerate|cuba lagi)$/i.test(clean(n.name))));
  const phase = nodes.find(n => n.type === 'Text' && /^(thinking|searching the web|writing|researching|berfikir|mencari di web|menulis)(\.{0,3})$/i.test(clean(n.name)));
  return { valid: Boolean(composer || stop), detail: composer || stop ? '' : 'Input field not recognised. Open the chat in this window.',
    contextKey: snapshot.contextKey, stop: Boolean(stop), composer, send, assistant, completed,
    error: error?.name || '', halted: Boolean(halted), question: assistant ? questionFrom(assistant.text) : '',
    activity: phase?.name || 'Writing the answer', snapshot };
}
// "Ideas for my site - Google Chrome" → "Ideas for my site"
function chatTitle(title) {
  return String(title || '').replace(/\s+[-–—]\s+(Google Chrome|Microsoft​? Edge|Mozilla Firefox|Brave|Opera|Vivaldi|Arc)$/i, '')
    .replace(/^(ChatGPT|Claude)\s+[-–—]\s+/i, '').trim();
}
class Session {
  constructor(provider, target) {
    this.provider = provider; this.target = target; this.contextKey = null; this.state = 'connecting';
    this.detail = 'Checking the connection'; this.run = null; this.last = null; this.stable = 0;
    this.baseline = null; this.completions = 0;
    this.question = ''; this.questionId = ''; this.startedAt = null; this.endedAt = null; this.notification = null;
  }
  accept(obs, now = Date.now()) {
    this.notification = null; this.last = obs;
    if (!obs.valid) {
      this.state = obs.login ? 'login' : 'unavailable'; this.detail = obs.detail;
      this.run = null; this.baseline = null; this.stable = 0; this.question = ''; this.questionId = ''; return this.public(now);
    }
    if (this.contextKey && this.contextKey !== obs.contextKey) {
      const isNewChat = this.run && /:https:\/\/(chatgpt\.com|claude\.ai)\/?$/.test(this.contextKey);
      if (!isNewChat) {
        // Another chat is open now: Kopi simply follows that one (like Coucou, nothing to reconnect).
        // Its current answer is the starting point, so an old answer never counts as "done".
        this.contextKey = obs.contextKey; this.run = null; this.stable = 0; this.startedAt = null; this.endedAt = null;
        this.baseline = obs.assistant?.fingerprint || ''; this.preview = obs.assistant?.text || '';
        this.state = 'ready'; this.detail = 'Following this chat'; this.question = ''; this.questionId = '';
        this.title = chatTitle(obs.snapshot?.title || this.target.title); return this.public(now);
      }
    }
    this.contextKey = obs.contextKey; this.title = chatTitle(obs.snapshot?.title || this.target.title);
    if (obs.assistant?.text) this.preview = obs.assistant.text;
    const previousReply = this.baseline;
    this.baseline = obs.assistant?.fingerprint || '';
    if (obs.error || obs.halted) {
      this.state = obs.halted ? 'stopped' : 'error'; this.detail = obs.halted ? 'Answer stopped' : obs.error;
      this.run = null; this.question = ''; this.questionId = ''; return this.public(now);
    }
    if (obs.stop) {
      if (!this.run) { this.run = { baseline: obs.assistant?.fingerprint || '', last: '', began: now }; this.startedAt = now; }
      // Keep the observed streaming fingerprint to require final action controls and a stable reply.
      this.run.latest = obs.assistant?.fingerprint || '';
      this.state = 'running'; this.detail = obs.activity; this.stable = 0; this.endedAt = null;
      this.question = ''; this.questionId = ''; return this.public(now);
    }
    if (!this.run && previousReply !== null && this.baseline && this.baseline !== previousReply && obs.completed) {
      // A very short response may finish between polls. Require a changed reply, final controls and stability.
      this.run = { baseline: previousReply, last: this.baseline, began: now, settlingAt: now };
      this.startedAt = now; this.endedAt = null; this.stable = 0;
      this.state = 'running'; this.detail = 'Checking the new answer'; return this.public(now);
    }
    if (this.run) {
      const fingerprint = obs.assistant?.fingerprint || '';
      this.stable = fingerprint && this.run.last === fingerprint ? this.stable + 1 : 0;
      this.run.last = fingerprint;
      if (!obs.completed || this.stable < 1) {
        this.state = 'running'; this.detail = 'Checking the end of the answer';
        this.run.settlingAt ||= now;
        if (now - this.run.settlingAt > 20000 && !obs.completed) {
          this.state = 'unavailable'; this.detail = 'The end of this answer is not confirmed.'; this.run = null;
        }
        return this.public(now);
      }
      this.run = null; this.endedAt = now;
      this.state = obs.question ? 'question' : 'done';
      this.detail = obs.question ? 'Has a question for you' : 'Answer ready';
      this.question = obs.question; this.questionId = obs.question ? fingerprint : '';
      this.completions++;
      this.notification = this.state; return this.public(now);
    }
    if (obs.question && obs.completed) {
      this.state = 'question'; this.detail = 'Question in the latest answer';
      this.question = obs.question; this.questionId = obs.assistant.fingerprint;
    } else if (this.state !== 'done') {
      this.state = 'ready'; this.detail = 'Ready · window connected'; this.question = ''; this.questionId = '';
    }
    return this.public(now);
  }
  public(now = Date.now()) {
    return { provider: this.provider, name: PROVIDERS[this.provider].name, connected: true,
      state: this.state, detail: this.detail, question: this.question, questionId: this.questionId,
      elapsed: this.startedAt ? Math.floor(((this.endedAt || now) - this.startedAt) / 1000) : 0,
      canReply: this.state === 'question' && Boolean(this.last?.composer),
      source: { title: this.title || chatTitle(this.target.title), process: this.target.process }, targetId: this.target.id,
      preview: String(this.preview || '').slice(-1200) };
  }
}
module.exports = { PROVIDERS, observe, Session, questionFrom, hash };
