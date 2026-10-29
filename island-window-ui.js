(function windowUI() {
  let away = false;
  let savedView = null;
  let captureUntil = 0;

  const time = () => performance.now();

  const protectedView = () =>
    typeof currentView !== 'undefined' &&
    typeof mode !== 'undefined' &&
    mode === 'expanded' &&
    ['settings', 'monitor', 'stretch'].includes(currentView);

  function state() {
    return {
      view:
        typeof currentView === 'undefined'
          ? null
          : currentView,

      mode:
        typeof mode === 'undefined'
          ? null
          : mode,

      hidden: document.hidden,
      focused: document.hasFocus(),

      frameAgeMs:
        typeof lastFrame === 'undefined'
          ? null
          : Math.round(time() - lastFrame),

      projectDisplay:
        document.getElementById(
          'kopi-project-v2'
        )?.style.display,

      settingsDisplay:
        document.getElementById(
          'kopi-settings-v2'
        )?.style.display
    };
  }

  function restore() {
    if (savedView) {
      currentView = savedView;
    }

    if (typeof setMode === 'function') {
      setMode('expanded', false);
    }

    return state();
  }

  window.addEventListener('blur', () => {
    if (!away) {
      savedView = protectedView()
        ? currentView
        : null;
    }

    away = true;
  });

  window.addEventListener('focus', () => {
    const returning =
      away && savedView != null;

    away = false;

    if (savedView && mode !== 'expanded') {
      restore();
    }

    savedView = null;

    captureUntil =
      returning || time() < captureUntil
        ? time() + 1000
        : 0;
  });

  window.addEventListener(
    'keydown',
    event => {
      if (
        event.metaKey &&
        event.shiftKey &&
        event.key.toLowerCase() === 's'
      ) {
        if (protectedView()) {
          savedView = currentView;
        }

        captureUntil = time() + 15000;
      }

      if (
        event.key === 'Escape' &&
        protectedView() &&
        (away || time() < captureUntil)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.__kopiWindowDebug = Object.freeze({
    state,
    restore
  });
})();
