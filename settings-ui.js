// The island's own Settings page (General and Kopi). The Rehatt Settings app shows these same lists in its own
// window (settings-bridge-ui.js); the options themselves come from kopi-fun.js.
(function settingsUI() {
  'use strict';

  if (document.getElementById('kopi-settings-v2')) return;

  UI.SETTINGS_H = 300;

  const api = window.kopi;
  const root = document.createElement('div');

  root.id = 'kopi-settings-v2';

  root.innerHTML = `
    <div class="tc-settings-shell">
      <div class="tc-page-head">
        <div>
          <p class="tc-page-title">Settings</p>
          <p class="tc-page-sub">Make Rehatt all yours</p>
        </div>
        <div class="tc-tabs" role="tablist">
          <button type="button" role="tab" data-tab="general">General</button>
          <button type="button" role="tab" data-tab="character">Character</button>
        </div>
      </div>

      <div id="tc-settings-content"
           class="tc-settings-content"></div>
    </div>
  `;

  document.body.appendChild(root);

  const content = root.querySelector('#tc-settings-content');
  const style = document.createElement('style');

  style.textContent = `
    #kopi-settings-v2 {
      position:absolute;
      z-index:60;
      display:none;
      color:#edf2ea;
      font-family:Arial,sans-serif;
      pointer-events:auto;
      overflow:hidden;
    }

    #kopi-settings-v2 * {
      box-sizing:border-box;
    }

    #kopi-settings-v2 button,
    #kopi-settings-v2 input,
    #kopi-settings-v2 select {
      font:inherit;
    }

    #kopi-settings-v2 button {
      cursor:pointer;
    }

    #kopi-settings-v2 button:disabled {
      cursor:default;
      opacity:.6;
    }

    #kopi-settings-v2 button:focus-visible,
    #kopi-settings-v2 input:focus-visible,
    #kopi-settings-v2 select:focus-visible {
      outline:2px solid #c6e994;
      outline-offset:2px;
    }

    #kopi-settings-v2 .tc-settings-shell {
      height:100%;
      display:flex;
      flex-direction:column;
      min-height:0;
    }

    #kopi-settings-v2 .tc-settings-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      min-height:38px;
      gap:8px;
      margin-bottom:7px;
      font-size:15px;
    }

    #kopi-settings-v2 .tc-settings-tabs {
      display:flex;
      gap:3px;
      padding:3px;
      border-radius:17px;
      background:#151915;
    }

    #kopi-settings-v2 .tc-settings-tabs button {
      border:0;
      border-radius:14px;
      background:transparent;
      color:#aeb8a9;
      padding:7px 12px;
      font-size:10px;
    }

    #kopi-settings-v2 .tc-settings-tabs .active {
      background:#2a3227;
      color:#f2f5ef;
    }

    #kopi-settings-v2 .tc-tabs{display:flex;gap:2px;padding:3px;margin-top:8px;border-radius:12px;background:#111411;border:1px solid rgba(255,255,255,.07);flex:none}
    #kopi-settings-v2 .tc-tabs button{border:0;background:transparent;color:#9aa596;padding:6px 14px;border-radius:9px;font-size:11px;font-weight:600;transition:background .15s,color .15s}
    #kopi-settings-v2 .tc-tabs button:hover{color:#fff}
    #kopi-settings-v2 .tc-tabs button.active{background:#262d24;color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.06) inset}
    #kopi-settings-v2 .tc-settings-content.tc-locker-mode{overflow:hidden;padding:0}
    #kopi-settings-v2 .tc-locker{display:flex;gap:16px;height:100%}
    #kopi-settings-v2 .tc-locker-stage{width:172px;flex:none;border-radius:18px;border:1px solid rgba(255,255,255,.07);pointer-events:none;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px;padding:0 8px 12px;text-align:center}
    #kopi-settings-v2 .tc-locker-stage b{font-size:13px;font-weight:700;color:#fff}
    #kopi-settings-v2 .tc-locker-stage small{font-size:10px;color:#8f998d}
    #kopi-settings-v2 .tc-locker-list{flex:1;min-width:0;overflow-y:auto;padding:1px 5px 8px 1px;scrollbar-width:thin;scrollbar-color:#3e4938 transparent}
    #kopi-settings-v2 .tc-locker-list .tc-group:first-child{margin-top:0}
    #kopi-settings-v2 .tc-setting-row{cursor:pointer;user-select:none}
    #kopi-settings-v2 .tc-setting-row input{user-select:text;cursor:text}
    /* Headers stay in view while you scroll; rows with many choices put them under the text. */
    #kopi-settings-v2 .tc-locker-list .tc-group,#kopi-settings-v2 .tc-settings-content .tc-group{position:sticky;top:0;z-index:2;background:#000;margin:0 !important;padding:10px 2px 6px}
    #kopi-settings-v2 .tc-locker-list .tc-setting-row:has(.tc-chips .tc-chip:nth-child(3)){flex-direction:column;align-items:flex-start;gap:9px}
    #kopi-settings-v2 .tc-locker-list .tc-setting-row:has(.tc-chips .tc-chip:nth-child(3)) .tc-chips{justify-content:flex-start;max-width:none}
    #kopi-settings-v2 .tc-setting-row + .tc-setting-row{margin-top:8px}
    #kopi-settings-v2 .tc-locker-stage b{font-size:15px;letter-spacing:-.2px}
    #kopi-settings-v2 .tc-setting-row:active{transform:scale(.99)}
    #kopi-settings-v2 .tc-demo:hover{border-color:rgba(198,233,148,.3) !important}

    #kopi-settings-v2 .tc-settings-content {
      flex:1;
      min-height:0;
      overflow-y:auto;
      overscroll-behavior:contain;
      padding:1px 5px 8px 1px;
      scrollbar-width:thin;
      scrollbar-color:#3e4938 transparent;
      font-size:11px;
    }

    #kopi-settings-v2 .tc-setting-row {
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:12px;
      margin-bottom:8px;
      border-radius:13px;
      background:#141a13;
    }

    #kopi-settings-v2 .tc-setting-row small {
      display:block;
      margin-top:4px;
      color:#b1bba9;
      font-size:9px;
    }

    #kopi-settings-v2 .tc-toggle {
      border:0;
      border-radius:13px;
      padding:6px 11px;
      background:#30392b;
      color:#eff4ea;
      font-size:10px;
    }

    #kopi-settings-v2 .tc-toggle.on {
      background:#c6e994;
      color:#11180d;
    }

    #kopi-settings-v2 details {
      margin-top:10px;
      color:#b9c4b2;
      font-size:10px;
    }

    #kopi-settings-v2 summary {
      cursor:pointer;
    }
  `;

  document.head.appendChild(style);

  // Two tabs: General (the island) and Character (a locker with Kopi himself).
  let tab =
    localStorage.getItem('kopi:settings-tab') === 'character' ? 'character' : 'general';

  let visible = false;
  let error = '';
  let notice = '';

  const escape = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
    );

  const sleepRow = () => `<div class="tc-setting-row tc-demo" data-demo="sleep"><div><strong>Sleep effect</strong><small>He falls asleep when nothing happens for a while</small></div><button type="button" data-action="sleep" class="tc-toggle ${sleepEnabled ? 'on' : ''}" aria-pressed="${sleepEnabled}">${sleepEnabled ? 'On' : 'Off'}</button></div>`;
  // The settings app (settings-app.html) shows these same lists in its own window (settings-bridge-ui.js).
  window.__kopiSettingsHtml = which => which === 'character' ? window.__kopiSettingsCharacter?.(sleepRow()) || '' : window.__kopiSettingsExtra?.() || '';
  // Picking an option rebuilds the list: keep it scrolled exactly where you were.
  let renderedTab = null;
  function render() {
    const oldScroller = root.querySelector('.tc-locker-list') || content, keepTop = oldScroller.scrollTop, sameTab = renderedTab === tab;
    renderSettings();
    const scroller = root.querySelector('.tc-locker-list') || content;
    scroller.style.scrollBehavior = 'auto'; scroller.scrollTop = sameTab ? keepTop : 0; scroller.style.scrollBehavior = '';
    renderedTab = tab;
    if (!sameTab) { content.classList.remove('tc-fresh'); void content.offsetWidth; content.classList.add('tc-fresh'); setTimeout(() => content.classList.remove('tc-fresh'), 900); }
  }
  function renderSettings() {
    for (const element of root.querySelectorAll('[data-tab]')) {
      element.classList.toggle(
        'active',
        element.dataset.tab === tab
      );

      element.setAttribute(
        'aria-selected',
        String(element.dataset.tab === tab)
      );
    }

    content.classList.toggle('tc-locker-mode', tab === 'character');
    if (tab === 'character') {
      const info = window.__kopiLocker?.() || { done: 0, badges: 0, total: 0 };
      content.innerHTML = `<div class="tc-locker"><div class="tc-locker-stage" id="tc-locker-stage"><b>${escape(info.name || 'Kopi')}</b><small>${info.done} tasks done · ${info.badges}/${info.total} badges</small></div><div class="tc-locker-list">${window.__kopiSettingsCharacter?.(sleepRow()) || ''}</div></div>`;
    } else if (tab === 'general') {
      // Sound volume is set with the speaker slider in the header (icons-ui.js). Sleep lives in the Character tab.
      content.innerHTML = `        ${window.__kopiSettingsExtra?.() || ''}
      `;
    } else {
      content.innerHTML = '';
    }

    if (error) {
      content.innerHTML += `
        <p class="tc-ai-error" role="alert">
          ${escape(error)}
        </p>
      `;
    }

    if (notice) {
      content.innerHTML += `
        <p class="tc-ai-notice" role="status">
          ${escape(notice)}
        </p>
      `;
    }
  }

  // Enter in the name field saves it.
  root.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.id === 'tc-in-petname') { event.preventDefault(); root.querySelector('[data-setname]')?.click(); }
  });

  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    // A block (setting row) with an example: clicking anywhere on it shows it on Kopi.
    // Only the On/Off button itself changes the setting.
    const block = event.target.closest('.tc-setting-row');
    if (block?.dataset.demo) window.__kopiDemo?.(block.dataset.demo);

    if (!target || target.disabled) return;

    if (target.dataset.tab) {
      tab = target.dataset.tab;

      localStorage.setItem(
        'kopi:settings-tab',
        tab
      );

      render();
      return;
    }

    // Extra options from kopi-fun.js (colours, speed, timer, ...).
    if (window.__kopiSettingsAction?.(target)) {
      if (soundEnabled) sound('click');
      render();
      return;
    }

    const name = target.dataset.action;

    if (name === 'sound' || name === 'sleep') {
      if (name === 'sound') {
        soundEnabled = !soundEnabled;
      } else {
        sleepEnabled = !sleepEnabled;
      }

      const enabled =
        name === 'sound' ? soundEnabled : sleepEnabled;

      localStorage.setItem(
        `kopi:${name}`,
        enabled ? 'on' : 'off'
      );

      if (name === 'sound' && enabled) {
        sound('click');
      }

      render();
      return;
    }

  });

  // Only a text field counts as "typing" (keeps the island open and clickable). A clicked button used to
  // count too, and because the list is rebuilt after every click, that state could get stuck.
  const typingHere = () => root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  root.addEventListener('focusin', () => {
    projectInputFocused = typingHere();
    if (projectInputFocused) sendInteractive(true);
  });

  root.addEventListener('focusout', () => {
    setTimeout(() => { projectInputFocused = typingHere(); }, 0);
  });

  window.addEventListener('kopi:open-ai-settings', () => {
    // Keep the tab you were on, just refresh it (render keeps the scroll position).

    localStorage.setItem(
      'kopi:settings-tab',
      tab
    );

    render();
  });

  // General: no Kopi. Character: Kopi stands in his locker on a lit-up stage (drawn on the canvas
  // behind the see-through stage box), so every colour or outfit you pick shows on him right away.
  drawSettings = () => {
    if (tab !== 'character') return;
    const stage = root.querySelector('#tc-locker-stage'); if (!stage) return;
    const r = stage.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2 - 4;
    ctx.save(); ctx.beginPath(); ctx.roundRect(r.left, r.top, r.width, r.height, 18); ctx.clip();
    const bg = ctx.createLinearGradient(0, r.top, 0, r.bottom); bg.addColorStop(0, '#161b16'); bg.addColorStop(1, '#0b0d0b');
    ctx.fillStyle = bg; ctx.fillRect(r.left, r.top, r.width, r.height);
    const glow = window.__kopiLook?.().eye || '#c6e994';
    const spot = ctx.createRadialGradient(cx, r.top - 10, 4, cx, r.top - 10, r.height * 0.95);
    spot.addColorStop(0, 'rgba(255,255,255,.16)'); spot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spot; ctx.beginPath(); ctx.moveTo(cx - 18, r.top); ctx.lineTo(cx + 18, r.top); ctx.lineTo(cx + 70, cy + 44); ctx.lineTo(cx - 70, cy + 44); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.35; ctx.fillStyle = glow; ctx.filter = 'blur(10px)'; ctx.beginPath(); ctx.ellipse(cx, cy + 46, 46, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.ellipse(cx, cy + 44, 38, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    window.__kopiLockerDraw = true; // his own look here, not Claude's traffic-light eyes
    try { drawGhost(cx, cy, 92); } finally { window.__kopiLockerDraw = false; }
    hit.ghost = { x: cx - 50, y: cy - 46, width: 100, height: 92 }; // click him to poke him
  };
  function loop() {
    const area = contentRect();

    const show =
      currentView === 'settings' &&
      mode === 'expanded' &&
      area.width > 180 &&
      area.height > 50;

    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;

    if (show) {
      window.__kopiPage.place(root, area);

      root.style.opacity = String(
        Math.max(
          0,
          Math.min(1, (visual.width - 360) / 240)
        )
      );

      if (!visible) {
        render();
      }
    } else if (visible) {
      if (root.contains(document.activeElement)) {
        document.activeElement.blur();
      }

      projectInputFocused = false;
    }

    visible = show;

    requestAnimationFrame(loop);
  }

  // ---- fresh look: grouped cards (like phone settings), real switches, icons per group, little animations ----
  const look = document.createElement('style');
  look.textContent = `
    #kopi-settings-v2 .tc-group{display:flex !important;align-items:center;gap:9px;font-size:11px !important;font-weight:700 !important;letter-spacing:.04em !important;text-transform:none !important;color:#e9eee6 !important;padding:14px 2px 8px !important}
    #kopi-settings-v2 .tc-group[data-icon]::before{content:attr(data-icon);display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;font-size:12px;background:color-mix(in srgb,var(--g,#3a3f3a) 30%,#0c0e0c);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--g,#fff) 35%,transparent)}
    #kopi-settings-v2 .tc-setting-row{margin:0 !important;border-radius:0 !important;background:#121512 !important;border:0 !important;border-bottom:1px solid rgba(255,255,255,.055) !important;padding:12px 14px !important;transition:background .15s}
    #kopi-settings-v2 .tc-setting-row:hover{background:#171b17 !important}
    #kopi-settings-v2 .tc-group + .tc-setting-row{border-radius:16px 16px 0 0 !important}
    #kopi-settings-v2 .tc-setting-row:has(+ .tc-group),#kopi-settings-v2 .tc-setting-row:has(+ :not(.tc-setting-row)),#kopi-settings-v2 .tc-setting-row:last-child{border-radius:0 0 16px 16px !important;border-bottom:0 !important}
    #kopi-settings-v2 .tc-group + .tc-setting-row:has(+ .tc-group),#kopi-settings-v2 .tc-group + .tc-setting-row:has(+ :not(.tc-setting-row)),#kopi-settings-v2 .tc-group + .tc-setting-row:last-child{border-radius:16px !important}
    #kopi-settings-v2 .tc-setting-row strong{font-size:12.5px !important;font-weight:600 !important;color:#f4f7f2}
    #kopi-settings-v2 .tc-setting-row small{font-size:10px !important;color:#8f998d !important;margin-top:3px !important}
    /* real switches */
    #kopi-settings-v2 .tc-toggle[data-toggle],#kopi-settings-v2 .tc-toggle[data-action="sleep"]{position:relative;flex:none;width:46px;height:28px;padding:0 !important;border-radius:14px !important;font-size:0 !important;color:transparent !important;background:#3a3f3a !important;border:0 !important;transition:background .2s}
    #kopi-settings-v2 .tc-toggle[data-toggle]::after,#kopi-settings-v2 .tc-toggle[data-action="sleep"]::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:transform .25s cubic-bezier(.3,1.5,.5,1)}
    #kopi-settings-v2 .tc-toggle[data-toggle].on,#kopi-settings-v2 .tc-toggle[data-action="sleep"].on{background:#8fd65a !important}
    #kopi-settings-v2 .tc-toggle[data-toggle].on::after,#kopi-settings-v2 .tc-toggle[data-action="sleep"].on::after{transform:translateX(18px)}
    /* choice chips */
    #kopi-settings-v2 .tc-chip{border-radius:999px !important;background:#1d211d !important;border:1px solid rgba(255,255,255,.08) !important;color:#dfe5db !important;transition:transform .12s,background .15s}
    #kopi-settings-v2 .tc-chip:hover{background:#262b25 !important}
    #kopi-settings-v2 .tc-chip.on{background:#c6e994 !important;color:#10180c !important;border-color:transparent !important;animation:tcPop .3s cubic-bezier(.3,1.6,.5,1)}
    @keyframes tcPop{0%{transform:scale(.85)}100%{transform:scale(1)}}
    /* tabs */
    #kopi-settings-v2 .tc-tabs{padding:4px !important;border-radius:14px !important}
    #kopi-settings-v2 .tc-tabs button{padding:7px 16px !important;border-radius:10px !important;font-size:11.5px !important}
    #kopi-settings-v2 .tc-tabs button.active{background:#c6e994 !important;color:#10180c !important}
    /* rows slide in one by one when you open a tab */
    #kopi-settings-v2 .tc-fresh .tc-setting-row,#kopi-settings-v2 .tc-fresh .tc-group{animation:tcIn .38s cubic-bezier(.2,.8,.2,1) both}
    ${Array.from({ length: 16 }, (_, i) => `#kopi-settings-v2 .tc-fresh :is(.tc-setting-row,.tc-group):nth-child(${i + 1}){animation-delay:${i * 0.025}s}`).join(' ')}
    @keyframes tcIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  `;
  document.head.appendChild(look);

  render();
  requestAnimationFrame(loop);
})();
