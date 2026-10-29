'use strict';
// CI smoke test: opens the island on each screen, saves a screenshot of every window and lists page errors,
// then quits. Started by main.js only when REHATT_SMOKE is set (the folder to write to). Never in the app itself.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { BrowserWindow } = require('electron');
const { HOOK_URL } = require('../claude-code-hooks.cjs');

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
  ['13-settings', "window.kopi?.settingsOpen?.()"]
];

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
    const req = http.request(HOOK_URL, { method: 'POST', timeout: 3000, headers: { 'content-type': 'application/json', 'x-kopi-token': token } }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', e => { errors.push('hook post: ' + e.message); resolve(); }); req.end(body);
  });

  (async () => {
    await wait(9000); // intro animation
    const island = getWindow();
    let token = '';
    try {
      await island.webContents.executeJavaScript("window.kopi?.aiMonitorHooksInstall?.('claude')");
      token = fs.readFileSync(path.join(app.getPath('userData'), 'claude-code-hook-token'), 'utf8').trim();
    } catch (e) { errors.push('hooks install: ' + e.message); }
    for (const [name, js, events] of SCREENS) {
      try {
        for (const event of events || []) await post(token, event);
        if (js) await island.webContents.executeJavaScript(`try { if (typeof setMode === 'function' && !${JSON.stringify(js)}.includes('settingsOpen')) setMode('expanded', false); ${js} } catch (e) { console.error('smoke ${name}: ' + e.message) }`);
        await wait(1800);
        for (const win of BrowserWindow.getAllWindows()) {
          if (win.isDestroyed() || !win.isVisible()) continue;
          const tag = win === island ? 'island' : (win.getTitle() || 'window').replace(/[^a-z0-9]+/gi, '-');
          fs.writeFileSync(path.join(out, `${name}-${tag}.png`), (await win.webContents.capturePage()).toPNG());
        }
      } catch (e) { errors.push(`smoke ${name}: ${e.message}`); }
    }
    fs.writeFileSync(path.join(out, 'errors.txt'), [...new Set(errors)].join('\n'));
    app.exit(0);
  })();
};
