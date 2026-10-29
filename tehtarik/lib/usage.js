'use strict';
/*
 * Turns claude.ai's usage reply into the few numbers the widget shows.
 *
 * claude.ai has two shapes, and both are handled:
 *   - the `limits` array that the Settings > Usage page draws:
 *       [{ kind: 'session' | 'weekly_all' | 'weekly_scoped', percent, resets_at, scope: { model: { display_name } } }]
 *   - the older flat buckets: five_hour, seven_day, seven_day_opus, seven_day_sonnet, ...
 *       each { utilization, resets_at }
 * Percentages are 0-100. A bucket that is null does not apply to the plan.
 *
 * A "window" in this app is { pct: number|null, resetsAt: ms|null }.
 */

// 0-100, or null when the value is missing or not a number. Over 100 (overage) is clamped.
function pct(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 100);
}

// An ISO date string, or Unix seconds, or Unix milliseconds, to milliseconds.
function time(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  }
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

function win(percent, resetsAt) {
  const p = pct(percent);
  if (p === null) return null;
  return { pct: p, resetsAt: time(resetsAt) };
}

const FLAT_MODELS = { opus: 'Opus', sonnet: 'Sonnet', fable: 'Fable', omelette: 'Claude Design' };

function parseUsage(payload) {
  const out = { session: null, weekly: null, models: [], extra: null, ok: false };
  if (!payload || typeof payload !== 'object') return out;

  if (Array.isArray(payload.limits)) {
    for (const l of payload.limits) {
      if (!l || typeof l !== 'object') continue;
      const w = win(l.percent, l.resets_at);
      if (!w) continue;
      if (l.kind === 'session' && !out.session) out.session = w;
      else if (l.kind === 'weekly_all' && !out.weekly) out.weekly = w;
      else if (l.kind === 'weekly_scoped') {
        const name = String((l.scope && l.scope.model && l.scope.model.display_name) || '').trim().slice(0, 40);
        if (name) out.models.push(Object.assign({ name }, w));
      }
    }
  }

  if (!out.session && payload.five_hour) out.session = win(payload.five_hour.utilization, payload.five_hour.resets_at);
  if (!out.weekly && payload.seven_day) out.weekly = win(payload.seven_day.utilization, payload.seven_day.resets_at);

  for (const key of Object.keys(FLAT_MODELS)) {
    const b = payload['seven_day_' + key];
    if (!b || typeof b !== 'object') continue;
    const name = FLAT_MODELS[key];
    if (out.models.some(m => m.name.toLowerCase() === name.toLowerCase())) continue;
    const w = win(b.utilization, b.resets_at);
    if (w) out.models.push(Object.assign({ name }, w));
  }

  out.extra = extraUsage(payload.extra_usage);
  out.ok = !!(out.session || out.weekly);
  return out;
}

// Extra usage credits (1.1.0): money is in cents, e.g. used_credits 1240 = $12.40.
function extraUsage(e) {
  if (!e || typeof e !== 'object' || !e.is_enabled) return null;
  if (e.used_credits === null || e.used_credits === undefined || e.monthly_limit === null || e.monthly_limit === undefined) return null;
  const used = Number(e.used_credits) / 100, limit = Number(e.monthly_limit) / 100;
  if (!Number.isFinite(used) || !Number.isFinite(limit) || used < 0 || limit <= 0) return null;
  const currency = typeof e.currency === 'string' && /^[A-Z]{3}$/.test(e.currency) ? e.currency : 'USD';
  return { used: Math.round(used * 100) / 100, limit: Math.round(limit * 100) / 100, currency };
}

// /api/organizations: prefer the pinned org if it is still listed, then the
// orgs that host the chat product, then the first one.
function orgIdOf(o) {
  return (o && (o.uuid || o.organization_uuid || o.id)) || null;
}
function pickOrg(payload, pinned) {
  const orgs = (Array.isArray(payload) ? payload : (payload && Array.isArray(payload.organizations) ? payload.organizations : []))
    .filter(o => o && typeof o === 'object' && typeof orgIdOf(o) === 'string');
  if (!orgs.length) return null;
  if (pinned) {
    const p = orgs.find(o => orgIdOf(o) === pinned);
    if (p) return orgIdOf(p);
  }
  const chat = orgs.filter(o => Array.isArray(o.capabilities) && o.capabilities.includes('chat'));
  return orgIdOf((chat.length ? chat : orgs)[0]);
}

// All orgs with a readable name, for the organization picker (1.1.0).
function listOrgs(payload) {
  const orgs = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.organizations) ? payload.organizations : []);
  return orgs.filter(o => o && typeof o === 'object' && safeOrgId(orgIdOf(o)))
    .map(o => ({ id: orgIdOf(o), name: String(o.name || orgIdOf(o)).slice(0, 80), chat: Array.isArray(o.capabilities) && o.capabilities.includes('chat') }))
    .slice(0, 20);
}

// The org id goes into a URL path, so only a plain id is accepted.
function safeOrgId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null;
}

module.exports = { pct, time, parseUsage, extraUsage, pickOrg, listOrgs, safeOrgId };
