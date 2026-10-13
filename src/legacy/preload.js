'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Expose only a mute control, and only to the bundled standalone player page.
if (location.protocol === 'flashnative:' && location.hostname === 'player') {
  contextBridge.exposeInMainWorld('nativePlayer', { mute: () => ipcRenderer.invoke('player:mute') });
}
window.addEventListener('wheel', event => {
  if (event.isTrusted && event.ctrlKey && event.deltaY) { event.preventDefault(); ipcRenderer.send('browser:wheel', event.deltaY < 0 ? 1 : -1); }
}, { capture: true, passive: false });
window.addEventListener('dragover', event => { if (event.dataTransfer && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }, true);
window.addEventListener('drop', event => {
  if (!event.dataTransfer || !event.dataTransfer.files.length) return;
  const paths = Array.from(event.dataTransfer.files, file => file.path).filter(Boolean);
  if (!paths.length) return;
  event.preventDefault(); event.stopImmediatePropagation(); ipcRenderer.send('browser:drop-files', paths);
}, true);
