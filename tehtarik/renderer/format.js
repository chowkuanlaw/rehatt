'use strict';
/* Small text helpers shared by the main process and the windows, in English or Bahasa Melayu. */
(function (root) {
  const I = typeof module !== 'undefined' && module.exports ? require('./i18n.js') : root.TTI18n;
  const tr = (lang, k, v) => I.t(lang || 'en', k, v);

  function countdown(ms, withSeconds, lang) {
    ms = Math.max(0, ms);
    const u = k => tr(lang, 'u.' + k);
    const d = Math.floor(ms / 86400e3);
    const h = Math.floor((ms % 86400e3) / 3600e3);
    const m = Math.floor((ms % 3600e3) / 60e3);
    const s = Math.floor((ms % 60e3) / 1000);
    if (d > 0) return `${d}${u('d')} ${h}${u('h')}`;
    if (h > 0) return withSeconds ? `${h}${u('h')} ${m}${u('m')} ${String(s).padStart(2, '0')}${u('s')}` : `${h}${u('h')} ${m}${u('m')}`;
    if (m > 0) return withSeconds ? `${m}${u('m')} ${String(s).padStart(2, '0')}${u('s')}` : `${m}${u('m')}`;
    return `${s}${u('s')}`;
  }

  const locale = lang => (lang === 'ms' ? 'ms-MY' : 'en-US');
  function clock(ms, lang) { return new Date(ms).toLocaleTimeString(locale(lang), { hour: 'numeric', minute: '2-digit' }); }

  // "in 5h 20m" within a day, otherwise "Mon 12:00 PM".
  function when(resetsAt, now, lang) {
    if (!resetsAt) return '';
    const left = resetsAt - now;
    if (left <= 24 * 3600e3) return tr(lang, 'time.in', { t: countdown(left, false, lang) });
    const d = new Date(resetsAt);
    return `${d.toLocaleDateString(locale(lang), { weekday: 'short' })} ${clock(resetsAt, lang)}`;
  }

  // A clock time today ("3:40 PM"), or with the day if it's not today.
  function at(ms, now, lang) {
    const a = new Date(ms), b = new Date(now);
    if (a.toDateString() === b.toDateString()) return clock(ms, lang);
    return `${a.toLocaleDateString(locale(lang), { weekday: 'short' })} ${clock(ms, lang)}`;
  }

  function ago(ms, lang) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 5) return tr(lang, 'time.justNow');
    if (s < 60) return tr(lang, 'time.sAgo', { n: s });
    const m = Math.round(s / 60);
    if (m < 60) return tr(lang, 'time.minAgo', { n: m });
    return tr(lang, 'time.hAgo', { n: Math.round(m / 60) });
  }

  // Mood from the higher of session and weekly usage.
  function mood(p) {
    if (p === null || p === undefined) return 'happy';
    if (p >= 100) return 'asleep';
    if (p >= 95) return 'panic';
    if (p >= 80) return 'worried';
    if (p >= 50) return 'okay';
    return 'happy';
  }

  function money(n, currency, lang) {
    try { return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: currency || 'USD' }).format(n); }
    catch (e) { return `${currency || ''} ${Number(n).toFixed(2)}`.trim(); }
  }

  const api = { countdown, when, at, ago, mood, money, clock };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TTFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
