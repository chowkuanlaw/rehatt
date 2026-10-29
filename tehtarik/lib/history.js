'use strict';
/*
 * Usage history and the burn-rate forecast (1.1.0).
 *
 * History keeps readings of the session and weekly usage: one point when the number
 * changes, and at least one every 10 minutes, for the last 8 days. It lives in
 * %APPDATA%\Teh Tarik Meter\history.json and is used for the History chart and the forecast.
 *
 * The forecast fits a straight line through the recent readings of the current window
 * (the last hour for the session, the last day for the week). If usage is climbing, it
 * says when the glass would be empty at that pace, and whether that's before the refill.
 */
const KEEP = 8 * 86400e3;
const MAX_POINTS = 4000;
const EVERY = 10 * 60e3;
const SESSION_LEN = 5 * 3600e3;
const WEEK_LEN = 7 * 86400e3;

function empty() { return { v: 1, s: [], w: [] }; }

function clean(h) {
  const out = empty();
  if (!h || typeof h !== 'object') return out;
  const ok = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= 100;
  const fix = p => [Math.round(p[0]), Math.round(p[1] * 10) / 10, Number.isFinite(p[2]) ? Math.round(p[2]) : null];
  for (const k of ['s', 'w']) if (Array.isArray(h[k])) out[k] = h[k].filter(ok).map(fix).slice(-MAX_POINTS);
  return out;
}

function pushPoint(list, now, w) {
  if (!w || w.fresh || w.pct === null || w.pct === undefined) return false;
  const last = list[list.length - 1];
  if (last && Math.abs(last[1] - w.pct) < 0.05 && last[2] === (w.resetsAt || null) && now - last[0] < EVERY) return false;
  if (last && now <= last[0]) return false;
  list.push([now, Math.round(w.pct * 10) / 10, w.resetsAt || null]);
  return true;
}

// Adds the current view's readings. Returns true if anything was added.
function add(h, view, now) {
  if (!view) return false;
  const a = pushPoint(h.s, now, view.session);
  const b = pushPoint(h.w, now, view.weekly);
  for (const k of ['s', 'w']) {
    while (h[k].length && now - h[k][0][0] > KEEP) h[k].shift();
    if (h[k].length > MAX_POINTS) h[k].splice(0, h[k].length - MAX_POINTS);
  }
  return a || b;
}

/*
 * When will this window run out at the current pace?
 *   points  : [[time, pct, resetsAt], ...] for this kind
 *   w       : the current window { pct, resetsAt }
 *   look    : how far back to fit (ms)
 *   len     : the window's length (to ignore readings from the previous window)
 * Returns null when there isn't enough to say, else { eta, beforeReset, ratePerHour }.
 */
function forecast(points, w, now, look, len) {
  if (!w || w.fresh || !w.resetsAt || w.pct === null || w.pct >= 100) return null;
  const start = Math.max(now - look, w.resetsAt - len);
  const pts = points.filter(p => p[0] >= start && p[0] <= now && (!p[2] || Math.abs(p[2] - w.resetsAt) < 120e3));
  if (pts[pts.length - 1] === undefined || pts[pts.length - 1][1] !== w.pct) pts.push([now, w.pct, w.resetsAt]);
  if (pts.length < 3) return null;
  const span = pts[pts.length - 1][0] - pts[0][0];
  if (span < Math.min(10 * 60e3, look / 4)) return null;
  // Least-squares slope, % per ms.
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p[0] - mx) * (p[1] - my); den += (p[0] - mx) ** 2; }
  if (den <= 0) return null;
  const rate = num / den;
  const perHour = rate * 3600e3;
  if (!(perHour > 0.5)) return null; // flat or falling: nothing to warn about
  const eta = now + (100 - w.pct) / rate;
  return { eta: Math.round(eta), beforeReset: eta < w.resetsAt, ratePerHour: Math.round(perHour * 10) / 10 };
}

function forecasts(h, view, now) {
  return {
    session: forecast(h.s, view && view.session, now, 60 * 60e3, SESSION_LEN),
    weekly: forecast(h.w, view && view.weekly, now, 24 * 3600e3, WEEK_LEN)
  };
}

// Points for the History tab: today's session (local midnight to now) and the last 7 days of weekly usage.
function series(h, now) {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return {
    from: midnight,
    now,
    session: h.s.filter(p => p[0] >= midnight).map(p => [p[0], p[1]]),
    week: h.w.filter(p => p[0] >= now - 7 * 86400e3).map(p => [p[0], p[1]])
  };
}

module.exports = { empty, clean, add, forecast, forecasts, series, SESSION_LEN, WEEK_LEN };
