'use strict';
// Claude Code and Codex hooks → Rehatt's nudges: Kopi tells you when your AI has a question or is done.
// Claude Code posts each hook event to a small server on 127.0.0.1. Codex runs a tiny command (curl, part of
// Windows) that posts the same events there, tagged agent=codex. No browser or window reading needed.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { questionFrom } = require('./question.cjs');

const PORT = 47861;
const ROUTE = '/rehatt-hook';
const STATUS_ROUTE = '/rehatt-status';
const STATUS_SCRIPT = path.join(__dirname, 'rehatt-statusline.cjs');
const VERSION = 1; // Bump when the installed hook config changes; older installs are upgraded on start.
const HOOK_URL = 'http://127.0.0.1:' + PORT + ROUTE + '?v=' + VERSION;
// Nudges only: every hook answers at once, so Claude Code never waits for Rehatt.
const EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Notification', 'Stop', 'StopFailure', 'SessionEnd'];
const QUESTION_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);
// Rehatt replaces Kopi Island and Teh Tarik Meter: their Claude Code hooks and status line are taken over, not doubled.
const FAMILY_HOOK = /127\.0\.0\.1:47851\/kopi-hook/;
const FAMILY_COMMAND = /kopi-reply|kopi-statusline|teh-tarik-statusline/;
const RANK = { question: 4, error: 3, running: 2, done: 1, ready: 0 };
// The two coding agents Rehatt follows. Codex reads its hooks from ~/.codex/hooks.json (the same shape as Claude Code).
const AGENTS = { claude: { id: 'claudecode', name: 'Claude Code', short: 'Claude' }, codex: { id: 'codex', name: 'Codex', short: 'Codex' } };
const CODEX_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SessionEnd'];

function createHub(options = {}) {
  const userData = options.userData;
  const settingsFile = options.settingsFile || path.join(os.homedir(), '.claude', 'settings.json');
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const codexFile = path.join(codexHome, 'hooks.json');
  const onChange = options.onChange || (() => {});
  const onFinish = options.onFinish || (() => {});
  // The pid a hook sends is a short-lived helper shell. Right away (while it still exists) we look up the
  // window that really runs Claude Code (Windows Terminal, VS Code, ...) and remember that one.
  const resolvePid = options.resolvePid || (pid => Promise.resolve(pid));
  function learnPid(s, pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0 || s.windowPid || s.resolving === pid) return;
    s.pid ||= pid; s.resolving = pid;
    resolvePid(pid).then(win => { if (win) { s.windowPid = win; s.pid = win; onChange(); } }).catch(() => {}).finally(() => { if (s.resolving === pid) s.resolving = null; });
  }
  const sessions = new Map();
  let server = null, listening = false, serverError = '', hooksCache = false, checkedAt = 0;
  let usage = { fiveHour: null, sevenDay: null, at: 0 };
  const changed = () => { checkedAt = 0; onChange(); };
  // What your AI did, for the home page of the Rehatt app: the last 40 finished turns (kept on this PC only).
  const historyFile = userData ? path.join(userData, 'rehatt-history.json') : null;
  let history = [];
  try { history = JSON.parse(fs.readFileSync(historyFile, 'utf8')); if (!Array.isArray(history)) history = []; } catch {}
  function remember(s, result) {
    if (!historyFile || !s.prompt) return;
    history.unshift({ at: Date.now(), agent: s.agent || 'claude', name: (AGENTS[s.agent] || AGENTS.claude).name, project: s.project || '', cwd: s.cwd || '', prompt: s.prompt,
      result, files: (s.files || []).length, seconds: s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0 });
    history = history.slice(0, 40);
    try { fs.writeFileSync(historyFile + '.tmp', JSON.stringify(history)); fs.renameSync(historyFile + '.tmp', historyFile); } catch {}
  }

  function token() {
    const file = path.join(userData, 'rehatt-hook-token');
    try { const saved = fs.readFileSync(file, 'utf8').trim(); if (/^[a-f0-9]{48}$/.test(saved)) return saved; } catch {}
    const fresh = randomBytes(24).toString('hex');
    fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(file, fresh, { mode: 0o600 });
    return fresh;
  }

  // Claude Code runs our small status line script. Its Windows installer no longer
  // brings Node.js, and "node: command not found" after every answer breaks the chat. So without Node on
  // this PC the script runs on Rehatt's own runtime: the app's exe in Node mode.
  const run = options.runner || (() => {
    const exe = process.platform === 'win32' ? 'node.exe' : 'node';
    const hasNode = String(process.env.PATH || '').split(path.delimiter)
      .some(dir => { try { return Boolean(dir) && fs.statSync(path.join(dir, exe)).isFile(); } catch { return false; } });
    return hasNode || !process.versions.electron ? 'node' : `ELECTRON_RUN_AS_NODE=1 "${process.execPath.replace(/\\/g, '/')}"`;
  })();

  // ---- settings.json ----
  const isMine = hook => typeof hook?.url === 'string' && hook.url.startsWith('http://127.0.0.1:' + PORT + ROUTE);
  // ours to remove: Rehatt's hooks, plus the old Kopi Island ones it replaces
  const isOurs = hook => isMine(hook) || (typeof hook?.url === 'string' && FAMILY_HOOK.test(hook.url)) ||
    (hook?.type === 'command' && typeof hook.command === 'string' && FAMILY_COMMAND.test(hook.command));
  function readSettings() {
    try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('~/.claude/settings.json is not valid JSON. Nothing was changed.'); }
  }
  function ours() {
    try {
      const hooks = readSettings().hooks || {};
      return EVENTS.flatMap(event => (hooks[event] || []).flatMap(group => (group.hooks || []).filter(isOurs)));
    } catch { return []; }
  }
  // Our status line forwards your 5-hour / weekly usage (the teh tarik glass). A status line you made yourself is
  // never replaced; the ones from Kopi Island and Teh Tarik Meter are, since Rehatt does their job now.
  const isOurStatus = line => typeof line?.command === 'string' && line.command.includes('rehatt-statusline');
  const isFamilyStatus = line => typeof line?.command === 'string' && /kopi-statusline|teh-tarik-statusline/.test(line.command);
  const statusCommand = () => `${run} "${STATUS_SCRIPT}" ${token()}`;
  function statusOk() {
    try {
      const line = readSettings().statusLine;
      if (isOurStatus(line)) return line.command === statusCommand();
      return Boolean(line) && !isFamilyStatus(line);
    } catch { return false; }
  }
  // Is your own status line in the way? Then the glass only fills from Claude Code's answers, not live.
  const statusTaken = () => { try { const line = readSettings().statusLine; return Boolean(line) && !isOurStatus(line) && !isFamilyStatus(line); } catch { return false; } };
  const installed = () => {
    const list = ours();
    return list.length === EVENTS.length && list.every(h => h.url === HOOK_URL) && statusOk();
  };
  function writeSettings(settings) {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    if (fs.existsSync(settingsFile)) fs.copyFileSync(settingsFile, settingsFile + '.rehatt-backup');
    fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings, null, 2) + '\n');
    fs.renameSync(settingsFile + '.tmp', settingsFile);
  }
  function strip(settings) {
    for (const event of Object.keys(settings.hooks || {})) {
      const groups = (settings.hooks[event] || [])
        .map(group => ({ ...group, hooks: (group.hooks || []).filter(hook => !isOurs(hook)) }))
        .filter(group => group.hooks.length);
      if (groups.length) settings.hooks[event] = groups; else delete settings.hooks[event];
    }
    if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  }
  function install() {
    const settings = readSettings(); strip(settings); settings.hooks ||= {};
    for (const event of EVENTS) {
      const hook = { type: 'http', url: HOOK_URL, timeout: 2, headers: { 'X-Rehatt-Token': token() } };
      (settings.hooks[event] ||= []).push({ hooks: [hook] });
    }
    if (!settings.statusLine || isOurStatus(settings.statusLine) || isFamilyStatus(settings.statusLine)) settings.statusLine = { type: 'command', command: statusCommand(), padding: 0 };
    writeSettings(settings); changed(); return { ok: true };
  }
  function uninstall() {
    const settings = readSettings();
    if (ours().length || isOurStatus(settings.statusLine)) {
      strip(settings); if (isOurStatus(settings.statusLine)) delete settings.statusLine; writeSettings(settings);
    }
    sessions.clear(); changed(); return { ok: true };
  }

  // ---- Codex: ~/.codex/hooks.json ----
  // Codex runs a command for each event; curl.exe (in every Windows 10/11) passes the event on to Rehatt.
  // Codex asks you once to trust new hooks: that is Codex keeping you safe.
  const codexCommand = () => `curl.exe -s -m 3 -H "X-Rehatt-Token: ${token()}" -H "Content-Type: application/json" --data-binary @- "${HOOK_URL}&agent=codex"`;
  const isOurCodexHook = hook => hook?.type === 'command' && typeof hook.command === 'string' && (hook.command.includes('127.0.0.1:' + PORT + ROUTE) || FAMILY_HOOK.test(hook.command));
  const codexAvailable = () => fs.existsSync(codexHome);
  function readCodex() {
    try { return JSON.parse(fs.readFileSync(codexFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('~/.codex/hooks.json is not valid JSON. Nothing was changed.'); }
  }
  function writeCodex(config) {
    fs.mkdirSync(codexHome, { recursive: true });
    if (fs.existsSync(codexFile)) fs.copyFileSync(codexFile, codexFile + '.rehatt-backup');
    fs.writeFileSync(codexFile + '.tmp', JSON.stringify(config, null, 2) + '\n');
    fs.renameSync(codexFile + '.tmp', codexFile);
  }
  function stripCodex(config) {
    for (const event of Object.keys(config.hooks || {})) {
      const groups = (config.hooks[event] || []).map(group => ({ ...group, hooks: (group.hooks || []).filter(hook => !isOurCodexHook(hook)) })).filter(group => group.hooks.length);
      if (groups.length) config.hooks[event] = groups; else delete config.hooks[event];
    }
    if (config.hooks && !Object.keys(config.hooks).length) delete config.hooks;
  }
  function codexInstalled() {
    try {
      const hooks = readCodex().hooks || {}, cmd = codexCommand();
      return CODEX_EVENTS.every(event => (hooks[event] || []).some(group => (group.hooks || []).some(h => isOurCodexHook(h) && h.command === cmd)));
    } catch { return false; }
  }
  function installCodex() {
    const config = readCodex(); stripCodex(config); config.hooks ||= {};
    for (const event of CODEX_EVENTS) (config.hooks[event] ||= []).push({ hooks: [{ type: 'command', command: codexCommand(), timeout: 5, async: true, statusMessage: 'Rehatt' }] });
    writeCodex(config); changed(); return { ok: true };
  }
  function uninstallCodex() {
    const config = readCodex(); stripCodex(config); writeCodex(config);
    for (const [id, s] of sessions) if (s.agent === 'codex') sessions.delete(id);
    changed(); return { ok: true };
  }

  // From the status line: plan usage is account-wide, context is per session.
  function applyUsage(data) {
    const window = w => (w && Number.isFinite(w.used) ? { used: Math.max(0, Math.min(100, w.used)), resetsAt: Number(w.resets_at) || null } : null);
    usage = { fiveHour: window(data.five_hour) || usage.fiveHour, sevenDay: window(data.seven_day) || usage.sevenDay, at: Date.now() };
    const s = sessions.get(String(data.session_id || ''));
    if (s && Number.isFinite(data.context)) s.context = data.context;
    if (s) learnPid(s, data.pid);
    if (s && typeof data.model === 'string' && data.model) s.modelName = data.model.slice(0, 40); // the model this session really uses
    onChange();
  }

  // You looked at it: green, red and questions go back to quiet.
  function seen() {
    for (const s of sessions.values()) {
      if (['done', 'error', 'question'].includes(s.state)) {
        s.state = 'ready'; s.detail = 'Seen'; s.question = ''; s.permission = null;
      }
    }
    onChange(); return { ok: true };
  }

  // ---- events ----
  function apply(event, agent = 'claude') {
    const id = typeof event.session_id === 'string' ? event.session_id : '';
    const name = event.hook_event_name;
    if (!id || !(agent === 'codex' ? CODEX_EVENTS : EVENTS).includes(name)) return false;
    const who = AGENTS[agent] || AGENTS.claude;
    if (name === 'SessionEnd') { sessions.delete(id); onChange(); return false; }
    const now = Date.now();
    const s = sessions.get(id) || { id, agent, state: 'ready', detail: '', question: '', permission: null, startedAt: null, endedAt: null, updatedAt: now };
    s.agent = agent;
    if (typeof event.cwd === 'string') { s.project = path.basename(event.cwd); s.cwd = event.cwd; }
    s.updatedAt = now;
    const start = () => { if (!s.startedAt || s.endedAt) s.startedAt = now; s.endedAt = null; };
    switch (name) {
      case 'SessionStart':
        s.state = 'ready'; s.detail = 'Ready for your question'; break;
      case 'UserPromptSubmit':
        s.startedAt = now; s.endedAt = null; s.state = 'running'; s.detail = who.short + ' is working'; s.question = ''; s.permission = null;
        s.stats = {}; s.steps = []; s.files = []; s.commands = []; s.code = null; s.run = null;
        s.prompt = String(event.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 240); s.lastMessage = ''; break;
      case 'PreToolUse':
        start();
        // Claude asks you something in the terminal (multiple choice, or a plan to approve): nudge.
        if (['AskUserQuestion', 'ExitPlanMode'].includes(event.tool_name)) {
          const questions = Array.isArray(event.tool_input?.questions) ? event.tool_input.questions.map(q => String(q?.question || '')).filter(Boolean) : [];
          s.state = 'question'; s.permission = null;
          s.detail = event.tool_name === 'ExitPlanMode' ? 'Plan ready: approve it in the terminal' : 'Asks you something';
          s.question = questions.length ? questions.join('\n') : event.tool_name === 'ExitPlanMode' ? who.short + ' made a plan.' : who.short + ' asks you something.';
          onFinish(s); break;
        }
        // Step list for the Claude page: what Claude is doing, one line per tool call.
        {
          s.steps ||= []; s.steps.push({ tool: String(event.tool_name || ''), kind: toolKind(event.tool_name) || 'other', label: toolLabel(event), what: toolDetail(event).slice(0, 120), state: 'running' });
          if (s.steps.length > 12) s.steps.shift();
          // For the summary: which files were changed and which commands were run.
          const file = event.tool_input?.file_path ? path.basename(String(event.tool_input.file_path)) : '';
          s.files ||= []; s.commands ||= [];
          if (toolKind(event.tool_name) === 'edit' && file && !s.files.includes(file)) s.files.push(file);
          if (toolKind(event.tool_name) === 'run' && event.tool_input?.command) s.commands.push(String(event.tool_input.command).slice(0, 80));
          // The code Claude is changing right now (shown as a small red/green diff in the island).
          const input = event.tool_input || {}, edit = Array.isArray(input.edits) ? input.edits[0] || {} : input;
          const cut = text => String(text || '').split('\n').map(l => l.replace(/\t/g, '  ').slice(0, 90)).filter((l, i, all) => l.trim() || (i > 0 && i < all.length - 1));
          if (toolKind(event.tool_name) === 'edit' && file) {
            const removed = cut(edit.old_string).slice(0, 3).map(text => ({ t: '-', text })), added = cut(edit.new_string ?? edit.content ?? input.content).slice(0, removed.length ? 3 : 6).map(text => ({ t: '+', text }));
            s.code = { file, lines: [...removed, ...added] };
          }
          if (toolKind(event.tool_name) === 'run' && input.command) s.run = { command: String(input.command).slice(0, 80), out: [] };
        }
        s.state = 'running'; s.detail = toolLabel(event, who.short); s.question = ''; s.permission = null; break;
      case 'PostToolUse': case 'PostToolUseFailure': {
        start(); s.state = 'running'; s.question = ''; s.permission = null;
        const kind = toolKind(event.tool_name); if (kind) { s.stats ||= {}; s.stats[kind] = (s.stats[kind] || 0) + 1; }
        const step = (s.steps || []).find(x => x.state === 'running' && x.tool === String(event.tool_name || '')) || (s.steps || []).find(x => x.state === 'running');
        if (step) step.state = name === 'PostToolUseFailure' ? 'failed' : 'done';
        // What the terminal said (last lines), for the island.
        if (kind === 'run' && s.run) { const r = event.tool_response || {}, text = typeof r === 'string' ? r : [r.stdout, r.stderr, r.output].filter(Boolean).join('\n'); s.run.out = String(text).split('\n').map(l => l.trimEnd().slice(0, 90)).filter(Boolean).slice(-3); s.run.failed = name === 'PostToolUseFailure'; }
        break;
      }
      case 'PermissionRequest': // Codex only: you answer in Codex itself
        s.state = 'question'; s.detail = 'Needs permission: answer in Codex'; s.question = toolLabel(event, who.short) + (toolDetail(event) ? ':\n' + toolDetail(event) : '');
        onFinish(s); break;
      case 'Notification': {
        const kind = event.notification_type || '';
        if (QUESTION_NOTIFICATIONS.has(kind) && s.state !== 'question') {
          s.state = 'question'; s.detail = 'Waiting for you'; s.question = String(event.message || who.name + ' needs you.');
          onFinish(s);
        }
        break;
      }
      case 'Stop': {
        const question = questionFrom(String(event.last_assistant_message || ''));
        s.endedAt = now; s.state = question ? 'question' : 'done'; s.permission = null;
        for (const step of s.steps || []) if (step.state === 'running') step.state = 'done';
        s.lastMessage = tail(String(event.last_assistant_message || ''), 2000);
        s.detail = question ? 'Has a question for you' : 'Done'; s.question = question ? s.lastMessage : '';
        remember(s, question ? 'question' : 'done');
        onFinish(s); break;
      }
      case 'StopFailure':
        s.endedAt = now; s.state = 'error'; s.permission = null; s.question = '';
        s.detail = 'Error: ' + errorLabel(event.error_type || event.error); remember(s, 'error'); onFinish(s); break;
    }
    sessions.set(id, s); onChange();
    return true;
  }

  // ---- server ----
  function start() {
    if (server) return;
    if (ours().length && !installed()) { try { install(); } catch {} } // upgrade an older install (or take over Kopi Island's)
    const expected = Buffer.from(token());
    server = http.createServer((req, res) => {
      const given = Buffer.from(String(req.headers['x-rehatt-token'] || ''));
      const route = String(req.url).split('?')[0];
      if (req.method !== 'POST' || ![ROUTE, STATUS_ROUTE].includes(route) || given.length !== expected.length || !timingSafeEqual(given, expected)) {
        res.writeHead(403).end(); req.resume(); return;
      }
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (route === STATUS_ROUTE) applyUsage(data);
          else apply(data, /[?&]agent=codex(&|$)/.test(String(req.url)) ? 'codex' : 'claude');
        } catch {}
        res.writeHead(200).end(); // Empty body: Claude Code continues as normal.
      });
    });
    server.on('error', error => {
      listening = false; server = null;
      serverError = error.code === 'EADDRINUSE' ? 'Rehatt is already running somewhere else (port ' + PORT + ' is taken). Close the other Rehatt.' : error.message;
      onChange();
    });
    server.listen(PORT, '127.0.0.1', () => { listening = true; serverError = ''; onChange(); });
  }
  function stop() { try { server?.close(); } catch {} server = null; listening = false; }

  // One entry for the island: the session that needs you most first.
  let codexCache = false;
  function view(agent = 'claude') {
    const who = AGENTS[agent] || AGENTS.claude;
    const list = [...sessions.values()].filter(s => (s.agent || 'claude') === agent).sort((a, b) => (RANK[b.state] - RANK[a.state]) || (b.updatedAt - a.updatedAt));
    const now = Date.now(), top = list[0];
    if (now - checkedAt > 5000) { hooksCache = installed(); codexCache = codexInstalled(); checkedAt = now; } // the files are read at most every 5 s
    const hooks = agent === 'codex' ? codexCache : hooksCache;
    const base = { provider: who.id, name: who.name, agent, kind: 'hooks', hooksInstalled: hooks, available: agent === 'codex' ? codexAvailable() : true,
      modelNow: top?.modelName || '', statusTaken: agent === 'claude' && statusTaken(), error: serverError,
      usage: { fiveHour: live(usage.fiveHour, now), sevenDay: live(usage.sevenDay, now), context: top?.context ?? null } };
    if (!hooks || !listening) return { ...base, connected: false, state: 'disconnected', detail: hooks ? 'Not active' : 'Not connected', question: '', elapsed: 0, list: [] };
    const item = s => ({ id: s.id, project: s.project || who.name, state: s.state, detail: s.detail,
      elapsed: s.startedAt ? Math.floor(((s.endedAt || now) - s.startedAt) / 1000) : 0 });
    if (!top) return { ...base, connected: true, state: 'ready', detail: 'Waiting for ' + who.name, question: '', elapsed: 0, list: [] };
    return { ...base, connected: true, state: top.state, detail: top.detail, question: top.question, elapsed: item(top).elapsed,
      sessionId: top.id, lastMessage: top.lastMessage || '', stats: top.stats || {}, steps: (top.steps || []).slice(-8), prompt: top.prompt || '', files: (top.files || []).slice(-8), commands: (top.commands || []).slice(-3), code: top.code || null, run: top.run || null, canJump: Boolean(top.pid),
      source: { process: who.name, title: top.project }, list: list.slice(0, 4).map(item) };
  }
  const pidOf = sessionId => sessions.get(sessionId)?.pid || null;
  // The window was closed: learn it again from the next hook.
  const forgetWindow = sessionId => { const s = sessions.get(sessionId); if (s) { s.windowPid = null; s.pid = null; } };
  return { start, stop, install, uninstall, installed, installCodex, uninstallCodex, codexInstalled, codexAvailable, history: () => history.slice(), view, apply, applyUsage, usage: () => ({ fiveHour: live(usage.fiveHour, Date.now()), sevenDay: live(usage.sevenDay, Date.now()), at: usage.at }), seen, pidOf, forgetWindow, PORT };
}

// Groups for "what Claude did" (read 3 · edited 2 · ran 1 ...).
function toolKind(tool) {
  if (tool === 'Read') return 'read';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'edit';
  if (/^(Bash|PowerShell|shell|exec_command|local_shell|unified_exec)$/i.test(tool)) return 'run';
  if (/^apply_patch$/i.test(tool)) return 'edit';
  if (/^(Grep|Glob)$/.test(tool)) return 'search';
  if (/^(WebSearch|WebFetch)$/.test(tool)) return 'web';
  if (/^(Agent|Task)$/.test(tool)) return 'agent';
  return '';
}
function toolLabel(event, who = 'Claude') {
  const tool = String(event.tool_name || '');
  const file = event.tool_input?.file_path ? path.basename(String(event.tool_input.file_path)) : '';
  if (tool === 'Read') return 'Reading ' + (file || 'a file');
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'Editing ' + (file || 'a file');
  if (/^(Bash|PowerShell)$/.test(tool)) return 'Running a command';
  if (/^(Grep|Glob)$/.test(tool)) return 'Searching the code';
  if (/^(WebSearch|WebFetch)$/.test(tool)) return 'Searching the web';
  if (/^(Agent|Task)$/.test(tool)) return 'Starting a helper';
  if (/^(shell|exec_command|local_shell|unified_exec)$/i.test(tool)) return 'Running a command';  // Codex
  if (/^apply_patch$/i.test(tool)) return 'Editing files';
  return tool ? 'Using ' + tool : who + ' is working';
}
// What exactly the tool works on (a command, a file, a web address).
function toolDetail(event) {
  const input = event.tool_input || {};
  const text = input.command || input.file_path || input.url || input.query || input.pattern || '';
  return String(text).slice(0, 300);
}
// After its reset time a usage window starts again at 0%.
const live = (w, now) => (w && w.resetsAt && w.resetsAt * 1000 <= now ? { used: 0, resetsAt: null } : w);
// The end of a long message, starting at a whole line where possible.
function tail(text, max) {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(-max), line = cut.indexOf('\n');
  return '…' + (line > 0 && line < max / 2 ? cut.slice(line + 1) : cut);
}
function errorLabel(type) {
  const labels = { rate_limit: 'limit reached', overloaded: 'Claude is overloaded', authentication_failed: 'not logged in',
    billing_error: 'billing problem', server_error: 'server error', max_output_tokens: 'answer too long' };
  return labels[type] || String(type || 'unknown');
}

module.exports = { createHub, EVENTS, CODEX_EVENTS, PORT, HOOK_URL, STATUS_ROUTE };
