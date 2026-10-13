'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('browser', {
  call: (action, args = {}) => ipcRenderer.invoke('browser:command', action, args),
  onState: callback => { ipcRenderer.on('browser:state', (_event, state) => callback(state)); },
  onFocusAddress: callback => { ipcRenderer.on('browser:focus-address', () => callback()); },
  onFind: callback => { ipcRenderer.on('browser:find', (_event, result) => callback(result)); }
});
