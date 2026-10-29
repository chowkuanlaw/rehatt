'use strict';
// Claude Code and Codex hooks → Kopi Island traffic light.
// Claude Code posts each hook event to a small server on 127.0.0.1. Codex runs a tiny command (curl, part of
// Windows) that posts the same events there, tagged agent=codex. No browser or window reading needed.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { questionFrom } = require('./ai-monitor-model.cjs');

const PORT = 47851;
const ROUTE = '/kopi-hook';
const STATUS_ROUTE = '/kopi-status';
const STATUS_SCRIPT = path.join(__dirname, 'kopi-statusline.cjs');
const WAIT_ROUTE = '/kopi-wait';
const REPLY_SCRIPT = path.join(__dirname, 'kopi-reply.cjs');
const REPLY_WAIT_S = 1800; // how long an island answer can still wake Claude after it stopped
const VERSION = 4; // Bump when the installed hook config changes; older installs are upgraded on start.
const HOOK_URL = 'http://127.0.0.1:' + PORT + ROUTE + '?v=' + VERSION;
const EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest',
  'Notification', 'Stop', 'StopFailure', 'SessionEnd'];
// The terminal dialog stays usable while this hook waits; whoever answers first wins.
const PERMISSION_WAIT_S = 300;
const QUESTION_NOTIFICATIONS = new Set(['elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);
const RANK = { question: 4, error: 3, running: 2, done: 1, ready: 0 };
// The two coding agents Kopi Island follows. Codex reads its hooks from ~/.codex/hooks.json (the same shape as Claude Code).
const AGENTS = { claude: { id: 'claudecode', name: 'Claude Code', short: 'Claude' }, codex: { id: 'codex', name: 'Codex', short: 'Codex' } };
const CODEX_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SessionEnd'];

function createHub(options = {}) {
  const userData = options.userData;
  const settingsFile = options.settingsFile || path.join(os.homedir(), '.claude', 'settings.json');
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const codexFile = path.join(codexHome, 'hooks.json');
  const onChange = options.onChange || (() => {});
  const onFinish = options.onFinish || (() => {});
  // The pid a hook sends is a short-lived helper shell. Right away (while it still exists) we look up the
  // window that really runs Claude Code (Windows Terminal, VS Code, ...) and remember that one.
  const resolvePid = options.resolvePid || (pid => Promise.resolve(pid));
  function learnPid(s, pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0 || s.windowPid || s.resolving === pid) return;
    s.pid ||= pid; s.resolving = pid;
    resolvePid(pid).then(win => { if (win) { s.windowPid = win; s.pid = win; onChange(); } }).catch(() => {}).finally(() => { if (s.resolving === pid) s.resolving = null; });
  }
  const sessions = new Map();
  const waiting = new Map(); // session id → open PermissionRequest response
  let server = null, listening = false, serverError = '', hooksCache = false, checkedAt = 0;
  let usage = { fiveHour: null, sevenDay: null, at: 0 };
  const changed = () => { checkedAt = 0; onChange(); };
  // What your AI did, for the home page of the Kopi Island app: the last 40 finished turns (kept on this PC only).
  const historyFile = userData ? path.join(userData, 'kopi-history.json') : null;
  let history = [];
  try { history = JSON.parse(fs.readFileSync(historyFile, 'utf8')); if (!Array.isArray(history)) history = []; } catch {}
  function remember(s, result) {
    if (!historyFile || !s.prompt) return;
    history.unshift({ at: Date.now(), agent: s.agent || 'claude', name: (AGENTS[s.agent] || AGENTS.claude).name, project: s.project || '', cwd: s.cwd || '', prompt: s.prompt,
      result, files: (s.files || []).length, seconds: s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0 });
    history = history.slice(0, 40);
    try { fs.writeFileSync(historyFile + '.tmp', JSON.stringify(history)); fs.renameSync(historyFile + '.tmp', historyFile); } catch {}
  }

  function token() {
    const file = path.join(userData, 'claude-code-hook-token');
    try { const saved = fs.readFileSync(file, 'utf8').trim(); if (/^[a-f0-9]{48}$/.test(saved)) return saved; } catch {}
    const fresh = randomBytes(24).toString('hex');
    fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(file, fresh, { mode: 0o600 });
    return fresh;
  }

  // Claude Code runs our two small scripts (status line, island answers). Its Windows installer no longer
  // brings Node.js, and "node: command not found" after every answer breaks the chat. So without Node on
  // this PC the scripts run on Kopi Island's own runtime: the app's exe in Node mode.
  const run = options.runner || (() => {
    const exe = process.platform === 'win32' ? 'node.exe' : 'node';
    const hasNode = String(process.env.PATH || '').split(path.delimiter)
      .some(dir => { try { return Boolean(dir) && fs.statSync(path.join(dir, exe)).isFile(); } catch { return false; } });
    return hasNode || !process.versions.electron ? 'node' : `ELECTRON_RUN_AS_NODE=1 "${process.execPath.replace(/\\/g, '/')}"`;
  })();

  // ---- settings.json ----
  const isReplyHook = hook => hook?.type === 'command' && typeof hook.command === 'string' && hook.command.includes('kopi-reply');
  const isOurs = hook => (typeof hook?.url === 'string' && hook.url.startsWith('http://127.0.0.1:' + PORT + ROUTE)) || isReplyHook(hook);
  const replyCommand = () => `${run} "${REPLY_SCRIPT}" ${token()}`;
  function readSettings() {
    try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('~/.claude/settings.json is not valid JSON. Nothing was changed.'); }
  }
  function ours() {
    try {
      const hooks = readSettings().hooks || {};
      return EVENTS.flatMap(event => (hooks[event] || []).flatMap(group => (group.hooks || []).filter(isOurs)));
    } catch { return []; }
  }
  // Our status line forwards your 5-hour / weekly usage. A status line you made yourself is never replaced.
  const isOurStatus = line => typeof line?.command === 'string' && line.command.includes('kopi-statusline');
  const statusCommand = () => `${run} "${STATUS_SCRIPT}" ${token()}`;
  function statusOk() {
    try { const line = readSettings().statusLine; return !line || !isOurStatus(line) ? Boolean(line) : line.command === statusCommand(); }
    catch { return false; }
  }
  const installed = () => {
    const list = ours();
    return list.length === EVENTS.length + 1 && list.every(h => (isReplyHook(h) ? h.command === replyCommand() : h.url === HOOK_URL)) && statusOk();
  };
  function writeSettings(settings) {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    if (fs.existsSync(settingsFile)) fs.copyFileSync(settingsFile, settingsFile + '.kopi-backup');
    fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings, null, 2) + '\n');
    fs.renameSync(settingsFile + '.tmp', settingsFile);
  }
  // Which Claude model Claude Code starts with (settings.json "model"). 'default' = Claude Code's own choice.
  const MODELS = ['default', 'opus', 'sonnet', 'haiku', 'opusplan'];
  let modelCache = null, modelAt = 0;
  function getModel() {
    if (modelCache && Date.now() - modelAt < 5000) return modelCache;
    try { const m = readSettings().model; modelCache = MODELS.includes(m) ? m : m ? 'custom:' + String(m) : 'default'; } catch { modelCache = 'default'; }
    modelAt = Date.now(); return modelCache;
  }
  function setModel(model) {
    if (!MODELS.includes(model)) throw new Error('Unknown model.');
    const settings = readSettings(); if (model === 'default') delete settings.model; else settings.model = model;
    writeSettings(settings); modelCache = model; modelAt = Date.now(); onChange();
  }
  function strip(settings) {
    for (const event of Object.keys(settings.hooks || {})) {
      const groups = (settings.hooks[event] || [])
        .map(group => ({ ...group, hooks: (group.hooks || []).filter(hook => !isOurs(hook)) }))
        .filter(group => group.hooks.length);
      if (groups.length) settings.hooks[event] = groups; else delete settings.hooks[event];
    }
    if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  }
  function install() {
    const settings = readSettings(); strip(settings); settings.hooks ||= {};
    for (const event of EVENTS) {
      const hook = { type: 'http', url: HOOK_URL, timeout: event === 'PermissionRequest' ? PERMISSION_WAIT_S + 5 : 2, headers: { 'X-Kopi-Token': token() } };
      (settings.hooks[event] ||= []).push({ hooks: [hook] });
    }
    // Answer from the island: runs in the background after Claude stops; exit 2 wakes Claude with your text.
    settings.hooks.Stop.push({ hooks: [{ type: 'command', command: replyCommand(), asyncRewake: true, timeout: REPLY_WAIT_S + 10 }] });
    if (!settings.statusLine || isOurStatus(settings.statusLine)) settings.statusLine = { type: 'command', command: statusCommand(), padding: 0 };
    writeSettings(settings); changed(); return { ok: true };
  }
  function uninstall() {
    const settings = readSettings();
    if (ours().length || isOurStatus(settings.statusLine)) {
      strip(settings); if (isOurStatus(settings.statusLine)) delete settings.statusLine; writeSettings(settings);
    }
    for (const id of [...waiting.keys()]) release(id);
    for (const id of [...replies.keys()]) answer(id, '');
    sessions.clear(); changed(); return { ok: true };
  }

  // ---- Codex: ~/.codex/hooks.json ----
  // Codex runs a command for each event; curl.exe (in every Windows 10/11) passes the event on to Kopi Island.
  // Codex asks you once to trust new hooks: that is Codex keeping you safe.
  const codexCommand = () => `curl.exe -s -m 3 -H "X-Kopi-Token: ${token()}" -H "Content-Type: application/json" --data-binary @- "${HOOK_URL}&agent=codex"`;
  const isOurCodexHook = hook => hook?.type === 'command' && typeof hook.command === 'string' && hook.command.includes('127.0.0.1:' + PORT + ROUTE);
  const codexAvailable = () => fs.existsSync(codexHome);
  function readCodex() {
    try { return JSON.parse(fs.readFileSync(codexFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('~/.codex/hooks.json is not valid JSON. Nothing was changed.'); }
  }
  function writeCodex(config) {
    fs.mkdirSync(codexHome, { recursive: true });
    if (fs.existsSync(codexFile)) fs.copyFileSync(codexFile, codexFile + '.kopi-backup');
    fs.writeFileSync(codexFile + '.tmp', JSON.stringify(config, null, 2) + '\n');
    fs.renameSync(codexFile + '.tmp', codexFile);
  }
  function stripCodex(config) {
    for (const event of Object.keys(config.hooks || {})) {
      const groups = (config.hooks[event] || []).map(group => ({ ...group, hooks: (group.hooks || []).filter(hook => !isOurCodexHook(hook)) })).filter(group => group.hooks.length);
      if (groups.length) config.hooks[event] = groups; else delete config.hooks[event];
    }
    if (config.hooks && !Object.keys(config.hooks).length) delete config.hooks;
  }
  function codexInstalled() {
    try {
      const hooks = readCodex().hooks || {}, cmd = codexCommand();
      return CODEX_EVENTS.every(event => (hooks[event] || []).some(group => (group.hooks || []).some(h => isOurCodexHook(h) && h.command === cmd)));
    } catch { return false; }
  }
  function installCodex() {
    const config = readCodex(); stripCodex(config); config.hooks ||= {};
    for (const event of CODEX_EVENTS) (config.hooks[event] ||= []).push({ hooks: [{ type: 'command', command: codexCommand(), timeout: 5, async: true, statusMessage: 'Kopi Island' }] });
    writeCodex(config); changed(); return { ok: true };
  }
  function uninstallCodex() {
    const config = readCodex(); stripCodex(config); writeCodex(config);
    for (const [id, s] of sessions) if (s.agent === 'codex') sessions.delete(id);
    changed(); return { ok: true };
  }

  // ---- answers typed in the island (kopi-reply.cjs waits on WAIT_ROUTE) ----
  const replies = new Map(); // session id → { res, timer }
  function answer(id, text) {
    const wait = replies.get(id); if (!wait) return false;
    replies.delete(id); clearTimeout(wait.timer);
    try { wait.res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(text ? { reply: text } : { cancel: true })); } catch {}
    return true;
  }
  function holdReply(id, res) {
    if (!id) { res.writeHead(400).end(); return; }
    answer(id, ''); // an older wait for this session is stale
    replies.set(id, { res, timer: setTimeout(() => { answer(id, ''); onChange(); }, REPLY_WAIT_S * 1000) });
    res.on('close', () => { if (replies.get(id)?.res === res) { replies.delete(id); onChange(); } });
    onChange();
  }
  function reply(sessionId, text) {
    const clean = String(text || '').trim();
    if (!clean || clean.length > 5000) throw new Error('Type an answer of at most 5000 characters.');
    if (!answer(sessionId, clean)) throw new Error('Claude Code is no longer waiting for an answer. Type it in the terminal.');
    const s = sessions.get(sessionId);
    if (s) { s.state = 'running'; s.detail = 'Your answer was sent'; s.question = ''; s.startedAt = Date.now(); s.endedAt = null; }
    onChange(); return { ok: true };
  }

  // ---- permission answers ----
  function release(id, decision) {
    const wait = waiting.get(id); if (!wait) return false;
    waiting.delete(id); clearTimeout(wait.timer);
    const body = decision ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }) : '';
    try { wait.res.writeHead(200, body ? { 'content-type': 'application/json' } : {}).end(body); } catch {}
    return true;
  }
  function decide(sessionId, behavior) {
    if (!['allow', 'deny'].includes(behavior)) throw new Error('Choose allow or deny.');
    const s = sessions.get(sessionId);
    const decision = behavior === 'allow' ? { behavior: 'allow', updatedInput: s?.permissionInput || {} } : { behavior: 'deny', message: 'Denied from Kopi Island.' };
    if (!release(sessionId, decision)) throw new Error('This question was already answered, maybe in the terminal.');
    if (s) { s.permission = null; s.question = ''; s.state = 'running'; s.detail = behavior === 'allow' ? 'Allowed, continuing' : 'Denied'; }
    onChange(); return { ok: true };
  }

  // Multiple-choice question (AskUserQuestion): answers map question text → chosen label(s) or your own text.
  function answerQuestions(sessionId, answers) {
    const s = sessions.get(sessionId);
    if (!s?.ask) throw new Error('There is no open question any more.');
    const clean = {};
    for (const q of s.ask) {
      const value = answers?.[q.question];
      const text = Array.isArray(value) ? value.map(String).filter(Boolean).join(', ') : String(value || '').trim();
      if (!text) throw new Error('Choose an answer for every question.');
      clean[q.question] = text.slice(0, 2000);
    }
    const decision = { behavior: 'allow', updatedInput: { ...s.permissionInput, answers: clean } };
    if (!release(sessionId, decision)) throw new Error('This question was already answered, maybe in the terminal.');
    s.permission = null; s.ask = null; s.question = ''; s.state = 'running'; s.detail = 'Your answer was sent';
    onChange(); return { ok: true };
  }
  // Plan mode (ExitPlanMode): approve the plan, or send it back with your feedback.
  function decidePlan(sessionId, approve, feedback) {
    const s = sessions.get(sessionId);
    if (!s?.plan) throw new Error('There is no open plan any more.');
    const note = String(feedback || '').trim().slice(0, 4000);
    const decision = approve ? { behavior: 'allow', updatedInput: s.permissionInput || {} }
      : { behavior: 'deny', message: note ? 'The user wants to change the plan: ' + note : 'The user does not want to carry out the plan yet. Ask what should change.' };
    if (!release(sessionId, decision)) throw new Error('This plan was already answered, maybe in the terminal.');
    s.permission = null; s.plan = null; s.question = ''; s.state = 'running';
    s.detail = approve ? 'Allowed, continuing' : 'Your answer was sent';
    onChange(); return { ok: true };
  }

  // From the status line: plan usage is account-wide, context is per session.
  function applyUsage(data) {
    const window = w => (w && Number.isFinite(w.used) ? { used: Math.max(0, Math.min(100, w.used)), resetsAt: Number(w.resets_at) || null } : null);
    usage = { fiveHour: window(data.five_hour) || usage.fiveHour, sevenDay: window(data.seven_day) || usage.sevenDay, at: Date.now() };
    const s = sessions.get(String(data.session_id || ''));
    if (s && Number.isFinite(data.context)) s.context = data.context;
    if (s) learnPid(s, data.pid);
    if (s && typeof data.model === 'string' && data.model) s.modelName = data.model.slice(0, 40); // the model this session really uses
    onChange();
  }

  // You looked at it: green, red and plain questions go back to quiet. An open permission stays.
  function seen() {
    for (const s of sessions.values()) {
      if (['done', 'error'].includes(s.state) || (s.state === 'question' && !waiting.has(s.id))) {
        s.state = 'ready'; s.detail = 'Seen'; s.question = ''; s.permission = null;
      }
    }
    onChange(); return { ok: true };
  }

  // ---- events ----
  function apply(event, res, agent = 'claude') {
    const id = typeof event.session_id === 'string' ? event.session_id : '';
    const name = event.hook_event_name;
    if (!id || !(agent === 'codex' ? CODEX_EVENTS : EVENTS).includes(name)) return false;
    const who = AGENTS[agent] || AGENTS.claude;
    if (agent === 'codex') res = null; // Codex does not wait for the island: you answer in its own window
    // A finished tool or turn means the permission was answered elsewhere (terminal, phone).
    // PreToolUse is excluded: parallel tool calls may start while a permission is still open.
    if (!['PermissionRequest', 'Notification', 'PreToolUse'].includes(name)) release(id);
    // You typed in the terminal (or the session ended): the island answer is no longer needed.
    if (['UserPromptSubmit', 'SessionEnd'].includes(name)) answer(id, '');
    if (name === 'SessionEnd') { sessions.delete(id); onChange(); return false; }
    const now = Date.now();
    const s = sessions.get(id) || { id, agent, state: 'ready', detail: '', question: '', permission: null, startedAt: null, endedAt: null, updatedAt: now };
    s.agent = agent;
    if (typeof event.cwd === 'string') { s.project = path.basename(event.cwd); s.cwd = event.cwd; }
    s.updatedAt = now;
    const start = () => { if (!s.startedAt || s.endedAt) s.startedAt = now; s.endedAt = null; };
    let held = false;
    switch (name) {
      case 'SessionStart':
        s.state = 'ready'; s.detail = 'Ready for your question'; break;
      case 'UserPromptSubmit':
        s.startedAt = now; s.endedAt = null; s.state = 'running'; s.detail = who.short + ' is working'; s.question = ''; s.permission = null;
        s.ask = null; s.plan = null; s.stats = {}; s.steps = []; s.files = []; s.commands = []; s.code = null; s.run = null;
        s.prompt = String(event.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 240); s.lastMessage = ''; break;
      case 'PreToolUse':
        start();
        // Step list for the Claude page: what Claude is doing, one line per tool call.
        if (!['AskUserQuestion', 'ExitPlanMode'].includes(event.tool_name)) {
          s.steps ||= []; s.steps.push({ tool: String(event.tool_name || ''), kind: toolKind(event.tool_name) || 'other', label: toolLabel(event), what: toolDetail(event).slice(0, 120), state: 'running' });
          if (s.steps.length > 12) s.steps.shift();
          // For the summary: which files were changed and which commands were run.
          const file = event.tool_input?.file_path ? path.basename(String(event.tool_input.file_path)) : '';
          s.files ||= []; s.commands ||= [];
          if (toolKind(event.tool_name) === 'edit' && file && !s.files.includes(file)) s.files.push(file);
          if (toolKind(event.tool_name) === 'run' && event.tool_input?.command) s.commands.push(String(event.tool_input.command).slice(0, 80));
          // The code Claude is changing right now (shown as a small red/green diff in the island).
          const input = event.tool_input || {}, edit = Array.isArray(input.edits) ? input.edits[0] || {} : input;
          const cut = text => String(text || '').split('\n').map(l => l.replace(/\t/g, '  ').slice(0, 90)).filter((l, i, all) => l.trim() || (i > 0 && i < all.length - 1));
          if (toolKind(event.tool_name) === 'edit' && file) {
            const removed = cut(edit.old_string).slice(0, 3).map(text => ({ t: '-', text })), added = cut(edit.new_string ?? edit.content ?? input.content).slice(0, removed.length ? 3 : 6).map(text => ({ t: '+', text }));
            s.code = { file, lines: [...removed, ...added] };
          }
          if (toolKind(event.tool_name) === 'run' && input.command) s.run = { command: String(input.command).slice(0, 80), out: [] };
        }
        if (waiting.has(id)) break;
        s.state = 'running'; s.detail = toolLabel(event, who.short); s.question = ''; s.permission = null; break;
      case 'PostToolUse': case 'PostToolUseFailure': {
        start(); s.state = 'running'; s.question = ''; s.permission = null; s.ask = null; s.plan = null;
        const kind = toolKind(event.tool_name); if (kind) { s.stats ||= {}; s.stats[kind] = (s.stats[kind] || 0) + 1; }
        const step = (s.steps || []).find(x => x.state === 'running' && x.tool === String(event.tool_name || '')) || (s.steps || []).find(x => x.state === 'running');
        if (step) step.state = name === 'PostToolUseFailure' ? 'failed' : 'done';
        // What the terminal said (last lines), for the island.
        if (kind === 'run' && s.run) { const r = event.tool_response || {}, text = typeof r === 'string' ? r : [r.stdout, r.stderr, r.output].filter(Boolean).join('\n'); s.run.out = String(text).split('\n').map(l => l.trimEnd().slice(0, 90)).filter(Boolean).slice(-3); s.run.failed = name === 'PostToolUseFailure'; }
        break;
      }
      case 'PermissionRequest': {
        release(id); // an older open request for this session is stale
        const input = event.tool_input && typeof event.tool_input === 'object' ? event.tool_input : {};
        s.permissionInput = input; s.ask = null; s.plan = null;
        s.state = 'question'; s.detail = 'Needs permission';
        s.permission = { kind: 'tool', tool: toolLabel(event, who.short), what: toolDetail(event) };
        if (event.tool_name === 'AskUserQuestion' && Array.isArray(input.questions)) {
          s.ask = input.questions.slice(0, 4).map(q => ({ question: String(q?.question || ''), header: String(q?.header || '').slice(0, 20),
            multiSelect: Boolean(q?.multiSelect), options: (Array.isArray(q?.options) ? q.options : []).slice(0, 6)
              .map(o => ({ label: String(o?.label || ''), description: String(o?.description || '') })) }));
          s.permission = { kind: 'ask', tool: who.short + ' asks something', what: '' }; s.detail = 'Choose an answer';
        } else if (event.tool_name === 'ExitPlanMode') {
          s.plan = String(input.plan || '').slice(0, 20000);
          s.permission = { kind: 'plan', tool: 'Plan ready', what: '' }; s.detail = 'Plan ready: approve?';
        }
        s.question = s.ask ? s.ask.map(q => q.question).join('\n') : s.plan ? who.short + ' made a plan.' : s.permission.tool + (s.permission.what ? ':\n' + s.permission.what : '');
        if (agent === 'codex') { s.detail = 'Needs permission: answer in Codex'; s.permission = null; s.ask = null; s.plan = null; }
        if (res) {
          waiting.set(id, { res, timer: setTimeout(() => { release(id); onChange(); }, PERMISSION_WAIT_S * 1000) });
          res.on('close', () => { if (waiting.get(id)?.res === res) { waiting.delete(id); onChange(); } });
          held = true;
        }
        onFinish(s); break;
      }
      case 'Notification': {
        const kind = event.notification_type || '';
        if (QUESTION_NOTIFICATIONS.has(kind) && s.state !== 'question') {
          s.state = 'question'; s.detail = 'Waiting for you'; s.question = String(event.message || who.name + ' needs you.');
          onFinish(s);
        }
        break;
      }
      case 'Stop': {
        const question = questionFrom(String(event.last_assistant_message || ''));
        s.endedAt = now; s.state = question ? 'question' : 'done'; s.permission = null; s.ask = null; s.plan = null;
        for (const step of s.steps || []) if (step.state === 'running') step.state = 'done';
        s.lastMessage = tail(String(event.last_assistant_message || ''), 2000);
        s.detail = question ? 'Has a question for you' : 'Done'; s.question = question ? s.lastMessage : '';
        remember(s, question ? 'question' : 'done');
        onFinish(s); break;
      }
      case 'StopFailure':
        s.endedAt = now; s.state = 'error'; s.permission = null; s.question = '';
        s.detail = 'Error: ' + errorLabel(event.error_type || event.error); remember(s, 'error'); onFinish(s); break;
    }
    sessions.set(id, s); onChange();
    return held;
  }

  // ---- server ----
  function start() {
    if (server) return;
    if (ours().length && !installed()) { try { install(); } catch {} } // upgrade an older Kopi Island install
    const expected = Buffer.from(token());
    server = http.createServer((req, res) => {
      const given = Buffer.from(String(req.headers['x-kopi-token'] || ''));
      const route = String(req.url).split('?')[0];
      if (req.method !== 'POST' || ![ROUTE, STATUS_ROUTE, WAIT_ROUTE].includes(route) || given.length !== expected.length || !timingSafeEqual(given, expected)) {
        res.writeHead(403).end(); req.resume(); return;
      }
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
      req.on('end', () => {
        let held = false;
        try {
          const data = JSON.parse(body);
          if (route === WAIT_ROUTE) {
            const s = sessions.get(String(data.session_id || ''));
            if (s) learnPid(s, data.pid); // for "jump to terminal"
            holdReply(String(data.session_id || ''), res); held = true;
          }
          else if (route === STATUS_ROUTE) applyUsage(data);
          else held = apply(data, res, /[?&]agent=codex(&|$)/.test(String(req.url)) ? 'codex' : 'claude');
        } catch {}
        if (!held) res.writeHead(200).end(); // Empty body: Claude Code continues as normal.
      });
    });
    server.on('error', error => {
      listening = false; server = null;
      serverError = error.code === 'EADDRINUSE' ? 'Kopi Island is already running somewhere else (port ' + PORT + ' is taken). Close the other Kopi Island.' : error.message;
      onChange();
    });
    server.listen(PORT, '127.0.0.1', () => { listening = true; serverError = ''; onChange(); });
  }
  function stop() { for (const id of [...waiting.keys()]) release(id); for (const id of [...replies.keys()]) answer(id, ''); try { server?.close(); } catch {} server = null; listening = false; }

  // One entry for the island: the session that needs you most first.
  let codexCache = false;
  function view(agent = 'claude') {
    const who = AGENTS[agent] || AGENTS.claude;
    const list = [...sessions.values()].filter(s => (s.agent || 'claude') === agent).sort((a, b) => (RANK[b.state] - RANK[a.state]) || (b.updatedAt - a.updatedAt));
    const now = Date.now(), top = list[0];
    if (now - checkedAt > 5000) { hooksCache = installed(); codexCache = codexInstalled(); checkedAt = now; } // the files are read at most every 5 s
    const hooks = agent === 'codex' ? codexCache : hooksCache;
    const base = { provider: who.id, name: who.name, agent, kind: 'hooks', hooksInstalled: hooks, available: agent === 'codex' ? codexAvailable() : true,
      model: agent === 'codex' ? '' : getModel(), modelNow: top?.modelName || '', canReply: false, questionId: '', error: serverError,
      usage: { fiveHour: live(usage.fiveHour, now), sevenDay: live(usage.sevenDay, now), context: top?.context ?? null } };
    if (!hooks || !listening) return { ...base, connected: false, state: 'disconnected', detail: hooks ? 'Not active' : 'Not connected', question: '', elapsed: 0, list: [] };
    const item = s => ({ id: s.id, project: s.project || who.name, state: s.state, detail: s.detail,
      elapsed: s.startedAt ? Math.floor(((s.endedAt || now) - s.startedAt) / 1000) : 0 });
    if (!top) return { ...base, connected: true, state: 'ready', detail: 'Waiting for ' + who.name, question: '', elapsed: 0, list: [] };
    return { ...base, connected: true, state: top.state, detail: top.detail, question: top.question, elapsed: item(top).elapsed,
      sessionId: top.id, lastMessage: top.lastMessage || '', ask: waiting.has(top.id) ? top.ask || null : null,
      plan: waiting.has(top.id) ? top.plan || null : null, stats: top.stats || {}, steps: (top.steps || []).slice(-8), prompt: top.prompt || '', files: (top.files || []).slice(-8), commands: (top.commands || []).slice(-3), code: top.code || null, run: top.run || null, canJump: Boolean(top.pid), canReply: replies.has(top.id) && !waiting.has(top.id), permission: top.permission && waiting.has(top.id) ? top.permission : null,
      source: { process: who.name, title: top.project }, list: list.slice(0, 4).map(item) };
  }
  const pidOf = sessionId => sessions.get(sessionId)?.pid || null;
  // The window was closed: learn it again from the next hook.
  const forgetWindow = sessionId => { const s = sessions.get(sessionId); if (s) { s.windowPid = null; s.pid = null; } };
  // The folders your coding agents worked in (newest first), so Kopi knows where "my-shop" lives.
  function projects() {
    const seen = new Map();
    for (const s of [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt)) if (s.cwd && !seen.has(s.cwd)) seen.set(s.cwd, { name: path.basename(s.cwd), cwd: s.cwd, agent: s.agent || 'claude' });
    for (const h of history) if (h.cwd && !seen.has(h.cwd)) seen.set(h.cwd, { name: path.basename(h.cwd), cwd: h.cwd, agent: h.agent || 'claude' });
    return [...seen.values()];
  }
  return { projects, start, stop, install, uninstall, installed, installCodex, uninstallCodex, codexInstalled, codexAvailable, history: () => history.slice(), view, apply, applyUsage, decide, seen, reply, answerQuestions, decidePlan, pidOf, forgetWindow, getModel, setModel, PORT };
}

// Groups for "what Claude did" (read 3 · edited 2 · ran 1 ...).
function toolKind(tool) {
  if (tool === 'Read') return 'read';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'edit';
  if (/^(Bash|PowerShell|shell|exec_command|local_shell|unified_exec)$/i.test(tool)) return 'run';
  if (/^apply_patch$/i.test(tool)) return 'edit';
  if (/^(Grep|Glob)$/.test(tool)) return 'search';
  if (/^(WebSearch|WebFetch)$/.test(tool)) return 'web';
  if (/^(Agent|Task)$/.test(tool)) return 'agent';
  return '';
}
function toolLabel(event, who = 'Claude') {
  const tool = String(event.tool_name || '');
  const file = event.tool_input?.file_path ? path.basename(String(event.tool_input.file_path)) : '';
  if (tool === 'Read') return 'Reading ' + (file || 'a file');
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'Editing ' + (file || 'a file');
  if (/^(Bash|PowerShell)$/.test(tool)) return 'Running a command';
  if (/^(Grep|Glob)$/.test(tool)) return 'Searching the code';
  if (/^(WebSearch|WebFetch)$/.test(tool)) return 'Searching the web';
  if (/^(Agent|Task)$/.test(tool)) return 'Starting a helper';
  if (/^(shell|exec_command|local_shell|unified_exec)$/i.test(tool)) return 'Running a command';  // Codex
  if (/^apply_patch$/i.test(tool)) return 'Editing files';
  return tool ? 'Using ' + tool : who + ' is working';
}
// What exactly will happen, so you can judge before allowing.
function toolDetail(event) {
  const input = event.tool_input || {};
  const text = input.command || input.file_path || input.url || input.query || input.pattern || '';
  return String(text).slice(0, 300);
}
// After its reset time a usage window starts again at 0%.
const live = (w, now) => (w && w.resetsAt && w.resetsAt * 1000 <= now ? { used: 0, resetsAt: null } : w);
// The end of a long message, starting at a whole line where possible.
function tail(text, max) {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(-max), line = cut.indexOf('\n');
  return '…' + (line > 0 && line < max / 2 ? cut.slice(line + 1) : cut);
}
function errorLabel(type) {
  const labels = { rate_limit: 'limit reached', overloaded: 'Claude is overloaded', authentication_failed: 'not logged in',
    billing_error: 'betaalprobleem', server_error: 'serverfout', max_output_tokens: 'answer too long' };
  return labels[type] || String(type || 'unknown');
}

module.exports = { createHub, EVENTS, CODEX_EVENTS, PORT, HOOK_URL };
