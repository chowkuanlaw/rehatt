'use strict';
// Lapis inside Rehatt (lapis/engine.cjs): Lapis's own timer and notices, plus Rehatt's rules for your AI, Focus and the island.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setup } = require('../lapis/engine.cjs');

function start(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehatt-lapis-'));
  const handlers = {}, ons = {};
  let busy = false, idle = 0;
  const electron = {
    app: { getPath: () => dir, isPackaged: true, getLocale: () => 'en-GB', whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, on: (ch, fn) => { ons[ch] = fn; } },
    powerMonitor: { getSystemIdleTime: () => idle, on() {} },
    Notification: null, BrowserWindow: { fromWebContents: () => null }, Menu: null, screen: null, net: null
  };
  const e = setup(electron, { immediate: true, noImport: true, dataDir: path.join(dir, 'lapis'), isQuiet: async () => false, aiBusy: () => busy, ...over });
  e.setSetting('workOn', false); // these tests must not depend on the time of day
  e.setSetting('quietMeetings', false);
  return Object.assign(e, { dir, handlers, ons, setBusy: v => { busy = v; }, setIdle: v => { idle = v; }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) });
}

test('a stretch comes when due; start, done, and it counts toward today and the collection', () => {
  const e = start();
  try {
    e.S.nextDue = Date.now() - 1; e.tick();
    assert.equal(e.R.mode, 'due');
    e.act({ type: 'start' }); assert.equal(e.R.mode, 'active');
    e.act({ type: 'done' });
    const st = e.publicState();
    assert.equal(st.mode, 'done'); assert.equal(st.today.total, 1);
    assert.equal(st.history[Object.keys(st.history)[0]].total, 1);
    assert.equal(st.ok, true); assert.ok(Array.isArray(st.week) && st.week.length === 7);
  } finally { e.cleanup(); }
});

test('your AI starts working and a stretch is due within 6 minutes: it comes now, marked "ai"', () => {
  const e = start();
  try {
    e.S.nextDue = Date.now() + 4 * 60e3; e.tick(); e.setBusy(true); e.tick();
    assert.equal(e.R.mode, 'due'); assert.equal(e.R.reason, 'ai');
  } finally { e.cleanup(); }
});

test('Focus holds stretches and water; when it ends on its own, the stretch comes', () => {
  const e = start();
  try {
    e.act({ type: 'focus', until: Date.now() + 25 * 60e3 });
    e.S.nextDue = Date.now() - 1; e.R.nextWater = Date.now() - 1; e.tick();
    assert.equal(e.R.mode, 'waiting'); assert.equal(e.publicState().water, null);
    e.act({ type: 'focus', until: 0, ended: true });
    assert.equal(e.R.mode, 'due'); assert.equal(e.R.reason, 'focus');
  } finally { e.cleanup(); }
});

test('water: a notice the island shows; only "Drank" counts; unanswered, it asks again in 30 minutes', async () => {
  const e = start();
  try {
    e.R.nextWater = Date.now() - 1; e.tick();
    await new Promise(r => setImmediate(r));
    assert.equal(e.publicState().water, 'ask');
    e.R.waterAskAt = Date.now() - 3 * 60e3; e.tick();
    assert.equal(e.publicState().water, null); assert.equal(e.publicState().today.water, 0);
    e.act({ type: 'test', kind: 'water' }); e.act({ type: 'water-drank' });
    assert.equal(e.publicState().today.water, 1); assert.equal(e.publicState().water, 'done');
  } finally { e.cleanup(); }
});

test('an unstarted stretch counts as skipped after 20 minutes', () => {
  const e = start();
  try {
    e.S.nextDue = Date.now() - 1; e.tick();
    e.R.dueAt = Date.now() - 21 * 60e3; e.tick();
    assert.equal(e.R.mode, 'waiting'); assert.equal(e.R.skips, 1);
  } finally { e.cleanup(); }
});

test('Lapis notices: the Friday summary, the wrap-up, teh tarik, night, a new kuih; closing them', () => {
  const e = start();
  try {
    for (const kind of ['summary', 'wrap', 'teh', 'night', 'unlock']) {
      e.act({ type: 'test', kind });
      assert.equal(e.publicState().notice.type, kind);
      e.act({ type: kind === 'night' ? 'night-more' : 'notice-close' });
      assert.equal(e.publicState().notice, null);
    }
  } finally { e.cleanup(); }
});

test('the kuih collection: start with four, five stretches unlock the next one', () => {
  const e = start();
  try {
    const before = e.publicState();
    assert.equal(before.collect, true);
    for (let i = 0; i < 5; i++) { e.act({ type: 'now' }); e.act({ type: 'start' }); e.act({ type: 'done' }); e.R.mode = 'waiting'; }
    const st = e.publicState();
    assert.ok(Object.keys(st.unlocked).length >= 1, 'something unlocked');
    assert.equal(e.R.notices.some(n => n.type === 'unlock'), true);
  } finally { e.cleanup(); }
});

test('secret codes: a wrong one says so', () => {
  const e = start();
  try {
    e.act({ type: 'redeem', code: 'not-a-code' });
    assert.equal(e.publicState().codeMsg, 'bad');
  } finally { e.cleanup(); }
});

test('a golden kuih shows only on a reminder and is remembered for your kuih', () => {
  const e = start();
  try {
    e.act({ type: 'test', kind: 'golden' });
    const st = e.publicState();
    assert.equal(st.golden, true); assert.ok(st.goldFound[st.kuih]);
  } finally { e.cleanup(); }
});

test('Rehatt 0.1 history and settings come along', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehatt-lapis-old-'));
  fs.writeFileSync(path.join(dir, 'rehatt-stretch.json'), JSON.stringify({ interval: 30, kuih: 'angku', history: { '2026-10-29': { total: 3, water: 2, by: { chin: 2 } } } }));
  const electron = {
    app: { getPath: () => dir, isPackaged: true, getLocale: () => 'en', whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { handle() {}, on() {} }, powerMonitor: { getSystemIdleTime: () => 0, on() {} }, BrowserWindow: {}, Notification: null
  };
  try {
    const e = setup(electron, { immediate: true, dataDir: path.join(dir, 'lapis'), isQuiet: async () => false });
    assert.equal(e.S.interval, 30); assert.equal(e.S.kuih, 'angku'); assert.equal(e.S.history['2026-10-29'].total, 3); assert.equal(e.S.onboarded, true);
    assert.ok(fs.existsSync(path.join(dir, 'lapis', 'state.json')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
