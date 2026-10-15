'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('browser', {
  call: (action, args = {}) => ipcRenderer.invoke('browser:command', action, args),
  onState: callback => { ipcRenderer.on('browser:state', (_event, state) => callback(state)); },
  onFocusAddress: callback => { ipcRenderer.on('browser:focus-address', () => callback()); },
  onBlurFields: callback => { ipcRenderer.on('browser:blur-fields', () => callback()); },
  onFind: callback => { ipcRenderer.on('browser:find', (_event, result) => callback(result)); },
  onNotice: callback => { ipcRenderer.on('browser:notice', (_event, message) => callback(message)); }
});
const focusChrome = () => ipcRenderer.send('browser:chrome-focus', Date.now());
window.addEventListener('pointerdown', focusChrome, true);
window.addEventListener('focusin', focusChrome, true);
window.addEventListener('wheel', event => {
  if (event.isTrusted && event.ctrlKey && event.deltaY) { event.preventDefault(); ipcRenderer.send('browser:wheel', event.deltaY < 0 ? 1 : -1); }
}, { capture: true, passive: false });
window.addEventListener('keydown', event => {
  if (!event.isTrusted || !(event.ctrlKey || event.metaKey)) return;
  if (event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); ipcRenderer.send('browser:private-key'); return; }
  if (!['+', '=', '-', '0'].includes(event.key)) return;
  event.preventDefault();
  ipcRenderer.send('browser:zoom-key', event.key === '0' ? 0 : event.key === '-' ? -1 : 1);
}, true);
window.addEventListener('dragover', event => {
  if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
}, true);
window.addEventListener('drop', event => {
  if (!event.dataTransfer?.files.length) return;
  const paths = Array.from(event.dataTransfer.files, file => webUtils.getPathForFile(file)).filter(Boolean);
  if (!paths.length) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const thumbnail = event.target.closest?.('[data-library-image]');
  if (thumbnail) { ipcRenderer.invoke('browser:library-image-drop', thumbnail.dataset.libraryImage, paths).catch(() => {}); return; }
  ipcRenderer.invoke('browser:drop-files', paths).catch(() => {});
}, true);
