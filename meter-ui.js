'use strict';
// Your Claude usage in the island: Teh Tarik Meter running inside Rehatt (tehtarik/engine.cjs reads the numbers).
//   - the Usage page IS Teh Tarik Meter's glass card (its own markup, styles and words, from tehtarik/renderer):
//     the tea is your 5-hour session, seven cups are your week, the glass has moods and lines, a pulling mug
//     pours a fresh drink when the session refills, the forecast says when it runs out at this pace,
//     per-model caps and extra credits, sign in, a session key, or peek at a sample first.
//     Poke the glass and it talks back; poke it 10 times in 4 seconds and the show starts (full screen).
//   - a home widget with a small glass in your drink
//   - the tray icon can be your glass (Rehatt Settings → General → Tray icon), draining with your session
(function meterIsland() {
  const api = window.kopi, G = window.TTGlass, TD = window.TTData, TI = window.TTI18n, F = window.TTFormat;
  if (!api?.meterGet || !G || !TD || !TI || !F) return;
  const lang = () => (window.__kopiPrefs?.().lang === 'ms' ? 'ms' : 'en');
  const t = (k, v) => TI.t(lang(), k, v);
  let st = null;

  // Teh Tarik Meter's fonts (they must live in the page itself, not in the card's shadow root)
  const fonts = document.createElement('style');
  fonts.textContent = [['Baloo 2', 700, 'baloo-2-latin-700-normal'], ['Baloo 2', 800, 'baloo-2-latin-800-normal'], ['Nunito', 600, 'nunito-latin-600-normal'], ['Nunito', 700, 'nunito-latin-700-normal'], ['Nunito', 800, 'nunito-latin-800-normal']]
    .map(([f, w, file]) => `@font-face{font-family:'${f}';font-weight:${w};src:url('tehtarik/renderer/fonts/${file}.woff2') format('woff2')}`).join('\n');
  document.head.appendChild(fonts);

  // ---------- the Usage page: the card in a shadow root, so its styles stay its own ----------
  const host = document.createElement('section'); host.id = 'rehatt-meter'; host.className = 'dark';
  host.style.cssText = 'position:absolute;z-index:60;display:none;pointer-events:auto';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<link rel="stylesheet" href="tehtarik/renderer/app.css">
<style>
:host{--ink:#F1E4D3;--text:#F6EBDD;--card:transparent;--cardline:#0E0A08;--bubble:#3A2E27;--glass:#8C7B6F;--muted:#CDB8A4;--brown:#E6AE74;--green:#86CFA1;--warn:#F0B65C;--dash:#5A4A3F;
  --btn:#3A2E27;--btnhover:#45372F;--hover:rgba(241,228,211,.1);--pink:#F28CA3;--pandan:#3E8E5A;--steam:#8E7B6E;--steel:#C9D1D6;--drop:#7EC8E3;--page:#1E1814;--panel:#2A211C;
  --accent:#C8874E;--display:'Baloo 2','Segoe UI',sans-serif;--body:'Nunito','Segoe UI',sans-serif;
  color:var(--text);font-family:var(--body);-webkit-user-select:none;user-select:none}
*{box-sizing:border-box}
[hidden]{display:none!important}
svg .shine{opacity:.35}
.card.island{width:auto;height:100%;background:transparent;border:0;box-shadow:none;padding:0;gap:0;border-radius:0;display:block}
.cols{display:flex;gap:14px;height:100%;align-items:center}
.cols .stage{transform:scale(.95);transform-origin:50% 50%;cursor:pointer;flex:none}
.cols .side{flex:1.15;min-width:0;align-self:center;gap:4px}
.cols .bubble{font-size:12.5px;padding:7px 11px}
.cols .big{font-size:40px}
.cols .small{font-size:12px}
.cols .small.strong{font-size:13px}
.cols .week{flex:1;min-width:0;border-top:0;border-left:1.5px dashed var(--dash);padding:0 0 0 14px;height:100%;justify-content:center;gap:5px}
.cols .cups svg{width:30px;height:37px}
.cols .foot{padding-top:6px;margin-top:2px}
.cols .sync{font-size:11px}
.cols #signin .btn{height:32px}
.cols #keyForm input{height:30px}
</style>
<div class="card island" id="card"><div class="cols">
<button class="stage" id="stage" aria-label="">
<div class="pour" aria-hidden="true"><div class="stream"></div>
<svg class="jug" viewBox="0 0 56 56" width="56" height="56"><path d="M16 18 L6 13 L16 25 Z" class="steel"/><rect x="15" y="14" width="26" height="32" rx="3" class="steel"/><path d="M41 20 q10 0 10 9 q0 9 -10 9" class="line"/><path d="M20 20 L20 40" class="shine"/></svg></div>
<div class="body" id="body">
<svg class="steam" viewBox="0 0 80 40" width="80" height="40" aria-hidden="true"><path d="M22 36 q-5 -5 0 -9 q5 -4 0 -9 q-5 -4 0 -9"/><path d="M40 34 q-5 -5 0 -9 q5 -4 0 -9 q-5 -4 0 -9"/><path d="M58 36 q-5 -5 0 -9 q5 -4 0 -9 q-5 -4 0 -9"/></svg>
<div class="glass" aria-hidden="true"><div class="tea" id="tea">
<svg class="wave2" viewBox="0 0 232 22" width="232" height="22"><path d="M0 8 Q14.5 2 29 8 T58 8 T87 8 T116 8 T145 8 T174 8 T203 8 T232 8 V22 H0 Z"/></svg>
<svg class="wave" viewBox="0 0 232 22" width="232" height="22"><path d="M0 8 Q14.5 2 29 8 T58 8 T87 8 T116 8 T145 8 T174 8 T203 8 T232 8 V20 H0 Z"/></svg>
<i class="ice ice1"></i><i class="ice ice2"></i></div><div class="bubbles" id="bubbles"><i></i><i></i><i></i></div></div>
<svg class="outline" viewBox="0 0 128 172" width="128" height="172" aria-hidden="true"><path d="M14 20 L21 150" class="shine"/><polygon points="5,5 123,5 110,167 18,167" class="line"/></svg>
<svg class="arms" viewBox="0 0 160 70" width="160" height="70" aria-hidden="true"><path d="M26 30 q-11 7 -12 19" class="line"/><path id="armR" class="line armR" d="M133 30 q11 7 12 19"/></svg>
<svg class="face" viewBox="0 0 68 44" width="68" height="44" aria-hidden="true"><ellipse cx="12" cy="24" rx="4.5" ry="2.6" class="blush"/><ellipse cx="56" cy="24" rx="4.5" ry="2.6" class="blush"/><g class="eyes"><path id="eyes" d=""/></g><path id="brows" class="line" d=""/><path id="mouth" class="line" d=""/></svg>
<svg class="festive" viewBox="0 0 160 240" width="160" height="240" aria-hidden="true">
<g class="f-raya"><path d="M52 64 L54 44 Q80 37 106 44 L108 64 Z" class="hat-black"/><path d="M54 58 L106 58" class="gold"/></g>
<g class="f-xmas"><path d="M50 64 Q64 28 98 20 Q116 32 112 64 Z" class="hat-red"/><rect x="44" y="56" width="74" height="11" rx="5.5" class="trim"/><circle cx="99" cy="20" r="7" class="trim"/></g>
<g class="f-cny"><path d="M14 153 L14 160" class="thin"/><rect x="8" y="158" width="12" height="4" rx="1" class="goldfill"/><ellipse cx="14" cy="172" rx="11" ry="12" class="lantern"/><path d="M14 161 L14 183" class="lantern-rib"/><rect x="8" y="182" width="12" height="4" rx="1" class="goldfill"/><path d="M14 186 L14 197" class="gold"/></g>
<g class="f-deepavali"><path d="M141 221 Q135 211 141 200 Q147 211 141 221 Z" class="flame"/><path d="M125 221 Q141 238 157 221 Z" class="diya"/></g>
<g class="f-flag"><path d="M144 156 L144 108" class="pole"/><rect x="144" y="108" width="22" height="14" class="flag-w"/><path d="M144 110 H166 M144 113.5 H166 M144 117 H166 M144 120.5 H166" class="flag-r"/><rect x="144" y="108" width="10" height="8" class="flag-b"/><circle cx="148.5" cy="112" r="2.3" class="flag-y"/></g>
<g class="f-band"><rect x="25" y="59" width="110" height="8" rx="4" class="band"/><circle cx="36" cy="63" r="2.4" class="bead-r"/><circle cx="48" cy="63" r="2.4" class="bead-y"/><circle cx="60" cy="63" r="2.4" class="bead-w"/><circle cx="72" cy="63" r="2.4" class="bead-r"/><circle cx="84" cy="63" r="2.4" class="bead-y"/><circle cx="96" cy="63" r="2.4" class="bead-w"/><circle cx="108" cy="63" r="2.4" class="bead-r"/><circle cx="120" cy="63" r="2.4" class="bead-y"/></g>
<g class="f-feather"><path d="M120 60 Q134 34 124 12" class="feather"/><path d="M124 12 Q128 20 126 26" class="feather-tip"/></g>
</svg>
<div class="drip" aria-hidden="true"></div><span class="z z1" aria-hidden="true">z</span><span class="z z2" aria-hidden="true">z</span>
</div><span class="combo" id="combo" aria-hidden="true"></span>
</button>
<div class="side">
<div class="bubble" id="bubble" role="status"><span id="line"></span></div>
<div id="numbers"><div class="label" id="lblSession"></div><div class="big" id="sLeft">--</div><div class="small strong" id="lblLeftIn"></div>
<div class="small muted" id="sSub"></div><div class="small pace" id="pace" hidden></div><button class="link" id="btnPeekExit" hidden></button></div>
<div id="signin" hidden><div class="label" id="lblNotSigned"></div><p class="small" id="lblSigninText"></p><button class="btn primary" id="btnSignIn"></button>
<button class="link" id="btnPeek"></button><button class="link" id="btnKey" aria-expanded="false"></button>
<form id="keyForm" hidden><label class="small" for="keyInput" id="lblKey"></label><input id="keyInput" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-...">
<div class="keyrow"><button class="btn" type="submit" id="btnKeySave"></button><span class="small muted" id="keyMsg" role="status"></span></div></form></div>
</div>
<section class="week" id="week">
<div class="spread"><span class="label" id="lblWeek"></span><span class="pct" id="wLeft">--</span></div>
<div class="cups" id="cups" aria-hidden="true"></div>
<div class="small muted" id="wSub"></div><div class="small muted" id="models" hidden></div><div class="small muted" id="extra" hidden></div>
<button class="link news" id="btnNews" hidden></button>
<footer class="foot"><span class="sync" id="sync" role="status"></span><button class="btn tiny" id="btnRefresh"></button></footer>
</section>
</div></div>`;
  const $ = id => shadow.getElementById(id);
  const card = $('card'), stage = $('stage');

  // ---------- Teh Tarik Meter's widget, with its own life (widget.js) ----------
  let pokes = [], pokeIdx = -1, combo = 0, comboTimer = 0, jiggleTimer = 0;
  let msg = null, msgUntil = 0, pouring = false, holdTea = null, pourTimer = 0;
  let shownLine = '', lastTea = null, lastLang = null, lastDrink = null;
  const set = (id, text) => { const n = $(id); if (n && n.textContent !== text) n.textContent = text; };
  const cups = [];
  for (let i = 0; i < 7; i++) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 36 44'); s.setAttribute('width', '30'); s.setAttribute('height', '37');
    s.style.animationDelay = `${(i * 0.3).toFixed(1)}s`;
    $('cups').appendChild(s); cups.push({ svg: s, parts: G.drawCup(s) });
  }
  function say(text, ms) { msg = text; msgUntil = Date.now() + (ms || 6000); render(); }
  function setLine(text) {
    if (text === shownLine) return;
    shownLine = text; $('line').textContent = text;
    const b = $('bubble'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  function setFace(mood) {
    const f = G.FACES[mood] || G.FACES.happy, eyes = $('eyes');
    eyes.setAttribute('d', f.eyes); eyes.classList.toggle('filled', f.eyesFilled);
    $('brows').setAttribute('d', f.brows); $('mouth').setAttribute('d', f.mouth); $('mouth').classList.toggle('filled', f.mouthFilled);
    const arm = $('armR'); arm.setAttribute('d', f.wave ? 'M133 30 q12 -5 15 -18' : 'M133 30 q11 7 12 19'); arm.classList.toggle('wave', f.wave);
    stage.dataset.mood = mood;
  }
  function staticText() {
    set('lblSession', t('w.session')); set('lblLeftIn', t('w.leftInGlass')); set('lblWeek', t('w.week'));
    set('lblNotSigned', t('w.notSigned')); set('lblSigninText', t('w.signinText')); set('btnSignIn', t('w.signinBtn'));
    set('btnPeek', t('w.peek')); set('btnPeekExit', t('w.peekExit')); set('btnKey', t('w.keyLink')); set('lblKey', t('w.keyLabel'));
    set('btnKeySave', t('w.keySave')); set('btnRefresh', t('w.refresh'));
    stage.setAttribute('aria-label', t('a.poke')); stage.title = t('a.poke');
  }
  function syncText(now) {
    const s = st;
    if (!s) return [t('sync.starting'), ''];
    if (s.demo) return [t('sync.demo'), 'warn'];
    if (s.preview) return [t('sync.preview'), 'warn'];
    if (s.status === 'signed-out' && !s.ccAt) return [t('sync.signedOut'), 'off'];
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
    const now = Date.now(), s = st, v = s && s.view, cfg = (s && s.settings) || {}, L = lang();
    const drink = TD.drink(cfg.drink);
    const preview = !!(s && s.preview);
    const signedOut = !!(s && s.status === 'signed-out') && !preview && !(v && v.hasData); // Rehatt: Claude Code's numbers count too
    const hasData = !!(v && v.hasData);
    if (drink.id !== lastDrink) {
      lastDrink = drink.id;
      for (const [k, val] of [['--tea', drink.tea], ['--tea2', drink.tea2], ['--foam', drink.foam], ['--foam2', drink.foam2]]) host.style.setProperty(k, val);
    }
    if (L !== lastLang) { lastLang = L; staticText(); shownLine = ''; }
    stage.classList.toggle('iced', drink.iced);
    const fest = s && s.festival ? s.festival.id : '';
    if ((stage.dataset.fest || '') !== fest) stage.dataset.fest = fest;
    stage.classList.toggle('hat', fest === 'raya' || fest === 'xmas');
    card.classList.toggle('signed-out', signedOut);
    $('numbers').hidden = signedOut; $('signin').hidden = !signedOut; $('btnPeekExit').hidden = !preview;
    $('week').hidden = signedOut;
    const sw = v && v.session, ww = v && v.weekly;
    const sPct = sw ? sw.pct : (hasData ? 0 : null), wPct = ww ? ww.pct : null;
    const sLeft = sPct === null ? null : Math.max(0, Math.round(100 - sPct));
    let tea = signedOut ? 0 : (sLeft === null ? 0 : sLeft * 0.88);
    if (holdTea !== null) tea = holdTea;
    if (tea !== lastTea) { $('tea').style.height = tea.toFixed(1) + '%'; $('bubbles').style.height = tea.toFixed(1) + '%'; lastTea = tea; }
    stage.classList.toggle('has-tea', tea > 0.5); stage.classList.toggle('pouring', pouring);
    const fc = (s && s.fc) || {}, worst = Math.max(sPct || 0, wPct || 0);
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
    set('sLeft', sLeft === null ? '--' : `${sLeft}%`);
    let sub = '';
    if (pouring) sub = t('w.refilling');
    else if (!hasData) sub = '';
    else if (!sw || sw.fresh || !sw.resetsAt) sub = t('w.freshGlass');
    else sub = (sw.pct >= 100 ? t('w.habis') : '') + t('w.nextIn', Object.assign({ t: F.countdown(sw.resetsAt - now, true, L) }, dv));
    set('sSub', sub);
    const pace = $('pace');
    if (hasData && !pouring && fc.session && sw && !sw.fresh) {
      pace.hidden = false; pace.classList.toggle('warn', fc.session.beforeReset);
      set('pace', fc.session.beforeReset ? t('w.paceOut', { when: F.at(fc.session.eta, now, L) }) : t('w.paceOk'));
    } else pace.hidden = true;
    const wLeft = wPct === null ? null : Math.max(0, Math.round(100 - wPct));
    set('wLeft', wLeft === null ? '--' : t('w.left', { p: wLeft }));
    for (let i = 0; i < 7; i++) { const fr = wLeft === null ? 0 : Math.max(0, Math.min(1, wLeft * 7 / 100 - i)); cups[i].svg.classList.toggle('awake', G.setCup(cups[i].parts, fr)); }
    let wsub = '';
    if (ww) {
      if (ww.fresh || !ww.resetsAt) wsub = t('w.fullPot');
      else { wsub = (ww.pct >= 100 ? t('w.allEmpty') : '') + t('w.freshPot', { when: F.when(ww.resetsAt, now, L) }); if (fc.weekly && fc.weekly.beforeReset && ww.pct < 100) wsub += ' · ' + t('w.weekPaceOut', { when: F.at(fc.weekly.eta, now, L) }); }
    }
    set('wSub', wsub);
    const models = (v && v.models || []).filter(m => m && m.pct !== null && m.pct !== undefined);
    $('models').hidden = !models.length;
    set('models', models.length ? t('w.also') + models.map(m => t('w.modelLeft', { name: m.name, p: Math.max(0, Math.round(100 - m.pct)) })).join(' · ') : '');
    const ex = v && v.extra;
    $('extra').hidden = !ex;
    set('extra', ex ? t('w.extra', { used: F.money(ex.used, ex.currency, L), limit: F.money(ex.limit, ex.currency, L) }) : '');
    const [stext, kind] = syncText(now), sy = $('sync');
    if (sy.textContent !== stext) sy.textContent = stext;
    sy.className = 'sync' + (kind ? ' ' + kind : '');
    $('btnRefresh').disabled = (signedOut || preview) && !(s && s.demo);
    const news = s && s.news && s.news.length ? s.news[0] : null;
    $('btnNews').hidden = !news;
    if (news) set('btnNews', t('w.whatsNew', { v: news }));
    const cb = $('combo'); if (combo >= 3) cb.textContent = `×${combo}`; else cb.classList.remove('on');
    tray(sLeft, signedOut || !hasData, drink);
  }
  function poke() {
    if (pouring) return;
    stage.classList.remove('jiggle'); void stage.offsetWidth; stage.classList.add('jiggle');
    clearTimeout(jiggleTimer); jiggleTimer = setTimeout(() => stage.classList.remove('jiggle'), 600);
    if (st && st.status === 'signed-out' && !st.preview && !(st.view && st.view.hasData)) return;
    const now = Date.now();
    pokes = pokes.filter(x => now - x < 4000); pokes.push(now);
    if (pokes.length >= 10) { pokes = []; combo = 0; pokeIdx = -1; say(t('line.showtime'), 4000); api.meterAction('start-show'); return; }
    combo = pokes.length; pokeIdx = (pokeIdx + 1) % 4; msg = null;
    const cb = $('combo'); if (combo >= 3) { cb.classList.remove('on'); void cb.offsetWidth; cb.classList.add('on'); }
    clearTimeout(comboTimer); comboTimer = setTimeout(() => { combo = 0; pokeIdx = -1; render(); }, 4000);
    render();
  }
  window.__rehattPokeGlass = poke;
  // the session refilled: a pulling mug pours a fresh drink into the glass
  function playTarik() {
    if (pouring) return;
    holdTea = lastTea; pouring = true; render();
    setTimeout(() => { holdTea = null; render(); }, 400);
    clearTimeout(pourTimer); pourTimer = setTimeout(() => { pouring = false; render(); }, 2700);
  }
  stage.addEventListener('click', () => { poke(); });
  host.addEventListener('mouseenter', () => api.meterAction('hover'));
  $('btnRefresh').addEventListener('click', () => api.meterAction('refresh'));
  $('btnNews').addEventListener('click', () => { api.meterAction('settings', { tab: 'about' }); api.meterAction('news-seen'); });
  $('btnSignIn').addEventListener('click', () => api.meterAction('sign-in'));
  $('btnPeek').addEventListener('click', () => api.meterAction('peek'));
  $('btnPeekExit').addEventListener('click', () => api.meterAction('peek-exit'));
  $('btnKey').addEventListener('click', () => { const f = $('keyForm'); f.hidden = !f.hidden; $('btnKey').setAttribute('aria-expanded', String(!f.hidden)); if (!f.hidden) $('keyInput').focus(); });
  $('keyForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('keyInput'); $('keyMsg').textContent = t('w.keyChecking');
    const r = await api.meterSessionKey(input.value); input.value = '';
    $('keyMsg').textContent = r && r.ok ? t('w.keyOk') : ((r && r.msg) || t('w.keyFail'));
  });

  // ---------- state ----------
  function update(next) { if (!next?.ok) return; st = next; render(); }
  api.onMeter(update);
  api.onTarik?.(() => { playTarik(); flashRefill(); });
  api.onShowOver?.(() => say(t('line.showOver'), 8000));
  api.meterGet().then(update).catch(() => {});
  setInterval(() => { if (st) render(); }, 1000);
  // alerts (80%, 95%, pace, fresh glass, a broken format): the island says them too
  api.onMeterAlert?.(a => {
    if (!a?.title) return;
    const tone = a.kind === 'fresh' ? 'done' : /95|habis|out|tamat/i.test(a.title) ? 'err' : 'us';
    window.__rehattDirector?.flash({ key: 'ttm:' + a.title, tone, ms: tone === 'err' ? 8000 : 5000, view: 'meter', text: a.title });
  });
  function flashRefill() { window.__rehattDirector?.flash({ key: 'ttm:refill:' + Date.now(), tone: 'done', ms: 3500, view: 'meter', text: t('line.fresh') }); }

  // what the Claude card, the ring and the director use
  const left = w => (w && w.pct != null ? Math.max(0, Math.min(100, Math.round(100 - w.pct))) : null);
  window.__rehattMeter = {
    status: () => { const l = left(st?.view?.session); return l == null ? '' : t('w.left', { p: l }); },
    usage: () => st?.view?.hasData ? {
      fiveHour: st.view.session ? { used: Math.round(st.view.session.pct), resetsAt: st.view.session.resetsAt ? Math.round(st.view.session.resetsAt / 1000) : null } : null,
      sevenDay: st.view.weekly ? { used: Math.round(st.view.weekly.pct), resetsAt: st.view.weekly.resetsAt ? Math.round(st.view.weekly.resetsAt / 1000) : null } : null } : null,
    state: () => st, poke
  };
  window.__rehattMeterLow = () => { const l = left(st?.view?.session); return l != null && l <= 5; };

  // ---------- the tray icon, when you chose "your glass" ----------
  let trayWant = 'kopi', trayKey = '';
  api.trayIconGet?.().then(k => { if (k) trayWant = k; }).catch(() => {});
  api.onTrayWant?.(k => { trayWant = k; trayKey = ''; render(); });
  function tray(sLeft, dim, drink) {
    if (trayWant !== 'glass') return;
    const key = `${dim ? 'x' : Math.round((sLeft || 0) / 5)}:${drink.id}`;
    if (key === trayKey) return;
    trayKey = key;
    try { api.trayImages?.('glass', G.trayIcons(sLeft === null ? 0 : sLeft, dim, drink, true)); } catch {}
  }

  // ---------- the home widget: a small glass in your drink ----------
  const colour = l => (l == null ? '#8f998d' : l <= 10 ? '#ff5c5c' : l <= 30 ? '#ffb35c' : '#c98a4b');
  let pokeAt = -1e9;
  function drawGlass(cx, bottom, h, l, face = true, c = ctx) {
    const w = h * 0.68, top = bottom - h, inset = w * 0.1, now = performance.now(), drink = TD.drink(st?.settings?.drink);
    const since = now - pokeAt, jig = since < 600 ? Math.sin(since / 40) * (1 - since / 600) * 0.08 : 0;
    const xl = y => cx - w / 2 + inset * (y - top) / h, xr = y => cx + w / 2 - inset * (y - top) / h;
    c.save(); c.translate(cx, bottom); c.rotate(jig); c.translate(-cx, -bottom);
    c.beginPath(); c.moveTo(xl(top), top); c.lineTo(xr(top), top); c.lineTo(xr(bottom), bottom); c.lineTo(xl(bottom), bottom); c.closePath();
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); c.save(); c.clip();
    if (l != null && l > 0) {
      const level = bottom - (h - 4) * l / 100, wave = Math.sin(now / 600) * 1.2;
      c.fillStyle = drink.tea; c.fillRect(cx - w, level + wave, w * 2, bottom - level);
      c.fillStyle = drink.foam; c.fillRect(cx - w, level + wave - 1, w * 2, Math.min(h * 0.09, bottom - level));
    }
    c.restore();
    c.beginPath(); c.moveTo(xl(top), top); c.lineTo(xr(top), top); c.lineTo(xr(bottom), bottom); c.lineTo(xl(bottom), bottom); c.closePath();
    c.lineWidth = Math.max(1.4, h / 40); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineJoin = 'round'; c.stroke();
    if (face) {
      const ey = top + h * 0.56, ex = w * 0.16, r = Math.max(1.4, h / 30), ink = '#2a1a10';
      c.fillStyle = ink; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * ex, ey, r, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = ink; c.lineWidth = Math.max(1.2, h / 45); c.lineCap = 'round'; c.beginPath();
      const my = ey + h * 0.1, mw = w * 0.12, curve = l == null ? 0 : l > 50 ? 1 : l > 20 ? 0.2 : -0.8;
      c.moveTo(cx - mw, my); c.quadraticCurveTo(cx, my + curve * h * 0.07, cx + mw, my); c.stroke();
    }
    c.restore();
  }
  window.__rehattDrawGlass = drawGlass;
  const resetLabel = ts => { if (!ts) return ''; return t('w.nextIn', { t: F.countdown(ts - Date.now(), false, lang()), drink: TD.drink(st?.settings?.drink).say, Drink: TD.drink(st?.settings?.drink).name }); };
  window.__rehattMeterWidget = (w, r, live) => {
    const v = st?.view, s = left(v?.session), k = left(v?.weekly), my = r.y + r.height / 2;
    const glassAt = (x, bottom, h) => { if (live) hit.meterGlass = { x: x - h * 0.4, y: bottom - h, width: h * 0.8, height: h }; };
    if (w.size === 'S') {
      drawGlass(r.x + 26, r.y + r.height - 10, r.height - 22, s); glassAt(r.x + 26, r.y + r.height - 10, r.height - 22);
      text(s == null ? T2('Penggunaan', 'Usage') : `${s}%`, r.x + 50, my - 1, s == null ? 13 : 15, '#fff', 700, 'left', r.width - 58);
      text(s == null ? T2('Menunggu Claude Code', 'Waiting for Claude Code') : T2('lagi · 5 jam', 'left · 5 hr'), r.x + 50, my + 14, 10.5, '#8f998d', 500, 'left', r.width - 58);
      return true;
    }
    const gh = Math.min(r.height - 18, w.size === 'L' ? 112 : 54), gx = r.x + 16 + gh * 0.34;
    drawGlass(gx, r.y + r.height - 9, gh, s); glassAt(gx, r.y + r.height - 9, gh);
    const tx = gx + gh * 0.34 + 14, tw = r.x + r.width - tx - 14;
    if (!v?.hasData) {
      text(T2('Penggunaan Claude', 'Claude usage'), tx, my - 4, 13, '#fff', 700, 'left', tw);
      text(T2('Guna Claude Code, atau log masuk ke claude.ai', 'Use Claude Code, or sign in to claude.ai'), tx, my + 12, 10.5, '#8f998d', 500, 'left', tw);
      return true;
    }
    const bar = (y, label, l, sub) => {
      text(label, tx, y, 11, '#c9d0c6', 600, 'left', tw * 0.6); text(l == null ? '—' : `${l}%`, tx + tw, y, 11, colour(l), 700, 'right');
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.roundRect(tx, y + 5, tw, 4, 2); ctx.fill();
      if (l != null) { ctx.fillStyle = colour(l); ctx.beginPath(); ctx.roundRect(tx, y + 5, Math.max(4, tw * l / 100), 4, 2); ctx.fill(); }
      ctx.restore(); if (sub) text(sub, tx, y + 21, 10, '#7d847f', 500, 'left', tw);
    };
    if (w.size === 'W') { bar(my - 8, T2('5 jam lagi', '5 hours left'), s); bar(my + 16, T2('Minggu ini', 'This week'), k); return true; }
    text(TD.drink(st?.settings?.drink).name, tx, r.y + 30, 15, '#fff', 700, 'left', tw);
    bar(r.y + 56, T2('5 jam lagi', '5 hours left'), s, resetLabel(v.session?.resetsAt));
    bar(r.y + 98, T2('Minggu ini', 'This week'), k, '');
    return true;
  };
  const T2 = (ms, en) => (lang() === 'ms' ? ms : en);
  // poking the glass on the home widget: it jiggles, and the 10-poke show works here too
  canvas.addEventListener('click', e => {
    if (mode !== 'expanded' || window.__kopiHomeEditing?.() || !inside(e.clientX, e.clientY, hit.meterGlass)) return;
    e.preventDefault(); e.stopImmediatePropagation(); pokeAt = performance.now(); poke();
  }, true);

  // ---------- page layout (pages-ui.js) ----------
  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) { if (currentView !== 'meter') return baseExpanded(alpha); drawHeader(alpha); };
  (function position() {
    const show = currentView === 'meter' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const display = show ? 'block' : 'none'; if (host.style.display !== display) host.style.display = display;
    if (show) window.__kopiPage.place(host, contentRect());
    requestAnimationFrame(position);
  })();
  canvas.addEventListener('click', e => {
    if (mode === 'expanded' && inside(e.clientX, e.clientY, hit.meterApp) && !window.__kopiHomeEditing?.()) {
      e.preventDefault(); e.stopImmediatePropagation(); setView('meter'); setMode('expanded');
    }
  }, true);
})();
