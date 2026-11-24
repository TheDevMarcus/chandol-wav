const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wavDesktop', {
  version: () => ipcRenderer.invoke('app:version'),
  presence: {
    set: (payload) => ipcRenderer.send('presence:set', payload),
    clear: () => ipcRenderer.send('presence:clear')
  },
  launcher: {
    status: () => ipcRenderer.invoke('launcher:status'),
    set: (on) => ipcRenderer.invoke('launcher:set', !!on)
  }
});
