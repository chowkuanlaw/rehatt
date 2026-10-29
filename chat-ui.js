'use strict';
// Kopi's chat in the island (like Coucou): drop Kopi on something on your screen and the island opens here,
// with what he looked at in a little pill on top ("● Chrome · What is an API?"). Ask, and ask on: the
// conversation stays until you start a new one. Without anything picked it is just a chat with Kopi.
// Kopi sits bottom left (drawn on the canvas behind this page), the questions are pills on the right,
// his answers plain text on the left. The answers come from the AI in Settings → AI (buddy-main.cjs).
(function robotChat() {
  const api = window.kopi;
  if (!api?.buddyAsk) return;
  const root = document.createElement('section'); root.id = 'kopi-chat'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#kopi-chat{position:absolute;z-index:60;display:none;color:#f2f2f4;font:12.5px/1.5 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto}
#kopi-chat *{box-sizing:border-box}
#kopi-chat .cr-top{position:absolute;left:92px;right:14px;top:10px;height:26px;display:flex;align-items:center;gap:8px}
#kopi-chat .cr-ctx{flex:0 1 auto;min-width:0;display:flex;align-items:center;gap:7px;padding:4px 11px;border-radius:999px;background:rgba(255,255,255,.08);font-size:11.5px;font-weight:600;color:#e8e8ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#kopi-chat .cr-ctx i{width:7px;height:7px;border-radius:50%;background:#5ee07a;box-shadow:0 0 6px #5ee07a;flex:none}
#kopi-chat .cr-ctx button{border:0;background:transparent;color:#9a9aa6;cursor:pointer;font-size:12px;padding:0 0 0 4px}
#kopi-chat .cr-ctx img{width:30px;height:19px;object-fit:cover;border-radius:5px;cursor:zoom-in;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.25)}
#kopi-chat .cr-ctx span{overflow:hidden;text-overflow:ellipsis}
#kopi-chat .cr-via{flex:none;font-size:10.5px;color:#8a8a96;border:0;background:transparent;padding:0;font-family:inherit}
#kopi-chat .cr-via.off{color:#ffb4a8;cursor:pointer;text-decoration:underline}
#kopi-chat .cr-pick{flex:none;display:flex;padding:2px;border-radius:999px;background:rgba(255,255,255,.07)}
#kopi-chat .cr-pick button{border:0;border-radius:999px;padding:3px 10px;background:transparent;color:#9a9aa6;font:600 11px "Segoe UI",sans-serif;cursor:pointer;display:flex;align-items:center;gap:5px}
#kopi-chat .cr-pick button i{width:7px;height:7px;border-radius:50%;background:var(--c)}
#kopi-chat .cr-pick button.on{background:rgba(255,255,255,.16);color:#fff}
#kopi-chat .cr-fix{display:inline-block;margin-top:6px;border:0;border-radius:999px;padding:5px 12px;background:#fff;color:#111;font:700 11.5px "Segoe UI",sans-serif;cursor:pointer}
#kopi-chat .cr-new{margin-left:auto;flex:none;border:0;border-radius:999px;padding:4px 11px;background:rgba(255,255,255,.08);color:#c9c9d2;font:600 11px "Segoe UI",sans-serif;cursor:pointer}
#kopi-chat .cr-new:hover{background:rgba(255,255,255,.14);color:#fff}
#kopi-chat .cr-msgs{position:absolute;left:92px;right:14px;top:44px;bottom:58px;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent}
#kopi-chat .cr-me{align-self:flex-end;max-width:80%;padding:6px 13px;border-radius:14px;background:rgba(255,255,255,.1);font-weight:600;font-size:13px}
#kopi-chat .cr-ai{align-self:flex-start;max-width:94%;font-size:13.5px;line-height:1.5;color:#ececf2;user-select:text}
#kopi-chat .cr-ai p{margin:0 0 7px}#kopi-chat .cr-ai p:last-child{margin-bottom:0}
#kopi-chat .cr-ai ul,#kopi-chat .cr-ai ol{margin:2px 0 7px;padding-left:18px}#kopi-chat .cr-ai li{margin:2px 0}
#kopi-chat .cr-ai code{font:11.5px "Cascadia Code",Consolas,monospace;background:rgba(255,255,255,.09);border-radius:5px;padding:1px 5px;color:#f1e7ff}
#kopi-chat .cr-ai pre{margin:4px 0 8px;padding:8px 11px;border-radius:9px;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);font:11.5px/1.5 "Cascadia Code",Consolas,monospace;color:#d9e7ff;white-space:pre-wrap;user-select:text}
#kopi-chat .cr-err{color:#ffb4a8}
#kopi-chat .cr-wait{align-self:flex-start;display:flex;gap:5px;padding:6px 2px}
#kopi-chat .cr-wait i{width:6px;height:6px;border-radius:50%;background:#ffb07a;animation:crb 1s infinite}
#kopi-chat .cr-wait i:nth-child(2){animation-delay:.15s}#kopi-chat .cr-wait i:nth-child(3){animation-delay:.3s}
@keyframes crb{0%,100%{opacity:.3;transform:none}50%{opacity:1;transform:translateY(-3px)}}
#kopi-chat .cr-fixes{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}
#kopi-chat .cr-fixes li{background:rgba(255,255,255,.06);border-radius:10px;padding:6px 9px;font-size:11.5px}
#kopi-chat .cr-fixes del{color:#ff8f8f}#kopi-chat .cr-fixes ins{color:#9be37a;text-decoration:none}
#kopi-chat .cr-fixes small{display:block;color:#8a8a96}
#kopi-chat .cr-act{margin-top:8px;border:0;border-radius:999px;padding:6px 13px;background:#d9f5b0;color:#173b06;font:700 11.5px "Segoe UI",sans-serif;cursor:pointer}
#kopi-chat .cr-chips{position:absolute;left:92px;right:14px;bottom:56px;display:flex;flex-wrap:wrap;gap:6px}
#kopi-chat .cr-chips button{border:0;border-radius:999px;padding:5px 11px;background:rgba(255,255,255,.08);color:#e8e8ef;font:600 11.5px "Segoe UI",sans-serif;cursor:pointer}
#kopi-chat .cr-chips button:hover{background:rgba(255,255,255,.15)}
#kopi-chat .cr-input{position:absolute;left:92px;right:14px;bottom:12px;height:36px;display:flex;align-items:center;border-radius:12px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
#kopi-chat .cr-input:focus-within{box-shadow:inset 0 0 0 1px rgba(255,176,122,.55)}
#kopi-chat .cr-input input{flex:1;min-width:0;height:100%;border:0;background:transparent;color:#fff;font:13px "Segoe UI",sans-serif;padding:0 14px;outline:none;user-select:text;caret-color:#ffc29a;caret-animation:manual}
#kopi-chat .cr-in.cr-me{animation:crme .32s cubic-bezier(.2,1.3,.4,1) both}#kopi-chat .cr-in.cr-ai{animation:crai .45s cubic-bezier(.2,.9,.3,1) both}
@keyframes crme{from{opacity:0;transform:translate(14px,6px) scale(.92)}to{opacity:1;transform:none}}@keyframes crai{from{opacity:0;transform:translateY(8px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
#kopi-chat .cr-done{display:inline-flex;align-items:center;gap:6px;margin-bottom:6px;padding:3px 10px 3px 8px;border-radius:999px;background:rgba(126,230,162,.14);color:#8ff0b0;font-size:11.5px;font-weight:700;animation:crpop .5s cubic-bezier(.3,1.6,.5,1) both}
@keyframes crpop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:none}}
#kopi-chat .cr-diff{margin:8px 0 2px;border-radius:10px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);background:rgba(0,0,0,.28)}
#kopi-chat .cr-file{padding:5px 10px;font-size:11px;font-weight:600;color:#c9c9d6;background:rgba(255,255,255,.05)}
#kopi-chat .cr-diff pre{margin:0;padding:4px 10px;font:11.5px/1.5 "Cascadia Code",Consolas,monospace;white-space:pre-wrap;user-select:text}
#kopi-chat .cr-diff .cr-del{background:rgba(255,92,92,.13);color:#ffb1aa}#kopi-chat .cr-diff .cr-add{background:rgba(126,230,162,.13);color:#a9f5c4}
#kopi-chat .cr-ask{margin-top:9px;font-weight:600}
#kopi-chat .cr-yn{display:flex;gap:6px;margin-top:2px}#kopi-chat .cr-yn .cr-act{margin-top:6px}
#kopi-chat .cr-no{margin-top:6px;border:0;border-radius:999px;padding:6px 13px;background:rgba(255,255,255,.09);color:#e8e8ef;font:600 11.5px "Segoe UI",sans-serif;cursor:pointer}
#kopi-chat .cr-wait span{margin-left:6px;font-size:11.5px;color:#ffb07a}
#kopi-chat .cr-chips button.cr-hot{background:linear-gradient(135deg,rgba(255,176,122,.28),rgba(126,230,162,.2));box-shadow:inset 0 0 0 1px rgba(255,176,122,.35)}
#kopi-chat .cr-input input::placeholder{color:#8a8a96}
#kopi-chat .cr-input button{width:26px;height:26px;margin-right:5px;border:0;border-radius:50%;background:#fff;color:#111;font:700 14px "Segoe UI",sans-serif;cursor:pointer;flex:none}
#kopi-chat .cr-input button:disabled{opacity:.4;cursor:default}
#kopi-chat .cr-shot{position:absolute;inset:40px 14px 12px 92px;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(10,10,18,.94);border-radius:14px;cursor:zoom-out}
#kopi-chat .cr-shot img{max-width:100%;max-height:calc(100% - 24px);border-radius:8px;box-shadow:0 0 0 1px rgba(255,255,255,.2)}
#kopi-chat .cr-shot small{color:#a9a9b6;font-size:11px}`;
  document.head.appendChild(style);

  const esc = s => String(s ?? '').replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
  function md(text) { // **bold**, `code`, ``` code blocks ```, "- " and "1." lists, paragraphs; everything else stays plain text
    const inline = s => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const lines = esc(text).split('\n'); let html = '', list = null, block = null, para = [];
    const flush = () => { if (para.length) { html += '<p>' + inline(para.join('<br>')) + '</p>'; para = []; } };
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const line of lines) {
      if (/^\s*```/.test(line)) { if (block) { html += `<pre>${block.join('\n')}</pre>`; block = null; } else { flush(); close(); block = []; } continue; }
      if (block) { block.push(line); continue; }
      const item = line.match(/^\s*(?:([-•*])|(\d+)[.)])\s+(.*)$/);
      if (item) { flush(); const kind = item[1] ? 'ul' : 'ol'; if (list !== kind) { close(); html += `<${kind}>`; list = kind; } html += '<li>' + inline(item[3]) + '</li>'; continue; }
      if (!line.trim()) { flush(); close(); continue; }
      close(); para.push(line);
    }
    if (block) html += `<pre>${block.join('\n')}</pre>`;
    flush(); close();
    return html;
  }

  // context: what Kopi looked at ({ app, title, word, picture }) or null; messages: { who: 'me' | 'ai', ... }
  let waitingFix = false, waitingType = '';
  let context = null, messages = [], waiting = false, visible = false, holdUntil = 0, zoom = false, readFrom = false, toEnd = false;
  // Which AI answers: the ones connected in Kopi Island → Connections (Claude Code → Claude, Codex → Codex).
  // { agents: [{ id, name }], current } — null until asked. Two connected: a little switch in the top bar.
  let aiState = null;
  const AI_DOT = { claudecode: '#d97757', codex: '#3b82f6' };
  const refreshAi = () => api.buddyAi?.().then(n => { if (JSON.stringify(n) !== JSON.stringify(aiState)) { aiState = n; render(); } }).catch(() => {});
  // English or Bahasa Melayu, like the rest of the island (Settings → Language)
  const WORDS = {
    ms: { chips: [['explain', '💡 Terangkan'], ['spelling', '✏️ Semak ejaan saya'], ['translate', '🌍 Terjemah'], ['summary', '📝 Ringkaskan']],
      seen: 'Ini yang Kopi nampak', part: 'Bahagian skrin ini', forget: 'Berhenti melihat ini', which: 'AI mana yang menjawab', gives: 'AI ini yang memberi jawapan',
      connect: 'Sambungkan Claude Code atau Codex', fresh: 'Sembang baharu', sent: 'Kopi nampak ini dan menghantarnya kepada AI · klik untuk tutup',
      login: 'Log masuk dengan ChatGPT', openCx: 'Buka Sambungan', clean: 'Tiada kesilapan. Kemas! 🎉', toWord: '✓ Masukkan ke Word (sebagai perubahan)',
      more: 'Teruskan…', about: 'Tanya tentang apa yang ada di sini…', any: 'Tanya saya apa sahaja…', label: 'Soalan anda untuk Kopi', send: 'Hantar',
      wrong: 'Ada yang tidak kena.', browser: 'Semak pelayar anda…', loggedIn: 'Berjaya! Tanya soalan anda sekali lagi. 🎉', noLogin: 'Log masuk tidak berjaya.', fixChip: '🛠️ Betulkan', fixMore: '🛠️ Betulkan untuk saya', fixed: p => `Dibetulkan dalam ${p}`, fixing: p => `Kopi sedang mencari pembetulan dalam ${p}…`, thinking: 'Sedang melihat…',
      mayI: f => `Boleh saya ubah ${f}?`, yes: '✓ Ya, betulkan', no: 'Tidak', saidYes: 'Ya, teruskan', saidNo: 'Tidak, biarkan', noChange: 'Baik, saya tidak ubah apa-apa.', typing: f => `Kopi sedang menaip dalam ${f}…`, line: n => `baris ${n}`,
      inWord: 'Sedang dalam Word…', applied: (a, t) => `${a} daripada ${t} pembetulan ada dalam Word sebagai perubahan. Klik Terima atau Tolak dalam Word.`, failed: 'Tidak berjaya.' },
    en: { chips: [['explain', '💡 Explain'], ['spelling', '✏️ Check my spelling'], ['translate', '🌍 Translate'], ['summary', '📝 Summarize']],
      seen: 'This is what Kopi saw', part: 'This part of the screen', forget: 'Stop looking at this', which: 'Which AI answers', gives: 'This AI gives the answers',
      connect: 'Connect Claude Code or Codex', fresh: 'New chat', sent: 'Kopi saw this and sent it to the AI · click to close',
      login: 'Sign in with ChatGPT', openCx: 'Open Connections', clean: 'No mistakes. Nice! 🎉', toWord: '✓ Put in Word (as changes)',
      more: 'Continue…', about: 'Ask about what is here…', any: 'Ask me anything…', label: 'Your question for Kopi', send: 'Send',
      wrong: 'Something went wrong.', browser: 'Check your browser…', loggedIn: 'Done! Ask your question again. 🎉', noLogin: 'Signing in did not work.', fixChip: '🛠️ Fix it', fixMore: '🛠️ Fix it for me', fixed: p => `Fixed in ${p}`, fixing: p => `Kopi is finding the fix in ${p}…`, thinking: 'Taking a look…',
      mayI: f => `May I change ${f}?`, yes: '✓ Yes, fix it', no: 'No', saidYes: 'Yes, go ahead', saidNo: 'No, leave it', noChange: 'Okay, I won\'t change anything.', typing: f => `Kopi is typing in ${f}…`, line: n => `line ${n}`,
      inWord: 'Working in Word…', applied: (a, t) => `${a} of the ${t} fixes are in Word, as changes. Click Accept or Reject in Word.`, failed: 'That did not work.' }
  };
  const L = () => WORDS[window.__kopiPrefs?.().lang === 'ms' ? 'ms' : 'en'];

  function render() {
    const keep = root.querySelector('input')?.value || '', focused = document.activeElement === root.querySelector('input'), wasTop = root.querySelector('.cr-msgs')?.scrollTop || 0;
    const photo = context?.picture ? `<img src="${esc(context.picture)}" data-do="zoom" alt="" title="${L().seen}">` : '';
    const pill = context ? `<div class="cr-ctx"><i></i>${photo}<span>${esc(context.app || L().part)}</span><button type="button" data-do="forget" title="${L().forget}">✕</button></div>` : '';
    const agents = aiState?.agents || [];
    const via = !aiState ? '' : agents.length > 1
      ? `<div class="cr-pick" title="${L().which}">${agents.map(a => `<button type="button" data-ai="${a.id}" class="${a.id === aiState.current ? 'on' : ''}" style="--c:${AI_DOT[a.id]}"><i></i>${esc(a.name)}</button>`).join('')}</div>`
      : agents.length ? `<span class="cr-via" title="${L().gives}">via ${esc(agents[0].name)}</span>`
      : `<button type="button" class="cr-via off" data-do="setup">${L().connect}</button>`;
    const ctx = `<div class="cr-top">${pill}${via}${messages.length ? `<button type="button" class="cr-new" data-do="new">${L().fresh}</button>` : ''}</div>`;
    const shot = zoom && context?.picture ? `<div class="cr-shot" data-do="zoom"><img src="${esc(context.picture)}" alt=""><small>${L().sent}</small></div>` : '';
    const lastAnswer = [...messages].reverse().find(m => m.who === 'ai' && !m.error);
    const msgs = messages.map(m => {
      const fresh = m.fresh ? ' cr-in' : ''; m.fresh = false;
      if (m.who === 'me') return `<div class="cr-me${fresh}">${esc(m.text)}</div>`;
      if (m.error) {
        const fix = m.fix === 'login' ? `<button type="button" class="cr-fix" data-do="login">${L().login}</button>`
          : m.fix === 'connect' ? `<button type="button" class="cr-fix" data-do="setup">${L().openCx}</button>` : '';
        return `<div class="cr-ai cr-err">${esc(m.error)}${fix ? '<br>' + fix : ''}</div>`;
      }
      let html = md(m.text || '');
      if (m.fixes) {
        html += m.fixes.length ? `<ul class="cr-fixes">${m.fixes.map(f => `<li>p. ${esc(f.page ?? '?')} · <del>${esc(f.find)}</del> → <ins>${esc(f.replace)}</ins>${f.why ? `<small>${esc(f.why)}</small>` : ''}</li>`).join('')}</ul>` : `<div>${L().clean}</div>`;
        if (m.fixes.length && !m.applied) html += `<button type="button" class="cr-act" data-do="apply">${L().toWord}</button>`;
        if (m.applied) html += `<div style="margin-top:6px;color:#9be37a">${esc(m.applied)}</div>`;
      }
      const diff = list => `<div class="cr-diff">${list.map(c => `<div class="cr-file">${esc(c.file)} · ${esc(L().line(c.line))}</div><pre class="cr-del">- ${esc(c.find)}</pre><pre class="cr-add">+ ${esc(c.replace)}</pre>`).join('')}</div>`;
      if (m.plan) {
        html += diff(m.plan.changes);
        if (!m.decided) html += `<div class="cr-ask">${esc(L().mayI([...new Set(m.plan.changes.map(c => c.file.split('/').pop()))].join(', ')))}</div><div class="cr-yn"><button type="button" class="cr-act" data-do="fix-yes">${L().yes}</button><button type="button" class="cr-no" data-do="fix-no">${L().no}</button></div>`;
      }
      if (m.fixed) html = `<div class="cr-done">✓ ${esc(L().fixed(m.project || ''))}</div>` + html + (m.changes?.length ? diff(m.changes) : '');
      if (m === lastAnswer && context?.project && !m.fixed && !m.fixes && !m.plan && !waiting) html += `<button type="button" class="cr-act" data-kind="fix">${L().fixMore}</button>`;
      return `<div class="cr-ai${fresh}">${html}</div>`;
    }).join('') + (waiting ? `<div class="cr-wait"><i></i><i></i><i></i><span>${esc(waitingType ? L().typing(waitingType) : waitingFix ? L().fixing(context?.project || '') : L().thinking)}</span></div>` : '');
    const chipList = context?.project ? [L().chips[0], ['fix', L().fixChip], ...L().chips.slice(1, 3)] : L().chips;
    const chips = !messages.length && !waiting ? `<div class="cr-chips">${chipList.map(([k, label]) => `<button type="button" data-kind="${k}" class="${k === 'fix' ? 'cr-hot' : ''}">${label}</button>`).join('')}</div>` : '';
    const placeholder = messages.length ? L().more : context ? L().about : L().any;
    root.innerHTML = `${ctx}${shot}<div class="cr-msgs">${msgs}</div>${chips}
      <div class="cr-input"><input type="text" maxlength="2000" placeholder="${placeholder}" aria-label="${L().label}"><button type="button" data-do="send" ${waiting ? 'disabled' : ''} aria-label="${L().send}">↑</button></div>`;
    const input = root.querySelector('input'); input.value = keep; if (focused) input.focus();
    // a new answer: show it from its start (with your question above it), not its end
    const list = root.querySelector('.cr-msgs'), mine = [...list.querySelectorAll('.cr-me')].pop();
    if (toEnd) list.scrollTop = list.scrollHeight; // a proposal: straight to "may I change…?" and its buttons
    else if (readFrom && mine) list.scrollTop = Math.max(0, mine.offsetTop - 4); else list.scrollTop = waiting ? list.scrollHeight : wasTop;
    readFrom = false; toEnd = false;
  }

  async function ask(kind, text) {
    if (waiting) return;
    const label = text || (kind === 'fix' ? L().fixChip : L().chips.find(([k]) => k === kind)?.[1])?.replace(/^\S+\s/, '') || '';
    const history = messages.filter(m => !m.error).map(m => ({ who: m.who, text: String(m.text || '').slice(0, 2000) })).slice(-8);
    messages.push({ who: 'me', text: label, fresh: true }); waiting = true; waitingFix = kind === 'fix'; render();
    window.__kopiChime?.('send');
    window.__kopiFeel?.('focus', 60000);
    let r;
    try { r = await api.buddyAsk(kind, text, history, window.__kopiPrefs?.().lang === 'ms' ? 'ms' : 'en'); } catch (e) { r = { ok: false, error: String(e?.message || e) }; }
    waiting = false; readFrom = true; holdUntil = performance.now() + 10000; shineUntil = performance.now() + 4000; // stay open a moment so you see the answer
    if (r?.ok && r.plan) { toEnd = true; holdUntil = performance.now() + 30000; } // waiting for your yes
    messages.push(r?.ok ? { who: 'ai', text: r.answer || '', fixes: r.word ? r.fixes || [] : null, fixed: !!r.fixed, project: r.project || '', plan: r.plan || null, fresh: true } : { who: 'ai', error: r?.error || L().wrong, fix: r?.fix || '', fresh: true });
    waitingFix = false;
    if (r?.ok && r.fixed) { window.__kopiCelebrate?.('fix', 70); window.__kopiFeel?.('heart', 2600); } // a fix landed: fanfare, confetti, a jump
    else { window.__kopiChime?.(r?.ok ? 'reply' : 'error'); window.__kopiFeel?.(r?.ok ? 'heart' : 'sad', 1800); }
    render();
  }

  root.addEventListener('click', async e => {
    if (e.target.closest('[data-do="zoom"]')) { zoom = !zoom; render(); return; }
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.kind) return ask(b.dataset.kind, '');
    const act = b.dataset.do, input = root.querySelector('input');
    if (act === 'send') { const text = input.value.trim(); if (text) { input.value = ''; ask('free', text); } }
    if (act === 'new') { messages = []; render(); input?.focus(); }
    if (act === 'forget') { context = null; zoom = false; api.buddyForget?.(); render(); }
    if (act === 'setup') api.settingsOpen?.('connect');
    if (b.dataset.ai) { aiState = await api.buddyUseAi?.(b.dataset.ai) || aiState; render(); }
    if (act === 'login') {
      b.disabled = true; b.textContent = L().browser;
      const r = await api.buddyLogin?.();
      messages.push(r?.ok ? { who: 'ai', text: L().loggedIn } : { who: 'ai', error: r?.error || L().noLogin });
      render();
    }
    if (act === 'fix-yes' || act === 'fix-no') {
      const m = [...messages].reverse().find(x => x.plan && !x.decided); if (!m || waiting) return;
      m.decided = true;
      if (act === 'fix-no') { api.buddyCancelFix?.(); messages.push({ who: 'me', text: L().saidNo, fresh: true }, { who: 'ai', text: L().noChange, fresh: true }); window.__kopiChime?.('reply'); render(); return; }
      messages.push({ who: 'me', text: L().saidYes, fresh: true }); waiting = true; waitingType = m.plan.changes[0]?.file.split('/').pop() || ''; render();
      window.__kopiChime?.('send'); window.__kopiFeel?.('focus', 60000);
      let r; try { r = await api.buddyApplyFix(); } catch (err) { r = { ok: false, error: String(err?.message || err) }; }
      waiting = false; waitingType = ''; readFrom = true; holdUntil = performance.now() + 12000; shineUntil = performance.now() + 4000;
      messages.push(r?.ok ? { who: 'ai', text: r.answer || '', fixed: true, project: r.project || '', changes: r.changes || [], fresh: true } : { who: 'ai', error: r?.error || L().wrong, fresh: true });
      if (r?.ok) { window.__kopiCelebrate?.('fix', 70); window.__kopiFeel?.('heart', 2600); } else { window.__kopiChime?.('error'); window.__kopiFeel?.('sad', 1800); }
      render(); return;
    }
    if (act === 'apply') {
      b.disabled = true; b.textContent = L().inWord;
      const r = await api.buddyApply();
      const m = [...messages].reverse().find(x => x.fixes);
      if (m) m.applied = r?.ok ? L().applied(r.applied, r.total) : r?.error || L().failed;
      render();
    }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const text = e.target.value.trim(); if (text) { e.target.value = ''; ask('free', text); } }
  });
  // typing keeps the island open and clickable (like the other pages with a text field)
  root.addEventListener('focusin', () => { projectInputFocused = true; sendInteractive(true); });
  root.addEventListener('focusout', () => { setTimeout(() => { projectInputFocused = root.contains(document.activeElement); }, 0); });

  // Kopi dropped on something: the island opens here with what he saw (buddy-main.cjs).
  api.onBuddyChat?.(ctx => {
    context = ctx && ctx.app !== undefined ? ctx : null; messages = []; waiting = false; zoom = false; holdUntil = performance.now() + 15000;
    if (ctx?.ai && typeof ctx.ai === 'object') aiState = ctx.ai;
    setView('chat'); setMode('expanded'); render();
    setTimeout(() => root.querySelector('input')?.focus(), 350);
  });

  // ---- Kopi's stage: the whole island under the header is his (no card inside the island) ----
  // Shared with the Claude Code page (ai-monitor-ui.js): purple for the chat, orange for Claude, violet for Codex.
  // ---- Kopi's stage: the whole island under the header is his ----
  // No box: a soft glow that runs from the black island into warm orange (Claude) or violet (Codex).
  // Shared with the Claude Code page (ai-monitor-ui.js). [r, g, b] of the glow and of the light.
  const STAGES = { claude: [[196, 92, 40], [255, 178, 120]], codex: [[44, 120, 236], [130, 190, 255]] };
  function stageRect(area) { const x = islandBounds.x + 8, y = area.y - 6; return { x, y, width: islandBounds.width - 16, height: Math.max(80, islandBounds.height - y - 8) }; }
  window.__kopiStageRect = stageRect;
  // Places a DOM page on the stage (the page helper adds its own margin, so take that off again).
  window.__kopiPlaceOnStage = (el, area) => { const r = stageRect(area), m = window.__kopiPage.contentX; window.__kopiPage.place(el, { x: r.x - m, y: r.y, width: r.width + m * 2, height: r.height }); };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  // The glow takes the colour of what happens (busy, done, error: your own traffic-light colours), and glides there softly.
  const hexRgb = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  let glowNow = null, glowAt = 0;
  window.__kopiKopiStage = (area, kind = 'claude', thinking = false, tint = null) => {
    const r = stageRect(area), base = STAGES[kind] || STAGES.claude, t = performance.now() / 1000;
    const want = hexRgb(tint) || base[0], dt = Math.min(0.1, t - glowAt || 0.016); glowAt = t;
    glowNow = glowNow ? glowNow.map((v, i) => v + (want[i] - v) * Math.min(1, dt * 3)) : want.slice(); // about a third of a second to change colour
    const glow = glowNow.map(Math.round), lightC = glow.map(v => Math.min(255, Math.round(v + (255 - v) * 0.45)));
    const ib = islandBounds, top = area.y - 8; // just under the line below the buttons
    ctx.save(); ctx.beginPath(); ctx.roundRect(ib.x, 0, ib.width, ib.height, [0, 0, UI.EXPANDED_RADIUS, UI.EXPANDED_RADIUS]); ctx.clip(); // only inside the island
    // orange at the bottom, fading softly into black towards the left, the right and the top (a wide oval glow, no edges)
    const h = ib.height - top, cx = ib.x + ib.width / 2, cy = ib.height + 20, stretch = ib.width / (h * 2.1);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(stretch, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h * 1.25);
    g.addColorStop(0, rgba(glow, 0.85)); g.addColorStop(0.35, rgba(glow, 0.55)); g.addColorStop(0.65, rgba(glow, 0.2)); g.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = g; ctx.fillRect(-ib.width / stretch, -h * 1.4, ib.width * 2 / stretch, h * 1.6);
    ctx.restore();
    // a slow, soft light drifting through it (alive, never busy)
    const lx = ib.x + ib.width * (0.68 + 0.16 * Math.sin(t / 3)), ly = ib.height * 0.7, light = ctx.createRadialGradient(lx, ly, 0, lx, ly, ib.width * 0.32);
    light.addColorStop(0, rgba(lightC, 0.1)); light.addColorStop(1, rgba(lightC, 0));
    ctx.fillStyle = light; ctx.fillRect(ib.x, top, ib.width, ib.height - top);
    ctx.restore();
    const rx = r.x + 54, ry = r.y + r.height - 52;
    drawGhost(rx, ry, 62);
    hit.ghost = { x: rx - 36, y: ry - 34, width: 72, height: 64 };
    if (thinking) { // a little thinking badge on his head
      const bx = rx - 26, by = ry - 28, pulse = 1 + 0.08 * Math.sin(t * 6), c = rgba(lightC, 1);
      ctx.save(); ctx.beginPath(); ctx.arc(bx, by, 8.5 * pulse, 0, Math.PI * 2); ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.fill(); ctx.restore();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(bx - 3.5 + i * 3.5, by + Math.sin(t * 8 + i) * 0.8, 1.15, 0, Math.PI * 2); ctx.fillStyle = '#2a1408'; ctx.fill(); }
    }
  };
  // The chat talks to Claude (or Codex): it gets that AI's colour too.
  // busy = your busy colour, an error stays in your error colour, a fresh answer glows in your done colour for a moment
  let shineUntil = 0;
  window.__kopiChatShine = () => { shineUntil = performance.now() + 4000; };
  window.__kopiDrawChat = area => {
    const last = messages[messages.length - 1], colour = s => window.__kopiStateColour?.(s) || null;
    const tint = waiting ? colour('running') : last?.who === 'ai' && last.error ? colour('error') : last?.who === 'ai' && performance.now() < shineUntil ? colour('done') : null;
    window.__kopiKopiStage(area, aiState?.current === 'codex' ? 'codex' : 'claude', waiting, tint);
  };

  function loop() {
    const show = currentView === 'chat' && mode === 'expanded';
    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;
    if (show) {
      window.__kopiPlaceOnStage(root, contentRect()); // the whole block is Kopi's
      if (waiting || performance.now() < holdUntil) leaveStartedAt = null; // the island does not fold away mid-conversation
      if (!visible) { render(); refreshAi(); }
    } else if (visible && root.contains(document.activeElement)) { document.activeElement.blur(); projectInputFocused = false; }
    visible = show;
    requestAnimationFrame(loop);
  }
  render();
  requestAnimationFrame(loop);
})();
