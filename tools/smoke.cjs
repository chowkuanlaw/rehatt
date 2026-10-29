'use strict';
// CI smoke test: walks every flow of the Rehatt Flow Review (W1–W13, R8) with a pretend mouse and pretend
// Claude Code hook events, checks what the island does at each step, saves a screenshot of each step and the
// settings app, lists page errors and failed checks, then quits.
// Started by main.js only when REHATT_SMOKE is set (the folder to write to). Never in the app itself.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { BrowserWindow, screen } = require('electron');
const { HOOK_URL } = require('../agent-hooks.cjs');

const SETTINGS_TABS = ['home', 'connect', 'stretch', 'usage', 'apps', 'general'];

module.exports = function smoke(getWindow, app) {
  const out = path.resolve(process.env.REHATT_SMOKE);
  fs.mkdirSync(out, { recursive: true });
  const errors = [], checks = [];
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
  let token = '';
  const post = (event, session = 'smoke') => new Promise(resolve => {
    const body = JSON.stringify({ session_id: session, cwd: 'C:\\work\\rehatt', transcript_path: '', ...event });
    const req = http.request(HOOK_URL, { method: 'POST', timeout: 3000, headers: { 'content-type': 'application/json', 'x-rehatt-token': token } }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', e => { errors.push('hook post: ' + e.message); resolve(); }); req.end(body);
  });

  // a pretend mouse: main.js reads the cursor from screen.getCursorScreenPoint (hover), the page gets real input events (clicks)
  const realCursor = screen.getCursorScreenPoint.bind(screen);
  let cursor = { x: 5, y: 900 };
  screen.getCursorScreenPoint = () => cursor;

  (async () => {
    await wait(9000); // intro + hello
    const island = getWindow();
    const js = code => island.webContents.executeJavaScript(`(() => { ${code} })()`).catch(e => { errors.push('js: ' + e.message); return null; });
    const state = () => js(`const p = window.__rehattDirector?.pick(); return { mode, view: currentView, kind: p?.kind || null, text: p?.text || '', banner: !document.getElementById('rehatt-banner')?.hidden, stretch: window.__rehattStretch?.state()?.mode, water: window.__rehattStretch?.state()?.water, glasses: window.__rehattStretch?.state()?.today?.water }`);
    const shot = async name => { try { fs.writeFileSync(path.join(out, `${name}.png`), (await island.webContents.capturePage()).toPNG()); } catch (e) { errors.push(`shot ${name}: ${e.message}`); } };
    const check = async (flow, what, test) => {
      const s = await state(); let ok = false;
      try { ok = Boolean(test(s || {})); } catch {}
      checks.push({ flow, what, ok, state: s });
      if (!ok) errors.push(`CHECK ${flow}: ${what} — got ${JSON.stringify(s)}`);
      return s;
    };
    const b = () => island.getBounds();
    const away = async () => { cursor = { x: b().x + 5, y: b().y + 300 }; await wait(80); };
    // hover the small island (on its text, away from the quick buttons)
    const hoverIsland = async () => { const r = await js('return islandBounds'); cursor = { x: b().x + r.x + 40, y: b().y + 14 }; island.webContents.sendInputEvent({ type: 'mouseMove', x: r.x + 40, y: 14 }); await wait(80); };
    const clickAt = async (x, y) => {
      cursor = { x: b().x + x, y: b().y + y };
      for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) { island.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }); await wait(40); }
      await wait(150);
    };
    const clickHit = async key => { const r = await js(`return hit[${JSON.stringify(key)}] || null`); if (!r) { errors.push(`click: no ${key} on screen`); return; } await clickAt(r.x + r.width / 2, r.y + r.height / 2); };
    const reset = async () => { await js("window.__rehattStretch?.test('clear'); if (window.__kopiFocus?.active()) window.__kopiFocus.stop(); window.__rehattDirector?.clearNews(); currentView = 'home'; setMode('rest', false); return 1"); await away(); await wait(1500); };

    try {
      await js("window.kopi?.aiMonitorHooksInstall?.('claude'); return 1");
      await wait(500);
      token = fs.readFileSync(path.join(app.getPath('userData'), 'rehatt-hook-token'), 'utf8').trim();
    } catch (e) { errors.push('hooks install: ' + e.message); }

    const flows = {
      async W1() { await away(); await wait(500); await check('W1', 'starts as the small pill at the top', s => s.mode === 'rest'); await shot('W1-1-pill'); },

      async W2() { // a question: nudge → hover opens the Claude page → folding keeps the question → answering clears it
        await post({ hook_event_name: 'UserPromptSubmit', prompt: 'Add a stretch reminder' }); await wait(600);
        await post({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }); await wait(900);
        await check('W2', 'a question shows as a nudge', s => s.mode === 'compact' && s.kind === 'question'); await shot('W2-1-question-nudge');
        await hoverIsland(); await wait(1200);
        await check('W2', 'hover opens the Claude page, not Home', s => s.mode === 'expanded' && s.view === 'monitor'); await shot('W2-2-claude-page');
        await away(); await wait(2200);
        await check('W2', 'folding keeps the question (looking is not answering)', s => s.mode === 'compact' && s.kind === 'question'); await shot('W2-3-folded-still-asking');
        await post({ hook_event_name: 'PostToolUse', tool_name: 'Bash' }); await wait(900);
        await check('W2', 'answered in the terminal: the question is gone', s => s.kind !== 'question');
      },

      async W3() { // done: a 4 s nudge, then the pill
        await post({ hook_event_name: 'Stop', last_assistant_message: 'All done.' }); await wait(800);
        await check('W3', 'Claude is done shows as a short nudge', s => s.mode === 'compact' && s.kind === 'flash' && /done|siap/i.test(s.text)); await shot('W3-1-done-nudge');
        await wait(4500);
        await check('W3', 'after 4 s back to the pill', s => s.mode === 'rest'); await shot('W3-2-pill-after-done');
        await js('window.kopi.aiMonitorHooksSeen(); return 1');
      },

      async W5() { // a stretch: due → Start on the nudge → page stays open while stretching → done → cheer → pill
        await js("window.__rehattStretch.test('stretch'); return 1"); await wait(900);
        await check('W5', 'a due stretch shows as a nudge with Start and Later', s => s.mode === 'compact' && s.kind === 'stretchDue'); await shot('W5-1-due-nudge');
        await clickHit('nudgeBtn0'); await wait(900);
        await check('W5', 'Start opens the Stretch page with the timer', s => s.mode === 'expanded' && s.view === 'stretch' && s.stretch === 'active'); await shot('W5-2-stretching-page');
        await away(); await wait(3500);
        await check('W5', 'the page stays open while you stretch, mouse away', s => s.mode === 'expanded' && s.view === 'stretch'); await shot('W5-3-still-open');
        await js("window.kopi.stretchAction('done'); return 1"); await wait(2600);
        await check('W5', 'done: the page folds and the cheer shows', s => s.mode === 'compact' && s.kind === 'cheer'); await shot('W5-4-cheer');
        await wait(4500);
        await check('W5', 'then back to the pill', s => s.mode === 'rest' || s.kind === 'water');
        // Later = snooze, with a short "Snoozed · back at" note
        await reset();
        await js("window.__rehattStretch.test('stretch'); return 1"); await wait(900);
        await clickHit('nudgeBtn1'); await wait(500);
        await check('W5', 'Later snoozes and says until when', s => s.stretch === 'snoozed' && s.kind === 'note' && s.mode !== 'expanded'); await shot('W5-5-snoozed');
        await away(); await wait(3000);
        await check('W5', 'snoozed note goes away', s => s.mode === 'rest');
      },

      async W6() { // AI working: the stretch comes early; a question during the stretch waits until the stretch ends
        await reset();
        await post({ hook_event_name: 'UserPromptSubmit', prompt: 'Refactor the hooks' }, 'smoke-ai'); await wait(800);
        await js("window.__rehattStretch.test('stretch'); return 1"); await wait(900);
        await check('W6', 'the nudge says your AI is working', s => s.kind === 'stretchDue' && /AI/.test(s.text)); await shot('W6-1-ai-stretch-nudge');
        await js("window.kopi.stretchAction('start'); return 1"); await wait(600); await away(); await wait(300);
        await js("currentView = 'home'; setMode('rest', false); return 1"); await wait(1200); // Esc-like: fold to the countdown
        await post({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Allow Edit?' }, 'smoke-ai'); await wait(900);
        await check('W6', 'a question during the stretch: the countdown keeps the island', s => s.kind === 'stretchActive'); await shot('W6-2-countdown-with-question-waiting');
        await js("window.kopi.stretchAction('done'); return 1"); await wait(800);
        await check('W6', 'the cheer first', s => s.kind === 'cheer');
        await wait(4500);
        await check('W6', 'then the question', s => s.kind === 'question'); await shot('W6-3-question-after-stretch');
        await post({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }, 'smoke-ai'); await wait(5000);
        await js('window.kopi.aiMonitorHooksSeen(); return 1');
      },

      async W7() { // water: clicking the nudge opens the water card and counts nothing; only Drank counts
        await reset();
        await js("window.__rehattStretch.test('water'); return 1"); await wait(900);
        const before = await check('W7', 'water asks with Drank and Later', s => s.kind === 'water' && s.mode === 'compact'); await shot('W7-1-water-nudge');
        const r = await js('return islandBounds'); await clickAt(r.x + 50, 14); await wait(900);
        await check('W7', 'clicking the nudge opens Stretch and counts no glass', s => s.mode === 'expanded' && s.view === 'stretch' && s.glasses === before?.glasses); await shot('W7-2-water-card');
        await js("currentView = 'home'; setMode('rest', false); return 1"); await away(); await wait(1200);
        await clickHit('nudgeBtn0'); await wait(500);
        await check('W7', 'Drank counts one glass and says so', s => s.glasses === (before?.glasses || 0) + 1 && s.kind === 'note'); await shot('W7-3-drank');
      },

      async W9() { // Focus: the ring in the nudge; when it ends, "Focus done"
        await reset();
        await js('window.__kopiFocus.start(4); return 1'); await wait(1500);
        await check('W9', 'Focus shows its timer in the nudge', s => s.kind === 'focus'); await shot('W9-1-focus');
        await wait(5000);
        await check('W9', 'Focus done follows', s => s.kind === 'flash' || s.kind === 'stretchDue'); await shot('W9-2-focus-done');
      },

      async W10() { // usage alert: a nudge when small, a banner when open
        await reset();
        await js("window.__rehattDirector.flash({ key: 'smoke-usage', tone: 'us', ms: 5000, view: 'meter', text: '☕ 80% of 5-hour limit used · refills 14:20' }); return 1"); await wait(800);
        await check('W10', 'the usage alert shows as a nudge', s => s.kind === 'flash' && /80%/.test(s.text)); await shot('W10-1-usage-nudge');
        await hoverIsland(); await wait(1200);
        await check('W10', 'hover opens Usage', s => s.mode === 'expanded' && s.view === 'meter'); await shot('W10-2-usage-page');
      },

      async R8() { // news while the island is open: a banner, the page stays
        await reset();
        await hoverIsland(); await wait(1200);
        await js("setView('home'); return 1"); await wait(500);
        await js("window.__rehattStretch.test('stretch'); return 1"); await wait(900);
        await check('R8', 'a stretch due while open on Home: banner, page stays', s => s.mode === 'expanded' && s.view === 'home' && s.banner); await shot('R8-1-banner');
        const r = await js("const e = document.getElementById('rehatt-banner').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }");
        if (r) await clickAt(r.x, r.y);
        await wait(800);
        await check('R8', 'the banner opens Stretch', s => s.view === 'stretch'); await shot('R8-2-banner-opened');
      },

      async W12() { // pages: folding remembers the page for 2 minutes
        await reset();
        await hoverIsland(); await wait(1200);
        await js("setView('meter'); return 1"); await wait(600);
        await away(); await wait(3500);
        await check('W12', 'leaving folds it', s => s.mode !== 'expanded');
        await hoverIsland(); await wait(1200);
        await check('W12', 'hovering again reopens the same page', s => s.mode === 'expanded' && s.view === 'meter'); await shot('W12-1-reopened-same-page');
        for (const view of ['home', 'apps', 'focus', 'tray', 'clips', 'note', 'stretch']) { await js(`setView('${view}'); return 1`); await wait(1200); await shot(`page-${view}`); }
      },

      async W11() { // dragging (free mode): press and move, it follows; no opening while the button is down
        await reset();
        app.rehattPlace?.set('free'); await wait(600);
        const before = b(), cx = before.x + before.width / 2;
        const at = (x, y) => ({ x: Math.round(x - before.x), y: Math.round(y - before.y), globalX: Math.round(x), globalY: Math.round(y) });
        const mouse = (type, x, y) => { cursor = { x: Math.round(x), y: Math.round(y) }; island.webContents.sendInputEvent({ type, button: 'left', clickCount: 1, ...at(x, y) }); };
        mouse('mouseMove', cx, before.y + 12); await wait(120);
        mouse('mouseDown', cx, before.y + 12); await wait(700); // held down longer than the hover delay
        await check('W11', 'pressing does not open the island', s => s.mode !== 'expanded');
        for (let i = 1; i <= 10; i++) { mouse('mouseMove', cx + i * 30, before.y + 12 + i * 20); await wait(60); }
        await wait(300);
        mouse('mouseUp', cx + 300, before.y + 212); await wait(900);
        const after = b();
        fs.writeFileSync(path.join(out, 'drag.json'), JSON.stringify({ before, after }, null, 1));
        if (after.x - before.x < 250 || after.y - before.y < 150) errors.push(`CHECK W11: the island did not follow the mouse (${JSON.stringify({ before, after })})`);
        await check('W11', 'dropped: it stays small', s => s.mode !== 'expanded'); await shot('W11-1-after-drag');
        app.rehattPlace?.set('top'); await wait(600);
        const top = b();
        if (Math.abs(top.y - before.y) > 2 || Math.abs(top.x - before.x) > 2) errors.push(`CHECK W11: "fixed at the top" did not put it back (${JSON.stringify(top)})`);
      }
    };
    for (const [name, run] of Object.entries(flows)) {
      try { await run(); } catch (e) { errors.push(`flow ${name}: ${e.stack || e.message}`); }
    }

    // the settings app: every tab
    try { await js('window.kopi?.settingsOpen?.(); return 1'); await wait(2500); } catch {}
    const settings = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /settings-app\.html/.test(w.webContents.getURL()));
    if (settings) for (const tab of SETTINGS_TABS) {
      try {
        await settings.webContents.executeJavaScript(`document.querySelector('nav [data-tab="${tab}"]')?.click(); 1`);
        await wait(1500);
        fs.writeFileSync(path.join(out, `settings-${tab}.png`), (await settings.webContents.capturePage()).toPNG());
      } catch (e) { errors.push(`smoke settings ${tab}: ${e.message}`); }
    }
    else errors.push('smoke: the settings app did not open');
    screen.getCursorScreenPoint = realCursor;
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(checks, null, 1));
    fs.writeFileSync(path.join(out, 'errors.txt'), [...new Set(errors)].join('\n'));
    app.exit(0);
  })();
};
