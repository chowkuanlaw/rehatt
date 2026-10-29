'use strict';
// Island extras (renderer): file tray, quick mirror, volume bar, battery warnings, weather + calendar
// on the home screen, and the album colour used by the Spotify screen and sound wave.
(function islandExtras() {
  const api = window.kopi;
  if (!api?.trayGet) return;
  const prefs = () => window.__kopiPrefs?.() || {};
  const T = (ms, en) => prefs().lang === 'ms' ? ms : en, LOCALE = () => prefs().lang === 'ms' ? 'ms-MY' : 'en-GB';
  const say = (title, body) => window.__kopiSay?.(title, body);
  const badge = id => window.dispatchEvent(new CustomEvent('kopi:badge', { detail: id }));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
  const VIEWS = ['tray', 'mirror'];
  // (page height and layout come from pages-ui.js)

  // ---------- DOM panel for the tray and mirror views (same place as the Claude Code screen) ----------
  const root = document.createElement('section'); root.id = 'kopi-extras'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#kopi-extras{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 Arial,sans-serif;pointer-events:auto}
#kopi-extras *{box-sizing:border-box}
#kopi-extras button{border:1px solid #394333;border-radius:12px;padding:7px 11px;color:#eef3e8;background:#252c22;font:600 11px Arial,sans-serif;cursor:pointer}
#kopi-extras button:hover{background:#343e2d}
#kopi-extras .ex-hint{color:#aab4a5;font-size:11px}
#kopi-extras .ex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;max-height:170px;padding:5px 3px 3px;margin:-5px -3px 0;overflow:auto;scrollbar-width:thin;border-radius:16px;transition:max-height .2s}
#kopi-extras.dragging .ex-grid{max-height:78px}
#kopi-extras .ex-file{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px 8px;border-radius:14px;background:#151a13;border:1px solid #262e23;cursor:grab;text-align:center;animation:ex-pop .35s cubic-bezier(.2,1.6,.4,1)}
#kopi-extras .ex-file:hover{border-color:#c6e994;transform:translateY(-2px)}
#kopi-extras .ex-file img{width:32px;height:32px;pointer-events:none}
#kopi-extras .ex-file span{font-size:10px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#kopi-extras .ex-x{position:absolute;top:2px;right:2px;padding:0 6px;border:0;background:transparent;color:#8f998d;font-size:13px}
#kopi-extras .ex-drop{border:2px dashed #3e4938;border-radius:16px;height:78px;display:flex;align-items:center;justify-content:center;gap:8px;color:#aab4a5;font-size:12px;transition:background .2s,border-color .2s,transform .2s}
#kopi-extras .ex-drop .on{display:none}
#kopi-extras.dragging .ex-drop{border-color:#c6e994;background:#1a2216;color:#e8f5d8;transform:scale(1.02)}
#kopi-extras.dragging .ex-drop .on{display:inline}
#kopi-extras.dragging .ex-drop .off{display:none}
#kopi-extras .ex-empty{height:150px;border:1.5px dashed rgba(255,255,255,.12);background:radial-gradient(circle at 50% 35%,rgba(198,233,148,.06),transparent 70%)}
#kopi-extras .ex-empty span{flex-direction:column;align-items:center;gap:6px;text-align:center}
#kopi-extras .ex-empty .off{display:flex}
#kopi-extras.dragging .ex-empty .on{display:flex}
#kopi-extras .ex-empty b{color:#f2f5ed;font-size:13px;font-weight:600}
#kopi-extras .ex-empty small{color:#8f998d;font-size:11px}
#kopi-extras .ex-empty svg{animation:ex-float 3s ease-in-out infinite}
@keyframes ex-float{50%{transform:translateY(-4px)}}
#kopi-extras .ex-drop.extra{display:none;height:56px;margin-bottom:8px}
#kopi-extras.dragging .ex-drop.extra{display:flex}
@keyframes ex-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}#kopi-extras video{width:100%;height:176px;object-fit:cover;border-radius:16px;transform:scaleX(-1);background:#0d100c}`;
  document.head.appendChild(style);

  let trayFiles = [], trayError = '';
  async function loadTray() { const r = await api.trayGet(); if (r.ok) trayFiles = r.files; render(); }
  window.__kopiTrayReload = loadTray;
  window.__kopiTrayCount = () => trayFiles.length;
  function render() {
    if (currentView === 'tray') {
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">Tray</p><p class="tc-page-sub">${trayFiles.length ? 'Drag a file out, or click to open it' : 'Drop files on the island to keep them for a bit'}</p></div></div>${
        trayFiles.length ? `<div class="ex-drop extra"><span class="on">🧺 Let go, I’ll catch it!</span></div><div class="ex-grid">${trayFiles.map((f, i) => `<div class="ex-file" draggable="true" data-i="${i}" title="${esc(f.path)}">${f.icon ? `<img src="${f.icon}" alt="">` : '📄'}<span>${esc(f.name)}</span><button type="button" class="ex-x" data-x="${i}" aria-label="${T(`Keluarkan ${esc(f.name)} dari dulang`, `Take ${esc(f.name)} out of the tray`)}">×</button></div>`).join('')}</div>`
          : '<div class="ex-drop ex-empty"><span class="off"><svg width="34" height="34" viewBox="0 0 24 24" fill="#000" stroke="#e8eee4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 7 5h10l3 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5" fill="none"/></svg><b>Your tray is empty</b><small>Drag a file onto Kopi Island to keep it for a bit</small></span><span class="on"><svg width="34" height="34" viewBox="0 0 24 24" fill="#000" stroke="#e8eee4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13 7 5h10l3 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5" fill="none"/></svg><b>Let go, I’ll catch it!</b></span></div>'
      }${trayError ? `<p class="ex-hint" style="color:#ffaba3">${esc(trayError)}</p>` : ''}`;
      for (const el of root.querySelectorAll('.ex-file')) {
        const f = trayFiles[Number(el.dataset.i)];
        el.addEventListener('dragstart', e => { e.preventDefault(); api.trayDrag(f.path); });
        el.addEventListener('click', async e => { if (e.target.closest('.ex-x')) return; const r = await api.trayOpen(f.path); trayError = r.ok ? '' : r.error; render(); });
      }
      for (const x of root.querySelectorAll('[data-x]')) x.addEventListener('click', async () => {
        const r = await api.trayRemove(trayFiles[Number(x.dataset.x)].path); if (r.ok) trayFiles = r.files; render();
      });
    } else if (currentView === 'mirror') {
      if (!root.querySelector('video')) {
        root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">Mirror</p><p class="tc-page-sub">A quick check before your video call · the camera stops when you leave</p></div></div><video autoplay muted playsinline></video><p class="ex-hint" id="ex-cam"></p>`;
        startCamera();
      }
    } else root.innerHTML = '';
  }

  // ---------- quick mirror ----------
  let stream = null;
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false });
      if (currentView !== 'mirror') return stopCamera();
      const video = root.querySelector('video'); if (video) video.srcObject = stream;
      badge('mirror');
    } catch { const p = root.querySelector('#ex-cam'); if (p) p.textContent = T('Tiada kamera dijumpai, atau Windows tidak memberi akses (Tetapan → Privasi → Kamera).', 'No camera found, or Windows gives no access (Settings → Privacy → Camera).'); }
  }
  function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; }

  // ---------- views in the canvas island ----------
  // ---------- the basket: while you drag a file over the island, Kopi Island walks under it with a basket ----------
  const basket = { on: false, seen: 0, x: null, y: null, vx: 0, caughtAt: -1e9, mouseX: null };
  window.__kopiBasket = () => {
    const t = performance.now(), catching = t - basket.caughtAt < 700;
    if (basket.on && t - basket.seen > 180) basket.on = false; // the drag left the island or ended
    return { show: basket.on || catching, wobble: catching ? Math.sin((t - basket.caughtAt) / 45) * (1 - (t - basket.caughtAt) / 700) : 0, vx: basket.vx };
  };
  const baseExpanded = drawExpanded;
  // Full-island drop zone while dragging: slides in, and shrinks away after the catch.
  let zoneIn = -1e9, zoneOut = -1e9, wasOn = false;
  function dropZone(t) {
    if (basket.on && !wasOn) zoneIn = t;
    if (!basket.on && wasOn) zoneOut = t;
    wasOn = basket.on;
    const k = basket.on ? Math.min(1, (t - zoneIn) / 260) : Math.max(0, 1 - (t - zoneOut) / 300);
    if (k <= 0) return false;
    const e = 1 - Math.pow(1 - k, 3), b = islandBounds, pad = 12;
    const w = (b.width - pad * 2) * (0.94 + 0.06 * e), h = (b.height - pad * 2) * (0.94 + 0.06 * e);
    const x = b.x + (b.width - w) / 2, y = (b.height - h) / 2;
    ctx.save(); ctx.globalAlpha = e;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 26); ctx.fillStyle = 'rgba(198,233,148,.07)'; ctx.fill();
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t / 30; ctx.lineWidth = 2; ctx.strokeStyle = '#c6e994'; ctx.shadowColor = '#c6e994'; ctx.shadowBlur = 12; ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    window.__kopiIcon?.('tray', b.x + b.width / 2, y + 48, 30, '#c6e994');
    text('Let go, I\'ll catch it!', b.x + b.width / 2, y + 92, 18, '#ffffff', 700, 'center');
    text('The file goes into your tray', b.x + b.width / 2, y + 112, 11, '#9aa596', 400, 'center');
    ctx.restore();
    return true;
  }
  drawExpanded = function (alpha) {
    if (!VIEWS.includes(currentView)) return baseExpanded(alpha);
    const PAGE = window.__kopiPage, area = contentRect(), t = performance.now();
    if (basket.on && t - basket.seen > 180) basket.on = false; // no more dragover: the drag left or ended
    const zone = currentView === 'tray' && dropZone(t);
    if (!zone || !basket.on) drawHeader(alpha * (basket.on ? 0 : 1));
    const home = { x: area.x + PAGE.ghost.x, y: area.y + PAGE.ghost.y };
    const sinceCatch = t - basket.caughtAt, holdBasket = currentView === 'tray' && (basket.on || sinceCatch < 1100);
    if (currentView === 'tray' && incoming && sinceCatch < INCOMING_MS) drawIncoming(area, sinceCatch);
    if (!holdBasket && currentView === 'tray') { basket.x = null; return; } // Kopi Island only shows while catching
    // Walks in from below, follows the mouse along the bottom while you drag, catches, then walks out again.
    const target = holdBasket
      ? { x: Math.min(area.x + area.width - 60, Math.max(area.x + 60, basket.mouseX ?? pointer.x)), y: !basket.on && sinceCatch > 650 ? islandBounds.height + 60 : islandBounds.height - 70 }
      : home;
    if (basket.x == null) { basket.x = target.x; basket.y = islandBounds.height + 40; } // walks in from below
    const nx = basket.x + (target.x - basket.x) * 0.18, ny = basket.y + (target.y - basket.y) * 0.18;
    basket.vx = nx - basket.x; basket.x = nx; basket.y = ny;
    PAGE.drawGhost(area, { x: basket.x, y: basket.y });
  };
  // After a drop: a card in the middle. The file drops in with a bounce, a bar fills up, then a check pops.
  const INCOMING_MS = 1500;
  let incoming = null;
  window.__kopiDragging = () => basket.on;
  window.__kopiTestDrop = names => { incoming = { names, chimed: false }; basket.caughtAt = performance.now(); }; // for test mode / videos
  function drawIncoming(area, k) {
    const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3), back = t => { t = Math.max(0, Math.min(1, t)); return 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2); };
    const out = Math.max(0, Math.min(1, (INCOMING_MS - k) / 220)), appear = back(k / 260), W = 300, H = 92;
    const cx = area.x + area.width / 2, cy = area.y + area.height / 2 - 18, x = cx - W / 2, y = cy - H / 2;
    ctx.save(); ctx.globalAlpha = out; ctx.translate(cx, cy); ctx.scale(0.85 + 0.15 * appear, 0.85 + 0.15 * appear); ctx.translate(-cx, -cy);
    ctx.beginPath(); ctx.roundRect(x, y, W, H, 20); ctx.fillStyle = '#16181a'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(198,233,148,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    // the file: drops from above and bounces
    const drop = ease(k / 380), bounce = k > 380 && k < 640 ? Math.sin((k - 380) / 260 * Math.PI) * 6 : 0;
    const fx = x + 26, fy = y + 18 - (1 - drop) * 70 - bounce, fw = 40, fh = 52;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    ctx.fillStyle = '#f4f7f2'; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + fw - 12, fy); ctx.lineTo(fx + fw, fy + 12); ctx.lineTo(fx + fw, fy + fh); ctx.lineTo(fx, fy + fh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9d4cf'; ctx.beginPath(); ctx.moveTo(fx + fw - 12, fy); ctx.lineTo(fx + fw - 12, fy + 12); ctx.lineTo(fx + fw, fy + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9fb0a9'; for (let i = 0; i < 3; i++) ctx.fillRect(fx + 8, fy + 22 + i * 8, fw - 16 - (i === 2 ? 8 : 0), 3);
    ctx.restore();
    // name + bar + check
    const names = incoming.names, label = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
    text(label, x + 84, y + 34, 13, '#f4f7f2', 700, 'left', W - 104);
    const fill = ease((k - 300) / 650), bx = x + 84, by = y + 50, bw = W - 108;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#c6e994'); g.addColorStop(1, '#7fd8ff');
    if (fill > 0) { ctx.beginPath(); ctx.roundRect(bx, by, Math.max(6, bw * fill), 6, 3); ctx.fillStyle = g; ctx.fill(); }
    const done = k > 980;
    if (done) {
      const p = back((k - 980) / 220); ctx.save(); ctx.translate(bx + 10, by + 26); ctx.scale(p, p);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = '#c6e994'; ctx.fill();
      ctx.strokeStyle = '#10180c'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-1, 3); ctx.lineTo(4.5, -3.5); ctx.stroke(); ctx.restore();
      text('In your tray', bx + 26, by + 30, 11.5, '#c6e994', 700);
      if (!incoming.chimed) { incoming.chimed = true; tone(880, 1320, 0.09, 0.016); }
    } else text(names.length > 1 ? T(`${names.length} fail…`, `${names.length} files…`) : T('Sedang bekerja…', 'Working…'), bx, by + 30, 11, '#8f998d', 600);
    ctx.restore();
  }
  let shownView = null;
  function position() {
    const show = VIEWS.includes(currentView) && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    // While a file is dragged over the island, the whole island is the drop zone (canvas), so the page hides.
    const display = show && !(currentView === 'tray' && (basket.on || (incoming && performance.now() - basket.caughtAt < INCOMING_MS - 120))) ? 'block' : 'none';
    if (root.style.display !== display) root.style.display = display; // only write when it changes (runs every frame)
    if (show) window.__kopiPage.place(root, contentRect());
    const now = show ? currentView : null;
    if (now !== shownView) { shownView = now; if (now !== 'mirror') stopCamera(); if (now === 'tray') loadTray(); else render(); }
    requestAnimationFrame(position);
  }
  requestAnimationFrame(position);
  canvas.addEventListener('click', event => {
    for (const [key, view] of [['trayApp', 'tray'], ['mirrorApp', 'mirror'], ['settingsApp', 'settings']]) {
      if (inside(event.clientX, event.clientY, hit[key])) { event.preventDefault(); event.stopImmediatePropagation(); setView(view); return; }
    }
  }, true);

  // ---------- drop files on the island ----------
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; root.classList.add('dragging');
    if (!basket.on) window.__kopiFeel?.('surprised', 500);
    basket.on = true; basket.seen = performance.now(); basket.mouseX = e.clientX;
    if (currentView !== 'tray' || mode !== 'expanded') setView('tray');
  });
  window.addEventListener('dragleave', () => root.classList.remove('dragging'));
  window.addEventListener('drop', async e => {
    root.classList.remove('dragging');
    if (!hasFiles(e)) return;
    e.preventDefault();
    basket.on = false; basket.caughtAt = performance.now(); // catch!
    const paths = [...e.dataTransfer.files].map(f => api.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    incoming = { names: paths.map(p => p.split(/[\\/]/).pop()), chimed: false };
    const r = await api.trayAdd(paths); if (r.ok) { trayFiles = r.files; trayError = ''; } else trayError = r.error;
    render(); window.__kopiCheer?.(); badge('tray:' + trayFiles.length);
  });

  // ---------- messages in the medium island (volume, battery) ----------
  let hud = null;
  window.__kopiFlash = (text, ms) => flash(text, ms); // short message in the small island (also used by swipe)
  function flash(text, ms = 1600) {
    // Right after start Kopi is still saying hi in the middle of the island: a message then ran
    // straight through him (the battery check fires at start). Wait until the hello is over.
    if (!introFinished || window.__kopiHelloBusy?.()) { clearTimeout(flash.later); flash.later = setTimeout(() => flash(text, ms), 400); return; }
    hud = { text, until: performance.now() + ms };
    if (mode === 'rest' && introFinished) setMode('compact', false);
    clearTimeout(flash.timer); flash.timer = setTimeout(() => { hud = null; window.__kopiSettleSize?.(); }, ms + 50);
  }
  const baseMessage = window.__kopiCompactMessage;
  window.__kopiCompactMessage = () => (hud && performance.now() < hud.until ? hud.text : '') || baseMessage?.() || '';

  // Volume bar: "🔊 ▮▮▮▮▮▮▯▯▯▯ 62%"
  let firstVolume = true;
  api.onVolume(({ level, muted }) => {
    if (firstVolume) { firstVolume = false; return; } // the first report is just the starting value
    if (prefs().volumeHud === false) return;
    const blocks = Math.round(level / 10);
    flash(muted ? T('🔇 Bunyi dimatikan', '🔇 Sound off') : `${level > 60 ? '🔊' : level > 20 ? '🔉' : '🔈'} ${'▮'.repeat(blocks)}${'▯'.repeat(10 - blocks)} ${level}%`, 1400);
  });

  // Battery of this laptop
  const warned = new Set();
  navigator.getBattery?.().then(battery => {
    const check = () => {
      if (prefs().batteryWarn === false || battery.charging) { if (battery.charging) warned.clear(); return; }
      const pct = Math.round(battery.level * 100);
      for (const at of [20, 10]) {
        if (pct <= at && !warned.has(at)) {
          warned.add(at); flash(T(`🪫 Bateri tinggal ${pct}%. Sambungkan pengecas anda!`, `🪫 ${pct}% battery left. Plug in your charger!`), 4000);
          say(T(`Bateri hampir habis: ${pct}%`, `Battery almost empty: ${pct}%`), T('Sambungkan pengecas anda.', 'Plug in your charger.')); window.__kopiFeel?.('surprised', 1500);
        }
      }
    };
    battery.addEventListener('levelchange', check); battery.addEventListener('chargingchange', check); check();
  }).catch(() => {});

  // Bluetooth devices (headphones, mouse): warn once a day when one is low
  api.onBluetooth(({ devices }) => {
    window.__kopiBluetooth = devices;
    if (prefs().batteryWarn === false) return;
    for (const d of devices) {
      const key = 'kopi:bt-warned:' + d.name + ':' + new Date().toDateString();
      if (d.battery <= 20 && !localStorage.getItem(key)) {
        localStorage.setItem(key, '1'); flash(T(`🎧 ${d.name}: tinggal ${d.battery}%`, `🎧 ${d.name}: ${d.battery}% left`), 4000); say(T(`${d.name} hampir habis`, `${d.name} is almost empty`), T(`Bateri tinggal ${d.battery}%.`, `${d.battery}% battery left.`));
      }
    }
  });

  // ---------- weather + calendar line on the home screen ----------
  let weather = null, nextEvent = null;
  const ICONS = c => c === 0 ? '☀' : c <= 3 ? '⛅' : c <= 48 ? '🌫' : c <= 67 ? '🌧' : c <= 77 ? '❄' : c <= 82 ? '🌦' : '⛈';
  async function refreshInfo() {
    try { const w = await api.weatherNow(); weather = w.ok ? w.weather : null; } catch {}
    try { const c = await api.calendarNext(); nextEvent = c.ok ? c.next : null; } catch {}
  }
  refreshInfo(); setInterval(refreshInfo, 10 * 60000);
  window.__kopiRefreshInfo = refreshInfo;
  window.__kopiHomeInfo = () => {
    const parts = [];
    if (weather) parts.push(`${weather.code === 0 && !weather.day ? '🌙' : ICONS(weather.code)} ${weather.temp}° ${weather.place}`);
    if (nextEvent) {
      const start = new Date(nextEvent.start), mins = Math.round((nextEvent.start - Date.now()) / 60000);
      const when = nextEvent.allDay ? T('hari ini', 'today') : mins <= 0 ? T('sekarang', 'now') : mins < 60 ? T(`dalam ${mins} min`, `in ${mins} min`) : start.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' });
      parts.push(`📅 ${when}: ${nextEvent.title || T('Temu janji', 'Event')}`);
      if (mins === 10 && !warned.has('cal' + nextEvent.start)) { warned.add('cal' + nextEvent.start); flash(T(`📅 Dalam 10 min: ${nextEvent.title}`, `📅 In 10 min: ${nextEvent.title}`), 5000); say(T('Dalam 10 minit', 'In 10 minutes'), nextEvent.title); }
    }
    return parts.join('  ·  ');
  };

  // ---------- real sound wave: listen to what the PC plays while music is on ----------
  const BARS = 18;
  const audio = { stream: null, ctx: null, analyser: null, data: null, levels: new Array(BARS).fill(0), starting: false, offSince: 0 };
  async function startListening() {
    if (audio.stream || audio.starting) return;
    audio.starting = true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 16, height: 16, frameRate: 1 } });
      stream.getVideoTracks().forEach(t => t.stop()); // only the sound is used
      if (!stream.getAudioTracks().length) throw new Error('no audio');
      const ctx = new (window.__kopiRealAudio || AudioContext)();
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.6; analyser.minDecibels = -80; // very soft hiss counts as silence
      ctx.createMediaStreamSource(stream).connect(analyser); // not connected to the speakers: no echo
      Object.assign(audio, { stream, ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) });
    } catch { audio.failed = true; }
    audio.starting = false;
  }
  function stopListening() {
    audio.stream?.getTracks().forEach(t => t.stop()); audio.ctx?.close().catch(() => {});
    Object.assign(audio, { stream: null, ctx: null, analyser: null }); audio.levels.fill(0); window.__kopiHearing = false;
  }
  setInterval(() => {
    const playing = Boolean(spotifyConnected && spotifyState.is_playing);
    if (playing) { audio.offSince = 0; if (!audio.failed) startListening(); }
    else if (audio.stream) { audio.offSince ||= performance.now(); if (performance.now() - audio.offSince > 4000) stopListening(); }
    window.__kopiAudioLevels?.(); // keeps __kopiHearing fresh when no wave is on screen
  }, 1000);
  // Levels 0..1 per bar, or null when not listening.
  // Bars cover 60 Hz – 12 kHz on a log scale (like a real equalizer), and every bar has its own
  // auto-range: bass is much louder than treble, so without this only the first bars would move.
  const peaks = new Array(BARS).fill(0.08);
  let loudPeak = 0.1;
  window.__kopiAudioLevels = () => {
    if (!audio.analyser) return null;
    audio.analyser.getByteFrequencyData(audio.data);
    const n = audio.data.length, hzPerBin = audio.ctx.sampleRate / 2 / n;
    const raw = [];
    for (let i = 0; i < BARS; i++) {
      const f0 = 60 * Math.pow(200, i / BARS), f1 = 60 * Math.pow(200, (i + 1) / BARS);
      const from = Math.max(1, Math.floor(f0 / hzPerBin)), to = Math.max(from + 1, Math.ceil(f1 / hzPerBin));
      let sum = 0; for (let j = from; j < to && j < n; j++) sum += audio.data[j];
      raw.push(sum / (to - from) / 255);
    }
    const loud = raw.reduce((a, b) => a + b, 0) / BARS;
    // Real silence on this PC (e.g. the music plays on your phone): the bars settle flat. Without this the
    // auto-range below would blow up tiny background hiss into a dancing wave.
    window.__kopiHearing = loud > 0.05;
    if (!window.__kopiHearing) { for (let i = 0; i < BARS; i++) audio.levels[i] *= 0.8; return audio.levels; }
    loudPeak = Math.max(loud, loudPeak * 0.997, 0.12);
    const overall = Math.min(1, loud / loudPeak * 1.15); // quiet parts → lower wave
    for (let i = 0; i < BARS; i++) {
      peaks[i] = Math.max(raw[i], peaks[i] * 0.996, 0.15);
      const v = Math.pow(raw[i] / peaks[i], 1.6) * overall; // stretch so beats stand out
      audio.levels[i] += (v - audio.levels[i]) * (v > audio.levels[i] ? 0.55 : 0.2); // quick up, smooth down
    }
    return audio.levels;
  };

  // ---------- album colour (soft, readable version of the cover's main colour) ----------
  let colourFor = '';
  setInterval(() => {
    const url = spotifyState.track?.image_url || '';
    if (url === colourFor) return; colourFor = url;
    if (!url) { window.__kopiAlbumColour = null; return; }
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 12; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 12, 12);
        const d = x.getImageData(0, 0, 12, 12).data; let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { const sat = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); const w = 1 + sat / 16; r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w; }
        [r, g, b] = [r / n, g / n, b / n];
        const boost = 200 / Math.max(60, Math.max(r, g, b)); // bright enough on black
        window.__kopiAlbumColour = `rgb(${[r, g, b].map(v => Math.min(255, Math.round(v * boost))).join(',')})`;
      } catch { window.__kopiAlbumColour = null; }
    };
    img.src = url;
  }, 1000);
})();
