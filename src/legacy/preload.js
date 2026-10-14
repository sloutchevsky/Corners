'use strict';
const { contextBridge, ipcRenderer } = require('electron');
window.addEventListener('mousedown', event => { if (event.isTrusted) ipcRenderer.send('browser:content-focus'); }, true);
// Watch plugin insertion, not ordinary animation/style changes. Settled movies
// need no recurring JavaScript-to-Flash calls while they render or accept input.
window.addEventListener('DOMContentLoaded', () => {
  const containsFlash = node => node.nodeType === 1 && (node.matches('object,embed,iframe') || !!node.querySelector('object,embed,iframe'));
  new MutationObserver(records => {
    if (records.some(record => Array.from(record.addedNodes).some(containsFlash))) ipcRenderer.send('browser:flash-changed');
  }).observe(document.documentElement, { childList: true, subtree: true });
});
// The bundled player exposes only its own controls; websites receive no bridge.
if (location.protocol === 'flashnative:' && location.hostname === 'player') {
  contextBridge.exposeInMainWorld('nativePlayer', {
    mute: () => ipcRenderer.invoke('player:mute'),
    fullscreen: () => ipcRenderer.send('player:fullscreen'),
    color: () => ipcRenderer.send('player:color'),
    onState: callback => ipcRenderer.on('player:state', (_event, state) => callback(state))
  });
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
