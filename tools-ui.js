'use strict';
// Small tools in the island: clipboard history ("Clipboard") and one quick note ("Note"),
// plus the keyboard shortcuts Ctrl+Alt+1..6. Layout comes from pages-ui.js (same as every page).
(function toolsPages() {
  const api = window.kopi;
  if (!api?.clipsGet) return;
  const root = document.createElement('section'); root.id = 'kopi-tools'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#kopi-tools{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto}
#kopi-tools *{box-sizing:border-box}
#kopi-tools .tl-head-btn{margin-top:10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:#151715;color:#c9d0c6;padding:6px 12px;font:600 11px "Segoe UI",sans-serif;cursor:pointer}
#kopi-tools .tl-head-btn:hover{background:#1e211e;color:#fff}
#kopi-tools .tl-list{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:calc(100% - 66px);overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent;padding-right:4px}
#kopi-tools .tl-clip{position:relative;text-align:left;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:#121412;color:#e8ece6;padding:10px 12px 10px;font:11px/1.45 "Cascadia Code",Consolas,monospace;cursor:pointer;white-space:pre-wrap;overflow:hidden;max-height:78px;transition:border-color .15s,background .15s,transform .1s}
#kopi-tools .tl-clip:hover{border-color:rgba(198,233,148,.45);background:#161a15}
#kopi-tools .tl-clip:active{transform:scale(.98)}
#kopi-tools .tl-clip::after{content:'';position:absolute;left:0;right:0;bottom:0;height:22px;background:linear-gradient(transparent,#121412)}
#kopi-tools .tl-clip.done{border-color:#c6e994}
#kopi-tools .tl-clip b{position:absolute;right:8px;top:7px;font:700 10px "Segoe UI",sans-serif;color:#c6e994;background:#1f2a18;border-radius:8px;padding:2px 7px;z-index:1}
#kopi-tools .tl-empty{height:calc(100% - 70px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#8f998d;border:1.5px dashed rgba(255,255,255,.1);border-radius:16px}
#kopi-tools .tl-empty strong{color:#f2f5ed;font-size:13px}
#kopi-tools textarea{width:100%;height:calc(100% - 70px);resize:none;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#101210;color:#f2f5ed;padding:14px 16px;font:13px/1.55 "Segoe UI Variable Text","Segoe UI",sans-serif;outline:none}
#kopi-tools textarea:focus{border-color:rgba(198,233,148,.4)}
#kopi-tools .tl-saved{color:#7f8a7a;font-size:10.5px;margin-top:10px}`;
  document.head.appendChild(style);
  const esc = s => String(s).replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));

  // ---- clipboard ----
  let clips = [], copied = -1, lastRender = '';
  const loadClips = () => api.clipsGet().then(r => { if (r.ok) { clips = r.clips; render(true); } }).catch(() => {});
  api.onClips?.(r => { clips = r.clips || []; render(true); });
  // ---- note ----
  let note = null, savedAt = 0, saveTimer = null;
  api.noteGet().then(r => { note = r.ok ? r.text : ''; render(true); }).catch(() => { note = ''; });

  function render(force) {
    const view = currentView, key = view + ':' + clips.length + ':' + copied + ':' + (note === null);
    if (!force && key === lastRender) return; lastRender = key;
    if (view === 'clips') {
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">Clipboard</p><p class="tc-page-sub">Your last copied text · click to copy it again</p></div>${clips.length ? '<button class="tl-head-btn" data-clear="1">Clear</button>' : ''}</div>${
        clips.length ? `<div class="tl-list">${clips.map((c, i) => `<button class="tl-clip ${i === copied ? 'done' : ''}" data-i="${i}">${i === copied ? `<b>${esc(window.__kopiTr?.('Copied ✓') ?? 'Copied ✓')}</b>` : ''}${esc(c.text)}</button>`).join('')}</div>`
          : '<div class="tl-empty"><strong>Nothing copied yet</strong><span>Copy something (Ctrl + C) and it shows up here.</span></div>'}`;
    } else if (view === 'note') {
      if (root.querySelector('textarea')) return; // don't rebuild while typing
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">Note</p><p class="tc-page-sub">Jot something down · saved automatically</p></div></div><textarea id="tl-note" placeholder="Type here…" maxlength="20000">${esc(note || '')}</textarea>`;
      const area = root.querySelector('textarea');
      area.addEventListener('focus', () => { projectInputFocused = true; sendInteractive(true); });
      area.addEventListener('blur', () => { projectInputFocused = false; });
      area.addEventListener('input', () => { note = area.value; clearTimeout(saveTimer); saveTimer = setTimeout(() => api.noteSet(note).then(() => { savedAt = Date.now(); }), 400); });
    }
  }
  root.addEventListener('click', e => {
    const clip = e.target.closest('[data-i]');
    if (clip) { api.clipsCopy(Number(clip.dataset.i)).then(r => { if (r.ok) { clips = r.clips; copied = 0; render(true); sound('click'); setTimeout(() => { copied = -1; render(true); }, 1400); } }); return; }
    if (e.target.closest('[data-clear]')) api.clipsClear().then(r => { if (r.ok) { clips = []; render(true); } });
  });

  // ---- placing the panel ----
  let shown = '';
  (function position() {
    const view = currentView, show = ['clips', 'note'].includes(view) && mode === 'expanded' && visual.width > 600 && visual.height > 220;
    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;
    if (show) {
      window.__kopiPage.place(root, contentRect());
      if (shown !== view) { shown = view; lastRender = ''; root.innerHTML = ''; if (view === 'clips') loadClips(); render(true); }
    } else shown = '';
    requestAnimationFrame(position);
  })();

  // ---- keyboard shortcuts (Ctrl+Alt+1..6) ----
  api.onShortcut?.(view => {
    if (view === 'claude') { window.__kopiMonitor?.open('claudecode'); return; }
    setView(view);
  });
  canvas.addEventListener('click', e => {
    for (const [key, view] of [['clipsApp', 'clips'], ['noteApp', 'note']]) if (inside(e.clientX, e.clientY, hit[key])) { e.preventDefault(); e.stopImmediatePropagation(); setView(view); return; }
  }, true);
  window.__kopiTools = { open: view => setView(view) };
})();
