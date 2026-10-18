'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { LibraryFolder } = require('./library');

class Store {
  constructor(directory) {
    this.file = path.join(directory, 'browser.json');
    this.data = { bookmarks: [], history: [], library: [], downloads: [], tabs: [], extensions: [], settings: { searchEngine: 'duckduckgo', restoreTabs: true, pageSummaries: false, flashEnabled: true, flashQuality: 'high', theme: 'current', adBlockEnabled: true } };
    this.data.sitePermissions = [];
    this.data.flashQualities = {};
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data.activeTabIndex = Number.isInteger(saved.activeTabIndex) ? saved.activeTabIndex : 0;
      for (const key of ['bookmarks', 'history', 'library', 'downloads', 'tabs', 'extensions']) if (Array.isArray(saved[key])) this.data[key] = saved[key];
      this.data.settings = { ...this.data.settings, ...saved.settings };
      this.data.sitePermissions = Array.isArray(saved.sitePermissions) ? saved.sitePermissions : [];
      this.data.flashQualities = Object.fromEntries(Object.entries(saved.flashQualities || {}).filter(([key, value]) => key.length < 8192 && ['high', 'medium', 'low'].includes(value)).slice(-2000));
      if (typeof this.data.settings.pageSummaries !== 'boolean') this.data.settings.pageSummaries = false;
      if (typeof this.data.settings.adBlockEnabled !== 'boolean') this.data.settings.adBlockEnabled = true;
      this.data.extensions = this.data.extensions.filter(entry => entry && typeof entry.key === 'string' && /^[a-f\d-]{36}$/.test(entry.key)).slice(0, 100);
      if (!['current', 'light'].includes(this.data.settings.theme)) this.data.settings.theme = 'current';
      if (!['high', 'medium', 'low'].includes(this.data.settings.flashQuality)) this.data.settings.flashQuality = 'high';
      this.data.downloads = this.data.downloads.map(d => ({ ...d, state: d.state === 'progressing' ? 'interrupted' : d.state }));
    } catch { /* A missing or damaged profile starts with defaults. */ }
    this.libraryFolder = new LibraryFolder(directory);
    this.data.library = this.libraryFolder.load(this.data.library);
  }
  save() {
    this.libraryFolder.save(this.data.library);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(this.file + '.tmp', this.file);
  }
}
module.exports = { Store };
