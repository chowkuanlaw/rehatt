'use strict';
// Kopi himself, shared by other pages:
//   - his stage on the Claude Code page: a soft glow in the AI's colour, with Kopi bottom left (ai-monitor-ui.js)
//   - his picture in the Rehatt Settings app, drawn from the settings you are trying out (kopi-fun.js, settings-bridge-ui.js)
(function kopiStage() {
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

  // ---- the Settings app's own Kopi ----
  // Draw Kopi once more in a free corner of the canvas, copy him out, and put the corner back.
  // The screen only updates after this frame, so nobody ever sees it.
  const box = 200, face = document.createElement('canvas'), fctx = face.getContext('2d');
  let lastFrame = 0;
  function drawFace() {
    const dpr = canvas.width / (canvas.clientWidth || canvas.width) || 1, px = Math.ceil(box * dpr);
    if (face.width !== px) { face.width = px; face.height = px; }
    const backup = ctx.getImageData(0, 0, px, px);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, px, px); ctx.restore();
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    window.__kopiBuddyDrawing = true;
    try { window.__kopiDrawPreview(() => drawGhost(box / 2, box / 2 + 17, 112)); }
    finally { window.__kopiBuddyDrawing = false; ctx.restore(); }
    fctx.clearRect(0, 0, px, px); fctx.drawImage(canvas, 0, 0, px, px, 0, 0, px, px);
    ctx.putImageData(backup, 0, 0);
    return face.toDataURL('image/png');
  }
  function sendFace(now) {
    requestAnimationFrame(sendFace);
    if (!window.__kopiFaceForSettings || now - lastFrame < 50 || !window.__kopiDrawPreview) return;
    lastFrame = now;
    window.kopi?.settingsFrame?.(drawFace());
  }
  requestAnimationFrame(sendFace);
})();
