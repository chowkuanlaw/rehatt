'use strict';
// Stretch breaks (stretch-main.cjs, from Lapis): the schedule, working hours, your AI, water and time away.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setup, cleanState, isWorkTime, nextWorkStart, DEFAULTS } = require('../stretch-main.cjs');

// a tiny stand-in for Electron: no windows, no timers of its own
function fakeElectron(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehatt-stretch-'));
  const handlers = {};
  const app = { getPath: () => dir, whenReady: () => ({ then() {} }), on() {}, kopiMonitor: null };
  const electron = { app, BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
    powerMonitor: { idle: 0, getSystemIdleTime() { return this.idle; }, on() {} }, Notification: null, ...over };
  return { electron, app, dir, handlers, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
function start(over) {
  const f = fakeElectron(over);
  const s = setup(f.electron, { userData: f.dir });
  s.ACTIONS.set({ key: 'workOn', value: false }); // these tests must not depend on the time of day
  s.ACTIONS.set({ key: 'quietMeetings', value: false });
  return { ...f, ...s };
}

test('a stretch comes when it is due; you start it, finish it, and it counts', () => {
  const s = start();
  try {
    assert.equal(s.R.mode, 'waiting');
    s.S.nextDue = Date.now() - 1; s.tick();
    assert.equal(s.R.mode, 'due'); assert.equal(s.R.cur, 'chin'); // the cycle starts with chin tucks
    s.ACTIONS.start(); assert.equal(s.R.mode, 'active');
    s.ACTIONS.done();
    const st = s.publicState();
    assert.equal(st.mode, 'done'); assert.equal(st.today.total, 1); assert.equal(st.today.by.chin, 1);
    assert.equal(st.upNext, 'neck'); // the next one in the cycle
    assert.ok(Math.abs(s.S.nextDue - (Date.now() + 20 * 60e3)) < 2000); // the next break in 20 minutes
  } finally { s.cleanup(); }
});

test('snooze, skip and "another one"', () => {
  const s = start();
  try {
    s.S.nextDue = Date.now() - 1; s.tick();
    s.ACTIONS.snooze(); assert.equal(s.R.mode, 'snoozed'); assert.ok(Math.abs(s.S.nextDue - (Date.now() + 10 * 60e3)) < 2000);
    s.S.nextDue = Date.now() - 1; s.R.mode = 'waiting'; s.tick();
    s.ACTIONS.different(); assert.notEqual(s.R.cur, 'chin');
    s.ACTIONS.skip(); assert.equal(s.R.mode, 'waiting'); assert.equal(s.publicState().today.total, 0);
  } finally { s.cleanup(); }
});

test('when your AI starts working and a stretch is due soon anyway, it comes right away', () => {
  let busy = false;
  const s = start();
  s.app.kopiMonitor = { view: () => ({ providers: [{ connected: true, state: busy ? 'running' : 'ready' }] }) };
  try {
    s.S.nextDue = Date.now() + 20 * 60e3; s.tick(); busy = true; s.tick();
    assert.equal(s.R.mode, 'waiting'); // 20 minutes away: not yet
    busy = false; s.tick();
    s.S.nextDue = Date.now() + 4 * 60e3; busy = true; s.tick();
    assert.equal(s.R.mode, 'due'); assert.equal(s.R.reason, 'ai');
    s.ACTIONS.skip(); busy = false; s.tick();
    s.ACTIONS.set({ key: 'withAi', value: false });
    s.S.nextDue = Date.now() + 4 * 60e3; busy = true; s.tick();
    assert.equal(s.R.mode, 'waiting'); // turned off in Settings
  } finally { s.cleanup(); }
});

test('paused, or away from your desk: no reminder; coming back starts a fresh countdown', () => {
  const s = start();
  try {
    s.ACTIONS.pause('m30'); s.S.nextDue = Date.now() - 1; s.tick();
    assert.equal(s.R.mode, 'waiting'); assert.ok(s.S.paused);
    s.ACTIONS.resume(); assert.equal(s.S.paused, false);
    s.electron.powerMonitor.idle = 400; s.S.nextDue = Date.now() - 1; s.tick();
    assert.equal(s.publicState().away, true); assert.equal(s.R.mode, 'waiting');
    s.electron.powerMonitor.idle = 0; s.tick();
    assert.equal(s.publicState().away, false); assert.ok(s.publicState().backMins >= 6);
    assert.ok(s.S.nextDue > Date.now() + 19 * 60e3); // the 7 minutes away counted as your break
  } finally { s.cleanup(); }
});

test('water: asked now and then, and every glass counts', () => {
  const s = start();
  try {
    s.R.nextWater = Date.now() - 1; s.tick();
    assert.equal(s.publicState().water, 'ask');
    s.ACTIONS.water();
    const st = s.publicState(); assert.equal(st.water, 'done'); assert.equal(st.today.water, 1);
  } finally { s.cleanup(); }
});

test('working hours: Monday to Friday, 9 to 6, lunch from 1 to 2', () => {
  const at = text => new Date(text);
  assert.equal(isWorkTime(DEFAULTS, at('2026-10-29T10:00:00')), true); // Thursday morning
  assert.equal(isWorkTime(DEFAULTS, at('2026-10-29T13:30:00')), false); // lunch
  assert.equal(isWorkTime(DEFAULTS, at('2026-10-29T18:30:00')), false); // after work
  assert.equal(isWorkTime(DEFAULTS, at('2026-10-31T10:00:00')), false); // Saturday
  assert.equal(new Date(nextWorkStart(DEFAULTS, at('2026-10-31T10:00:00').getTime())).getDay(), 1); // back on Monday
});

test('saved settings are read back safely', () => {
  const S = cleanState({ interval: 30, kuih: 'onde', interval2: 1, workDays: [1, 9], goal: 999, history: { '2026-10-29': { total: 3, water: 2, by: { chin: 2, nope: 1 } }, bad: {} } });
  assert.equal(S.interval, 30); assert.equal(S.kuih, 'onde'); assert.deepEqual(S.workDays, [1]); assert.equal(S.goal, 8);
  assert.deepEqual(S.history, { '2026-10-29': { total: 3, water: 2, by: { chin: 2 } } });
  assert.equal(cleanState({ kuih: 'pizza', interval: 7 }).kuih, 'lapis');
});
