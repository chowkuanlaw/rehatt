// The settings app (settings-app.html): the island's lists and clicks, stretch breaks, the usage glass, our news, and Kopi's live face.
const { contextBridge, ipcRenderer } = require('electron');
const on = channel => callback => { const fn = (_e, v) => callback(v); ipcRenderer.on(channel, fn); return () => ipcRenderer.removeListener(channel, fn); };
contextBridge.exposeInMainWorld('settingsApp', {
  get: req => ipcRenderer.invoke('settings-app:get', req),
  dirty: dirty => ipcRenderer.send('settings-app:dirty', !!dirty),
  theme: name => ipcRenderer.send('settings-app:theme', name),
  news: () => ipcRenderer.invoke('settings-app:news'),
  home: () => ipcRenderer.invoke('settings-app:home'),
  connections: () => ipcRenderer.invoke('settings-app:connections'),
  connect: (id, value) => ipcRenderer.invoke('settings-app:connect', { id, on: value }),
  openUrl: url => ipcRenderer.send('settings-app:open-url', url),
  // Lapis Stretch and Teh Tarik Meter inside Rehatt (lapis/engine.cjs, tehtarik/engine.cjs)
  stretch: {
    get: () => ipcRenderer.invoke('lapis:get-state'),
    action: (type, payload) => ipcRenderer.send('lapis:action', { ...(payload || {}), type: String(type) }),
    onState: on('lapis:state')
  },
  meter: {
    get: () => ipcRenderer.invoke('ttm:get-state'),
    action: (type, payload) => ipcRenderer.send('ttm:action', { ...(payload || {}), type: String(type) }),
    onState: on('ttm:state')
  },
  // their own screens, shown over the Stretch and Usage tabs (settings-app-main.cjs)
  embed: (tab, bounds) => ipcRenderer.send('settings-app:embed', tab || null, bounds || null),
  update: {
    get: () => ipcRenderer.invoke('rehatt:update-get'),
    act: what => ipcRenderer.send('rehatt:update', String(what)),
    onState: on('rehatt:update')
  },
  onGoto: on('settings-app:goto'),
  onFace: on('settings-app:face')
});
