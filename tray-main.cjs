// Rehatt in the Windows tray (next to the clock): Kopi's face, with a menu to open the island,
// start with Windows, restart and quit. The island itself has no taskbar button, so this is the
// place where you can always find and close Rehatt. Also: only one Rehatt runs at a time.
const { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let tray = null;

function island() {
  return BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /mascot\.html/.test(w.webContents.getURL()));
}

function openIsland() {
  const win = island(); if (!win) return;
  if (win.isMinimized()) win.restore();
  win.showInactive();
  win.webContents.send('extras:shortcut', 'home');
}

// Start with Windows. During development Rehatt runs as "electron.exe <folder>", so pass those along.
// --rehatt-login: started by Windows at sign-in (Rehatt then appears quietly, without the hello).
function loginOptions() { return app.isPackaged ? { args: ['--rehatt-login'] } : { path: process.execPath, args: [app.getAppPath(), '--rehatt-login'] }; }
function startsWithWindows() { try { return app.getLoginItemSettings(loginOptions()).openAtLogin; } catch { return false; } }
function setStartsWithWindows(on) { try { app.setLoginItemSettings({ ...loginOptions(), openAtLogin: !!on }); } catch {} buildMenu(); }

// What the tray icon shows (Rehatt Settings → General): Kopi, your kuih with Lapis's countdown ring, or your glass of
// teh tarik draining with your usage, as in Lapis and Teh Tarik Meter. The island draws the kuih and the glass.
const fs = require('node:fs');
const TRAY_FILE = () => path.join(app.getPath('userData'), 'rehatt-tray.json');
let trayIcon = 'kopi';
try { const v = JSON.parse(fs.readFileSync(TRAY_FILE(), 'utf8')).icon; if (['kopi', 'kuih', 'glass'].includes(v)) trayIcon = v; } catch {}
const images = { kuih: null, glass: null };
function imageFrom(list) {
  if (!Array.isArray(list)) return null;
  const img = nativeImage.createEmpty();
  for (const it of list.slice(0, 4)) {
    const url = it && typeof it.url === 'string' ? it.url : '', scale = Number(it && it.scale);
    if (!url.startsWith('data:image/png;base64,') || url.length > 200000 || !(scale >= 1 && scale <= 4)) continue;
    img.addRepresentation({ scaleFactor: scale, dataURL: url });
  }
  return img.isEmpty() ? null : img;
}
const kopiImage = () => nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
function applyIcon() {
  if (!tray) return;
  const img = (trayIcon === 'kuih' && images.kuih) || (trayIcon === 'glass' && images.glass) || kopiImage();
  try { tray.setImage(img); } catch {}
}
function setTrayIcon(kind) {
  if (!['kopi', 'kuih', 'glass'].includes(kind)) return;
  trayIcon = kind;
  try { fs.writeFileSync(TRAY_FILE(), JSON.stringify({ icon: kind })); } catch {}
  applyIcon();
  island()?.webContents.send('rehatt:tray-want', kind);
  buildMenu();
}
// The tooltip: your next stretch and what's left in your glass
function tooltip() {
  const e = app.rehattEngines, parts = ['Rehatt'];
  try { if (e?.lapis) parts.push(e.lapis.statusLabel()); } catch {}
  try { const t = e?.ttm?.trayText(); if (t) parts.push(t); } catch {}
  return parts.join('\n').slice(0, 127);
}
let lastTip = '', menuKey = '';
function refresh() {
  if (!tray) return;
  const tip = tooltip(); if (tip !== lastTip) { lastTip = tip; tray.setToolTip(tip); }
  // the menu is rebuilt only when something in it changes (never every second: that would close an open menu)
  const st = app.rehattEngines?.lapis?.publicState?.(), u = app.rehattUpdate?.state?.()?.update;
  const key = [st?.paused, st?.mode, st?.resting, u?.state, u?.state === 'downloading' ? Math.floor((u.percent || 0) / 10) : ''].join('|');
  if (key !== menuKey) { menuKey = key; buildMenu(); }
}
app.rehattTray = {
  refresh,
  setImages: (kind, list) => { const img = imageFrom(list); if (img && (kind === 'lapis' || kind === 'kuih')) images.kuih = img; if (img && kind === 'glass') images.glass = img; applyIcon(); },
  icon: () => trayIcon, setIcon: setTrayIcon
};
app.rehattAutostart = { get: () => startsWithWindows(), set: on => setStartsWithWindows(on) };

function quit() { app.quit(); } // main.js shows the goodbye first
function restart() { app.relaunch(); app.quit(); }

function buildMenu() {
  if (!tray) return;
  const lapis = app.rehattEngines?.lapis, st = lapis?.publicState?.(), upd = app.rehattUpdate?.state?.() || {};
  const pause = st?.paused
    ? [{ label: 'Resume stretch reminders', click: () => lapis.act({ type: 'resume' }) }]
    : [{ label: 'Pause stretch reminders', submenu: [['m30', '30 minutes'], ['h1', '1 hour'], ['h2', '2 hours'], ['tomorrow', 'Until tomorrow'], ['forever', 'Until I resume']].map(([kind, label]) => ({ label, click: () => lapis?.act({ type: 'pause', kind }) })) }];
  const updates = upd.update?.state === 'ready' ? [{ label: `Restart to update (${upd.update.version})`, click: () => app.rehattUpdate.install() }, { type: 'separator' }]
    : upd.update?.state === 'downloading' ? [{ label: `Downloading ${upd.update.version}… ${upd.update.percent || 0}%`, enabled: false }, { type: 'separator' }]
    : upd.update?.state === 'available' ? [{ label: `Download Rehatt ${upd.update.version}`, click: () => app.rehattUpdate.install() }, { type: 'separator' }] : [];
  tray.setContextMenu(Menu.buildFromTemplate([
    ...updates,
    { label: 'Rehatt', enabled: false },
    ...(st ? [{ label: (() => { try { return lapis.statusLabel(); } catch { return ''; } })() || 'Stretch', enabled: false }] : []),
    { type: 'separator' },
    { label: 'Open the island', accelerator: 'Ctrl+Alt+K', registerAccelerator: false, click: openIsland },
    { label: 'Stretch now', click: () => { app.rehattEngines?.lapis.act({ type: 'now', start: true }); const win = island(); if (win) { win.showInactive(); win.webContents.send('extras:shortcut', 'stretch'); } } },
    ...pause,
    { label: 'Your Claude usage', click: () => { const win = island(); if (win) { win.showInactive(); win.webContents.send('extras:shortcut', 'meter'); } } },
    { label: 'Settings', click: () => app.emit('kopi-open-settings') },
    { type: 'separator' },
    { label: 'Tray icon', submenu: [['kopi', 'Kopi'], ['kuih', 'Your kuih (countdown ring)'], ['glass', 'Your glass of teh tarik']].map(([kind, label]) => ({ label, type: 'radio', checked: trayIcon === kind, click: () => setTrayIcon(kind) })) },
    { type: 'separator' },
    { label: 'Island: drag it anywhere', type: 'radio', checked: app.rehattPlace?.get() !== 'top', click: () => { app.rehattPlace?.set('free'); buildMenu(); } },
    { label: 'Island: fixed at the top', type: 'radio', checked: app.rehattPlace?.get() === 'top', click: () => { app.rehattPlace?.set('top'); buildMenu(); } },
    { label: 'Put the island back at the top', click: () => { app.rehattPlace?.set('reset'); buildMenu(); } },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: startsWithWindows(), click: item => setStartsWithWindows(item.checked) },
    { type: 'separator' },
    { label: 'Restart', click: restart },
    { label: 'Quit Rehatt', click: quit }
  ]));
}

if (!app.requestSingleInstanceLock()) {
  // Rehatt already runs: that one opens its island, this one stops right away.
  app.exit(0);
} else {
  // "Rehatt Settings" in the Start menu starts Rehatt with --settings: then only that app opens.
  app.on('second-instance', (event, argv) => { if ((argv || []).includes('--settings')) app.emit('kopi-open-settings'); else openIsland(); });
  app.setName('Rehatt');
  app.whenReady().then(() => {
    // Windows shows the name and icon of a notification from a Start menu shortcut with the same app id.
    // Without it, notifications said "Electron". Made (or fixed) on every start, it costs nothing.
    if (process.platform === 'win32') {
      try {
        const { shell } = require('electron');
        const programs = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
        const link = path.join(programs, 'Rehatt.lnk');
        // An old "Electron" shortcut with Rehatt's app id made every notification say "Electron". Only that one goes.
        const old = path.join(programs, 'Electron.lnk');
        try {
          const info = require('node:fs').existsSync(old) && shell.readShortcutLink(old);
          if (info && info.appUserModelId === 'com.chowkuanlaw.rehatt' && path.resolve(info.target) === path.resolve(process.execPath)) require('node:fs').unlinkSync(old);
        } catch {}
        shell.writeShortcutLink(link, require('node:fs').existsSync(link) ? 'replace' : 'create', {
          target: process.execPath,
          args: app.isPackaged ? '' : `"${app.getAppPath()}"`,
          cwd: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
          icon: path.join(__dirname, 'assets', 'icon.ico'), iconIndex: 0,
          appUserModelId: 'com.chowkuanlaw.rehatt',
          description: 'Rehatt: Kopi, the Dynamic Island for Windows'
        });
        // The second app: Rehatt Settings, with its own icon and app id (its own button on the taskbar).
        const settingsLink = path.join(programs, 'Rehatt Settings.lnk');
        shell.writeShortcutLink(settingsLink, require('node:fs').existsSync(settingsLink) ? 'replace' : 'create', {
          target: process.execPath,
          args: (app.isPackaged ? '' : `"${app.getAppPath()}" `) + '--settings',
          cwd: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
          icon: path.join(__dirname, 'assets', 'settings-icon.ico'), iconIndex: 0,
          appUserModelId: 'com.chowkuanlaw.rehatt.settings',
          description: 'Rehatt Settings: connections, Kopi, wardrobe and more'
        });
      } catch {}
      // The shortcut alone was not enough: Windows also reads the name and icon of notifications from
      // HKCU\Software\Classes\AppUserModelId\<app id>. Only Rehatt's own key, in the user's own registry part.
      try {
        const { execFile } = require('node:child_process');
        const key = 'HKCU\\Software\\Classes\\AppUserModelId\\com.chowkuanlaw.rehatt';
        const set = (name, value) => execFile('reg.exe', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true }, () => {});
        set('DisplayName', 'Rehatt');
        set('IconUri', path.join(__dirname, 'assets', 'icon-256.png'));
        const key2 = 'HKCU\\Software\\Classes\\AppUserModelId\\com.chowkuanlaw.rehatt.settings';
        execFile('reg.exe', ['add', key2, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'Rehatt Settings', '/f'], { windowsHide: true }, () => {});
        execFile('reg.exe', ['add', key2, '/v', 'IconUri', '/t', 'REG_SZ', '/d', path.join(__dirname, 'assets', 'settings-icon.png'), '/f'], { windowsHide: true }, () => {});
      } catch {}
    }
    const image = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
    tray = new Tray(image);
    tray.setToolTip('Rehatt');
    tray.on('click', openIsland);
    buildMenu(); applyIcon();
    const t = setInterval(refresh, 5000); t.unref?.();
    app.rehattUpdate?.onChange(() => buildMenu());
  });
  // the icon stays during the goodbye and goes when the app really stops
  app.on('will-quit', () => { try { tray?.destroy(); } catch {} tray = null; });

  // only the island itself may change these
  const fromIsland = e => /mascot\.html/.test(e.senderFrame?.url || '');
  ipcMain.handle('app:login-get', e => fromIsland(e) ? { ok: true, on: startsWithWindows() } : { ok: false });
  ipcMain.handle('app:login-set', (e, on) => { if (!fromIsland(e)) return { ok: false }; setStartsWithWindows(on); return { ok: true, on: startsWithWindows() }; });
  ipcMain.on('app:restart', e => { if (fromIsland(e)) restart(); });
  const fromApp = e => /^file:.*\/(mascot|settings-app)\.html/.test(e.senderFrame?.url || '');
  ipcMain.on('rehatt:tray-images', (e, kind, list) => { if (fromIsland(e)) app.rehattTray.setImages(kind, list); });
  ipcMain.handle('rehatt:tray-icon', (e, kind) => { if (!fromApp(e)) return null; if (kind) setTrayIcon(kind); return trayIcon; });
}

module.exports = { openIsland };
