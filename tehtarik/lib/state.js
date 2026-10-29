'use strict';
/*
 * The app's own settings, saved in %APPDATA%\Teh Tarik Meter\state.json.
 * Nothing secret is kept here: your claude.ai sign-in lives in Electron's
 * encrypted cookie store, never in this file.
 *
 * Saving is safe against power cuts (write a temporary file, then swap it in), and a
 * copy is kept once a day as state.bak.json. If state.json can't be read, the app
 * picks up from the backup and says so (1.1.0, like Lapis).
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  v: 2,
  widget: true,          // show the desktop widget
  onTop: true,           // keep it above other windows
  autostart: true,       // start with Windows
  alerts: true,          // Windows notifications at 80% and 95%
  paceAlert: true,       // warn when the pace will empty the glass before the refill
  freshAlert: true,      // "fresh glass ready" after hitting the limit
  sound: true,           // chimes in the easter-egg show
  hideFull: true,        // hide the widget in full screen and presentations
  shortcut: true,        // Ctrl+Alt+T shows or hides the widget
  theme: 'system',       // system | light | dark
  lang: 'en',            // en | ms
  drink: 'tehtarik',
  textSize: 'normal',    // normal | large | larger
  compact: false,
  festive: true,
  trayGlass: false,      // Rehatt: the tray icon shows your glass instead of Kopi
  welcomed: false,       // first-launch welcome done
  seenVersion: null,     // last version whose "What's new" was seen
  widgetPos: null,       // { x, y }
  orgId: null,           // which claude.ai organization to read
  cc: { connected: false, original: null, runner: null }, // Claude Code status line
  sent: {},              // alerts already sent: key -> time
  last: null,            // last claude.ai reading, so the widget isn't empty at start
  lastUpdateCheck: 0
};
const DRINK_IDS = ['tehtarik', 'kopio', 'milo', 'tehais', 'bandung'];
const pick = (v, list, d) => (list.includes(v) ? v : d);

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
function win(w) {
  if (!w || typeof w !== 'object') return null;
  const pct = Number(w.pct), r = Number(w.resetsAt);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return { pct, resetsAt: Number.isFinite(r) && r > 0 ? r : null };
}

function clean(s) {
  const o = JSON.parse(JSON.stringify(DEFAULTS));
  if (!s || typeof s !== 'object') return o;
  for (const k of ['widget', 'onTop', 'autostart', 'alerts', 'paceAlert', 'freshAlert', 'sound', 'hideFull', 'shortcut', 'compact', 'festive', 'trayGlass']) o[k] = bool(s[k], DEFAULTS[k]);
  o.theme = pick(s.theme, ['system', 'light', 'dark'], 'system');
  o.lang = pick(s.lang, ['en', 'ms'], 'en');
  o.drink = pick(s.drink, DRINK_IDS, 'tehtarik');
  o.textSize = pick(s.textSize, ['normal', 'large', 'larger'], 'normal');
  // Someone upgrading from 1.0.0 has already set up: skip the welcome, show "What's new".
  o.welcomed = bool(s.welcomed, !!(s.last || s.orgId));
  o.seenVersion = typeof s.seenVersion === 'string' && /^\d+\.\d+\.\d+$/.test(s.seenVersion) ? s.seenVersion : (s.welcomed === undefined && (s.last || s.orgId) ? '1.0.0' : null);
  if (s.widgetPos && Number.isFinite(s.widgetPos.x) && Number.isFinite(s.widgetPos.y)) o.widgetPos = { x: Math.round(s.widgetPos.x), y: Math.round(s.widgetPos.y) };
  if (typeof s.orgId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(s.orgId)) o.orgId = s.orgId;
  if (s.cc && typeof s.cc === 'object') {
    o.cc.connected = !!s.cc.connected;
    o.cc.original = s.cc.original && typeof s.cc.original === 'object' && !Array.isArray(s.cc.original) ? s.cc.original : null;
    o.cc.runner = s.cc.runner === 'node' || s.cc.runner === 'powershell' ? s.cc.runner : null;
  }
  if (s.sent && typeof s.sent === 'object') for (const [k, t] of Object.entries(s.sent)) if (typeof k === 'string' && k.length < 120 && Number.isFinite(t)) o.sent[k] = t;
  if (s.last && typeof s.last === 'object' && Number.isFinite(s.last.at)) {
    o.last = {
      at: s.last.at,
      session: win(s.last.session),
      weekly: win(s.last.weekly),
      extra: s.last.extra && Number.isFinite(s.last.extra.used) && Number.isFinite(s.last.extra.limit) ? { used: s.last.extra.used, limit: s.last.extra.limit, currency: /^[A-Z]{3}$/.test(s.last.extra.currency) ? s.last.extra.currency : 'USD' } : null,
      models: Array.isArray(s.last.models) ? s.last.models.slice(0, 6).map(m => m && typeof m.name === 'string' ? Object.assign({ name: m.name.slice(0, 40) }, win(m)) : null).filter(m => m && m.pct !== undefined) : []
    };
  }
  if (Number.isFinite(s.lastUpdateCheck)) o.lastUpdateCheck = s.lastUpdateCheck;
  return o;
}

const backupOf = file => file.replace(/\.json$/, '') + '.bak.json';

// Returns { state, restored }: restored is true when state.json was unreadable and the backup was used.
function readWithBackup(file) {
  let raw = null;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { /* first run, or missing */ }
  if (raw !== null) {
    try { return { state: clean(JSON.parse(raw)), restored: false }; } catch (e) { /* broken: try the backup */ }
    try { return { state: clean(JSON.parse(fs.readFileSync(backupOf(file), 'utf8'))), restored: true }; } catch (e) { /* no good backup */ }
  }
  return { state: clean(null), restored: false };
}
function read(file) { return readWithBackup(file).state; }

function writeJson(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch (e) { return false; }
}

// Writes state.json, and refreshes state.bak.json if it's from an earlier day.
function write(file, s, now) {
  if (!writeJson(file, s)) return;
  const bak = backupOf(file);
  try {
    const d = new Date(now || Date.now());
    const m = fs.existsSync(bak) ? fs.statSync(bak).mtime : null;
    if (!m || m.toDateString() !== d.toDateString()) fs.copyFileSync(file, bak);
  } catch (e) { /* best effort */ }
}

module.exports = { DEFAULTS, clean, read, readWithBackup, write, writeJson, backupOf };
