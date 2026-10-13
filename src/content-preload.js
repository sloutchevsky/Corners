'use strict';
const { ipcRenderer, webUtils } = require('electron');
let pdfToken;
let summaryEnabled = false, summaryObserver, summaryTimer;
function watchSummary() {
  summaryObserver?.disconnect(); clearTimeout(summaryTimer);
  if (!summaryEnabled || !document.body) return;
  summaryObserver = new MutationObserver(() => {
    clearTimeout(summaryTimer);
    summaryTimer = setTimeout(() => ipcRenderer.send('browser:summary-changed'), 550);
  });
  summaryObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
}
ipcRenderer.on('browser:summary-watch', (_event, enabled) => {
  const changed = summaryEnabled !== (enabled === true); summaryEnabled = enabled === true;
  if (changed || summaryEnabled && !summaryObserver) watchSummary();
});
document.addEventListener('DOMContentLoaded', () => { if (summaryEnabled) watchSummary(); }, { once: true });
ipcRenderer.on('browser:pdf-token', (_event, token) => { pdfToken = token; });
window.addEventListener('message', event => {
  if (pdfToken && event.data?.type === 'flashborn-pdf-zoom' && event.data.token === pdfToken) ipcRenderer.send('browser:pdf-zoom', pdfToken);
});
// These controls stay in the isolated preload world; websites receive no API.
window.addEventListener('keydown', event => {
  if (event.isTrusted && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'n') {
    event.preventDefault(); ipcRenderer.send('browser:private-key');
  }
}, true);
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
