'use strict';
// Does the last message of Claude Code (or Codex) ask you something? Then Rehatt nudges you: "has a question".
const clean = text => String(text || '').replace(/\r/g, '').trim();
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

module.exports = { questionFrom };
