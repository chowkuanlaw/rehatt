'use strict';
// Switching apps (Home, Chat, Spotify, Tray, Settings …), the modern way (like iOS): the header stays put and its
// pill slides to the new icon (icons-ui.js), the old page blurs away, the island glides to its new size, and the new
// page comes into focus with a small lift. Quick (about a third of a second). Settings → Animations → App animations turns it off.
(function appSwitch() {
  const OUT = 110, IN = 280; // ms
  const ROOTS = '#kopi-ai-monitor,#kopi-settings-v2,#kopi-extras,#kopi-focus,#kopi-tools,#kopi-chat';
  const style = document.createElement('style');
  style.textContent = `
body.tc-sw-out :is(${ROOTS}){opacity:0 !important;filter:blur(6px);transform:scale(.985);transition:opacity .11s ease-in,filter .11s ease-in,transform .11s ease-in}
body.tc-sw-in :is(${ROOTS}){animation:tc-sw-in .28s cubic-bezier(.2,.9,.25,1) both}
@keyframes tc-sw-in{from{opacity:0;filter:blur(6px);transform:translateY(8px) scale(.99)}to{opacity:1;filter:none;transform:none}}
@media(prefers-reduced-motion:reduce){body.tc-sw-in :is(${ROOTS}){animation-duration:.01s}}`;
  document.head.appendChild(style);
  const on = () => window.__kopiPrefs?.().appAnim !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = v => Math.max(0, Math.min(1, v)), easeIn = v => clamp(v) ** 2, easeOut = v => 1 - (1 - clamp(v)) ** 3;

  let sw = null; // { start, next, switched }
  const base = setView;
  setView = function (next) {
    if (sw && !sw.switched) { sw.next = next; return; } // clicked again while the old page fades: go there instead
    if (!on() || window.__kopiDragging?.() || mode !== 'expanded' || !introFinished || next === currentView || next === 'project' || currentView === 'project' || transition) return base(next);
    sw = { start: performance.now(), next, switched: 0 };
    document.body.classList.remove('tc-sw-in'); document.body.classList.add('tc-sw-out');
    tone(700, 560, 0.045, 0.007); // a soft tick
    setTimeout(() => {
      base(sw.next); sw.switched = performance.now();
      document.body.classList.remove('tc-sw-out'); void document.body.offsetWidth; document.body.classList.add('tc-sw-in');
      setTimeout(() => { document.body.classList.remove('tc-sw-in'); sw = null; }, IN);
    }, OUT);
  };

  // Canvas pages: the content under the header blurs, fades and lifts (the header itself stays sharp).
  const shot = document.createElement('canvas'), sctx = shot.getContext('2d');
  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) {
    const result = baseExpanded(alpha);
    if (!sw) return result;
    const t = performance.now(), k = sw.switched ? 1 - easeOut((t - sw.switched) / IN) : easeIn((t - sw.start) / OUT); // 0 = sharp, 1 = gone
    if (k <= 0.01) return result;
    const ib = islandBounds, y0 = 37, h = Math.max(1, ib.height - y0), dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    const sw2 = Math.round(ib.width * dpr), sh = Math.round(h * dpr);
    if (shot.width !== sw2 || shot.height !== sh) { shot.width = sw2; shot.height = sh; }
    sctx.clearRect(0, 0, sw2, sh); sctx.drawImage(canvas, Math.round(ib.x * dpr), Math.round(y0 * dpr), sw2, sh, 0, 0, sw2, sh);
    const lift = sw.switched ? 8 * k : 0, scale = 1 - 0.015 * k;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(ib.x, y0, ib.width, h, [0, 0, UI.EXPANDED_RADIUS, UI.EXPANDED_RADIUS]); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(ib.x, y0, ib.width, h);
    ctx.globalAlpha = 1 - k; ctx.filter = `blur(${(6 * k).toFixed(2)}px)`;
    const w = ib.width * scale, hh = h * scale;
    ctx.drawImage(shot, ib.x + (ib.width - w) / 2, y0 + (h - hh) / 2 + lift, w, hh);
    ctx.restore();
    return result;
  };
})();
