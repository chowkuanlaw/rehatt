'use strict';
/* The app window: first-launch welcome, settings (General, Look, Claude), History and About. */
(function () {
  if (!window.ttm || window.ttm.view !== 'app') return;
  const F = window.TTFormat, G = window.TTGlass, D = window.TTData, I = window.TTI18n;
  const root = document.getElementById('app');
  root.hidden = false;
  document.body.classList.add('appview');

  let st = null, hist = null, histAt = 0;
  let tab = ['general', 'look', 'claude', 'history', 'about'].includes(window.ttm.tab) ? window.ttm.tab : 'general';
  let welcome = window.ttm.welcome, step = 0, lastKey = '';
  const lang = () => (st && st.settings && st.settings.lang) || 'en';
  const t = (k, v) => I.t(lang(), k, v);
  const act = (type, p) => window.ttm.act(type, p);
  const setv = (key, value) => act('set', { key, value });

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  }
  function svgEl(tag, attrs, parent) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }
  function glassPic(cls, left) { const s = svgEl('svg', { class: cls, 'aria-hidden': 'true' }); return G.miniGlass(s, left); }

  function row(title, sub, control, note) {
    return h('div', { class: 'setrow' },
      h('div', { class: 'txt' }, h('div', { class: 'ttl', text: title }), sub ? h('div', { class: 'sub', text: sub }) : null, note ? h('div', { class: 'note', text: note }) : null),
      control);
  }
  function toggle(key, title, sub, note) {
    const id = 'sw-' + key;
    const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch', id, 'aria-label': title, onchange: e => setv(key, e.target.checked) });
    input.checked = !!st.settings[key];
    return row(title, sub, input, note);
  }
  function seg(key, options, labelText) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': labelText },
      options.map(([v, text]) => h('button', { type: 'button', 'aria-pressed': String(st.settings[key] === v), onclick: () => setv(key, v), text })));
  }

  /* ---------- pages ---------- */
  function pageGeneral() {
    const s = st.settings;
    return [
      h('h1', { text: t('s.tab.general') }),
      h('div', { class: 'panel' },
        toggle('onTop', t('s.onTop')),
        toggle('hideFull', t('s.hideFull'), t('s.hideFullSub')),
        st.store ? row(t('s.autostart'), t('s.autostartStore'), h('span')) : toggle('autostart', t('s.autostart')),
        toggle('shortcut', t('s.shortcut'), null, s.shortcut && st.shortcutTaken ? t('s.shortcutTaken') : null)),
      h('h2', { text: t('s.alertsHead') }),
      h('div', { class: 'panel' },
        toggle('alerts', t('s.alerts')),
        toggle('paceAlert', t('s.paceAlert')),
        toggle('freshAlert', t('s.freshAlert')))
    ];
  }

  function pageLook() {
    const drinks = h('div', { class: 'drinks', role: 'group', 'aria-label': t('s.drink') },
      D.DRINKS.map(d => {
        const b = h('button', { type: 'button', class: 'drinkbtn', 'aria-pressed': String(st.settings.drink === d.id), onclick: () => setv('drink', d.id) });
        const pic = glassPic('', 70);
        pic.style.setProperty('--tea', d.tea); pic.style.setProperty('--foam', d.foam);
        b.append(pic, h('span', { text: d.name }));
        return b;
      }));
    return [
      h('h1', { text: t('s.tab.look') }),
      h('div', { class: 'panel' },
        row(t('s.drink'), null, h('span')),
        drinks,
        row(t('s.theme'), null, seg('theme', [['system', t('s.theme.system')], ['light', t('s.theme.light')], ['dark', t('s.theme.dark')]], t('s.theme'))),
        row(t('s.lang'), null, seg('lang', I.LANGS.map(l => [l.id, l.name]), t('s.lang'))),
        row(t('s.text'), null, seg('textSize', [['normal', t('s.text.normal')], ['large', t('s.text.large')], ['larger', t('s.text.larger')]], t('s.text'))),
        toggle('compact', t('s.compact'), t('s.compactSub')),
        toggle('festive', t('s.festive'), t('s.festiveSub')),
        toggle('sound', t('s.sound')))
    ];
  }

  function pageClaude() {
    const signed = st.status !== 'signed-out';
    const orgs = st.orgs || [];
    let orgPick = null;
    if (signed && orgs.length > 1) {
      const sel = h('select', { class: 'pick', 'aria-label': t('s.org'), onchange: e => act('org', { id: e.target.value }) },
        orgs.map(o => h('option', { value: o.id, text: o.name })));
      sel.value = orgs.some(o => o.id === st.orgId) ? st.orgId : orgs[0].id;
      orgPick = row(t('s.org'), t('s.orgSub'), sel);
    }
    return [
      h('h1', { text: t('s.tab.claude') }),
      h('div', { class: 'panel' },
        row(t('s.account'), signed ? t('s.signedIn') : t('s.notSigned'),
          signed ? h('button', { class: 'btn', type: 'button', onclick: () => act('sign-out'), text: t('s.signOut') })
            : h('button', { class: 'btn primary', type: 'button', onclick: () => act('sign-in'), text: t('s.signIn') })),
        orgPick,
        row(t('s.cc'), st.cc ? t('s.ccOn') + (st.ccAt ? ' ' + t('s.ccLast', { ago: F.ago(Date.now() - st.ccAt, lang()) }) : '') : t('s.ccOff'),
          st.cc ? h('button', { class: 'btn', type: 'button', onclick: () => act('cc-disconnect'), text: t('s.ccDisconnect') })
            : h('button', { class: 'btn primary', type: 'button', onclick: () => act('cc-connect'), text: t('s.ccConnect') })),
        row(t('s.openUsage'), null, h('button', { class: 'btn', type: 'button', onclick: () => act('open-usage'), text: 'claude.ai' })))
    ];
  }

  // A line chart of usage (0-100%) over time.
  function chart(points, from, to, cls, ticks) {
    const W = 560, Hh = 190, L = 34, R = 10, T = 10, B = 26;
    const x = tm => L + (W - L - R) * Math.max(0, Math.min(1, (tm - from) / (to - from)));
    const y = p => T + (Hh - T - B) * (1 - p / 100);
    const s = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${Hh}`, role: 'img' });
    for (const p of [0, 50, 100]) {
      svgEl('line', { x1: L, x2: W - R, y1: y(p), y2: y(p), class: 'axis' }, s);
      svgEl('text', { x: L - 6, y: y(p) + 4, 'text-anchor': 'end', class: 'lbl' }, s).textContent = p + '%';
    }
    for (const [tm, text] of ticks) svgEl('text', { x: x(tm), y: Hh - 6, 'text-anchor': 'middle', class: 'lbl' }, s).textContent = text;
    if (points.length) {
      // A session drops back to 0 at each reset; draw each run separately.
      const runs = [];
      let cur = [];
      for (const p of points) { if (cur.length && p[1] < cur[cur.length - 1][1] - 5) { runs.push(cur); cur = []; } cur.push(p); }
      runs.push(cur);
      for (const r of runs) {
        const d = r.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
        if (cls !== 'wk') svgEl('path', { d: `${d} L${x(r[r.length - 1][0]).toFixed(1)} ${y(0)} L${x(r[0][0]).toFixed(1)} ${y(0)} Z`, class: 'area' }, s);
        svgEl('path', { d, class: 'ln ' + (cls || '') }, s);
      }
      const last = points[points.length - 1];
      svgEl('circle', { cx: x(last[0]), cy: y(last[1]), r: 4, class: 'dot' }, s);
    }
    return s;
  }

  function pageHistory() {
    const out = [h('h1', { text: t('s.tab.history') })];
    if (st.preview) out.push(h('p', { class: 'small histnote', text: t('s.histSample') }));
    if (!hist) { out.push(h('p', { class: 'small muted', text: '...' })); return out; }
    const L = lang();
    const dayEnd = hist.from + 86400e3;
    const hours = [0, 6, 12, 18, 24].map(hh => [hist.from + hh * 3600e3, hh === 24 ? '' : F.clock(hist.from + hh * 3600e3, L)]);
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = hist.now - i * 86400e3; days.push([d, new Date(d).toLocaleDateString(L === 'ms' ? 'ms-MY' : 'en-US', { weekday: 'short' })]); }
    const peak = hist.session.reduce((m, p) => Math.max(m, p[1]), 0);
    out.push(h('h2', { text: t('s.histToday') }));
    out.push(h('div', { class: 'panel' },
      hist.session.length ? chart(hist.session, hist.from, dayEnd, '', hours) : h('p', { class: 'small muted', text: t('s.histEmpty') }),
      hist.session.length ? h('p', { class: 'small muted', text: t('s.histPeak', { p: Math.round(peak) }) }) : null));
    out.push(h('h2', { text: t('s.histWeek') }));
    out.push(h('div', { class: 'panel' },
      hist.week.length ? chart(hist.week, hist.now - 7 * 86400e3, hist.now, 'wk', days) : h('p', { class: 'small muted', text: t('s.histEmpty') })));
    return out;
  }

  function pageAbout() {
    const out = [h('h1', { text: t('s.tab.about') }), h('p', { class: 'small', text: t('s.version', { v: st.version }) })];
    const upd = h('div', { class: 'btnrow' });
    if (st.store) upd.append(h('span', { class: 'small muted', text: t('s.storeUpd') }));
    else if (st.update && st.update.state === 'ready') upd.append(h('button', { class: 'btn primary', type: 'button', onclick: () => act('install-update'), text: t('s.restart', { v: st.update.version }) }));
    else if (st.installed) upd.append(h('button', { class: 'btn', type: 'button', disabled: st.checking, onclick: () => act('check-update'), text: t('s.check') }));
    else upd.append(h('span', { class: 'small muted', text: t('s.portable') }));
    out.push(upd);
    out.push(h('h2', { text: t('s.news') }));
    const panel = h('div', { class: 'panel' });
    for (const n of D.NEWS) panel.append(h('div', { class: 'newsv', text: n.v }), h('ul', { class: 'newslist' }, n.keys.map(k => h('li', { text: t(k) }))));
    out.push(panel);
    out.push(h('div', { class: 'btnrow' },
      h('button', { class: 'btn', type: 'button', onclick: () => act('welcome-again'), text: t('s.welcomeAgain') }),
      h('button', { class: 'btn', type: 'button', onclick: () => act('open-link', { which: 'privacy' }), text: t('s.privacy') }),
      h('button', { class: 'btn', type: 'button', onclick: () => act('open-link', { which: 'repo' }), text: 'GitHub' })));
    out.push(h('p', { class: 'small muted', text: t('s.saved') }));
    out.push(h('p', { class: 'small muted legal', text: t('s.legal') }), h('p', { class: 'small muted legal', text: t('s.legalMilo') }));
    return out;
  }

  /* ---------- welcome ---------- */
  function pageWelcome() {
    const steps = ['hello', 'signin', 'cc', 'done'];
    const k = steps[step];
    const box = h('div', { class: 'welcome' });
    const signed = st.status !== 'signed-out' && st.view && st.view.hasData;
    box.append(glassPic('hero', k === 'done' ? 90 : (k === 'signin' && !signed ? 15 : 65)));
    box.append(h('div', { class: 'dots', 'aria-hidden': 'true' }, steps.map((_, i) => h('i', { class: i === step ? 'on' : '' }))));
    if (k === 'hello') {
      box.append(h('h1', { text: t('wel.hello') }), h('p', { text: t('wel.helloBody') }),
        seg('lang', I.LANGS.map(l => [l.id, l.name]), t('s.lang')),
        h('div', { class: 'drinks', role: 'group', 'aria-label': t('s.drink') }, D.DRINKS.map(d => {
          const b = h('button', { type: 'button', class: 'drinkbtn', 'aria-pressed': String(st.settings.drink === d.id), onclick: () => setv('drink', d.id) });
          const pic = glassPic('', 70); pic.style.setProperty('--tea', d.tea); pic.style.setProperty('--foam', d.foam);
          b.append(pic, h('span', { text: d.name }));
          return b;
        })));
    } else if (k === 'signin') {
      box.append(h('h1', { text: t('wel.signin') }), h('p', { text: t('wel.signinBody') }),
        signed ? h('div', { class: 'ok', text: t('wel.signedIn') }) : h('button', { class: 'btn primary', type: 'button', onclick: () => act('sign-in'), text: t('w.signinBtn') }));
    } else if (k === 'cc') {
      box.append(h('h1', { text: t('wel.cc') }), h('p', { text: t('wel.ccBody') }),
        st.cc ? h('div', { class: 'ok', text: t('wel.ccDone') }) : h('button', { class: 'btn primary', type: 'button', onclick: () => act('cc-connect'), text: t('s.ccConnect') }));
    } else {
      box.append(h('h1', { text: t('wel.done') }), h('p', { text: t('wel.doneBody') }));
    }
    const nav = h('div', { class: 'wnav' });
    if (step > 0) nav.append(h('button', { class: 'btn', type: 'button', onclick: () => { step--; draw(true); }, text: t('wel.back') }));
    if (k === 'signin' && !signed) nav.append(h('button', { class: 'btn', type: 'button', onclick: () => { step++; draw(true); }, text: t('wel.skip') }));
    else if (k === 'cc' && !st.cc) nav.append(h('button', { class: 'btn', type: 'button', onclick: () => { step++; draw(true); }, text: t('wel.skip') }));
    else if (k === 'done') nav.append(h('button', { class: 'btn primary', type: 'button', onclick: () => act('welcome-done'), text: t('wel.finish') }));
    else nav.append(h('button', { class: 'btn primary', type: 'button', onclick: () => { step++; draw(true); }, text: t('wel.next') }));
    box.append(nav);
    return [box];
  }

  /* ---------- drawing ---------- */
  function nav() {
    const logo = h('div', { class: 'logo' }, glassPic('', 70), h('span', { text: 'Teh Tarik Meter' }));
    const tabs = ['general', 'look', 'claude', 'history', 'about'].map(id =>
      h('button', { class: 'navbtn', type: 'button', 'aria-current': tab === id ? 'page' : null, onclick: () => { tab = id; if (id === 'history') loadHistory(); draw(true); }, text: t('s.tab.' + id) }));
    return h('nav', { class: 'side-nav', 'aria-label': t('s.title') }, logo, tabs);
  }

  function key() {
    if (!st) return '';
    return JSON.stringify([tab, welcome, step, st.settings, st.dark, st.status, st.preview, st.cc, st.orgs, st.orgId, st.update, st.checking, st.shortcutTaken,
      !!(st.view && st.view.hasData), welcome ? 0 : Math.floor((st.ccAt || 0) / 60e3), histAt]);
  }

  function draw(force) {
    if (!st) return;
    const k = key();
    if (!force && k === lastKey) return;
    lastKey = k;
    document.body.classList.toggle('dark', !!st.dark);
    G.applyDrink(D.drink(st.settings.drink));
    document.documentElement.lang = lang();
    document.title = 'Teh Tarik Meter';
    const scroller = document.scrollingElement;
    const y = scroller ? scroller.scrollTop : 0;
    root.replaceChildren();
    if (welcome) root.append(...pageWelcome());
    else {
      const content = h('div', { class: 'content' });
      const page = { general: pageGeneral, look: pageLook, claude: pageClaude, history: pageHistory, about: pageAbout }[tab]();
      content.append(...page.filter(Boolean));
      root.append(nav(), content);
    }
    if (scroller) scroller.scrollTop = y;
  }

  async function loadHistory() {
    try { hist = await window.ttm.getHistory(); histAt = Date.now(); } catch (e) { hist = null; }
    draw();
  }

  window.ttm.onState(s => {
    const was = st && st.preview;
    st = s;
    if (!!s.preview !== !!was && tab === 'history') loadHistory(); // sample history in, or out
    draw();
  });
  window.ttm.getState().then(s => {
    st = s;
    if (tab === 'about' && !welcome) act('news-seen');
    if (tab === 'history') loadHistory();
    draw(true);
  });
  setInterval(() => { if (tab === 'history' && !welcome) loadHistory(); }, 60e3);
})();
