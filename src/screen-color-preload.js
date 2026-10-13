'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const channel = process.argv.find(arg => arg.startsWith('--flashborn-picker-channel=')).slice('--flashborn-picker-channel='.length);
contextBridge.exposeInMainWorld('screenColor', {
  image: () => ipcRenderer.invoke(channel, 'image'),
  select: (x, y) => ipcRenderer.invoke(channel, 'select', { x, y }),
  cancel: () => ipcRenderer.invoke(channel, 'cancel')
});
