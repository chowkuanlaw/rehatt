(function windowMain() {
  const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain
  } = require('electron');

  const shortcut = 'CommandOrControl+Alt+K';
  const crashed = new Set();

  let recovering = false;

  const safe = value => String(value || '')
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)/g,
      '[hidden]'
    )
    .replace(/\bBearer\s+\S+/gi, 'Bearer [hidden]')
    .replace(
      /((?:access_token|refresh_token|api_key|authorization|code|state)\s*[=:]\s*)[^\s,;]+/gi,
      '$1[hidden]'
    );

  const log = (name, details = {}) =>
    console.log(
      '[Kopi Island window]',
      name,
      safe(JSON.stringify(details))
    );

  async function inspectUI(win, code) {
    let timer;

    try {
      return await Promise.race([
        win.webContents.executeJavaScript(code),

        new Promise((_resolve, reject) => {
          timer = setTimeout(
            () => reject(
              new Error('The drawing layer is not responding.')
            ),
            1500
          );
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  function nativeState(win) {
    if (win.isDestroyed()) {
      return { destroyed: true };
    }

    return {
      visible: win.isVisible(),
      minimized: win.isMinimized(),
      focused: win.isFocused(),
      top: win.isAlwaysOnTop(),
      bounds: win.getBounds()
    };
  }

  async function snapshot(win) {
    log('window-status', nativeState(win));

    if (
      win.isDestroyed() ||
      win.webContents.isDestroyed()
    ) {
      return;
    }

    try {
      const state = await inspectUI(
        win,
        'window.__kopiWindowDebug ' +
        '? window.__kopiWindowDebug.state() ' +
        ': ({ uiLoaded: false })'
      );

      log('ui-status', state);
    } catch (error) {
      log('ui-status-error', {
        message: error.message
      });
    }
  }

  app.on('browser-window-created', (_event, win) => {
    for (const name of [
      'show',
      'hide',
      'minimize',
      'restore',
      'focus',
      'blur',
      'close',
      'closed'
    ]) {
      win.on(name, () =>
        log(name, nativeState(win))
      );
    }

    win.webContents.on(
      'console-message',
      // Electron 44: everything is on the event object (the old extra arguments are deprecated)
      event => {
        const message = event.message;
        const level = event.level;

        if (
          level === 'error' ||
          level === 3 ||
          String(message).startsWith('[Kopi Island frame]')
        ) {
          log('renderer-error', {
            message: safe(message).slice(0, 1500)
          });
        }
      }
    );

    win.webContents.on('did-finish-load', () => {
      crashed.delete(win.webContents.id);
      snapshot(win).catch(() => {});
    });

    win.webContents.on(
      'before-input-event',
      (_event, input) => {
        if (
          input.type === 'keyDown' &&
          (
            input.key === 'Escape' ||
            input.key === 'PrintScreen' ||
            (
              input.meta &&
              input.shift &&
              String(input.key).toLowerCase() === 's'
            )
          )
        ) {
          log('key', {
            key: input.key,
            meta: input.meta,
            shift: input.shift
          });
        }
      }
    );
  });

  app.on(
    'render-process-gone',
    (_event, contents, details) => {
      crashed.add(contents.id);

      log('renderer-stopped', {
        reason: details.reason,
        exitCode: details.exitCode
      });
    }
  );

  app.on('child-process-gone', (_event, details) => {
    log('child-stopped', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode
    });
  });

  ipcMain.on('window:close', () =>
    log('close-request')
  );

  app.on('before-quit', () => {
    log('before-quit');
    globalShortcut.unregister(shortcut);
  });

  app.whenReady().then(() => {
    const registered = globalShortcut.register(
      shortcut,
      async () => {
        if (recovering) return;

        const win = BrowserWindow.getAllWindows()
          .find(item => !item.isDestroyed());

        if (!win) {
          log('no-window');
          return;
        }

        recovering = true;

        try {
          log('before-recovery', nativeState(win));

          if (win.isMinimized()) {
            win.restore();
          }

          win.showInactive();
          win.setAlwaysOnTop(true, 'floating');
          win.moveTop();

          if (crashed.has(win.webContents.id)) {
            log('renderer-reload');

            setTimeout(() => {
              if (!win.isDestroyed()) {
                win.webContents.reload();
              }
            }, 50);
          } else {
            await inspectUI(
              win,
              'window.__kopiWindowDebug && ' +
              'window.__kopiWindowDebug.restore()'
            );

            await snapshot(win);
          }
        } catch (error) {
          log('recovery-error', {
            message: error.message
          });
        } finally {
          recovering = false;
        }
      }
    );

    log('ready', {
      shortcut: 'Ctrl+Alt+K',
      registered
    });
  });
})();
