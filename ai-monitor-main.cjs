'use strict';
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const path = require('node:path');
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');
const { PROVIDERS, observe, Session } = require('./ai-monitor-model.cjs');
const { createHub } = require('./claude-code-hooks.cjs');

class NativeWorker {
  constructor(options = {}) { this.spawn = options.spawn || spawn; this.platform = options.platform || process.platform; this.queue = Promise.resolve(); this.serial = 0; }
  request(method, args = {}) {
    const job = this.queue.then(() => this.perform(method, args));
    this.queue = job.catch(() => {}); return job;
  }
  start() {
    if (this.closed) throw new Error('Kopi Island is closing.');
    if (this.child) return;
    if (this.platform !== 'win32') throw new Error('This connection needs Windows.');
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = this.spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Mta', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'windows-ai-access.ps1')],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child; this.decoder = new StringDecoder('utf8'); this.buffer = ''; this.stderr = '';
    child.stdout.on('data', data => {
      if (this.child !== child) return;
      this.buffer += this.decoder.write(data);
      if (this.buffer.length > 2000000) { this.fail(new Error('Windows returned too much window information.'), child); return; }
      let end;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end).replace(/^\uFEFF/, '').trim(); this.buffer = this.buffer.slice(end + 1);
        if (!line) continue;
        try {
          const value = JSON.parse(line);
          if (this.pending?.id === value.id) {
            const pending = this.pending; this.pending = null; clearTimeout(pending.timer); pending.resolve(value.result);
          }
        } catch { this.fail(new Error('Windows returned unreadable information.'), child); return; }
      }
    });
    child.stderr.on('data', data => { if (this.child === child) this.stderr = (this.stderr + data.toString()).slice(-1200); });
    child.on('error', () => this.fail(new Error('The Windows connection could not start. Check that PowerShell is available.'), child));
    child.on('exit', () => {
      if (this.child === child && this.stderr) console.warn('[Kopi Island monitor] Windows-startfout:', this.stderr);
      this.fail(new Error('The Windows connection stopped. See [Kopi Island monitor] in the terminal for the cause.'), child);
    });
    child.stdin.on('error', () => this.fail(new Error('The Windows connection was interrupted.'), child));
  }
  async perform(method, args) {
    this.start(); const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const child = this.child;
      const timer = setTimeout(() => this.fail(new Error(method === 'reply'
        ? 'Sending not confirmed. Check the chat before you send again.'
        : 'The window is not responding to Windows. Open the chat and try again.'), child), 16000);
      this.pending = { id, resolve, reject, timer };
      child.stdin.write(JSON.stringify({ id, method, ...args }) + '\n', error => { if (error) this.fail(error, child); });
    });
  }
  fail(error, child) {
    if (child !== this.child) return;
    this.child = null;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
    try { child.kill(); } catch {}
  }
  close() { this.closed = true; if (this.child) this.fail(new Error('Kopi Island is closing.'), this.child); }
}

// Bring the terminal (or VS Code) that runs Claude Code to the front: walk up from a process that
// belongs to Claude Code to the first parent that has a window.
function focusWindowOf(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || process.platform !== 'win32') return Promise.resolve(false);
  // Windows blocks background apps from stealing focus. A quick Alt tap unlocks that; if it still
  // fails, minimise + restore the window (that always activates it). Success = it is really in front.
  const script = `
Add-Type -Namespace KopiIsland -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c); [DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h); [DllImport("user32.dll")] public static extern bool BringWindowToTop(System.IntPtr h); [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, System.UIntPtr e);'
function Front($h) { return [KopiIsland.Win]::GetForegroundWindow() -eq $h }
$p = ${pid}
for ($i = 0; $i -lt 12 -and $p; $i++) {
  $gp = Get-Process -Id $p -ErrorAction SilentlyContinue
  if ($gp -and $gp.MainWindowHandle -ne 0) {
    $h = $gp.MainWindowHandle
    if ([KopiIsland.Win]::IsIconic($h)) { [void][KopiIsland.Win]::ShowWindow($h, 9) }
    [KopiIsland.Win]::keybd_event(0x12, 0, 0, [System.UIntPtr]::Zero); [KopiIsland.Win]::keybd_event(0x12, 0, 2, [System.UIntPtr]::Zero)
    [void][KopiIsland.Win]::SetForegroundWindow($h); [void][KopiIsland.Win]::BringWindowToTop($h)
    Start-Sleep -Milliseconds 120
    if (-not (Front $h)) {
      [void][KopiIsland.Win]::ShowWindow($h, 6); Start-Sleep -Milliseconds 60; [void][KopiIsland.Win]::ShowWindow($h, 9)
      [void][KopiIsland.Win]::SetForegroundWindow($h); Start-Sleep -Milliseconds 120
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
  const { app, BrowserWindow, ipcMain, shell, Notification } = electron;
  const worker = options.worker || new NativeWorker();
  const sessions = new Map(), notifications = new Set(), answering = new Set();
  // ChatGPT and Claude (the chat apps / websites) come later, with the Kopi Island extension for Chrome.
  // Until then only Claude Code and Codex are followed; the window-reading code stays for that moment.
  const chatSoon = options.chatSoon ?? !options.worker;
  const liveNotifications = new Set();
  let found = new Map(), interval = null, polling = false, scanPromise = null, closing = false;
  const settingsPath = () => path.join(app.getPath('userData'), 'ai-monitor-windows.json');
  const trusted = event => {
    try {
      const actual = path.resolve(fileURLToPath(event.sender.getURL())), expected = path.join(__dirname, 'mascot.html');
      return process.platform === 'win32' ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
    } catch { return false; }
  };
  // Claude Code reports its own status through hooks (tests pass no hub).
  const hub = options.hub !== undefined ? options.hub : options.worker ? null : createHub({
    userData: app.getPath('userData'), onChange: () => emit(), onFinish: session => notifyHook(session), resolvePid: windowPidOf });
  const view = () => ({ ok: true, available: process.platform === 'win32' || Boolean(options.worker),
    providers: [...Object.keys(PROVIDERS).map(provider => (!chatSoon && sessions.get(provider)?.public()) ||
      { provider, name: PROVIDERS[provider].name, state: 'disconnected', connected: false, soon: chatSoon, detail: chatSoon ? 'Coming soon' : 'Connect your conversation', question: '', elapsed: 0, canReply: false }),
    ...(hub ? [hub.view('claude'), hub.view('codex')] : [])],
    // the last jobs of Claude Code and Codex, so a quiet page still shows what they did for you
    history: (hub?.history?.() || []).slice(0, 12).map(h => ({ at: h.at, agent: h.agent, project: h.project, prompt: String(h.prompt || '').slice(0, 300), result: h.result, files: h.files, seconds: h.seconds })) });
  const emit = () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && trusted({ sender: win.webContents })) win.webContents.send('ai-monitor:state', view());
    }
  };
  function save() {
    try {
      const entries = [...sessions.values()].map(s => ({ provider: s.provider, target: s.target, contextKey: s.contextKey }));
      const file = settingsPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(entries), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
    } catch { /* Monitoring remains usable if preferences cannot be saved. */ }
  }
  function bring(provider) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || !trusted({ sender: win.webContents })) continue;
      win.show(); win.focus(); win.webContents.send('ai-monitor:open', { provider });
    }
  }
  function notify(session) {
    if (!session.notification) return;
    const key = session.provider + ':' + session.contextKey + ':' + session.completions;
    if (notifications.has(key)) return;
    notifications.add(key); if (notifications.size > 150) notifications.delete(notifications.values().next().value);
    if (!Notification?.isSupported()) return;
    const question = session.notification === 'question';
    const notification = new Notification({ title: PROVIDERS[session.provider].name + (question ? ' has a question' : ' is done'),
      body: question ? 'Click the island to read the question and answer.' : 'The answer is ready. Click to see the status.', silent: false });
    liveNotifications.add(notification);
    notification.on('close', () => liveNotifications.delete(notification));
    notification.on('failed', () => liveNotifications.delete(notification));
    notification.on('click', () => { bring(session.provider); liveNotifications.delete(notification); });
    notification.show();
  }
  let notifyEnabled = true; // Settings → Windows notifications
  function notifyHook(session) {
    if (!notifyEnabled || !Notification?.isSupported()) return;
    const titles = { question: session.permission ? 'Claude Code needs permission' : 'Claude Code has a question', done: 'Claude Code is done', error: 'Claude Code: error' };
    if (!titles[session.state]) return;
    const notification = new Notification({ title: titles[session.state], body: (session.project ? session.project + ': ' : '') + (session.question || session.detail).slice(0, 180), silent: false });
    liveNotifications.add(notification);
    notification.on('close', () => liveNotifications.delete(notification));
    notification.on('click', () => { bring('claudecode'); liveNotifications.delete(notification); });
    notification.show();
  }
  async function poll() {
    if (polling || closing) return;
    polling = true;
    try {
      for (const [provider, session] of sessions) {
        if (answering.has(provider)) continue;
        try {
          const result = await worker.request('read', { target: session.target });
          if (sessions.get(provider) !== session || answering.has(provider)) continue;
          const oldContext = session.contextKey;
          session.accept(observe(result, provider)); if (oldContext !== session.contextKey) save(); notify(session);
        } catch (error) {
          if (sessions.get(provider) === session) session.accept({ valid: false, detail: error.message });
        }
        emit();
      }
    } finally { polling = false; }
  }
  async function scan() {
    if (scanPromise) return scanPromise;
    scanPromise = (async () => {
      const result = await worker.request('windows');
      if (!result?.ok) return result;
      found = new Map((result.windows || []).filter(t => typeof t.id === 'string' && Number.isSafeInteger(t.pid) && typeof t.started === 'string').map(t => [t.id, t]));
      return { ok: true, windows: [...found.values()].map(t => ({ id: t.id, title: t.title, process: t.process })) };
    })();
    try { return await scanPromise; } finally { scanPromise = null; }
  }
  // ---- Claude and ChatGPT without choosing a window: Kopi Island finds the conversation by itself ----
  // Turned on per AI in Kopi Island → Connections. Every few seconds, while it is on and not connected,
  // the open windows are checked and the first one that really shows that conversation is followed.
  const autoPath = () => path.join(app.getPath('userData'), 'ai-monitor-auto.json');
  let auto = { claude: false, chatgpt: false }, autoBusy = false;
  try { auto = { ...auto, ...JSON.parse(fs.readFileSync(autoPath(), 'utf8')) }; } catch {}
  const saveAuto = () => { try { fs.writeFileSync(autoPath(), JSON.stringify(auto)); } catch {} };
  // A browser shows the chat's own title (not "ChatGPT"), so every browser and chat-app window is checked;
  // what the window really shows (chatgpt.com or claude.ai) decides. Windows that are something else are
  // skipped for a minute, so this stays light.
  const notChat = new Map(); // window id → until
  async function autoConnect(provider) {
    const list = await scan(); if (!list?.ok) return false;
    const now = Date.now(), isApp = new RegExp('^' + provider + '$', 'i');
    const candidates = [...found.values()].filter(t => (notChat.get(t.id) || 0) < now)
      .sort((a, b) => Number(isApp.test(String(b.process))) - Number(isApp.test(String(a.process))));
    for (const t of candidates.slice(0, 8)) {
      try {
        const snapshot = await worker.request('read', { target: t });
        if (snapshot?.provider !== provider) { if (!snapshot?.provider) notChat.set(t.id, now + 60000); continue; }
        const obs = observe(snapshot, provider);
        if (!obs.valid) continue;
        const session = new Session(provider, t); session.accept(obs); sessions.set(provider, session); save(); emit();
        return true;
      } catch {}
    }
    return false;
  }
  async function autoTick() {
    if (autoBusy || closing) return; autoBusy = true;
    try {
      for (const provider of Object.keys(auto)) {
        const session = sessions.get(provider), lost = session && session.public?.().state === 'unavailable';
        if (auto[provider] && (!session || lost)) await autoConnect(provider);
      }
    } catch {} finally { autoBusy = false; }
  }

  function providerOf(payload) {
    if (!payload || !Object.hasOwn(PROVIDERS, payload.provider)) throw new Error('Choose ChatGPT or Claude.');
    return payload.provider;
  }
  const handlers = {
    'ai-monitor:get': async () => view(),
    'ai-monitor:windows': scan,
    'ai-monitor:connect': async payload => {
      if (chatSoon) throw new Error('ChatGPT and Claude are coming soon.');
      const provider = providerOf(payload), target = found.get(payload.targetId);
      if (!target) throw new Error('Refresh the window list and choose a window.');
      if (answering.has(provider)) throw new Error('Wait until sending has been checked.');
      const result = await worker.request('read', { target }), obs = observe(result, provider);
      if (!obs.valid) return { ok: false, error: obs.detail, login: obs.login };
      const session = new Session(provider, target); session.accept(obs); sessions.set(provider, session); notifications.clear(); save(); emit();
      return view();
    },
    // agent: 'claude' (Claude Code) or 'codex'
    'ai-monitor:hooks-install': async payload => { if (!hub) throw new Error('Not available.'); if (payload?.agent === 'codex') hub.installCodex(); else hub.install(); return view(); },
    'ai-monitor:hooks-uninstall': async payload => { if (!hub) throw new Error('Not available.'); if (payload?.agent === 'codex') hub.uninstallCodex(); else hub.uninstall(); return view(); },
    'ai-monitor:hooks-answer': async payload => {
      if (!hub) throw new Error('Not available.');
      hub.answerQuestions(String(payload?.sessionId || ''), payload?.answers || {}); return view();
    },
    'ai-monitor:hooks-plan': async payload => {
      if (!hub) throw new Error('Not available.');
      hub.decidePlan(String(payload?.sessionId || ''), Boolean(payload?.approve), payload?.feedback); return view();
    },
    'ai-monitor:hooks-jump': async payload => {
      const pid = hub?.pidOf(String(payload?.sessionId || ''));
      if (!pid) throw new Error('Kopi Island doesn’t know yet which window belongs to this session. He learns it after Claude’s first answer.');
      const focused = await focusWindowOf(pid);
      if (focused === 'blocked') throw new Error('Windows didn’t let Kopi Island bring the window to the front. Click the terminal in your taskbar.');
      if (focused !== true) { hub?.forgetWindow?.(String(payload?.sessionId || '')); throw new Error('The terminal window was not found. Is it still open?'); }
      return view();
    },
    'ai-monitor:set-notify':async payload => { notifyEnabled = Boolean(payload?.enabled); return view(); },
    // Test mode (Settings → General → Testing): fake Claude Code events, so you can see every state.
    'ai-monitor:hooks-test': async payload => {
      if (!hub) throw new Error('Not available.');
      const id = 'kopi-test', base = { session_id: id, cwd: 'C:\\Test\\webshop' };
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
        'demo-perm': () => { const res = { writeHead() { return this; }, end() {}, on() {} }; hub.apply({ ...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: String(payload?.command || 'npm install stripe').slice(0, 200) } }, res); }, // command: pick what the demo asks
        // a multiple-choice question and a plan to approve, answered from the island (videos / testing)
        'demo-ask': () => { const res = { writeHead() { return this; }, end() {}, on() {} }; hub.apply({ ...base, hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Which colour should the button be?', header: 'Colour',
          multiSelect: false, options: [{ label: 'Blue', description: 'Calm, matches the logo' }, { label: 'Green', description: 'Stands out more' }, { label: 'Orange', description: 'Warm and friendly' }] }] } }, res); },
        'demo-plan': () => { const res = { writeHead() { return this; }, end() {}, on() {} }; hub.apply({ ...base, hook_event_name: 'PermissionRequest', tool_name: 'ExitPlanMode', tool_input: { plan: String(payload?.command || '## Dark mode\n1. Add a theme switch to the header\n2. Save the choice in localStorage\n3. Use CSS variables for every colour\n4. Test both themes').slice(0, 4000) } }, res); }
      };
      if (!scenes[payload?.kind]) throw new Error('Unknown test.');
      scenes[payload.kind](); return view();
    },
    'ai-monitor:hooks-model': async payload => { if (!hub) throw new Error('Not available.'); hub.setModel(String(payload?.model || '')); return view(); },
    'ai-monitor:hooks-reply':async payload => {
      if (!hub) throw new Error('Not available.');
      hub.reply(String(payload?.sessionId || ''), payload?.text); return view();
    },
    'ai-monitor:hooks-seen':async () => { if (!hub) throw new Error('Not available.'); hub.seen(); return view(); },
    'ai-monitor:hooks-decide': async payload => {
      if (!hub) throw new Error('Not available.');
      hub.decide(String(payload?.sessionId || ''), payload?.behavior); return view();
    },
    'ai-monitor:auto-get': async () => ({ ok: true, auto: chatSoon ? { claude: false, chatgpt: false } : { ...auto } }),
    'ai-monitor:auto-set': async payload => {
      if (chatSoon) return { ...view(), auto: { claude: false, chatgpt: false }, found: false, soon: true };
      const provider = providerOf(payload); auto[provider] = Boolean(payload.on); saveAuto();
      if (!auto[provider] && !answering.has(provider)) { sessions.delete(provider); notifications.clear(); save(); emit(); }
      const connected = auto[provider] ? await autoConnect(provider) : false;
      return { ...view(), auto: { ...auto }, found: connected };
    },
    'ai-monitor:disconnect': async payload => {
      const provider = providerOf(payload);
      if (answering.has(provider)) throw new Error('Wait until sending has been checked.');
      sessions.delete(provider); notifications.clear(); save(); emit(); return view();
    },
    'ai-monitor:open-source': async payload => {
      const provider = providerOf(payload), session = sessions.get(provider);
      if (session) return worker.request('open', { target: session.target });
      await shell.openExternal(PROVIDERS[provider].url); return { ok: true };
    },
    'ai-monitor:reply': async payload => {
      const provider = providerOf(payload), session = sessions.get(provider);
      if (answering.has(provider)) throw new Error('Your answer is already being checked.');
      if (!session || session.state !== 'question' || !session.questionId || session.questionId !== payload.questionId)
        throw new Error('This question is no longer active. Check the current status.');
      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!text || text.length > 5000) throw new Error('Type an answer of at most 5000 characters.');
      answering.add(provider);
      try {
        const fresh = await worker.request('read', { target: session.target });
        const obs = observe(fresh, provider);
        if (!obs.valid || obs.stop || !obs.completed || !obs.question || !obs.composer ||
            obs.contextKey !== session.contextKey || obs.assistant?.fingerprint !== payload.questionId)
          throw new Error('The chat or the question changed. Nothing was sent.');
        session.state = 'sending'; session.detail = 'Sending answer'; emit();
        const result = await worker.request('reply', { target: session.target, contextKey: session.contextKey,
          composerId: obs.composer.id, guards: obs.assistant.guards,
          timeline: fresh.nodes.filter(n => n.type === 'Text' && n.index < obs.composer.index).map(n => ({ id: n.id, name: n.name })), text });
        if (!result?.ok) throw new Error(result?.error || 'The answer could not be sent.');
        // Do not retry an uncertain send: a user could otherwise receive duplicate prompts.
        const until = Date.now() + 12000;
        while (Date.now() < until) {
          const confirmation = observe(await worker.request('read', { target: session.target }), provider);
          if (confirmation.valid && confirmation.contextKey === session.contextKey && confirmation.stop) {
            session.accept(confirmation); emit(); return { ok: true, confirmed: true };
          }
          await new Promise(resolve => setTimeout(resolve, 700));
        }
        throw new Error('Sending not confirmed. Check the chat before you send again.');
      } catch (error) {
        session.state = 'error'; session.detail = error.message; session.run = null; emit();
        return { ok: false, error: error.message, uncertain: true };
      } finally { answering.delete(provider); }
    }
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, async (event, payload) => {
    if (!trusted(event)) return { ok: false, error: 'This window has no access to the AI monitor.' };
    try { return await handler(payload); } catch (error) { return { ok: false, error: error.message }; }
  });
  app.whenReady().then(() => {
    if (!chatSoon) try {
      const entries = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
      for (const entry of entries) {
        if (!Object.hasOwn(PROVIDERS, entry.provider) || !entry.target?.id || !entry.target.started) continue;
        const session = new Session(entry.provider, entry.target); session.contextKey = entry.contextKey || null; sessions.set(entry.provider, session);
      }
    } catch {}
    interval = setInterval(poll, 2600); interval.unref?.(); if (sessions.size) poll();
    if (!chatSoon) { const autoTimer = setInterval(autoTick, 8000); autoTimer.unref?.(); setTimeout(autoTick, 4000); }
    hub?.start();
    // Keep the Claude Code clock ticking while it works.
    if (hub) { const tick = setInterval(() => { if (hub.view('claude').state === 'running' || hub.view('codex').state === 'running') emit(); }, 1000); tick.unref?.(); }
  });
  app.on('before-quit', () => { closing = true; clearInterval(interval); worker.close(); hub?.stop(); liveNotifications.clear(); });
  // The Kopi Island app (settings-app-main.cjs) reads the connections and the history from here.
  app.kopiMonitor = { view, handlers, history: () => hub?.history() || [], projects: () => hub?.projects?.() || [] };
  return { view, handlers, poll, close: () => { closing = true; clearInterval(interval); worker.close(); } };
}
if (process.versions.electron) setup(require('electron'));
module.exports = { NativeWorker, setup };
