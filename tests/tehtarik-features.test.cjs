'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('../tehtarik/lib/history.js');
const U = require('../tehtarik/lib/usage.js');
const ST = require('../tehtarik/lib/state.js');
const D = require('../tehtarik/renderer/data.js');
const I = require('../tehtarik/renderer/i18n.js');
const F = require('../tehtarik/renderer/format.js');

const NOW = Date.parse('2026-10-18T03:00:00Z');
const MIN = 60e3, HOUR = 3600e3;

/* ---------- burn-rate forecast (13) ---------- */
function climb(pctPerHour, minutes, start) {
  const h = H.empty();
  const reset = NOW + 2 * HOUR;
  for (let m = minutes; m >= 0; m -= 5) {
    const at = NOW - m * MIN;
    const pct = start + pctPerHour * (minutes - m) / 60;
    H.add(h, { session: { pct, resetsAt: reset, fresh: false }, weekly: null }, at);
  }
  return { h, reset, pct: start + pctPerHour * minutes / 60 };
}

test('forecast: a steep climb runs out before the refill', () => {
  const { h, reset, pct } = climb(40, 60, 10); // 40% an hour, now at 50%
  const f = H.forecasts(h, { session: { pct, resetsAt: reset }, weekly: null }, NOW).session;
  assert.ok(f, 'has a forecast');
  assert.equal(f.beforeReset, true);
  assert.ok(Math.abs(f.eta - (NOW + 75 * MIN)) < 2 * MIN, `runs out in ~75 min, got ${(f.eta - NOW) / MIN}`);
  assert.equal(f.ratePerHour, 40);
});

test('forecast: a slow climb lasts till the refill', () => {
  const { h, reset, pct } = climb(10, 60, 10);
  const f = H.forecasts(h, { session: { pct, resetsAt: reset }, weekly: null }, NOW).session;
  assert.equal(f.beforeReset, false);
});

test('forecast: nothing to say when idle, too new or fresh', () => {
  let r = climb(0, 60, 30);
  assert.equal(H.forecasts(r.h, { session: { pct: 30, resetsAt: r.reset }, weekly: null }, NOW).session, null);
  r = climb(40, 5, 10);
  assert.equal(H.forecasts(r.h, { session: { pct: r.pct, resetsAt: r.reset }, weekly: null }, NOW).session, null);
  assert.equal(H.forecasts(H.empty(), { session: { pct: 0, resetsAt: null, fresh: true }, weekly: null }, NOW).session, null);
});

test('forecast ignores readings from the previous window', () => {
  const h = H.empty();
  const oldReset = NOW - 30 * MIN, reset = NOW + 4.5 * HOUR;
  for (let m = 60; m >= 35; m -= 5) H.add(h, { session: { pct: 90 + (60 - m) / 5, resetsAt: oldReset } }, NOW - m * MIN);
  for (let m = 25; m >= 0; m -= 5) H.add(h, { session: { pct: 2, resetsAt: reset } }, NOW - m * MIN);
  assert.equal(H.forecasts(h, { session: { pct: 2, resetsAt: reset } }, NOW).session, null);
});

/* ---------- history (14) ---------- */
test('history keeps changes and a reading every 10 minutes, for 8 days', () => {
  const h = H.empty();
  const w = { pct: 10, resetsAt: NOW + HOUR };
  assert.equal(H.add(h, { session: w }, NOW), true);
  assert.equal(H.add(h, { session: w }, NOW + MIN), false, 'unchanged within 10 min');
  assert.equal(H.add(h, { session: Object.assign({}, w, { pct: 11 }) }, NOW + 2 * MIN), true);
  assert.equal(H.add(h, { session: Object.assign({}, w, { pct: 11 }) }, NOW + 13 * MIN), true, 'unchanged but 10 min later');
  H.add(h, { session: Object.assign({}, w, { pct: 12 }) }, NOW + 9 * 86400e3);
  assert.equal(h.s.length, 1, 'old points dropped');
  const c = H.clean({ s: [[1, 5], [2, 'x'], [3, 150], 'bad'], w: [[4, 20, 99]] });
  assert.deepEqual(c.s, [[1, 5, null]]);
  assert.deepEqual(c.w, [[4, 20, 99]]);
});

test('history series: today from local midnight, the week from 7 days ago', () => {
  const h = H.empty();
  H.add(h, { session: { pct: 5, resetsAt: NOW + HOUR }, weekly: { pct: 30, resetsAt: NOW + 86400e3 } }, NOW - 3 * 86400e3);
  H.add(h, { session: { pct: 7, resetsAt: NOW + HOUR }, weekly: { pct: 31, resetsAt: NOW + 86400e3 } }, NOW);
  const s = H.series(h, NOW);
  assert.equal(s.session.length, 1);
  assert.equal(s.week.length, 2);
  assert.ok(s.from <= NOW && NOW - s.from < 86400e3);
});

/* ---------- credits (18) and organizations (17) ---------- */
test('extra usage credits are read in cents', () => {
  const r = U.parseUsage({ five_hour: { utilization: 5, resets_at: null }, extra_usage: { is_enabled: true, used_credits: 1240, monthly_limit: 5000, currency: 'MYR' } });
  assert.deepEqual(r.extra, { used: 12.4, limit: 50, currency: 'MYR' });
  assert.equal(U.extraUsage({ is_enabled: false, used_credits: 1, monthly_limit: 2 }), null);
  assert.equal(U.extraUsage({ is_enabled: true, used_credits: null, monthly_limit: 2 }), null);
  assert.equal(U.extraUsage({ is_enabled: true, used_credits: 5, monthly_limit: 0 }), null);
  assert.equal(U.extraUsage({ is_enabled: true, used_credits: 5, monthly_limit: 100, currency: '<b>' }).currency, 'USD');
});

test('organization list for the picker', () => {
  const list = U.listOrgs([{ uuid: 'aaaaaaaa-1111', name: 'Personal', capabilities: ['chat'] }, { uuid: '../bad', name: 'x' }, { uuid: 'bbbbbbbb-2222', capabilities: [] }]);
  assert.deepEqual(list, [{ id: 'aaaaaaaa-1111', name: 'Personal', chat: true }, { id: 'bbbbbbbb-2222', name: 'bbbbbbbb-2222', chat: false }]);
});

/* ---------- drinks (6), festivals (7), news (8) ---------- */
test('five drinks, each with colours', () => {
  assert.deepEqual(D.DRINKS.map(d => d.id), ['tehtarik', 'kopio', 'milo', 'tehais', 'bandung']);
  for (const d of D.DRINKS) for (const k of ['tea', 'tea2', 'foam', 'foam2']) assert.match(d[k], /^#[0-9A-F]{6}$/i);
  assert.equal(D.drink('nope').id, 'tehtarik');
});

test('festive outfits show 4 days before and on the day', () => {
  const at = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 10); };
  assert.equal(D.festivalOn(at('2026-08-31')).id, 'merdeka');
  assert.equal(D.festivalOn(at('2026-08-27')).daysLeft, 4);
  assert.equal(D.festivalOn(at('2026-08-26')), null);
  assert.equal(D.festivalOn(at('2026-09-01')), null);
  assert.equal(D.festivalOn(at('2026-11-08')).id, 'deepavali');
  assert.equal(D.festivalOn(at('2027-03-10')).id, 'raya');
  assert.equal(D.festivalOn(at('2026-12-24')).id, 'xmas');
  assert.equal(D.festivalOn(at('2026-06-01')).id, 'gawai', 'closer festival wins over Kaamatan');
});

test("what's new: since the version you last used", () => {
  assert.equal(D.newer('1.10.0', '1.9.0'), true);
  assert.equal(D.newer('1.1.0', '1.1.0'), false);
  const all = D.NEWS.map(n => n.v);
  assert.deepEqual(D.newsSince('1.0.0').map(n => n.v), all, 'everything since 1.0.0, newest first');
  assert.deepEqual(D.newsSince('1.1.0').map(n => n.v), all.filter(v => v !== '1.1.0'));
  assert.deepEqual(D.newsSince(all[0]), [], 'nothing new after the newest');
  assert.equal(D.NEWS[0].v, require('../tehtarik/engine.cjs').TTM_VERSION, 'the newest news matches the Teh Tarik Meter release Rehatt follows');
});

/* ---------- Bahasa Melayu (5) ---------- */
test('every English text has a Malay one, with the same placeholders', () => {
  const en = I.DICTS.en, ms = I.DICTS.ms;
  const ph = s => (s.match(/\{(\w+)\}/g) || []).map(x => x.toLowerCase()).sort().join(',');
  assert.deepEqual(Object.keys(ms).sort(), Object.keys(en).sort());
  for (const k of Object.keys(en)) assert.equal(ph(ms[k]), ph(en[k]), `placeholders differ in ${k}`);
  for (const n of D.NEWS) for (const k of n.keys) assert.ok(en[k] && ms[k], `news text ${k}`);
  for (const p of ['intro', 'dance', 'brew', 'milk', 'pull', 'serve', 'bow']) assert.equal(I.t('ms', 'show.' + p).split('|').length, 2);
});

// (the Teh Tarik Meter release-notes test belongs to its own repository)

test('every drink has its own easter egg recipe, with captions in both languages', () => {
  const kinds = ['brew', 'milk', 'sugar', 'pull', 'serve', 'iceserve', 'scoop', 'water', 'stir', 'syrup', 'swirl', 'ice', 'icetop'];
  for (const d of D.DRINKS) {
    const r = D.RECIPES[d.id];
    assert.ok(r, `recipe for ${d.id}`);
    assert.equal(r.steps.length, 4); assert.equal(r.kinds.length, 4); assert.equal(r.caps.length, 7);
    for (const k of r.kinds) assert.ok(kinds.includes(k), `known step ${k}`);
    for (const c of r.caps) for (const lang of ['en', 'ms']) {
      assert.ok(Object.prototype.hasOwnProperty.call(I.DICTS[lang], 'show.' + c), `${lang} show.${c}`);
      assert.equal(I.t(lang, 'show.' + c).split('|').length, 2, `${lang} show.${c} has a title and a line`);
    }
  }
  assert.equal(D.recipe('nope'), D.RECIPES.tehtarik);
  // Each moment of the show reads differently for every drink, in both languages.
  for (const lang of ['en', 'ms']) for (let i = 0; i < 7; i++) {
    const titles = D.DRINKS.map(d => I.t(lang, 'show.' + D.RECIPES[d.id].caps[i]).split('|')[0]);
    const lines = D.DRINKS.map(d => I.t(lang, 'show.' + D.RECIPES[d.id].caps[i]).split('|')[1]);
    assert.equal(new Set(titles).size, titles.length, `${lang} moment ${i}: titles repeat (${titles.join(' / ')})`);
    assert.equal(new Set(lines).size, lines.length, `${lang} moment ${i}: lines repeat`);
  }
  assert.ok(D.RECIPES.milo.kinds.includes('icetop') && D.RECIPES.bandung.kinds.includes('stir') && !D.RECIPES.bandung.kinds.includes('pull'));
});

test('t() fills in values and falls back to English', () => {
  assert.equal(I.t('ms', 'w.left', { p: 40 }), 'Tinggal 40%');
  assert.equal(I.t('xx', 'w.left', { p: 40 }), '40% left');
  assert.equal(I.t('en', 'no.such.key'), 'no.such.key');
  assert.equal(F.countdown(2 * HOUR + 5 * MIN, false, 'ms'), '2j 5m');
  assert.equal(F.ago(5 * MIN, 'ms'), '5 min lalu');
  assert.equal(F.when(NOW + 2 * HOUR, NOW, 'ms'), 'dalam 2j 0m');
});

/* ---------- settings and the daily backup (9) ---------- */
test('new settings are checked', () => {
  const s = ST.clean({ theme: 'neon', lang: 'ms', drink: 'bandung', textSize: 'huge', compact: true, hideFull: 'yes' });
  assert.equal(s.theme, 'system');
  assert.equal(s.lang, 'ms');
  assert.equal(s.drink, 'bandung');
  assert.equal(s.textSize, 'normal');
  assert.equal(s.compact, true);
  assert.equal(s.hideFull, true);
  assert.equal(s.welcomed, false);
});

test('upgrading from 1.0.0 skips the welcome and shows what is new', () => {
  const s = ST.clean({ orgId: 'aaaaaaaa-1111', last: { at: 5, session: { pct: 3 } } });
  assert.equal(s.welcomed, true);
  assert.equal(s.seenVersion, '1.0.0');
  assert.deepEqual(D.newsSince(s.seenVersion).map(n => n.v), D.NEWS.map(n => n.v));
});

test('a broken settings file is restored from the daily backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttm-bak-'));
  const f = path.join(dir, 'state.json');
  ST.write(f, ST.clean({ lang: 'ms', drink: 'milo' }), NOW);
  assert.ok(fs.existsSync(ST.backupOf(f)), 'backup made on the first save of the day');
  fs.writeFileSync(f, '{ broken');
  const r = ST.readWithBackup(f);
  assert.equal(r.restored, true);
  assert.equal(r.state.lang, 'ms');
  assert.equal(r.state.drink, 'milo');
  // No file at all is a first run, not a restore.
  assert.equal(ST.readWithBackup(path.join(dir, 'none.json')).restored, false);
});
