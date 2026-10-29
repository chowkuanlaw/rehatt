'use strict';
/* The glass mascot's faces and drawings, shared by the widget, the settings window and the show. */
(function (root) {
  const DOTS = 'M19.5 16 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M43.5 16 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0';
  const ARCS = 'M18.5 17 Q22 12.5 25.5 17 M42.5 17 Q46 12.5 49.5 17';
  const SHUT = 'M18.5 16 L25.5 16 M42.5 16 L49.5 16';
  const BROWS = 'M17.5 11 L24.5 8.5 M50.5 11 L43.5 8.5';

  // eyesFilled: dot eyes are filled shapes; arcs and shut eyes are lines.
  const FACES = {
    happy:   { eyes: ARCS, eyesFilled: false, brows: '', mouth: 'M29 23 Q34 28.5 39 23', mouthFilled: false, wave: true },
    okay:    { eyes: DOTS, eyesFilled: true,  brows: '', mouth: 'M30 25 Q34 27 38 25', mouthFilled: false, wave: false },
    worried: { eyes: DOTS, eyesFilled: true,  brows: BROWS, mouth: 'M30 27.5 Q34 24 38 27.5', mouthFilled: false, wave: false },
    panic:   { eyes: DOTS, eyesFilled: true,  brows: BROWS, mouth: 'M28.5 26 Q31.25 24 34 26 Q36.75 28 39.5 26', mouthFilled: false, wave: false },
    asleep:  { eyes: SHUT, eyesFilled: false, brows: '', mouth: 'M32.5 26 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0', mouthFilled: false, wave: false },
    excited: { eyes: ARCS, eyesFilled: false, brows: '', mouth: 'M28 23 Q34 32 40 23 Z', mouthFilled: true, wave: true }
  };

  // Tea inside the small glass drawing (viewBox 0 -30 120 198): polygons for a level 0-100.
  function teaPolys(left) {
    const xl = y => 14 + (y - 22) * 10 / 136, xr = y => 106 - (y - 22) * 10 / 136, f = n => n.toFixed(1);
    const none = '0,0 0,0 0,0';
    const H = 128 * Math.max(0, Math.min(100, left)) / 100, yT = 158 - H, fb = Math.min(158, yT + 9);
    return {
      tea: H > 0.5 ? `${f(xl(yT))},${f(yT)} ${f(xr(yT))},${f(yT)} ${f(xr(158))},158 ${f(xl(158))},158` : none,
      foam: H > 9 ? `${f(xl(yT))},${f(yT)} ${f(xr(yT))},${f(yT)} ${f(xr(fb))},${f(fb)} ${f(xl(fb))},${f(fb)}` : none
    };
  }
  // Two dot eyes for the small glass drawings.
  const MINI_EYES = 'M44 96 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M66 96 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0';

  const SVG = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // A small glass picture (for the settings window), filled to `left` with a drink.
  function miniGlass(svg, left, eyes) {
    svg.setAttribute('viewBox', '-6 -2 132 172');
    const p = teaPolys(left);
    el('polygon', { points: '12,20 108,20 97,160 23,160', class: 'glassfill' }, svg);
    el('polygon', { points: p.tea, class: 'teafill' }, svg);
    el('polygon', { points: p.foam, class: 'foamfill' }, svg);
    el('polygon', { points: '12,20 108,20 97,160 23,160', class: 'line' }, svg);
    if (eyes !== false) el('path', { d: MINI_EYES, class: 'eyesfill' }, svg);
    return svg;
  }

  // A pulling mug with a face (viewBox 0 0 64 72). Returns its foam ellipse.
  function drawMug(svg) {
    el('path', { d: 'M48 24 q12 0 12 12 q0 12 -12 12', class: 'handle' }, svg);
    el('rect', { x: 10, y: 14, width: 38, height: 50, rx: 4, class: 'bodym' }, svg);
    el('path', { d: 'M16 22 L16 56', class: 'shine' }, svg);
    const foam = el('ellipse', { cx: 29, cy: 14, rx: 19, ry: 0, class: 'foamm', opacity: 0 }, svg);
    el('circle', { cx: 23, cy: 38, r: 2.2, class: 'e' }, svg);
    el('circle', { cx: 35, cy: 38, r: 2.2, class: 'e' }, svg);
    el('ellipse', { cx: 19, cy: 43, rx: 2.6, ry: 1.6, class: 'blush' }, svg);
    el('ellipse', { cx: 39, cy: 43, rx: 2.6, ry: 1.6, class: 'blush' }, svg);
    el('path', { d: 'M25 44 Q29 48 33 44', class: 'm' }, svg);
    return foam;
  }

  // A small cup with a face for the weekly row (viewBox 0 0 36 44).
  function drawCup(svg) {
    el('rect', { x: 3, y: 8, width: 24, height: 32, rx: 5, class: 'body-r' }, svg);
    const tea = el('rect', { x: 5.5, y: 37.5, width: 19, height: 0, rx: 2, class: 'tea-r' }, svg);
    el('path', { d: 'M27 16 q7 0 7 7 q0 7 -7 7', class: 'handle' }, svg);
    const eyes = el('path', { d: '', class: 'ce' }, svg);
    const mouth = el('path', { d: '', class: 'cm' }, svg);
    return { tea, eyes, mouth };
  }
  const CUP_DOTS = 'M10.3 22 a1.7 1.7 0 1 0 3.4 0 a1.7 1.7 0 1 0 -3.4 0 M16.3 22 a1.7 1.7 0 1 0 3.4 0 a1.7 1.7 0 1 0 -3.4 0';
  function setCup(c, fr) {
    const h = 27 * fr, awake = fr > 0;
    c.tea.setAttribute('y', (37.5 - h).toFixed(1));
    c.tea.setAttribute('height', h.toFixed(1));
    c.eyes.setAttribute('d', awake ? CUP_DOTS : 'M10 22 L14 22 M16 22 L20 22');
    c.eyes.classList.toggle('filled', awake);
    c.mouth.setAttribute('d', fr >= 0.5 ? 'M12.5 26.5 Q15 29 17.5 26.5' : (awake ? 'M13 27.5 L17 27.5' : 'M14 27.5 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0'));
    return awake;
  }

  // Tray icon: the glass with its current level in the chosen drink, at 1x, 1.5x and 2x.
  function trayIcons(left, dim, drink, dark) {
    const out = [];
    const ink = dark ? '#F1E4D3' : '#3A2A22';
    for (const scale of [1, 1.5, 2]) {
      const s = Math.round(16 * scale);
      const cv = document.createElement('canvas');
      cv.width = cv.height = s;
      const g = cv.getContext('2d');
      const k = s / 16;
      const top = 1.5 * k, bot = 15 * k, l0 = 2 * k, r0 = 14 * k, l1 = 3.6 * k, r1 = 12.4 * k;
      const at = y => { const t = (y - top) / (bot - top); return [l0 + (l1 - l0) * t, r0 + (r1 - r0) * t]; };
      g.beginPath(); g.moveTo(l0, top); g.lineTo(r0, top); g.lineTo(r1, bot); g.lineTo(l1, bot); g.closePath();
      g.fillStyle = '#FBF3EA'; g.fill();
      const lv = Math.max(0, Math.min(100, left || 0)) / 100;
      if (lv > 0.02 && !dim) {
        const y = bot - (bot - top - 1.5 * k) * lv;
        const [a, b] = at(y);
        g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.lineTo(r1, bot); g.lineTo(l1, bot); g.closePath();
        g.fillStyle = (drink && drink.tea) || '#C8874E'; g.fill();
        g.fillStyle = (drink && drink.foam) || '#F3DEC0'; g.fillRect(a + 0.3 * k, y, b - a - 0.6 * k, Math.max(1, 1.4 * k));
      }
      g.beginPath(); g.moveTo(l0, top); g.lineTo(r0, top); g.lineTo(r1, bot); g.lineTo(l1, bot); g.closePath();
      g.lineWidth = Math.max(1.2, 1.3 * k); g.lineJoin = 'round'; g.strokeStyle = dim ? '#8C7A6E' : ink; g.stroke();
      g.fillStyle = dim ? '#8C7A6E' : '#3A2A22';
      const ey = 9.5 * k, er = Math.max(0.8, 0.9 * k);
      g.beginPath(); g.arc(6.2 * k, ey, er, 0, Math.PI * 2); g.arc(9.8 * k, ey, er, 0, Math.PI * 2); g.fill();
      out.push({ scale, url: cv.toDataURL('image/png') });
    }
    return out;
  }

  // Applies the drink's colours to the page.
  function applyDrink(drink) {
    const s = document.body.style;
    s.setProperty('--tea', drink.tea); s.setProperty('--tea2', drink.tea2);
    s.setProperty('--foam', drink.foam); s.setProperty('--foam2', drink.foam2);
  }

  root.TTGlass = { FACES, teaPolys, MINI_EYES, miniGlass, drawMug, drawCup, setCup, trayIcons, applyDrink };
})(window);
