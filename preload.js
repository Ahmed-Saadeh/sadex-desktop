// Small bridge so the slim SADEX bar can open the app menu.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sadexDesktop', {
  openMenu: (x, y) => ipcRenderer.send('sadex-menu', { x: x, y: y }),
  file: (kind, name, data) => ipcRenderer.invoke('sadex-file', { kind: kind, name: name, data: data }),
  pdfjob: (job) => ipcRenderer.invoke('sadex-pdfjob', job)
});
