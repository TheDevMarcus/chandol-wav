const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wavDesktop', {
  launcher: {
    status: () => ipcRenderer.invoke('launcher:status'),
    set: (on) => ipcRenderer.invoke('launcher:set', !!on)
  }
});
