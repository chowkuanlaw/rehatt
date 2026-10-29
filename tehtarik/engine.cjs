'use strict';
/*
 * Teh Tarik Meter inside Rehatt. This is Teh Tarik Meter's own main process (chowkuanlaw/teh-tarik-meter 1.3.2, MIT):
 * your claude.ai usage read with your own sign-in, the forecast, history, alerts (80%, 95%, pace, fresh glass),
 * organizations, extra credits, the sign-in window, the session key, the sample peek, drinks, festive outfits and
 * the full-screen show, unchanged where it could be.
 *
 * What Rehatt does instead:
 *   - the island is the widget: its Usage page is the glass card, and Kopi's island the always-there view
 *   - the Claude Code numbers come from Rehatt's own status line (Connections → Claude Code), not a separate script
 *   - Teh Tarik Meter's screens (General, Look, Claude, History, About, the welcome) live in the Usage tab of
 *     Rehatt Settings; updates, start with Windows, language, light/dark and Ctrl+Alt+T come from Rehatt
 *
 * Saved in Rehatt's folder, tehtarik\state.json and history.json. On the first start it picks up your drink,
 * settings and history from Teh Tarik Meter on this PC, if you have it. Your claude.ai sign-in stays in Electron's
 * encrypted cookie store (the same private profile Rehatt already used).
 */
// (outside Electron, for the tests, there is no electron module: setup() then gets a stand-in)
let ELECTRON = {}; try { const e = require('electron'); if (e && typeof e === 'object') ELECTRON = e; } catch { /* tests */ }
const { app, BrowserWindow, ipcMain, screen, Notification, nativeTheme, shell, powerMonitor, net, session, dialog } = ELECTRON;
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const U = require('./lib/usage.js');
const M = require('./lib/merge.js');
const H = require('./lib/history.js');
const ST = require('./lib/state.js');
const F = require('./renderer/format.js');
const D = require('./renderer/data.js');
const I18N = require('./renderer/i18n.js');

const TTM_VERSION = '1.3.2'; // the Teh Tarik Meter release this engine follows (its own "What's new" list)
const CLAUDE = 'https://claude.ai';
const PARTITION = 'persist:claude';
const SCHEME = 'tehtarik', ORIGIN = `${SCHEME}://app`, RENDERER_DIR = path.join(__dirname, 'renderer');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const REPO = 'chowkuanlaw/teh-tarik-meter';

/* host (main.js): { feed(), cc: { connected(), connect(), disconnect() }, version(), update, autostart, shortcut,
                     openSettings(tab), openIsland(view), trusted(evt), lang(), onLang(), onTheme(), onZoom() } */
function setup(electron, host = {}) {
  const E = electron || { app, BrowserWindow, ipcMain, screen, Notification, nativeTheme, shell, powerMonitor, net, session, dialog };
  const dataDir = host.dataDir || path.join(E.app.getPath('userData'), 'tehtarik');
  const STATE_FILE = () => path.join(dataDir, 'state.json');
  const HISTORY_FILE = () => path.join(dataDir, 'history.json');
  const DEMO = !E.app.isPackaged && process.env.TTM_DEMO === '1'; // development only: fake numbers, no network

  let S = ST.clean(null);
  let HIST = H.empty();
  const R = {
    web: null, feed: null, view: null, fc: { session: null, weekly: null },
    status: 'starting',          // starting | ok | signed-out | offline | error
    errors: 0, shapeErrors: 0, formatBroken: false,
    fetching: false, again: false, lastFetchAt: 0, lastChangeAt: 0, warm: false,
    paused: false, timer: null, rollTimer: null, ccTimer: null,
    orgs: [], histDirty: false, preview: false, sample: null, restored: false
  };
  const clients = new Set();
  let loginWin = null, showWin = null, saveTimer = null, claudeSes = null, cleanUA = '';
  const L = () => S.lang;
  const t = (k, v) => I18N.t(L(), k, v);

  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => ST.write(STATE_FILE(), S), 300); }
  function saveHistory() { if (R.histDirty) { R.histDirty = false; ST.writeJson(HISTORY_FILE(), HIST); } }

  /* ---------- claude.ai ---------- */
  function httpError(code, status) { const e = new Error(code); e.code = code; e.status = status; return e; }
  // A plain GET with your claude.ai cookies, through Chromium's network stack.
  function getJson(url) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = E.net.request({ url, method: 'GET', session: claudeSes, useSessionCookies: true, redirect: 'manual' }); }
      catch (e) { reject(httpError('network')); return; }
      req.setHeader('Accept', 'application/json');
      req.setHeader('User-Agent', cleanUA);
      const timer = setTimeout(() => { try { req.abort(); } catch (e) { /* ignore */ } reject(httpError('timeout')); }, 15000);
      req.on('redirect', () => { clearTimeout(timer); try { req.abort(); } catch (e) { /* ignore */ } reject(httpError('auth', 302)); });
      req.on('response', res => {
        const chunks = [];
        let size = 0;
        res.on('data', c => { size += c.length; if (size < 2e6) chunks.push(c); });
        res.on('end', () => {
          clearTimeout(timer);
          const code = res.statusCode;
          const type = String((res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || '');
          if (code === 403 && /text\/html/i.test(type)) return reject(httpError('challenge', code)); // Cloudflare's check, not a sign-out
          if (code === 401 || code === 403) return reject(httpError('auth', code));
          if (code === 404) return reject(httpError('notfound', code));
          if (code === 429) return reject(httpError('rate', code));
          if (code < 200 || code >= 300) return reject(httpError('http', code));
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(httpError('shape')); }
        });
        res.on('error', () => { clearTimeout(timer); reject(httpError('network')); });
      });
      req.on('error', () => { clearTimeout(timer); reject(httpError('network')); });
      req.end();
    });
  }
  async function loadOrgs() { const orgs = await getJson(`${CLAUDE}/api/organizations`); R.orgs = U.listOrgs(orgs); return orgs; }
  async function ensureOrg() {
    const pinned = U.safeOrgId(S.orgId);
    if (pinned) { if (!R.orgs.length) loadOrgs().catch(() => {}); return pinned; }
    const orgs = await loadOrgs();
    const id = U.safeOrgId(U.pickOrg(orgs, null));
    if (!id) throw httpError('auth');
    S.orgId = id; save();
    return id;
  }
  function demoUsage() {
    if (process.env.TTM_DEMO_SIGNEDOUT === '1') throw httpError('auth', 401);
    const tt = (Date.now() / 1000) % 600, now = Date.now();
    const fixed = k => (process.env[k] !== undefined ? Number(process.env[k]) : null);
    const s = fixed('TTM_DEMO_SESSION'), w = fixed('TTM_DEMO_WEEKLY');
    return {
      five_hour: { utilization: s !== null ? s : Math.min(100, tt / 5.5), resets_at: new Date(now + (2 * 3600 + 15 * 60) * 1000).toISOString() },
      seven_day: { utilization: w !== null ? w : 18 + tt / 40, resets_at: new Date(now + 3 * 86400e3).toISOString() },
      seven_day_opus: { utilization: 40, resets_at: new Date(now + 3 * 86400e3).toISOString() },
      extra_usage: { is_enabled: true, used_credits: 1240, monthly_limit: 5000, currency: 'USD' }
    };
  }
  if (DEMO) R.orgs = [{ id: 'demo-org-0001', name: 'Personal', chat: true }, { id: 'demo-org-0002', name: 'Work Team', chat: true }];

  async function refresh(reason) {
    if (R.fetching) { R.again = true; return; }
    if (R.paused && reason !== 'manual') return;
    R.fetching = true;
    broadcast();
    let attempt = 0;
    for (;;) {
      try {
        let raw;
        if (DEMO) raw = demoUsage();
        else { const orgId = await ensureOrg(); raw = await getJson(`${CLAUDE}/api/organizations/${orgId}/usage`); }
        const parsed = U.parseUsage(raw);
        if (!parsed.ok) throw httpError('shape');
        const snap = { at: Date.now(), session: parsed.session, weekly: parsed.weekly, models: parsed.models, extra: parsed.extra };
        if (M.changed(R.web, snap)) R.lastChangeAt = Date.now();
        R.web = snap;
        S.last = snap; save();
        R.status = 'ok'; R.errors = 0; R.shapeErrors = 0; R.formatBroken = false;
        R.preview = false; R.sample = null;
      } catch (e) {
        if (e.code === 'notfound' && attempt === 0 && S.orgId) { S.orgId = null; attempt++; continue; } // org changed: look it up again
        if (e.code === 'auth') { R.status = 'signed-out'; S.orgId = null; save(); }
        else {
          R.status = (e.code === 'network' || e.code === 'timeout') ? 'offline' : 'error';
          R.errors++;
          if (e.code === 'challenge') warmUp();
          if (e.code === 'shape') formatProblem();
        }
      }
      break;
    }
    R.lastFetchAt = Date.now();
    R.fetching = false;
    update();
    schedule();
    if (R.again) { R.again = false; setTimeout(() => refresh('again'), 500); }
  }
  // Three unreadable replies in a row: claude.ai changed its usage page. Say so once per version.
  function formatProblem() {
    R.shapeErrors++;
    if (R.shapeErrors < 3 || R.formatBroken) return;
    R.formatBroken = true;
    const key = `format:${host.version?.() || TTM_VERSION}`;
    if (!S.sent[key]) { S.sent[key] = Date.now(); save(); toast(t('n.format.title'), t('n.format.body')); }
    host.update?.check?.(false);
  }
  // Opens claude.ai once in a hidden window so Cloudflare's check can pass, then closes it. At most once every 10 minutes.
  let lastWarm = 0;
  function warmUp() {
    if (DEMO || Date.now() - lastWarm < 10 * 60e3) return;
    lastWarm = Date.now();
    const w = new E.BrowserWindow({ show: false, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false } });
    w.webContents.setUserAgent(cleanUA);
    w.webContents.setAudioMuted(true);
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const close = () => { if (!w.isDestroyed()) w.destroy(); };
    const kill = setTimeout(close, 30000);
    w.webContents.once('did-finish-load', () => setTimeout(() => { clearTimeout(kill); close(); R.errors = 0; refresh('warm'); }, 4000));
    w.loadURL(`${CLAUDE}/settings/usage`).catch(() => { clearTimeout(kill); close(); });
  }
  function schedule() {
    clearTimeout(R.timer);
    const d = M.nextDelay({ paused: R.paused, signedOut: R.status === 'signed-out', errors: R.errors, now: Date.now(), lastChangeAt: R.lastChangeAt });
    if (d !== null) R.timer = setTimeout(() => refresh('timer'), d);
  }
  function scheduleRollover() {
    clearTimeout(R.rollTimer);
    const v = R.view;
    if (!v) return;
    const next = [v.session && v.session.resetsAt, v.weekly && v.weekly.resetsAt].filter(Boolean).sort((a, b) => a - b)[0];
    if (!next) return;
    const d = next - Date.now() + 5000;
    if (d > 0 && d < 7 * 86400e3) R.rollTimer = setTimeout(() => { update(); refresh('rollover'); }, Math.min(d, 2 ** 31 - 1));
  }
  function soon(reason, minGap) { if (Date.now() - R.lastFetchAt > (minGap || 10000)) refresh(reason); }

  /* ---------- Claude Code: Rehatt's status line hands over the limits after every reply ---------- */
  function readFeed() {
    let f = null;
    try { f = host.feed?.() || null; } catch (e) { f = null; }
    if (!f || !f.at || (R.feed && f.at <= R.feed.at)) return;
    const before = R.feed;
    R.feed = f;
    if (!before || M.changed(before, f)) R.lastChangeAt = Date.now();
    update();
    clearTimeout(R.ccTimer);
    R.ccTimer = setTimeout(() => soon('cc', 20000), 3000); // per-model caps and credits from claude.ai a moment later
  }

  /* ---------- putting it together ---------- */
  function update() {
    const now = Date.now();
    const prev = R.view;
    const view = M.buildView(R.status === 'signed-out' && !R.feed ? null : (R.web || S.last), R.feed, now);
    R.view = view;
    if (view.hasData && R.status !== 'signed-out' && H.add(HIST, view, now)) R.histDirty = true;
    R.fc = H.forecasts(HIST, view, now);
    // Celebrate a refill only between live readings, not against an old saved one at start-up.
    if (prev && R.warm && M.detectReset(prev, view)) {
      sendAll('ttm:tarik');
      host.onRefill?.();
      if (S.freshAlert && prev.session && prev.session.pct >= 95) toast(t('n.fresh.title'), t('n.fresh.body'), 'fresh');
    }
    if (R.status === 'ok' || R.feed) R.warm = true;
    if (S.alerts && view.hasData) {
      const res = M.alertsFor(view, S.sent, now);
      S.sent = res.sent;
      if (res.alerts.length) { save(); res.alerts.forEach(notify); }
    }
    paceAlert(now);
    scheduleRollover();
    broadcast();
  }
  // Once per session window: "at this pace, your glass runs out at 3:40 PM" when that's before the refill.
  function paceAlert(now) {
    const f = R.fc.session, w = R.view && R.view.session;
    if (!S.paceAlert || !f || !f.beforeReset || !w || !w.resetsAt || w.pct >= 80) return;
    if (f.eta - now > 90 * 60e3) return;
    const key = `pace:${Math.round(w.resetsAt / 3600e3)}`;
    if (S.sent[key]) return;
    S.sent[key] = now; save();
    toast(t('n.pace.title', { when: F.at(f.eta, now, L()) }), t('n.pace.body', { reset: F.when(w.resetsAt, now, L()) }), 'pace');
  }

  function snapshot() {
    const smp = R.preview ? sample() : null;
    const upd = host.update?.state?.() || {};
    return {
      ok: true,
      view: smp ? smp.view : R.view,
      fc: smp ? smp.fc : R.fc,
      preview: !!smp,
      status: R.status,
      formatBroken: R.formatBroken,
      fetching: R.fetching,
      lastFetchAt: R.lastFetchAt,
      paused: R.paused,
      cc: host.cc ? Boolean(host.cc.connected()) : false,
      ccAt: R.feed ? R.feed.at : null,
      orgs: R.orgs,
      orgId: S.orgId,
      settings: {
        onTop: S.onTop, autostart: host.autostart ? host.autostart.get() : S.autostart, alerts: S.alerts, paceAlert: S.paceAlert, freshAlert: S.freshAlert,
        sound: S.sound, hideFull: S.hideFull, shortcut: host.shortcut ? host.shortcut.get() : S.shortcut, theme: S.theme, lang: S.lang, drink: S.drink,
        textSize: S.textSize, compact: S.compact, festive: S.festive, trayGlass: !!S.trayGlass
      },
      dark: E.nativeTheme ? E.nativeTheme.shouldUseDarkColors : true,
      festival: S.festive ? (!E.app.isPackaged && process.env.TTM_FESTIVAL ? { id: process.env.TTM_FESTIVAL, daysLeft: 0 } : D.festivalOn(new Date())) : null,
      news: S.welcomed ? D.newsSince(S.seenVersion).map(n => n.v) : [],
      welcomed: S.welcomed,
      version: host.version?.() || TTM_VERSION,
      store: !!upd.store,
      installed: !!upd.installed,
      update: upd.update || null,
      updateMsg: upd.updateMsg || null,
      checking: !!upd.checking,
      shortcutTaken: host.shortcut ? host.shortcut.taken() : false,
      demo: DEMO && process.env.TTM_HIDE_DEMO !== '1'
    };
  }
  function sendAll(ch, data) { for (const wc of clients) { if (wc.isDestroyed()) clients.delete(wc); else wc.send(ch, data); } }
  function broadcast() { const s = snapshot(); sendAll('ttm:state', s); host.onChange?.(s); }

  /* ---------- alerts ---------- */
  function toast(title, body, kind) {
    host.onAlert?.({ title, body, kind }); // the island shows it too
    if (!E.Notification?.isSupported()) return;
    const n = new E.Notification({ title, body, silent: false });
    n.on('click', () => host.openIsland?.('meter'));
    n.show();
  }
  function notify(a) {
    const now = Date.now();
    const p = Math.round(a.pct);
    const when = F.when(a.resetsAt, now, L());
    if (a.kind === 'session') toast(t(a.level >= 95 ? 'n.s95.title' : 'n.s80.title'), t('n.s.body', { p, when }), 'limit');
    else if (a.kind === 'weekly') toast(t(a.level >= 95 ? 'n.w95.title' : 'n.w80.title'), t('n.w.body', { p, when }), 'limit');
    else toast(t('n.m.title', { name: a.name, p }), t('n.m.body', { when }), 'limit');
  }

  /* ---------- sign in ---------- */
  async function signedIn() {
    if (DEMO) return true;
    try { return !!U.pickOrg(await getJson(`${CLAUDE}/api/organizations`), null); } catch (e) { return false; }
  }
  function openLogin() {
    if (loginWin && !loginWin.isDestroyed()) { loginWin.show(); loginWin.focus(); return; }
    const browserPrefs = { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false };
    loginWin = new E.BrowserWindow({ width: 980, height: 780, title: 'Sign in to Claude - Rehatt', autoHideMenuBar: true, webPreferences: browserPrefs });
    loginWin.webContents.setUserAgent(cleanUA);
    // Sign-in pop-ups (such as Google) open in the same private browser, never in the app.
    loginWin.webContents.setWindowOpenHandler(({ url }) => (/^https:\/\//i.test(url)
      ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: browserPrefs } }
      : { action: 'deny' }));
    loginWin.webContents.on('will-navigate', (e, url) => { if (!/^https:\/\//i.test(url)) e.preventDefault(); });
    loginWin.loadURL(`${CLAUDE}/login`);
    let checking = false;
    const probe = setInterval(async () => {
      if (checking || !loginWin || loginWin.isDestroyed()) return;
      checking = true;
      const ok = await signedIn();
      checking = false;
      if (ok && loginWin && !loginWin.isDestroyed()) { clearInterval(probe); loginWin.close(); }
    }, 2500);
    loginWin.on('closed', () => { clearInterval(probe); loginWin = null; R.errors = 0; refresh('login'); });
  }
  // When the sign-in window won't work: paste the sessionKey cookie from your browser.
  async function useSessionKey(value) {
    const v = String(value || '').trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,400}$/.test(v)) return { ok: false, msg: t('d.keyBad') };
    try {
      await claudeSes.cookies.set({ url: CLAUDE, name: 'sessionKey', value: v, domain: '.claude.ai', path: '/', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400 });
    } catch (e) { return { ok: false, msg: t('d.keySaveFail') }; }
    S.orgId = null; R.errors = 0;
    await refresh('manual');
    return R.status === 'signed-out' ? { ok: false, msg: t('d.keyRejected') } : { ok: true };
  }
  async function signOut(confirm = true) {
    if (confirm && E.dialog) {
      const r = await E.dialog.showMessageBox({ type: 'question', buttons: [t('d.signOutBtn'), t('d.cancel')], defaultId: 1, cancelId: 1, title: 'Rehatt', message: t('d.signOut'), detail: t('d.signOutDetail') });
      if (r.response !== 0) return;
    }
    try { await claudeSes.clearStorageData(); } catch (e) { /* ignore */ }
    S.orgId = null; S.last = null; R.web = null; R.orgs = []; R.status = 'signed-out'; save();
    clearTimeout(R.timer);
    update();
  }
  function setOrg(id) {
    const ok = U.safeOrgId(id);
    if (!ok || !R.orgs.some(o => o.id === ok) || ok === S.orgId) return;
    S.orgId = ok; S.last = null; R.web = null; save();
    refresh('manual');
  }

  /* ---------- Teh Tarik Meter's own pages: tehtarik://app/ ---------- */
  function serveApp(req) {
    let u; try { u = new URL(req.url); } catch (e) { return new Response('', { status: 400 }); }
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = path.resolve(RENDERER_DIR, rel || 'index.html');
    const type = MIME[path.extname(file).toLowerCase()];
    if (u.host !== 'app' || req.method !== 'GET' || !type || !file.startsWith(RENDERER_DIR + path.sep)) return new Response('', { status: 404 });
    return E.net.fetch(pathToFileURL(file).toString())
      .then(r => new Response(r.body, { status: r.status, headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' } }))
      .catch(() => new Response('', { status: 404 }));
  }
  const viewURL = (view, extra) => `${ORIGIN}/index.html?` + new URLSearchParams(Object.assign({ view }, extra || {}));
  function trusted(evt) {
    const f = evt.senderFrame;
    if (!f || f.parent || typeof f.url !== 'string') return false;
    return f.url.startsWith(ORIGIN + '/') || /^file:.*\/(mascot|settings-app)\.html/.test(f.url) || Boolean(host.trusted?.(evt));
  }

  // The easter egg: a full-screen teh tarik show on the screen the island is on.
  function startShow() {
    if (showWin && !showWin.isDestroyed()) return;
    const d = E.screen.getDisplayNearestPoint(E.screen.getCursorScreenPoint());
    const b = d.bounds;
    showWin = new E.BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height, frame: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, show: false,
      backgroundColor: '#1E1611', title: 'Teh Tarik Meter',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false, backgroundThrottling: false }
    });
    showWin.setAlwaysOnTop(true, 'screen-saver');
    showWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    showWin.webContents.on('will-navigate', e => e.preventDefault());
    showWin.loadURL(viewURL('show'));
    showWin.once('ready-to-show', () => { showWin.show(); showWin.focus(); });
    const safety = setTimeout(endShow, 30000);
    showWin.on('closed', () => { clearTimeout(safety); showWin = null; sendAll('ttm:show-over'); });
  }
  function endShow() { if (showWin && !showWin.isDestroyed()) showWin.close(); }

  /* ---------- the tray's words (Rehatt's tray shows them) ---------- */
  function trayText() {
    const v = R.view;
    if (R.status === 'signed-out' && !R.feed) return t('t.tipSigned');
    if (!v || !v.hasData) return '';
    const parts = [];
    if (v.session) parts.push(t('t.tipSession', { p: Math.round(100 - v.session.pct) }));
    if (v.weekly) parts.push(t('t.tipWeek', { p: Math.round(100 - v.weekly.pct) }));
    return parts.join('\n');
  }

  /* ---------- settings ---------- */
  function setSetting(key, value) {
    const B = ['onTop', 'alerts', 'paceAlert', 'freshAlert', 'sound', 'hideFull', 'compact', 'festive', 'trayGlass'];
    if (B.includes(key)) S[key] = !!value;
    else if (key === 'autostart') { S.autostart = !!value; host.autostart?.set(!!value); }
    else if (key === 'shortcut') { S.shortcut = !!value; host.shortcut?.set(!!value); }
    else if (key === 'theme' && ['system', 'light', 'dark'].includes(value)) { S.theme = value; host.onTheme?.(value === 'system' ? 'auto' : value); }
    else if (key === 'lang' && ['en', 'ms'].includes(value)) { S.lang = value; host.onLang?.(value); }
    else if (key === 'drink' && D.DRINK_BY[value]) S.drink = value;
    else if (key === 'textSize' && ['normal', 'large', 'larger'].includes(value)) { S.textSize = value; host.onZoom?.({ normal: 1, large: 1.15, larger: 1.3 }[value]); }
    else return false;
    save();
    broadcast();
    return true;
  }

  /* ---------- sample preview (1.3.0): "Peek at a sample first", made-up numbers, nothing fetched or saved ---------- */
  function sampleHistory(now, cur, wk, reset) {
    const h = H.empty();
    const mid = new Date(now); mid.setHours(0, 0, 0, 0);
    for (let at = mid.getTime(); at < now - 3600e3; at += 10 * 60e3) {
      const cyc = ((at - mid.getTime()) / (5 * 3600e3)) % 1;
      h.s.push([at, Math.round(cyc * 70), mid.getTime() + Math.ceil((at - mid.getTime() + 1) / (5 * 3600e3)) * 5 * 3600e3]);
    }
    for (let m = 60; m >= 0; m -= 5) h.s.push([now - m * 60e3, Math.max(0, cur - m * 0.5), reset]);
    for (let d = 7 * 24; d >= 0; d -= 2) h.w.push([now - d * 3600e3, Math.round(Math.min(100, 2 + (7 * 24 - d) / (7 * 24) * (wk - 2)) * 10) / 10, now + 3 * 86400e3]);
    return h;
  }
  function makeSample(now) {
    const reset = now + (2 * 3600 + 15 * 60) * 1000, week = now + 3 * 86400e3 + 5 * 3600e3;
    const iso = ms => new Date(ms).toISOString();
    const p = U.parseUsage({ five_hour: { utilization: 38, resets_at: iso(reset) }, seven_day: { utilization: 22, resets_at: iso(week) }, seven_day_opus: { utilization: 30, resets_at: iso(week) } });
    const view = M.buildView({ at: now, session: p.session, weekly: p.weekly, models: p.models, extra: p.extra }, null, now);
    const hist = sampleHistory(now, 38, 22, reset);
    return { at: now, view, fc: H.forecasts(hist, view, now), hist };
  }
  function sample() { if (!R.sample || Date.now() - R.sample.at > 10 * 60e3) R.sample = makeSample(Date.now()); return R.sample; }
  function setPreview(on) {
    on = !!on && R.status === 'signed-out';
    if (on === R.preview) return;
    R.preview = on;
    if (!on) R.sample = null;
    broadcast();
  }

  /* ---------- messages from the pages ---------- */
  function act(a, evt) {
    if (!a || typeof a.type !== 'string') return;
    switch (a.type) {
      case 'refresh': R.errors = 0; refresh('manual'); break;
      case 'hover': soon('hover', 10000); break;
      case 'sign-in': setPreview(false); openLogin(); break;
      case 'peek': setPreview(true); break;
      case 'peek-exit': setPreview(false); break;
      case 'sign-out': signOut(a.confirm !== false); break;
      case 'hide': host.hideIsland?.(); break;
      case 'menu': break;
      case 'settings': host.openSettings?.('usage', typeof a.tab === 'string' && /^[a-z]{3,10}$/.test(a.tab) ? a.tab : ''); break;
      case 'set': if (typeof a.key === 'string') setSetting(a.key, a.value); break;
      case 'org': setOrg(a.id); break;
      case 'cc-connect': Promise.resolve(host.cc?.connect?.()).then(broadcast, broadcast); break;
      case 'cc-disconnect': Promise.resolve(host.cc?.disconnect?.()).then(broadcast, broadcast); break;
      case 'open-usage': E.shell.openExternal(`${CLAUDE}/settings/usage`); break;
      case 'open-link': if (['privacy', 'repo'].includes(a.which)) E.shell.openExternal(`https://github.com/${REPO}${a.which === 'privacy' ? '/blob/main/PRIVACY.md' : ''}`); break;
      case 'check-update': host.update?.check?.(true); break;
      case 'install-update': host.update?.install?.(); break;
      case 'news-seen': S.seenVersion = TTM_VERSION; save(); broadcast(); break;
      case 'welcome-done': S.welcomed = true; S.seenVersion = TTM_VERSION; save(); host.welcomeDone?.(); broadcast(); break;
      case 'welcome-again': host.openSettings?.('usage', 'welcome'); break;
      case 'start-show': startShow(); break;
      case 'show-done': endShow(); break;
      case 'mute': S.sound = !a.value; save(); break;
      case 'tray-icon': host.setTrayImages?.('glass', a.images); break;
      case 'size': break;
      case 'tarik': sendAll('ttm:tarik'); break; // Rehatt Settings → test mode
      default: break;
    }
  }
  E.ipcMain.handle('ttm:get-state', evt => {
    if (!trusted(evt)) return null;
    if (!clients.has(evt.sender)) { clients.add(evt.sender); evt.sender.once('destroyed', () => clients.delete(evt.sender)); }
    return snapshot();
  });
  E.ipcMain.handle('ttm:get-history', evt => (trusted(evt) ? H.series(R.preview ? sample().hist : HIST, Date.now()) : null));
  E.ipcMain.handle('ttm:session-key', (evt, value) => (trusted(evt) ? useSessionKey(value) : { ok: false }));
  E.ipcMain.on('ttm:action', (evt, a) => { if (trusted(evt)) act(a, evt); });

  /* ---------- start ---------- */
  function importFrom() {
    const out = [];
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    out.push(path.join(roaming, 'Teh Tarik Meter'));
    const pkgs = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Packages');
    try { for (const d of fs.readdirSync(pkgs)) if (/tehtarik|teh.?tarik/i.test(d)) out.push(path.join(pkgs, d, 'LocalCache', 'Roaming', 'Teh Tarik Meter')); } catch (e) { /* none */ }
    return out;
  }
  function loadState() {
    const fresh = !fs.existsSync(STATE_FILE());
    const loaded = ST.readWithBackup(STATE_FILE());
    S = loaded.state; R.restored = loaded.restored;
    try { HIST = H.clean(JSON.parse(fs.readFileSync(HISTORY_FILE(), 'utf8'))); } catch (e) { HIST = H.empty(); }
    if (fresh && !host.noImport) {
      let imported = false;
      for (const dir of importFrom()) {
        try {
          const old = ST.readWithBackup(path.join(dir, 'state.json'));
          if (!fs.existsSync(path.join(dir, 'state.json'))) continue;
          S = old.state; S.cc = { connected: false, original: null, runner: null }; S.welcomed = true; imported = true;
          try { HIST = H.clean(JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'))); } catch (e) { /* no history */ }
          break;
        } catch (e) { /* try the next */ }
      }
      if (!imported) { // Rehatt 0.1: rehatt-meter.json kept the last reading, the alerts switch and what was sent
        try {
          const old = JSON.parse(fs.readFileSync(path.join(E.app.getPath('userData'), 'rehatt-meter.json'), 'utf8'));
          if (old && typeof old === 'object') { S = ST.clean({ ...old, welcomed: true }); imported = true; }
        } catch (e) { /* a fresh start */ }
      }
      if (!imported) S.lang = host.lang?.() || S.lang;
      ST.write(STATE_FILE(), S); ST.writeJson(HISTORY_FILE(), HIST);
    }
  }
  let timers = [];
  function begin() {
    fs.mkdirSync(dataDir, { recursive: true });
    loadState();
    claudeSes = E.session.fromPartition(PARTITION);
    cleanUA = claudeSes.getUserAgent().replace(/\s+rehatt\/\S+/i, '').replace(/\s+Rehatt\/\S+/i, '').replace(/\s+Electron\/\S+/i, '');
    claudeSes.setUserAgent(cleanUA);
    claudeSes.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
    claudeSes.on('will-download', e => e.preventDefault());
    R.web = S.last;
    R.view = M.buildView(R.web, null, Date.now());
    R.fc = H.forecasts(HIST, R.view, Date.now());
    if (R.restored) setTimeout(() => toast(t('n.backup.title'), t('n.backup.body')), 3000);
    E.nativeTheme?.on('updated', broadcast);
    try {
      E.powerMonitor.on('suspend', () => { R.paused = true; clearTimeout(R.timer); });
      E.powerMonitor.on('lock-screen', () => { R.paused = true; clearTimeout(R.timer); });
      E.powerMonitor.on('resume', () => { R.paused = false; refresh('wake'); });
      E.powerMonitor.on('unlock-screen', () => { R.paused = false; refresh('wake'); });
    } catch (e) { /* ignore */ }
    timers.push(setInterval(readFeed, 1000));
    timers.push(setInterval(saveHistory, 5 * 60e3));
    // A light tick so the festival outfit and forecasts move on with the clock.
    timers.push(setInterval(() => { R.fc = H.forecasts(HIST, R.view, Date.now()); broadcast(); }, 60e3));
    for (const tm of timers) tm.unref?.();
    refresh('start');
  }
  E.app.whenReady().then(begin);
  E.app.on('before-quit', () => { ST.write(STATE_FILE(), S); saveHistory(); });

  const api = {
    SCHEME, serveApp, viewURL, snapshot, act, refresh, setSetting, trayText, R,
    get S() { return S; },
    preload: path.join(__dirname, 'preload.cjs'),
    welcomed: () => S.welcomed,
    addClient: wc => { clients.add(wc); wc.once?.('destroyed', () => clients.delete(wc)); }
  };
  E.app.rehattMeter = api;
  return api;
}

module.exports = { setup, SCHEME, TTM_VERSION };
