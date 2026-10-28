'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { extractCRX } = require('./extension-package');
const { ExtensionFiltering } = require('./extension-filtering');
const bundledPackage = require('./extensions/adblock.json');
const bundledKey = 'bb8e9131-6bb0-4d7f-b010-a0dcb40ccdf3';
async function readManifest(directory) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (![2, 3].includes(manifest.manifest_version) || typeof manifest.name !== 'string' || !manifest.name.trim() || typeof manifest.version !== 'string') throw new Error('Choose an unpacked Chrome extension folder containing a valid manifest.json.');
  if (['permissions', 'host_permissions'].some(key => manifest[key] !== undefined && !Array.isArray(manifest[key]))) throw new Error('Invalid extension permissions.');
  let name = manifest.name;
  const message = /^__MSG_(.+)__$/.exec(name);
  if (message && /^[\w-]+$/.test(manifest.default_locale || '')) {
    try { name = JSON.parse(await fs.readFile(path.join(directory, '_locales', manifest.default_locale, 'messages.json'), 'utf8'))[message[1]]?.message || name; } catch { /* Use the manifest name if localization is missing. */ }
  }
  return { manifest, name: name.slice(0, 150) };
}
function extensionPage(manifest, kind) {
  const value = kind === 'options' ? manifest.options_ui?.page || manifest.options_page : manifest.action?.default_popup || manifest.browser_action?.default_popup;
  if (typeof value !== 'string' || !value || /[\\?#]/.test(value) || value.startsWith('/') || value.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/i.test(value)) return null;
  return value.split('/').map(encodeURIComponent).join('/');
}
class Extensions {
  constructor(store, session, directory, changed = () => {}) {
    this.store = store; this.session = session; this.directory = path.resolve(directory); this.changed = changed; this.loaded = new Map(); this.errors = new Map(); this.busy = false;
    this.bundled = { key: bundledKey, name: 'AdBlock', description: 'Official AdBlock by Adblock, Inc.', version: bundledPackage.version, bundled: true, enabled: store.data.settings.adBlockEnabled };
    this.filtering = new ExtensionFiltering(session);
  }
  managedPath(key) {
    if (!/^[a-f\d-]{36}$/.test(key)) throw new Error('Invalid extension identifier.');
    const value = path.resolve(this.directory, key);
    if (path.dirname(value) !== this.directory) throw new Error('Invalid extension directory.');
    return value;
  }
  async start() {
    if (this.bundled.enabled) await this.load(this.bundled);
    for (const item of this.store.data.extensions) if (item.enabled) await this.load(item);
  }
  async prepareBundled() {
        const target = this.managedPath(bundledKey), marker = target + '.json';
        let installed;
        try { installed = JSON.parse(await fs.readFile(marker, 'utf8')); } catch { /* First launch. */ }
        if (installed?.sha256 !== bundledPackage.sha256) {
          const buffer = await fs.readFile(path.join(__dirname, 'extensions', 'adblock.crx'));
          if (crypto.createHash('sha256').update(buffer).digest('hex') !== bundledPackage.sha256) throw new Error('Bundled AdBlock package checksum failed.');
          const stage = target + '.pending'; await fs.rm(stage, { recursive: true, force: true });
          await extractCRX(buffer, stage, bundledPackage.id);
          await fs.rm(target, { recursive: true, force: true }); await fs.rename(stage, target);
          await fs.writeFile(marker, JSON.stringify({ sha256: bundledPackage.sha256 }));
        }
  }
  async load(item) {
    let extension;
    try {
      if (item.bundled) await this.prepareBundled();
      const directory = this.managedPath(item.key), { manifest, name } = await readManifest(directory);
      extension = await this.session.extensions.loadExtension(directory, { allowFileAccess: false });
      await this.filtering.add(extension);
      this.loaded.set(item.key, { extension, manifest }); this.errors.delete(item.key);
      Object.assign(item, { name, version: manifest.version, description: String(manifest.description || '').slice(0, 400), permissions: [...(manifest.permissions || []), ...(manifest.host_permissions || [])].filter(p => typeof p === 'string') });
    } catch (error) {
      if (extension) { this.filtering.remove(extension.id); this.session.extensions.removeExtension(extension.id); }
      this.errors.set(item.key, error.message);
    }
  }
  async install(directory) {
    if (this.busy) throw new Error('An extension operation is already running.');
    this.busy = true; const key = crypto.randomUUID(), target = this.managedPath(key);
    try {
      await readManifest(directory);
      let files = 0, bytes = 0;
      const copy = async (source, destination) => {
        await fs.mkdir(destination, { recursive: true });
        for (const entry of await fs.readdir(source, { withFileTypes: true })) {
          if (entry.isSymbolicLink() || !entry.isFile() && !entry.isDirectory()) throw new Error('Extension folders cannot contain symbolic links or special files.');
          if (entry.isDirectory()) await copy(path.join(source, entry.name), path.join(destination, entry.name));
          else {
            const from = path.join(source, entry.name), stat = await fs.stat(from); files++; bytes += stat.size;
            if (files > 15000 || bytes > 128 * 1024 * 1024) throw new Error('Choose an extension smaller than 128 MB with fewer than 15,000 files.');
            await fs.copyFile(from, path.join(destination, entry.name));
          }
        }
      };
      // Copy into Corners's profile so later launches do not depend on a
      // temporary download folder. Never modify the selected source folder.
      const source = await fs.realpath(directory);
      if (source === this.directory || this.directory.startsWith(source + path.sep) || source.startsWith(this.directory + path.sep)) throw new Error('Choose a folder outside Corners’s managed extensions directory.');
      await copy(source, target);
      const item = { key, enabled: true }; await this.load(item);
      if (!this.loaded.has(key)) throw new Error(this.errors.get(key) || 'Extension did not load.');
      this.store.data.extensions.push(item); this.store.save(); this.changed(); return key;
    } catch (error) {
      const loaded = this.loaded.get(key); if (loaded) { this.filtering.remove(loaded.extension.id); this.session.extensions.removeExtension(loaded.extension.id); }
      this.loaded.delete(key); this.errors.delete(key); await fs.rm(target, { recursive: true, force: true }); throw error;
    } finally { this.busy = false; }
  }
  async change(key, action) {
    const item = key === bundledKey ? this.bundled : this.store.data.extensions.find(item => item.key === key);
    if (!item) throw new Error('Extension not found.');
    if (item.bundled && action === 'remove') throw new Error('The bundled AdBlock can be turned off using its switch.');
    const loaded = this.loaded.get(key);
    if (loaded) { this.filtering.remove(loaded.extension.id); this.session.extensions.removeExtension(loaded.extension.id); }
    this.loaded.delete(key); this.errors.delete(key);
    if (action === 'remove') { await fs.rm(this.managedPath(key), { recursive: true, force: true }); this.store.data.extensions = this.store.data.extensions.filter(entry => entry !== item); }
    else if (action === 'reload' || !item.enabled) { item.enabled = true; await this.load(item); }
    else item.enabled = false;
    if (item.bundled) this.store.data.settings.adBlockEnabled = item.enabled;
    this.store.save(); this.changed();
  }
  page(key, kind) {
    const loaded = this.loaded.get(key), page = loaded && extensionPage(loaded.manifest, kind);
    if (!page) throw new Error('This extension does not provide that page.');
    return `chrome-extension://${loaded.extension.id}/${page}`;
  }
  dispose() {
    for (const { extension } of this.loaded.values()) { this.filtering.remove(extension.id); this.session.extensions.removeExtension(extension.id); }
    this.loaded.clear();
  }
  state() {
    return [this.bundled, ...this.store.data.extensions].map(item => {
      const loaded = this.loaded.get(item.key);
      return { ...item, id: loaded?.extension.id, loaded: !!loaded, error: this.errors.get(item.key), options: !!loaded && !!extensionPage(loaded.manifest, 'options'), popup: !!loaded && !!extensionPage(loaded.manifest, 'popup') };
    });
  }
}
module.exports = { Extensions, readManifest, extensionPage };
