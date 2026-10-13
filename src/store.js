'use strict';
const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(directory) {
    this.file = path.join(directory, 'browser.json');
    this.data = { bookmarks: [], history: [], library: [], downloads: [], tabs: [], settings: { searchEngine: 'duckduckgo', restoreTabs: true, flashEnabled: true } };
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const key of ['bookmarks', 'history', 'library', 'downloads', 'tabs']) if (Array.isArray(saved[key])) this.data[key] = saved[key];
      this.data.settings = { ...this.data.settings, ...saved.settings };
      this.data.downloads = this.data.downloads.map(d => ({ ...d, state: d.state === 'progressing' ? 'interrupted' : d.state }));
    } catch { /* A missing or damaged profile starts with defaults. */ }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(this.file + '.tmp', this.file);
  }
}
module.exports = { Store };
