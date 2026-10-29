'use strict';
// One layout for every big page (Apps, Settings, Claude Code, Stretch, Usage, Tray, Focus), so everything lines up:
// the title and a grey subtitle always at the same height, the content always starting on the same line.
// Kopi only appears where he does something (Tray: catching files). The other UI files use window.__kopiPage.
(function pageLayout() {
  const PAGES = ['apps', 'settings', 'monitor', 'tray', 'mirror', 'focus', 'clips', 'note', 'stretch', 'meter'];
  const PAGE = {
    height: 300,
    contentX: 24,   // left edge of titles and content: Rehatt only appears on pages where he does something
    titleY: 24,     // title baseline
    subtitleY: 44,  // subtitle baseline
    bodyY: 62,      // where content starts
    ghost: { x: 46, y: 58, size: 60 },
    isPage: view => PAGES.includes(view),
    // Rehatt in its standard spot (moved, e.g. while catching a file, when a position is given).
    drawGhost(area, at) {
      const x = at?.x ?? area.x + PAGE.ghost.x, y = at?.y ?? area.y + PAGE.ghost.y;
      drawGhost(x, y, PAGE.ghost.size);
      hit.ghost = { x: x - 40, y: y - 36, width: 80, height: 72 };
      return { x, y };
    },
    // Title + subtitle drawn on the canvas (for canvas pages).
    title(area, title, subtitle, right) {
      const x = area.x + PAGE.contentX, width = area.width - PAGE.contentX - (right || 0);
      text(title, x, area.y + PAGE.titleY, 18, '#ffffff', 700, 'left', width);
      if (subtitle) text(subtitle, x, area.y + PAGE.subtitleY, 11, '#9aa596', 400, 'left', width);
    },
    // Position a DOM panel (Settings, Claude Code, Tray, Mirror) on the content column.
    place(el, area) {
      el.style.left = `${area.x + PAGE.contentX}px`; el.style.top = `${area.y}px`;
      el.style.width = `${Math.max(100, area.width - PAGE.contentX * 2)}px`; // same margin left and right
      el.style.height = `${area.height}px`; // fixed height, so long pages (Settings) scroll
    }
  };
  window.__kopiPage = PAGE;

  const baseHeight = targetHeight;
  targetHeight = function () { return PAGE.isPage(currentView) ? PAGE.height : baseHeight(); };

  // Smooth page changes: canvas pages fade in, DOM pages fade + slide in.
  let lastView = null, changedAt = 0;
  const ROOTS = ['kopi-ai-monitor', 'kopi-settings-v2', 'kopi-extras', 'kopi-focus', 'kopi-tools', 'rehatt-stretch', 'rehatt-meter'];
  (function watch() {
    if (currentView !== lastView) {
      lastView = currentView; changedAt = performance.now();
      for (const id of ROOTS) { const el = document.getElementById(id); if (el) { el.classList.remove('tc-enter'); void el.offsetWidth; el.classList.add('tc-enter'); } }
    }
    requestAnimationFrame(watch);
  })();
  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) {
    baseExpanded(alpha);
    const k = Math.min(1, (performance.now() - changedAt) / 220);
    if (k < 1) { const a = contentRect(); ctx.save(); ctx.fillStyle = `rgba(0,0,0,${(1 - k) * (1 - k)})`; ctx.fillRect(a.x - 4, a.y - 4, a.width + 8, a.height + 8); ctx.restore(); }
  };

  // Shared look for the DOM pages' title and subtitle.
  const style = document.createElement('style');
  style.textContent = `
.tc-page-title{font:700 18px/24px Arial,sans-serif;color:#fff;margin:6px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-page-sub{font:400 11px/16px Arial,sans-serif;color:#9aa596;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-page-head{display:flex;align-items:flex-start;gap:10px;height:${PAGE.bodyY - 6}px;flex:none}
.tc-page-head > div{flex:1;min-width:0}
/* Same Windows 11 font in every panel */
#kopi-ai-monitor,#kopi-ai-monitor *,#kopi-settings-v2,#kopi-settings-v2 *,#kopi-extras,#kopi-extras *,#kopi-focus,#kopi-focus *,#kopi-tools,#kopi-tools *:not(.tl-clip){font-family:"Segoe UI Variable Text","Segoe UI",sans-serif !important}
.tc-page-title{font-family:"Segoe UI Variable Display","Segoe UI",sans-serif !important;letter-spacing:-.2px}
.tc-enter{animation:tc-enter .24s cubic-bezier(.2,.8,.2,1)}
@keyframes tc-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
/* Calmer, more refined settings rows and buttons */
#kopi-settings-v2 .tc-setting-row{background:#0f120f;border:1px solid rgba(255,255,255,.06);border-radius:14px;transition:border-color .15s,background .15s}
#kopi-settings-v2 .tc-setting-row:hover{border-color:rgba(255,255,255,.12);background:#121612}
#kopi-settings-v2 .tc-setting-row strong{font-size:12px;font-weight:600}
#kopi-settings-v2 .tc-group{color:#9aa596 !important;letter-spacing:.08em !important;font-size:10px !important}
#kopi-settings-v2 .tc-toggle,#kopi-settings-v2 .tc-chip{border:1px solid rgba(255,255,255,.08) !important;transition:background .15s,transform .1s}
#kopi-settings-v2 .tc-toggle:active,#kopi-settings-v2 .tc-chip:active{transform:scale(.96)}
#kopi-settings-v2 .tc-settings-content{scroll-behavior:smooth}
/* Buttons in panels */
#kopi-ai-monitor button,#kopi-extras button,#kopi-focus button{transition:background .15s,border-color .15s,transform .1s}
#kopi-ai-monitor button:active,#kopi-extras button:active,#kopi-focus button:active{transform:scale(.96)}`;
  document.head.appendChild(style);
})();
