// Rehatt Settings: settings as their own app, with a big live Kopi who shows off every choice.
// Opened from the island's gear (settings-bridge-ui.js) or from the tray menu (tray-main.cjs).
// The settings code itself stays in the island: this window asks it for the lists and passes clicks on.
const { app, BrowserWindow, WebContentsView, ipcMain, nativeTheme, net, shell, dialog } = require('electron');
const path = require('node:path');

let win = null, dirty = false, closing = false;
// Its own app for Windows: own name, own icon, own taskbar button (tray-main.cjs makes the Start menu shortcut).
const APP_ID = 'com.chowkuanlaw.rehatt.settings', APP_NAME = 'Rehatt Settings', ICON = path.join(__dirname, 'assets', 'settings-icon.ico');
// light or dark, chosen in the app (the window's own buttons top right follow it)
const THEMES = { dark: { bg: '#0e0f11', symbol: '#e6e6ea' }, light: { bg: '#f6f6f8', symbol: '#1a1b1e' } };
const island = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /mascot\.html/.test(w.webContents.getURL()));
const fromApp = e => win && !win.isDestroyed() && e.sender === win.webContents;
const fromIsland = e => /mascot\.html/.test(e.senderFrame?.url || '');
const faceWanted = on => island()?.webContents.executeJavaScript(`window.__kopiFaceForSettings = ${on ? 'true' : 'false'}`).catch(() => {});

let theme = 'dark', appLang = 'en';
const lang = () => appLang;
const TABS = ['home', 'connect', 'stretch', 'usage', 'apps', 'news', 'character', 'wardrobe', 'general'];
function open(tab, sub) {
  tab = TABS.includes(tab) ? tab : '';
  if ((tab === 'stretch' || tab === 'usage') && typeof sub === 'string' && /^[a-z]{3,10}$/.test(sub)) pendingSub[tab] = sub;
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    if (tab) win.webContents.send('settings-app:goto', tab);
    return;
  }
  win = new BrowserWindow({
    width: 1120, height: 760, minWidth: 820, minHeight: 560, show: false, title: APP_NAME,
    backgroundColor: THEMES[theme].bg, icon: ICON,
    titleBarStyle: 'hidden', titleBarOverlay: { color: THEMES[theme].bg, symbolColor: THEMES[theme].symbol, height: 44 },
    webPreferences: { preload: path.join(__dirname, 'settings-app-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenuBarVisibility(false);
  if (process.platform === 'win32') {
    try {
      win.setAppDetails({ appId: APP_ID, appIconPath: ICON, appIconIndex: 0, relaunchDisplayName: APP_NAME,
        relaunchCommand: `"${process.execPath}" ` + (app.isPackaged ? '' : `"${app.getAppPath()}" `) + '--settings' });
    } catch {}
  }
  win.loadFile(path.join(__dirname, 'settings-app.html'), tab ? { query: { tab } } : {});
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('show', () => faceWanted(true));
  win.on('hide', () => faceWanted(false));
  win.on('minimize', () => faceWanted(false));
  win.on('restore', () => faceWanted(true));
  // closing with changes that are not saved yet: ask first
  win.on('close', e => {
    if (!dirty || closing) return;
    e.preventDefault();
    const ms = lang() === 'ms';
    dialog.showMessageBox(win, { type: 'question', title: 'Rehatt', noLink: true, defaultId: 0, cancelId: 2,
      buttons: ms ? ['Simpan', 'Jangan simpan', 'Batal'] : ['Save', 'Don\'t save', 'Cancel'],
      message: ms ? 'Ada perubahan yang belum disimpan.' : 'You have changes that are not saved yet.',
      detail: ms ? 'Simpan sebelum tutup?' : 'Save them before closing?' })
      .then(async ({ response }) => {
        if (response === 2 || !win) return;
        await relay({ kind: response === 0 ? 'save' : 'discard' });
        closing = true; win?.close();
      });
  });
  win.on('closed', () => {
    for (const k of Object.keys(views)) { try { views[k].webContents.close(); } catch {} delete views[k]; }
    win = null; dirty = false; closing = false; faceWanted(false);
    island()?.webContents.executeJavaScript('window.__kopiSettingsClosed?.()').catch(() => {}); // an unsaved draft is gone
  });
  // links in settings (for example "how to get your calendar link") open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) require('electron').shell.openExternal(url); return { action: 'deny' }; });
}

// Ask the island: a list, or a click on one of its options (it answers with the fresh list).
async function relay(req) {
  const isl = island();
  if (!isl) return { ok: false, error: 'Rehatt is still starting up.' };
  try { return { ok: true, ...(await isl.webContents.executeJavaScript(`window.__kopiRemoteSettings(${JSON.stringify(req)})`)) }; }
  catch (error) { return { ok: false, error: String(error?.message || error).slice(0, 200) }; }
}
const clean = req => ({
  kind: ['click', 'apps', 'app', 'save', 'discard'].includes(req?.kind) ? req.kind : 'list',
  id: typeof req?.id === 'string' ? req.id.slice(0, 20) : undefined,
  on: req?.on === true,
  which: req?.which === 'character' ? 'character' : 'general',
  index: Number.isInteger(req?.index) ? req.index : undefined,
  row: Number.isInteger(req?.row) ? req.row : undefined,
  values: Object.fromEntries(Object.entries(req?.values || {}).filter(([k, v]) => /^tc-in-[\w-]+$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 2000)]))
});

ipcMain.on('settings-app:open', (e, tab) => { if (fromIsland(e)) open(tab); });
ipcMain.handle('settings-app:get', async (e, req) => {
  if (!fromApp(e)) return null;
  const r = await relay(clean(req));
  if (r?.info) { dirty = !!r.info.dirty; appLang = r.info.lang === 'ms' ? 'ms' : 'en'; }
  return r;
});
ipcMain.on('settings-app:dirty', (e, on) => { if (fromApp(e)) dirty = !!on; });
ipcMain.on('settings-app:theme', (e, name) => {
  if (!fromApp(e) || !THEMES[name]) return;
  theme = name;
  try { win.setTitleBarOverlay({ color: THEMES[name].bg, symbolColor: THEMES[name].symbol, height: 44 }); win.setBackgroundColor(THEMES[name].bg); } catch {}
});
ipcMain.on('settings-app:frame', (e, url) => { // the app's own Kopi, drawn by the island from your draft
  if (fromIsland(e) && win && !win.isDestroyed() && typeof url === 'string' && url.startsWith('data:image/')) win.webContents.send('settings-app:face', url);
});
app.on('kopi-open-settings', (tab, sub) => open(tab, sub)); // tray menu, the engines, or the Start menu shortcut while Rehatt runs

// ---------- Stretch and Usage: Lapis's and Teh Tarik Meter's own screens, inside this window ----------
// Each is the original app's page (lapis://app/, tehtarik://app/), shown over the content area of its tab.
// Options that only made sense for the separate apps (their desktop widgets, the corner pop-up) are hidden:
// in Rehatt the island does those jobs.
const views = {}, pendingSub = {};
const EMBED_CSS = {
  stretch: `.set:has(> .switch[data-set="widget"]), .set:has(> .switch[data-set="widgetOnTop"]), .set:has(> .switch[data-set="widgetHideFull"]),
    .set:has(> .switch[data-set="trayRing"]) { display: none !important; }`,
  usage: `.setrow:has(#sw-onTop), .setrow:has(#sw-hideFull), .setrow:has(#sw-compact) { display: none !important; }`
};
const viewBg = () => (nativeTheme.shouldUseDarkColors ? '#0F1612' : '#F2F5EE');
function urlFor(tab, sub) {
  const E = app.rehattEngines;
  if (tab === 'stretch') return E.lapis.viewURL('main', { embedded: '1' });
  const q = { embedded: '1' };
  if (sub === 'welcome' || !E.ttm.welcomed()) q.welcome = '1'; else if (sub) q.tab = sub;
  return E.ttm.viewURL('app', q);
}
function viewFor(tab) {
  const E = app.rehattEngines; if (!E) return null;
  let v = views[tab];
  const sub = pendingSub[tab]; delete pendingSub[tab];
  if (v && !v.webContents.isDestroyed()) { if (sub) v.webContents.loadURL(urlFor(tab, sub)); return v; }
  const engine = tab === 'stretch' ? E.lapis : E.ttm;
  v = new WebContentsView({ webPreferences: { preload: engine.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, autoplayPolicy: 'no-user-gesture-required' } });
  v.setBackgroundColor(viewBg());
  const wc = v.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', e => e.preventDefault());
  wc.on('did-finish-load', () => {
    wc.insertCSS(EMBED_CSS[tab]).catch(() => {});
    wc.setZoomFactor(E.zoom()[tab === 'stretch' ? 'lapis' : 'ttm'] || 1);
  });
  wc.loadURL(urlFor(tab, sub));
  views[tab] = v;
  return v;
}
ipcMain.on('settings-app:embed', (e, tab, b) => {
  if (!fromApp(e)) return;
  for (const [k, v] of Object.entries(views)) if (k !== tab) { try { v.setVisible(false); } catch {} }
  if (!['stretch', 'usage'].includes(tab) || !b) return;
  const v = viewFor(tab); if (!v) return;
  if (!win.contentView.children.includes(v)) win.contentView.addChildView(v);
  const n = k => Math.max(0, Math.round(Number(b[k]) || 0));
  v.setBounds({ x: n('x'), y: n('y'), width: n('width'), height: n('height') });
  v.setVisible(true);
});
app.on('rehatt-zoom', (kind, z) => { const v = views[kind === 'lapis' ? 'stretch' : 'usage']; if (v && !v.webContents.isDestroyed()) v.webContents.setZoomFactor(z || 1); });
app.on('rehatt-ttm-welcomed', () => { const v = views.usage; if (v && !v.webContents.isDestroyed()) v.webContents.loadURL(urlFor('usage', '')); });
nativeTheme.on('updated', () => { for (const v of Object.values(views)) { try { v.setBackgroundColor(viewBg()); } catch {} } });
if (process.argv.includes('--settings')) app.whenReady().then(() => setTimeout(() => open(), 1200)); // started from the Start menu shortcut

// Home and Connections: your name, what your AI did, and which coding agents Rehatt follows (agents-main.cjs).
const os = require('node:os'), fs = require('node:fs');
const userName = () => { const n = String(os.userInfo().username || '').replace(/[._-]+/g, ' ').trim(); return n ? n[0].toUpperCase() + n.slice(1) : ''; };
async function connections() {
  const m = app.kopiMonitor; if (!m) return { ok: false };
  const view = m.view();
  const by = id => view.providers.find(p => p.provider === id) || {};
  const item = (id, on, available, p) => ({ id, on: !!on, available, state: p.connected ? p.state : 'off', detail: p.detail || '', project: p.source?.title || '', statusTaken: Boolean(p.statusTaken) });
  return { ok: true, list: [
    item('claudecode', by('claudecode').hooksInstalled, fs.existsSync(path.join(os.homedir(), '.claude')), by('claudecode')),
    item('codex', by('codex').hooksInstalled, by('codex').available !== false, by('codex'))
  ] };
}
async function connect(id, on) {
  const h = app.kopiMonitor?.handlers; if (!h) throw new Error('Rehatt is still starting up.');
  await h[on ? 'ai-monitor:hooks-install' : 'ai-monitor:hooks-uninstall']({ agent: id === 'codex' ? 'codex' : 'claude' });
  return connections();
}
ipcMain.handle('settings-app:home', e => fromApp(e) ? { ok: true, user: userName(), history: app.kopiMonitor?.history() || [] } : null);
ipcMain.handle('settings-app:connections', e => fromApp(e) ? connections() : null);
ipcMain.handle('settings-app:connect', async (e, req) => {
  if (!fromApp(e) || !['claudecode', 'codex'].includes(req?.id)) return null;
  try { return await connect(req.id, req.on === true); } catch (error) { return { ok: false, error: String(error?.message || error) }; }
});

// News: our updates, straight from the releases on GitHub (the same place you download Rehatt).
const RELEASES = 'https://api.github.com/repos/chowkuanlaw/rehatt/releases?per_page=12';
let news = null, newsAt = 0;
async function getNews() {
  if (news && Date.now() - newsAt < 10 * 60 * 1000) return news;
  try {
    const res = await net.fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Rehatt' } });
    if (!res.ok) throw new Error('GitHub ' + res.status);
    const list = (await res.json()).filter(r => !r.draft).map(r => ({
      tag: String(r.tag_name || ''), name: String(r.name || r.tag_name || ''), body: String(r.body || '').slice(0, 8000),
      date: r.published_at || r.created_at || '', url: String(r.html_url || ''), beta: !!r.prerelease
    }));
    news = { ok: true, version: app.getVersion(), releases: list }; newsAt = Date.now();
    return news;
  } catch (error) { return { ok: false, version: app.getVersion(), error: String(error?.message || error) }; }
}
ipcMain.handle('settings-app:news', e => fromApp(e) ? getNews() : null);
// only our own pages (a release, the download, the site)
ipcMain.on('settings-app:open-url', (e, url) => { if (fromApp(e) && /^https:\/\/(github\.com\/chowkuanlaw\/rehatt)(\/|$)/.test(String(url))) shell.openExternal(url); });

module.exports = { open };
