'use strict';
// Your Claude usage as a glass of teh tarik (from Teh Tarik Meter). Two sources, the newest reading wins:
//   1. Claude Code's status line (agent-hooks.cjs): instant, but only while you use Claude Code.
//   2. claude.ai, the same numbers as Settings → Usage, read with your own sign-in. Optional: you sign in once in
//      a private claude.ai window inside Rehatt; the cookies stay in Rehatt's own encrypted profile on this PC.
// Alerts at 80% and 95% of a window, once per window. Saved in rehatt-meter.json (no passwords, no messages).
const fs = require('node:fs');
const path = require('node:path');
const U = require('./tehtarik/usage.js');
const M = require('./tehtarik/merge.js');

const CLAUDE = 'https://claude.ai';
const PARTITION = 'persist:claude';

function setup(electron) {
  const { app, BrowserWindow, ipcMain, net, session, Notification, powerMonitor } = electron;
  const file = () => path.join(app.getPath('userData'), 'rehatt-meter.json');
  let S = { orgId: null, last: null, sent: {}, alerts: true };
  try { const saved = JSON.parse(fs.readFileSync(file(), 'utf8')); if (saved && typeof saved === 'object') S = { ...S, ...saved, orgId: U.safeOrgId(saved.orgId) }; } catch {}
  const save = () => { try { fs.writeFileSync(file() + '.tmp', JSON.stringify(S)); fs.renameSync(file() + '.tmp', file()); } catch {} };
  const R = { status: S.last ? 'ok' : 'signed-out', fetching: false, again: false, errors: 0, lastFetchAt: 0, lastChangeAt: 0, timer: null, paused: false, alert: null, alertUntil: 0 };
  let claudeSes = null, cleanUA = '', loginWin = null;

  const httpError = (code, status) => Object.assign(new Error(code), { code, status });
  // A plain GET with your claude.ai cookies, through Chromium's network stack.
  function getJson(url) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = net.request({ url, method: 'GET', session: claudeSes, useSessionCookies: true, redirect: 'manual' }); } catch { reject(httpError('network')); return; }
      req.setHeader('Accept', 'application/json'); req.setHeader('User-Agent', cleanUA);
      const timer = setTimeout(() => { try { req.abort(); } catch {} reject(httpError('timeout')); }, 15000);
      req.on('redirect', () => { clearTimeout(timer); try { req.abort(); } catch {} reject(httpError('auth', 302)); }); // sent to the login page
      req.on('response', res => {
        const chunks = []; let size = 0;
        res.on('data', c => { size += c.length; if (size < 2e6) chunks.push(c); });
        res.on('end', () => {
          clearTimeout(timer);
          const code = res.statusCode, type = String(res.headers?.['content-type'] || '');
          if (code === 403 && /text\/html/i.test(type)) return reject(httpError('challenge', code)); // Cloudflare's check, not a sign-out
          if (code === 401 || code === 403) return reject(httpError('auth', code));
          if (code === 404) return reject(httpError('notfound', code));
          if (code < 200 || code >= 300) return reject(httpError('http', code));
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(httpError('shape')); }
        });
        res.on('error', () => { clearTimeout(timer); reject(httpError('network')); });
      });
      req.on('error', () => { clearTimeout(timer); reject(httpError('network')); });
      req.end();
    });
  }
  async function ensureOrg() {
    if (S.orgId) return S.orgId;
    const id = U.safeOrgId(U.pickOrg(await getJson(`${CLAUDE}/api/organizations`), null));
    if (!id) throw httpError('auth');
    S.orgId = id; save(); return id;
  }
  async function refresh(reason) {
    if (!claudeSes) return;
    if (R.fetching) { R.again = true; return; }
    if (R.status === 'signed-out' && reason !== 'login' && reason !== 'manual') return;
    R.fetching = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const parsed = U.parseUsage(await getJson(`${CLAUDE}/api/organizations/${await ensureOrg()}/usage`));
        if (!parsed.ok) throw httpError('shape');
        const snap = { at: Date.now(), session: parsed.session, weekly: parsed.weekly, models: parsed.models, extra: parsed.extra };
        if (M.changed(S.last, snap)) R.lastChangeAt = Date.now();
        S.last = snap; save(); R.status = 'ok'; R.errors = 0;
      } catch (e) {
        if (e.code === 'notfound' && attempt === 0 && S.orgId) { S.orgId = null; continue; } // the organisation changed: look it up again
        if (e.code === 'auth') { R.status = 'signed-out'; S.orgId = null; save(); }
        else { R.status = e.code === 'network' || e.code === 'timeout' ? 'offline' : 'error'; R.errors++; }
      }
      break;
    }
    R.lastFetchAt = Date.now(); R.fetching = false;
    update(); schedule();
    if (R.again) { R.again = false; setTimeout(() => refresh('again'), 500); }
  }
  function schedule() {
    clearTimeout(R.timer);
    const d = M.nextDelay({ paused: R.paused, signedOut: R.status === 'signed-out', errors: R.errors, now: Date.now(), lastChangeAt: R.lastChangeAt });
    if (d !== null) R.timer = setTimeout(() => refresh('timer'), d);
  }

  // Claude Code's status line, as the hook hub keeps it (agents-main.cjs).
  function feed() {
    const u = app.kopiMonitor?.usage?.(); if (!u || !u.at) return null;
    const win = w => (w ? { pct: w.used, resetsAt: w.resetsAt ? w.resetsAt * 1000 : null } : null);
    return { at: u.at, session: win(u.fiveHour), weekly: win(u.sevenDay) };
  }
  let lastView = null;
  function view() { return M.buildView(R.status === 'signed-out' ? null : S.last, feed(), Date.now()); }
  function snapshot() {
    const v = view();
    return { ok: true, ...v, status: R.status, signedIn: R.status !== 'signed-out', fetching: R.fetching, alerts: S.alerts,
      alert: Date.now() < R.alertUntil ? R.alert : null, claudeCode: Boolean(feed()) };
  }
  function broadcast() {
    const st = snapshot();
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && /(mascot|settings-app)\.html/.test(w.webContents.getURL())) w.webContents.send('meter:state', st);
  }
  function update() {
    const v = view();
    if (S.alerts) {
      const { alerts, sent } = M.alertsFor(v, S.sent, Date.now()); S.sent = sent;
      if (alerts.length) {
        save();
        const a = alerts[0]; R.alert = { kind: a.kind, name: a.name, level: a.level, pct: Math.round(a.pct), resetsAt: a.resetsAt }; R.alertUntil = Date.now() + 15000;
        if (Notification?.isSupported()) {
          const what = a.kind === 'session' ? 'Your 5-hour Claude limit' : a.kind === 'weekly' ? 'Your weekly Claude limit' : `Your ${a.name} limit`;
          try { new Notification({ title: `${what} is ${Math.round(a.pct)}% used`, body: a.resetsAt ? `The glass refills at ${new Date(a.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Slow down a little.', silent: true }).show(); } catch {}
        }
      }
    }
    lastView = v; broadcast();
  }

  // ---------- signing in to claude.ai ----------
  async function signedIn() { try { return Boolean(U.pickOrg(await getJson(`${CLAUDE}/api/organizations`), null)); } catch { return false; } }
  function openLogin() {
    if (loginWin && !loginWin.isDestroyed()) { loginWin.show(); loginWin.focus(); return; }
    const prefs = { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false };
    loginWin = new BrowserWindow({ width: 980, height: 780, title: 'Sign in to Claude - Rehatt', autoHideMenuBar: true, icon: path.join(__dirname, 'assets', 'icon.ico'), webPreferences: prefs });
    loginWin.webContents.setUserAgent(cleanUA);
    // sign-in pop-ups (such as Google) open in the same private browser, never in the app
    loginWin.webContents.setWindowOpenHandler(({ url }) => (/^https:\/\//i.test(url) ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: prefs } } : { action: 'deny' }));
    loginWin.webContents.on('will-navigate', (e, url) => { if (!/^https:\/\//i.test(url)) e.preventDefault(); });
    loginWin.loadURL(`${CLAUDE}/login`);
    let checking = false;
    const probe = setInterval(async () => {
      if (checking || !loginWin || loginWin.isDestroyed()) return;
      checking = true; const ok = await signedIn(); checking = false;
      if (ok && loginWin && !loginWin.isDestroyed()) { clearInterval(probe); loginWin.close(); }
    }, 2500);
    loginWin.on('closed', () => { clearInterval(probe); loginWin = null; R.errors = 0; R.status = 'checking'; refresh('login'); });
  }
  async function signOut() {
    try { await claudeSes.clearStorageData(); } catch {}
    S.orgId = null; S.last = null; R.status = 'signed-out'; save(); clearTimeout(R.timer); update();
  }

  const trusted = e => /^file:.*\/(mascot|settings-app)\.html/.test(e.senderFrame?.url || '');
  const ACTIONS = { refresh: () => refresh('manual'), signin: openLogin, signout: signOut, alertsOn: () => { S.alerts = true; save(); broadcast(); }, alertsOff: () => { S.alerts = false; save(); broadcast(); } };
  ipcMain.handle('meter:get', e => (trusted(e) ? snapshot() : null));
  ipcMain.handle('meter:action', async (e, payload) => {
    if (!trusted(e) || !Object.hasOwn(ACTIONS, payload?.action)) return { ok: false };
    await ACTIONS[payload.action](); return snapshot();
  });

  app.whenReady().then(() => {
    claudeSes = session.fromPartition(PARTITION);
    cleanUA = claudeSes.getUserAgent().replace(/\s+rehatt\/\S+/i, '').replace(/\s+Rehatt\/\S+/i, '').replace(/\s+Electron\/\S+/i, '');
    claudeSes.setUserAgent(cleanUA);
    claudeSes.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
    claudeSes.on('will-download', e => e.preventDefault());
    if (R.status !== 'signed-out') refresh('start');
    // Claude Code's status line arrives through the hook hub: look for new readings every few seconds
    let lastFeed = 0;
    const timer = setInterval(() => { const f = feed(); if (f && f.at !== lastFeed) { lastFeed = f.at; update(); } else if (Date.now() - (lastView?.syncedAt || 0) > 60e3) broadcast(); }, 3000); timer.unref?.();
    try {
      powerMonitor.on('suspend', () => { R.paused = true; clearTimeout(R.timer); });
      powerMonitor.on('lock-screen', () => { R.paused = true; clearTimeout(R.timer); });
      const wake = () => { R.paused = false; refresh('wake'); };
      powerMonitor.on('resume', wake); powerMonitor.on('unlock-screen', wake);
    } catch {}
  });
  app.rehattMeter = { snapshot };
  return { snapshot };
}

if (process.versions.electron) setup(require('electron'));
module.exports = { setup };
