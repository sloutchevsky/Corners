'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
ipcRenderer.on('browser:window-frame',(_event,insets)=>{for(const [side,value] of Object.entries(insets)){if(['left','top','right','bottom'].includes(side)&&Number.isFinite(value))document.documentElement.style.setProperty('--window-inset-'+side,value+'px');}});
contextBridge.exposeInMainWorld('browser', {
  call: (action, args = {}) => ipcRenderer.invoke('browser:command', action, args),
  onState: callback => { ipcRenderer.on('browser:state', (_event, state) => callback(state)); },
  onFocusAddress: callback => { ipcRenderer.on('browser:focus-address', () => callback()); },
  galleryRequest:request=>ipcRenderer.invoke('browser:gallery-frame',request),
  onGalleryState:callback=>{ipcRenderer.on('browser:gallery-state',(_event,state)=>callback(state));},
  onGalleryReload:callback=>{ipcRenderer.on('browser:gallery-reload',(_event,id)=>callback(id));},
  onSpecialReload:callback=>{ipcRenderer.on('browser:special-reload',()=>callback());},
  menuOutside:()=>ipcRenderer.send('browser:menu-outside'),
  onBlurFields: callback => { ipcRenderer.on('browser:blur-fields', () => callback()); },
  onFind: callback => { ipcRenderer.on('browser:find', (_event, result) => callback(result)); },
  onNotice: callback => { ipcRenderer.on('browser:notice', (_event, message) => callback(message)); },
  onTabSnapshot: callback => { ipcRenderer.on('browser:tab-snapshot', (_event, frame) => callback(frame)); },
  onMenuKey: callback => { ipcRenderer.on('browser:menu-key', (_event, key) => callback(key)); }
});
const focusChrome = event => {
  // The menu button handles its own popup activation. Focusing the shell here
  // blurs/closes that popup before the same press can toggle it closed.
  if (event.target?.closest?.('#menu-button')) return;
  // A draggable caption belongs to Windows, not the chrome input surface.
  // Calling focus() after its mouse-down can release native move capture.
  if (event.target?.closest?.('.titlebar') && !event.target.closest('.window-controls')) return;
  // Reordering needs uninterrupted pointer capture. Windows activates the
  // frame on a real click; do not add a cross-process focus handoff here.
  if (event.target?.closest?.('[data-reorder-id]') && !event.target.closest('input,textarea,[contenteditable="true"]')) return;
  // A physical press already activates the frame. Blank sidebar/status areas
  // need no second programmatic focus transfer through the Chromium widget.
  if (event.type === 'pointerdown' && !event.target?.closest?.('button,a,input,textarea,select,[contenteditable="true"]')) return;
  ipcRenderer.send('browser:chrome-focus', Date.now());
};
window.addEventListener('pointerdown', event => {
  const caption = event.target?.closest?.('.titlebar') && !event.target.closest('.window-controls');
  if (!caption && !event.target?.closest?.('#menu-button')) ipcRenderer.send('browser:menu-outside');
  focusChrome(event);
}, true);
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
