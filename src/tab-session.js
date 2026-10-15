'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isWebURL } = require('./core');
const { supportedLocalFile } = require('./files');

function sessionEntry(tab) {
  if (!tab || tab.private) return null;
  if (tab.restoreEntry) return savedEntry(tab.restoreEntry);
  const entry = { kind: tab.kind, title: String(tab.title || '').slice(0, 200), url: tab.url || '', native: !!tab.native };
  if (entry.kind === 'home') { entry.url = ''; entry.native = false; }
  else if (entry.kind === 'web') { if (!isWebURL(entry.url) || /\.swf$/i.test(new URL(entry.url).pathname)) return null; }
  else if (['local', 'pdf'].includes(entry.kind)) {
    if (typeof tab.localPath !== 'string' || !path.isAbsolute(tab.localPath) || !supportedLocalFile(tab.localPath)) return null;
    entry.path = tab.localPath; entry.url = pathToFileURL(tab.localPath).href;
  } else return null;
  entry.zoom = tab.native?.state?.zoom || (tab.view && !tab.view.webContents.isDestroyed() ? Math.round(tab.view.webContents.getZoomFactor() * 100) : 100);
  entry.muted = tab.native ? !!tab.native.state?.muted : !!tab.view && !tab.view.webContents.isDestroyed() && tab.view.webContents.isAudioMuted();
  return entry;
}

function savedEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.private) return null;
  const tab = { kind: value.kind || 'web', title: value.title, url: value.url, native: !!value.native, localPath: value.path };
  const entry = sessionEntry(tab);
  if (!entry) return null;
  entry.native = !!value.native;
  entry.zoom = Number.isFinite(value.zoom) ? Math.max(25, Math.min(500, value.zoom)) : 100;
  entry.muted = !!value.muted;
  return entry;
}
module.exports = { sessionEntry, savedEntry };
