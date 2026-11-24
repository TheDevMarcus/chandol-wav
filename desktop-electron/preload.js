const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wavDesktop', {
  version: () => ipcRenderer.invoke('app:version'),
  launcher: {
    status: () => ipcRenderer.invoke('launcher:status'),
    set: (on) => ipcRenderer.invoke('launcher:set', !!on)
  }
});
