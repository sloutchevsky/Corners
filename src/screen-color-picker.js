'use strict';
const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const PICKER_URL = 'flashborn://ui/screen-color.html';

// A parented Chromium eyedropper can be obscured by PPAPI's native windows.
// These independent topmost windows own both the pixels and the pointer input.
class ScreenColorPicker {
  constructor(beforeShow) {
    this.beforeShow = beforeShow;
    this.entries = [];
    this.closed = false;
    this.channel = 'flashborn:screen-color:' + crypto.randomUUID();
    this.result = new Promise(resolve => { this.resolve = resolve; });
    this.cancel = () => this.finish(null);
  }
  sample(entry, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= entry.bounds.width || y >= entry.bounds.height) throw new Error('Invalid screen position.');
    const px = Math.min(entry.size.width - 1, Math.floor(x * entry.size.width / entry.bounds.width));
    const py = Math.min(entry.size.height - 1, Math.floor(y * entry.size.height / entry.bounds.height));
    const offset = (py * entry.size.width + px) * 4;
    return '#' + [entry.bitmap[offset + 2], entry.bitmap[offset + 1], entry.bitmap[offset]].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  async open() {
    ipcMain.handle(this.channel, (event, action, point) => {
      const entry = this.entries.find(e => e.window.webContents === event.sender);
      if (this.closed || !entry || event.senderFrame?.url !== PICKER_URL) throw new Error('Untrusted screen picker.');
      if (action === 'image') return { image: entry.image.toDataURL(), bounds: entry.bounds };
      if (action === 'cancel') { this.cancel(); return; }
      if (action === 'select') { this.finish(this.sample(entry, point?.x, point?.y)); return; }
      throw new Error('Unsupported screen picker command.');
    });
    try {
      const displays = screen.getAllDisplays();
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: {
        width: Math.max(...displays.map(d => Math.round(d.size.width * d.scaleFactor))),
        height: Math.max(...displays.map(d => Math.round(d.size.height * d.scaleFactor)))
      } });
      if (this.closed) return null;
      for (const display of displays) {
        const source = sources.find(s => s.display_id === String(display.id));
        if (!source || source.thumbnail.isEmpty()) throw new Error('This screen could not be captured for color picking.');
        const popup = new BrowserWindow({ ...display.bounds, frame: false, show: false, skipTaskbar: true,
          resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
          thickFrame: false, alwaysOnTop: true, backgroundColor: '#202020',
          webPreferences: { preload: path.join(__dirname, 'screen-color-preload.js'), sandbox: true,
            contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false,
            additionalArguments: ['--flashborn-picker-channel=' + this.channel] } });
        this.entries.push({ window: popup, bounds: display.bounds, displayId: display.id,
          image: source.thumbnail, bitmap: source.thumbnail.toBitmap(), size: source.thumbnail.getSize() });
        popup.setMenu(null); popup.setAlwaysOnTop(true, 'screen-saver');
        popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        popup.webContents.on('will-navigate', event => event.preventDefault());
        popup.webContents.on('before-input-event', (event, input) => {
          if (input.type === 'keyDown' && input.key === 'Escape') { event.preventDefault(); this.cancel(); }
        });
        popup.webContents.on('render-process-gone', this.cancel);
        popup.on('closed', this.cancel);
      }
      await Promise.all(this.entries.map(e => e.window.loadURL(PICKER_URL)));
      if (this.closed) return null;
      // Wait until each renderer has decoded its full-resolution snapshot.
      await Promise.all(this.entries.map(e => e.window.webContents.executeJavaScript('window.screenColorReady')));
      if (this.closed) return null;
      await this.beforeShow();
      if (this.closed) return null;
      for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, this.cancel);
      for (const entry of this.entries) { entry.window.showInactive(); entry.window.moveTop(); }
      const pointer = screen.getCursorScreenPoint();
      const focused = this.entries.find(e => e.displayId === screen.getDisplayNearestPoint(pointer).id) || this.entries[0];
      focused.window.focus();
      return await this.result;
    } finally { this.dispose(); }
  }
  finish(color) {
    if (this.closed) return;
    this.closed = true; this.resolve(color); this.dispose();
  }
  dispose() {
    ipcMain.removeHandler(this.channel);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.removeListener(event, this.cancel);
    const entries = this.entries; this.entries = [];
    for (const entry of entries) {
      entry.window.removeListener('closed', this.cancel);
      if (!entry.window.isDestroyed()) entry.window.destroy();
      entry.bitmap = null; entry.image = null;
    }
  }
}
module.exports = { ScreenColorPicker };
