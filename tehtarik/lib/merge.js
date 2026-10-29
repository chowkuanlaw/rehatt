'use strict';
/*
 * Combines the two sources into what the widget shows, and decides when to
 * check again, when to celebrate a reset and when to send an alert.
 *
 *   web  : claude.ai's usage reply, { at, session, weekly, models }
 *   feed : Claude Code's status line feed, { at, session, weekly }
 * Each window is { pct, resetsAt }. The newer reading of each window wins.
 */

// Claude Code's status line JSON (as saved by the status line script).
function parseFeed(j) {
  if (!j || typeof j !== 'object') return null;
  const at = Number(j.received_at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const read = b => {
    if (!b || typeof b !== 'object') return null;
    const p = Number(b.used_percentage);
    if (b.used_percentage === null || b.used_percentage === undefined || !Number.isFinite(p) || p < 0) return null;
    const r = Number(b.resets_at);
    return { pct: Math.min(p, 100), resetsAt: Number.isFinite(r) && r > 0 ? (r < 1e12 ? r * 1000 : r) : null };
  };
  const session = read(j.five_hour), weekly = read(j.seven_day);
  if (!session && !weekly) return null;
  return { at, session, weekly };
}

// A window whose reset time has passed is a fresh one until new data arrives.
function rolled(w, now) {
  if (!w) return null;
  if (w.resetsAt && now >= w.resetsAt) return { pct: 0, resetsAt: null, fresh: true };
  return { pct: w.pct, resetsAt: w.resetsAt || null, fresh: false };
}

function pick(webWin, webAt, feedWin, feedAt) {
  if (webWin && feedWin) return feedAt > webAt ? { w: feedWin, src: 'cc', at: feedAt } : { w: webWin, src: 'web', at: webAt };
  if (feedWin) return { w: feedWin, src: 'cc', at: feedAt };
  if (webWin) return { w: webWin, src: 'web', at: webAt };
  return { w: null, src: null, at: 0 };
}

function buildView(web, feed, now) {
  const wAt = web ? web.at : 0, fAt = feed ? feed.at : 0;
  const s = pick(web && web.session, wAt, feed && feed.session, fAt);
  const k = pick(web && web.weekly, wAt, feed && feed.weekly, fAt);
  const models = (web && Array.isArray(web.models) ? web.models : []).map(m => Object.assign({ name: m.name }, rolled(m, now)));
  const syncedAt = Math.max(wAt, fAt);
  return {
    session: rolled(s.w, now),
    weekly: rolled(k.w, now),
    models,
    extra: (web && web.extra) || null,
    source: syncedAt === 0 ? null : (fAt > wAt ? 'cc' : 'web'),
    syncedAt: syncedAt || null,
    hasData: !!(s.w || k.w)
  };
}

function sameWin(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs((a.pct || 0) - (b.pct || 0)) < 0.05 && Math.abs((a.resetsAt || 0) - (b.resetsAt || 0)) < 60e3;
}
function changed(prev, next) {
  if (!prev) return !!next;
  if (!next) return true;
  return !sameWin(prev.session, next.session) || !sameWin(prev.weekly, next.weekly);
}

// The session glass was refilled: usage dropped a lot, or a used window rolled over.
function detectReset(prev, next) {
  if (!prev || !next || !prev.session || !next.session) return false;
  const a = prev.session.pct || 0, b = next.session.pct || 0;
  if (a < 5) return false;
  return b <= 1 || b <= a - 30;
}

/*
 * How long to wait before asking claude.ai again (ms), or null to pause.
 *  - paused (PC locked or asleep) or signed out: no checks
 *  - after errors: back off 15 s, 30 s, 1 min ... up to 5 min
 *  - usage moved in the last 2 minutes: every 15 s
 *  - otherwise every 30 s, easing to 60 s after 10 quiet minutes and 120 s after 30
 * The widget also asks right away when you hover it, wake the PC or press Refresh.
 */
const MIN_DELAY = 15e3;
function nextDelay(o) {
  if (o.paused) return null;
  if (o.signedOut) return null;
  if (o.errors > 0) return Math.min(MIN_DELAY * Math.pow(2, o.errors - 1), 5 * 60e3);
  const quiet = o.now - (o.lastChangeAt || 0);
  if (quiet < 2 * 60e3) return MIN_DELAY;
  if (quiet < 10 * 60e3) return 30e3;
  if (quiet < 30 * 60e3) return 60e3;
  return 120e3;
}

/*
 * Alerts at 80% and 95%, at most once per level per window. `sent` maps keys to
 * the time they fired. Returns { alerts, sent } with the new keys added and keys
 * older than 8 days dropped.
 */
const LEVELS = [95, 80];
function alertsFor(view, sent, now) {
  const next = {};
  for (const k of Object.keys(sent || {})) if (now - sent[k] < 8 * 86400e3) next[k] = sent[k];
  const alerts = [];
  const buckets = [['session', 'session', view.session], ['weekly', 'weekly', view.weekly]]
    .concat((view.models || []).map(m => ['model', m.name, m]));
  for (const [kind, name, w] of buckets) {
    if (!w || w.fresh || w.pct === null || !w.resetsAt) continue;
    const level = LEVELS.find(l => w.pct >= l);
    if (!level) continue;
    const key = `${name}:${level}:${Math.round(w.resetsAt / 3600e3)}`;
    if (next[key]) continue;
    // Firing 95 also covers 80 for the same window.
    for (const l of LEVELS) if (l <= level) next[`${name}:${l}:${Math.round(w.resetsAt / 3600e3)}`] = now;
    alerts.push({ kind, name, level, pct: w.pct, resetsAt: w.resetsAt });
  }
  return { alerts, sent: next };
}

module.exports = { parseFeed, rolled, buildView, changed, detectReset, nextDelay, alertsFor, MIN_DELAY };
