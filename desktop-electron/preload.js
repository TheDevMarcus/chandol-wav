const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wavDesktop', {
  version: () => ipcRenderer.invoke('app:version'),
  vault: {
    get: (path) => ipcRenderer.invoke('vault:get', path),
    post: (path, body) => ipcRenderer.invoke('vault:post', path, body),
    lyrics: (id) => ipcRenderer.invoke('vault:lyrics', id)
  },
  presence: {
    set: (payload) => ipcRenderer.send('presence:set', payload),
    clear: () => ipcRenderer.send('presence:clear')
  },
  launcher: {
    status: () => ipcRenderer.invoke('launcher:status'),
    set: (on) => ipcRenderer.invoke('launcher:set', !!on)
  }
});
