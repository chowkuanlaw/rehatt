'use strict';
// Stretch breaks (from Lapis): every 20 minutes or so your kuih asks for a quick desk stretch, right in the island.
// Working hours only, quiet during meetings and full-screen apps, and time away from your desk counts as a break.
// When Claude Code or Codex starts on a job and a stretch is due soon anyway, Rehatt asks for it now: you rest while
// your AI works. Water reminders come along too. Everything is saved on this PC in rehatt-stretch.json.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const L = require('./lapis/data.js');

const AWAY_SECS = 300; // 5 min without keyboard or mouse = away from the desk
const MEETING_RECHECK = 60e3, AFTER_MEETING = 120e3, WATER_LATER = 15 * 60e3;
const EARLY_FOR_CLAUDE = 6 * 60e3; // a stretch due within 6 minutes comes now when your AI starts working
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

const DEFAULTS = {
  on: true, interval: 20, snooze: 10, goal: 8, kuih: 'lapis', sound: true, withAi: true, notify: false,
  workOn: true, workDays: [1, 2, 3, 4, 5], workStart: 540, workEnd: 1080, lunchOn: true, lunchStart: 780, lunchEnd: 840,
  quietMeetings: true, awayReset: true, waterOn: true, waterEvery: 60, waterGoal: 8, ramadanOn: true,
  paused: false, pauseUntil: 0, pausedLeft: 0, nextDue: 0, idx: 0, history: {}
};
const CHOICES = { interval: [15, 20, 30, 45, 60], snooze: [5, 10, 15], waterEvery: [30, 45, 60, 90, 120] };
const BOOLS = ['on', 'sound', 'withAi', 'notify', 'workOn', 'lunchOn', 'quietMeetings', 'awayReset', 'waterOn', 'ramadanOn'];

// Only known settings with the right types are read back; anything else falls back to the default.
function cleanState(saved) {
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
  const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
  for (const [k, list] of Object.entries(CHOICES)) if (list.includes(saved[k])) out[k] = saved[k];
  for (const k of [...BOOLS, 'paused']) if (typeof saved[k] === 'boolean') out[k] = saved[k];
  if (own(L.KUIH_BY, saved.kuih)) out.kuih = saved.kuih;
  for (const [k, lo, hi] of [['goal', 1, 30], ['waterGoal', 1, 20], ['idx', 0, 1e9]]) { const v = int(saved[k], lo, hi); if (v !== undefined) out[k] = v; }
  for (const [k, hi] of [['pauseUntil', 1e15], ['pausedLeft', 24 * 3600e3], ['nextDue', 1e15]]) { const v = num(saved[k], 0, hi); if (v !== undefined) out[k] = v; }
  if (Array.isArray(saved.workDays)) { const d = [...new Set(saved.workDays.filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort(); if (d.length) out.workDays = d; }
  const ws = int(saved.workStart, 0, 1410), we = int(saved.workEnd, 30, 1440);
  if (ws !== undefined && we !== undefined && ws < we) { out.workStart = ws; out.workEnd = we; }
  const ls = int(saved.lunchStart, 0, 1410), le = int(saved.lunchEnd, 30, 1440);
  if (ls !== undefined && le !== undefined && ls < le) { out.lunchStart = ls; out.lunchEnd = le; }
  if (saved.history && typeof saved.history === 'object') {
    for (const [day, v] of Object.entries(saved.history)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !v || typeof v !== 'object') continue;
      const by = {}; for (const [id, n] of Object.entries(v.by || {})) if (own(L.BY, id) && Number.isInteger(n) && n > 0) by[id] = n;
      out.history[day] = { total: int(v.total, 0, 1000) || 0, water: int(v.water, 0, 100) || 0, by };
    }
  }
  return out;
}

// Working hours: false outside your days and hours, and during lunch.
function isWorkTime(S, d) {
  if (!S.workOn) return true;
  if (!S.workDays.includes(d.getDay())) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < S.workStart || m >= S.workEnd) return false;
  return !(S.lunchOn && m >= S.lunchStart && m < S.lunchEnd);
}
// When working time starts again (start of day, or end of lunch), or null.
function nextWorkStart(S, from) {
  if (!S.workOn) return from;
  for (let i = 0; i < 8; i++) {
    const day = new Date(from); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + i);
    if (!S.workDays.includes(day.getDay())) continue;
    const starts = [S.workStart];
    if (S.lunchOn && S.lunchEnd > S.workStart && S.lunchEnd < S.workEnd) starts.push(S.lunchEnd);
    for (const m of starts) { const at = new Date(day); at.setMinutes(m); if (at.getTime() > from) return at.getTime(); }
  }
  return null;
}

// "Stay quiet in meetings": an app is full screen or presenting, or Windows Do not disturb is on.
// One read-only PowerShell call, only when a reminder is about to show. Anything that fails means "not quiet".
const PS = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const QUIET_PS = "$s=-1;try{Add-Type -Namespace RehattQuiet -Name N -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern int SHQueryUserNotificationState(out int s);';$x=0;if([RehattQuiet.N]::SHQueryUserNotificationState([ref]$x) -eq 0){$s=$x}}catch{};" +
  "$m=-1;try{$null=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime];$m=[int][Windows.UI.Notifications.ToastNotificationManager]::GetDefault().NotificationMode}catch{};\"$s $m\"";
function quietNow() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve(false);
    try {
      execFile(PS, ['-NoProfile', '-NonInteractive', '-Command', QUIET_PS], { windowsHide: true, timeout: 10000 }, (err, out) => {
        const [s, m] = String(out || '').trim().split(/\s+/).map(Number);
        resolve(!err && ([2, 3, 4, 7].includes(s) || m === 1 || m === 2)); // busy, full screen, presenting, app · priority/alarms only
      });
    } catch { resolve(false); }
  });
}

function setup(electron, options = {}) {
  const { app, BrowserWindow, ipcMain, powerMonitor, Notification } = electron;
  const file = () => path.join(options.userData || app.getPath('userData'), 'rehatt-stretch.json');
  let S; try { S = cleanState(JSON.parse(fs.readFileSync(file(), 'utf8'))); } catch { S = cleanState(null); }
  let saveTimer = null;
  const writeNow = () => { try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file() + '.tmp', JSON.stringify(S)); fs.renameSync(file() + '.tmp', file()); } catch {} };
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(writeNow, 300); };
  const R = { mode: 'waiting', cur: null, dueAt: 0, activeEnd: 0, activeSecs: 0, switched: false, msgUntil: 0, awaySince: null, locked: null,
    resting: false, quiet: false, quietCheck: false, water: null, waterUntil: 0, nextWater: Date.now() + S.waterEvery * 60e3, skips: 0, snoozed: false, reason: '', backMins: 0, backUntil: 0 };

  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => { const k = dayKey(new Date()); return S.history[k] || (S.history[k] = { total: 0, water: 0, by: {} }); };
  const puasa = () => (S.ramadanOn ? L.ramadanOn(new Date()) : null);
  const skipWalk = () => { if (puasa()) { let n = 0; while (L.CYCLE[S.idx % L.CYCLE.length] === 'walk' && n++ < L.CYCLE.length) S.idx++; } };
  const upNext = () => L.BY[L.CYCLE[S.idx % L.CYCLE.length]];
  const schedule = ms => { S.nextDue = Date.now() + ms; if (S.paused) S.pausedLeft = ms; save(); };
  if (!S.nextDue || S.nextDue < Date.now()) S.nextDue = Date.now() + S.interval * 60e3; // a fresh countdown at start

  // Who may ask: the island and the Rehatt Settings app (both pages of this app).
  const trusted = e => /^file:.*\/(mascot|settings-app)\.html/.test(e.senderFrame?.url || '');
  function publicState() {
    const t = today(), stats = L.computeStats(S.history, S.goal, S.workOn ? S.workDays : null, new Date(), { saver: true, waterGoal: S.waterGoal });
    const { history, ...settings } = S;
    const week = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const v = S.history[dayKey(d)]; week.push({ day: dayKey(d), total: v?.total || 0, water: v?.water || 0 }); }
    return { ok: true, ...settings, mode: R.mode, cur: R.cur, upNext: upNext().id, activeEnd: R.activeEnd, activeSecs: R.activeSecs, switched: R.switched,
      away: Boolean(R.awaySince), resting: R.resting, backAt: R.resting ? nextWorkStart(S, Date.now()) : 0, quiet: R.quiet, reason: R.reason,
      water: S.waterOn && !puasa() ? R.water : null, nextWater: S.waterOn && !R.resting && !puasa() ? R.nextWater : 0, ramadan: Boolean(puasa()),
      today: { total: t.total, water: t.water || 0, by: t.by }, streak: stats.streak, total: stats.total, week,
      festival: L.festivalOn(new Date())?.id || null, backMins: Date.now() < R.backUntil ? R.backMins : 0,
      mood: R.skips >= 3 ? 'sad' : R.snoozed ? 'drowsy' : t.total >= S.goal ? 'proud' : '' };
  }
  function broadcast() {
    const st = publicState();
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && /(mascot|settings-app)\.html/.test(w.webContents.getURL())) w.webContents.send('stretch:state', st);
  }
  function toast(title, body) {
    if (!S.notify || !Notification?.isSupported()) return; // off by default: the island itself already asks
    try { const n = new Notification({ title, body, silent: true }); n.on('click', () => { for (const w of BrowserWindow.getAllWindows()) if (/mascot\.html/.test(w.webContents.getURL())) { w.showInactive(); w.webContents.send('extras:shortcut', 'stretch'); } }); n.show(); } catch {}
  }

  // ---------- the reminder ----------
  function becomeDue(reason = '') {
    R.cur = upNext().id; R.mode = 'due'; R.dueAt = Date.now(); R.quiet = false; R.reason = reason;
    if (R.water === 'ask') { R.water = null; R.nextWater = Date.now() + WATER_LATER; } // the stretch takes the island; water asks again later
    const ex = L.BY[R.cur]; toast(reason === 'ai' ? 'Your AI is working: time to stretch' : 'Time to stretch', `${ex.name} · ${ex.dose}`);
    broadcast();
  }
  async function dueOrHold(reason) {
    if (!S.quietMeetings) { becomeDue(reason); return; }
    R.quietCheck = true; const quiet = await quietNow(); R.quietCheck = false;
    if (R.mode !== 'waiting' || S.paused || R.resting) return;
    if (quiet) { S.nextDue = Date.now() + MEETING_RECHECK; if (!R.quiet) { R.quiet = true; broadcast(); } return; }
    if (R.quiet) { R.quiet = false; S.nextDue = Date.now() + AFTER_MEETING; broadcast(); return; } // 2 minutes after the meeting
    becomeDue(reason);
  }
  function start() {
    const ex = L.BY[R.cur || upNext().id];
    R.cur = ex.id; R.mode = 'active'; R.activeSecs = ex.secs; R.activeEnd = Date.now() + ex.secs * 1000; R.switched = false;
    broadcast();
  }
  const advance = () => { if (R.cur === upNext().id) S.idx++; skipWalk(); };
  function finish() {
    R.skips = 0; R.snoozed = false;
    const rec = today(); rec.total++; rec.by[R.cur] = (rec.by[R.cur] || 0) + 1;
    advance(); schedule(S.interval * 60e3);
    R.mode = 'done'; R.msgUntil = Date.now() + 5000; R.reason = '';
    broadcast();
  }
  function skip() { if (R.mode === 'due') R.skips++; R.snoozed = false; advance(); schedule(S.interval * 60e3); R.mode = 'waiting'; R.cur = null; R.reason = ''; broadcast(); }
  function snooze() { R.snoozed = true; schedule(S.snooze * 60e3); R.mode = 'snoozed'; R.msgUntil = Date.now() + 3500; R.reason = ''; broadcast(); }
  function different() {
    const base = R.cur || upNext().id; let i = S.idx;
    do { i++; } while (L.CYCLE[i % L.CYCLE.length] === base || (puasa() && L.CYCLE[i % L.CYCLE.length] === 'walk'));
    S.idx = i; save();
    if (R.mode === 'due') R.cur = upNext().id;
    broadcast();
  }
  function togglePause() {
    if (S.paused) { S.paused = false; S.pauseUntil = 0; S.nextDue = Date.now() + Math.max(S.pausedLeft, 1000); }
    else { S.paused = true; S.pausedLeft = Math.max(0, S.nextDue - Date.now()); if (R.mode !== 'active') { R.mode = 'waiting'; R.cur = null; } }
    save(); broadcast();
  }
  function pauseFor(kind) {
    if (S.paused) { togglePause(); return; }
    const now = Date.now(), mins = { m30: 30, h1: 60, h2: 120 }[kind];
    let until = 0;
    if (mins) until = now + mins * 60e3;
    else if (kind === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); until = (S.workOn && nextWorkStart(S, d.getTime())) || d.getTime() + S.workStart * 60e3; }
    else if (kind !== 'forever') return;
    togglePause(); S.pauseUntil = until; save(); broadcast();
  }
  function drankWater() {
    const rec = today(); rec.water = (rec.water || 0) + 1;
    R.nextWater = Date.now() + S.waterEvery * 60e3; R.water = 'done'; R.waterUntil = Date.now() + 4000;
    save(); broadcast();
  }
  function backFromAway(now) {
    const since = R.awaySince; R.awaySince = null;
    if (!since || now - since < 60e3) { broadcast(); return; }
    if (R.mode === 'due') { R.mode = 'waiting'; R.cur = null; R.reason = ''; }
    R.quiet = false; schedule(S.interval * 60e3);
    R.backMins = Math.max(1, Math.round((now - since) / 60e3)); R.backUntil = now + 15000;
    broadcast(); setTimeout(broadcast, 15100);
  }

  // ---------- your AI starts working: a stretch that is due soon comes now ----------
  let aiWasBusy = false;
  function aiBusy() {
    try { return (app.kopiMonitor?.view().providers || []).some(p => p.connected && ['running', 'sending'].includes(p.state)); } catch { return false; }
  }

  // ---------- once a second ----------
  let lastDay = dayKey(new Date());
  function tick() {
    const now = Date.now();
    if (!S.on) { if (R.mode !== 'waiting') { R.mode = 'waiting'; R.cur = null; broadcast(); } return; }
    const resting = S.workOn && !isWorkTime(S, new Date(now));
    if (resting !== R.resting) {
      R.resting = resting;
      if (resting) { if (R.mode === 'due') { R.mode = 'waiting'; R.cur = null; } R.quiet = false; R.water = null; }
      else { if (R.mode === 'waiting' && !S.paused) schedule(S.interval * 60e3); R.nextWater = now + S.waterEvery * 60e3; }
      broadcast();
    }
    if (S.awayReset && (R.mode === 'waiting' || R.mode === 'due') && !S.paused && !R.resting) {
      if (R.locked) { if (!R.awaySince) { R.awaySince = R.locked; broadcast(); } }
      else {
        let idle = 0; try { idle = powerMonitor.getSystemIdleTime(); } catch {}
        if (idle >= AWAY_SECS) { if (!R.awaySince) { R.awaySince = now - idle * 1000; broadcast(); } }
        else if (R.awaySince) backFromAway(now);
      }
    } else if (R.awaySince) { R.awaySince = null; broadcast(); }
    if (R.mode === 'waiting') skipWalk();

    const busy = aiBusy(), aiStarted = busy && !aiWasBusy; aiWasBusy = busy;
    const ready = R.mode === 'waiting' && !S.paused && !R.awaySince && !R.resting && !R.quietCheck;
    if (ready && now >= S.nextDue) dueOrHold(busy && S.withAi ? 'ai' : '');
    else if (ready && aiStarted && S.withAi && S.nextDue - now <= EARLY_FOR_CLAUDE) dueOrHold('ai');
    else if (R.mode === 'active') {
      const left = R.activeEnd - now, ex = L.BY[R.cur];
      if (ex.sides && !R.switched && left <= R.activeSecs * 500) { R.switched = true; broadcast(); }
      if (left <= 0) finish();
    } else if ((R.mode === 'done' || R.mode === 'snoozed') && now >= R.msgUntil) { R.mode = 'waiting'; R.cur = null; broadcast(); }

    const fasting = puasa();
    if (fasting && R.water === 'ask') { R.water = null; broadcast(); }
    if (R.water === 'done' && now >= R.waterUntil) { R.water = null; broadcast(); }
    if (S.waterOn && !fasting && !R.resting && !S.paused && R.mode === 'waiting' && !R.water && now >= R.nextWater) {
      if ((today().water || 0) >= S.waterGoal) R.nextWater = now + S.waterEvery * 60e3; // goal reached for today
      else { R.nextWater = now + S.waterEvery * 60e3; R.water = 'ask'; broadcast(); }
    }
    if (S.paused && S.pauseUntil && now >= S.pauseUntil) togglePause();
    const dk = dayKey(new Date()); if (dk !== lastDay) { lastDay = dk; broadcast(); }
  }

  // ---------- the island and the settings app ask and tell ----------
  function setSetting(key, value) {
    if (BOOLS.includes(key)) S[key] = Boolean(value);
    else if (own(CHOICES, key) && CHOICES[key].includes(value)) S[key] = value;
    else if (key === 'kuih' && own(L.KUIH_BY, value)) S.kuih = value;
    else if (key === 'goal' && Number.isInteger(value) && value >= 1 && value <= 30) S.goal = value;
    else if (key === 'waterGoal' && Number.isInteger(value) && value >= 1 && value <= 20) S.waterGoal = value;
    else if (key === 'workDays' && Array.isArray(value)) { const d = [...new Set(value.filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort(); if (d.length) S.workDays = d; }
    else if (['workStart', 'workEnd', 'lunchStart', 'lunchEnd'].includes(key) && Number.isInteger(value) && value >= 0 && value <= 1440 && value % 15 === 0) {
      const next = { ...S, [key]: value };
      if (next.workStart < next.workEnd && next.lunchStart < next.lunchEnd) S[key] = value;
    } else return false;
    if (key === 'interval' && R.mode === 'waiting' && !S.paused) schedule(S.interval * 60e3);
    if (key === 'on' && S.on) { R.mode = 'waiting'; schedule(S.interval * 60e3); }
    save(); broadcast(); return true;
  }
  const ACTIONS = {
    start: () => { if (R.mode === 'due' || R.mode === 'waiting') start(); },
    now: () => { if (R.mode !== 'active') { R.cur = upNext().id; R.reason = ''; start(); } }, // a stretch right now, from the island
    done: () => { if (R.mode === 'active' || R.mode === 'due') finish(); },
    snooze, skip, different,
    stop: () => { if (R.mode === 'active') { R.mode = 'waiting'; R.cur = null; schedule(S.interval * 60e3); broadcast(); } },
    pause: kind => pauseFor(String(kind || 'forever')), resume: () => { if (S.paused) togglePause(); },
    water: drankWater, waterLater: () => { R.water = null; R.nextWater = Date.now() + WATER_LATER; broadcast(); },
    set: v => setSetting(String(v?.key || ''), v?.value),
    reset: () => { S.history = {}; S.idx = 0; save(); broadcast(); },
    // Settings → General → Test mode
    test: kind => {
      if (kind === 'stretch') { R.mode = 'waiting'; becomeDue(aiBusy() ? 'ai' : ''); }
      else if (kind === 'water') { R.water = 'ask'; broadcast(); }
      else if (kind === 'clear') { R.mode = 'waiting'; R.cur = null; R.water = null; R.reason = ''; broadcast(); }
    }
  };
  ipcMain.handle('stretch:get', e => (trusted(e) ? publicState() : null));
  ipcMain.handle('stretch:action', (e, payload) => {
    if (!trusted(e) || !own(ACTIONS, payload?.action)) return { ok: false };
    try { ACTIONS[payload.action](payload.value); } catch (error) { return { ok: false, error: String(error?.message || error) }; }
    return publicState();
  });

  app.whenReady().then(() => {
    const timer = setInterval(tick, 1000); timer.unref?.();
    try {
      powerMonitor.on('lock-screen', () => { R.locked = Date.now(); });
      powerMonitor.on('unlock-screen', () => { R.locked = null; if (R.awaySince) backFromAway(Date.now()); });
      powerMonitor.on('resume', () => { if (R.mode === 'due') { R.mode = 'waiting'; R.cur = null; } if (!S.paused) schedule(S.interval * 60e3); broadcast(); });
    } catch {}
  });
  app.on('before-quit', () => { clearTimeout(saveTimer); writeNow(); });
  app.rehattStretch = { state: publicState, action: (a, v) => ACTIONS[a]?.(v) };
  return { publicState, ACTIONS, tick, R, S };
}

if (process.versions.electron) setup(require('electron'));
module.exports = { setup, cleanState, isWorkTime, nextWorkStart, DEFAULTS };
