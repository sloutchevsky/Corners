'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Expose only a mute control, and only to the bundled standalone player page.
if (location.protocol === 'flashnative:' && location.hostname === 'player') {
  contextBridge.exposeInMainWorld('nativePlayer', { mute: () => ipcRenderer.invoke('player:mute') });
}
