'use strict';
const { ipcRenderer, webUtils } = require('electron');
window.addEventListener('message', event => {
  if (window.top !== window || event.source !== window || event.origin !== location.origin || !event.data || event.data.type !== 'flashborn-library-request') return;
  const data = event.data;
  if (typeof data.id !== 'string' || data.id.length > 80 || typeof data.action !== 'string') return;
  ipcRenderer.invoke('browser:library-page', { id: data.id, action: data.action, args: data.args }).then(response => {
    window.postMessage({ type: 'flashborn-library-response', ...response }, location.origin);
  }).catch(() => {});
});
ipcRenderer.on('browser:library-page-state', (_event, state) => {
  window.postMessage({ type: 'flashborn-library-response', ok: true, state }, location.origin);
});
let pdfToken;
let tabActive = true;
window.addEventListener('pointerdown', event => { if (tabActive && event.isTrusted) ipcRenderer.send('browser:menu-outside'); }, true);
ipcRenderer.on('browser:tab-active', (_event, enabled) => { tabActive = enabled; });
for (const name of ['pointerdown', 'mousedown', 'click', 'keydown', 'drop']) window.addEventListener(name, event => {
  if (!tabActive && event.isTrusted) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
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
window.addEventListener('resize', () => {
  if (!summaryEnabled) return;
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => ipcRenderer.send('browser:summary-changed'), 120);
});
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
  if (!event.defaultPrevented && event.dataTransfer?.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
});
window.addEventListener('drop', event => {
  if (!event.dataTransfer?.files.length) return;
  const paths = Array.from(event.dataTransfer.files, file => webUtils.getPathForFile(file)).filter(Boolean);
  if (!paths.length) return;
  const editable = event.composedPath().some(node => node instanceof Element && (node.matches('input,textarea') || node.isContentEditable));
  // Let the complete page event dispatch finish, including window listeners.
  // Upload sites own canceled drops. Stealing them in capture also strands
  // their drag overlays because they never receive the final drop event.
  setTimeout(() => {
    if (!event.defaultPrevented && !editable) ipcRenderer.invoke('browser:drop-files', paths).catch(() => {});
  }, 0);
});
