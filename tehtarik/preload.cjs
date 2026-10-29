'use strict';
// Teh Tarik Meter's own screens inside Rehatt (the Usage tab of Rehatt Settings, and the show): the same `ttm`
// bridge as the Teh Tarik Meter app, on Rehatt's "ttm:" channels.
const { contextBridge, ipcRenderer } = require('electron');

const q = new URLSearchParams(location.search);
contextBridge.exposeInMainWorld('ttm', {
  view: q.get('view') || 'app',
  tab: q.get('tab') || '',
  welcome: q.get('welcome') === '1',
  getState: () => ipcRenderer.invoke('ttm:get-state'),
  getHistory: () => ipcRenderer.invoke('ttm:get-history'),
  sessionKey: value => ipcRenderer.invoke('ttm:session-key', String(value || '')),
  act: (type, payload) => ipcRenderer.send('ttm:action', Object.assign({ type }, payload || {})),
  onState: cb => ipcRenderer.on('ttm:state', (_e, s) => cb(s)),
  onTarik: cb => ipcRenderer.on('ttm:tarik', () => cb()),
  onShowOver: cb => ipcRenderer.on('ttm:show-over', () => cb())
});
