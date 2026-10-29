'use strict';
// The island director: ONE place that decides what the island shows, how big it is and where a click or a
// hover takes you. Everything else (Claude Code, Stretch, water, Focus, Usage) only reports what is going on.
// The rules are the ones agreed in the Rehatt Flow Review (R1–R8, W1–W13):
//   - hover opens the island (as before); pressing the mouse button cancels that, so press-and-move drags
//   - it opens to what the nudge is about; with nothing showing, to the page you used in the last 2 minutes
//   - one thing at a time, highest first: a stretch you are doing, its cheer, an AI question, short news
//     (Claude done or an error, usage alerts, snoozed, a glass counted, welcome back), a stretch that is due,
//     water, the Focus timer
//   - a nudge carries up to two quick buttons (To terminal, Start/Later, Drank/Later, Done)
//   - while the island is open, news comes as a slim banner at the top; the page never changes under you
//   - the Stretch page stays open while you stretch, and folds by itself once you are done, snoozed or skipped
(function director() {
  const api = window.kopi;
  if (!api) return;
  const MS = () => window.__kopiPrefs?.().lang === 'ms', T = (ms, en) => (MS() ? ms : en);
  const LOC = () => (MS() ? 'ms-MY' : 'en-GB');
  const clockAt = ts => new Date(ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const short = (s, n = 40) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const TONE = { q: '#ff9a1f', done: '#39d36b', err: '#ff5c5c', st: '#ff8fb1', wa: '#7fc8ff', us: '#d9a066', fo: '#ffb35c', k: '#f2f5ed' };
  const FONT = '700 11.5px "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif';
  const BTN_FONT = '700 10.5px "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif';
  const DUE_FOLD = 3 * 60e3; // a stretch nobody answered folds to a pink dot on Kopi after 3 minutes
  const REMEMBER = 120e3; // reopening within 2 minutes goes back to the page you were on
  const QUESTION_REMIND = 5 * 60e3;

  // ---------- what is going on ----------
  const providers = () => window.__kopiMonitor?.state()?.providers || [];
  const who = p => (p?.provider === 'codex' ? 'Codex' : 'Claude');
  const S = () => window.__rehattStretch?.state() || null;
  const stName = () => { const s = S(); return window.__rehattStretch?.name?.(s?.cur || s?.upNext) || ''; };
  const dueFolded = s => s?.mode === 'due' && s.dueAt && Date.now() - s.dueAt > DUE_FOLD;
  function questions() {
    const out = [];
    for (const p of providers()) {
      if (!p.connected) continue;
      const n = (p.list || []).filter(x => x.state === 'question').length || (p.state === 'question' ? 1 : 0);
      if (n) out.push({ p, n });
    }
    return out;
  }

  // ---------- short news: shown once, for a few seconds, when nothing more important is on ----------
  const queue = []; let flashNow = null;
  function flash(item) {
    if (!item?.text) return;
    if (flashNow?.key === item.key || queue.some(x => x.key === item.key)) return;
    queue.push({ kind: 'flash', ms: 4000, tone: 'k', ...item });
    if (queue.length > 6) queue.shift();
  }
  function currentFlash(t) {
    if (flashNow && t < flashNow.until) return flashNow;
    flashNow = null;
    const next = queue.shift();
    if (next) flashNow = { ...next, until: t + next.ms };
    return flashNow;
  }

  // ---------- the one ladder ----------
  // Returns what the island should show now, or null (Kopi alone). `forBanner`: the open island asks.
  function pick(forBanner = false) {
    const t = performance.now(), s = S();
    if (!forBanner) {
      if (window.__kopiHelloBusy?.()) return { kind: 'msg', key: 'hello' };
      const message = window.__kopiCompactMessage?.();
      if (message && message.trim()) return { kind: 'msg', key: 'msg' }; // volume, battery, poke: drawn by the old code
    }
    if (s?.on && s.mode === 'active') {
      const sides = window.__rehattStretch?.current?.()?.sides && s.switched ? T(' · tukar sisi', ' · switch sides') : '';
      return { kind: 'stretchActive', key: 'st-active:' + s.cur, tone: 'st', view: 'stretch', text: stName() + sides,
        right: mmss(s.activeEnd - Date.now()), ring: Math.min(1, Math.max(0, 1 - (s.activeEnd - Date.now()) / ((s.activeSecs || 1) * 1000))),
        buttons: [{ label: T('Siap', 'Done'), act: () => stretch('done') }] };
    }
    if (s?.on && s.mode === 'done')
      return { kind: 'cheer', key: 'st-done', tone: 'done', view: 'stretch', kuih: 'cheer',
        text: T(`Syabas! ${s.today.total}/${s.goal} hari ini · seterusnya ${clockAt(s.nextDue)}`, `Nice! ${s.today.total}/${s.goal} today · next ${clockAt(s.nextDue)}`) };
    const qs = questions();
    if (qs.length) {
      const total = qs.reduce((n, q) => n + q.n, 0), p = qs[0].p;
      return { kind: 'question', key: 'q:' + total + ':' + p.provider, tone: 'q', view: 'monitor', provider: p.provider,
        text: total > 1 ? T(`${total} soalan menunggu anda`, `${total} questions waiting for you`) : T(`${who(p)} ada soalan untuk anda`, `${who(p)} has a question for you`),
        buttons: p.canJump ? [{ label: T('Ke terminal', 'To terminal'), act: () => api.aiMonitorHooksJump?.(p.sessionId).catch?.(() => {}) }] : [] };
    }
    if (s?.on && s.mode === 'snoozed')
      return { kind: 'note', key: 'st-snoozed', tone: 'k', view: 'stretch', kuih: 'idle', text: T(`Ditunda · kembali ${clockAt(s.nextDue)}`, `Snoozed · back at ${clockAt(s.nextDue)}`) };
    if (s?.water === 'done')
      return { kind: 'note', key: 'wa-done', tone: 'wa', view: 'stretch', kuih: 'drink', text: T(`${s.today.water}/${s.waterGoal} gelas air hari ini`, `${s.today.water}/${s.waterGoal} glasses of water today`) };
    if (s?.backMins)
      return { kind: 'note', key: 'back', tone: 'done', view: 'stretch', kuih: 'cheer', text: T(`Selamat kembali · ${s.backMins} min rehat dikira`, `Welcome back · ${s.backMins} min break counted`) };
    const f = currentFlash(t);
    if (f) return f;
    if (s?.on && s.mode === 'due' && !dueFolded(s)) {
      const name = stName();
      const text = s.reason === 'ai' ? T(`AI anda bekerja · ${name}?`, `Your AI is working · ${name}?`)
        : s.reason === 'focus' ? T(`Fokus siap · ${name}?`, `Focus done · ${name}?`)
        : T(`Masa untuk regangan · ${name}`, `Time to stretch · ${name}`);
      return { kind: 'stretchDue', key: 'st-due:' + s.cur + ':' + s.reason, tone: 'st', view: 'stretch', kuih: 'wave', text,
        buttons: [{ label: T('Mula', 'Start'), act: () => { stretch('start'); open('stretch'); } }, { label: T('Nanti', 'Later'), act: () => stretch('snooze') }] };
    }
    if (s?.water === 'ask')
      return { kind: 'water', key: 'wa-ask', tone: 'wa', view: 'stretch', kuih: 'glass', text: T('Minum segelas air?', 'A glass of water?'),
        buttons: [{ label: T('Sudah', 'Drank'), act: () => stretch('water') }, { label: T('Nanti', 'Later'), act: () => stretch('waterLater') }] };
    const focus = window.__kopiFocus;
    if (focus?.active())
      return { kind: 'focus', key: 'focus', tone: 'fo', view: 'focus', text: T('Fokus', 'Focus'), right: focus.label(), ring: 1 - focus.left() / (focus.length() || 1) };
    return null;
  }
  const stretch = (action, value) => (window.__rehattStretch?.act ? window.__rehattStretch.act(action, value) : api.stretchAction?.(action, value));

  // ---------- going somewhere ----------
  let explicit = false, lastView = null, lastAt = -Infinity;
  function open(view, provider) {
    if (view === 'monitor') { window.__kopiMonitor?.open(provider || 'claudecode', Boolean(provider)); return; }
    setView(view); setMode('expanded');
  }
  // Where a hover or a click on the small island opens to.
  function destination() {
    const item = current && current.kind !== 'msg' ? current : null;
    if (item?.view) return { view: item.view, provider: item.provider };
    if (lastView && performance.now() - lastAt < REMEMBER) return { view: lastView };
    return { view: 'home' };
  }
  const baseSetView = setView;
  setView = function (...args) { explicit = true; try { return baseSetView.apply(this, args); } finally { explicit = false; } };
  const baseSetMode = setMode;
  setMode = function (next, playSound) {
    if (next === 'expanded' && mode !== 'expanded' && !explicit && currentView === 'home' && introFinished) {
      const d = destination();
      if (d.view === 'monitor') { open('monitor', d.provider); return; }
      if (d.view && d.view !== 'home' && d.view !== 'settings') currentView = d.view;
    }
    return baseSetMode(next, playSound);
  };
  // Folding: remember the page, and stay folded until the mouse has left (else hover opens it right away)
  function fold() { collapseIdle(); window.__kopiHoldClosed?.(); }

  // ---------- size: the small island grows to fit its nudge ----------
  let current = null, wantWidth = null, lastKey = '';
  function measure(item) {
    if (!item || item.kind === 'msg') return null;
    ctx.save();
    ctx.font = FONT;
    let w = 12 + 24 + 12 + Math.min(260, ctx.measureText(item.text || '').width) + 52 + 6;
    if (item.right) w += ctx.measureText('00:00').width + 10;
    ctx.font = BTN_FONT;
    for (const b of item.buttons || []) w += ctx.measureText(b.label).width + 20 + 5;
    ctx.restore();
    return Math.ceil(Math.max(240, Math.min(480, w + 14)) / 4) * 4; // a little slack: text never gets cut short
  }
  const baseTarget = modeTarget;
  modeTarget = function (m) { const t = baseTarget(m); if (m === 'compact' && wantWidth) t.width = wantWidth; return t; };
  // ai-monitor-ui.js keeps the island medium while this says so
  window.__kopiStretchNudge = () => Boolean(current && current.kind !== 'msg');

  // ---------- the small island ----------
  const buttons = new Map();
  const baseDrawSmall = drawSmall;
  drawSmall = function () {
    buttons.clear();
    if (mode !== 'compact') {
      baseDrawSmall();
      // the pill: a dot on Kopi for what waits quietly (a stretch you let pass, a nearly empty glass)
      const s = S(), dot = dueFolded(s) ? TONE.st : window.__rehattMeterLow?.() ? TONE.us : null;
      if (dot && mode === 'rest') {
        const cx = islandBounds.x + islandBounds.width / 2 + 10;
        ctx.save(); ctx.beginPath(); ctx.arc(cx, 6, 3.2, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.shadowColor = dot; ctx.shadowBlur = 6; ctx.fill(); ctx.restore();
      }
      return;
    }
    const item = pick();
    if (!item || item.kind === 'msg') { baseDrawSmall(); return; }
    const H = islandBounds.height, cy = H / 2, left = islandBounds.x + 12, right = islandBounds.x + islandBounds.width;
    const cover = Math.max(16, H - 12), tone = TONE[item.tone] || TONE.k;
    drawGhost(right - 26, cy + 3, Math.min(22, H - 12));
    hit.ghost = { x: right - 48, y: 0, width: 44, height: H };
    // left: a ring (stretch, focus), the kuih, or a glowing dot
    const cx = left + cover / 2;
    if (item.ring != null) {
      const r = cover / 2 - 2;
      ctx.save(); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * item.ring); ctx.strokeStyle = tone; ctx.stroke(); ctx.restore();
    } else if (item.kuih && window.__rehattKuih) {
      window.__rehattKuih(item.kuih, cx, cy + cover / 2 + 2, cover + 4);
    } else {
      ctx.save(); ctx.globalAlpha = item.kind === 'question' ? 0.75 + 0.25 * Math.sin(performance.now() / 180) : 1;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = tone; ctx.shadowColor = tone; ctx.shadowBlur = 10; ctx.fill(); ctx.restore();
    }
    // right: the quick buttons, just left of Kopi
    let x = right - 52;
    const list = item.buttons || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      ctx.save(); ctx.font = BTN_FONT;
      const w = Math.ceil(ctx.measureText(b.label).width) + 20, h = 22, bx = x - w, by = cy - h / 2;
      const key = 'nudgeBtn' + i, r = { x: bx, y: by, width: w, height: h }, over = pointer.known && inside(pointer.x, pointer.y, r);
      ctx.beginPath(); ctx.roundRect(bx, by, w, h, h / 2);
      ctx.fillStyle = i === 0 ? (over ? '#ffffff' : tone) : over ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,.14)';
      ctx.fill(); ctx.restore();
      text(b.label, bx + w / 2, cy + 4, 10.5, i === 0 ? '#16110f' : '#f2f5ed', 700, 'center');
      hit[key] = r; buttons.set(key, { act: b.act, rect: r });
      x = bx - 5;
    }
    if (item.right) { text(item.right, x - 2, cy + 4, 11.5, tone, 700, 'right'); x -= ctx.measureText(item.right).width + 10; }
    const mid0 = left + cover + 12;
    text(item.text, mid0, cy + 4, 11.5, '#f2f5ed', 700, 'left', Math.max(30, x - mid0 - 6));
  };
  // a quick button does its job; anywhere else on the nudge opens its page (mascot.html → setMode → destination)
  canvas.addEventListener('click', e => {
    if (mode === 'expanded') return;
    for (const [, { act, rect }] of buttons) {
      if (!inside(e.clientX, e.clientY, rect)) continue;
      e.preventDefault(); e.stopImmediatePropagation();
      sound('click'); window.__kopiHoldClosed?.(); // stays small until the mouse leaves: no surprise opening
      try { act(); } catch {}
      return;
    }
  }, true);

  // ---------- hover: as before, but never while the button is down (that is a drag) or over a quick button ----------
  let pressed = false;
  window.addEventListener('pointerdown', e => { if (e.button === 0) pressed = true; }, true);
  window.addEventListener('pointerup', () => { pressed = false; }, true);
  window.addEventListener('blur', () => { pressed = false; });
  // (the rects are kept from the last drawing: `hit` is emptied at the start of every frame, before the hover check)
  const overButton = () => pointer.known && [...buttons.values()].some(b => inside(pointer.x, pointer.y, b.rect));
  const baseHover = updateHover;
  updateHover = function (t) {
    if (!introFinished) return baseHover(t);
    // while you stretch, the Stretch page stays open (Esc folds it to the countdown)
    if (mode === 'expanded' && currentView === 'stretch' && S()?.mode === 'active') { leaveStartedAt = null; return; }
    if (mode === 'compact' && (pressed || window.__rehattDragging || overButton())) { hoverStartedAt = null; return; }
    // the mouse left the nudge: forget the hover, or coming back later would open the island at once
    if (mode === 'compact' && !(pointer.known && inside(pointer.x, pointer.y, islandBounds))) hoverStartedAt = null;
    return baseHover(t);
  };

  // ---------- the banner on the open island ----------
  const banner = document.createElement('button');
  banner.type = 'button'; banner.id = 'rehatt-banner'; banner.hidden = true;
  document.body.appendChild(banner);
  const style = document.createElement('style');
  style.textContent = `#rehatt-banner{position:absolute;z-index:80;top:6px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:330px;height:24px;padding:0 12px 0 10px;border-radius:999px;border:0;background:rgba(255,255,255,.1);color:#f2f5ed;font:700 11px "Segoe UI Variable Text","Segoe UI",sans-serif;cursor:pointer;white-space:nowrap;animation:rb-in .25s ease-out}
#rehatt-banner[hidden]{display:none}
#rehatt-banner:hover{background:rgba(255,255,255,.18)}
#rehatt-banner i{width:7px;height:7px;border-radius:50%;flex:none}
#rehatt-banner span{overflow:hidden;text-overflow:ellipsis}
#rehatt-banner em{font-style:normal;color:#9aa596;flex:none}
@keyframes rb-in{from{opacity:0;transform:translate(-50%,-4px)}to{opacity:1;transform:translate(-50%,0)}}`;
  document.head.appendChild(style);
  let bannerItem = null, bannerKey = '';
  function showBanner() {
    const item = mode === 'expanded' && visual.width > 600 ? pick(true) : null;
    const show = item && item.view && item.view !== currentView && !['focus'].includes(item.kind) && !(item.view === 'monitor' && currentView === 'monitor');
    bannerItem = show ? item : null;
    if (!show) { if (!banner.hidden) banner.hidden = true; bannerKey = ''; return; }
    const key = item.key + '|' + item.text + '|' + MS();
    if (key !== bannerKey) {
      bannerKey = key;
      banner.innerHTML = `<i style="background:${TONE[item.tone] || TONE.k};box-shadow:0 0 6px ${TONE[item.tone] || TONE.k}"></i><span></span><em>${T('Buka', 'Open')} ›</em>`;
      banner.querySelector('span').textContent = item.text + (item.right ? ' · ' + item.right : '');
    }
    banner.style.left = `${islandBounds.x + islandBounds.width / 2}px`;
    if (banner.hidden) banner.hidden = false;
  }
  banner.addEventListener('click', () => { if (!bannerItem) return; sound('click'); open(bannerItem.view, bannerItem.provider); });

  // ---------- news from your AI: done, an error, a question that waits too long ----------
  const was = {}; let questionSince = 0, reminded = false;
  setInterval(() => {
    for (const p of providers()) {
      const before = was[p.provider]; was[p.provider] = p.state;
      if (before === undefined || before === p.state) continue;
      if (p.state === 'done')
        flash({ key: 'done:' + p.provider + ':' + (p.sessionId || ''), tone: 'done', ms: 4000, view: 'monitor', provider: p.provider,
          text: T(`${who(p)} sudah siap`, `${who(p)} is done`) + (p.prompt ? ' · ' + short(p.prompt, 34) : '') });
      if (p.state === 'error')
        flash({ key: 'err:' + p.provider + ':' + (p.sessionId || ''), tone: 'err', ms: 8000, view: 'monitor', provider: p.provider,
          text: T(`${who(p)}: ralat`, `${who(p)}: error`) + (p.detail ? ' · ' + short(p.detail, 34) : '') });
    }
    if (questions().length) {
      if (!questionSince) { questionSince = Date.now(); reminded = false; }
      else if (!reminded && Date.now() - questionSince > QUESTION_REMIND) { reminded = true; window.__kopiChime?.('question'); }
    } else questionSince = 0;
  }, 300);

  // ---------- the Focus timer tells the stretch timer (stretches and water wait for it) ----------
  let focusUntil = 0, focusLeft = 0;
  setInterval(() => {
    const f = window.__kopiFocus; if (!f) return;
    const until = f.active() ? Date.now() + f.left() : 0;
    if (until && Math.abs(until - focusUntil) > 3000) { focusUntil = until; stretch('focus', { until }); }
    else if (!until && focusUntil) {
      const ended = focusLeft < 2500; focusUntil = 0; stretch('focus', { until: 0, ended });
      if (ended) setTimeout(() => { if (S()?.mode !== 'due') flash({ key: 'focus-done:' + Date.now(), tone: 'done', ms: 4000, view: 'focus', text: T('Fokus siap. Rehat sebentar.', 'Focus done. Take a short break.') }); }, 1500);
    }
    focusLeft = f.active() ? f.left() : focusLeft;
  }, 1000);

  // ---------- settle: size, width, banner, and folding the Stretch page after you acted ----------
  let lastStretch = '';
  function settle() {
    if (!introFinished) return;
    if (mode === 'expanded') { lastView = currentView === 'settings' ? lastView : currentView; lastAt = performance.now(); }
    current = pick();
    const s = S(), sm = s?.mode || '';
    if (sm !== lastStretch) {
      const onPage = mode === 'expanded' && currentView === 'stretch';
      if (onPage && lastStretch === 'active' && sm === 'done') setTimeout(() => { if (mode === 'expanded' && currentView === 'stretch' && S()?.mode !== 'active') fold(); }, 1500);
      if (onPage && lastStretch === 'due' && (sm === 'snoozed' || sm === 'waiting')) setTimeout(() => { if (mode === 'expanded' && currentView === 'stretch' && S()?.mode !== 'active') fold(); }, 700);
      lastStretch = sm;
    }
    showBanner();
    if (window.__kopiHelloBusy?.()) return;
    const key = current?.key || '';
    wantWidth = measure(current);
    const over = pointer.known && inside(pointer.x, pointer.y, islandBounds);
    if (mode === 'rest' && current && current.kind !== 'msg') setMode('compact', false);
    else if (mode === 'compact' && !current && !over && !window.__rehattDragging) setMode('rest', false);
    else if (mode === 'compact' && key !== lastKey && !transition) setMode('compact', false); // new nudge: its own width
    lastKey = key;
  }
  setInterval(settle, 150);

  const clearNews = () => { queue.length = 0; flashNow = null; }; // the smoke test starts each flow clean
  window.__rehattDirector = Object.freeze({ flash, clearNews, pick: () => pick(), destination, open, fold,
    debug: () => ({ buttons: [...buttons.keys()], pressed, current: current?.key || null, wantWidth }) });
})();
