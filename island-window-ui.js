// The island's window: a small read-only state report for debugging (window.__kopiWindowDebug).
// (It used to reopen the last page whenever the window got focus again. That fought the island director:
// a click on a quick button gave the window focus, reopened a page, and the click was lost. Where the island
// opens is now decided in one place, director-ui.js.)
(function windowUI() {
  const time = () => performance.now();
  function state() {
    return {
      view: typeof currentView === 'undefined' ? null : currentView,
      mode: typeof mode === 'undefined' ? null : mode,
      hidden: document.hidden,
      focused: document.hasFocus(),
      frameAgeMs: typeof lastFrame === 'undefined' ? null : Math.round(time() - lastFrame)
    };
  }
  window.__kopiWindowDebug = Object.freeze({ state, restore: state }); // restore: kept for island-window-main.js recovery, now only reports
})();
