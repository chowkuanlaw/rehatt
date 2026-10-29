'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHub, EVENTS, PORT, HOOK_URL } = require('../agent-hooks.cjs');

function temp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehatt-hooks-'));
  return { dir, settingsFile: path.join(dir, 'claude', 'settings.json'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('install keeps existing settings and hooks, uninstall removes only ours', () => {
  const t = temp();
  try {
    fs.mkdirSync(path.dirname(t.settingsFile), { recursive: true });
    const own = { hooks: [{ type: 'command', command: 'echo mine' }] };
    fs.writeFileSync(t.settingsFile, JSON.stringify({ model: 'opus', hooks: { Stop: [own] } }));
    const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
    assert.equal(hub.installed(), false);
    hub.install(); hub.install(); // twice: no duplicates
    const after = JSON.parse(fs.readFileSync(t.settingsFile, 'utf8'));
    assert.equal(after.model, 'opus'); assert.deepEqual(after.hooks.Stop[0], own);
    for (const event of EVENTS) assert.equal(after.hooks[event].filter(g => g.hooks.some(h => h.url?.includes(':' + PORT))).length, 1);
    assert.equal(hub.installed(), true); assert.ok(fs.existsSync(t.settingsFile + '.rehatt-backup'));
    hub.uninstall();
    assert.deepEqual(JSON.parse(fs.readFileSync(t.settingsFile, 'utf8')), { model: 'opus', hooks: { Stop: [own] } });
  } finally { t.cleanup(); }
});

test('broken settings.json is never overwritten', () => {
  const t = temp();
  try {
    fs.mkdirSync(path.dirname(t.settingsFile), { recursive: true }); fs.writeFileSync(t.settingsFile, '{ broken');
    const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
    assert.throws(() => hub.install(), /not valid JSON/);
    assert.equal(fs.readFileSync(t.settingsFile, 'utf8'), '{ broken');
  } finally { t.cleanup(); }
});

test('hook events drive the nudges: busy, question, done, error', () => {
  const t = temp(), finished = [];
  try {
    const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile, onFinish: s => finished.push(s.state) });
    const send = (hook_event_name, extra = {}) => hub.apply({ session_id: 's1', cwd: 'C:\\code\\app', hook_event_name, ...extra });
    send('UserPromptSubmit'); assert.equal(hub.view().connected, false); // not installed, server not running
    send('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'C:\\code\\app\\main.js' } });
    send('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }); assert.deepEqual(finished, ['question']);
    send('PostToolUse');
    send('Stop', { last_assistant_message: 'Done. Should I run the tests too?' }); assert.equal(finished.at(-1), 'question');
    send('UserPromptSubmit'); send('Stop', { last_assistant_message: 'Everything is fixed.' }); assert.equal(finished.at(-1), 'done');
    send('UserPromptSubmit'); send('StopFailure', { error_type: 'rate_limit' }); assert.equal(finished.at(-1), 'error');
  } finally { t.cleanup(); }
});

test('a multiple-choice question or a plan in the terminal is a question nudge; nothing is answered for you', async () => {
  const t = temp();
  const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
  try {
    hub.install(); hub.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    const token = fs.readFileSync(path.join(t.dir, 'rehatt-hook-token'), 'utf8');
    const post = body => fetch(HOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rehatt-token': token }, body: JSON.stringify(body) });
    const asked = await post({ session_id: 'q', hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Which colour?' }] } });
    assert.equal(asked.status, 200); assert.equal(await asked.text(), ''); // Claude Code never waits for Rehatt
    assert.equal(hub.view().state, 'question'); assert.equal(hub.view().question, 'Which colour?');
    await post({ session_id: 'q', hook_event_name: 'PreToolUse', tool_name: 'ExitPlanMode', tool_input: { plan: '# Plan' } });
    assert.match(hub.view().detail, /Plan ready/);
    for (const tool of ['Read', 'Read', 'Edit', 'Bash']) hub.apply({ session_id: 'q', hook_event_name: 'PostToolUse', tool_name: tool });
    assert.equal(hub.view().state, 'running'); assert.deepEqual(hub.view().stats, { read: 2, edit: 1, run: 1 });
    const settings = JSON.parse(fs.readFileSync(t.settingsFile, 'utf8'));
    assert.equal(settings.hooks.PermissionRequest, undefined); // no hook that holds Claude Code
    assert.ok(Object.values(settings.hooks).flat().flatMap(g => g.hooks).every(h => h.type === 'http' && h.timeout === 2));
  } finally { hub.stop(); t.cleanup(); }
});

test('Rehatt takes over the Claude Code hooks and status line of Kopi Island and Teh Tarik Meter, never your own', () => {
  const t = temp();
  try {
    fs.mkdirSync(path.dirname(t.settingsFile), { recursive: true });
    const kopi = { type: 'http', url: 'http://127.0.0.1:47851/kopi-hook?v=4', headers: { 'X-Kopi-Token': 'x' } };
    const reply = { type: 'command', command: 'node "C:/Kopi/kopi-reply.cjs" abc', asyncRewake: true };
    const mine = { type: 'command', command: 'echo mine' };
    fs.writeFileSync(t.settingsFile, JSON.stringify({ hooks: { Stop: [{ hooks: [kopi] }, { hooks: [reply] }, { hooks: [mine] }], PermissionRequest: [{ hooks: [kopi] }] },
      statusLine: { type: 'command', command: 'node "C:/TTM/statusline/teh-tarik-statusline.js"' } }));
    const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile, runner: 'node' });
    assert.equal(hub.installed(), false);
    hub.install();
    const after = JSON.parse(fs.readFileSync(t.settingsFile, 'utf8'));
    const all = Object.values(after.hooks).flat().flatMap(g => g.hooks);
    assert.ok(!all.some(h => /kopi/.test(h.url || h.command || ''))); // the old ones are gone
    assert.ok(all.some(h => h.command === 'echo mine')); // yours stays
    assert.equal(after.hooks.PermissionRequest, undefined);
    assert.match(after.statusLine.command, /rehatt-statusline\.cjs/);
    assert.equal(hub.installed(), true);
    fs.writeFileSync(t.settingsFile, JSON.stringify({ ...after, statusLine: { type: 'command', command: 'echo my line' } }));
    assert.equal(hub.installed(), true); // your own status line is fine as it is
    assert.equal(hub.view().statusTaken, true);
  } finally { t.cleanup(); }
});

test('seen: green, red and questions go quiet after you looked; nothing else changes', async () => {
  const t = temp();
  const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
  try {
    hub.install(); hub.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    hub.apply({ session_id: 'g', hook_event_name: 'Stop', last_assistant_message: 'Done.' });
    hub.apply({ session_id: 'r', hook_event_name: 'StopFailure', error_type: 'overloaded' });
    assert.equal(hub.view().state, 'error');
    hub.seen();
    assert.equal(hub.view().state, 'ready'); // eyes back to normal
    hub.apply({ session_id: 'w', hook_event_name: 'UserPromptSubmit' });
    hub.seen();
    assert.equal(hub.view().state, 'running'); // busy work is never hidden
  } finally { hub.stop(); t.cleanup(); }
});

test('status line prints usage and forwards it to the ring; your own status line is never replaced', async () => {
  const t = temp();
  const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
  try {
    hub.install(); hub.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    const settings = JSON.parse(fs.readFileSync(t.settingsFile, 'utf8'));
    assert.match(settings.statusLine.command, /rehatt-statusline\.cjs" [a-f0-9]{48}$/);
    const token = settings.statusLine.command.split(' ').at(-1);
    hub.apply({ session_id: 's', hook_event_name: 'UserPromptSubmit' });
    const input = JSON.stringify({ session_id: 's', context_window: { used_percentage: 8.4 },
      rate_limits: { five_hour: { used_percentage: 23.5, resets_at: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: 41.2 } } });
    const { execFileSync } = require('node:child_process');
    const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'rehatt-statusline.cjs'), token], { input, encoding: 'utf8' });
    assert.equal(out.trim(), 'Rehatt · 5 hr: 24% · week: 41% · chat: 8% full');
    await new Promise(resolve => setTimeout(resolve, 150));
    const usage = hub.view().usage;
    assert.equal(usage.fiveHour.used, 24); assert.equal(usage.sevenDay.used, 41); assert.equal(usage.context, 8);

    const own = { type: 'command', command: 'echo my own status line' };
    fs.writeFileSync(t.settingsFile, JSON.stringify({ ...settings, statusLine: own }));
    hub.install(); hub.uninstall();
    assert.deepEqual(JSON.parse(fs.readFileSync(t.settingsFile, 'utf8')).statusLine, own);
  } finally { hub.stop(); t.cleanup(); }
});

test('server only accepts posts with the right token', async () => {
  const t = temp();
  const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
  try {
    hub.install(); hub.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    const token = fs.readFileSync(path.join(t.dir, 'rehatt-hook-token'), 'utf8');
    const post = (headers, body) => fetch(HOOK_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    const evil = await post({ 'content-type': 'application/json', 'x-rehatt-token': 'wrong' }, { session_id: 'x', hook_event_name: 'UserPromptSubmit' });
    assert.equal(evil.status, 403); assert.equal(hub.view().state, 'ready');
    const good = await post({ 'content-type': 'application/json', 'x-rehatt-token': token }, { session_id: 'x', cwd: '/a/project', hook_event_name: 'UserPromptSubmit' });
    assert.equal(good.status, 200); assert.equal(await good.text(), '');
    const view = hub.view(); assert.equal(view.state, 'running'); assert.equal(view.connected, true); assert.equal(view.source.title, 'project');
  } finally { hub.stop(); t.cleanup(); }
});

test('without Node.js the status line runs on Rehatt itself, and a change upgrades the install', () => {
  const t = temp();
  try {
    const runner = 'ELECTRON_RUN_AS_NODE=1 "C:/Apps/Rehatt/Rehatt.exe"';
    createHub({ userData: t.dir, settingsFile: t.settingsFile, runner: 'node' }).install();
    const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile, runner });
    assert.equal(hub.installed(), false); // the command changed: start() re-installs
    hub.install();
    assert.ok(JSON.parse(fs.readFileSync(t.settingsFile, 'utf8')).statusLine.command.startsWith(runner + ' "'));
    assert.equal(hub.installed(), true);
  } finally { t.cleanup(); }
});
