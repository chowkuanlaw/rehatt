'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../tehtarik/lib/merge.js');

const NOW = Date.parse('2026-10-18T01:00:00Z');
const H = 3600e3;

test('parses the Claude Code feed (seconds become ms)', () => {
  const f = M.parseFeed({ received_at: NOW, five_hour: { used_percentage: 23.5, resets_at: (NOW + 2 * H) / 1000 }, seven_day: { used_percentage: 41, resets_at: (NOW + 50 * H) / 1000 } });
  assert.equal(f.at, NOW);
  assert.equal(f.session.pct, 23.5);
  assert.equal(f.session.resetsAt, NOW + 2 * H);
  assert.equal(f.weekly.pct, 41);
});

test('ignores feeds without numbers', () => {
  assert.equal(M.parseFeed(null), null);
  assert.equal(M.parseFeed({ received_at: NOW }), null);
  assert.equal(M.parseFeed({ received_at: NOW, five_hour: { used_percentage: null } }), null);
  assert.equal(M.parseFeed({ five_hour: { used_percentage: 5 } }), null);
});

test('the newer reading of each window wins', () => {
  const web = { at: NOW - 60e3, session: { pct: 10, resetsAt: NOW + 2 * H }, weekly: { pct: 30, resetsAt: NOW + 50 * H }, models: [{ name: 'Opus', pct: 5, resetsAt: NOW + 50 * H }] };
  const feed = { at: NOW - 5e3, session: { pct: 14, resetsAt: NOW + 2 * H }, weekly: null };
  const v = M.buildView(web, feed, NOW);
  assert.equal(v.session.pct, 14);
  assert.equal(v.weekly.pct, 30);
  assert.equal(v.source, 'cc');
  assert.equal(v.syncedAt, NOW - 5e3);
  assert.equal(v.models[0].name, 'Opus');
  const v2 = M.buildView(Object.assign({}, web, { at: NOW }), feed, NOW);
  assert.equal(v2.session.pct, 10);
  assert.equal(v2.source, 'web');
});

test('a window past its reset shows as a fresh glass', () => {
  const v = M.buildView({ at: NOW - 3 * H, session: { pct: 88, resetsAt: NOW - 60e3 }, weekly: { pct: 20, resetsAt: NOW + 9 * H }, models: [] }, null, NOW);
  assert.deepEqual(v.session, { pct: 0, resetsAt: null, fresh: true });
  assert.equal(v.weekly.fresh, false);
  assert.equal(M.buildView(null, null, NOW).hasData, false);
});

test('notices a refill', () => {
  const was = { session: { pct: 92 } };
  assert.equal(M.detectReset(was, { session: { pct: 0, fresh: true } }), true);
  assert.equal(M.detectReset(was, { session: { pct: 40 } }), true);
  assert.equal(M.detectReset(was, { session: { pct: 90 } }), false);
  assert.equal(M.detectReset({ session: { pct: 2 } }, { session: { pct: 0 } }), false);
  assert.equal(M.detectReset(null, { session: { pct: 0 } }), false);
});

test('checks often while usage moves, eases off when quiet, pauses when locked', () => {
  const o = x => Object.assign({ now: NOW, lastChangeAt: NOW, errors: 0, paused: false, signedOut: false }, x);
  assert.equal(M.nextDelay(o({})), 15e3);
  assert.equal(M.nextDelay(o({ lastChangeAt: NOW - 5 * 60e3 })), 30e3);
  assert.equal(M.nextDelay(o({ lastChangeAt: NOW - 20 * 60e3 })), 60e3);
  assert.equal(M.nextDelay(o({ lastChangeAt: NOW - 2 * H })), 120e3);
  assert.equal(M.nextDelay(o({ paused: true })), null);
  assert.equal(M.nextDelay(o({ signedOut: true })), null);
  assert.equal(M.nextDelay(o({ errors: 1 })), 15e3);
  assert.equal(M.nextDelay(o({ errors: 3 })), 60e3);
  assert.equal(M.nextDelay(o({ errors: 20 })), 5 * 60e3);
  assert.ok(M.MIN_DELAY >= 15e3, 'never faster than every 15 seconds');
});

test('alerts once per level per window', () => {
  const reset = NOW + 2 * H;
  let sent = {};
  const view = p => ({ session: { pct: p, resetsAt: reset, fresh: false }, weekly: null, models: [] });
  let r = M.alertsFor(view(50), sent, NOW);
  assert.equal(r.alerts.length, 0);
  r = M.alertsFor(view(81), r.sent, NOW);
  assert.deepEqual(r.alerts.map(a => [a.kind, a.level]), [['session', 80]]);
  r = M.alertsFor(view(85), r.sent, NOW);
  assert.equal(r.alerts.length, 0, 'no repeat at the same level');
  r = M.alertsFor(view(96), r.sent, NOW);
  assert.deepEqual(r.alerts.map(a => a.level), [95]);
  sent = r.sent;
  // A new window alerts again.
  r = M.alertsFor({ session: { pct: 82, resetsAt: reset + 5 * H, fresh: false }, weekly: null, models: [] }, sent, NOW);
  assert.equal(r.alerts.length, 1);
});

test('jumping straight to 95% sends one alert, not two', () => {
  const r = M.alertsFor({ session: null, weekly: { pct: 97, resetsAt: NOW + 30 * H }, models: [{ name: 'Opus', pct: 81, resetsAt: NOW + 30 * H }] }, {}, NOW);
  assert.deepEqual(r.alerts.map(a => [a.kind, a.level]), [['weekly', 95], ['model', 80]]);
  assert.equal(M.alertsFor({ session: null, weekly: { pct: 97, resetsAt: NOW + 30 * H }, models: [] }, r.sent, NOW).alerts.length, 0);
});

test('old alert records are dropped', () => {
  const r = M.alertsFor({ session: null, weekly: null, models: [] }, { 'old:80:1': NOW - 9 * 86400e3, 'new:80:2': NOW - 86400e3 }, NOW);
  assert.deepEqual(Object.keys(r.sent), ['new:80:2']);
});
