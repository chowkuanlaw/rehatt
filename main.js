require('./tray-main.cjs'); // first: tray icon + only one Rehatt at a time
require('./island-window-main');
const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const fs = require('fs');
const path = require('path');

require('./agents-main.cjs'); // Claude Code and Codex: question and done nudges
require('./extras-main.cjs');
require('./updater-main.cjs'); // Rehatt updates itself from its GitHub releases
require('./engines-main.cjs'); // Lapis Stretch and Teh Tarik Meter, inside Rehatt
require('./settings-app-main.cjs'); // Rehatt Settings: settings as their own app

app.setAppUserModelId('com.chowkuanlaw.rehatt');

// ============================================================
// WINDOW
// ============================================================

// The island is drawn in the middle of this invisible window, starting at its top edge.
const PANEL_WIDTH = 860; // wide and low, like NotchNook
const PANEL_HEIGHT = 320;

let mascotWindow = null;
let pointerTimer = null;
let mascotInteractive = false;

const PROJECT_URL = 'https://github.com/chowkuanlaw/rehatt';

// Only open this project's own pages.
function openRehattUrl(value) {
  try {
    const url = String(value || '').startsWith('/') ? new URL(value, PROJECT_URL) : new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith('/chowkuanlaw/rehatt')) shell.openExternal(url.toString());
  } catch {}
}

// ============================================================
// WHERE THE ISLAND SITS
// ============================================================
// "top": fixed at the top of your main screen, like a Dynamic Island (the default). "free": wherever you drag it.
// x, y = where the top-centre of the small island is on your screen.
const PLACE_FILE = () => path.join(app.getPath('userData'), 'rehatt-position.json');
let place = { mode: 'top', x: null, y: null };
try { place = { ...place, ...JSON.parse(fs.readFileSync(PLACE_FILE(), 'utf8')) }; } catch {}
if (!['free', 'top'].includes(place.mode)) place.mode = 'top';
const savePlace = () => { try { fs.writeFileSync(PLACE_FILE(), JSON.stringify(place)); } catch {} };

// How big the island is drawn right now (the island tells us), so near a screen edge it opens inwards.
let islandSize = { width: 200, height: 40 };
let drag = null; // while you drag: where the mouse holds the island, relative to its top-centre
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function topCentre() {
  const b = screen.getPrimaryDisplay().bounds;
  return { x: Math.round(b.x + b.width / 2), y: b.y };
}

// Near a screen edge the window moves so the open island fits. It glides there in one smooth motion (the island
// reports its final size when it starts to open or close), instead of jumping a few pixels every frame.
let glide = null;
function moveWindow(nx, ny, smooth) {
  clearInterval(glide); glide = null;
  const from = mascotWindow.getBounds();
  if (!smooth || (Math.abs(from.x - nx) < 3 && Math.abs(from.y - ny) < 3)) { if (from.x !== nx || from.y !== ny) mascotWindow.setPosition(nx, ny, false); return; }
  const start = Date.now(), ms = 240, ease = t => 1 - Math.pow(1 - t, 3);
  glide = setInterval(() => {
    if (!mascotWindow || mascotWindow.isDestroyed()) { clearInterval(glide); return; }
    const t = Math.min(1, (Date.now() - start) / ms), k = ease(t);
    mascotWindow.setPosition(Math.round(from.x + (nx - from.x) * k), Math.round(from.y + (ny - from.y) * k), false);
    if (t >= 1) { clearInterval(glide); glide = null; }
  }, 15);
}

function positionMascot(smooth = false) {
  if (!mascotWindow || mascotWindow.isDestroyed()) return;
  let x, y;
  if (place.mode === 'top' || !Number.isFinite(place.x) || !Number.isFinite(place.y)) {
    ({ x, y } = topCentre());
  } else {
    // Keep the whole island on the screen: it slides in from an edge while it is open, and back when it closes.
    const wa = screen.getDisplayNearestPoint({ x: Math.round(place.x), y: Math.round(place.y) }).workArea;
    const half = islandSize.width / 2 + 12;
    x = clamp(place.x, wa.x + half, wa.x + wa.width - half);
    y = clamp(place.y, wa.y, wa.y + wa.height - islandSize.height - 16);
  }
  moveWindow(Math.round(x - PANEL_WIDTH / 2), Math.round(y), smooth && !drag);
}

function setPlace(mode) {
  if (mode === 'reset') { const c = topCentre(); place = { mode: 'free', x: c.x, y: c.y }; }
  else if (['free', 'top'].includes(mode)) place.mode = mode;
  savePlace(); positionMascot(); sendPlace();
}
const sendPlace = () => { if (mascotWindow && !mascotWindow.isDestroyed()) mascotWindow.webContents.send('island:place', { mode: place.mode }); };
app.rehattPlace = { get: () => place.mode, set: setPlace }; // the tray menu and the settings app change it too

const fromIsland = event => /mascot\.html/.test(event.senderFrame?.url || '');
ipcMain.handle('app:launch', event => (fromIsland(event) ? { atLogin: process.argv.includes('--rehatt-login') } : null));
ipcMain.handle('island:place-get', event => (fromIsland(event) ? { ok: true, mode: place.mode } : { ok: false }));
ipcMain.on('island:place-set', (event, mode) => { if (fromIsland(event)) setPlace(mode); });
ipcMain.on('island:size', (event, size) => {
  if (!fromIsland(event)) return;
  const w = Number(size?.width), h = Number(size?.height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return;
  islandSize = { width: clamp(w, 40, PANEL_WIDTH), height: clamp(h, 20, PANEL_HEIGHT) };
  if (place.mode === 'free') positionMascot(true);
});
ipcMain.on('island:drag', (event, on) => {
  if (!fromIsland(event) || !mascotWindow) return;
  if (on && place.mode === 'free') {
    const c = screen.getCursorScreenPoint(), b = mascotWindow.getBounds();
    drag = { dx: c.x - (b.x + PANEL_WIDTH / 2), dy: c.y - b.y };
  } else if (!on && drag) {
    drag = null;
    // dropped near the top middle: it clicks back into its home spot
    const c = topCentre();
    if (Math.abs(place.x - c.x) < 48 && place.y - c.y < 28) { place.x = c.x; place.y = c.y; }
    savePlace(); positionMascot();
  }
});
function followDrag() {
  if (!drag || !mascotWindow) return;
  const c = screen.getCursorScreenPoint(), wa = screen.getDisplayNearestPoint(c).workArea;
  place.x = clamp(c.x - drag.dx, wa.x + 30, wa.x + wa.width - 30);
  place.y = clamp(c.y - drag.dy, wa.y, wa.y + wa.height - 30);
  positionMascot();
}

// ============================================================
// POINTER
// ============================================================
// Safety net: the island repeats its choice at least once a second. If it goes quiet while the window
// still catches the mouse (a frozen or throttled page), let go after 2 s, so clicks reach the apps below.
let interactiveHeardAt = 0;
let lastPointerKey = '';
let lastPointerAt = 0;

function sendPointer() {
  if (!mascotWindow || mascotWindow.isDestroyed() || !mascotWindow.isVisible()) return;
  followDrag();
  if (mascotInteractive && !drag && Date.now() - interactiveHeardAt > 2000) setMascotInteractive(false);
  const cursor = screen.getCursorScreenPoint();
  const bounds = mascotWindow.getBounds();
  // Only tell the island when the mouse moved (or the island moved): this runs 50 times a second,
  // and sending the same point over and over kept the PC busy for nothing. A refresh every second stays.
  const key = cursor.x + ',' + cursor.y + ',' + bounds.x + ',' + bounds.y;
  const stamp = Date.now();
  if (key === lastPointerKey && stamp - lastPointerAt < 1000) return;
  lastPointerKey = key;
  lastPointerAt = stamp;
  mascotWindow.webContents.send('companion:pointer', {
    x: cursor.x - bounds.x,
    y: cursor.y - bounds.y,
    insideWindow: cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width && cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height
  });
}

// ============================================================
// INTERACTION
// ============================================================

function setMascotInteractive(interactive) {
  if (!mascotWindow || mascotWindow.isDestroyed()) return;
  const next = Boolean(interactive);
  if (next === mascotInteractive) return;
  mascotInteractive = next;
  mascotWindow.setIgnoreMouseEvents(!next, { forward: true });
}

// ============================================================
// CREATE WINDOW
// ============================================================

function createMascot() {
  mascotWindow = new BrowserWindow({
    icon: path.join(__dirname, 'assets', 'icon.ico'), // Kopi under the island (Alt+Tab, Task Manager)
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true, // to type a note
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  mascotWindow.setAlwaysOnTop(true, 'floating');
  mascotWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setMascotInteractive(false);
  positionMascot();
  mascotWindow.loadFile('mascot.html');
  // Always normal size: Chromium remembers a zoom level per page, and a zoomed island looks broken.
  // (Ctrl + scroll or Ctrl + plus can't zoom it either.)
  mascotWindow.webContents.on('did-finish-load', () => {
    mascotWindow.webContents.setZoomFactor(1);
    mascotWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    sendPlace();
  });
  mascotWindow.webContents.on('zoom-changed', () => mascotWindow.webContents.setZoomFactor(1));
  mascotWindow.once('ready-to-show', () => mascotWindow.showInactive());
  mascotWindow.on('closed', () => { mascotWindow = null; });
}

// ============================================================
// OTHER IPC
// ============================================================

ipcMain.on('kopi:open-url', (_event, value) => openRehattUrl(value));
ipcMain.on('island:set-interactive', (_event, interactive) => {
  interactiveHeardAt = Date.now();
  setMascotInteractive(interactive);
});
ipcMain.on('window:close', () => app.quit());

// Goodbye: before closing, Kopi waves "Bye!" and the island
// closes smoothly (kopi-fun.js), then the app really quits.
let goodbyeShown = false;
app.on('before-quit', event => {
  if (goodbyeShown || !mascotWindow || mascotWindow.isDestroyed() || !mascotWindow.isVisible()) return;
  goodbyeShown = true;
  event.preventDefault();
  mascotWindow.webContents.send('kopi:goodbye');
  setTimeout(() => app.quit(), 1700); // after the goodbye (kopi-fun.js)
});

// ============================================================
// APP
// ============================================================

app.whenReady().then(() => {
  // CI only: open every screen and save screenshots (tools/smoke.cjs)
  if (process.env.REHATT_SMOKE) require('./tools/smoke.cjs')(() => mascotWindow, app);
  if (place.mode === 'free' && !Number.isFinite(place.x)) { const c = topCentre(); place.x = c.x; place.y = c.y; }
  createMascot();
  pointerTimer = setInterval(sendPointer, 20);
  screen.on('display-metrics-changed', positionMascot);
  screen.on('display-added', positionMascot);
  screen.on('display-removed', positionMascot);
});

app.on('activate', () => { if (!mascotWindow) createMascot(); });
app.on('before-quit', () => { if (pointerTimer) { clearInterval(pointerTimer); pointerTimer = null; } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
