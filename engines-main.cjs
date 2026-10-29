'use strict';
/*
 * Lapis Stretch and Teh Tarik Meter, running inside Rehatt (lapis/engine.cjs, tehtarik/engine.cjs).
 * Here: what they get from Rehatt (your AI's state, the status line numbers, updates, start with Windows,
 * Rehatt Settings, the island, the tray) and their own pages (lapis://app/ and tehtarik://app/).
 */
const { app, protocol, globalShortcut, BrowserWindow, ipcMain, nativeTheme } = require('electron');

// Both apps load their pages from their own private address, never file:// or the web. Registered once, before ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'lapis', privileges: { standard: true, secure: true } },
  { scheme: 'tehtarik', privileges: { standard: true, secure: true } }
]);

const island = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /mascot\.html/.test(w.webContents.getURL()));
const openIsland = view => { const w = island(); if (!w) return; w.showInactive(); w.webContents.send('extras:shortcut', view || 'home'); };
const openSettings = (tab, sub) => app.emit('kopi-open-settings', tab, sub);
const update = {
  state: () => app.rehattUpdate?.state() || {},
  check: manual => app.rehattUpdate?.check(manual),
  install: () => app.rehattUpdate?.install(),
  open: () => app.rehattUpdate?.open(),
  setAuto: on => app.rehattUpdate?.setAuto(on)
};
const autostart = { get: () => Boolean(app.rehattAutostart?.get()), set: on => app.rehattAutostart?.set(on) };
const aiBusy = () => (app.kopiMonitor?.view().providers || []).some(p => p.connected && ['running', 'sending'].includes(p.state));
let zoom = { lapis: 1, ttm: 1 };

const lapis = require('./lapis/engine.cjs').setup(null, {
  aiBusy, update, autostart, openIsland, openSettings,
  version: () => app.getVersion(),
  onChange: () => app.rehattTray?.refresh(),
  setTrayImages: (kind, images) => app.rehattTray?.setImages(kind, images),
  onZoom: z => { zoom.lapis = z; app.emit('rehatt-zoom', 'lapis', z); },
  onTheme: theme => setTheme(theme),
  onLang: lang => setLang(lang, 'lapis')
});

// Rehatt's status line hands over the limits after every reply (agent-hooks.cjs): the same numbers TTM's own script saved.
function feed() {
  const u = app.kopiMonitor?.usage?.(); if (!u || !u.at) return null;
  const win = w => (w && Number.isFinite(Number(w.used)) ? { pct: Math.min(100, Math.max(0, Number(w.used))), resetsAt: w.resetsAt ? w.resetsAt * 1000 : null } : null);
  const session = win(u.fiveHour), weekly = win(u.sevenDay);
  return session || weekly ? { at: u.at, session, weekly } : null;
}
const cc = {
  connected: () => Boolean((app.kopiMonitor?.view().providers || []).find(p => p.provider === 'claudecode')?.hooksInstalled),
  connect: () => app.kopiMonitor?.handlers?.['ai-monitor:hooks-install']?.({ agent: 'claude' }),
  disconnect: () => app.kopiMonitor?.handlers?.['ai-monitor:hooks-uninstall']?.({ agent: 'claude' })
};

// Ctrl+Alt+T shows or hides the island (Teh Tarik Meter's shortcut for its widget)
const SHORTCUT = 'CommandOrControl+Alt+T';
let shortcutOn = true, shortcutTaken = false;
function toggleIsland() { const w = island(); if (!w) return; if (w.isVisible()) w.hide(); else { w.showInactive(); } }
function applyShortcut() {
  try { globalShortcut.unregister(SHORTCUT); } catch {}
  shortcutTaken = false;
  if (!shortcutOn) return;
  let ok = false;
  try { ok = globalShortcut.register(SHORTCUT, toggleIsland); } catch { ok = false; }
  shortcutTaken = !ok;
}

const ttm = require('./tehtarik/engine.cjs').setup(null, {
  feed, cc, update, autostart, openIsland, openSettings,
  version: () => app.getVersion(),
  shortcut: { get: () => shortcutOn, set: on => { shortcutOn = !!on; applyShortcut(); }, taken: () => shortcutTaken },
  onChange: () => app.rehattTray?.refresh(),
  setTrayImages: (kind, images) => app.rehattTray?.setImages(kind, images),
  onAlert: a => { const w = island(); if (w) w.webContents.send('ttm:alert', a); },
  welcomeDone: () => app.emit('rehatt-ttm-welcomed'),
  hideIsland: () => island()?.hide(),
  onZoom: z => { zoom.ttm = z; app.emit('rehatt-zoom', 'ttm', z); },
  onTheme: theme => setTheme(theme),
  onLang: lang => setLang(lang, 'ttm')
});

// One language and one light/dark for everything: Rehatt's own choice also goes to Lapis and Teh Tarik Meter.
let lang = '';
function setLang(next, from) {
  if (!['en', 'ms'].includes(next) || next === lang) return;
  lang = next;
  if (from !== 'lapis' && lapis.S.lang !== next) lapis.setSetting('lang', next);
  if (from !== 'ttm' && ttm.S.lang !== next) ttm.setSetting('lang', next);
  if (from !== 'island') { const w = island(); if (w) w.webContents.send('rehatt:lang', next); }
}
function setTheme(theme) { // 'auto' | 'light' | 'dark'
  const src = theme === 'auto' || theme === 'system' ? 'system' : theme;
  if (!['system', 'light', 'dark'].includes(src)) return;
  nativeTheme.themeSource = src;
  if (lapis.S.theme !== theme && ['auto', 'light', 'dark'].includes(theme)) lapis.S.theme = theme;
  app.emit('rehatt-theme', src);
}
const fromApp = e => /^file:.*\/(mascot|settings-app)\.html/.test(e.senderFrame?.url || '');
ipcMain.on('rehatt:lang', (e, next) => { if (fromApp(e)) setLang(String(next), 'island'); });
ipcMain.on('rehatt:theme', (e, next) => { if (fromApp(e)) setTheme(String(next)); });

app.whenReady().then(() => {
  protocol.handle('lapis', lapis.serveApp);
  protocol.handle('tehtarik', ttm.serveApp);
  shortcutOn = ttm.S.shortcut !== false;
  applyShortcut();
  nativeTheme.themeSource = lapis.S.theme === 'light' || lapis.S.theme === 'dark' ? lapis.S.theme : 'system';
});
app.on('will-quit', () => { try { globalShortcut.unregister(SHORTCUT); } catch {} });

app.rehattEngines = { lapis, ttm, zoom: () => zoom, setLang, setTheme };
module.exports = app.rehattEngines;
