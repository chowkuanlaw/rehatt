'use strict';
// Focus page: choose hours, minutes and seconds, start, and watch the countdown.
// Timer logic lives in kopi-fun.js (window.__kopiFocus); layout comes from pages-ui.js.
(function focusPage() {
  const root = document.createElement('section'); root.id = 'kopi-focus'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#kopi-focus{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 Arial,sans-serif;pointer-events:auto;user-select:none}
#kopi-focus *{box-sizing:border-box}
#kopi-focus .fo-body{display:flex;align-items:center;gap:22px;height:calc(100% - 64px)}
#kopi-focus .fo-dials{display:flex;align-items:center;gap:6px}
#kopi-focus .fo-dial{display:flex;flex-direction:column;align-items:center;gap:2px;width:66px}
#kopi-focus .fo-dial b{font:700 36px/1 Arial,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-1px}
#kopi-focus .fo-dial small{color:#9aa596;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
#kopi-focus .fo-colon{font:700 30px/1 Arial,sans-serif;color:#5d6858;margin-bottom:22px}
#kopi-focus button{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#121512;color:#e8eee4;cursor:pointer;font:600 11px Arial,sans-serif}
#kopi-focus button:hover{background:#1d221d;border-color:rgba(255,255,255,.18)}
#kopi-focus .fo-arrow{width:44px;height:24px;padding:0;display:grid;place-items:center;background:transparent;border-color:transparent;color:#8f998d}
#kopi-focus .fo-arrow:hover{color:#fff;background:rgba(255,255,255,.06);border-color:transparent}
#kopi-focus .fo-dials{background:linear-gradient(180deg,#121612,#0c0f0c);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:6px 10px}
#kopi-focus .fo-presets button.on{background:rgba(255,179,92,.14);border-color:rgba(255,179,92,.5);color:#ffd28a}
#kopi-focus .fo-side{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
#kopi-focus .fo-presets{display:flex;gap:6px;flex-wrap:wrap}
#kopi-focus .fo-presets button{padding:7px 11px}
#kopi-focus .fo-start{padding:11px 16px;background:#c6e994;color:#11180d;border-color:#c6e994;font-size:13px}
#kopi-focus .fo-start:hover{background:#d4f6a5}
#kopi-focus .fo-big{font:700 54px/1 Arial,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-2px}
#kopi-focus .fo-track{height:6px;border-radius:4px;background:#232a22;overflow:hidden}
#kopi-focus .fo-fill{height:100%;background:#ffc93c;border-radius:4px;transition:width .5s linear}
#kopi-focus .fo-row{display:flex;gap:8px}
#kopi-focus .fo-row button{padding:9px 14px}
#kopi-focus .fo-running{gap:28px}
#kopi-focus .fo-ring{position:relative;width:150px;height:150px;flex:none}
#kopi-focus .fo-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
#kopi-focus .fo-ring circle{fill:none;stroke-width:7}
#kopi-focus .fo-ring-bg{stroke:rgba(255,255,255,.08)}
#kopi-focus .fo-ring-fill{stroke:#ffb35c;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:100;transition:stroke-dashoffset .6s linear}
#kopi-focus .fo-ring-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
#kopi-focus .fo-ring-text b{font-weight:700;font-size:30px;letter-spacing:-1px;font-variant-numeric:tabular-nums}
#kopi-focus .fo-ring-text small{color:#8f998d;font-size:11px}
#kopi-focus .fo-kicker{margin:0;display:flex;align-items:center;gap:7px;color:#ffd28a;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
#kopi-focus .fo-dot{width:7px;height:7px;border-radius:50%;background:#ffb35c;box-shadow:0 0 8px #ffb35c;animation:fo-pulse 1.6s ease-in-out infinite}
@keyframes fo-pulse{50%{opacity:.35}}
#kopi-focus .fo-end{margin:2px 0 0;font-size:22px;font-weight:700;color:#fff}
#kopi-focus .fo-note{margin:0 0 6px;color:#8f998d;font-size:11px}
#kopi-focus .fo-stop{color:#ffaba3 !important;border-color:rgba(255,120,110,.25) !important}
#kopi-focus .fo-stop:hover{background:rgba(255,90,80,.12) !important}`;
  document.head.appendChild(style);

  const F = () => window.__kopiFocus;
  let lastKey = '';
  const pad = n => String(n).padStart(2, '0');
  function render() {
    const f = F(); if (!f) return;
    const running = f.active();
    const key = running ? 'run' : 'idle:' + f.chosen();
    if (key === lastKey) return update(); // only rebuild when something changed
    lastKey = key;
    const sec = f.chosen(), h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    const dial = (unit, value, label) => `<div class="fo-dial"><button type="button" class="fo-arrow" data-add="${unit}" aria-label="${label} more"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg></button><b>${pad(value)}</b><small>${label}</small><button type="button" class="fo-arrow" data-add="${-unit}" aria-label="${label} less"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button></div>`;
    root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">Focus</p><p class="tc-page-sub">${running ? 'You are focusing. Rehatt keeps the time.' : 'Choose how long you want to focus'}</p></div></div>${
      running
        ? `<div class="fo-body fo-running"><div class="fo-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="fo-ring-bg"/><circle cx="60" cy="60" r="52" class="fo-ring-fill" id="fo-ring" pathLength="100"/></svg><div class="fo-ring-text"><b id="fo-left">${f.label()}</b><small id="fo-total"></small></div></div>
           <div class="fo-side"><p class="fo-kicker"><span class="fo-dot"></span>Focus running</p><p class="fo-end" id="fo-end"></p><p class="fo-note">Music and Claude stay visible in the small island.</p>
           <div class="fo-row"><button type="button" data-plus="300">+5 min</button><button type="button" data-plus="900">+15 min</button><button type="button" class="fo-stop" data-stop="1">Stop</button></div></div></div>`
        : `<div class="fo-body"><div class="fo-dials" id="fo-dials">${dial(3600, h, 'Hours')}<span class="fo-colon">:</span>${dial(60, m, 'Minutes')}<span class="fo-colon">:</span>${dial(1, s, 'Seconds')}</div>
           <div class="fo-side"><div class="fo-presets">${[[15 * 60, '15 min'], [25 * 60, '25 min'], [45 * 60, '45 min'], [3600, '1 hour']].map(([v, l]) => `<button type="button" data-set="${v}"${v === sec ? ' class="on""' : ''}>${l}</button>`).join('')}</div>
           <button type="button" class="fo-start" data-start="1">Start focus</button></div></div>`
    }`;
    update();
  }
  function update() {
    const f = F(); if (!f?.active()) return;
    const left = root.querySelector('#fo-left'), fill = root.querySelector('#fo-fill');
    if (left) left.textContent = f.label();
    if (fill) fill.style.width = `${100 * (1 - f.left() / f.length())}%`;
    // The ring is full at the start and runs empty as time passes.
    const ring = root.querySelector('#fo-ring'), end = root.querySelector('#fo-end'), total = root.querySelector('#fo-total');
    if (ring) ring.style.strokeDashoffset = String(100 * (1 - f.left() / f.length()));
    if (end) end.textContent = (window.__kopiPrefs?.().lang === 'ms' ? 'Siap pada ' : 'Done at ') + new Date(Date.now() + f.left()).toLocaleTimeString(window.__kopiPrefs?.().lang === 'ms' ? 'ms-MY' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    if (total) total.textContent = (window.__kopiPrefs?.().lang === 'ms' ? 'daripada ' : 'of ') + Math.round(f.length() / 60000) + ' min';
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('button'), f = F(); if (!b || !f) return;
    if (b.dataset.add) f.choose(f.chosen() + Number(b.dataset.add));
    if (b.dataset.set) f.choose(Number(b.dataset.set));
    if (b.dataset.start) f.start();
    if (b.dataset.plus) f.add(Number(b.dataset.plus));
    if (b.dataset.stop) f.stop();
    sound('click'); lastKey = ''; render();
  });
  // Scroll on a number to change it quickly.
  root.addEventListener('wheel', e => {
    const dial = e.target.closest('.fo-dial'), f = F(); if (!dial || !f) return;
    e.preventDefault(); const unit = Math.abs(Number(dial.querySelector('[data-add]').dataset.add));
    f.choose(f.chosen() + (e.deltaY < 0 ? unit : -unit)); lastKey = ''; render();
  }, { passive: false });

  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) { if (currentView !== 'focus') return baseExpanded(alpha); drawHeader(alpha); };
  let shown = false;
  (function position() {
    const show = currentView === 'focus' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;
    if (show) { window.__kopiPage.place(root, contentRect()); if (!shown) lastKey = ''; render(); }
    shown = show;
    requestAnimationFrame(position);
  })();
})();
