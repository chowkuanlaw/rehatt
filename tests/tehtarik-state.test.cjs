'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ST = require('../tehtarik/lib/state.js');
const F = require('../tehtarik/renderer/format.js');

test('defaults when there is no file or it is broken', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttm-st-'));
  assert.deepEqual(ST.read(path.join(dir, 'none.json')), ST.DEFAULTS);
  fs.writeFileSync(path.join(dir, 'bad.json'), '{');
  assert.deepEqual(ST.read(path.join(dir, 'bad.json')), ST.DEFAULTS);
});

test('keeps good values, drops bad ones, and round-trips', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttm-st-'));
  const f = path.join(dir, 'state.json');
  const s = ST.clean({
    onTop: false, alerts: 'yes', orgId: '../hack', widgetPos: { x: 10.4, y: 'a' },
    cc: { connected: true, original: { type: 'command', command: 'x' }, runner: 'bash' },
    last: { at: 5, session: { pct: 40, resetsAt: 9 }, weekly: { pct: 200 }, models: [{ name: 'Opus', pct: 3, resetsAt: 1 }, { name: 'Bad', pct: 'x' }] }
  });
  assert.equal(s.onTop, false);
  assert.equal(s.alerts, true);
  assert.equal(s.orgId, null);
  assert.equal(s.widgetPos, null);
  assert.equal(s.cc.connected, true);
  assert.equal(s.cc.runner, null);
  assert.deepEqual(s.last.session, { pct: 40, resetsAt: 9 });
  assert.equal(s.last.weekly, null);
  assert.deepEqual(s.last.models.map(m => m.name), ['Opus']);
  ST.write(f, s);
  assert.deepEqual(ST.read(f), s);
});

test('friendly times', () => {
  const now = Date.parse('2026-10-18T01:00:00Z');
  assert.equal(F.countdown(2 * 3600e3 + 14 * 60e3 + 5e3, true), '2h 14m 05s');
  assert.equal(F.countdown(2 * 3600e3 + 14 * 60e3 + 5e3, false), '2h 14m');
  assert.equal(F.countdown(65e3, true), '1m 05s');
  assert.equal(F.countdown(-5, true), '0s');
  assert.equal(F.countdown(3 * 86400e3 + 5 * 3600e3, false), '3d 5h');
  assert.equal(F.when(now + 5 * 3600e3, now), 'in 5h 0m');
  assert.match(F.when(now + 3 * 86400e3, now), /^[A-Z][a-z]{2} \d{1,2}:\d{2} [AP]M$/);
  assert.equal(F.ago(2000), 'just now');
  assert.equal(F.ago(12000), '12s ago');
  assert.equal(F.ago(5 * 60e3), '5 min ago');
  assert.equal(F.mood(10), 'happy');
  assert.equal(F.mood(60), 'okay');
  assert.equal(F.mood(85), 'worried');
  assert.equal(F.mood(97), 'panic');
  assert.equal(F.mood(100), 'asleep');
});
