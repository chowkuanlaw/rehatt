// The settings app (settings-app.html): the island's lists and clicks, the AI choice, our news, and Kopi's live face.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('settingsApp', {
  get: req => ipcRenderer.invoke('settings-app:get', req),
  dirty: on => ipcRenderer.send('settings-app:dirty', !!on),
  theme: name => ipcRenderer.send('settings-app:theme', name),
  news: () => ipcRenderer.invoke('settings-app:news'),
  home: () => ipcRenderer.invoke('settings-app:home'),
  connections: () => ipcRenderer.invoke('settings-app:connections'),
  connect: (id, on) => ipcRenderer.invoke('settings-app:connect', { id, on }),
  openUrl: url => ipcRenderer.send('settings-app:open-url', url),
  // AI & Chat: the same settings the project chat and Kopi the buddy use (project-mode-main.js)
  ai: {
    get: check => ipcRenderer.invoke('ai-settings:get', { check: check === true }), // check: really ask Codex (can take a moment)
    setProvider: provider => ipcRenderer.invoke('ai-settings:set-provider', provider),
    setKey: (type, key) => ipcRenderer.invoke('ai-settings:set-key', { type, key }),
    clearKey: type => ipcRenderer.invoke('ai-settings:clear-key', type),
    setModel: model => ipcRenderer.invoke('ai-settings:set-model', model),
    test: () => ipcRenderer.invoke('ai-settings:test'),
    chatgptLogin: () => ipcRenderer.invoke('ai-settings:chatgpt-login'),
    chatgptCancel: () => ipcRenderer.invoke('ai-settings:chatgpt-cancel'),
    chatgptLogout: () => ipcRenderer.invoke('ai-settings:chatgpt-logout')
  },
  onGoto: callback => { const fn = (_e, tab) => callback(tab); ipcRenderer.on('settings-app:goto', fn); return () => ipcRenderer.removeListener('settings-app:goto', fn); },
  onFace: callback => { const fn = (_e, url) => callback(url); ipcRenderer.on('settings-app:face', fn); return () => ipcRenderer.removeListener('settings-app:face', fn); }
});
