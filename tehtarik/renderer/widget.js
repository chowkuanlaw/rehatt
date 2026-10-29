'use strict';
/* The desktop widget: draws what the main process sends, plus the glass's own life (pokes, moods, refills). */
(function () {
  if (!window.ttm || window.ttm.view !== 'widget') return;
  const F = window.TTFormat, G = window.TTGlass, D = window.TTData, I = window.TTI18n;
  const $ = id => document.getElementById(id);
  $('widget').hidden = false;

  const card = $('card'), stage = $('stage');
  let st = null;
  let pokes = [], pokeIdx = -1, combo = 0, comboTimer = 0, jiggleTimer = 0;
  let msg = null, msgUntil = 0;
  let pouring = false, holdTea = null, pourTimer = 0;
  let shownLine = '', trayKey = '', lastTea = null, lastLang = null, lastDrink = null;

  const lang = () => (st && st.settings && st.settings.lang) || 'en';
  const t = (k, v) => I.t(lang(), k, v);
  const set = (id, text) => { const n = $(id); if (n.textContent !== text) n.textContent = text; };
  const label = (id, text) => { const n = $(id); n.setAttribute('aria-label', text); n.title = text; };

  // Weekly cups.
  const cups = [];
  for (let i = 0; i < 7; i++) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 36 44'); svg.setAttribute('width', '40'); svg.setAttribute('height', '49');
    svg.style.animationDelay = `${(i * 0.3).toFixed(1)}s`;
    $('cups').appendChild(svg);
    cups.push({ svg, parts: G.drawCup(svg) });
  }

  function say(text, ms) { msg = text; msgUntil = Date.now() + (ms || 6000); render(); }

  function setLine(text) {
    if (text === shownLine) return;
    shownLine = text;
    $('line').textContent = text;
    const b = $('bubble');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }

  function setFace(mood) {
    const f = G.FACES[mood] || G.FACES.happy;
    const eyes = $('eyes');
    eyes.setAttribute('d', f.eyes);
    eyes.classList.toggle('filled', f.eyesFilled);
    $('brows').setAttribute('d', f.brows);
    $('mouth').setAttribute('d', f.mouth);
    $('mouth').classList.toggle('filled', f.mouthFilled);
    const arm = $('armR');
    arm.setAttribute('d', f.wave ? 'M133 30 q12 -5 15 -18' : 'M133 30 q11 7 12 19');
    arm.classList.toggle('wave', f.wave);
    stage.dataset.mood = mood;
  }

  // Words that don't change with the numbers.
  function staticText() {
    set('lblSession', t('w.session'));
    set('lblLeftIn', t('w.leftInGlass'));
    set('lblWeek', t('w.week'));
    set('lblNotSigned', t('w.notSigned'));
    set('lblSigninText', t('w.signinText'));
    set('btnSignIn', t('w.signinBtn'));
    set('btnPeek', t('w.peek'));
    set('btnPeekExit', t('w.peekExit'));
    set('btnKey', t('w.keyLink'));
    set('lblKey', t('w.keyLabel'));
    set('btnKeySave', t('w.keySave'));
    set('btnRefresh', t('w.refresh'));
    label('btnTop', t('a.top'));
    label('btnCompact', t('a.compact'));
    label('btnSettings', t('a.settings'));
    label('btnHide', t('a.hide'));
    label('btnHide2', t('a.hide'));
    label('btnExpand', t('a.expand'));
    label('stage', t('a.poke'));
    label('miniGlass', t('a.poke'));
    document.documentElement.lang = lang();
  }

  function syncText(now) {
    const s = st;
    if (!s) return [t('sync.starting'), ''];
    if (s.demo) return [t('sync.demo'), 'warn'];
    if (s.preview) return [t('sync.preview'), 'warn'];
    if (s.status === 'signed-out') return [t('sync.signedOut'), 'off'];
    if (s.paused) return [t('sync.paused'), 'off'];
    if (s.formatBroken) return [t('sync.format'), 'warn'];
    const have = !!(s.view && s.view.hasData);
    if (s.fetching && !(s.view && s.view.syncedAt)) return [t('sync.syncing'), ''];
    if (s.status === 'offline') return [t(have ? 'sync.offlineLast' : 'sync.offline'), 'warn'];
    if (s.status === 'error') return [t(have ? 'sync.errorLast' : 'sync.error'), 'warn'];
    if (s.fetching) return [t('sync.syncing'), ''];
    const at = s.view && s.view.syncedAt;
    if (!at) return [t('sync.starting'), ''];
    return [t('sync.live', { ago: F.ago(now - at, lang()) }) + (s.view.source === 'cc' ? t('sync.via') : ''), ''];
  }

  function render() {
    const now = Date.now();
    const s = st;
    const v = s && s.view;
    const cfg = (s && s.settings) || {};
    const L = lang();
    const drink = D.drink(cfg.drink);
    // In the sample preview the real state is still signed out, but we show the sample numbers.
    const preview = !!(s && s.preview);
    const signedOut = !!(s && s.status === 'signed-out') && !preview;
    const hasData = !!(v && v.hasData);

    // Look: theme, drink, compact, festival.
    document.body.classList.toggle('dark', !!(s && s.dark));
    if (drink.id !== lastDrink) { G.applyDrink(drink); lastDrink = drink.id; trayKey = ''; }
    if (L !== lastLang) { lastLang = L; staticText(); shownLine = ''; }
    stage.classList.toggle('iced', drink.iced);
    card.classList.toggle('compact', !!cfg.compact);
    const fest = s && s.festival ? s.festival.id : '';
    if ((stage.dataset.fest || '') !== fest) stage.dataset.fest = fest;
    stage.classList.toggle('hat', fest === 'raya' || fest === 'xmas');

    card.classList.toggle('signed-out', signedOut);
    $('numbers').hidden = signedOut;
    $('signin').hidden = !signedOut;
    $('btnPeekExit').hidden = !preview;
    card.classList.toggle('preview', preview);
    $('btnTop').setAttribute('aria-pressed', cfg.onTop ? 'true' : 'false');

    const sw = v && v.session, ww = v && v.weekly;
    const sPct = sw ? sw.pct : (hasData ? 0 : null);
    const wPct = ww ? ww.pct : null;
    const sLeft = sPct === null ? null : Math.max(0, Math.round(100 - sPct));

    // Tea level.
    let tea = signedOut ? 0 : (sLeft === null ? 0 : sLeft * 0.88);
    if (holdTea !== null) tea = holdTea;
    if (tea !== lastTea) { $('tea').style.height = tea.toFixed(1) + '%'; $('bubbles').style.height = tea.toFixed(1) + '%'; lastTea = tea; }
    stage.classList.toggle('has-tea', tea > 0.5);
    stage.classList.toggle('pouring', pouring);

    // Mood and words.
    const fc = (s && s.fc) || {};
    const worst = Math.max(sPct || 0, wPct || 0);
    const mood = signedOut ? 'asleep' : (pouring ? 'excited' : (hasData ? F.mood(worst) : 'happy'));
    setFace(mood);
    const dv = { drink: drink.say, Drink: drink.name };
    let line;
    if (pouring) line = t('line.excited', dv);
    else if (msg && now < msgUntil) line = msg;
    else if (combo >= 9) line = t('combo.9');
    else if (combo >= 7) line = t('combo.7');
    else if (combo >= 5) line = t('combo.5');
    else if (pokeIdx >= 0 && combo > 0) line = t('poke.' + pokeIdx, dv);
    else if (signedOut) line = t('line.signedOut', dv);
    else if (preview) line = t('line.preview', dv);
    else if (s && s.formatBroken) line = t('line.format');
    else if (!hasData) line = t('line.starting', dv);
    else if (s.festival && s.festival.daysLeft === 0) line = t('fest.' + s.festival.id);
    else if (sw && sw.fresh && (wPct || 0) < 80) line = t('line.fresh');
    else if ((wPct || 0) >= 80 && (sPct || 0) < 80) line = t('line.weeklyLow');
    else if (fc.session && fc.session.beforeReset && (sPct || 0) < 80) line = t('line.pace');
    else line = t('line.' + mood);
    setLine(line);

    // Session numbers.
    set('sLeft', sLeft === null ? '--' : `${sLeft}%`);
    let sub = '';
    if (pouring) sub = t('w.refilling');
    else if (!hasData) sub = '';
    else if (!sw || sw.fresh || !sw.resetsAt) sub = t('w.freshGlass');
    else sub = (sw.pct >= 100 ? t('w.habis') : '') + t('w.nextIn', Object.assign({ t: F.countdown(sw.resetsAt - now, true, L) }, dv));
    set('sSub', sub);
    const pace = $('pace');
    if (hasData && !pouring && fc.session && sw && !sw.fresh) {
      pace.hidden = false;
      pace.classList.toggle('warn', fc.session.beforeReset);
      set('pace', fc.session.beforeReset ? t('w.paceOut', { when: F.at(fc.session.eta, now, L) }) : t('w.paceOk'));
    } else pace.hidden = true;

    // The week.
    const wLeft = wPct === null ? null : Math.max(0, Math.round(100 - wPct));
    set('wLeft', wLeft === null ? '--' : t('w.left', { p: wLeft }));
    for (let i = 0; i < 7; i++) {
      const fr = wLeft === null ? 0 : Math.max(0, Math.min(1, wLeft * 7 / 100 - i));
      cups[i].svg.classList.toggle('awake', G.setCup(cups[i].parts, fr));
    }
    let wsub = '';
    if (ww) {
      if (ww.fresh || !ww.resetsAt) wsub = t('w.fullPot');
      else {
        wsub = (ww.pct >= 100 ? t('w.allEmpty') : '') + t('w.freshPot', { when: F.when(ww.resetsAt, now, L) });
        if (fc.weekly && fc.weekly.beforeReset && ww.pct < 100) wsub += ' · ' + t('w.weekPaceOut', { when: F.at(fc.weekly.eta, now, L) });
      }
    }
    set('wSub', wsub);
    const models = (v && v.models || []).filter(m => m && m.pct !== null && m.pct !== undefined);
    $('models').hidden = !models.length;
    set('models', models.length ? t('w.also') + models.map(m => t('w.modelLeft', { name: m.name, p: Math.max(0, Math.round(100 - m.pct)) })).join(' · ') : '');
    const ex = v && v.extra;
    $('extra').hidden = !ex;
    set('extra', ex ? t('w.extra', { used: F.money(ex.used, ex.currency, L), limit: F.money(ex.limit, ex.currency, L) }) : '');

    // Footer.
    const [text, kind] = syncText(now);
    const sy = $('sync');
    if (sy.textContent !== text) sy.textContent = text;
    sy.className = 'sync' + (kind ? ' ' + kind : '');
    const dot = $('liveDot');
    dot.classList.toggle('off', kind === 'off');
    dot.classList.toggle('warn', kind === 'warn');
    $('btnRefresh').disabled = (signedOut || preview) && !(s && s.demo);
    const news = s && s.news && s.news.length ? s.news[0] : null;
    $('btnNews').hidden = !news;
    if (news) set('btnNews', t('w.whatsNew', { v: news }));

    // Compact strip.
    const p = G.teaPolys(signedOut || sLeft === null ? 0 : sLeft * 0.9);
    $('miniTea').setAttribute('points', p.tea);
    $('miniFoam').setAttribute('points', p.foam);
    $('miniEyes').setAttribute('d', mood === 'asleep' ? 'M42 96 H56 M64 96 H78' : G.MINI_EYES);
    $('miniEyes').style.stroke = mood === 'asleep' ? 'var(--ink)' : 'none';
    $('miniEyes').style.strokeWidth = '5';
    set('miniLeft', signedOut ? t('w.notSigned') : (sLeft === null ? '--' : t('w.compactLeft', { p: sLeft })));
    const miniParts = [];
    if (!signedOut && sw && !sw.fresh && sw.resetsAt) miniParts.push(F.countdown(sw.resetsAt - now, false, L));
    if (!signedOut && wLeft !== null) miniParts.push(t('w.compactWeek', { p: wLeft }));
    set('miniSub', miniParts.join(' · '));

    // Combo badge.
    const cb = $('combo');
    if (combo >= 3) cb.textContent = `×${combo}`; else cb.classList.remove('on');

    // Tray icon follows the level.
    const key = `${signedOut || !hasData ? 'x' : Math.round(sLeft / 5)}:${drink.id}:${s && s.dark ? 1 : 0}`;
    if (key !== trayKey) {
      trayKey = key;
      try { window.ttm.act('tray-icon', { images: G.trayIcons(sLeft === null ? 0 : sLeft, signedOut || !hasData, drink, s && s.dark) }); } catch (e) { /* ignore */ }
    }
  }

  function poke() {
    if (pouring) return;
    stage.classList.remove('jiggle'); void stage.offsetWidth; stage.classList.add('jiggle');
    clearTimeout(jiggleTimer);
    jiggleTimer = setTimeout(() => stage.classList.remove('jiggle'), 600);
    if (st && st.status === 'signed-out' && !st.preview) return;
    const now = Date.now();
    pokes = pokes.filter(x => now - x < 4000);
    pokes.push(now);
    if (pokes.length >= 10) {
      pokes = []; combo = 0; pokeIdx = -1;
      say(t('line.showtime'), 4000);
      window.ttm.act('start-show');
      return;
    }
    combo = pokes.length;
    pokeIdx = (pokeIdx + 1) % 4;
    msg = null;
    const cb = $('combo');
    if (combo >= 3) { cb.classList.remove('on'); void cb.offsetWidth; cb.classList.add('on'); }
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => { combo = 0; pokeIdx = -1; render(); }, 4000);
    render();
  }

  // The session refilled: a pulling mug pours a fresh drink into the glass.
  function playTarik() {
    if (pouring) return;
    holdTea = lastTea;
    pouring = true;
    render();
    setTimeout(() => { holdTea = null; render(); }, 400);
    clearTimeout(pourTimer);
    pourTimer = setTimeout(() => { pouring = false; render(); }, 2700);
  }

  stage.addEventListener('click', poke);
  card.addEventListener('mouseenter', () => window.ttm.act('hover'));
  card.addEventListener('contextmenu', e => { e.preventDefault(); window.ttm.act('menu'); });
  $('btnRefresh').addEventListener('click', () => window.ttm.act('refresh'));
  $('btnHide').addEventListener('click', () => window.ttm.act('hide'));
  $('btnHide2').addEventListener('click', () => window.ttm.act('hide'));
  $('btnTop').addEventListener('click', () => window.ttm.act('set', { key: 'onTop', value: !(st && st.settings && st.settings.onTop) }));
  $('btnCompact').addEventListener('click', () => window.ttm.act('set', { key: 'compact', value: true }));
  $('btnExpand').addEventListener('click', () => window.ttm.act('set', { key: 'compact', value: false }));
  $('miniGlass').addEventListener('dblclick', () => window.ttm.act('set', { key: 'compact', value: false }));
  $('btnSettings').addEventListener('click', () => window.ttm.act('settings'));
  $('btnNews').addEventListener('click', () => { window.ttm.act('settings', { tab: 'about' }); window.ttm.act('news-seen'); });
  $('btnSignIn').addEventListener('click', () => window.ttm.act('sign-in'));
  $('btnPeek').addEventListener('click', () => window.ttm.act('peek'));
  $('btnPeekExit').addEventListener('click', () => window.ttm.act('peek-exit'));
  $('btnKey').addEventListener('click', () => {
    const f = $('keyForm');
    f.hidden = !f.hidden;
    $('btnKey').setAttribute('aria-expanded', String(!f.hidden));
    if (!f.hidden) $('keyInput').focus();
  });
  $('keyForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('keyInput');
    $('keyMsg').textContent = t('w.keyChecking');
    const r = await window.ttm.sessionKey(input.value);
    input.value = '';
    $('keyMsg').textContent = r && r.ok ? t('w.keyOk') : ((r && r.msg) || t('w.keyFail'));
  });

  // Keep the window just as big as the card, so its empty corners don't block clicks underneath.
  let lastW = 0, lastH = 0;
  new ResizeObserver(() => {
    const r = card.getBoundingClientRect();
    const w = Math.ceil(r.width) + 20, h = Math.ceil(r.height) + 26;
    if (Math.abs(w - lastW) > 1 || Math.abs(h - lastH) > 1) { lastW = w; lastH = h; window.ttm.act('size', { w, h }); }
  }).observe(card);

  window.ttm.onState(s => { st = s; render(); });
  window.ttm.onTarik(playTarik);
  window.ttm.onShowOver(() => say(t('line.showOver'), 8000));
  window.ttm.getState().then(s => { if (s) { st = s; render(); } });
  setInterval(render, 1000);
  render();
})();
