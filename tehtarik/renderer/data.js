'use strict';
/* Drinks, festival dates and "What's new", shared by the main process and the windows. */
(function (root) {
  /* ---------- drinks (1.1.0) ----------
     The glass can hold any of these. Colours: tea (the drink), tea2 (stream stripes),
     foam (top layer), foam2 (back wave). Iced drinks get ice cubes instead of steam. */
  const DRINKS = [
    { id: 'tehtarik', say: 'teh tarik', name: 'Teh tarik', tea: '#C8874E', tea2: '#DDA26B', foam: '#F3DEC0', foam2: '#E9C9A0', iced: false },
    { id: 'kopio', say: 'kopi O', name: 'Kopi O', tea: '#4A2C1A', tea2: '#6A4128', foam: '#7A5236', foam2: '#5E3D27', iced: false },
    { id: 'milo', say: 'Milo ais', name: 'Milo ais', tea: '#7B4A2D', tea2: '#93603D', foam: '#A87652', foam2: '#8C5C3A', iced: true },
    { id: 'tehais', say: 'teh ais', name: 'Teh ais', tea: '#C07A3E', tea2: '#D49660', foam: '#EAD0AC', foam2: '#DDBB90', iced: true },
    { id: 'bandung', say: 'sirap bandung', name: 'Sirap bandung', tea: '#EE89AB', tea2: '#F5A8C1', foam: '#FCDDE7', foam2: '#F7C6D6', iced: true }
  ];
  const DRINK_BY = Object.fromEntries(DRINKS.map(d => [d.id, d]));
  const drink = id => DRINK_BY[id] || DRINKS[0];

  /* ---------- the easter egg, one recipe per drink (1.2.0) ----------
     Four steps each. steps = the chips under the stage (kept in Malay in both languages),
     kinds = which animation each step plays (show.js), caps = caption keys ("show." + key)
     for the intro, the joget, the four steps and the bow, each drink with its own words. */
  const RECIPES = {
    tehtarik: { steps: ['Bancuh', 'Susu', 'Tarik', 'Siap'], kinds: ['brew', 'milk', 'pull', 'serve'],
      caps: ['intro', 'dance', 'brew', 'milk', 'pull', 'serve', 'bow'] },
    kopio: { steps: ['Bancuh', 'Gula', 'Tarik', 'Siap'], kinds: ['brew', 'sugar', 'pull', 'serve'],
      caps: ['kopio.intro', 'kopio.dance', 'kopio.brew', 'kopio.sugar', 'kopio.pull', 'kopio.serve', 'kopio.bow'] },
    tehais: { steps: ['Bancuh', 'Susu', 'Tarik', 'Ais'], kinds: ['brew', 'milk', 'pull', 'iceserve'],
      caps: ['tehais.intro', 'tehais.dance', 'tehais.brew', 'tehais.milk', 'tehais.pull', 'tehais.serve', 'tehais.bow'] },
    milo: { steps: ['Milo', 'Air panas', 'Kacau', 'Ais'], kinds: ['scoop', 'water', 'stir', 'icetop'],
      caps: ['milo.intro', 'milo.dance', 'milo.scoop', 'milo.water', 'milo.stir', 'milo.ice', 'milo.bow'] },
    bandung: { steps: ['Sirap', 'Susu', 'Kacau', 'Ais'], kinds: ['syrup', 'swirl', 'stir', 'ice'],
      caps: ['bandung.intro', 'bandung.dance', 'bandung.syrup', 'bandung.milk', 'bandung.stir', 'bandung.ice', 'bandung.bow'] }
  };
  const recipe = id => RECIPES[id] || RECIPES.tehtarik;

  /* ---------- festive outfits (1.1.0, dates from Lapis) ----------
     The festive day of each festival (Malaysian public holidays). The outfit shows on the
     4 days before and on the day itself; when two overlap, the closer festival wins. */
  const FESTIVAL_DAYS = {
    deepavali: ['2026-11-08', '2027-10-28', '2028-10-17', '2029-11-05', '2030-10-26'],
    cny: ['2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'],
    raya: ['2027-03-10', '2028-02-27', '2029-02-15', '2030-02-05'],
    kaamatan: [], gawai: [], merdeka: [], malaysiaday: [], xmas: []
  };
  for (let y = 2026; y <= 2035; y++) {
    FESTIVAL_DAYS.kaamatan.push(`${y}-05-31`); FESTIVAL_DAYS.gawai.push(`${y}-06-01`);
    FESTIVAL_DAYS.merdeka.push(`${y}-08-31`); FESTIVAL_DAYS.malaysiaday.push(`${y}-09-16`); FESTIVAL_DAYS.xmas.push(`${y}-12-25`);
  }
  const LEAD_DAYS = 4;
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  function festivalOn(now) {
    const today = keyDate(dayKey(now || new Date()));
    let best = null;
    for (const [id, days] of Object.entries(FESTIVAL_DAYS)) {
      for (const k of days) {
        const left = Math.round((keyDate(k) - today) / 864e5);
        if (left >= 0 && left <= LEAD_DAYS && (!best || left < best.daysLeft)) best = { id, day: k, daysLeft: left };
      }
    }
    return best;
  }

  /* ---------- what's new ---------- */
  const NEWS = [
    { v: '1.3.2', keys: ['news.1.3.2.a'] },
    { v: '1.3.1', keys: ['news.1.3.1.a'] },
    { v: '1.3.0', keys: ['news.1.3.0.a', 'news.1.3.0.b'] },
    { v: '1.2.0', keys: ['news.1.2.0.a'] },
    { v: '1.1.0', keys: ['news.1.1.0.a', 'news.1.1.0.b', 'news.1.1.0.c', 'news.1.1.0.d', 'news.1.1.0.e'] }
  ];
  // Is version a newer than version b? ("1.10.0" is newer than "1.9.0")
  function newer(a, b) {
    const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  }
  // News since the version you last used (all of it if you're new).
  const newsSince = seen => NEWS.filter(n => !seen || newer(n.v, seen));

  const api = { DRINKS, DRINK_BY, drink, RECIPES, recipe, FESTIVAL_DAYS, festivalOn, dayKey, NEWS, newer, newsSince };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TTData = api;
})(typeof window !== 'undefined' ? window : globalThis);
