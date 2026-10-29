'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHub, EVENTS, PORT } = require('../claude-code-hooks.cjs');

function temp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-hooks-'));
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
    assert.equal(hub.installed(), true); assert.ok(fs.existsSync(t.settingsFile + '.kopi-backup'));
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

test('hook events drive the traffic light: busy, question, done, error', () => {
  const t = temp(), finished = [];
  try {
    const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile, onFinish: s => finished.push(s.state) });
    const send = (hook_event_name, extra = {}) => hub.apply({ session_id: 's1', cwd: 'C:\\code\\app', hook_event_name, ...extra });
    send('UserPromptSubmit'); assert.equal(hub.view().connected, false); // not installed, server not running
    send('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'C:\\code\\app\\main.js' } });
    send('PermissionRequest', { tool_name: 'Bash' }); assert.deepEqual(finished, ['question']);
    send('PostToolUse');
    send('Stop', { last_assistant_message: 'Done. Should I run the tests too?' }); assert.equal(finished.at(-1), 'question');
    send('UserPromptSubmit'); send('Stop', { last_assistant_message: 'Everything is fixed.' }); assert.equal(finished.at(-1), 'done');
    send('UserPromptSubmit'); send('StopFailure', { error_type: 'rate_limit' }); assert.equal(finished.at(-1), 'error');
  } finally { t.cleanup(); }
});

test('permission waits for Allow in the island and answers Claude Code; a later event releases it', async () => {
  const t = temp();
  const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
  try {
    hub.install(); hub.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    const token = fs.readFileSync(path.join(t.dir, 'claude-code-hook-token'), 'utf8');
    const post = body => fetch('http://127.0.0.1:' + PORT + '/kopi-hook?v=2', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kopi-token': token }, body: JSON.stringify(body) });
    const asking = post({ session_id: 'p', cwd: '/w/site', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm i' } });
    await new Promise(resolve => setTimeout(resolve, 100));
    const view = hub.view(); assert.equal(view.state, 'question'); assert.equal(view.permission.what, 'npm i');
    hub.decide('p', 'allow');
    const answer = await (await asking).json();
    assert.deepEqual(answer, { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedInput: { command: 'npm i' } } } });
    assert.throws(() => hub.decide('p', 'allow'), /already answered/);
    // Answered in the terminal instead: the next tool event releases the open request with an empty body.
    const second = post({ session_id: 'p', hook_event_name: 'PermissionRequest', tool_name: 'Edit', tool_input: { file_path: '/w/a.js' } });
    await new Promise(resolve => setTimeout(resolve, 100));
    await post({ session_id: 'p', hook_event_name: 'PostToolUse', tool_name: 'Edit' });
    assert.equal(await (await second).text(), ''); assert.equal(hub.view().permission, null);
  } finally { hub.stop(); t.cleanup(); }
});

test('multiple-choice questions and plans are answered from the island; tool counts per turn', async () => {
  const t = temp();
  const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
  try {
    hub.install(); hub.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    const token = fs.readFileSync(path.join(t.dir, 'claude-code-hook-token'), 'utf8');
    const post = body => fetch('http://127.0.0.1:' + PORT + '/kopi-hook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kopi-token': token }, body: JSON.stringify(body) });
    const questions = [{ question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: 'idle' }, { label: 'Green', description: '' }] },
      { question: 'Which parts?', header: 'Parts', multiSelect: true, options: [{ label: 'Button', description: '' }, { label: 'Title', description: '' }] }];
    const asking = post({ session_id: 'q', hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion', tool_input: { questions } });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(hub.view().ask.length, 2); assert.equal(hub.view().ask[0].options[0].label, 'Blue');
    assert.throws(() => hub.answerQuestions('q', { 'Which colour?': 'Blue' }), /every question/);
    hub.answerQuestions('q', { 'Which colour?': 'Blue', 'Which parts?': ['Button', 'Title'] });
    const sent = await (await asking).json();
    assert.deepEqual(sent.hookSpecificOutput.decision, { behavior: 'allow', updatedInput: { questions, answers: { 'Which colour?': 'Blue', 'Which parts?': 'Button, Title' } } });

    const planning = post({ session_id: 'q', hook_event_name: 'PermissionRequest', tool_name: 'ExitPlanMode', tool_input: { plan: '# Plan\n- step 1' } });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(hub.view().plan, '# Plan\n- step 1');
    hub.decidePlan('q', false, 'Tests first');
    const back = await (await planning).json();
    assert.equal(back.hookSpecificOutput.decision.behavior, 'deny'); assert.match(back.hookSpecificOutput.decision.message, /Tests first/);

    for (const tool of ['Read', 'Read', 'Edit', 'Bash']) hub.apply({ session_id: 'q', hook_event_name: 'PostToolUse', tool_name: tool });
    assert.deepEqual(hub.view().stats, { read: 2, edit: 1, run: 1 });
    hub.apply({ session_id: 'q', hook_event_name: 'UserPromptSubmit' });
    assert.deepEqual(hub.view().stats, {});
  } finally { hub.stop(); t.cleanup(); }
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
    assert.match(settings.statusLine.command, /kopi-statusline\.cjs" [a-f0-9]{48}$/);
    const token = settings.statusLine.command.split(' ').at(-1);
    hub.apply({ session_id: 's', hook_event_name: 'UserPromptSubmit' });
    const input = JSON.stringify({ session_id: 's', context_window: { used_percentage: 8.4 },
      rate_limits: { five_hour: { used_percentage: 23.5, resets_at: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: 41.2 } } });
    const { execFileSync } = require('node:child_process');
    const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'kopi-statusline.cjs'), token], { input, encoding: 'utf8' });
    assert.equal(out.trim(), 'Kopi Island · 5 hr: 24% · week: 41% · chat: 8% full');
    await new Promise(resolve => setTimeout(resolve, 150));
    const usage = hub.view().usage;
    assert.equal(usage.fiveHour.used, 24); assert.equal(usage.sevenDay.used, 41); assert.equal(usage.context, 8);

    const own = { type: 'command', command: 'echo my own status line' };
    fs.writeFileSync(t.settingsFile, JSON.stringify({ ...settings, statusLine: own }));
    hub.install(); hub.uninstall();
    assert.deepEqual(JSON.parse(fs.readFileSync(t.settingsFile, 'utf8')).statusLine, own);
  } finally { hub.stop(); t.cleanup(); }
});

test('answer typed in the island wakes Claude (exit 2); typing in the terminal cancels it (exit 0)', async () => {
  const t = temp();
  const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
  const { spawn } = require('node:child_process');
  const run = (token, sessionId) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'kopi-reply.cjs'), token]);
    let stderr = ''; child.stderr.on('data', d => { stderr += d; });
    child.stdin.end(JSON.stringify({ session_id: sessionId, hook_event_name: 'Stop' }));
    return new Promise(resolve => child.on('exit', code => resolve({ code, stderr })));
  };
  try {
    hub.install(); hub.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    const stop = JSON.parse(fs.readFileSync(t.settingsFile, 'utf8')).hooks.Stop.flatMap(g => g.hooks).find(h => h.type === 'command');
    assert.equal(stop.asyncRewake, true); assert.match(stop.command, /kopi-reply\.cjs/);
    const token = stop.command.split(' ').at(-1);

    hub.apply({ session_id: 'r', hook_event_name: 'Stop', last_assistant_message: 'Which colour do you want?' });
    const woke = run(token, 'r');
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(hub.view().canReply, true);
    hub.reply('r', 'Blue please');
    const result = await woke;
    assert.equal(result.code, 2); assert.match(result.stderr, /Blue please/);
    assert.equal(hub.view().state, 'running');

    const cancelled = run(token, 'r');
    await new Promise(resolve => setTimeout(resolve, 400));
    hub.apply({ session_id: 'r', hook_event_name: 'UserPromptSubmit' });
    assert.equal((await cancelled).code, 0);
    assert.throws(() => hub.reply('r', 'too late'), /no longer waiting/);
  } finally { hub.stop(); t.cleanup(); }
});

test('server only accepts posts with the right token', async () => {
  const t = temp();
  const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile });
  try {
    hub.install(); hub.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    const token = fs.readFileSync(path.join(t.dir, 'claude-code-hook-token'), 'utf8');
    const post = (headers, body) => fetch('http://127.0.0.1:' + PORT + '/kopi-hook', { method: 'POST', headers, body: JSON.stringify(body) });
    const evil = await post({ 'content-type': 'application/json', 'x-kopi-token': 'wrong' }, { session_id: 'x', hook_event_name: 'UserPromptSubmit' });
    assert.equal(evil.status, 403); assert.equal(hub.view().state, 'ready');
    const good = await post({ 'content-type': 'application/json', 'x-kopi-token': token }, { session_id: 'x', cwd: '/a/project', hook_event_name: 'UserPromptSubmit' });
    assert.equal(good.status, 200); assert.equal(await good.text(), '');
    const view = hub.view(); assert.equal(view.state, 'running'); assert.equal(view.connected, true); assert.equal(view.source.title, 'project');
  } finally { hub.stop(); t.cleanup(); }
});

test('without Node.js the helper scripts run on Kopi Island itself, and a change upgrades the install', () => {
  const t = temp();
  try {
    const runner = 'ELECTRON_RUN_AS_NODE=1 "C:/Apps/Kopi Island/Kopi Island.exe"';
    const old = createHub({ userData: t.dir, settingsFile: t.settingsFile, runner: 'node' });
    old.install();
    const hub = createHub({ userData: t.dir, settingsFile: t.settingsFile, runner });
    assert.equal(hub.installed(), false); // the command changed: start() re-installs
    hub.install();
    const settings = JSON.parse(fs.readFileSync(t.settingsFile, 'utf8'));
    assert.ok(settings.statusLine.command.startsWith(runner + ' "'));
    const replies = settings.hooks.Stop.flatMap(g => g.hooks).filter(h => h.type === 'command');
    assert.equal(replies.length, 1); assert.ok(replies[0].command.startsWith(runner + ' "'));
    assert.equal(hub.installed(), true);
  } finally { t.cleanup(); }
});
