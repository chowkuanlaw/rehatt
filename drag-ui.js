'use strict';
// Drag the island anywhere on your screen, or keep it fixed at the top (Settings → General → Island, or the tray menu).
// main.js moves the window and keeps the island on the screen; here: when a press on the small island becomes a drag,
// and how big the island is drawn right now (so near the bottom or a side it opens inwards).
(function islandDrag() {
  const api = window.kopi;
  if (!api?.islandDrag) return;
  let place = 'free', press = null, dragging = false, swallowUntil = 0;

  // keep the setting in the island's preferences in step with main.js (the tray menu can change it too)
  const remember = m => {
    const prefs = window.__kopiPrefs?.(); if (prefs) prefs.place = m;
    try { const saved = JSON.parse(localStorage.getItem('kopi:prefs') || '{}'); saved.place = m; localStorage.setItem('kopi:prefs', JSON.stringify(saved)); } catch {}
  };
  let wanted = window.__kopiPrefs?.().place;
  api.islandPlaceGet?.().then(r => { if (r?.ok) { place = r.mode; wanted = r.mode; remember(r.mode); } }).catch(() => {});
  api.onIslandPlace?.(r => { if (!r?.mode) return; place = r.mode; wanted = r.mode; remember(r.mode); });
  // Settings → General → "Where the island sits": saved there, sent to main.js here
  setInterval(() => { const want = window.__kopiPrefs?.().place; if (want && want !== wanted) { wanted = want; api.islandPlaceSet(want); } }, 800);

  // ---- a press on the small island that moves more than a few pixels is a drag ----
  window.addEventListener('pointerdown', e => {
    if (place !== 'free' || e.button !== 0 || mode === 'expanded' || !introFinished) return;
    if (!inside(e.clientX, e.clientY, islandBounds)) return;
    press = { x: e.screenX, y: e.screenY, id: e.pointerId };
  }, true);
  window.addEventListener('pointermove', e => {
    if (!press || dragging || Math.hypot(e.screenX - press.x, e.screenY - press.y) < 5) return;
    dragging = true; window.__rehattDragging = true; hoverStartedAt = null;
    api.islandDrag(true);
    try { canvas.setPointerCapture(press.id); } catch {}
  }, true);
  function end() {
    if (dragging) { api.islandDrag(false); swallowUntil = performance.now() + 250; window.__kopiChime?.('pop'); window.__kopiHoldClosed?.(); } // dropped: it stays small until the mouse leaves
    press = null; dragging = false; window.__rehattDragging = false;
  }
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  window.addEventListener('blur', end);
  // the click that ends a drag is not a click on the island
  window.addEventListener('click', e => { if (performance.now() < swallowUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // while you drag it, the island stays small (it would open when the mouse rests on it)
  const baseHover = updateHover;
  updateHover = function (now) { if (dragging) { hoverStartedAt = null; leaveStartedAt = null; return; } return baseHover(now); };

  // ---- how big the island is drawn now (plus room for its glow) ----
  let sent = '';
  (function report() {
    const v = transition?.to || visual; // the size it is going to: the window moves once, not every frame
    const w = Math.round(v.width / 4) * 4 + 28, h = Math.round(v.height / 4) * 4 + 24, key = w + 'x' + h;
    if (key !== sent) { sent = key; api.islandSize(w, h); }
    requestAnimationFrame(report);
  })();
})();
