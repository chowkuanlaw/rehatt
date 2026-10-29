'use strict';
// Stretch breaks in the island: Lapis Stretch running inside Rehatt (lapis/engine.cjs keeps the time; the stretches,
// the kuih and their words come from Lapis's own files in lapis/renderer). Three places show it:
//   - the small island (director-ui.js): "Time to stretch" with your kuih, the countdown, water, Lapis's notices
//   - the Stretch page (header button, or a click on a nudge): the stretch, how to do it, Start / Done / Snooze / Skip,
//     and Lapis's notices: a new kuih, the Friday summary, Balik rumah, teh tarik time, go to sleep, what's new
//   - a home widget: when the next stretch comes and how many you did today
// Like in Lapis, your kuih is alive: tap it and it squishes; tap it 10 times quickly and it dances, full screen.
(function stretchIsland() {
  const api = window.kopi, D = window.LapisData, LI = window.LapisI18n;
  if (!api?.stretchGet || !D || !window.lapisSVG) return;
  const MS = () => window.__kopiPrefs?.().lang === 'ms', T = (ms, en) => (MS() ? ms : en);
  const L = (k, v) => (LI ? LI.t(MS() ? 'ms' : 'en', k, Object.assign({ all: D.KUIH.length }, v)) : k); // Lapis's own words
  const tx = (ex, key) => (MS() && ex?.ms?.[key]) || ex?.[key] || '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const LOC = () => (MS() ? 'ms-MY' : 'en-GB');
  const clockAt = ts => new Date(ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
  const fmtMin = m => new Date(2000, 0, 1, 0, m).toLocaleTimeString(LOC(), { hour: 'numeric', minute: '2-digit', hour12: true });
  const dayKey = d => D.dayKey(d);
  let st = null;

  // ---------- the kuih: Lapis's drawings, with the outfit of the moment ----------
  // pyjamas from 11 pm to 5 am, the flag-day outfit on the day you enter its code, or the festival's (Lapis 1.7.1)
  const night = () => { const h = new Date().getHours(); return h >= 23 || h < 5; };
  const outfit = () => (night() ? 'pyjama' : st?.flagDay === dayKey(new Date()) ? 'merdeka' : st?.festival || undefined);
  const golden = () => Boolean(st?.golden);
  const svg = (pose, bob) => window.lapisSVG(pose, '', bob, st?.kuih || 'lapis', outfit(), golden());
  const KUIH_CSS = '.limb{fill:none;stroke:#2A1F1A;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}.hand,.foot,.eye{fill:#2A1F1A}' +
    '.outline{fill:none;stroke:#2A1F1A;stroke-width:3.5}.line{fill:none;stroke:#2A1F1A;stroke-width:2.6;stroke-linecap:round}.blush{fill:#F58FAE;opacity:.85}' +
    '.fx{fill:none;stroke:#F2729C;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}.fx.dash{stroke-dasharray:3 6}.zz{font:800 18px "Segoe UI",sans-serif;fill:#62C68C}' +
    '.stk *{fill:#fff!important;stroke:#fff!important;stroke-width:13px;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:none!important}';
  const images = new Map();
  function kuihImage(pose, skin) {
    const key = (skin || st?.kuih || 'lapis') + ':' + pose + ':' + (outfit() || '') + ':' + golden();
    let img = images.get(key);
    if (!img) {
      const raw = window.lapisSVG(pose, '', false, skin || st?.kuih || 'lapis', outfit(), golden()).replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/>/, `><style>${KUIH_CSS}</style>`);
      img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(raw);
      images.set(key, img); if (images.size > 80) images.delete(images.keys().next().value);
    }
    return img;
  }
  // draw the kuih standing on (x, bottom), h pixels tall; it squishes for a moment when you tap it
  let squishAt = -1e9;
  function drawKuih(pose, x, bottom, h) {
    const img = kuihImage(pose); if (!img.complete || !img.naturalWidth) return;
    const w = h * img.naturalWidth / img.naturalHeight, now = performance.now(), bob = Math.sin(now / 420) * h * 0.02;
    const since = now - squishAt, k = since < 260 ? Math.sin(since / 260 * Math.PI) : 0, wob = taps >= 5 ? Math.sin(now / 50) * 0.12 : 0;
    ctx.save(); ctx.translate(x, bottom); ctx.rotate(wob); ctx.scale(1 - 0.12 * k, 1 + 0.12 * k);
    ctx.drawImage(img, -w / 2, -h + bob, w, h); ctx.restore();
  }
  const POSE_OF = id => D.BY[id]?.pose || ({ chin: 'chin', neck: 'neck', thoracic: 'thoracic', shoulders: 'shoulders', twist: 'twist', wrist: 'wrist', eyes: 'eyes', reach: 'reach', walk: 'walk' }[id] || 'idle');
  const moodPose = () => ({ sad: 'sad', drowsy: 'drowsy', proud: 'proud' }[st?.mood] || 'idle');

  // ---------- the egg: tap the kuih 10 times quickly (Lapis 1.4.0) ----------
  const EGG_TAPS = 10, EGG_GAP = 500;
  let taps = 0, lastTap = 0, tapReset = null;
  function tapKuih(cx, cy, el) {
    const now = Date.now();
    taps = now - lastTap < EGG_GAP ? taps + 1 : 1; lastTap = now;
    clearTimeout(tapReset); tapReset = setTimeout(() => { taps = 0; el?.classList.remove('wobble'); }, EGG_GAP + 150);
    squishAt = performance.now();
    if (el) { el.classList.remove('squish'); void el.offsetWidth; el.classList.add('squish'); el.classList.toggle('wobble', taps >= 5); }
    if (taps >= EGG_TAPS) { taps = 0; clearTimeout(tapReset); el?.classList.remove('wobble'); api.lapisAct('egg', { rx: cx, ry: cy }); }
  }

  // ---------- the chime: Lapis's four sounds and your volume (Lapis 1.8.0) ----------
  let ac = null;
  const vol = () => (st && Number.isFinite(st.volume) ? st.volume : 70) / 70;
  const CHIME_STYLES = {
    bell: { type: 'sine', mul: 1, attack: 0.02, decay: 1.1, gap: 0.17, level: 1 },
    marimba: { type: 'triangle', mul: 1, attack: 0.005, decay: 0.45, gap: 0.14, level: 1.3, over: 4 },
    soft: { type: 'sine', mul: 0.5, attack: 0.09, decay: 1.5, gap: 0.24, level: 0.9 },
    pop: { type: 'square', mul: 1, attack: 0.004, decay: 0.13, gap: 0.11, level: 0.45, cut: 1800 }
  };
  function chime(kind) {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const v = vol(); if (v <= 0) return;
      const c = CHIME_STYLES[st && st.chimeStyle] || CHIME_STYLES.bell;
      const notes = kind === 'due' ? [659.25, 880] : kind === 'done' ? [783.99, 987.77, 1174.66] : kind === 'water' ? [1046.5, 783.99] : [587.33];
      const peak = (kind === 'water' ? 0.14 : 0.22) * c.level * v, decay = kind === 'water' ? c.decay * 0.55 : c.decay;
      notes.forEach((f, i) => {
        const t = ac.currentTime + 0.05 + i * c.gap;
        const tone = (freq, p) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = c.type; o.frequency.value = freq;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p, t + c.attack); g.gain.exponentialRampToValueAtTime(0.0001, t + c.attack + decay);
          if (c.cut) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = c.cut; o.connect(fl); fl.connect(g); } else o.connect(g);
          g.connect(ac.destination); o.start(t); o.stop(t + c.attack + decay + 0.1);
        };
        tone(f * c.mul, Math.min(0.5, peak));
        if (c.over) tone(f * c.over, Math.min(0.5, peak) * 0.12);
      });
    } catch { /* no audio device */ }
  }
  api.onLapisChime?.(chime);

  // ---------- state from the main process ----------
  let lastMode = '', lastWater = null, lastNotice = '';
  function update(next) {
    if (!next?.ok) return;
    const before = st; st = next;
    if (st.mode !== lastMode) {
      if (st.mode === 'done' && lastMode === 'active') { window.__kopiCheer?.(); window.dispatchEvent(new CustomEvent('kopi:badge', { detail: 'stretch' })); }
      lastMode = st.mode;
    }
    if (st.water !== lastWater) {
      if (st.water === 'done' && st.today.water >= st.waterGoal) window.dispatchEvent(new CustomEvent('kopi:badge', { detail: 'water' }));
      lastWater = st.water;
    }
    const nk = st.notice ? JSON.stringify(st.notice) : '';
    if (nk !== lastNotice) { lastNotice = nk; if (st.notice?.type === 'unlock') window.dispatchEvent(new CustomEvent('kopi:badge', { detail: 'bendy' })); }
    if (before?.kuih !== st.kuih || before?.golden !== st.golden) images.clear();
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
    if (st.eggMsg) return L('sub.egg');
    if (st.paused) return st.pauseUntil ? T(`Dijeda hingga ${clockAt(st.pauseUntil)}`, `Paused till ${clockAt(st.pauseUntil)}`) : T('Dijeda', 'Paused');
    if (st.mode === 'active') return `${tx(current(), 'name')} · ${mmss(st.activeEnd - Date.now())}`;
    if (st.mode === 'due') return T('Masa untuk regangan', 'Time to stretch');
    if (st.mode === 'done') return T(`Seterusnya pada ${clockAt(st.nextDue)}`, `Next at ${clockAt(st.nextDue)}`);
    if (st.mode === 'snoozed') return T(`Ditunda · kembali ${clockAt(st.nextDue)}`, `Snoozed · back ${clockAt(st.nextDue)}`);
    if (st.focus) return T('Menunggu Fokus tamat', 'Waiting for Focus to end');
    if (st.resting) return st.backAt ? T(`Rehat · kembali ${clockAt(st.backAt)}`, `Resting · back ${clockAt(st.backAt)}`) : T('Rehat', 'Resting');
    if (st.quiet) return T('Senyap: dalam mesyuarat', 'Quiet: in a meeting');
    if (st.away) return T('Anda jauh dari meja', 'You are away');
    const mins = Math.max(1, Math.round((st.nextDue - Date.now()) / 60000));
    if (st.ramadan) return T(`Ramadan hari ke-${st.ramadan.day} · seterusnya dalam ${mins} min`, `Ramadan day ${st.ramadan.day} · next in ${mins} min`);
    return T(`Seterusnya dalam ${mins} min`, `Next in ${mins} min`);
  }
  // ---------- Lapis's notices, in words for the nudge (director-ui.js) ----------
  function noticeText(n) {
    if (!n) return null;
    const k = D.KUIH_BY[n.id], kname = (D.KUIH_BY[st?.kuih] || D.KUIH_BY.lapis).name;
    if (n.type === 'unlock') return { text: L('un.title', { k: k?.name || '' }), pose: 'cheer', buttons: [[L('un.use', { k: k?.name || '' }), 'unlock-use'], [T('Kekal', 'Keep'), 'notice-close']] };
    if (n.type === 'summary') return { text: L('sum.title'), pose: 'cheer', buttons: [[T('Tutup', 'Close'), 'notice-close']] };
    if (n.type === 'wrap') { const rec = st?.history?.[n.day] || { total: 0 }; return { text: `${L('wrap.title')} · ${rec.total}/${st.goal}`, pose: 'wave', buttons: [[L('wrap.bye'), 'notice-close']] }; }
    if (n.type === 'teh') return { text: L('teh.title'), pose: 'tarik', buttons: [[L('teh.btn'), 'notice-close']] };
    if (n.type === 'night') return { text: L('night.title'), pose: 'yawn', buttons: [[T('Okey', 'Okay'), 'notice-close'], [T('5 min', '5 min'), 'night-more']] };
    if (n.type === 'news') return { text: L('news.title') + ' · Lapis ' + n.v, pose: 'cheer', buttons: [[L('news.ok'), 'news-close']] };
    if (n.type === 'restored') return { text: L('restored.title'), pose: 'drowsy', buttons: [[L('news.ok'), 'notice-close']] };
    return { text: kname, pose: 'idle', buttons: [] };
  }
  window.__rehattStretch = {
    status, state: () => st,
    startNow: () => { act('now'); setView('stretch'); setMode('expanded'); },
    test: kind => act('test', kind),
    name: id => tx(ex(id), 'name'),
    current: () => current(),
    act,
    notice: () => (st && st.mode === 'waiting' && st.notice && st.notice.type !== 'water' ? st.notice : null),
    noticeText, noticeAct: (type, extra) => api.lapisAct(type, extra)
  };
  window.__rehattKuih = drawKuih;
  window.__rehattTapKuih = tapKuih;

  // ---------- the Stretch page ----------
  const root = document.createElement('section'); root.id = 'rehatt-stretch'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#rehatt-stretch{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto;user-select:none}
#rehatt-stretch *{box-sizing:border-box}
#rehatt-stretch .lapis{overflow:visible;display:block;height:100%;width:auto}
#rehatt-stretch .lapis .limb{fill:none;stroke:#2A1F1A;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}
#rehatt-stretch .lapis .hand,#rehatt-stretch .lapis .foot,#rehatt-stretch .lapis .eye{fill:#2A1F1A}
#rehatt-stretch .lapis .outline{fill:none;stroke:#2A1F1A;stroke-width:3.5}
#rehatt-stretch .lapis .line{fill:none;stroke:#2A1F1A;stroke-width:2.6;stroke-linecap:round}
#rehatt-stretch .lapis .blush{fill:#F58FAE;opacity:.85}
#rehatt-stretch .lapis .fx{fill:none;stroke:#F2729C;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}
#rehatt-stretch .lapis .fx.dash{stroke-dasharray:3 6}
#rehatt-stretch .lapis .zz{font:800 18px "Segoe UI",sans-serif;fill:#62C68C}
#rehatt-stretch .lapis .stk *{fill:#fff!important;stroke:#fff!important;stroke-width:13px;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:none!important}
#rehatt-stretch .lapis.golden .sparkles{animation:st-spark 1.6s ease-in-out infinite}
@keyframes st-spark{0%,100%{opacity:.4}50%{opacity:1}}
#rehatt-stretch .bob{animation:st-bob 2.6s ease-in-out infinite;transform-origin:50% 100%}
@keyframes st-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px) rotate(-1.5deg)}}
#rehatt-stretch .kuih-tap{cursor:pointer;transform-origin:50% 100%}
#rehatt-stretch .kuih-tap.squish{animation:st-squish .26s ease-out}
#rehatt-stretch .kuih-tap.wobble svg{animation:st-wobble .3s ease-in-out infinite;transform-origin:50% 100%}
@keyframes st-squish{0%{transform:scale(1)}35%{transform:scale(.86,1.12)}70%{transform:scale(1.08,.94)}100%{transform:scale(1)}}
@keyframes st-wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}
#rehatt-stretch .st-body{display:flex;gap:16px;height:calc(100% - 58px);min-height:0}
#rehatt-stretch .st-kuih{flex:none;width:118px;height:100%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px;position:relative}
#rehatt-stretch .st-kuih svg{max-height:100%;max-width:118px}
#rehatt-stretch .st-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;min-height:0}
#rehatt-stretch .st-kicker{margin:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ff9fbf;display:flex;gap:8px;align-items:center}
#rehatt-stretch .st-kicker i{width:7px;height:7px;border-radius:50%;background:#ff8fb1;box-shadow:0 0 8px #ff8fb1}
#rehatt-stretch .st-kicker.gold{color:#f2c94c}#rehatt-stretch .st-kicker.gold i{background:#f2c94c;box-shadow:0 0 8px #f2c94c}
#rehatt-stretch .st-ai{color:#ffb35c}
#rehatt-stretch .st-name{margin:0;font-size:19px;font-weight:700;color:#fff;line-height:1.15}
#rehatt-stretch .st-cue{margin:0;color:#c9d0c6;font-size:12px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#rehatt-stretch .st-steps{margin:0;padding-left:0;list-style-position:inside;color:#aab4a5;font-size:11px;line-height:1.35;display:flex;flex-direction:column;gap:1px;overflow:hidden}
#rehatt-stretch .st-steps li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rehatt-stretch .st-row{display:flex;gap:7px;align-items:center;margin-top:auto;flex-wrap:nowrap}
#rehatt-stretch .st-label{color:#7f8a7a;font-size:11px;margin-left:4px}
#rehatt-stretch button{border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#151715;color:#e8eee4;padding:8px 13px;font:600 11.5px "Segoe UI",sans-serif;cursor:pointer;white-space:nowrap;transition:background .15s,transform .1s}
#rehatt-stretch button:hover{background:#1f231f;border-color:rgba(255,255,255,.2)}
#rehatt-stretch button:active{transform:scale(.96)}
#rehatt-stretch .st-go{background:#ff8fb1;border-color:#ff8fb1;color:#2a0b16;font-size:12.5px;padding:9px 18px;white-space:nowrap}
#rehatt-stretch .st-go:hover{background:#ffa9c3}
#rehatt-stretch .st-quiet{background:transparent;border-color:transparent;color:#8f998d}
#rehatt-stretch .st-side{flex:none;width:172px;display:flex;flex-direction:column;gap:7px}
#rehatt-stretch .st-card{border-radius:16px;background:linear-gradient(180deg,#141714,#0d0f0d);border:1px solid rgba(255,255,255,.07);padding:9px 12px;display:flex;flex-direction:column;gap:4px}
#rehatt-stretch .st-card small{color:#8f998d;font-size:10.5px}
#rehatt-stretch .st-card b{font-size:17px;font-variant-numeric:tabular-nums;line-height:1.1}
#rehatt-stretch .st-card .st-line{display:flex;align-items:baseline;justify-content:space-between;gap:6px}
#rehatt-stretch .st-card button{padding:5px 10px;font-size:11px;align-self:flex-start}
#rehatt-stretch .st-dots{display:flex;gap:3px;flex-wrap:wrap}
#rehatt-stretch .st-dots i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.1)}
#rehatt-stretch .st-dots i.on{background:#ff8fb1}
#rehatt-stretch .st-dots.water i.on{background:#7fc8ff}
#rehatt-stretch .st-timer{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
#rehatt-stretch .st-big{font:700 30px/1 "Segoe UI",sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-1px}
#rehatt-stretch .st-track{height:6px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;flex:1}
#rehatt-stretch .st-fill{height:100%;background:#ff8fb1;border-radius:4px;transition:width .5s linear}
#rehatt-stretch .st-switch{color:#ffd28a;font-weight:700}
#rehatt-stretch .st-pause{display:flex;gap:6px;flex-wrap:wrap}
#rehatt-stretch .st-pause button{padding:6px 10px;font-size:11px}
#rehatt-stretch .nc-stats{display:flex;gap:12px;flex-wrap:nowrap;margin:2px 0}
#rehatt-stretch .nc-stats div{min-width:0}
#rehatt-stretch .nc-stats div{display:flex;flex-direction:column}
#rehatt-stretch .nc-stats b{font-size:18px;font-variant-numeric:tabular-nums}
#rehatt-stretch .nc-stats span{color:#8f998d;font-size:10.5px}
#rehatt-stretch .st-cue.one{-webkit-line-clamp:1}
#rehatt-stretch .nc-news{margin:0;padding-left:16px;color:#c9d0c6;font-size:11.5px;display:flex;flex-direction:column;gap:2px;overflow:hidden}
#rehatt-stretch .st-kuih.pair{width:160px}
#rehatt-stretch .nc-pair{display:flex;align-items:flex-end;justify-content:center;gap:2px;height:100%;width:160px}
#rehatt-stretch .nc-pair .small{flex:none;width:46px;height:52%;display:flex;align-items:flex-end}
#rehatt-stretch .nc-pair .small svg{width:100%;height:100%;max-width:none}
#rehatt-stretch .nc-pair > svg{flex:none;height:74%;width:auto;max-width:108px}`;
  document.head.appendChild(style);

  function side() {
    const water = st.waterOn && !st.ramadan
      ? `<div class="st-card"><div class="st-line"><small>${T('Air hari ini', 'Water today')}</small><b>${st.today.water}<small> / ${st.waterGoal}</small></b></div><div class="st-dots water">${Array.from({ length: st.waterGoal }, (_, i) => `<i class="${i < st.today.water ? 'on' : ''}"></i>`).join('')}</div>${st.water === 'ask' ? `<button type="button" data-w="water-drank">💧 ${esc(L('wc.drank'))}</button>` : `<button type="button" class="st-quiet" data-w="water-add">+ ${T('segelas', 'a glass')}</button>`}</div>` : '';
    return `<div class="st-side"><div class="st-card"><div class="st-line"><small>${T('Regangan hari ini', 'Stretches today')}</small><b>${st.today.total}<small> / ${st.goal}</small></b></div><div class="st-dots">${Array.from({ length: st.goal }, (_, i) => `<i class="${i < st.today.total ? 'on' : ''}"></i>`).join('')}</div>${st.streak ? `<small>🔥 ${T(`${st.streak} hari berturut-turut`, `${st.streak}-day streak`)}</small>` : ''}</div>${water}</div>`;
  }
  // a notice from Lapis, as a page (Lapis showed these in its corner card)
  function noticeHTML(n) {
    const kname = (D.KUIH_BY[st.kuih] || D.KUIH_BY.lapis).name;
    const btn = (label, w, main) => `<button type="button" class="${main ? 'st-go' : ''}" data-w="${w}">${esc(label)}</button>`;
    const page = (pose, kicker, title, body, buttons, kuih) => `<div class="tc-page-head"><div><p class="tc-page-title">${T('Regangan', 'Stretch')}</p><p class="tc-page-sub">${esc(status())}</p></div></div>
      <div class="st-body"><div class="st-kuih kuih-tap${kuih ? ' pair' : ''}">${kuih || svg(pose, true)}</div><div class="st-main"><p class="st-kicker"><i></i>${kicker}</p><p class="st-name">${title}</p>${body}<div class="st-row">${buttons}</div></div>${side()}</div>`;
    if (n.type === 'unlock') {
      const k = D.KUIH_BY[n.id], r = D.RULE_BY?.[n.id];
      const pair = `<div class="nc-pair"><span class="small">${svg('cheer', false)}</span>${window.lapisSVG('wave', k?.name || '', true, n.id, outfit())}</div>`;
      const collected = D.KUIH.filter(x => !st.collect || st.codeUnlocked || D.STARTERS.includes(x.id) || (st.unlocked || {})[x.id] || x.id === st.kuih).length;
      return page('cheer', esc(L('un.tag', { n: collected })), esc(L('un.title', { k: k?.name || '' })),
        `<p class="st-cue">${r ? esc(L('un.why', { rule: L('rule.' + r.type, { n: r.n }) })) + ' ' : ''}${esc(tx(k, 'note'))}</p>`,
        btn(L('un.use', { k: k?.name || '' }), 'unlock-use', true) + btn(L('un.keep', { k: kname }), 'notice-close'), pair);
    }
    if (n.type === 'summary') {
      const [y, m, d] = n.week.split('-').map(Number), mon = new Date(y, m - 1, d, 12);
      const workDays = st.workOn ? st.workDays : [1, 2, 3, 4, 5], h = st.history || {};
      let total = 0, water = 0, atGoal = 0, worked = 0; const by = {};
      for (let i = 0; i < 7; i++) {
        const day = new Date(mon); day.setDate(mon.getDate() + i);
        const rec = h[dayKey(day)] || { total: 0, by: {} };
        total += rec.total; water += rec.water || 0;
        Object.entries(rec.by || {}).forEach(([id, c]) => { by[id] = (by[id] || 0) + c; });
        if (workDays.includes(day.getDay())) { worked++; if (rec.total >= st.goal) atGoal++; }
      }
      const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
      return page('cheer', esc(L('sum.sub')), esc(L('sum.title')),
        `<div class="nc-stats"><div><b>${total}</b><span>${esc(L('sum.stretches'))}</span></div><div><b>${atGoal}/${worked}</b><span>${esc(L('sum.goalDays'))}</span></div><div><b>${st.streak || 0}</b><span>${esc(L('sum.streak'))}</span></div><div><b>${water}</b><span>${esc(L('sum.water'))}</span></div></div>
         <p class="st-cue one">${top ? esc(L('sum.most', { ex: tx(ex(top[0]), 'name'), n: top[1] })) : esc(L('sum.none'))}</p>`,
        btn(L('btn.seeProgress'), 'summary-open', true) + btn(L('btn.close'), 'notice-close'));
    }
    if (n.type === 'wrap') {
      const rec = (st.history || {})[n.day] || { total: 0 }, met = rec.total >= st.goal;
      return page('wave', esc(L('wrap.tag', { time: fmtMin(st.workEnd) })), esc(L('wrap.title')),
        `<div class="nc-stats"><div><b>${rec.total}/${st.goal}</b><span>${esc(L('wrap.stretches'))}</span></div>${st.waterOn ? `<div><b>${rec.water || 0}</b><span>${esc(L('wrap.glasses'))}</span></div>` : ''}<div><b>${st.streak || 0}</b><span>${esc(L('wrap.streak'))}</span></div></div><p class="st-cue">${esc(met ? L('wrap.met') : L('wrap.notMet'))}</p>`,
        btn(L('wrap.bye'), 'notice-close', true));
    }
    if (n.type === 'teh') return page('tarik', esc(L('teh.tag', { time: fmtMin(930) })), esc(L('teh.title')), `<p class="st-cue">${esc(L('teh.sub'))}</p>`, btn(L('teh.btn'), 'notice-close', true));
    if (n.type === 'night') return page('yawn', esc(new Date().toLocaleTimeString(LOC(), { hour: 'numeric', minute: '2-digit', hour12: true })), esc(L('night.title')),
      `<p class="st-cue">${esc(L('night.sub'))} ${esc(n.back ? L('night.see', { when: clockAt(n.back) }) : L('night.seeTomorrow'))}</p>`, btn(L('night.ok'), 'notice-close', true) + btn(L('night.more'), 'night-more'));
    if (n.type === 'news') {
      const items = D.NEWS.filter(x => D.newer(x.v, n.from) && !D.newer(x.v, n.v)).flatMap(x => x.keys).slice(0, 4);
      return page('cheer', esc(L('news.tag', { v: n.v })), esc(L('news.title')), `<ul class="nc-news">${items.map(k => `<li>${esc(L(k))}</li>`).join('')}</ul>`, btn(L('news.ok'), 'news-close', true));
    }
    if (n.type === 'restored') return page('drowsy', 'Lapis', esc(L('restored.title')), `<p class="st-cue">${esc(L('restored.sub'))}</p>`, btn(L('news.ok'), 'notice-close', true));
    return '';
  }

  let lastKey = '';
  function render(force) {
    if (!st || root.style.display === 'none') return;
    const e = current(), active = st.mode === 'active', due = st.mode === 'due', done = st.mode === 'done';
    const notice = st.mode === 'waiting' && st.notice && st.notice.type !== 'water' ? st.notice : null;
    const key = [st.mode, st.focus, st.nextDue, st.cur, st.upNext, st.paused, st.resting, st.quiet, st.reason, st.water, st.kuih, st.today.total, st.today.water, st.switched, MS(), st.golden, outfit(), st.mood, st.eggMsg, JSON.stringify(notice)].join('|');
    if (!force && key === lastKey) return tick();
    lastKey = key;
    if (notice) { root.innerHTML = noticeHTML(notice); return; }
    const pose = active ? POSE_OF(e?.id) : done ? 'cheer' : st.water === 'ask' ? 'glass' : due ? 'wave' : st.quiet ? 'shh' : st.paused || st.resting || st.away || st.mode === 'snoozed' ? 'sleep' : moodPose();
    const kicker = st.golden && (due || active || done) ? `<p class="st-kicker gold"><i></i>${esc(L('gold.tag'))}</p>`
      : st.reason === 'focus' && due ? `<p class="st-kicker st-ai"><i style="background:#ffb35c;box-shadow:0 0 8px #ffb35c"></i>${T('Fokus siap · masa yang sesuai untuk regangan', 'Focus done · a good moment to stretch')}</p>`
      : st.reason === 'ai' && (due || active) ? `<p class="st-kicker st-ai"><i style="background:#ffb35c;box-shadow:0 0 8px #ffb35c"></i>${T('AI anda sedang bekerja · masa yang sesuai untuk regangan', 'Your AI is working · a good moment to stretch')}</p>`
      : `<p class="st-kicker"><i></i>${active ? T('Sedang meregang', 'Stretching now') : due ? T('Masa untuk regangan', 'Time to stretch') : done ? T('Siap!', 'Done!') : T('Regangan seterusnya', 'Next stretch')}</p>`;
    const steps = (MS() && e?.ms?.steps) || e?.steps || [];
    const actions = active
      ? `${e?.sides ? `<p class="st-cue ${st.switched ? 'st-switch' : ''}" id="st-sides">${st.switched ? T('Tukar sisi sekarang', 'Switch sides now') : T('Satu sisi dahulu, kemudian tukar di pertengahan', 'One side first, switch halfway')}</p>` : ''}
         <div class="st-row"><div class="st-timer"><span class="st-big" id="st-left">${mmss(st.activeEnd - Date.now())}</span><div class="st-track"><div class="st-fill" id="st-fill"></div></div></div><button type="button" class="st-go" data-a="done">${T('Siap', 'Done')}</button><button type="button" class="st-quiet" data-a="stop">${T('Berhenti', 'Stop')}</button></div>`
      : done ? `<div class="st-row"><span class="st-label" style="margin-left:0;font-size:12px;color:#9fd8b0">${T(`Syabas! ${st.today.total}/${st.goal} hari ini · seterusnya ${clockAt(st.nextDue)}`, `Nice! ${st.today.total}/${st.goal} today · next at ${clockAt(st.nextDue)}`)}</span></div>`
      : st.mode === 'snoozed' ? `<div class="st-row"><span class="st-label" style="margin-left:0;font-size:12px">${T(`Ditunda · kembali ${clockAt(st.nextDue)}`, `Snoozed · back at ${clockAt(st.nextDue)}`)}</span></div>`
      : due ? `<div class="st-row"><button type="button" class="st-go" data-a="start">${T('Mula', 'Start')} · ${esc(tx(e, 'dose'))}</button><button type="button" data-a="snooze">${T(`Tunda ${st.snooze} min`, `Snooze ${st.snooze} min`)}</button><button type="button" data-a="different">${T('Yang lain', 'Another')}</button><button type="button" class="st-quiet" data-a="skip">${T('Langkau', 'Skip')}</button></div>`
      : `<div class="st-row"><button type="button" class="st-go" data-a="now">${T('Regang sekarang', 'Stretch now')}</button>${
          st.paused ? `<button type="button" data-a="resume">${T('Sambung semula', 'Resume')}</button>` : `<span class="st-label">${T('Jeda', 'Pause')}</span><span class="st-pause">${[['m30', '30 min'], ['h1', T('1 jam', '1 hour')], ['tomorrow', T('hingga esok', 'till tomorrow')]].map(([k, l]) => `<button type="button" data-a="pause" data-v="${k}">${l}</button>`).join('')}</span>`}</div>`;
    root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${T('Regangan', 'Stretch')}</p><p class="tc-page-sub">${esc(status())}</p></div></div>
      <div class="st-body"><div class="st-kuih kuih-tap" title="${esc((D.KUIH_BY[st.kuih] || D.KUIH_BY.lapis).name)}">${svg(pose, !active)}</div>
        <div class="st-main">${kicker}<p class="st-name">${esc(tx(e, 'name'))}</p>${active ? '' : `<p class="st-cue">${esc(tx(e, 'cue'))} · ${esc(tx(e, 'dose'))}</p>`}
          ${active ? `<ol class="st-steps">${steps.map(s => `<li title="${esc(s)}">${esc(s)}</li>`).join('')}</ol>` : ''}${actions}</div>
        ${side()}
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
    if (move && box && !matchMedia('(prefers-reduced-motion: reduce)').matches) box.innerHTML = svg(move.at(performance.now() / 1000), false);
  }
  root.addEventListener('click', e => {
    const k = e.target.closest('.kuih-tap');
    if (k) { const r = k.getBoundingClientRect(); tapKuih(r.left + r.width / 2, r.top + r.height / 2, k); return; }
    const b = e.target.closest('button[data-a],button[data-w]');
    if (!b) return;
    sound('click');
    if (b.dataset.a) act(b.dataset.a, b.dataset.v);
    else if (b.dataset.w) api.lapisAct(b.dataset.w);
  });

  // ---------- the home widget ----------
  window.__rehattStretchWidget = (w, r, live) => {
    if (!st) return false;
    const e = current(), my = r.y + r.height / 2;
    const next = st.mode === 'active' ? mmss(st.activeEnd - Date.now()) : st.mode === 'due' ? T('Sekarang', 'Now') : st.paused ? T('Dijeda', 'Paused') : st.resting ? T('Rehat', 'Resting') : `${Math.max(1, Math.round((st.nextDue - Date.now()) / 60000))} min`;
    const pose = st.mode === 'active' ? POSE_OF(e?.id) : st.mode === 'due' ? 'wave' : st.water === 'ask' ? 'glass' : moodPose();
    const kRect = (x, bottom, h) => { if (live) hit.stretchKuih = { x: x - h * 0.4, y: bottom - h, width: h * 0.8, height: h }; };
    if (w.size === 'S') {
      drawKuih(pose, r.x + 28, r.y + r.height - 8, r.height - 16); kRect(r.x + 28, r.y + r.height - 8, r.height - 16);
      text(next, r.x + 54, my - 1, 15, '#fff', 700, 'left', r.width - 62);
      text(T(`${st.today.total}/${st.goal} hari ini`, `${st.today.total}/${st.goal} today`), r.x + 54, my + 14, 10.5, '#8f998d', 500, 'left', r.width - 62);
      return true;
    }
    const kh = Math.min(r.height - 14, w.size === 'L' ? 120 : 60), kx = r.x + 16 + kh * 0.42;
    drawKuih(pose, kx, r.y + r.height - 6, kh); kRect(kx, r.y + r.height - 6, kh);
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
    const bx = r.x + r.width - 28, br = 16, b = { x: bx - br, y: my - br, width: br * 2, height: br * 2 };
    if (w.size !== 'S') {
      const over = live && inside(pointer.x, pointer.y, b);
      ctx.save(); ctx.beginPath(); ctx.arc(bx, my, br, 0, Math.PI * 2); ctx.fillStyle = over ? '#ffa9c3' : '#ff8fb1'; ctx.fill();
      ctx.fillStyle = '#2a0b16'; ctx.beginPath(); ctx.moveTo(bx - 4, my - 6); ctx.lineTo(bx + 6, my); ctx.lineTo(bx - 4, my + 6); ctx.closePath(); ctx.fill(); ctx.restore();
      if (live) hit.stretchQuick = b;
    }
    return true;
  };
  // tapping the kuih on the home widget: it squishes (and 10 quick taps make it dance)
  canvas.addEventListener('click', e => {
    if (mode !== 'expanded' || window.__kopiHomeEditing?.() || !inside(e.clientX, e.clientY, hit.stretchKuih)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const r = hit.stretchKuih; tapKuih(r.x + r.width / 2, r.y + r.height / 2, null);
  }, true);

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
  canvas.addEventListener('click', e => {
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.stretchApp) && !window.__kopiHomeEditing?.()) {
      e.preventDefault(); e.stopImmediatePropagation(); setView('stretch'); setMode('expanded');
    }
  }, true);

  // ---------- the tray icon, when you chose "your kuih" (Lapis 1.8.0: a ring fills as the next stretch nears) ----------
  let trayWant = 'kopi', trayKey = '';
  api.trayIconGet?.().then(k => { if (k) trayWant = k; }).catch(() => {});
  api.onTrayWant?.(k => { trayWant = k; trayKey = ''; });
  function trayStep() {
    if (st.trayRing === false) return -1;
    if (st.mode === 'due' || st.mode === 'active') return 16;
    if (st.mode !== 'waiting' || st.paused || st.resting || st.away || st.quiet) return -1;
    return Math.floor(16 * (1 - Math.min(1, Math.max(0, (st.nextDue - Date.now()) / (st.interval * 60e3)))));
  }
  setInterval(() => {
    if (!st || trayWant !== 'kuih' || !window.lapisBodySVG) return;
    const step = trayStep(), skin = st.kuih || 'lapis', key = skin + '|' + step;
    if (key === trayKey) return;
    trayKey = key;
    const img = new Image(), ring = step >= 0;
    img.onload = () => {
      const list = [[16, 1], [24, 1.5], [32, 2], [48, 3]].map(([px, scale]) => {
        const c = document.createElement('canvas'); c.width = c.height = px;
        const g = c.getContext('2d'), lw = Math.max(2, Math.round(px * 0.13)), inner = ring ? px - 2 * lw - 1 : px;
        const r = Math.min(inner / 92, inner / 98), w = 92 * r, h = 98 * r;
        g.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
        if (ring) {
          const R = px / 2 - lw / 2;
          g.lineWidth = lw; g.strokeStyle = 'rgba(140,140,140,.5)'; g.beginPath(); g.arc(px / 2, px / 2, R, 0, Math.PI * 2); g.stroke();
          if (step > 0) { g.strokeStyle = '#E0336F'; g.beginPath(); g.arc(px / 2, px / 2, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * step / 16); g.stroke(); }
        }
        return { scale, url: c.toDataURL('image/png') };
      });
      api.trayImages?.('kuih', list);
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.lapisBodySVG(skin));
  }, 2000);

  // ---------- one language for Rehatt, Lapis and Teh Tarik Meter ----------
  let sentLang = '';
  setInterval(() => { const l = window.__kopiPrefs?.().lang; if (l && l !== sentLang) { sentLang = l; api.setLang?.(l); } }, 1000);
  api.onLang?.(l => {
    if (!['en', 'ms'].includes(l)) return;
    sentLang = l;
    const prefs = window.__kopiPrefs?.(); if (prefs) prefs.lang = l;
    try { const saved = JSON.parse(localStorage.getItem('kopi:prefs') || '{}'); saved.lang = l; localStorage.setItem('kopi:prefs', JSON.stringify(saved)); } catch {}
  });
})();
