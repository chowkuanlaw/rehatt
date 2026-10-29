'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../tehtarik/lib/usage.js');

test('reads the limits array (what Settings > Usage shows)', () => {
  const r = U.parseUsage({
    limits: [
      { kind: 'session', percent: 42, resets_at: '2026-10-18T05:00:00Z' },
      { kind: 'weekly_all', percent: 18.5, resets_at: '2026-10-20T04:00:00Z' },
      { kind: 'weekly_scoped', percent: 60, resets_at: '2026-10-20T04:00:00Z', scope: { model: { display_name: 'Fable' } } }
    ],
    five_hour: { utilization: 99, resets_at: '2026-10-18T05:00:00Z' }
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.session, { pct: 42, resetsAt: Date.parse('2026-10-18T05:00:00Z') });
  assert.equal(r.weekly.pct, 18.5);
  assert.deepEqual(r.models.map(m => [m.name, m.pct]), [['Fable', 60]]);
});

test('falls back to the flat buckets', () => {
  const r = U.parseUsage({
    five_hour: { utilization: 12, resets_at: '2026-10-18T05:00:00.123Z' },
    seven_day: { utilization: 7, resets_at: '2026-10-20T04:00:00Z' },
    seven_day_opus: { utilization: 30, resets_at: '2026-10-20T04:00:00Z' },
    seven_day_sonnet: null,
    seven_day_oauth_apps: { utilization: 3, resets_at: null }
  });
  assert.equal(r.session.pct, 12);
  assert.equal(r.weekly.pct, 7);
  assert.deepEqual(r.models.map(m => m.name), ['Opus']);
});

test('a window that has not started has no reset time', () => {
  const r = U.parseUsage({ five_hour: { utilization: 0, resets_at: null }, seven_day: { utilization: 3, resets_at: '2026-10-20T04:00:00Z' } });
  assert.deepEqual(r.session, { pct: 0, resetsAt: null });
});

test('overage is clamped and junk is ignored', () => {
  assert.equal(U.pct(130), 100);
  assert.equal(U.pct(null), null);
  assert.equal(U.pct('abc'), null);
  assert.equal(U.pct(-1), null);
  assert.equal(U.parseUsage(null).ok, false);
  assert.equal(U.parseUsage({ five_hour: null, seven_day: null }).ok, false);
  assert.equal(U.parseUsage({ limits: 'nope' }).ok, false);
});

test('times in ISO, seconds or milliseconds', () => {
  assert.equal(U.time('2026-10-18T05:00:00Z'), Date.parse('2026-10-18T05:00:00Z'));
  assert.equal(U.time(1792290000), 1792290000000);
  assert.equal(U.time(1792290000000), 1792290000000);
  assert.equal(U.time('1792290000'), 1792290000000);
  assert.equal(U.time(''), null);
  assert.equal(U.time('not a date'), null);
});

test('picks the chat org, honours a pinned one', () => {
  const orgs = [
    { uuid: 'aaaaaaaa-1111', capabilities: ['api'] },
    { uuid: 'bbbbbbbb-2222', capabilities: ['chat', 'claude_pro'] }
  ];
  assert.equal(U.pickOrg(orgs, null), 'bbbbbbbb-2222');
  assert.equal(U.pickOrg(orgs, 'aaaaaaaa-1111'), 'aaaaaaaa-1111');
  assert.equal(U.pickOrg(orgs, 'gone-0000-0000'), 'bbbbbbbb-2222');
  assert.equal(U.pickOrg([], null), null);
  assert.equal(U.pickOrg({ organizations: [{ uuid: 'cccccccc-3333' }] }, null), 'cccccccc-3333');
});

test('only plain org ids go into a URL', () => {
  assert.equal(U.safeOrgId('0b7a2c4e-1234-4def-9abc-0123456789ab'), '0b7a2c4e-1234-4def-9abc-0123456789ab');
  assert.equal(U.safeOrgId('../../etc'), null);
  assert.equal(U.safeOrgId('abc/def?x=1'), null);
  assert.equal(U.safeOrgId(42), null);
});
