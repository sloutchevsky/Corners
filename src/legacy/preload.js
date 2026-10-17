'use strict';
const { ipcRenderer } = require('electron');
window.addEventListener('mousedown', event => { if (event.isTrusted) ipcRenderer.send('browser:content-focus', Date.now()); }, true);
window.addEventListener('wheel', event => {
  if (event.isTrusted && event.ctrlKey && event.deltaY) { event.preventDefault(); ipcRenderer.send('browser:wheel', event.deltaY < 0 ? 1 : -1); }
}, { capture: true, passive: false });
window.addEventListener('dragover', event => { if (!event.defaultPrevented && event.dataTransfer && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
window.addEventListener('drop', event => {
  if (!event.dataTransfer || !event.dataTransfer.files.length) return;
  const paths = Array.from(event.dataTransfer.files, file => file.path).filter(Boolean);
  if (!paths.length) return;
  const editable = event.composedPath().some(node => node instanceof Element && (node.matches('input,textarea') || node.isContentEditable));
  setTimeout(() => { if (!event.defaultPrevented && !editable) ipcRenderer.send('browser:drop-files', paths); }, 0);
});
