'use strict';
const { ipcMain, webContents } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
function matchesPattern(value, pattern) {
  if (pattern === '<all_urls>') return /^https?:/.test(value);
  try { return new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*') + '$').test(value); } catch { return false; }
}
class ExtensionBridge {
  constructor(session, browser) {
    this.session = session; this.browser = browser; this.menus = new Map(); this.workers = new Set(); this.actions = new Map(); this.styles = new Map();
    for (const type of ['frame', 'service-worker']) session.registerPreloadScript({ type, filePath: path.join(__dirname, 'extension-preload.js') });
    ipcMain.handle('extension:api', (event, method, args) => this.invoke(event, method, args));
    session.serviceWorkers.on('running-status-changed', details => {
      const worker = session.serviceWorkers.getWorkerFromVersionID(details.versionId);
      if (worker && !this.workers.has(worker.versionId)) {
        this.workers.add(worker.versionId);
        worker.ipc.handle('extension:api', (event, method, args) => this.invoke(event, method, args));
      }
    });
  }
  caller(event) {
    const url = event.serviceWorker?.scriptURL || event.senderFrame?.url;
    const ownerSession = event.serviceWorker ? event.session : event.sender?.session;
    if (ownerSession !== this.session || !url?.startsWith('chrome-extension://')) throw new Error('Extension API denied.');
    const id = new URL(url).hostname, extension = this.session.extensions.getExtension(id);
    if (!extension) throw new Error('Extension is not loaded.');
    return extension;
  }
  tabInfo(tab) {
    const wc = tab.view.webContents;
    return { id: wc.id, windowId: this.browser.window()?.id || 1, index: this.browser.tabs().indexOf(tab), url: wc.getURL() || tab.url, title: tab.title, active: this.browser.active()?.id === tab.id, highlighted: this.browser.active()?.id === tab.id, incognito: false, status: wc.isLoading() ? 'loading' : 'complete', pinned: false, audible: wc.isCurrentlyAudible(), mutedInfo: { muted: wc.isAudioMuted() } };
  }
  findTab(id) {
    const tab = id === undefined || id === -1 ? this.browser.active() : this.browser.tabs().find(tab => tab.view.webContents.id === id);
    if (!tab || tab.private || tab.native || !tab.view || tab.view.webContents.isDestroyed()) throw new Error('Tab is not available to this extension.');
    return tab;
  }
  windowInfo() {
    const win = this.browser.window();
    return win && { id: win.id, focused: win.isFocused(), incognito: false, type: 'normal', state: win.isFullScreen() ? 'fullscreen' : win.isMaximized() ? 'maximized' : 'normal', ...win.getBounds() };
  }
  emit(name, args, onlyId) {
    const permitted = id => {
      const permissions = this.session.extensions.getExtension(id)?.manifest.permissions || [];
      return name.startsWith('tabs.') ? permissions.includes('tabs') : name.startsWith('webNavigation.') ? permissions.includes('webNavigation') : true;
    };
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed() || wc.session !== this.session) continue;
      const match = /^chrome-extension:\/\/([a-p]{32})\//.exec(wc.getURL());
      if (match && (!onlyId || match[1] === onlyId) && permitted(match[1])) wc.send('extension:event', name, args);
    }
    for (const [version, info] of Object.entries(this.session.serviceWorkers.getAllRunning())) {
      const match = /^chrome-extension:\/\/([a-p]{32})\//.exec(info.scriptUrl);
      if (!match || onlyId && match[1] !== onlyId || !permitted(match[1])) continue;
      const worker = this.session.serviceWorkers.getWorkerFromVersionID(Number(version));
      if (worker && !worker.isDestroyed()) worker.send('extension:event', name, args);
    }
  }
  addTab(tab) {
    if (tab.private) return;
    const wc = tab.view.webContents;
    this.emit('tabs.onCreated', [this.tabInfo(tab)]);
    wc.on('did-start-navigation', (_event, url, _inPlace, mainFrame) => {
      if (mainFrame) { this.emit('webNavigation.onBeforeNavigate', [{ tabId: wc.id, frameId: 0, parentFrameId: -1, url, timeStamp: Date.now() }]); this.emit('tabs.onUpdated', [wc.id, { status: 'loading', url }, this.tabInfo(tab)]); }
    });
    wc.on('did-frame-navigate', (_event, url, _status, _text, mainFrame, processId, routingId) => {
      this.emit('webNavigation.onCommitted', [{ tabId: wc.id, frameId: mainFrame ? 0 : routingId, parentFrameId: mainFrame ? -1 : 0, processId, url, timeStamp: Date.now(), transitionType: 'link', transitionQualifiers: [] }]);
    });
    wc.on('did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame) this.emit('webNavigation.onHistoryStateUpdated', [{ tabId: wc.id, frameId: 0, parentFrameId: -1, url, timeStamp: Date.now() }]); });
    wc.on('dom-ready', () => this.emit('webNavigation.onDOMContentLoaded', [{ tabId: wc.id, frameId: 0, url: wc.getURL(), timeStamp: Date.now() }]));
    wc.on('did-finish-load', () => { this.emit('tabs.onUpdated', [wc.id, { status: 'complete' }, this.tabInfo(tab)]); this.emit('webNavigation.onCompleted', [{ tabId: wc.id, frameId: 0, url: wc.getURL(), timeStamp: Date.now() }]); });
    wc.once('destroyed', () => this.emit('tabs.onRemoved', [wc.id, { windowId: this.browser.window()?.id || 1, isWindowClosing: false }]));
  }
  selected(tab) {
    if (tab && !tab.private && !tab.native && tab.view && !tab.view.webContents.isDestroyed()) this.emit('tabs.onActivated', [{ tabId: tab.view.webContents.id, windowId: this.browser.window()?.id || 1 }]);
  }
  contextMenu(tab, params) {
    if (tab.private) return [];
    const result = [];
    for (const [id, menus] of this.menus) {
      if (!this.session.extensions.getExtension(id)) continue;
      const build = item => {
        if (item.visible === false) return null;
        const contexts = item.contexts || ['page'];
        if (!contexts.includes('all') && !contexts.includes('page') && !(contexts.includes('selection') && params.selectionText) && !(contexts.includes('image') && params.mediaType === 'image') && !(contexts.includes('link') && params.linkURL) && !(contexts.includes('editable') && params.isEditable)) return null;
        if (item.documentUrlPatterns && !item.documentUrlPatterns.some(pattern=>matchesPattern(tab.url,pattern))) return null;
        if (item.type === 'separator') return {type:'separator'};
        const children = [...menus.values()].filter(child=>child.parentId===item.id).map(build).filter(Boolean);
        return { label: item.title?.replace('%s', params.selectionText || '') || 'Extension', enabled: item.enabled !== false, type:children.length?'submenu':['checkbox','radio'].includes(item.type)?item.type:'normal', checked:!!item.checked,
          ...(children.length ? {submenu:children} : { click: () => this.emit('contextMenus.onClicked', [{ menuItemId: item.id, parentMenuItemId:item.parentId, pageUrl: tab.url, selectionText: params.selectionText, srcUrl: params.srcURL, linkUrl: params.linkURL }, this.tabInfo(tab)], id) }) };
      };
      result.push(...[...menus.values()].filter(item=>!item.parentId).map(build).filter(Boolean));
    }
    return result;
  }
  async invoke(event, method, args) {
    const extension = this.caller(event), id = extension.id;
    if (typeof method !== 'string' || !Array.isArray(args)) throw new Error('Invalid extension request.');
    const manifest = extension.manifest, permissions = manifest.permissions || [];
    const ownPage = method === 'tabs.create' && args[0]?.url?.startsWith(extension.url);
    if (method.startsWith('tabs.') && method !== 'tabs.getCurrent' && !ownPage && !permissions.includes('tabs')) throw new Error('Tab permission is required.');
    if (method.startsWith('webNavigation.') && !permissions.includes('webNavigation')) throw new Error('Navigation permission is required.');
    if (method.startsWith('contextMenus.') && !permissions.includes('contextMenus')) throw new Error('Context menu permission is required.');
    const [first, second] = args;
    if (method.startsWith('browserAction.')) {
      const operation = method.split('.')[1], state = this.actions.get(id) || { popup: manifest.browser_action?.default_popup || '', title: extension.name, badgeText: '', badgeBackgroundColor: '#777777' };
      this.actions.set(id, state);
      const names = { Popup: 'popup', Title: 'title', BadgeText: 'badgeText', BadgeBackgroundColor: 'badgeBackgroundColor' };
      for (const [suffix, key] of Object.entries(names)) {
        if (operation === 'get' + suffix) return state[key];
        if (operation === 'set' + suffix) { state[key] = first?.[key] ?? first?.text ?? first?.color; return; }
      }
      if (operation === 'setIcon') { state.icon = first?.path; return; }
      if (operation === 'enable' || operation === 'disable') { state.enabled = operation === 'enable'; return; }
      throw new Error('Unsupported extension action.');
    }
    switch (method) {
      case 'tabs.insertCSS': case 'tabs.removeCSS': case 'tabs.executeScript': {
        const tab = this.findTab(typeof first === 'number' ? first : undefined), options = typeof first === 'number' ? second : first, wc = tab.view.webContents;
        const origins = [...(manifest.host_permissions || []), ...permissions].filter(value => typeof value === 'string');
        const allowedHost = origins.some(pattern => { if (pattern === '<all_urls>') return /^https?:/.test(tab.url); try { return new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*') + '$').test(tab.url); } catch { return false; } });
        if (!allowedHost) throw new Error('This extension cannot access the page.');
        let code = options?.code;
        if (options?.file) { const root = path.resolve(extension.path), file = path.resolve(root, options.file); if (!file.startsWith(root + path.sep)) throw new Error('Invalid extension file.'); code = await fs.readFile(file, 'utf8'); }
        if (typeof code !== 'string') throw new Error('Missing extension script or style.');
        if (options.frameId && options.frameId !== 0 || options.allFrames && wc.mainFrame.framesInSubtree.length > 1) throw new Error('Legacy script/style injection into subframes is not supported. Use chrome.scripting.');
        const styleKey = JSON.stringify([id,wc.id,code]);
        if (method === 'tabs.insertCSS') { this.styles.set(styleKey, await wc.insertCSS(code, { cssOrigin: options.cssOrigin || 'author' })); return; }
        if (method === 'tabs.removeCSS') { const key = this.styles.get(styleKey); if (key) { await wc.removeInsertedCSS(key); this.styles.delete(styleKey); } return; }
        return [await wc.executeJavaScriptInIsolatedWorld(1001, [{ code }])];
      }
      case 'tabs.query': return this.browser.tabs().map(tab => this.tabInfo(tab)).filter(tab => (first?.active === undefined || tab.active === first.active) && (first?.windowId === undefined || first.windowId === -2 || tab.windowId === first.windowId) && (first?.currentWindow !== true || tab.windowId === this.browser.window()?.id) && (first?.incognito === undefined || !first.incognito) && (!first?.url || (Array.isArray(first.url) ? first.url : [first.url]).some(pattern => matchesPattern(tab.url, pattern))) && (!first?.title || matchesPattern(tab.title, first.title)));
      case 'tabs.get': return this.tabInfo(this.findTab(first));
      case 'tabs.getCurrent': { const tab = this.browser.tabs().find(t => t.view.webContents === event.sender); return tab ? this.tabInfo(tab) : undefined; }
      case 'tabs.create': {
        if (first?.url && !/^https?:\/\//.test(first.url) && !first.url.startsWith(extension.url)) throw new Error('Unsupported extension tab URL.');
        const tab = this.browser.create('', first?.active === false, false); if (!tab) throw new Error('Tab limit reached.');
        if (first?.url?.startsWith(extension.url)) { tab.kind = 'extension'; tab.url = first.url; tab.title = extension.name; this.browser.ensureView(tab); await tab.view.webContents.loadURL(first.url); }
        else if (first?.url) { tab.kind = 'web'; tab.url = first.url; tab.title = new URL(first.url).hostname; this.browser.ensureView(tab); await tab.view.webContents.loadURL(first.url); }
        else this.browser.ensureView(tab);
        return this.tabInfo(tab);
      }
      case 'tabs.update': {
        const tab = this.findTab(typeof first === 'number' ? first : undefined), options = typeof first === 'number' ? second : first, wc = tab.view.webContents;
        if (options?.active) this.browser.select(tab.id);
        if (typeof options?.muted === 'boolean') wc.setAudioMuted(options.muted);
        if (options?.url) { if (!/^https?:\/\//.test(options.url) && !options.url.startsWith(extension.url)) throw new Error('Unsupported tab URL.'); await wc.loadURL(options.url); }
        return this.tabInfo(tab);
      }
      case 'tabs.remove': for (const tabId of Array.isArray(first) ? first : [first]) this.browser.close(this.findTab(tabId).id); return;
      case 'webNavigation.getAllFrames': { const wc = this.findTab(first.tabId).view.webContents; return wc.mainFrame.framesInSubtree.map(frame => ({ frameId: frame === wc.mainFrame ? 0 : frame.routingId, parentFrameId: frame === wc.mainFrame ? -1 : frame.parent === wc.mainFrame ? 0 : frame.parent?.routingId, url: frame.url || 'about:blank', processId: frame.processId, errorOccurred: false })); }
      case 'webNavigation.getFrame': { const wc = this.findTab(first.tabId).view.webContents, frame = wc.mainFrame.framesInSubtree.find(frame => (frame === wc.mainFrame ? 0 : frame.routingId) === first.frameId); return frame ? { url: frame.url, parentFrameId: frame.parent ? frame.parent === wc.mainFrame ? 0 : frame.parent.routingId : -1, errorOccurred: false } : null; }
      case 'windows.get': case 'windows.getCurrent': case 'windows.getLastFocused': return this.windowInfo();
      case 'windows.getAll': return this.windowInfo() ? [this.windowInfo()] : [];
      case 'windows.update': if (second?.focused) this.browser.window()?.focus(); return this.windowInfo();
      case 'contextMenus.create': { const menus = this.menus.get(id) || new Map(); menus.set(first.id, first); this.menus.set(id, menus); return first.id; }
      case 'contextMenus.remove': this.menus.get(id)?.delete(first); return;
      case 'contextMenus.removeAll': this.menus.delete(id); return;
      case 'contextMenus.update': if (this.menus.get(id)?.has(first)) Object.assign(this.menus.get(id).get(first), second); return;
      case 'runtime.setUninstallURL': return; // Flashborn does not open third-party pages when removing an extension.
      case 'runtime.openOptionsPage': { const page = manifest.options_ui?.page || manifest.options_page; if (!page || page.includes('..') || /^[a-z]+:/i.test(page)) throw new Error('No extension options page.'); return this.invoke(event, 'tabs.create', [{ url: extension.url + page }]).then(() => undefined); }
      default: throw new Error('Unsupported extension API: ' + method);
    }
  }
}
module.exports = { ExtensionBridge };
