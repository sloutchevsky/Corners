'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('browser', {
  call: (action, args = {}) => ipcRenderer.invoke('browser:command', action, args),
  onState: callback => { ipcRenderer.on('browser:state', (_event, state) => callback(state)); },
  onFocusAddress: callback => { ipcRenderer.on('browser:focus-address', () => callback()); },
  onFind: callback => { ipcRenderer.on('browser:find', (_event, result) => callback(result)); },
  onNotice: callback => { ipcRenderer.on('browser:notice', (_event, message) => callback(message)); }
});
window.addEventListener('wheel', event => {
  if (event.isTrusted && event.ctrlKey && event.deltaY) { event.preventDefault(); ipcRenderer.send('browser:wheel', event.deltaY < 0 ? 1 : -1); }
}, { capture: true, passive: false });
window.addEventListener('dragover', event => {
  if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
}, true);
window.addEventListener('drop', event => {
  if (!event.dataTransfer?.files.length) return;
  const paths = Array.from(event.dataTransfer.files, file => webUtils.getPathForFile(file)).filter(Boolean);
  if (!paths.length) return;
  event.preventDefault(); event.stopImmediatePropagation();
  ipcRenderer.invoke('browser:drop-files', paths).catch(() => {});
}, true);
