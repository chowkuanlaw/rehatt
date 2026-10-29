'use strict';
// Lapis's own screens inside Rehatt (the Stretch tab of Rehatt Settings, and the dance): the same `lapis` bridge
// as the Lapis app, on Rehatt's "lapis:" channels.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lapis', {
  view: new URLSearchParams(location.search).get('view') || 'main',
  getState: () => ipcRenderer.invoke('lapis:get-state'),
  act: (type, payload) => ipcRenderer.send('lapis:action', Object.assign({ type }, payload || {})),
  onState: cb => ipcRenderer.on('lapis:state', (_e, s) => cb(s)),
  onChime: cb => ipcRenderer.on('lapis:chime', (_e, kind) => cb(kind))
});
