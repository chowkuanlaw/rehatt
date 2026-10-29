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
  // stretch breaks (stretch-main.cjs): settings apply at once
  stretch: {
    get: () => ipcRenderer.invoke('stretch:get'),
    action: (action, value) => ipcRenderer.invoke('stretch:action', { action, value }),
    onState: on('stretch:state')
  },
  // the usage glass (meter-main.cjs)
  meter: {
    get: () => ipcRenderer.invoke('meter:get'),
    action: action => ipcRenderer.invoke('meter:action', { action }),
    onState: on('meter:state')
  },
  onGoto: on('settings-app:goto'),
  onFace: on('settings-app:face')
});
