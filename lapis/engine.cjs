'use strict';
/*
 * Lapis inside Rehatt. This is Lapis's own main process (chowkuanlaw/lapis-stretch 1.12.0, MIT), with its timer,
 * notices, kuih collection, secret codes, golden kuih, Friday summary, Balik rumah wrap-up, teh tarik and late-night
 * easter eggs, the full-screen dance, chimes and safe saving, unchanged where it could be.
 *
 * What Rehatt does instead of Lapis:
 *   - the island is the reminder card and the widget (no corner pop-up, no desktop widget, no Lapis tray icon)
 *   - Lapis's own screens (Today, Progress, Stretches, Your kuih, Settings, the welcome) live in the Stretch tab of
 *     Rehatt Settings; updates, start with Windows, language and light/dark come from Rehatt
 *   - when Claude Code or Codex starts working and a stretch is due within 6 minutes, it comes right away
 *   - a Focus session holds stretches and water; when it ends on its own, a stretch due soon comes then
 *   - the island's rules (Rehatt Flow Review): an unanswered stretch counts as skipped after 20 minutes, an unanswered
 *     glass of water asks again in 30 minutes, water due soon after a stretch is asked right after the cheer
 *
 * Saved in Rehatt's folder, lapis\state.json. On the first start it picks up your history, collected kuih and
 * codes from Lapis Stretch on this PC, if you have it.
 */
// (outside Electron, for the tests, there is no electron module: setup() then gets a stand-in)
let ELECTRON = {}; try { const e = require('electron'); if (e && typeof e === 'object') ELECTRON = e; } catch { /* tests */ }
const { app, BrowserWindow, Menu, ipcMain, screen, Notification, powerMonitor, net } = ELECTRON;
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { CYCLE, BY, KUIH_BY, STARTERS, RULES, computeStats, ruleProgress, ramadanOn, festivalOn, NEWS, newer } = require('./renderer/data.js');
const I18N = require('./renderer/i18n.js');
const QUIET = require('./quiet.cjs');
const { DEFAULTS, WATER_EVERY, THEMES, CHIMES, TEXT_SIZES, cleanState, readStateFile, writeStateFile, removeBackup } = require('./state.cjs');

const LAPIS_VERSION = '1.12.0'; // the Lapis release this engine follows (its own "What's new" list)
const AWAY_SECS = 300;          // 5 min without keyboard/mouse = away from desk
const SCHEME = 'lapis', ORIGIN = `${SCHEME}://app`, RENDERER_DIR = path.join(__dirname, 'renderer');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
// The secret code that unlocks every kuih, stored only as a salted SHA-256 hash.
const CODE_HASH = '236baef63139445e4254071641f6555ecb509cfa7fe905a4e8955812e7b712ea';
// Two more easter-egg codes (1.7.1), also stored only as hashes.
const CODE2_HASH = '79003147ddebca62535fbb1a7ad83d015c54f5f1d3b6a5a78d8a473d111ca984';
const CODE3_HASH = 'b2b506c1bc85f6c8b9c9137ce42e7cdf29f1f7f09a74c93b907eae9925184d52';
const GOLD_CHANCE = 1 / 200;
const MEETING_RECHECK = 60e3, AFTER_MEETING = 120e3;
// Rehatt's island rules
const WATER_LATER = 30 * 60e3;          // "Later", or a water ask nobody answered: again in 30 minutes
const WATER_ASK_FOR = 2 * 60e3;         // an unanswered water ask folds away after 2 minutes
const WATER_WITH_STRETCH = 15 * 60e3;   // water due within 15 min of a finished stretch: asked right after it
const DUE_GIVE_UP = 20 * 60e3;          // a stretch nobody started in 20 minutes counts as skipped
const EARLY_FOR_AI = 6 * 60e3;          // a stretch due within 6 minutes comes now when your AI starts working
const FOCUS_BREAK = 10 * 60e3;          // Focus ends on its own and a stretch is due within 10 min: it comes now
const PREVIEW = { done: 4000, snoozed: 2500, waterDone: 2500, back: 4000 };

/* host (main.js): { aiBusy(), version(), update, autostart, openSettings(tab), openIsland(view), trusted(evt),
                     onChange(state), setTrayImages(kind, images) } — all optional, so the tests can run it alone. */
function setup(electron, host = {}) {
  const E = electron || { app, BrowserWindow, Menu, ipcMain, screen, Notification, powerMonitor, net };
  const dataDir = host.dataDir || path.join(E.app.getPath('userData'), 'lapis');

  /* ---------- state ---------- */
  let S = JSON.parse(JSON.stringify(DEFAULTS));
  const R = {
    mode: 'waiting', cur: null, activeEnd: 0, activeSecs: 0, switched: false, dueAt: 0, msgUntil: 0, awaySince: null,
    resting: false, quiet: false, quietCheck: false, nextWater: 0, waterCheck: false, notices: [], noticeUntil: 0, codeMsg: null, codeMsgUntil: 0,
    locked: 0, backMins: 0, backUntil: 0, wrapCheck: false, nextWrapCheck: 0,
    golden: false, eggCheck: false, nextEggCheck: 0, nightAgain: 0, resetUntil: 0,
    skips: 0, snoozed: false, // kuih moods (1.9.0)
    reason: '', focusUntil: 0, waterAskAt: 0, waterAfter: false, aiWasBusy: false // Rehatt
  };
  const clients = new Set(); // every page that asked for the state: the island, Rehatt Settings, Lapis's screens, the dance
  let eggWin = null, eggSafety = null, eggMsgUntil = 0, saveTimer = null, lastDay = dayKey(new Date()), timer = null;
  const t = (key, vars) => I18N.t(S.lang, key, vars);

  function importFrom() {
    // Lapis Stretch on this PC: the installer copy (%APPDATA%\Lapis), or the Microsoft Store copy (virtualised AppData)
    const out = [];
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    out.push(path.join(roaming, 'Lapis'));
    const pkgs = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Packages');
    try { for (const d of fs.readdirSync(pkgs)) if (/lapis/i.test(d)) out.push(path.join(pkgs, d, 'LocalCache', 'Roaming', 'Lapis')); } catch (e) { /* none */ }
    return out;
  }
  function loadState() {
    fs.mkdirSync(dataDir, { recursive: true });
    let { saved, from } = readStateFile(dataDir);
    let imported = '';
    if (!saved && !host.noImport) {
      for (const dir of importFrom()) { const r = readStateFile(dir); if (r.saved) { saved = r.saved; imported = 'lapis'; break; } }
      if (!saved) { // Rehatt 0.1: rehatt-stretch.json had the settings and the history
        try {
          const old = JSON.parse(fs.readFileSync(path.join(E.app.getPath('userData'), 'rehatt-stretch.json'), 'utf8'));
          if (old && typeof old === 'object') { saved = { ...old, onboarded: true, firstRun: false }; imported = 'rehatt'; }
        } catch (e) { /* a fresh start */ }
      }
    }
    S = cleanState(saved);
    if (imported === 'lapis') { S.widget = false; S.firstRun = false; S.onboarded = true; }
    if (from === 'state.bak.json') R.notices.push({ type: 'restored' }); // state.json was unreadable
    if (!saved || !I18N.LANGS.includes(saved.lang)) S.lang = host.lang?.() || (/^ms/i.test(E.app.getLocale?.() || '') ? 'ms' : 'en');
    if (S.paused) S.pausedLeft = Math.max(S.pausedLeft || 0, 0);
    // Back within a few minutes (an update restart, or quit and reopen): carry on with the same countdown.
    const now = Date.now(), off = now - S.closedAt;
    const quickRestart = S.closedAt > 0 && off >= 0 && off < AWAY_SECS * 1000 && S.nextDue > 0;
    S.nextDue = quickRestart ? Math.min(Math.max(S.nextDue, now + 5000), now + S.interval * 60e3) : now + S.interval * 60e3;
    S.closedAt = 0; S.reopenHidden = false;
    R.resting = S.workOn && !isWorkTime(new Date(now));
    R.nextWater = now + S.waterEvery * 60e3;
    collectionUpdate(true);
    // "What's new" (1.8.0): once after each Lapis update. New users just start on this version.
    if (!S.onboarded || S.firstRun) S.seenVersion = LAPIS_VERSION;
    else if (S.seenVersion !== LAPIS_VERSION) {
      const fromV = S.seenVersion || '1.6.2';
      if (NEWS.some(x => newer(x.v, fromV) && !newer(x.v, LAPIS_VERSION))) R.notices.push({ type: 'news', from: fromV, v: LAPIS_VERSION });
      else S.seenVersion = LAPIS_VERSION;
    }
    if (S.firstRun && S.onboarded) S.firstRun = false;
    if (imported) writeNow();
  }
  function writeNow() { try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) { /* ignore */ } writeStateFile(dataDir, S); }
  function writeOnQuit() { clearTimeout(saveTimer); S.closedAt = Date.now(); writeNow(); }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(writeNow, 300); }

  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function mmss(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; }
  function today() { const k = dayKey(new Date()); return S.history[k] || (S.history[k] = { total: 0, by: {} }); }
  // Ramadan mode: no water reminders, and the walk (which ends with a drink) is left out of the cycle.
  const puasa = () => (S.ramadanOn ? ramadanOn(new Date()) : null);
  function skipWalk() { if (puasa()) { let n = 0; while (CYCLE[S.idx % CYCLE.length] === 'walk' && n++ < CYCLE.length) S.idx++; } }
  function upNext() { return BY[CYCLE[S.idx % CYCLE.length]]; }
  const exName = ex => I18N.tx(S.lang, ex, 'name');
  const focusing = now => R.focusUntil > (now || Date.now());

  /* ---------- working hours ---------- */
  const minsOf = d => d.getHours() * 60 + d.getMinutes();
  function isWorkTime(d) {
    if (!S.workOn) return true;
    if (!S.workDays.includes(d.getDay())) return false;
    const m = minsOf(d);
    if (m < S.workStart || m >= S.workEnd) return false;
    return !(S.lunchOn && m >= S.lunchStart && m < S.lunchEnd);
  }
  function nextWorkStart(from) {
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
  function whenLabel(ts) {
    if (!ts) return '';
    const d = new Date(ts), loc = I18N.locale(S.lang);
    const time = d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit', hour12: true });
    return dayKey(d) === dayKey(new Date()) ? time : `${d.toLocaleDateString(loc, { weekday: 'short' })} ${time}`;
  }

  /* ---------- quiet during meetings ---------- */
  const isQuietTime = () => (host.isQuiet ? host.isQuiet() : QUIET.isQuiet());
  async function dueOrHold(reason) {
    if (!S.quietMeetings) { if (R.quiet) R.quiet = false; becomeDue(null, false, reason); return; }
    R.quietCheck = true;
    const quiet = await isQuietTime();
    R.quietCheck = false;
    if (R.mode !== 'waiting' || S.paused || R.resting) return;
    if (quiet) { S.nextDue = Date.now() + MEETING_RECHECK; if (!R.quiet) { R.quiet = true; broadcast(); } return; }
    if (R.quiet) { R.quiet = false; S.nextDue = Date.now() + AFTER_MEETING; broadcast(); return; } // 2 minutes after the meeting
    becomeDue(null, false, reason);
  }

  /* ---------- kuih collection ---------- */
  const workDaysForStreak = () => (S.workOn ? S.workDays : null);
  function isAvailable(id) { return !S.collect || S.codeUnlocked || STARTERS.includes(id) || own(S.unlocked, id) || id === S.kuih; }
  function collectionUpdate(silent) {
    if (!S.collectInit) { // first run of 1.6: earn what the history already shows, and keep the kuih in use
      S.collectInit = true; silent = true;
      if (!STARTERS.includes(S.kuih)) S.unlocked[S.kuih] = '2000-01-01';
    }
    const stats = computeStats(S.history, S.goal, workDaysForStreak(), new Date(), { saver: S.streakSaver, waterGoal: S.waterGoal });
    for (const r of RULES) {
      if (own(S.unlocked, r.id) || !ruleProgress(r, stats).done) continue;
      S.unlocked[r.id] = silent ? '2000-01-01' : dayKey(new Date());
      if (!silent && S.collect && !S.codeUnlocked) R.notices.push({ type: 'unlock', id: r.id });
    }
    save();
  }
  function redeem(code) {
    if (typeof code !== 'string' || code.length > 64) return;
    const norm = code.replace(/\s+/g, '').toUpperCase();
    const h = crypto.createHash('sha256').update('lapis:' + norm).digest('hex');
    if (h === CODE_HASH) { S.codeUnlocked = true; R.codeMsg = 'ok'; }
    else if (h === CODE2_HASH) { // the same code again turns it off (1.11.1)
      const on = S.flagDay !== dayKey(new Date());
      S.flagDay = on ? dayKey(new Date()) : ''; R.codeMsg = on ? 'flag' : 'flagOff';
    }
    else if (h === CODE3_HASH) { S.remix = !S.remix; R.codeMsg = S.remix ? 'remixOn' : 'remixOff'; }
    else R.codeMsg = 'bad';
    R.codeMsgUntil = Date.now() + 9000;
    save(); broadcast();
    setTimeout(broadcast, 9100);
  }

  /* ---------- notices: water, new kuih, Friday summary, wrap-up, teh tarik, night, news ---------- */
  function pushNotice(n) { R.notices.push(n); broadcast(); }
  function closeNotice() { R.notices.shift(); R.noticeUntil = 0; broadcast(); }
  const waterWanted = () => S.waterOn && !puasa() && !R.resting && !S.paused && (today().water || 0) < S.waterGoal;
  function askWater() {
    R.nextWater = Date.now() + S.waterEvery * 60e3; R.waterAskAt = Date.now(); R.waterAfter = false;
    if (!R.notices.some(n => n.type === 'water')) R.notices.unshift({ type: 'water', state: 'ask' }); // water goes first in the island
    chime('water'); broadcast();
  }
  function waterDue(now) {
    if (R.waterCheck) return;
    if ((today().water || 0) >= S.waterGoal) { R.nextWater = now + S.waterEvery * 60e3; return; } // goal reached for today
    if (R.notices.some(n => n.type === 'water')) return;
    R.waterCheck = true;
    (S.quietMeetings ? isQuietTime() : Promise.resolve(false)).then(quiet => {
      R.waterCheck = false;
      if (quiet) { R.nextWater = Date.now() + 5 * 60e3; return; }
      askWater();
    });
  }
  function drankWater(fromCard) {
    const rec = today(); rec.water = (rec.water || 0) + 1;
    R.nextWater = Date.now() + S.waterEvery * 60e3; R.waterAfter = false;
    const i = R.notices.findIndex(n => n.type === 'water');
    if (fromCard && i >= 0) { R.notices.splice(i, 1); R.notices.unshift({ type: 'water', state: 'done' }); R.noticeUntil = Date.now() + PREVIEW.waterDone; }
    else if (i >= 0) R.notices.splice(i, 1);
    collectionUpdate(false);
    save(); broadcast();
  }
  function waterLater() {
    const i = R.notices.findIndex(n => n.type === 'water');
    if (i >= 0) { R.notices.splice(i, 1); R.noticeUntil = 0; }
    R.nextWater = Date.now() + WATER_LATER; R.waterAfter = false;
    broadcast();
  }
  const mondayOf = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  function summaryDue(now) {
    if (!S.summaryOn) return;
    const d = new Date(now), order = day => (day + 6) % 7; // Monday first
    const days = S.workOn ? S.workDays : [5];
    const last = days.reduce((a, b) => (order(b) > order(a) ? b : a), days[0]);
    const end = S.workOn ? S.workEnd : 18 * 60;
    if (d.getDay() !== last || minsOf(d) < end - 30 || minsOf(d) > end + 180) return;
    const week = dayKey(mondayOf(d));
    if (S.lastSummary === week) return;
    S.lastSummary = week; save();
    pushNotice({ type: 'summary', week });
    chime('done');
  }
  /* Easter eggs (1.7.1): teh tarik on Friday at 3:30 pm, and "go to sleep" late at night. */
  const isNight = d => d.getHours() >= 23 || d.getHours() < 5;
  const nightKey = d => dayKey(new Date(d.getTime() - 5 * 3600e3)); // 1 am still belongs to the evening before
  const idleSecs = () => { try { return E.powerMonitor.getSystemIdleTime(); } catch (e) { return 0; } };
  function eggNotices(now) {
    if (R.eggCheck || now < R.nextEggCheck) return;
    const d = new Date(now), m = minsOf(d);
    let want = null;
    if (d.getDay() === 5 && m >= 930 && m < 960 && !R.resting && !S.paused && S.lastTeh !== dayKey(mondayOf(d))) want = 'teh';
    else if (isNight(d) && (S.lastNight !== nightKey(d) || (R.nightAgain && now >= R.nightAgain))) want = 'night';
    if (!want || R.notices.some(n => n.type === want)) return;
    if (idleSecs() >= 60 || R.locked) { R.nextEggCheck = now + 30e3; return; } // only while you're using the PC
    R.eggCheck = true;
    (S.quietMeetings ? isQuietTime() : Promise.resolve(false)).then(quiet => {
      R.eggCheck = false;
      if (quiet) { R.nextEggCheck = Date.now() + MEETING_RECHECK; return; }
      if (want === 'teh') S.lastTeh = dayKey(mondayOf(d)); else { S.lastNight = nightKey(d); R.nightAgain = 0; }
      save();
      pushNotice(want === 'teh' ? { type: 'teh' } : { type: 'night', back: S.workOn ? nextWorkStart(Date.now()) : 0 });
      chime(want === 'teh' ? 'done' : 'water');
    });
  }
  /* End-of-day wrap-up (1.7.0): once a working day, when your working hours end and you're still at the PC. */
  function wrapDue(now) {
    if (!S.wrapOn || !S.workOn || S.paused || R.wrapCheck || now < R.nextWrapCheck) return;
    const d = new Date(now), k = dayKey(d), m = minsOf(d);
    if (S.lastWrap === k || !S.workDays.includes(d.getDay()) || m < S.workEnd || m > S.workEnd + 120) return;
    const lastWorkDay = S.workDays.reduce((a, b) => ((b + 6) % 7 > (a + 6) % 7 ? b : a), S.workDays[0]);
    if (S.summaryOn && d.getDay() === lastWorkDay) return; // the weekly summary says goodbye that day
    if (idleSecs() >= AWAY_SECS || R.locked) { R.nextWrapCheck = now + 30e3; return; }
    R.wrapCheck = true;
    (S.quietMeetings ? isQuietTime() : Promise.resolve(false)).then(quiet => {
      R.wrapCheck = false;
      if (quiet) { R.nextWrapCheck = Date.now() + MEETING_RECHECK; return; }
      S.lastWrap = k; save();
      pushNotice({ type: 'wrap', day: k });
      chime('done');
    });
  }

  function publicState() {
    const { widgetPos, firstRun, lastUpdateCheck, closedAt, reopenHidden, collectInit, seenVersion, ...rest } = S;
    const t0 = today(), stats = computeStats(S.history, S.goal, workDaysForStreak(), new Date(), { saver: S.streakSaver, waterGoal: S.waterGoal });
    const week = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const v = S.history[dayKey(d)]; week.push({ day: dayKey(d), total: v?.total || 0, water: v?.water || 0 }); }
    const water = R.notices.find(n => n.type === 'water');
    const upd = host.update?.state?.() || {};
    return Object.assign(rest, {
      mode: R.mode, cur: R.cur, upNext: upNext().id, activeEnd: R.activeEnd, activeSecs: R.activeSecs,
      switched: R.switched, away: !!R.awaySince,
      resting: R.resting, backAt: R.resting ? nextWorkStart(Date.now()) : 0, quiet: R.quiet,
      nextWater: S.waterOn && !R.resting && !puasa() ? R.nextWater : 0, notice: R.notices[0] || null, notices: R.notices.length,
      ramadan: puasa(), backMins: Date.now() < R.backUntil ? R.backMins : 0,
      golden: R.golden && (R.mode === 'due' || R.mode === 'active' || R.mode === 'done'),
      resetDone: Date.now() < R.resetUntil,
      mood: R.skips >= 3 ? 'sad' : R.snoozed ? 'drowsy' : t0.total >= S.goal ? 'proud' : '',
      codeMsg: Date.now() < R.codeMsgUntil ? R.codeMsg : null,
      eggMsg: Date.now() < eggMsgUntil,
      version: host.version?.() || LAPIS_VERSION, installed: !!upd.installed, store: !!upd.store, update: upd.update || null, updateMsg: upd.updateMsg || null, checking: !!upd.checking,
      autostart: host.autostart ? host.autostart.get() : S.autostart, autoUpdate: upd.auto ?? S.autoUpdate,
      // for Rehatt's island
      ok: true, on: true, reason: R.reason, dueAt: R.mode === 'due' ? R.dueAt : 0, focus: focusing(),
      water: S.waterOn && !puasa() && water ? water.state : null,
      today: { total: t0.total, water: t0.water || 0, by: t0.by }, week, streak: stats.streak, total: stats.total,
      festival: festivalOn(new Date())?.id || null
    });
  }
  function broadcast() {
    const st = publicState();
    for (const wc of clients) { if (wc.isDestroyed()) clients.delete(wc); else wc.send('lapis:state', st); }
    host.onChange?.(st);
  }

  /* ---------- reminder flow ---------- */
  function chime(kind) {
    if (!S.sound) return;
    for (const wc of clients) if (!wc.isDestroyed() && /mascot\.html/.test(wc.getURL())) wc.send('lapis:chime', kind); // the island plays it
  }
  function toast(ex) {
    if (!S.toast || !E.Notification?.isSupported()) return;
    const n = new E.Notification({ title: t('toast.title'), body: `${exName(ex)} · ${I18N.tx(S.lang, ex, 'dose')}`, silent: true });
    n.on('click', () => host.openIsland?.('stretch'));
    n.show();
  }
  function becomeDue(exId, quiet, reason = '') {
    R.cur = own(BY, exId) ? exId : upNext().id;
    R.mode = 'due'; R.dueAt = Date.now(); R.quiet = false; R.reason = reason;
    // Easter egg: now and then a scheduled reminder brings a golden kuih (a hidden badge, found by luck only).
    R.golden = !quiet && (Math.random() < GOLD_CHANCE || (!E.app.isPackaged && !!process.env.LAPIS_TEST_GOLD));
    if (R.golden && !own(S.goldFound, S.kuih)) { S.goldFound[S.kuih] = dayKey(new Date()); save(); }
    const w = R.notices.findIndex(n => n.type === 'water'); // the stretch takes the island; water asks again later
    if (w >= 0) { R.notices.splice(w, 1); R.nextWater = Date.now() + 15 * 60e3; }
    if (!quiet) { chime('due'); toast(BY[R.cur]); }
    broadcast();
  }
  function start() {
    const ex = BY[R.cur || upNext().id];
    R.cur = ex.id; R.mode = 'active'; R.activeSecs = ex.secs; R.activeEnd = Date.now() + ex.secs * 1000; R.switched = false;
    broadcast();
  }
  function schedule(ms) { S.nextDue = Date.now() + ms; if (S.paused) S.pausedLeft = ms; save(); }
  function advance() { if (R.cur === upNext().id) S.idx++; skipWalk(); }
  function finish() {
    R.skips = 0; R.snoozed = false;
    const rec = today(); rec.total++; rec.by[R.cur] = (rec.by[R.cur] || 0) + 1;
    advance(); schedule(S.interval * 60e3); chime('done');
    R.mode = 'done'; R.msgUntil = Date.now() + PREVIEW.done; R.reason = '';
    // water due soon anyway: asked right after the cheer, so it is one break instead of two
    R.waterAfter = waterWanted() && R.nextWater - Date.now() <= WATER_WITH_STRETCH;
    collectionUpdate(false);
    setTimeout(() => { R.golden = false; }, PREVIEW.done + 200);
    broadcast();
  }
  function skip() { if (R.mode === 'due') R.skips++; R.snoozed = false; advance(); schedule(S.interval * 60e3); R.mode = 'waiting'; R.cur = null; R.golden = false; R.reason = ''; broadcast(); }
  function snooze() { R.snoozed = true; schedule(S.snooze * 60e3); R.mode = 'snoozed'; R.msgUntil = Date.now() + PREVIEW.snoozed; R.reason = ''; broadcast(); }
  function different() {
    const base = R.cur || upNext().id; let i = S.idx;
    do { i++; } while (CYCLE[i % CYCLE.length] === base || (puasa() && CYCLE[i % CYCLE.length] === 'walk'));
    S.idx = i; save();
    if (R.mode === 'due') R.cur = upNext().id;
    broadcast();
  }
  function togglePause() {
    if (S.paused) { S.paused = false; S.pauseUntil = 0; S.nextDue = Date.now() + Math.max(S.pausedLeft, 1000); }
    else {
      S.paused = true; S.pausedLeft = Math.max(0, S.nextDue - Date.now());
      if (R.mode !== 'active') { R.mode = 'waiting'; R.cur = null; }
    }
    save(); broadcast();
  }
  /* Pause for a while (1.8.0): 30 min, 1 or 2 hours, until tomorrow, or until you resume. */
  function pauseFor(kind) {
    if (S.paused) return;
    const now = Date.now(), mins = { m30: 30, h1: 60, h2: 120 }[kind];
    let until = 0;
    if (mins) until = now + mins * 60e3;
    else if (kind === 'tomorrow') {
      const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0);
      until = (S.workOn && nextWorkStart(d.getTime())) || d.getTime() + S.workStart * 60e3;
    } else if (kind !== 'forever') return;
    togglePause();
    S.pauseUntil = until; save(); broadcast();
  }
  function pauseItems() {
    return [['m30', 'pause.m30'], ['h1', 'pause.h1'], ['h2', 'pause.h2'], ['tomorrow', 'pause.tomorrow'], ['forever', 'pause.forever']]
      .map(([k, label]) => ({ label: t(label), click: () => pauseFor(k) }));
  }
  function pauseMenu() {
    if (S.paused) { togglePause(); return; }
    try { E.Menu.buildFromTemplate(pauseItems()).popup({}); } catch (e) { /* tests */ }
  }
  /* Start fresh (1.8.0): clears history, collected kuih and badges on this PC. Settings stay. */
  function resetData() {
    Object.assign(S, { history: {}, unlocked: {}, goldFound: {}, codeUnlocked: false, flagDay: '', remix: false, idx: 0,
      lastSummary: '', lastWrap: '', lastTeh: '', lastNight: '', collectInit: true });
    if (S.collect && !STARTERS.includes(S.kuih)) S.kuih = 'lapis';
    R.notices = R.notices.filter(n => n.type === 'news'); R.noticeUntil = 0; R.golden = false;
    if (R.mode !== 'active') { R.mode = 'waiting'; R.cur = null; }
    if (!S.paused) schedule(S.interval * 60e3);
    R.resetUntil = Date.now() + 6000;
    clearTimeout(saveTimer);
    removeBackup(dataDir); writeStateFile(dataDir, S, Date.now(), { noBackup: true });
    broadcast(); setTimeout(broadcast, 6100);
  }
  function restartCountdown() {
    if (S.paused || R.resting) return;
    if (R.mode === 'due' && S.awayReset) { R.mode = 'waiting'; R.cur = null; }
    if (R.mode === 'waiting') { R.awaySince = null; R.quiet = false; schedule(S.interval * 60e3); broadcast(); }
  }
  /* Away from the desk (1.7.0): time away counts as a break. */
  function backFromAway(now) {
    const since = R.awaySince; R.awaySince = null;
    if (!since || now - since < 60e3) { broadcast(); return; }
    if (R.mode === 'due') { R.mode = 'waiting'; R.cur = null; R.reason = ''; }
    R.quiet = false; schedule(S.interval * 60e3);
    R.backMins = Math.max(1, Math.round((now - since) / 60e3)); R.backUntil = now + PREVIEW.back;
    broadcast(); setTimeout(broadcast, PREVIEW.back + 100);
  }

  /* ---------- Rehatt: your AI and the Focus timer ---------- */
  function aiBusy() { try { return Boolean(host.aiBusy?.()); } catch (e) { return false; } }
  function setFocus(v) {
    const now = Date.now(), until = Number(v?.until) || 0, was = focusing(now);
    R.focusUntil = until > now ? Math.min(until, now + 24 * 3600e3) : 0;
    if (was && !R.focusUntil && v?.ended && R.mode === 'waiting' && !S.paused && !R.resting && S.nextDue - now <= FOCUS_BREAK) becomeDue(null, false, 'focus');
    else broadcast();
  }

  function setSetting(key, value) {
    const half = v => Number.isInteger(+v) && +v % 30 === 0;
    switch (key) {
      case 'interval': S.interval = [15, 20, 30, 45, 60].includes(+value) ? +value : 20; if (R.mode === 'waiting') schedule(S.interval * 60e3); break;
      case 'snooze': S.snooze = [5, 10, 15].includes(+value) ? +value : 10; break;
      case 'sound': case 'toast': case 'awayReset': case 'quietMeetings': case 'summaryOn': case 'wrapOn': case 'withAi': S[key] = !!value; break;
      case 'ramadanOn': S.ramadanOn = !!value; skipWalk(); break;
      case 'trayRing': S.trayRing = !!value; break;
      case 'streakSaver': S.streakSaver = !!value; collectionUpdate(false); break;
      case 'textSize': if (!own(TEXT_SIZES, value)) return; S.textSize = value; host.onZoom?.(TEXT_SIZES[value]); break;
      case 'widgetHideFull': S.widgetHideFull = !!value; break;
      case 'theme': if (!THEMES.includes(value)) return; S.theme = value; host.onTheme?.(value); break;
      case 'chimeStyle': if (!CHIMES.includes(value)) return; S.chimeStyle = value; break;
      case 'volume': { const v = Math.round(+value); if (!(v >= 0 && v <= 100)) return; S.volume = v; break; }
      case 'widget': case 'widgetOnTop': S[key] = !!value; break; // (the island is Rehatt's widget)
      case 'autostart': S.autostart = !!value; host.autostart?.set(!!value); break;
      case 'kuih': if (!own(KUIH_BY, value) || !isAvailable(value)) return; S.kuih = value; break;
      case 'onboarded': S.onboarded = !!value; break;
      case 'autoUpdate': S.autoUpdate = !!value; host.update?.setAuto?.(!!value); break;
      case 'lang': if (!I18N.LANGS.includes(value)) return; S.lang = value; host.onLang?.(value); break;
      case 'goal': { const g = Math.round(+value); if (!(g >= 1 && g <= 30)) return; S.goal = g; collectionUpdate(false); break; }
      case 'workOn': S.workOn = !!value; collectionUpdate(false); break;
      case 'lunchOn': S.lunchOn = !!value; break;
      case 'workDay': {
        const d = +value; if (!(Number.isInteger(d) && d >= 0 && d <= 6)) return;
        const has = S.workDays.includes(d);
        if (has && S.workDays.length === 1) return;
        S.workDays = has ? S.workDays.filter(x => x !== d) : [...S.workDays, d].sort();
        break;
      }
      case 'workDays': { // Rehatt Settings sends the whole list
        if (!Array.isArray(value)) return;
        const days = [...new Set(value.filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
        if (!days.length) return; S.workDays = days; break;
      }
      case 'workStart': if (!half(value) || +value >= S.workEnd || +value < 0) return; S.workStart = +value; break;
      case 'workEnd': if (!half(value) || +value <= S.workStart || +value > 1440) return; S.workEnd = +value; break;
      case 'lunchStart': if (!half(value) || +value >= S.lunchEnd || +value < 0) return; S.lunchStart = +value; break;
      case 'lunchEnd': if (!half(value) || +value <= S.lunchStart || +value > 1440) return; S.lunchEnd = +value; break;
      case 'waterOn': S.waterOn = !!value; R.nextWater = Date.now() + S.waterEvery * 60e3; if (!S.waterOn) R.notices = R.notices.filter(n => n.type !== 'water'); break;
      case 'waterEvery': if (!WATER_EVERY.includes(+value)) return; S.waterEvery = +value; R.nextWater = Date.now() + S.waterEvery * 60e3; break;
      case 'waterGoal': { const g = Math.round(+value); if (!(g >= 1 && g <= 20)) return; S.waterGoal = g; break; }
      case 'collect': S.collect = !!value; if (!S.collect) R.notices = R.notices.filter(n => n.type !== 'unlock'); break;
      default: return false;
    }
    if (['workOn', 'workDay', 'workDays', 'workStart', 'workEnd', 'lunchOn', 'lunchStart', 'lunchEnd'].includes(key)) tick();
    save(); broadcast();
    return true;
  }

  function tick() {
    const now = Date.now();
    // working hours: rest outside them, and start a fresh countdown when work starts again
    const resting = S.workOn && !isWorkTime(new Date(now));
    if (resting !== R.resting) {
      R.resting = resting;
      if (resting) { if (R.mode === 'due') { R.mode = 'waiting'; R.cur = null; } R.quiet = false; R.notices = R.notices.filter(n => n.type !== 'water'); }
      else { if (R.mode === 'waiting' && !S.paused) schedule(S.interval * 60e3); R.nextWater = now + S.waterEvery * 60e3; }
      broadcast();
    }
    if (S.awayReset && (R.mode === 'waiting' || R.mode === 'due') && !S.paused && !R.resting) {
      if (R.locked) { if (!R.awaySince) { R.awaySince = R.locked; broadcast(); } }
      else {
        const idle = idleSecs();
        if (idle >= AWAY_SECS) { if (!R.awaySince) { R.awaySince = now - idle * 1000; broadcast(); } }
        else if (R.awaySince) backFromAway(now);
      }
    } else if (R.awaySince) { R.awaySince = null; broadcast(); }
    if (R.mode === 'waiting') skipWalk();

    const busy = aiBusy(), aiStarted = busy && !R.aiWasBusy; R.aiWasBusy = busy;
    const ready = R.mode === 'waiting' && !S.paused && !R.awaySince && !R.resting && !R.quietCheck && !focusing(now);
    if (ready && now >= S.nextDue) dueOrHold(busy && S.withAi ? 'ai' : '');
    else if (ready && aiStarted && S.withAi && S.nextDue - now <= EARLY_FOR_AI) dueOrHold('ai');
    else if (R.mode === 'due' && !R.awaySince && now - R.dueAt >= DUE_GIVE_UP) skip(); // nobody started it: counts as skipped
    else if (R.mode === 'active') {
      const left = R.activeEnd - now, ex = BY[R.cur];
      if (ex.sides && !R.switched && left <= R.activeSecs * 500) { R.switched = true; chime('switch'); broadcast(); }
      if (left <= 0) finish();
    } else if ((R.mode === 'done' || R.mode === 'snoozed') && now >= R.msgUntil) {
      R.mode = 'waiting'; R.cur = null;
      if (R.waterAfter && waterWanted()) askWater(); else broadcast();
      R.waterAfter = false;
    }

    const fasting = puasa();
    if (fasting && R.notices.some(n => n.type === 'water')) { R.notices = R.notices.filter(n => n.type !== 'water'); broadcast(); }
    const ask = R.notices.find(n => n.type === 'water' && n.state === 'ask');
    if (ask && now - R.waterAskAt >= WATER_ASK_FOR) waterLater(); // not now: again in 30 min
    if (S.waterOn && !fasting && !R.resting && !S.paused && !focusing(now) && R.mode === 'waiting' && now >= R.nextWater) waterDue(now);
    if (R.noticeUntil && now >= R.noticeUntil) closeNotice();
    summaryDue(now);
    wrapDue(now);
    eggNotices(now);

    if (S.paused && S.pauseUntil && now >= S.pauseUntil) togglePause();
    const dk = dayKey(new Date());
    if (dk !== lastDay) { lastDay = dk; broadcast(); }
  }

  /* ---------- Lapis's own pages: lapis://app/ ---------- */
  function serveApp(req) {
    let u; try { u = new URL(req.url); } catch (e) { return new Response('', { status: 400 }); }
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = path.resolve(RENDERER_DIR, rel || 'index.html');
    const type = MIME[path.extname(file).toLowerCase()];
    if (u.host !== 'app' || req.method !== 'GET' || !type || !file.startsWith(RENDERER_DIR + path.sep)) return new Response('', { status: 404 });
    return E.net.fetch(pathToFileURL(file).toString()).then(r => new Response(r.body, { status: r.status, headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' } }))
      .catch(() => new Response('', { status: 404 }));
  }
  const viewURL = (view, extra) => `${ORIGIN}/index.html?` + new URLSearchParams(Object.assign({ view }, extra || {}));
  // IPC is accepted from Lapis's own pages, and from Rehatt's island and Settings
  function trusted(evt) {
    const f = evt.senderFrame;
    if (!f || f.parent || typeof f.url !== 'string') return false;
    return f.url.startsWith(ORIGIN + '/') || /^file:.*\/(mascot|settings-app)\.html/.test(f.url) || Boolean(host.trusted?.(evt));
  }
  const fromMain = evt => /[?&]view=main\b/.test(evt.senderFrame?.url || '') || /settings-app\.html/.test(evt.senderFrame?.url || '');

  /* ---------- easter egg: a full-screen dance over the desktop ---------- */
  function startEgg(a, from) {
    if (eggWin && !eggWin.isDestroyed()) return;
    let pt = E.screen.getCursorScreenPoint();
    if (from && !from.isDestroyed() && Number.isFinite(+a.rx) && Number.isFinite(+a.ry)) {
      const b = from.getContentBounds();
      pt = { x: Math.round(b.x + +a.rx), y: Math.round(b.y + +a.ry) };
    }
    const d = E.screen.getDisplayNearestPoint(pt).bounds;
    eggWin = new E.BrowserWindow({
      x: d.x, y: d.y, width: d.width, height: d.height, frame: false, transparent: true, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
      show: false, title: 'Lapis', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false, backgroundThrottling: false }
    });
    eggWin.setAlwaysOnTop(true, 'screen-saver');
    eggWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    eggWin.webContents.on('will-navigate', e => e.preventDefault());
    eggWin.loadURL(viewURL('egg', { fx: String(pt.x - d.x), fy: String(pt.y - d.y) }));
    eggWin.once('ready-to-show', () => { if (eggWin && !eggWin.isDestroyed()) { eggWin.show(); eggWin.focus(); } });
    eggWin.on('closed', () => { eggWin = null; });
    clearTimeout(eggSafety);
    eggSafety = setTimeout(endEgg, 15000); // never leave the overlay stuck on screen
  }
  function endEgg() {
    clearTimeout(eggSafety);
    if (eggWin && !eggWin.isDestroyed()) eggWin.destroy();
    eggWin = null;
    eggMsgUntil = Date.now() + 2500;
    broadcast();
    setTimeout(broadcast, 2600);
  }

  /* ---------- the tray's words (Rehatt's tray shows them) ---------- */
  function statusLabel() {
    const ex = BY[R.cur || upNext().id];
    if (R.mode === 'due') return t('tray.due');
    if (R.mode === 'active') return t('tray.active', { ex: exName(ex) });
    if (R.mode === 'done') return t('tray.done');
    if (S.paused) return S.pauseUntil ? t('tray.pausedUntil', { when: whenLabel(S.pauseUntil) }) : t('tray.paused');
    if (R.resting) return t('tray.resting', { when: whenLabel(nextWorkStart(Date.now())) });
    if (R.quiet) return t('tray.quiet');
    if (R.awaySince) return t('tray.away');
    return t('tray.next', { t: mmss(S.nextDue - Date.now()) });
  }

  /* ---------- actions ---------- */
  function act(a, evt) {
    if (!a || typeof a !== 'object' || typeof a.type !== 'string') return;
    const top = R.notices[0];
    switch (a.type) {
      case 'now': becomeDue(a.ex, true); if (a.start) start(); break;
      case 'start': if (R.mode === 'due' || R.mode === 'waiting') start(); break;
      case 'snooze': if (R.mode === 'due') snooze(); break;
      case 'done': if (R.mode === 'active' || R.mode === 'due') finish(); break;
      case 'stop': case 'skip': if (R.mode === 'active' || R.mode === 'due') skip(); break;
      case 'different': different(); break;
      case 'pause': if (a.kind) pauseFor(String(a.kind)); else togglePause(); break;
      case 'resume': if (S.paused) togglePause(); break;
      case 'set': setSetting(a.key, a.value); break;
      case 'open-main': host.openSettings?.('stretch'); break;
      case 'popup-size': break; // (the island is the pop-up)
      case 'test-chime': chime('due'); break;
      case 'check-update': host.update?.check?.(true); break;
      case 'open-release': host.update?.open?.(); break;
      case 'install-update': host.update?.install?.(); break;
      case 'egg': startEgg(a, evt ? E.BrowserWindow.fromWebContents(evt.sender) : null); break;
      case 'egg-done': endEgg(); break;
      case 'tray-icon': host.setTrayImages?.('lapis', a.images); break;
      case 'water-drank': drankWater(true); break;
      case 'water-add': drankWater(false); break;
      case 'water-later': waterLater(); break;
      case 'notice-close': if (top) closeNotice(); break;
      case 'news-close': if (top && top.type === 'news') { S.seenVersion = LAPIS_VERSION; save(); closeNotice(); } break;
      case 'pause-menu': pauseMenu(); break;
      case 'reset-data': if (!evt || fromMain(evt)) resetData(); break;
      case 'night-more': if (top && top.type === 'night') { R.nightAgain = Date.now() + 5 * 60e3; closeNotice(); } break;
      case 'unlock-use': if (top && top.type === 'unlock') { setSetting('kuih', top.id); closeNotice(); } break;
      case 'summary-open': if (top && top.type === 'summary') { closeNotice(); host.openSettings?.('stretch'); } break;
      case 'redeem': redeem(a.code); break;
      case 'focus': setFocus(a); break; // Rehatt's Focus timer
      case 'test': // Rehatt Settings → General → test mode, and the smoke test
        if (a.kind === 'stretch') { R.mode = 'waiting'; becomeDue(null, false, aiBusy() ? 'ai' : ''); }
        else if (a.kind === 'water') askWater();
        else if (a.kind === 'clear') { R.mode = 'waiting'; R.cur = null; R.reason = ''; R.notices = []; R.noticeUntil = 0; broadcast(); }
        else if (['summary', 'wrap', 'teh', 'night', 'restored'].includes(a.kind)) pushNotice(a.kind === 'summary' ? { type: 'summary', week: dayKey(mondayOf(new Date())) } : a.kind === 'wrap' ? { type: 'wrap', day: dayKey(new Date()) } : a.kind === 'night' ? { type: 'night', back: nextWorkStart(Date.now()) } : { type: a.kind });
        else if (a.kind === 'unlock') { const id = RULES.map(r => r.id).find(x => !isAvailable(x)) || RULES[0].id; pushNotice({ type: 'unlock', id }); }
        else if (a.kind === 'golden') { R.mode = 'waiting'; becomeDue(null, false); R.golden = true; if (!own(S.goldFound, S.kuih)) { S.goldFound[S.kuih] = dayKey(new Date()); save(); } broadcast(); }
        break;
      default: break;
    }
  }
  E.ipcMain.handle('lapis:get-state', evt => {
    if (!trusted(evt)) return null;
    if (!clients.has(evt.sender)) { clients.add(evt.sender); evt.sender.once('destroyed', () => clients.delete(evt.sender)); }
    return publicState();
  });
  E.ipcMain.on('lapis:action', (evt, a) => { if (trusted(evt)) act(a, evt); });

  /* ---------- start ---------- */
  function begin() {
    loadState();
    if (!E.app.isPackaged && process.env.LAPIS_TEST_NOTICE) { try { R.notices.push(JSON.parse(process.env.LAPIS_TEST_NOTICE)); } catch (e) { /* ignore */ } }
    timer = setInterval(tick, 1000); timer.unref?.();
    try {
      E.powerMonitor.on('resume', restartCountdown);
      E.powerMonitor.on('lock-screen', () => { R.locked = Date.now(); });
      E.powerMonitor.on('unlock-screen', () => { R.locked = 0; tick(); });
    } catch (e) { /* tests */ }
    broadcast();
  }
  if (host.immediate) begin(); else E.app.whenReady().then(begin);
  E.app.on?.('before-quit', () => writeOnQuit());

  const api = {
    SCHEME, serveApp, viewURL, publicState, act, tick, setSetting, statusLabel, R, get S() { return S; },
    preload: path.join(__dirname, 'preload.cjs'),
    addClient: wc => { clients.add(wc); wc.once?.('destroyed', () => clients.delete(wc)); }
  };
  E.app.rehattLapis = api;
  return api;
}

module.exports = { setup, SCHEME, LAPIS_VERSION };
