'use strict';
const { ipcRenderer, webUtils } = require('electron');
let pdfToken;
ipcRenderer.on('browser:pdf-token', (_event, token) => { pdfToken = token; });
window.addEventListener('message', event => {
  if (pdfToken && event.data?.type === 'flashborn-pdf-zoom' && event.data.token === pdfToken) ipcRenderer.send('browser:pdf-zoom', pdfToken);
});
// These controls stay in the isolated preload world; websites receive no API.
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
