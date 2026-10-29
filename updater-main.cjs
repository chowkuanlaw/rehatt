'use strict';
/*
 * Rehatt keeps itself up to date, like Lapis and Teh Tarik Meter did: an installed copy (Rehatt-Setup-<version>.exe)
 * checks the GitHub releases of chowkuanlaw/rehatt when it starts and once a day, downloads a new version in the
 * background, and then offers "Restart to update" (in the island, the tray menu and Settings). If you don't restart,
 * the update installs the next time you quit. The portable zip can't replace itself: it only says a new version is
 * out, with a link to download it. Nothing about you is sent: it's the same request any download makes.
 * Settings: "Update automatically" (on by default) in Rehatt Settings → About, the Stretch and the Usage tabs.
 */
const { app, net, shell, Notification, ipcMain, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const REPO = 'chowkuanlaw/rehatt';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const EVERY = 24 * 3600e3;
const FILE = () => path.join(app.getPath('userData'), 'rehatt-update.json');

const STORE = process.windowsStore === true;
const INSTALLED = app.isPackaged && !STORE && fs.existsSync(path.join(process.resourcesPath || '', 'app-update.yml'));
let S = { auto: true, lastCheck: 0, seenVersion: '' };
try { S = { ...S, ...JSON.parse(fs.readFileSync(FILE(), 'utf8')) }; } catch {}
const save = () => { try { fs.writeFileSync(FILE(), JSON.stringify(S)); } catch {} };
const R = { update: null, updateMsg: null, checking: false, notified: false };
const listeners = new Set();
const changed = () => { for (const fn of listeners) { try { fn(state()); } catch {} } };
const msg = (k, v) => ({ k, v: v || {} });

let autoUpdater = null;
if (INSTALLED) {
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.logger = null;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', info => { R.update = { version: info.version, state: 'downloading', percent: 0 }; R.updateMsg = msg('upd.downloading', { v: info.version }); changed(); });
    autoUpdater.on('update-not-available', () => { R.update = null; R.updateMsg = msg('upd.latest'); changed(); });
    autoUpdater.on('download-progress', p => {
      if (!R.update || R.update.state !== 'downloading') return;
      const pc = Math.floor(p.percent || 0);
      if (pc !== R.update.percent) { R.update.percent = pc; changed(); }
    });
    autoUpdater.on('update-downloaded', info => {
      R.update = { version: info.version, state: 'ready' }; R.updateMsg = msg('upd.ready', { v: info.version }); changed();
      if (!R.notified && Notification.isSupported()) {
        R.notified = true;
        const n = new Notification({ title: 'Rehatt update ready', body: `Version ${info.version} is downloaded. Restart Rehatt to use it.`, silent: true });
        n.on('click', () => app.emit('kopi-open-settings', 'news'));
        n.show();
      }
    });
    autoUpdater.on('error', () => { if (R.update && R.update.state === 'downloading') R.update = null; R.updateMsg = msg('upd.error'); R.checking = false; changed(); });
  } catch { autoUpdater = null; }
}

const isNewer = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); return false; };
async function check(manual) {
  if (STORE || R.checking || !app.isPackaged) { if (manual && !app.isPackaged) { R.updateMsg = msg('upd.latest'); changed(); } return; }
  if (R.update && (R.update.state === 'downloading' || R.update.state === 'ready')) { if (manual) changed(); return; }
  R.checking = true; if (manual) R.updateMsg = msg('upd.checking');
  S.lastCheck = Date.now(); save(); changed();
  if (autoUpdater) {
    try { await autoUpdater.checkForUpdates(); } catch { if (manual) R.updateMsg = msg('upd.offline'); }
    R.checking = false; changed();
    return;
  }
  try { // portable copy: a plain public request for the latest release tag
    const res = await net.fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Rehatt' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const tag = String((await res.json()).tag_name || '');
    const m = /^v?(\d+\.\d+\.\d+)$/.exec(tag);
    if (m && isNewer(m[1], app.getVersion())) { R.update = { version: m[1], state: 'available' }; R.updateMsg = msg('upd.available', { v: m[1] }); }
    else { R.update = null; R.updateMsg = msg('upd.latest'); }
  } catch { if (manual) R.updateMsg = msg('upd.offline'); }
  R.checking = false; changed();
}
function install() {
  if (R.update?.state === 'available') { shell.openExternal(RELEASES_URL); return; }
  if (!autoUpdater || R.update?.state !== 'ready') return;
  app.emit('rehatt-before-update');
  setImmediate(() => autoUpdater.quitAndInstall(true, true)); // silent install, then Rehatt opens again
}
let UPDATED = null; // { from, v } on the first start after an update: the island says "updated · what's new" once
function state() {
  return { installed: INSTALLED, store: STORE, auto: S.auto, update: R.update, updateMsg: R.updateMsg, checking: R.checking, version: app.getVersion(), updated: UPDATED };
}
function setAuto(on) { S.auto = !!on; save(); if (S.auto) setTimeout(() => check(false), 0); changed(); }

// "What's new": once after each update, the island says so and Settings → News has the notes.
function justUpdated() {
  const v = app.getVersion();
  if (!S.seenVersion) { S.seenVersion = v; save(); return null; } // a new install
  if (S.seenVersion === v) return null;
  const from = S.seenVersion; S.seenVersion = v; save();
  return isNewer(v, from) ? { from, v } : null;
}

app.whenReady().then(() => {
  UPDATED = justUpdated();
  if (S.auto && !STORE) setTimeout(() => check(false), 8000);
  const t = setInterval(() => { if (S.auto && !STORE && !R.checking && Date.now() - (S.lastCheck || 0) > EVERY) check(false); }, 3600e3); t.unref?.();
});
const fromApp = e => /^file:.*\/(mascot|settings-app)\.html/.test(e.senderFrame?.url || '');
ipcMain.handle('rehatt:update-get', e => (fromApp(e) ? state() : null));
ipcMain.on('rehatt:update', (e, a) => {
  if (!fromApp(e)) return;
  if (a === 'check') check(true); else if (a === 'install') install(); else if (a === 'auto-on') setAuto(true); else if (a === 'auto-off') setAuto(false);
});
listeners.add(st => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && /(mascot|settings-app)\.html/.test(w.webContents.getURL())) w.webContents.send('rehatt:update', st); });

app.rehattUpdate = { state, check, install, setAuto, open: () => shell.openExternal(RELEASES_URL), onChange: fn => listeners.add(fn), justUpdated };
module.exports = app.rehattUpdate;
