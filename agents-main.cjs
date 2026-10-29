'use strict';
// Your coding agents (Claude Code and Codex) → Rehatt. They report through hooks (agent-hooks.cjs); here the
// island gets their state, Windows shows a notification when one has a question or is done, and a click on the
// nudge brings their terminal to the front. Nothing is read from your screen and nothing is answered for you.
const { spawn } = require('node:child_process');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { createHub } = require('./agent-hooks.cjs');

// Bring the terminal (or VS Code) that runs Claude Code to the front: walk up from a process that
// belongs to Claude Code to the first parent that has a window.
function focusWindowOf(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || process.platform !== 'win32') return Promise.resolve(false);
  // Windows blocks background apps from stealing focus. A quick Alt tap unlocks that; if it still
  // fails, minimise + restore the window (that always activates it). Success = it is really in front.
  const script = `
Add-Type -Namespace Rehatt -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c); [DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h); [DllImport("user32.dll")] public static extern bool BringWindowToTop(System.IntPtr h); [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, System.UIntPtr e);'
function Front($h) { return [Rehatt.Win]::GetForegroundWindow() -eq $h }
$p = ${pid}
for ($i = 0; $i -lt 12 -and $p; $i++) {
  $gp = Get-Process -Id $p -ErrorAction SilentlyContinue
  if ($gp -and $gp.MainWindowHandle -ne 0) {
    $h = $gp.MainWindowHandle
    if ([Rehatt.Win]::IsIconic($h)) { [void][Rehatt.Win]::ShowWindow($h, 9) }
    [Rehatt.Win]::keybd_event(0x12, 0, 0, [System.UIntPtr]::Zero); [Rehatt.Win]::keybd_event(0x12, 0, 2, [System.UIntPtr]::Zero)
    [void][Rehatt.Win]::SetForegroundWindow($h); [void][Rehatt.Win]::BringWindowToTop($h)
    Start-Sleep -Milliseconds 120
    if (-not (Front $h)) {
      [void][Rehatt.Win]::ShowWindow($h, 6); Start-Sleep -Milliseconds 60; [void][Rehatt.Win]::ShowWindow($h, 9)
      [void][Rehatt.Win]::SetForegroundWindow($h); Start-Sleep -Milliseconds 120
    }
    if (Front $h) { exit 0 } else { exit 2 }
  }
  $p = (Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue).ParentProcessId
}
exit 1`;  return new Promise(resolve => {
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, shell: false });
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(false); }, 8000);
    child.on('exit', code => { clearTimeout(timer); resolve(code === 0 ? true : code === 2 ? 'blocked' : false); });
    child.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

// Which window runs this process? Walk up the parents to the first one with a window
// (Windows Terminal, VS Code, ...). Done right when a hook arrives, while its helper shell still exists.
function windowPidOf(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || process.platform !== 'win32') return Promise.resolve(null);
  const script = `$p = ${pid}
for ($i = 0; $i -lt 12 -and $p; $i++) {
  $gp = Get-Process -Id $p -ErrorAction SilentlyContinue
  if ($gp -and $gp.MainWindowHandle -ne 0) { Write-Output $p; exit 0 }
  $p = (Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue).ParentProcessId
}
exit 1`;
  return new Promise(resolve => {
    let out = '';
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, shell: false });
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(null); }, 8000);
    child.stdout.on('data', chunk => { out += chunk; });
    child.on('exit', code => { clearTimeout(timer); const win = Number.parseInt(out.trim(), 10); resolve(code === 0 && win > 0 ? win : null); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}
function setup(electron, options = {}) {
  const { app, BrowserWindow, ipcMain, Notification } = electron;
  const liveNotifications = new Set();
  const trusted = event => {
    try {
      const actual = path.resolve(fileURLToPath(event.sender.getURL())), expected = path.join(__dirname, 'mascot.html');
      return process.platform === 'win32' ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
    } catch { return false; }
  };
  const hub = options.hub || createHub({
    userData: app.getPath('userData'), onChange: () => emit(), onFinish: session => notifyHook(session), resolvePid: windowPidOf });
  const view = () => ({ ok: true, available: true, providers: [hub.view('claude'), hub.view('codex')],
    // the last jobs of Claude Code and Codex, so a quiet page still shows what they did for you
    history: (hub.history?.() || []).slice(0, 12).map(h => ({ at: h.at, agent: h.agent, project: h.project, prompt: String(h.prompt || '').slice(0, 300), result: h.result, files: h.files, seconds: h.seconds })) });
  const emit = () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && trusted({ sender: win.webContents })) win.webContents.send('ai-monitor:state', view());
    }
  };
  function bring(provider) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || !trusted({ sender: win.webContents })) continue;
      win.showInactive(); win.webContents.send('ai-monitor:open', { provider });
    }
  }
  let notifyEnabled = true; // Settings → Windows notifications
  function notifyHook(session) {
    if (!notifyEnabled || !Notification?.isSupported()) return;
    const who = session.agent === 'codex' ? 'Codex' : 'Claude Code';
    const titles = { question: who + ' has a question', done: who + ' is done', error: who + ': error' };
    if (!titles[session.state]) return;
    const notification = new Notification({ title: titles[session.state], body: (session.project ? session.project + ': ' : '') + String(session.question || session.detail || '').slice(0, 180), silent: true });
    liveNotifications.add(notification);
    notification.on('close', () => liveNotifications.delete(notification));
    notification.on('click', () => { bring(session.agent === 'codex' ? 'codex' : 'claudecode'); liveNotifications.delete(notification); });
    notification.show();
  }
  const handlers = {
    'ai-monitor:get': async () => view(),
    // agent: 'claude' (Claude Code) or 'codex'
    'ai-monitor:hooks-install': async payload => { if (payload?.agent === 'codex') hub.installCodex(); else hub.install(); return view(); },
    'ai-monitor:hooks-uninstall': async payload => { if (payload?.agent === 'codex') hub.uninstallCodex(); else hub.uninstall(); return view(); },
    'ai-monitor:hooks-jump': async payload => {
      const pid = hub.pidOf(String(payload?.sessionId || ''));
      if (!pid) throw new Error('Rehatt doesn’t know yet which window belongs to this session. He learns it after Claude’s first answer.');
      const focused = await focusWindowOf(pid);
      if (focused === 'blocked') throw new Error('Windows didn’t let Rehatt bring the window to the front. Click the terminal in your taskbar.');
      if (focused !== true) { hub.forgetWindow?.(String(payload?.sessionId || '')); throw new Error('The terminal window was not found. Is it still open?'); }
      return view();
    },
    'ai-monitor:set-notify': async payload => { notifyEnabled = Boolean(payload?.enabled); return view(); },
    'ai-monitor:hooks-seen': async () => { hub.seen(); return view(); },
    'ai-monitor:hooks-test': async payload => {
      if (!hub) throw new Error('Not available.');
      const id = 'rehatt-test', base = { session_id: id, cwd: 'C:\\Test\\webshop' };
      const send = events => events.forEach(e => hub.apply({ ...base, ...e }));
      const tool = (name, input) => [{ hook_event_name: 'PreToolUse', tool_name: name, tool_input: input }, { hook_event_name: 'PostToolUse', tool_name: name }];
      const scenes = {
        busy: () => send([{ hook_event_name: 'UserPromptSubmit', prompt: 'Make the button on the homepage blue' }, ...tool('Read', { file_path: 'C:\\Test\\index.html' }),
          { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:\\Test\\button.css' } }]),
        question: () => send([{ hook_event_name: 'UserPromptSubmit', prompt: 'Make the button look nicer' }, ...tool('Read', { file_path: 'C:\\Test\\button.css' }),
          { hook_event_name: 'Stop', last_assistant_message: 'I can make the button blue or green. Which colour do you want?' }]),
        done: () => send([{ hook_event_name: 'UserPromptSubmit', prompt: 'Make the button on the homepage blue' }, ...tool('Read', { file_path: 'C:\\Test\\index.html' }),
          ...tool('Edit', { file_path: 'C:\\Test\\button.css' }), ...tool('Bash', { command: 'npm test' }),
          { hook_event_name: 'Stop', last_assistant_message: 'Done! The button is blue now and lights up when you hover it. All tests pass.' }]),
        error: () => send([{ hook_event_name: 'UserPromptSubmit', prompt: 'Put the website online' }, { hook_event_name: 'StopFailure', error_type: 'rate_limit' }]),
        clear: () => send([{ hook_event_name: 'SessionEnd' }]),
        // richer demo scenes (for videos): real-looking code, terminal output and a permission request
        'demo-busy': () => send([{ hook_event_name: 'UserPromptSubmit', prompt: 'Fix the SST calculation' }, ...tool('Read', { file_path: 'C:\\Test\\src\\checkout.ts' }),
          { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:\\Test\\src\\checkout.ts', old_string: 'const SST = 0.06\nreturn sum * (1 + SST)', new_string: 'const SST = 0.08\nreturn Math.round(sum * (1 + SST) * 100) / 100' } }]),
        'demo-done': () => send([{ hook_event_name: 'PostToolUse', tool_name: 'Edit' }, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } },
          { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: '> webshop@1.0.0 test\nPASS  tests/checkout.test.ts\nTests:  48 passed, 48 total' } },
          { hook_event_name: 'Stop', last_assistant_message: 'Done! SST is now 8% and rounds correctly. All 48 tests pass.' }]),
        // step by step (videos / testing): a prompt, one edit per call, and running into the limit
        prompt: () => send([{ hook_event_name: 'UserPromptSubmit', prompt: String(payload?.command || 'Fix the last bug').slice(0, 200) }]),
        edit: () => send([{ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join('C:\\Test\\webshop\\src', path.basename(String(payload?.command || 'app.ts'))), old_string: 'const total = 0', new_string: 'const total = sum(items)' } }]),
        read: () => send(tool('Read', { file_path: path.join('C:\\Test\\webshop\\src', path.basename(String(payload?.command || 'app.ts'))) })),
        bash: () => send([{ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: String(payload?.command || 'npm test').slice(0, 200) } }]),
        stop: () => send([{ hook_event_name: 'PostToolUse', tool_name: 'Bash' }, { hook_event_name: 'Stop', last_assistant_message: String(payload?.command || 'Done!').slice(0, 300) }]),
        limit: () => send([{ hook_event_name: 'StopFailure', error_type: 'rate_limit' }]),
        usage: () => hub.applyUsage({ five_hour: { used: Number(payload?.command) || 0, resets_at: Math.floor(Date.now() / 1000) + 3600 } }), // command = percent
        // the question nudges: a multiple-choice question and a plan, as Claude Code sends them
        'demo-ask': () => send([{ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Which colour should the button be?' }] } }]),
        'demo-plan': () => send([{ hook_event_name: 'PreToolUse', tool_name: 'ExitPlanMode', tool_input: { plan: '## Dark mode' } }]),
        'demo-perm': () => send([{ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }])
      };
      if (!scenes[payload?.kind]) throw new Error('Unknown test.');
      scenes[payload.kind](); return view();
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, async (event, payload) => {
    if (!trusted(event)) return { ok: false, error: 'This window has no access to your coding agents.' };
    try { return await handler(payload); } catch (error) { return { ok: false, error: error.message }; }
  });
  app.whenReady().then(() => {
    hub.start();
    // Keep the clock ticking while an agent works.
    const tick = setInterval(() => { if (hub.view('claude').state === 'running' || hub.view('codex').state === 'running') emit(); }, 1000); tick.unref?.();
  });
  app.on('before-quit', () => { hub.stop(); liveNotifications.clear(); });
  // The Rehatt settings app (settings-app-main.cjs) reads the connections and the history from here; the glass reads usage.
  app.kopiMonitor = { view, handlers, history: () => hub.history() || [], usage: () => hub.usage() };
  return { view, handlers, hub };
}
if (process.versions.electron) setup(require('electron'));
module.exports = { setup, focusWindowOf, windowPidOf };
