// The buddy layer (buddy.html): Kopi out of the island, the frame that shows what he looks at, and his card.
const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => { const fn = (_e, data) => callback(data); ipcRenderer.on(channel, fn); return () => ipcRenderer.removeListener(channel, fn); };
contextBridge.exposeInMainWorld('buddy', {
  onState: callback => subscribe('buddy:state', callback),
  onMove: callback => subscribe('buddy:move', callback),
  onLens: callback => subscribe('buddy:lens', callback),
  onFrame: callback => subscribe('buddy:frame', callback),
  onProgress: callback => subscribe('buddy:progress', callback),
  ask: (kind, text) => ipcRenderer.invoke('buddy:ask', { kind, text }),
  apply: () => ipcRenderer.invoke('buddy:apply'),
  copy: text => ipcRenderer.send('buddy:copy', text),
  interactive: on => ipcRenderer.send('buddy:interactive', !!on),
  regrab: () => ipcRenderer.send('buddy:regrab'),
  letGo: () => ipcRenderer.send('buddy:let-go'),
  arrived: () => ipcRenderer.send('buddy:arrived'),
  home: () => ipcRenderer.send('buddy:home')
});
