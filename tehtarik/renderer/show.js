'use strict';
/*
 * The easter egg (poke the glass 10 times in 4 seconds): a full-screen show.
 * 1 s intro, 2 s joget, then your drink made start to finish in four steps, and a bow.
 * Each drink has its own recipe (TTData.RECIPES): teh tarik and kopi O are pulled,
 * teh ais gets ice, Milo ais is stirred and topped dinosaur style, sirap bandung swirls pink.
 * About 16 seconds, with a music-box chime made on the spot (no sound files).
 */
(function () {
  if (!window.ttm || window.ttm.view !== 'show') return;
  const G = window.TTGlass, I = window.TTI18n, D = window.TTData;
  let lang = 'en';
  const t = k => I.t(lang, k);
  const $ = id => document.getElementById(id);
  const show = $('show');
  show.hidden = false;
  document.body.style.background = '#1E1611';

  const PHASES = ['intro', 'dance', 's1', 's2', 's3', 's4', 'bow'];
  const ENDS = [1000, 3000, 5500, 7500, 12000, 14500, 16500];
  let drink = D.drink('tehtarik'), R = D.recipe('tehtarik');
  const capKey = phase => R.caps[PHASES.indexOf(phase)];
  const cap = phase => t('show.' + capKey(phase)).split('|');

  // Colours for the in-between moments of the glass recipes.
  const MILO_POWDER = '#5A3420', MILO_DARK = '#4E2C18', SYRUP = '#D63F6E', SYRUP_MILK = '#E36F95';
  const WATER = ['#DDEBF2', '#BFD8E6'], MILK = ['#FFF4DC', '#F3E6CB'], SYRUP_POUR = ['#C2335F', '#D84B76'];
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  function mix(c1, c2, k) {
    k = Math.max(0, Math.min(1, k));
    const a = hex(c1), b = hex(c2);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const ramp = (lt, from, to) => clamp01((lt - from) / (to - from));

  // Scenery.
  for (let j = 0; j < 16; j++) {
    const i = document.createElement('i');
    i.style.background = j % 2 === 0 ? '#2F8F83' : '#F3DEC0';
    i.style.animationDelay = `${((j % 4) * 0.15).toFixed(2)}s`;
    $('tiles').appendChild(i);
  }
  const colors = ['#E5436B', '#F3DEC0', '#2F8F83', '#C8874E', '#7EC8E3', '#F28CA3'];
  for (let j = 0; j < 24; j++) {
    const i = document.createElement('i');
    i.style.left = `${(j * 53) % 100}%`;
    i.style.width = `${8 + (j % 3) * 3}px`;
    i.style.height = `${10 + (j % 4) * 3}px`;
    i.style.background = colors[j % 6];
    i.style.animationDuration = `${(2.6 + (j % 5) * 0.4).toFixed(1)}s`;
    i.style.animationDelay = `${(-((j * 0.37) % 3)).toFixed(2)}s`;
    $('confetti').appendChild(i);
  }
  const mugA = $('mugA'), mugB = $('mugB');
  const foamA = G.drawMug(mugA.querySelector('svg')), foamB = G.drawMug(mugB.querySelector('svg'));
  let steps = [];

  // Fit the 560 x 660 stage to the screen.
  function fit() {
    const k = Math.min(window.innerWidth / 560, window.innerHeight / 680, 2);
    $('scaler').style.transform = `scale(${k.toFixed(3)})`;
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------- music ---------- */
  let ctx = null, master = null, muted = false;
  function startMusic() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.2;
      master.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.05;
      const bell = (time, f, len, vol) => {
        for (const [mul, g] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) {
          const o = ctx.createOscillator(), gn = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f * mul;
          gn.gain.setValueAtTime(0.0001, time);
          gn.gain.exponentialRampToValueAtTime(vol * g, time + 0.01);
          gn.gain.exponentialRampToValueAtTime(0.0001, time + len);
          o.connect(gn); gn.connect(master); o.start(time); o.stop(time + len + 0.05);
        }
      };
      const bass = (time, f) => {
        const o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        gn.gain.setValueAtTime(0.0001, time);
        gn.gain.exponentialRampToValueAtTime(0.35, time + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
        o.connect(gn); gn.connect(master); o.start(time); o.stop(time + 0.5);
      };
      const len = 0.5;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const whoosh = time => {
        const src = ctx.createBufferSource(); src.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(500, time); bp.frequency.exponentialRampToValueAtTime(2400, time + len);
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(0.0001, time);
        gn.gain.exponentialRampToValueAtTime(0.35, time + 0.12);
        gn.gain.exponentialRampToValueAtTime(0.0001, time + len);
        src.connect(bp); bp.connect(gn); gn.connect(master); src.start(time); src.stop(time + len);
      };
      // A spoon tapping the glass, and ice dropping in.
      const clink = (time, vol) => { bell(time, 2093, 0.22, vol); bell(time, 3136, 0.12, vol * 0.5); };
      const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };
      const melody = ['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'A5', 'G5', 'E5', null];
      const basses = [130.81, 98, 110, 98];
      for (let i = 0; i * 0.2 < 14.4; i++) {
        const time = t0 + i * 0.2, n = melody[i % 16];
        if (n) bell(time, N[n], 1.1, 0.5);
        if (i % 4 === 0) bass(time, basses[(i / 4) % 4]);
      }
      [3.0, 5.5, 7.5, 12.0].forEach(s => { bell(t0 + s, N.C6, 1.4, 0.6); bell(t0 + s + 0.08, N.E6, 1.4, 0.4); });
      const k3 = R.kinds[2], k4 = R.kinds[3];
      if (k3 === 'pull') [7.85, 9.35, 10.85].forEach(s => whoosh(t0 + s));
      if (k3 === 'stir') [0, 1.5, 3].forEach(p => [0.3, 0.55, 0.8, 1.05].forEach(s => clink(t0 + 7.5 + p + s, 0.32)));
      if (k4 === 'iceserve') [0.25, 0.5, 0.75].forEach(s => clink(t0 + 12 + s, 0.5));
      if (k4 === 'ice' || k4 === 'icetop') [0.55, 0.95, 1.35].forEach(s => clink(t0 + 12 + s, 0.5));
      if (k4 === 'icetop') ['G5', 'C6', 'E6', 'G6'].forEach((n, j) => bell(t0 + 13.6 + j * 0.06, N[n], 0.9, 0.4));
      ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, j) => bell(t0 + 14.5 + j * 0.09, N[n], 2.2, 0.55));
    } catch (e) { ctx = null; }
  }
  function setMuted(m) {
    muted = m;
    $('soundLabel').textContent = t(m ? 'show.soundOff' : 'show.soundOn');
    $('soundWaves').setAttribute('d', m ? 'M17 9l5 6M22 9l-5 6' : 'M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13');
    $('btnSound').setAttribute('aria-pressed', String(m));
    if (ctx && master) {
      try { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(m ? 0 : 0.2, t, 0.05); } catch (e) { /* ignore */ }
    }
  }
  function stopMusic() {
    if (!ctx) return;
    try { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.3); } catch (e) { /* ignore */ }
    const c = ctx; ctx = null;
    setTimeout(() => { try { c.close(); } catch (e) { /* ignore */ } }, 400);
  }

  /* ---------- the show ---------- */
  let t0 = 0, iv = 0, lastPhase = -1, lastCount = -1, lastPop = '', done = false;
  const PROPS = ['big', 'sock', 'can', 'small', 'spoon', 'kettle', 'bottle', 'stir'];
  // Where props sit when they work over the serving glass instead of the mugs.
  const AT_GLASS = { spoon: [90, 150], can: [176, 175] };
  const AT_MUG = { spoon: [10, 205], can: [100, 175] };

  function place(m, foamEl, o) {
    m.style.left = o.l + 'px';
    m.style.top = o.t + 'px';
    m.style.transform = `rotate(${o.r || 0}deg)`;
    m.className = 'mug' + (o.cls ? ' ' + o.cls : '');
    foamEl.setAttribute('ry', (o.foam || 0).toFixed(1));
    foamEl.setAttribute('opacity', o.foam > 0 ? '1' : '0');
  }
  function prop(id, on) {
    const n = $(id);
    if (on && !n.classList.contains('on')) n.classList.add('on');
    if (!on) n.classList.remove('on');
  }
  function popText(n, text) { n.textContent = text; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
  const toggle = (id, cls, on) => $(id).classList.toggle(cls, !!on);

  // The serving glass (110 x 182 at 125, 230; viewBox 0 -30 120 198): the pixel line where
  // the drink's surface is, so a pour stops right on it.
  const surface = fill => 230 + (158 - 128 * fill / 100 + 30) * 110 / 120;
  const RIM = 290;
  const grains = c => `repeating-linear-gradient(180deg, ${c} 0 4px, transparent 4px 10px)`;

  // One moment of one step: where the mugs are, what is pouring, which props are out,
  // and what is in the serving glass.
  function scene(kind, lt) {
    const tea = [drink.tea, drink.tea2];
    const sc = { a: { l: 70, t: 330, foam: 0 }, b: { l: 250, t: 330, foam: 0 }, stream: null, props: {}, at: {}, go: {}, glass: null, pop: '' };
    const park = () => { sc.a = { l: 0, t: 368, foam: 0 }; sc.b = { l: 296, t: 368, foam: 0 }; };
    // Pours stop at the rim (the stream would otherwise cross the glass's face).
    const pourTo = (l, t, w, c, fill, isGrains) => ({ l, t, w, h: Math.max(10, Math.min(surface(fill), RIM) - t), c, grains: isGrains });
    switch (kind) {
      case 'brew':
        sc.props.sock = true;
        if (lt > 500 && lt < 2300) sc.stream = { l: 99, t: 205, w: 6, h: 128, c: drink.id === 'kopio' ? ['#2A170C', '#3D2314'] : ['#6B3A1E', '#8A4E2A'] };
        break;
      case 'milk':
        sc.a.foam = 3;
        sc.props.can = true; sc.at.can = AT_MUG.can;
        if (lt > 500 && lt < 1800) sc.stream = { l: 102, t: 222, w: 8, h: 112, c: MILK };
        break;
      case 'sugar':
        sc.props.spoon = true; sc.at.spoon = AT_MUG.spoon; sc.heap = '#FFFFFF';
        if (lt > 500 && lt < 1700) { sc.go.spoon = true; sc.stream = { l: 96, t: 262, w: 6, h: 82, c: '#FFFFFF', grains: true }; }
        break;
      case 'pull': {
        const pull = Math.min(2, Math.floor(lt / 1500)), loc = lt - pull * 1500;
        const high = { l: 150, t: 40, r: -40 }, low = { l: 118, t: 330, r: 0 };
        const fh = 4 + pull * 3, fl = Math.min(12, fh + (loc > 350 ? Math.min(1, (loc - 350) / 1000) * 3 : 0));
        if (pull % 2 === 0) { sc.a = Object.assign({}, high, { foam: fh }); sc.b = Object.assign({}, low, { foam: fl }); }
        else { sc.b = Object.assign({}, high, { foam: fh }); sc.a = Object.assign({}, low, { foam: fl }); }
        if (loc > 350 && loc < 1350) sc.stream = { l: 148, t: 78, w: 7, h: 266, c: tea };
        sc.pop = `Tarik! ×${pull + 1}`;
        break;
      }
      case 'serve':
      case 'iceserve': {
        const ice = kind === 'iceserve';
        const from = ice ? 850 : 400, to = ice ? 2300 : 2100;
        sc.a = { l: 20, t: 330, foam: 6 };
        sc.b = { l: 176, t: 24, r: -40, foam: 12 };
        if (lt > from && lt < to) sc.stream = { l: 174, t: 62, w: 7, h: 228, c: tea };
        sc.props.small = true;
        sc.glass = { fill: ramp(lt, from, to) * 92, tea: drink.tea, foam: drink.foam,
          ice: ice ? [100, 350, 600].filter(x => lt > x).length : 0 };
        break;
      }
      case 'scoop': {
        park();
        const k = ramp(lt, 400, 1000) + ramp(lt, 1300, 1900), fill = k * 6;
        sc.props.small = true; sc.props.spoon = true; sc.at.spoon = AT_GLASS.spoon; sc.heap = '#7A4A2A';
        sc.glass = { fill, tea: MILO_POWDER };
        if ((lt > 400 && lt < 1000) || (lt > 1300 && lt < 1900)) { sc.go.spoon = true; sc.stream = pourTo(177, 207, 7, '#7A4A2A', fill, true); }
        sc.pop = lt > 1300 ? `${t('show.scoopPop')} ×2` : (lt > 400 ? `${t('show.scoopPop')} ×1` : '');
        break;
      }
      case 'water': {
        park();
        const k = ramp(lt, 300, 1750), fill = 12 + k * 68;
        sc.props.small = true; sc.props.kettle = true;
        sc.glass = { fill, tea: mix(MILO_POWDER, MILO_DARK, k) };
        if (lt > 300 && lt < 1800) sc.stream = pourTo(185, 200, 7, WATER, fill);
        break;
      }
      case 'stir': {
        park();
        const turn = Math.min(2, Math.floor(lt / 1500)), loc = lt - turn * 1500, k = ramp(lt, 0, 4300);
        const pink = drink.id === 'bandung';
        sc.props.small = true; sc.props.stir = true; sc.go.stir = loc > 150 && loc < 1300;
        sc.glass = { fill: 80, tea: mix(pink ? SYRUP_MILK : MILO_DARK, drink.tea, k),
          foam: lt > 2800 ? drink.foam : null, swirl: pink ? 1 - k : 0 };
        sc.pop = `${t('show.stirPop')} ×${turn + 1}`;
        break;
      }
      case 'syrup': {
        park();
        const k = ramp(lt, 400, 1900), fill = k * 40;
        sc.props.small = true; sc.props.bottle = true;
        sc.glass = { fill, tea: SYRUP };
        if (lt > 400 && lt < 1950) sc.stream = pourTo(182, 207, 7, SYRUP_POUR, fill);
        break;
      }
      case 'swirl': {
        park();
        const k = ramp(lt, 500, 1800), fill = 40 + k * 40;
        sc.props.small = true; sc.props.can = true; sc.at.can = AT_GLASS.can;
        sc.glass = { fill, tea: mix(SYRUP, SYRUP_MILK, k), swirl: ramp(lt, 500, 900) };
        if (lt > 500 && lt < 1850) sc.stream = pourTo(178, 222, 8, MILK, fill);
        break;
      }
      case 'ice':
      case 'icetop':
        park();
        sc.props.small = true;
        sc.glass = { fill: 80, tea: drink.tea, foam: drink.foam, ice: [500, 900, 1300].filter(x => lt > x).length,
          mound: kind === 'icetop' && lt > 1600 };
        if (kind === 'icetop' && lt > 1600) sc.pop = t('show.dino');
        break;
    }
    return sc;
  }

  function drawGlass(g) {
    const p = G.teaPolys(g ? g.fill : 0);
    const foamOn = g && g.foam;
    $('smallTea').setAttribute('points', p.tea);
    $('smallFoam').setAttribute('points', foamOn ? p.foam : '0,0 0,0 0,0');
    $('smallTea').style.fill = g && g.tea ? g.tea : '';
    $('smallFoam').style.fill = foamOn ? g.foam : '';
    $('swirl').setAttribute('opacity', g && g.swirl ? g.swirl.toFixed(2) : '0');
    for (let j = 0; j < 3; j++) toggle('ice' + j, 'in', g && g.ice > j);
    toggle('smallMound', 'on', g && g.mound);
  }

  function frame() {
    const now = Date.now() - t0;
    if (now >= ENDS[ENDS.length - 1]) { finish(); return; }
    let i = 0;
    while (i < PHASES.length - 1 && now >= ENDS[i]) i++;
    const phase = PHASES[i];
    const lt = now - (i === 0 ? 0 : ENDS[i - 1]);
    const step = i >= 2 && i <= 5 ? i - 2 : -1;

    if (i !== lastPhase) {
      lastPhase = i;
      const [c1, c2] = cap(phase);
      $('capTitle').textContent = c1;
      $('capSub').textContent = c2 || '';
      const capEl = $('caption').firstElementChild;
      capEl.classList.remove('pop'); void capEl.offsetWidth; capEl.classList.add('pop');
      show.classList.toggle('lights', phase === 'intro' || phase === 'dance' || phase === 'bow');
      show.classList.toggle('dancing', phase === 'dance');
      show.classList.toggle('party', phase === 'dance' || phase === 'bow');
      $('big').classList.toggle('dance', phase === 'dance');
      $('big').classList.toggle('bowing', phase === 'bow');
      toggle('bigMound', 'on', phase === 'bow' && R.kinds[3] === 'icetop');
      steps.forEach((st, j) => {
        const state = phase === 'bow' || (step >= 0 && j < step) ? 'done' : (j === step ? 'now' : '');
        st.s.className = state;
        st.s.textContent = (state === 'done' ? '✓ ' : '') + st.label;
      });
    }

    // Countdown during the joget.
    const count = phase === 'dance' ? Math.max(1, Math.ceil((ENDS[1] - now) / 1000)) : 0;
    if (count !== lastCount) { lastCount = count; if (count) popText($('count'), String(count)); else $('count').textContent = ''; }

    let sc;
    if (step >= 0) sc = scene(R.kinds[step], lt);
    else {
      sc = { a: { l: 12, t: 300, foam: 0, cls: 'dance' }, b: { l: 284, t: 300, foam: 0, cls: 'dance2' }, stream: null, props: {}, at: {}, go: {}, glass: null, pop: '' };
      if (phase === 'bow') { sc.a.foam = 10; sc.b.foam = 10; }
    }

    // Props.
    prop('big', step < 0);
    for (const id of PROPS) if (id !== 'big') prop(id, !!sc.props[id]);
    for (const id in sc.at) { $(id).style.left = sc.at[id][0] + 'px'; $(id).style.top = sc.at[id][1] + 'px'; }
    toggle('spoon', 'go', sc.go.spoon);
    toggle('stir', 'go', sc.go.stir);
    if (sc.heap) $('spoonHeap').style.fill = sc.heap;
    if (sc.glass) drawGlass(sc.glass);
    else if (!sc.props.small) drawGlass(null);

    // The pop-up word (Tarik! ×2, Kacau! ×3, Dinosaur!).
    if (sc.pop !== lastPop) { lastPop = sc.pop; if (sc.pop) popText($('tarikpop'), sc.pop); else $('tarikpop').textContent = ''; }

    place(mugA, foamA, sc.a);
    place(mugB, foamB, sc.b);
    const ss = $('sstream'), s = sc.stream;
    if (s) {
      const was = ss.classList.contains('on');
      const bg = s.grains ? grains(s.c) : `repeating-linear-gradient(180deg, ${s.c[0]} 0 10px, ${s.c[1]} 10px 20px)`;
      Object.assign(ss.style, { left: s.l + 'px', top: s.t + 'px', width: s.w + 'px', height: s.h + 'px', background: bg });
      if (!was) ss.classList.add('on');
    } else ss.classList.remove('on');
  }

  function finish() {
    if (done) return;
    done = true;
    clearInterval(iv);
    stopMusic();
    setTimeout(() => window.ttm.act('show-done'), 350);
  }

  $('btnSkip').addEventListener('click', finish);
  $('btnSound').addEventListener('click', () => { setMuted(!muted); window.ttm.act('mute', { value: muted }); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') finish(); });

  window.ttm.getState().then(s => {
    const set = (s && s.settings) || {};
    lang = set.lang || 'en';
    drink = D.drink(set.drink);
    R = D.recipe(drink.id);
    document.documentElement.lang = lang;
    show.style.setProperty('--stea', drink.tea);
    show.style.setProperty('--sfoam', drink.foam);
    show.classList.toggle('iced', !!drink.iced);
    show.classList.toggle('darkdrink', drink.id === 'kopio');
    $('stain') && ($('stain').style.fill = drink.id === 'kopio' ? '#3D2314' : '');
    steps = R.steps.map(label => {
      const el = document.createElement('span');
      el.textContent = label;
      $('steps').appendChild(el);
      return { s: el, label };
    });
    $('btnSkip').textContent = t('show.skip');
    setMuted(set.sound === false);
    t0 = Date.now();
    startMusic();
    frame();
    iv = setInterval(frame, 50);
  });
})();
