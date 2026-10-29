(function preloadBridge() {
  'use strict';

  const { contextBridge, ipcRenderer, webUtils } = require('electron');

  function subscribe(channel, callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, data) => callback(data);

    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
  }

  contextBridge.exposeInMainWorld('kopi', {
    // Claude Code and Codex (agents-main.cjs): question and done nudges, and "jump to terminal"
    aiMonitorGet: () => ipcRenderer.invoke('ai-monitor:get'),
    aiMonitorHooksInstall: agent => ipcRenderer.invoke('ai-monitor:hooks-install', { agent }),
    aiMonitorHooksUninstall: agent => ipcRenderer.invoke('ai-monitor:hooks-uninstall', { agent }),
    aiMonitorHooksJump: sessionId => ipcRenderer.invoke('ai-monitor:hooks-jump', { sessionId }),
    aiMonitorHooksTest: (kind, command) => ipcRenderer.invoke('ai-monitor:hooks-test', { kind, command }),
    aiMonitorSetNotify: enabled => ipcRenderer.invoke('ai-monitor:set-notify', { enabled }),
    aiMonitorHooksSeen: () => ipcRenderer.invoke('ai-monitor:hooks-seen'),
    onAiMonitorState: callback => subscribe('ai-monitor:state', callback),
    onAiMonitorOpen: callback => subscribe('ai-monitor:open', callback),

    // Stretch breaks: Lapis Stretch inside Rehatt (lapis/engine.cjs). Actions with Lapis's own names; a few
    // old island names are mapped (water → water-drank, waterLater → water-later).
    stretchGet: () => ipcRenderer.invoke('lapis:get-state'),
    stretchAction: (action, value) => {
      const type = { water: 'water-drank', waterLater: 'water-later' }[action] || String(action);
      const payload = action === 'set' ? { key: value?.key, value: value?.value }
        : action === 'pause' || action === 'test' ? { kind: value }
        : action === 'now' ? { start: true, ...(value && typeof value === 'object' ? value : {}) }
        : value && typeof value === 'object' ? value : {};
      ipcRenderer.send('lapis:action', { ...payload, type });
      return ipcRenderer.invoke('lapis:get-state');
    },
    lapisAct: (type, payload) => ipcRenderer.send('lapis:action', { ...(payload || {}), type: String(type) }),
    onStretch: callback => subscribe('lapis:state', callback),
    onLapisChime: callback => subscribe('lapis:chime', callback),

    // Your Claude usage: Teh Tarik Meter inside Rehatt (tehtarik/engine.cjs)
    meterGet: () => ipcRenderer.invoke('ttm:get-state'),
    meterAction: (type, payload) => ipcRenderer.send('ttm:action', { ...(payload || {}), type: String(type) }),
    meterHistory: () => ipcRenderer.invoke('ttm:get-history'),
    meterSessionKey: value => ipcRenderer.invoke('ttm:session-key', String(value || '')),
    onMeter: callback => subscribe('ttm:state', callback),
    onTarik: callback => subscribe('ttm:tarik', callback),
    onShowOver: callback => subscribe('ttm:show-over', callback),
    onMeterAlert: callback => subscribe('ttm:alert', callback),

    // Rehatt itself: updates, one language for everything, the tray icon
    updateGet: () => ipcRenderer.invoke('rehatt:update-get'),
    updateAct: what => ipcRenderer.send('rehatt:update', String(what)),
    onUpdate: callback => subscribe('rehatt:update', callback),
    setLang: lang => ipcRenderer.send('rehatt:lang', String(lang)),
    onLang: callback => subscribe('rehatt:lang', callback),
    trayIconGet: () => ipcRenderer.invoke('rehatt:tray-icon'),
    onTrayWant: callback => subscribe('rehatt:tray-want', callback),
    trayImages: (kind, images) => ipcRenderer.send('rehatt:tray-images', String(kind), images),

    // Extras: file tray, calendar, weather, volume, Bluetooth battery
    pathForFile: file => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
    trayGet: () => ipcRenderer.invoke('extras:tray-get'),
    trayAdd: paths => ipcRenderer.invoke('extras:tray-add', { paths }),
    trayRemove: filePath => ipcRenderer.invoke('extras:tray-remove', { path: filePath }),
    trayOpen: filePath => ipcRenderer.invoke('extras:tray-open', { path: filePath }),
    trayDrag: filePath => ipcRenderer.send('extras:tray-drag', filePath),
    extrasConfig: config => ipcRenderer.invoke('extras:config', config),
    calendarNext: () => ipcRenderer.invoke('extras:calendar'),
    weatherNow: () => ipcRenderer.invoke('extras:weather'),
    onVolume: callback => subscribe('extras:volume', callback),
    clipsGet: () => ipcRenderer.invoke('extras:clips-get'),
    clipsCopy: index => ipcRenderer.invoke('extras:clips-copy', { index }),
    clipsClear: () => ipcRenderer.invoke('extras:clips-clear'),
    onClips: callback => subscribe('extras:clips', callback),
    noteGet: () => ipcRenderer.invoke('extras:note-get'),
    noteSet: text => ipcRenderer.invoke('extras:note-set', { text }),
    onShortcut: callback => subscribe('extras:shortcut', callback),
    onBluetooth: callback => subscribe('extras:bluetooth', callback),

    // The island window (main.js): catching the mouse, its place on the screen, dragging it
    setIslandInteractive: interactive => ipcRenderer.send('island:set-interactive', interactive),
    islandPlaceGet: () => ipcRenderer.invoke('island:place-get'),
    launchInfo: () => ipcRenderer.invoke('app:launch'),
    islandPlaceSet: mode => ipcRenderer.send('island:place-set', mode), // 'free' | 'top' | 'reset'
    onIslandPlace: callback => subscribe('island:place', callback),
    islandSize: (width, height) => ipcRenderer.send('island:size', { width, height }),
    islandDrag: on => ipcRenderer.send('island:drag', Boolean(on)),
    // start with Windows and restart (tray-main.cjs)
    loginGet: () => ipcRenderer.invoke('app:login-get'),
    loginSet: on => ipcRenderer.invoke('app:login-set', Boolean(on)),
    restart: () => ipcRenderer.send('app:restart'),
    openUrl: url => ipcRenderer.send('kopi:open-url', url),
    close: () => ipcRenderer.send('window:close'),
    onPointer: callback => subscribe('companion:pointer', callback),
    onGoodbye: callback => subscribe('kopi:goodbye', callback),
    settingsOpen: tab => ipcRenderer.send('settings-app:open', typeof tab === 'string' ? tab : ''), // the Rehatt Settings app, its own window
    settingsFrame: url => ipcRenderer.send('settings-app:frame', url) // the settings app's own Kopi
  });
})();
