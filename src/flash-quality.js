'use strict';
const path = require('node:path');
const validQuality = value => ['low', 'medium', 'high'].includes(value);
function qualityKey(tab) {
  if (tab.localPath && ['local', 'flash'].includes(tab.kind)) { const key = path.resolve(tab.localPath); return process.platform === 'win32' ? key.toLowerCase() : key; }
  try { const url = new URL(tab.url); if (!['http:', 'https:'].includes(url.protocol)) return null; url.hash = ''; return url.href; } catch { return null; }
}
function initializeQuality(tab, remembered) {
  const key = qualityKey(tab);
  if (key !== tab.flashQualityKey) {
    if (tab.flashQualityKey || !validQuality(tab.flashQuality)) tab.flashQuality = !tab.private && validQuality(remembered[key]) ? remembered[key] : null;
    tab.flashQualityKey = key;
  }
}
module.exports = { validQuality, qualityKey, initializeQuality };
