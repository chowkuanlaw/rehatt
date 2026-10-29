// Draws the Kopi Island app icon: Kopi's sketched face, the same mark as in the website footer
// (a kopi-O cup with a green rim, two eyes and steam). No background, just the face.
// Writes PNGs + a Windows .ico + a small tray icon. Run: node_modules\electron\dist\electron.exe tools\make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const OUT = process.env.ICON_OUT || path.join(__dirname, '..', 'assets');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512];
const INK = '#24231f', PAPER = '#f3efe8', RUST = '#a8582a';

// The site's logo mark (viewBox 0 0 40 40). Small sizes get thicker lines so they stay readable;
// big sizes get a light pencil wobble so it looks drawn, like the site.
function svg(size) {
  const small = size <= 32, line = small ? 2.3 : size <= 64 ? 1.7 : 1.5;
  const pencil = size >= 128
    ? `<filter id="p" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="${size >= 256 ? 0.22 : 0.16}"/></filter>` : '';
  const f = pencil ? ' filter="url(#p)"' : '';
  // a thin paper-coloured halo behind the lines keeps Kopi visible on a dark taskbar
  const halo = `<g fill="${PAPER}" stroke="${PAPER}" stroke-width="${line + 1.8}" stroke-linecap="round" stroke-linejoin="round"><path d="M20 9.5V5.5"/><circle cx="20" cy="${small ? 4.4 : 3.6}" r="${small ? 3.1 : 2.7}"/><rect x="3.6" y="19" width="3.4" height="8" rx="1.7"/><rect x="33" y="19" width="3.4" height="8" rx="1.7"/><ellipse cx="20" cy="23" rx="15" ry="13"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="1 ${small ? 0 : -0.6} 38 38"><defs>${pencil}</defs>${halo}<g${f}>
    <path d="M20 9.5V5.5" stroke="${INK}" stroke-width="${line}" stroke-linecap="round"/>
    <circle cx="20" cy="${small ? 4.4 : 3.6}" r="${small ? 3.1 : 2.7}" fill="${RUST}" stroke="${INK}" stroke-width="${line * .55}"/>
    <rect x="3.6" y="19" width="3.4" height="8" rx="1.7" fill="${PAPER}" stroke="${INK}" stroke-width="${line * .7}"/>
    <rect x="33" y="19" width="3.4" height="8" rx="1.7" fill="${PAPER}" stroke="${INK}" stroke-width="${line * .7}"/>
    <ellipse cx="20" cy="23" rx="15" ry="13" fill="${PAPER}" stroke="${INK}" stroke-width="${line}"/>
    <rect x="9" y="16" width="22" height="13" rx="6.5" fill="${INK}"/>
    ${small ? '' : `<rect x="11.5" y="17.6" width="8" height="1.3" rx=".65" fill="${PAPER}" opacity=".25"/>`}
    <ellipse cx="16" cy="22.5" rx="${small ? 1.9 : 1.6}" ry="${small ? 2.7 : 2.4}" fill="${PAPER}"/>
    <ellipse cx="24" cy="22.5" rx="${small ? 1.9 : 1.6}" ry="${small ? 2.7 : 2.4}" fill="${PAPER}"/>
  </g></svg>`;
}

const render = `(${function render(markup, size) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = size; cv.getContext('2d').drawImage(img, 0, 0, size, size); resolve(cv.toDataURL('image/png').split(',')[1]); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  });
}})`;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<body></body>');
  const pngs = {};
  for (const s of SIZES) {
    pngs[s] = Buffer.from(await win.webContents.executeJavaScript(`${render}(${JSON.stringify(svg(s))}, ${s})`), 'base64');
    fs.writeFileSync(path.join(OUT, `icon-${s}.png`), pngs[s]);
  }
  fs.copyFileSync(path.join(OUT, 'icon-512.png'), path.join(OUT, 'icon.png'));
  // tray: 16 px plus a 32 px @2x version for high-DPI screens (Electron picks it up by name)
  fs.copyFileSync(path.join(OUT, 'icon-16.png'), path.join(OUT, 'tray.png'));
  fs.copyFileSync(path.join(OUT, 'icon-32.png'), path.join(OUT, 'tray@2x.png'));
  // .ico with PNG entries (Windows Vista+)
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256], head = Buffer.alloc(6 + 16 * sizes.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length; const bodies = [];
  sizes.forEach((s, i) => { const b = pngs[s], e = 6 + i * 16; head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(offset, e + 12); offset += b.length; bodies.push(b); });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), Buffer.concat([head, ...bodies]));
  console.log('icons ok', SIZES.join(','));
  app.exit(0);
});
