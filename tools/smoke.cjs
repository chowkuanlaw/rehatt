'use strict';
// CI smoke test: opens the island on each screen, saves a screenshot of every window and lists page errors,
// then quits. Started by main.js only when REHATT_SMOKE is set (the folder to write to). Never in the app itself.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { BrowserWindow } = require('electron');
const { HOOK_URL } = require('../agent-hooks.cjs');

const SCREENS = [
  ['1-small', ''],
  ['2-home', "setView('home')"],
  ['3-apps', "setView('apps')"],
  ['4-claude', "window.__kopiMonitor?.open('claudecode')"],
  ['5-claude-question', "window.__kopiMonitor?.open('claudecode')", [
    { hook_event_name: 'UserPromptSubmit', prompt: 'Add a stretch reminder' },
    { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }]],
  ['6-claude-done', "setView('home')", [
    { hook_event_name: 'Stop', last_assistant_message: 'All done. The stretch reminder now works.' }]],
  ['7-focus', "setView('focus')"],
  ['8-tray', "setView('tray')"],
  ['9-clips', "setView('clips')"],
  ['10-note', "setView('note')"],
  ['11-stretch', "setView('stretch')"],
  ['12-meter', "setView('meter')"],
  ['13-stretch-due', "window.__rehattStretch?.test('stretch'); setView('home'); setMode('compact', false)"],
  ['14-stretch-page-due', "setView('stretch')"],
  ['15-stretch-active', "window.kopi.stretchAction('start')"],
  ['16-water-nudge', "window.__rehattStretch?.test('clear'); window.__rehattStretch?.test('water'); setView('home'); setMode('compact', false)"],
  ['17-apps-grid', "window.__rehattStretch?.test('clear'); setView('apps')"],
  ['18-settings', "window.kopi?.settingsOpen?.()"]
];
const SETTINGS_TABS = ['home', 'connect', 'stretch', 'usage', 'apps', 'general'];

module.exports = function smoke(getWindow, app) {
  const out = path.resolve(process.env.REHATT_SMOKE);
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const watch = win => {
    win.webContents.on('console-message', (event, level, message, line, source) => {
      const lv = event?.level ?? level, msg = event?.message ?? message;
      if (lv === 'error' || lv === 3 || lv === 'warning' || lv === 2) errors.push(`[${win.getTitle() || 'window'}] ${String(lv)} ${event?.sourceId ?? source ?? ''}:${event?.lineNumber ?? line ?? ''} ${msg}`);
    });
    win.webContents.on('render-process-gone', (_e, d) => errors.push(`[${win.getTitle()}] renderer gone: ${d.reason}`));
  };
  app.on('browser-window-created', (_e, win) => watch(win));
  process.on('uncaughtException', e => errors.push('main: ' + (e.stack || e.message)));

  // pretend to be Claude Code: send a hook event the same way Claude Code does
  const post = (token, event) => new Promise(resolve => {
    const body = JSON.stringify({ session_id: 'smoke', cwd: 'C:\\work\\rehatt', transcript_path: '', ...event });
    const req = http.request(HOOK_URL, { method: 'POST', timeout: 3000, headers: { 'content-type': 'application/json', 'x-rehatt-token': token } }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', e => { errors.push('hook post: ' + e.message); resolve(); }); req.end(body);
  });

  (async () => {
    await wait(9000); // intro animation
    const island = getWindow();
    let token = '';
    try {
      // no mouse on the build machine: keep the island open instead of folding it away
      await island.webContents.executeJavaScript("updateHover = function () {}; window.kopi?.aiMonitorHooksInstall?.('claude')");
      token = fs.readFileSync(path.join(app.getPath('userData'), 'rehatt-hook-token'), 'utf8').trim();
    } catch (e) { errors.push('hooks install: ' + e.message); }
    for (const [name, js, events] of SCREENS) {
      try {
        for (const event of events || []) await post(token, event);
        if (js) await island.webContents.executeJavaScript(`try { if (typeof setMode === 'function' && !${JSON.stringify(js)}.includes('settingsOpen')) setMode('expanded', false); ${js} } catch (e) { console.error('smoke ${name}: ' + e.message) }`);
        await wait(1800);
        for (const win of BrowserWindow.getAllWindows()) {
          if (win.isDestroyed() || !win.isVisible() || /settings-app\.html/.test(win.webContents.getURL()) && name !== '18-settings') continue;
          const tag = win === island ? 'island' : (win.getTitle() || 'window').replace(/[^a-z0-9]+/gi, '-');
          fs.writeFileSync(path.join(out, `${name}-${tag}.png`), (await win.webContents.capturePage()).toPNG());
        }
      } catch (e) { errors.push(`smoke ${name}: ${e.message}`); }
    }
    // the settings app: every tab
    const settings = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /settings-app\.html/.test(w.webContents.getURL()));
    if (settings) for (const tab of SETTINGS_TABS) {
      try {
        await settings.webContents.executeJavaScript(`document.querySelector('nav [data-tab="${tab}"]')?.click(); 1`);
        await wait(1500);
        fs.writeFileSync(path.join(out, `30-settings-${tab}.png`), (await settings.webContents.capturePage()).toPNG());
      } catch (e) { errors.push(`smoke settings ${tab}: ${e.message}`); }
    }
    else errors.push('smoke: the settings app did not open');
    fs.writeFileSync(path.join(out, 'errors.txt'), [...new Set(errors)].join('\n'));
    app.exit(0);
  })();
};
