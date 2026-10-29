'use strict';
// Your Claude usage as a glass of teh tarik (from Teh Tarik Meter). meter-main.cjs reads the numbers; here:
//   - the Usage page: the glass for your 5-hour window, the week, per-model limits, where the numbers come from
//   - a home widget with a small glass, and an alert in the small island at 80% and 95%
// The glass shows what is LEFT: full at the start of a window, empty when you hit the limit.
(function meterIsland() {
  const api = window.kopi;
  if (!api?.meterGet) return;
  const MS = () => window.__kopiPrefs?.().lang === 'ms', T = (ms, en) => (MS() ? ms : en);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
  const LOC = () => (MS() ? 'ms-MY' : 'en-GB');
  let st = null;
  const left = w => (w && w.pct != null ? Math.max(0, Math.min(100, Math.round(100 - w.pct))) : null);
  const colour = l => (l == null ? '#8f998d' : l <= 10 ? '#ff5c5c' : l <= 30 ? '#ffb35c' : '#c98a4b');
  function resetLabel(ts) {
    if (!ts) return '';
    const ms = ts - Date.now(); if (ms <= 0) return T('diisi semula sekarang', 'refilled now');
    const h = Math.floor(ms / 3600e3), m = Math.round((ms % 3600e3) / 60000);
    if (ms < 24 * 3600e3) return T(`penuh semula dalam ${h ? h + ' j ' : ''}${m} min`, `full again in ${h ? h + ' h ' : ''}${m} min`);
    return T('penuh semula ', 'full again ') + new Date(ts).toLocaleDateString(LOC(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function agoLabel(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    return s < 60 ? T('baru sahaja', 'just now') : s < 3600 ? T(`${Math.round(s / 60)} min lalu`, `${Math.round(s / 60)} min ago`) : new Date(ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
  }
  function update(next) {
    if (!next?.ok) return;
    const was = st?.alert; st = next;
    if (st.alert && JSON.stringify(st.alert) !== JSON.stringify(was)) {
      window.__kopiChime?.('warn');
      // the island director shows it: a nudge when small, a banner when open (5 s, or 8 s at 95%)
      const w = st.alert.kind === 'weekly' ? st.weekly : st.session, high = st.alert.pct >= 95;
      const refill = w?.resetsAt ? ' · ' + T('penuh semula ', 'refills ') + new Date(w.resetsAt).toLocaleTimeString(LOC(), w.resetsAt - Date.now() > 86400e3 ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }) : '';
      window.__rehattDirector?.flash({ key: 'usage:' + st.alert.kind + ':' + st.alert.pct, tone: high ? 'err' : 'us', ms: high ? 8000 : 5000, view: 'meter',
        text: T(`${st.alert.pct}% had ${st.alert.kind === 'weekly' ? 'mingguan' : '5 jam'} digunakan`, `${st.alert.pct}% of ${st.alert.kind === 'weekly' ? 'weekly' : '5-hour'} limit used`) + refill });
    }
    render(true);
  }
  api.onMeter(update);
  // 95% or more of the 5-hour window used: a small dot stays on Kopi until it refills (director-ui.js draws it)
  window.__rehattMeterLow = () => { const l = left(st?.session); return l != null && l <= 5; };
  api.meterGet().then(update).catch(() => {});
  const act = action => api.meterAction(action).then(update).catch(() => {});
  setInterval(() => api.meterGet().then(update).catch(() => {}), 30000); // reset times move on

  // what the ring and the Claude card use (the newest reading of the two sources)
  window.__rehattMeter = {
    status: () => { const l = left(st?.session); return l == null ? '' : T(`${l}% lagi dalam gelas`, `${l}% left in the glass`); },
    usage: () => st?.hasData ? {
      fiveHour: st.session ? { used: Math.round(st.session.pct), resetsAt: st.session.resetsAt ? Math.round(st.session.resetsAt / 1000) : null } : null,
      sevenDay: st.weekly ? { used: Math.round(st.weekly.pct), resetsAt: st.weekly.resetsAt ? Math.round(st.weekly.resetsAt / 1000) : null } : null } : null
  };

  // ---------- the glass (canvas): a tall glass of teh tarik with a face, filled to what is left ----------
  function drawGlass(cx, bottom, h, l, face = true, c = ctx) {
    const w = h * 0.68, top = bottom - h, inset = w * 0.1, now = performance.now();
    const xl = y => cx - w / 2 + inset * (y - top) / h, xr = y => cx + w / 2 - inset * (y - top) / h;
    c.save();
    c.beginPath(); c.moveTo(xl(top), top); c.lineTo(xr(top), top); c.lineTo(xr(bottom), bottom); c.lineTo(xl(bottom), bottom); c.closePath();
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); c.save(); c.clip();
    if (l != null && l > 0) {
      const level = bottom - (h - 4) * l / 100, wave = Math.sin(now / 600) * 1.2;
      const g = c.createLinearGradient(0, level, 0, bottom); g.addColorStop(0, '#d9a066'); g.addColorStop(1, '#a8682f');
      c.fillStyle = g; c.fillRect(cx - w, level + wave, w * 2, bottom - level);
      c.fillStyle = '#f6e6cc'; c.fillRect(cx - w, level + wave - 1, w * 2, Math.min(h * 0.09, bottom - level)); // the foam on top
    }
    c.restore();
    c.beginPath(); c.moveTo(xl(top), top); c.lineTo(xr(top), top); c.lineTo(xr(bottom), bottom); c.lineTo(xl(bottom), bottom); c.closePath();
    c.lineWidth = Math.max(1.4, h / 40); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineJoin = 'round'; c.stroke();
    if (face) { // dot eyes and a mouth that worries as the glass empties
      const ey = top + h * 0.56, ex = w * 0.16, r = Math.max(1.4, h / 30), ink = '#2a1a10';
      c.fillStyle = ink; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * ex, ey, r, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = ink; c.lineWidth = Math.max(1.2, h / 45); c.lineCap = 'round'; c.beginPath();
      const my = ey + h * 0.1, mw = w * 0.12, curve = l == null ? 0 : l > 50 ? 1 : l > 20 ? 0.2 : -0.8;
      c.moveTo(cx - mw, my); c.quadraticCurveTo(cx, my + curve * h * 0.07, cx + mw, my); c.stroke();
    }
    c.restore();
  }
  window.__rehattDrawGlass = drawGlass;

  // ---------- the home widget ----------
  window.__rehattMeterWidget = (w, r) => {
    const s = left(st?.session), k = left(st?.weekly), my = r.y + r.height / 2;
    if (w.size === 'S') {
      drawGlass(r.x + 26, r.y + r.height - 10, r.height - 22, s);
      text(s == null ? T('Penggunaan', 'Usage') : `${s}%`, r.x + 50, my - 1, s == null ? 13 : 15, '#fff', 700, 'left', r.width - 58);
      text(s == null ? T('Menunggu Claude Code', 'Waiting for Claude Code') : T('lagi · 5 jam', 'left · 5 hr'), r.x + 50, my + 14, 10.5, '#8f998d', 500, 'left', r.width - 58);
      return true;
    }
    const gh = Math.min(r.height - 18, w.size === 'L' ? 112 : 54), gx = r.x + 16 + gh * 0.34;
    drawGlass(gx, r.y + r.height - 9, gh, s);
    const tx = gx + gh * 0.34 + 14, tw = r.x + r.width - tx - 14;
    if (!st?.hasData) {
      text(T('Penggunaan Claude', 'Claude usage'), tx, my - 4, 13, '#fff', 700, 'left', tw);
      text(T('Guna Claude Code, atau log masuk dalam Tetapan', 'Use Claude Code, or sign in in Settings'), tx, my + 12, 10.5, '#8f998d', 500, 'left', tw);
      return true;
    }
    const bar = (y, label, l, sub) => {
      text(label, tx, y, 11, '#c9d0c6', 600, 'left', tw * 0.6); text(l == null ? '—' : `${l}%`, tx + tw, y, 11, colour(l), 700, 'right');
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.roundRect(tx, y + 5, tw, 4, 2); ctx.fill();
      if (l != null) { ctx.fillStyle = colour(l); ctx.beginPath(); ctx.roundRect(tx, y + 5, Math.max(4, tw * l / 100), 4, 2); ctx.fill(); }
      ctx.restore(); if (sub) text(sub, tx, y + 21, 10, '#7d847f', 500, 'left', tw);
    };
    if (w.size === 'W') { bar(my - 8, T('5 jam lagi', '5 hours left'), s); bar(my + 16, T('Minggu ini', 'This week'), k); return true; }
    text(T('Gelas anda', 'Your glass'), tx, r.y + 30, 15, '#fff', 700, 'left', tw);
    bar(r.y + 56, T('5 jam lagi', '5 hours left'), s, resetLabel(st.session?.resetsAt));
    bar(r.y + 98, T('Minggu ini', 'This week'), k, resetLabel(st.weekly?.resetsAt));
    return true;
  };

  // ---------- the Usage page ----------
  const root = document.createElement('section'); root.id = 'rehatt-meter'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#rehatt-meter{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto;user-select:none}
#rehatt-meter *{box-sizing:border-box}
#rehatt-meter .mt-body{display:flex;gap:16px;height:calc(100% - 60px);min-height:0}
#rehatt-meter .mt-glass{flex:none;width:150px;position:relative}
#rehatt-meter canvas{width:150px;height:100%;display:block}
#rehatt-meter .mt-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:9px}
#rehatt-meter .mt-big{margin:0;font:700 34px/1 "Segoe UI",sans-serif;letter-spacing:-1px}
#rehatt-meter .mt-big small{font-size:13px;font-weight:600;color:#9aa596;letter-spacing:0;margin-left:6px}
#rehatt-meter .mt-sub{margin:0;color:#9aa596;font-size:11.5px}
#rehatt-meter .mt-bar{display:flex;flex-direction:column;gap:4px}
#rehatt-meter .mt-bar div{display:flex;justify-content:space-between;font-size:11.5px;color:#c9d0c6}
#rehatt-meter .mt-bar b{color:#fff}
#rehatt-meter .mt-track{height:6px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden}
#rehatt-meter .mt-track i{display:block;height:100%;border-radius:4px}
#rehatt-meter .mt-side{flex:none;width:210px;display:flex;flex-direction:column;gap:8px}
#rehatt-meter .mt-card{border-radius:16px;background:linear-gradient(180deg,#141714,#0d0f0d);border:1px solid rgba(255,255,255,.07);padding:11px 13px;display:flex;flex-direction:column;gap:6px;font-size:11.5px;color:#c9d0c6}
#rehatt-meter .mt-card small{color:#8f998d;font-size:10.5px}
#rehatt-meter button{border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#151715;color:#e8eee4;padding:7px 12px;font:600 11.5px "Segoe UI",sans-serif;cursor:pointer}
#rehatt-meter button:hover{background:#1f231f;border-color:rgba(255,255,255,.2)}
#rehatt-meter .mt-go{background:#e0a96d;border-color:#e0a96d;color:#2a1608}
#rehatt-meter .mt-go:hover{background:#ecbd86}
#rehatt-meter .mt-models{display:flex;flex-direction:column;gap:4px}
#rehatt-meter .mt-models div{display:flex;justify-content:space-between}`;
  document.head.appendChild(style);
  let glassCanvas = null, lastKey = '';
  function render(force) {
    if (!st || root.style.display === 'none') return;
    const key = JSON.stringify([st.session, st.weekly, st.models, st.status, st.source, st.fetching, MS(), Math.floor(Date.now() / 60000)]);
    if (!force && key === lastKey) return;
    lastKey = key;
    const s = left(st.session), k = left(st.weekly);
    const bar = (label, l, sub) => `<div class="mt-bar"><div><span>${label}</span><b style="color:${colour(l)}">${l == null ? '—' : l + '%'}</b></div><span class="mt-track"><i style="width:${l ?? 0}%;background:${colour(l)}"></i></span>${sub ? `<small class="mt-sub">${esc(sub)}</small>` : ''}</div>`;
    const source = !st.hasData ? T('Belum ada bacaan', 'No reading yet') : `${st.source === 'cc' ? 'Claude Code' : 'claude.ai'} · ${agoLabel(st.syncedAt)}`;
    const mood = s == null ? '' : s > 50 ? T('Masih banyak. Teruskan!', 'Plenty left. Carry on!') : s > 20 ? T('Separuh gelas. Rancang sedikit.', 'Half a glass. Plan a little.') : s > 0 ? T('Hampir kosong. Masa untuk rehat?', 'Nearly empty. Time for a break?') : T('Habis. Tunggu sehingga diisi semula.', 'All gone. Wait for the refill.');
    root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${T('Penggunaan', 'Usage')}</p><p class="tc-page-sub">${esc(source)}</p></div></div>
      <div class="mt-body"><div class="mt-glass"><canvas id="mt-canvas"></canvas></div>
        <div class="mt-main">${st.hasData ? `<p class="mt-big">${s == null ? '—' : s + '%'}<small>${T('lagi dalam 5 jam ini', 'left in this 5-hour window')}</small></p><p class="mt-sub">${esc(resetLabel(st.session?.resetsAt))}${mood ? ' · ' + esc(mood) : ''}</p>
          ${bar(T('Minggu ini', 'This week'), k, resetLabel(st.weekly?.resetsAt))}`
          : `<p class="mt-big" style="font-size:20px">${T('Gelas teh tarik untuk had Claude anda', 'A glass of teh tarik for your Claude limits')}</p><p class="mt-sub">${T('Ia terisi sebaik sahaja Claude Code menjawab (Sambungan → Claude Code), atau log masuk ke claude.ai untuk nombor langsung.', 'It fills as soon as Claude Code answers (Connections → Claude Code), or sign in to claude.ai for live numbers.')}</p>`}
          ${st.models?.length ? `<div class="mt-models">${st.models.slice(0, 3).map(m => `<div><span>${esc(m.name)}</span><b style="color:${colour(left(m))}">${left(m)}% ${T('lagi', 'left')}</b></div>`).join('')}</div>` : ''}</div>
        <div class="mt-side"><div class="mt-card"><small>claude.ai</small>${st.signedIn
          ? `<span>${st.status === 'offline' ? T('Tiada internet', 'Offline') : st.status === 'error' ? T('Tidak dapat dibaca sekarang', 'Could not read it just now') : T('Disambungkan: nombor langsung', 'Connected: live numbers')}</span><div style="display:flex;gap:6px"><button type="button" data-a="refresh">${st.fetching ? '…' : T('Muat semula', 'Refresh')}</button><button type="button" data-a="signout">${T('Log keluar', 'Sign out')}</button></div>`
          : `<span>${T('Log masuk sekali untuk nombor yang sama seperti Tetapan → Penggunaan.', 'Sign in once for the same numbers as Settings → Usage.')}</span><button type="button" class="mt-go" data-a="signin">${T('Log masuk ke claude.ai', 'Sign in to claude.ai')}</button>`}</div>
          <div class="mt-card"><small>Claude Code</small><span>${st.claudeCode ? T('Garis status menghantar penggunaan anda', 'The status line sends your usage') : T('Sambungkan Claude Code untuk bacaan segera', 'Connect Claude Code for instant readings')}</span></div></div>
      </div>`;
    glassCanvas = root.querySelector('#mt-canvas');
  }
  // the page's glass is drawn on its own little canvas, so it sloshes
  (function animate() {
    if (glassCanvas && root.style.display !== 'none' && st) {
      const box = glassCanvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (glassCanvas.width !== Math.round(box.width * dpr) || glassCanvas.height !== Math.round(box.height * dpr)) { glassCanvas.width = Math.round(box.width * dpr); glassCanvas.height = Math.round(box.height * dpr); }
      const c = glassCanvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, box.width, box.height);
      drawGlass(box.width / 2, box.height - 6, Math.min(box.height - 14, 176), left(st.session), true, c);
    }
    requestAnimationFrame(animate);
  })();
  root.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; sound('click'); act(b.dataset.a); });

  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) { if (currentView !== 'meter') return baseExpanded(alpha); drawHeader(alpha); };
  let shown = false;
  (function position() {
    const show = currentView === 'meter' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;
    if (show) { window.__kopiPage.place(root, contentRect()); render(!shown); }
    shown = show;
    requestAnimationFrame(position);
  })();
  canvas.addEventListener('click', e => {
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.meterApp) && !window.__kopiHomeEditing?.()) {
      e.preventDefault(); e.stopImmediatePropagation(); setView('meter'); setMode('expanded');
    }
  }, true);
})();
