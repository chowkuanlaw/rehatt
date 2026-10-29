'use strict';
// Stretch breaks in the island (from Lapis). stretch-main.cjs keeps the time; the stretches and the kuih
// come from lapis/data.js and lapis/mascot.js. Three places show it:
//   - the small island: "Time to stretch" with your kuih, a countdown while you stretch, a water reminder
//   - the Stretch page (header button, or click the small island): the stretch, how to do it, Start / Done / Snooze / Skip
//   - a home widget: when the next stretch comes and how many you did today
(function stretchIsland() {
  const api = window.kopi, D = window.LapisData;
  if (!api?.stretchGet || !D || !window.lapisSVG) return;
  const MS = () => window.__kopiPrefs?.().lang === 'ms', T = (ms, en) => (MS() ? ms : en);
  const tx = (ex, key) => (MS() && ex?.ms?.[key]) || ex?.[key] || '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const clockAt = ts => new Date(ts).toLocaleTimeString(MS() ? 'ms-MY' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  let st = null;

  // ---------- the kuih: SVG in the page, a cached picture of it on the canvas ----------
  const KUIH_CSS = '.limb{fill:none;stroke:#2A1F1A;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}.hand,.foot,.eye{fill:#2A1F1A}' +
    '.outline{fill:none;stroke:#2A1F1A;stroke-width:3.5}.line{fill:none;stroke:#2A1F1A;stroke-width:2.6;stroke-linecap:round}.blush{fill:#F58FAE;opacity:.85}' +
    '.fx{fill:none;stroke:#F2729C;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}.fx.dash{stroke-dasharray:3 6}.zz{font:800 18px "Segoe UI",sans-serif;fill:#62C68C}' +
    '.stk *{fill:#fff!important;stroke:#fff!important;stroke-width:13px;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:none!important}';
  const outfit = () => st?.festival || null;
  const svg = (pose, bob) => window.lapisSVG(pose, '', bob, st?.kuih || 'lapis', outfit());
  const images = new Map();
  function kuihImage(pose) {
    const key = (st?.kuih || 'lapis') + ':' + pose + ':' + (outfit() || '');
    let img = images.get(key);
    if (!img) {
      const raw = svg(pose, false).replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/>/, `><style>${KUIH_CSS}</style>`);
      img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(raw);
      images.set(key, img); if (images.size > 60) images.delete(images.keys().next().value);
    }
    return img;
  }
  // draw the kuih standing on (x, bottom), h pixels tall
  function drawKuih(pose, x, bottom, h) {
    const img = kuihImage(pose); if (!img.complete || !img.naturalWidth) return;
    const w = h * img.naturalWidth / img.naturalHeight, bob = Math.sin(performance.now() / 420) * h * 0.02;
    ctx.drawImage(img, x - w / 2, bottom - h + bob, w, h);
  }
  const POSE_OF = id => ({ chin: 'chin', neck: 'neck', thoracic: 'thoracic', shoulders: 'shoulders', twist: 'twist', wrist: 'wrist', eyes: 'eyes', reach: 'reach', walk: 'walk' }[id] || 'idle');

  // ---------- state from the main process ----------
  let lastMode = '', lastWater = null, lastSwitched = false;
  function update(next) {
    if (!next?.ok) return;
    const before = st; st = next;
    if (st.mode !== lastMode) {
      if (st.mode === 'due') { window.__kopiChime?.('stretch'); if (mode !== 'expanded') setMode('compact', false); }
      if (st.mode === 'done' && lastMode === 'active') {
        window.__kopiChime?.('party'); window.__kopiCheer?.();
        window.dispatchEvent(new CustomEvent('kopi:badge', { detail: 'stretch' }));
      }
      lastMode = st.mode;
    }
    if (st.switched && !lastSwitched && st.mode === 'active') window.__kopiChime?.('switch');
    lastSwitched = st.switched;
    if (st.water !== lastWater) {
      if (st.water === 'ask') { window.__kopiChime?.('water'); if (mode !== 'expanded') setMode('compact', false); }
      if (st.water === 'done' && st.today.water >= st.waterGoal) window.dispatchEvent(new CustomEvent('kopi:badge', { detail: 'water' }));
      lastWater = st.water;
    }
    if (before?.kuih !== st.kuih) images.clear();
    window.__kopiSettleSize?.();
    render(true);
  }
  api.onStretch(update);
  api.stretchGet().then(update).catch(() => {});
  const act = (action, value) => api.stretchAction(action, value).then(update).catch(() => {});

  const ex = id => D.BY[id] || null;
  const current = () => ex(st?.cur || st?.upNext);
  function status() {
    if (!st) return '';
    if (!st.on) return T('Dimatikan', 'Turned off');
    if (st.paused) return T('Dijeda', 'Paused');
    if (st.mode === 'active') return `${tx(current(), 'name')} · ${mmss(st.activeEnd - Date.now())}`;
    if (st.mode === 'due') return T('Masa untuk regangan', 'Time to stretch');
    if (st.resting) return st.backAt ? T(`Rehat · kembali ${clockAt(st.backAt)}`, `Resting · back ${clockAt(st.backAt)}`) : T('Rehat', 'Resting');
    if (st.quiet) return T('Senyap: dalam mesyuarat', 'Quiet: in a meeting');
    if (st.away) return T('Anda jauh dari meja', 'You are away');
    return T(`Seterusnya dalam ${Math.max(1, Math.round((st.nextDue - Date.now()) / 60000))} min`, `Next in ${Math.max(1, Math.round((st.nextDue - Date.now()) / 60000))} min`);
  }
  window.__rehattStretch = {
    status, state: () => st,
    startNow: () => { act('now'); setView('stretch'); setMode('expanded'); },
    test: kind => act('test', kind)
  };

  // ---------- the small island ----------
  // true while there is something to show: a stretch due or running, just done, water, or "welcome back"
  window.__kopiStretchNudge = () => Boolean(st?.on && (['due', 'active', 'done'].includes(st.mode) || st.water || st.backMins));
  window.__kopiStretchSmall = (left, cy, cover, mid0, mid1) => {
    const line = (s, colour = '#f2f5ed') => text(s, mid0, cy + 4, 11.5, colour, 700, 'left', mid1 - mid0);
    if (st.mode === 'active') {
      const e = current(), part = Math.min(1, Math.max(0, 1 - (st.activeEnd - Date.now()) / (st.activeSecs * 1000 || 1))), r = cover / 2 - 2, cx = left + cover / 2;
      ctx.save(); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * part); ctx.strokeStyle = '#ff8fb1'; ctx.stroke(); ctx.restore();
      const side = e?.sides && st.switched ? T(' · tukar sisi', ' · switch sides') : '';
      text(mmss(st.activeEnd - Date.now()), mid1, cy + 4, 11.5, '#ffb3c9', 700, 'right');
      return text(tx(e, 'name') + side, mid0, cy + 4, 11.5, '#f2f5ed', 700, 'left', mid1 - mid0 - 42);
    }
    drawKuih(st.mode === 'done' ? 'cheer' : st.water ? (st.water === 'done' ? 'drink' : 'glass') : st.mode === 'due' ? 'wave' : 'idle', left + cover / 2, cy + cover / 2 + 2, cover + 4);
    if (st.mode === 'done') return line(T(`Syabas! ${st.today.total}/${st.goal} hari ini`, `Nice! ${st.today.total}/${st.goal} today`), '#7ef0a4');
    if (st.mode === 'due') return line(st.reason === 'ai' ? T(`AI anda bekerja · ${tx(current(), 'name')}?`, `Your AI is working · ${tx(current(), 'name')}?`) : T(`Masa untuk regangan · ${tx(current(), 'name')}`, `Time to stretch · ${tx(current(), 'name')}`));
    if (st.water === 'ask') return line(T('💧 Minum segelas air?', '💧 Time for a glass of water?'));
    if (st.water === 'done') return line(T(`💧 ${st.today.water}/${st.waterGoal} gelas hari ini`, `💧 ${st.today.water}/${st.waterGoal} glasses today`), '#8fd0ff');
    if (st.backMins) return line(T(`Selamat kembali · ${st.backMins} min rehat dikira`, `Welcome back · ${st.backMins} min break counted`), '#c6e994');
  };
  // a click on the small island while it asks: open the Stretch page (water: count the glass)
  canvas.addEventListener('click', e => {
    if (mode === 'expanded' || !window.__kopiStretchNudge() || !inside(e.clientX, e.clientY, islandBounds)) return;
    if (window.__kopiStatus?.()?.state === 'question') return; // your AI's question goes first
    e.preventDefault(); e.stopImmediatePropagation();
    if (st.water === 'ask' && st.mode !== 'due' && st.mode !== 'active') { act('water'); return; }
    setView('stretch'); setMode('expanded');
  }, true);

  // ---------- the Stretch page ----------
  const root = document.createElement('section'); root.id = 'rehatt-stretch'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#rehatt-stretch{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto;user-select:none}
#rehatt-stretch *{box-sizing:border-box}
#rehatt-stretch .lapis{overflow:visible;display:block;height:100%;width:auto}
#rehatt-stretch .lapis .limb{fill:none;stroke:#2A1F1A;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}
#rehatt-stretch .lapis .hand,#rehatt-stretch .lapis .foot,#rehatt-stretch .lapis .eye{fill:#2A1F1A}
#rehatt-stretch .lapis .line{fill:none;stroke:#2A1F1A;stroke-width:2.6;stroke-linecap:round}
#rehatt-stretch .lapis .blush{fill:#F58FAE;opacity:.85}
#rehatt-stretch .lapis .fx{fill:none;stroke:#F2729C;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}
#rehatt-stretch .lapis .fx.dash{stroke-dasharray:3 6}
#rehatt-stretch .lapis .zz{font:800 18px "Segoe UI",sans-serif;fill:#62C68C}
#rehatt-stretch .lapis .stk *{fill:#fff!important;stroke:#fff!important;stroke-width:13px;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:none!important}
#rehatt-stretch .bob{animation:st-bob 2.6s ease-in-out infinite;transform-origin:50% 100%}
@keyframes st-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px) rotate(-1.5deg)}}
#rehatt-stretch .st-body{display:flex;gap:18px;height:calc(100% - 60px);min-height:0}
#rehatt-stretch .st-kuih{flex:none;width:150px;height:100%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;position:relative}
#rehatt-stretch .st-kuih svg{max-height:168px}
#rehatt-stretch .st-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
#rehatt-stretch .st-kicker{margin:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ff9fbf;display:flex;gap:8px;align-items:center}
#rehatt-stretch .st-kicker i{width:7px;height:7px;border-radius:50%;background:#ff8fb1;box-shadow:0 0 8px #ff8fb1}
#rehatt-stretch .st-ai{color:#ffb35c}
#rehatt-stretch .st-name{margin:0;font-size:21px;font-weight:700;color:#fff;line-height:1.15}
#rehatt-stretch .st-cue{margin:0;color:#c9d0c6;font-size:12.5px}
#rehatt-stretch .st-steps{margin:2px 0 0;padding-left:18px;color:#aab4a5;font-size:11.5px;display:flex;flex-direction:column;gap:2px}
#rehatt-stretch .st-row{display:flex;gap:8px;align-items:center;margin-top:auto;flex-wrap:wrap}
#rehatt-stretch button{border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#151715;color:#e8eee4;padding:8px 13px;font:600 11.5px "Segoe UI",sans-serif;cursor:pointer;transition:background .15s,transform .1s}
#rehatt-stretch button:hover{background:#1f231f;border-color:rgba(255,255,255,.2)}
#rehatt-stretch button:active{transform:scale(.96)}
#rehatt-stretch .st-go{background:#ff8fb1;border-color:#ff8fb1;color:#2a0b16;font-size:13px;padding:10px 20px}
#rehatt-stretch .st-go:hover{background:#ffa9c3}
#rehatt-stretch .st-quiet{background:transparent;border-color:transparent;color:#8f998d}
#rehatt-stretch .st-side{flex:none;width:176px;display:flex;flex-direction:column;gap:8px}
#rehatt-stretch .st-card{border-radius:16px;background:linear-gradient(180deg,#141714,#0d0f0d);border:1px solid rgba(255,255,255,.07);padding:11px 13px;display:flex;flex-direction:column;gap:5px}
#rehatt-stretch .st-card small{color:#8f998d;font-size:10.5px}
#rehatt-stretch .st-card b{font-size:20px;font-variant-numeric:tabular-nums}
#rehatt-stretch .st-dots{display:flex;gap:3px;flex-wrap:wrap}
#rehatt-stretch .st-dots i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.1)}
#rehatt-stretch .st-dots i.on{background:#ff8fb1}
#rehatt-stretch .st-dots.water i.on{background:#7fc8ff}
#rehatt-stretch .st-timer{display:flex;align-items:center;gap:14px}
#rehatt-stretch .st-big{font:700 44px/1 "Segoe UI",sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-1px}
#rehatt-stretch .st-track{height:6px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;flex:1}
#rehatt-stretch .st-fill{height:100%;background:#ff8fb1;border-radius:4px;transition:width .5s linear}
#rehatt-stretch .st-switch{color:#ffd28a;font-weight:700}
#rehatt-stretch .st-pause{display:flex;gap:6px;flex-wrap:wrap}
#rehatt-stretch .st-pause button{padding:6px 10px;font-size:11px}`;
  document.head.appendChild(style);

  let lastKey = '';
  function render(force) {
    if (!st || root.style.display === 'none') return;
    const e = current(), active = st.mode === 'active', due = st.mode === 'due';
    const key = [st.mode, st.cur, st.upNext, st.paused, st.resting, st.quiet, st.reason, st.water, st.kuih, st.today.total, st.today.water, st.switched, MS(), st.on].join('|');
    if (!force && key === lastKey) return tick();
    lastKey = key;
    const pose = active ? POSE_OF(e?.id) : st.mode === 'done' ? 'cheer' : st.water === 'ask' ? 'glass' : due ? 'wave' : st.mood || 'idle';
    const kicker = st.reason === 'ai' && (due || active) ? `<p class="st-kicker st-ai"><i style="background:#ffb35c;box-shadow:0 0 8px #ffb35c"></i>${T('AI anda sedang bekerja · masa yang sesuai untuk regangan', 'Your AI is working · a good moment to stretch')}</p>`
      : `<p class="st-kicker"><i></i>${active ? T('Sedang meregang', 'Stretching now') : due ? T('Masa untuk regangan', 'Time to stretch') : st.mode === 'done' ? T('Siap!', 'Done!') : T('Regangan seterusnya', 'Next stretch')}</p>`;
    const steps = (MS() && e?.ms?.steps) || e?.steps || [];
    const actions = active
      ? `<div class="st-timer"><span class="st-big" id="st-left">${mmss(st.activeEnd - Date.now())}</span><div class="st-track"><div class="st-fill" id="st-fill"></div></div></div>
         ${e?.sides ? `<p class="st-cue ${st.switched ? 'st-switch' : ''}" id="st-sides">${st.switched ? T('Tukar sisi sekarang', 'Switch sides now') : T('Satu sisi dahulu, kemudian tukar di pertengahan', 'One side first, switch halfway')}</p>` : ''}
         <div class="st-row"><button type="button" class="st-go" data-a="done">${T('Siap', 'Done')}</button><button type="button" class="st-quiet" data-a="stop">${T('Berhenti', 'Stop')}</button></div>`
      : due
        ? `<div class="st-row"><button type="button" class="st-go" data-a="start">${T('Mula', 'Start')} · ${esc(tx(e, 'dose'))}</button><button type="button" data-a="snooze">${T(`Tunda ${st.snooze} min`, `Snooze ${st.snooze} min`)}</button><button type="button" data-a="different">${T('Yang lain', 'Another')}</button><button type="button" class="st-quiet" data-a="skip">${T('Langkau', 'Skip')}</button></div>`
        : `<div class="st-row"><button type="button" class="st-go" data-a="now">${T('Regang sekarang', 'Stretch now')}</button>${
          st.paused ? `<button type="button" data-a="resume">${T('Sambung semula', 'Resume')}</button>` : `<span class="st-pause">${[['m30', '30 min'], ['h1', T('1 jam', '1 hour')], ['tomorrow', T('Esok', 'Tomorrow')]].map(([k, l]) => `<button type="button" data-a="pause" data-v="${k}">${T('Jeda', 'Pause')} ${l}</button>`).join('')}</span>`}</div>`;
    const water = st.waterOn && !st.ramadan
      ? `<div class="st-card"><small>${T('Air hari ini', 'Water today')}</small><b>${st.today.water}<small> / ${st.waterGoal}</small></b><div class="st-dots water">${Array.from({ length: st.waterGoal }, (_, i) => `<i class="${i < st.today.water ? 'on' : ''}"></i>`).join('')}</div>${st.water === 'ask' ? `<button type="button" data-a="water">💧 ${T('Sudah minum', 'Done, I drank')}</button>` : `<button type="button" class="st-quiet" data-a="water">+ ${T('segelas', 'a glass')}</button>`}</div>` : '';
    root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${T('Regangan', 'Stretch')}</p><p class="tc-page-sub">${esc(status())}</p></div></div>
      <div class="st-body"><div class="st-kuih">${svg(pose, !active)}</div>
        <div class="st-main">${kicker}<p class="st-name">${esc(tx(e, 'name'))}</p><p class="st-cue">${esc(tx(e, 'cue'))} · ${esc(tx(e, 'dose'))}</p>
          ${active || due ? `<ol class="st-steps">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${actions}</div>
        <div class="st-side"><div class="st-card"><small>${T('Regangan hari ini', 'Stretches today')}</small><b>${st.today.total}<small> / ${st.goal}</small></b><div class="st-dots">${Array.from({ length: st.goal }, (_, i) => `<i class="${i < st.today.total ? 'on' : ''}"></i>`).join('')}</div>${st.streak ? `<small>🔥 ${T(`${st.streak} hari berturut-turut`, `${st.streak}-day streak`)}</small>` : ''}</div>${water}</div>
      </div>`;
    tick();
  }
  // the kuih acts out the stretch while you do it (shoulders, reach, walk and eyes move), and the clock ticks
  function tick() {
    if (!st || st.mode !== 'active') return;
    const left = root.querySelector('#st-left'), fill = root.querySelector('#st-fill');
    if (left) left.textContent = mmss(st.activeEnd - Date.now());
    if (fill) fill.style.width = `${100 * Math.min(1, 1 - (st.activeEnd - Date.now()) / (st.activeSecs * 1000 || 1))}%`;
    const move = window.lapisMove?.(st.cur), box = root.querySelector('.st-kuih');
    if (move && box) box.innerHTML = svg(move.at(performance.now() / 1000), false);
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    sound('click'); act(b.dataset.a, b.dataset.v);
    if (b.dataset.a === 'water') window.__kopiChime?.('water');
  });

  // ---------- the home widget ----------
  window.__rehattStretchWidget = (w, r, live) => {
    if (!st) return false;
    const e = current(), my = r.y + r.height / 2;
    const next = st.mode === 'active' ? mmss(st.activeEnd - Date.now()) : st.mode === 'due' ? T('Sekarang', 'Now') : st.paused ? T('Dijeda', 'Paused') : st.resting ? T('Rehat', 'Resting') : `${Math.max(1, Math.round((st.nextDue - Date.now()) / 60000))} min`;
    const pose = st.mode === 'active' ? POSE_OF(e?.id) : st.mode === 'due' ? 'wave' : st.mood || 'idle';
    if (w.size === 'S') {
      drawKuih(pose, r.x + 28, r.y + r.height - 8, r.height - 16);
      text(next, r.x + 54, my - 1, 15, '#fff', 700, 'left', r.width - 62);
      text(T(`${st.today.total}/${st.goal} hari ini`, `${st.today.total}/${st.goal} today`), r.x + 54, my + 14, 10.5, '#8f998d', 500, 'left', r.width - 62);
      return true;
    }
    const kh = Math.min(r.height - 14, w.size === 'L' ? 120 : 60), kx = r.x + 16 + kh * 0.42;
    drawKuih(pose, kx, r.y + r.height - 6, kh);
    const tx0 = kx + kh * 0.5 + 10, tw = r.x + r.width - tx0 - (w.size === 'W' ? 46 : 14);
    text(st.mode === 'due' ? T('Masa untuk regangan', 'Time to stretch') : T('Regangan seterusnya', 'Next stretch'), tx0, w.size === 'L' ? r.y + 34 : my - 6, w.size === 'L' ? 15 : 12.5, '#fff', 700, 'left', tw);
    text(`${tx(e, 'name')} · ${next}`, tx0, w.size === 'L' ? r.y + 52 : my + 10, 11, st.mode === 'due' ? '#ffb3c9' : '#9aa596', 600, 'left', tw);
    if (w.size === 'L') {
      const bw = tw, by = r.y + r.height - 44;
      text(T(`${st.today.total} daripada ${st.goal} hari ini`, `${st.today.total} of ${st.goal} today`), tx0, by - 6, 10.5, '#8f998d', 500);
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.roundRect(tx0, by, bw, 5, 2.5); ctx.fill();
      ctx.fillStyle = '#ff8fb1'; ctx.beginPath(); ctx.roundRect(tx0, by, Math.max(5, bw * Math.min(1, st.today.total / st.goal)), 5, 2.5); ctx.fill(); ctx.restore();
      if (st.waterOn && !st.ramadan) text(`💧 ${st.today.water}/${st.waterGoal}`, tx0, by + 22, 10.5, '#8fd0ff', 600);
    }
    // quick start ▶ (or done ✓ while you stretch)
    const bx = r.x + r.width - 28, br = 16, b = { x: bx - br, y: my - br, width: br * 2, height: br * 2 };
    if (w.size !== 'S') {
      const over = live && inside(pointer.x, pointer.y, b);
      ctx.save(); ctx.beginPath(); ctx.arc(bx, my, br, 0, Math.PI * 2); ctx.fillStyle = over ? '#ffa9c3' : '#ff8fb1'; ctx.fill();
      ctx.fillStyle = '#2a0b16'; ctx.beginPath(); ctx.moveTo(bx - 4, my - 6); ctx.lineTo(bx + 6, my); ctx.lineTo(bx - 4, my + 6); ctx.closePath(); ctx.fill(); ctx.restore();
      if (live) hit.stretchQuick = b;
    }
    return true;
  };

  // ---------- page layout (pages-ui.js) ----------
  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) { if (currentView !== 'stretch') return baseExpanded(alpha); drawHeader(alpha); };
  let shown = false;
  (function position() {
    const show = currentView === 'stretch' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;
    if (show) { window.__kopiPage.place(root, contentRect()); render(!shown); }
    shown = show;
    requestAnimationFrame(position);
  })();
  setInterval(() => { if (st?.mode === 'active' && root.style.display !== 'none') tick(); }, 120);
  // the apps page and the home grid open it like any other app
  canvas.addEventListener('click', e => {
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.stretchApp) && !window.__kopiHomeEditing?.()) {
      e.preventDefault(); e.stopImmediatePropagation(); setView('stretch'); setMode('expanded');
    }
  }, true);
})();
