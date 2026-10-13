'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, protocol, net, dialog, shell, Menu, nativeTheme, clipboard } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { resolveInput, isWebURL, containedPath, isSWF } = require('./core');
const { Store } = require('./store');

protocol.registerSchemesAsPrivileged([{ scheme: 'flashborn', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const testMode = process.env.FLASHBORN_TEST === '1';
if (testMode && process.env.FLASHBORN_PROFILE) app.setPath('userData', process.env.FLASHBORN_PROFILE);
const gotLock = testMode || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.setAppUserModelId('com.flashborn.browser');
nativeTheme.themeSource = 'dark';

const UI_URL = 'flashborn://ui/index.html';
const MAX_SWF_SIZE = 256 * 1024 * 1024;
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash', '.json': 'application/json', '.mp3': 'audio/mpeg', '.xml': 'text/xml', '.txt': 'text/plain' };
let win, store, browsingSession, flashExtension, extensionError = '', activeId, panel = null, collapsed = false, closing = false;
const tabs = [];
const movies = new Map();
const downloadItems = new Map();
const permissions = new Map();
const closedTabs = [];
let stateTimer;

const ruffleDirectory = () => app.isPackaged ? path.join(process.resourcesPath, 'ruffle') : path.join(__dirname, '..', 'node_modules', '@ruffle-rs', 'ruffle');
const extensionDirectory = () => app.isPackaged ? path.join(process.resourcesPath, 'flash-extension') : path.join(__dirname, '..', 'vendor', 'flash-extension');
const activeTab = () => tabs.find(t => t.id === activeId);
const live = t => t?.view && !t.view.webContents.isDestroyed();

function publicTab(t) {
  const wc = live(t) ? t.view.webContents : null;
  return { id: t.id, kind: t.kind, title: t.title, url: t.url, loading: t.loading, error: t.error, muted: wc?.isAudioMuted() || false, audible: wc?.isCurrentlyAudible() || false,
    canBack: wc?.navigationHistory.canGoBack() || false, canForward: wc?.navigationHistory.canGoForward() || false, zoom: Math.round((wc?.getZoomFactor() || 1) * 100) };
}
function getState() {
  return { tabs: tabs.map(publicTab), activeId, panel, collapsed, maximized: win?.isMaximized(), fullscreen: win?.isFullScreen(), bookmarks: store.data.bookmarks,
    history: store.data.history, library: store.data.library, downloads: store.data.downloads, settings: store.data.settings,
    flashReady: !!flashExtension, extensionError, version: app.getVersion(), chromium: process.versions.chrome, ruffle: '0.7.1' };
}
function sendState(immediate = false) {
  if (closing) return;
  if (immediate) {
    clearTimeout(stateTimer);
    stateTimer = null;
    if (win && !win.isDestroyed()) win.webContents.send('browser:state', getState());
  } else if (!stateTimer) {
    stateTimer = setTimeout(() => { stateTimer = null; sendState(true); }, 40);
  }
}
function persistTabs() {
  store.data.tabs = tabs.filter(t => t.kind === 'web').slice(0, 30).map(t => ({ url: t.url, title: t.title }));
  store.save();
}
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  for (const t of tabs) if (live(t)) {
    const full = win.isFullScreen();
    const left = full ? 0 : collapsed ? 68 : 248;
    const top = full ? 0 : 100;
    t.view.setBounds({ x: left, y: top, width: Math.max(1, width - left), height: Math.max(1, height - top - (full ? 0 : 24)) });
    t.view.setVisible(t.id === activeId && !panel && !t.error);
  }
}
function selectTab(id) {
  const t = tabs.find(t => t.id === id);
  if (!t) return;
  activeId = id;
  panel = null;
  layout();
  if (live(t) && !t.error) t.view.webContents.focus();
  sendState(true);
}
function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  if (index < 0) return;
  const t = tabs[index];
  if (t.kind === 'web') closedTabs.push(t.url);
  if (closedTabs.length > 20) closedTabs.shift();
  if (live(t)) {
    win.contentView.removeChildView(t.view);
    t.view.webContents.close();
  }
  if (t.movieId) movies.delete(t.movieId);
  tabs.splice(index, 1);
  if (!tabs.length) createTab();
  else if (activeId === id) selectTab(tabs[Math.min(index, tabs.length - 1)].id);
  persistTabs();
  sendState(true);
}
function wireContents(t) {
  const wc = t.view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (isWebURL(url)) createTab(url);
    return { action: 'deny' };
  });
  wc.on('will-attach-webview', event => event.preventDefault());
  wc.on('will-frame-navigate', (event, url) => {
    const destination = event.url || url;
    if (isWebURL(destination) || destination === 'about:blank' || destination.startsWith('blob:')) return;
    event.preventDefault();
  });
  wc.on('will-navigate', (event, url) => {
    const destination = event.url || url;
    if (!isWebURL(destination)) { event.preventDefault(); return; }
    if (t.kind === 'flash') { event.preventDefault(); createTab(destination); return; }
    if (/\.swf$/i.test(new URL(destination).pathname)) { event.preventDefault(); loadFlash(t, { url: destination }).catch(e => showError(t, e.message)); }
  });
  wc.on('will-redirect', (event, url) => {
    const destination = event.url || url;
    if (!isWebURL(destination)) event.preventDefault();
    else if (/\.swf$/i.test(new URL(destination).pathname)) { event.preventDefault(); loadFlash(t, { url: destination }).catch(e => showError(t, e.message)); }
  });
  wc.on('did-start-loading', () => { t.loading = true; sendState(); });
  wc.on('did-stop-loading', () => { t.loading = false; sendState(); });
  wc.on('page-title-updated', (_event, title) => { if (t.kind === 'web') t.title = title.slice(0, 200); sendState(); });
  const navigated = () => {
    if (t.kind === 'web') {
      const url = wc.getURL();
      if (isWebURL(url)) { t.url = url; t.title = wc.getTitle() || new URL(url).hostname; t.error = null; }
      persistTabs();
    }
    layout(); sendState();
  };
  wc.on('did-navigate', navigated);
  wc.on('did-navigate-in-page', navigated);
  wc.on('did-finish-load', () => {
    if (t.kind === 'web' && isWebURL(t.url)) {
      const item = { id: crypto.randomUUID(), url: t.url, title: wc.getTitle() || t.title, visitedAt: new Date().toISOString() };
      store.data.history = [item, ...store.data.history.filter(h => h.url !== t.url)].slice(0, 500);
      store.save(); sendState();
    }
  });
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) showError(t, description === 'ERR_INTERNET_DISCONNECTED' ? 'You appear to be offline. Check your connection and try again.' : `Could not load this page (${description}).`);
  });
  wc.on('render-process-gone', (_event, details) => showError(t, `This tab stopped responding (${details.reason}). Reload to continue.`));
  wc.on('found-in-page', (_event, result) => { if (t.id === activeId) win.webContents.send('browser:find', result); });
  wc.on('audio-state-changed', () => sendState());
  wc.on('enter-html-full-screen', () => { win.setFullScreen(true); layout(); sendState(true); });
  wc.on('leave-html-full-screen', () => { win.setFullScreen(false); layout(); sendState(true); });
  wc.on('before-input-event', (event, input) => handleKeys(event, input));
  wc.on('context-menu', (_event, params) => {
    const items = [];
    if (params.isEditable) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' }, { label: 'Search selection', click: () => createTab((require('./core').SEARCH_ENGINES[store.data.settings.searchEngine] || require('./core').SEARCH_ENGINES.duckduckgo) + encodeURIComponent(params.selectionText.slice(0, 2000))) });
    if (isWebURL(params.linkURL)) items.push({ label: 'Open link in new tab', click: () => createTab(params.linkURL) }, { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) });
    if (isWebURL(params.srcURL)) items.push({ label: 'Save image / media as…', click: () => wc.downloadURL(params.srcURL) });
    if (items.length) items.push({ type: 'separator' });
    items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: 'Reload', click: () => reload(t) }, { label: 'Print…', click: () => wc.print() });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}
function ensureView(t) {
  if (live(t)) return;
  t.view = new WebContentsView({ webPreferences: { session: browsingSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: true, navigateOnDragDrop: false, backgroundThrottling: !testMode } });
  t.view.setBackgroundColor('#212121');
  win.contentView.addChildView(t.view);
  wireContents(t);
  layout();
}
function showError(t, message) { t.error = message; t.loading = false; layout(); sendState(true); }
async function navigate(t, value) {
  const target = resolveInput(value, store.data.settings.searchEngine);
  t.error = null;
  if (target.type === 'home') {
    if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
    if (t.movieId) movies.delete(t.movieId);
    t.kind = 'home'; t.url = ''; t.title = 'New tab'; t.loading = false; t.movieId = null;
    layout(); persistTabs(); sendState(true); return;
  }
  if (target.type === 'file') { await openLocal(target.path, t); return; }
  if (target.type === 'flash') { await loadFlash(t, { url: target.url }); return; }
  if (t.movieId) { movies.delete(t.movieId); t.movieId = null; }
  t.kind = 'web'; t.url = target.url; t.title = new URL(target.url).hostname; t.loading = true;
  ensureView(t); layout(); sendState(true);
  try { await t.view.webContents.loadURL(target.url); } catch (e) { if (e.code !== 'ERR_ABORTED') showError(t, e.message); }
}
function createTab(value = '', background = false) {
  if (tabs.length >= 50) { dialog.showMessageBox(win, { type: 'info', message: 'Close a tab before opening another.', detail: 'Flashborn supports up to 50 open tabs.' }); return; }
  const t = { id: crypto.randomUUID(), kind: 'home', url: '', title: 'New tab', loading: false, error: null, view: null };
  tabs.push(t);
  if (!background) selectTab(t.id);
  if (value) navigate(t, value).catch(e => showError(t, e.message));
  sendState(true);
  return t;
}

async function openLocal(filename, existing) {
  const absolute = path.resolve(filename);
  if (path.extname(absolute).toLowerCase() !== '.swf') throw new Error('Choose a .swf Flash movie or game.');
  const stats = await fsp.stat(absolute);
  if (!stats.isFile() || stats.size > MAX_SWF_SIZE) throw new Error('Choose a SWF file smaller than 256 MB.');
  const handle = await fsp.open(absolute, 'r');
  const header = Buffer.alloc(8);
  try { await handle.read(header, 0, 8, 0); } finally { await handle.close(); }
  if (!isSWF(header)) throw new Error('This file does not contain a valid SWF header.');
  let entry = store.data.library.find(e => e.path === absolute);
  if (!entry) {
    entry = { id: crypto.randomUUID(), path: absolute, title: path.basename(absolute, '.swf'), addedAt: new Date().toISOString() };
    store.data.library.unshift(entry);
  }
  entry.lastPlayedAt = new Date().toISOString();
  store.save();
  const t = existing || createTab();
  await loadFlash(t, { path: absolute, title: entry.title });
}
async function loadFlash(t, source) {
  if (t.movieId) movies.delete(t.movieId);
  const id = crypto.randomBytes(24).toString('hex');
  movies.set(id, source);
  t.movieId = id; t.kind = 'flash'; t.error = null;
  t.title = source.title || decodeURIComponent(new URL(source.url).pathname.split('/').pop() || 'Flash player');
  t.url = source.url || pathToFileURL(source.path).href;
  ensureView(t); layout(); sendState(true);
  await t.view.webContents.loadURL(`flashborn://player/index.html?movie=${id}`);
}
function reload(t = activeTab()) {
  if (!live(t)) return;
  t.error = null;
  layout();
  t.view.webContents.reload();
  sendState(true);
}

async function handleProtocol(request) {
  try {
    const url = new URL(request.url);
    const headers = {};
    let filename;
    if (url.hostname === 'ui' || url.hostname === 'player') {
      filename = containedPath(path.join(__dirname, 'ui'), decodeURIComponent(url.pathname.slice(1) || 'index.html'));
      if (url.hostname === 'player' && url.pathname === '/index.html') filename = path.join(__dirname, 'ui', 'player.html');
      headers['Content-Security-Policy'] = url.hostname === 'ui'
        ? "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'"
        : "default-src 'self'; script-src 'self' flashborn://ruffle 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; connect-src 'self' flashborn://ruffle flashborn://movie https: http:; media-src 'self' blob: https: http:; object-src 'none'; frame-src 'none'";
    } else if (url.hostname === 'ruffle') {
      filename = containedPath(ruffleDirectory(), decodeURIComponent(url.pathname.slice(1)));
      headers['Access-Control-Allow-Origin'] = 'flashborn://player';
    } else if (url.hostname === 'movie') {
      const parts = url.pathname.slice(1).split('/');
      const source = movies.get(parts.shift());
      if (!source) return new Response('Movie no longer available', { status: 404 });
      headers['Access-Control-Allow-Origin'] = 'flashborn://player';
      headers['Cache-Control'] = 'no-store';
      if (parts.join('/') === 'config.json') {
        return Response.json({ title: source.title || new URL(source.url).pathname.split('/').pop(), filename: source.path ? path.basename(source.path) : new URL(source.url).pathname.split('/').pop(),
          url: source.url || null, base: source.path ? `flashborn://movie/${url.pathname.split('/')[1]}/assets/` : new URL('.', source.url).href }, { headers });
      }
      if (parts.join('/') === 'content.swf') {
        if (source.path) filename = source.path;
        else {
          const response = await browsingSession.fetch(source.url, { signal: AbortSignal.timeout(60000) });
          if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
          if (Number(response.headers.get('content-length')) > MAX_SWF_SIZE) throw new Error('SWF exceeds 256 MB');
          const reader = response.body.getReader();
          const chunks = []; let size = 0;
          try {
            while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_SWF_SIZE) throw new Error('SWF exceeds 256 MB'); chunks.push(Buffer.from(value)); }
          } finally { await reader.cancel().catch(() => {}); }
          const bytes = Buffer.concat(chunks);
          if (!isSWF(bytes)) throw new Error('The address did not return a SWF movie.');
          return new Response(bytes, { headers: { ...headers, 'Content-Type': mimeTypes['.swf'] } });
        }
      } else if (source.path && parts.shift() === 'assets') {
        // Local movies can read accompanying assets inside the selected folder only.
        const folder = await fsp.realpath(path.dirname(source.path));
        filename = containedPath(folder, decodeURIComponent(parts.join('/')));
        filename = await fsp.realpath(filename);
        containedPath(folder, path.relative(folder, filename));
      } else return new Response('Not found', { status: 404 });
    } else return new Response('Not found', { status: 404 });
    const data = await fsp.readFile(filename);
    return new Response(data, { headers: { ...headers, 'Content-Type': mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) { return new Response(e.message, { status: 400, headers: { 'Access-Control-Allow-Origin': 'flashborn://player' } }); }
}

async function configureFlash() {
  if (!store.data.settings.flashEnabled) return;
  try { flashExtension = await browsingSession.extensions.loadExtension(extensionDirectory()); extensionError = ''; }
  catch (e) { extensionError = e.message; console.error('Flash extension:', e.message); }
}
function configureSession() {
  const ua = browsingSession.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\sFlashborn\/\S+/, '');
  browsingSession.setUserAgent(ua);
  browsingSession.setPermissionCheckHandler((_wc, permission, origin) => {
    if (permission === 'fullscreen') return true;
    return permissions.get(`${origin}|${permission}`) === true;
  });
  browsingSession.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (permission === 'fullscreen') return callback(true);
    const allowed = ['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'];
    if (!allowed.includes(permission)) return callback(false);
    const origin = details.requestingUrl || wc?.getURL() || '';
    let host; try { host = new URL(origin).origin; } catch { return callback(false); }
    const key = `${host}|${permission}`;
    if (permissions.has(key)) return callback(permissions.get(key));
    const names = { media: 'your camera or microphone', geolocation: 'your location', notifications: 'notifications', 'clipboard-read': 'your clipboard', 'clipboard-sanitized-write': 'copy text to your clipboard' };
    const result = await dialog.showMessageBox(win, { type: 'question', title: 'Site permission', message: `${host} wants access to ${names[permission]}.`, buttons: ['Block', 'Allow'], defaultId: 0, cancelId: 0 });
    permissions.set(key, result.response === 1);
    callback(result.response === 1);
  });
  browsingSession.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (_details, callback) => callback({ cancel: true }));
  browsingSession.webRequest.onHeadersReceived((details, callback) => {
    const header = Object.entries(details.responseHeaders || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.[0] || '';
    if (details.resourceType === 'mainFrame' && /application\/(x-shockwave-flash|futuresplash|vnd.adobe.flash.movie)/i.test(header)) {
      const t = tabs.find(t => live(t) && t.view.webContents.id === details.webContentsId);
      if (t && t.kind === 'web') {
        callback({ cancel: true });
        loadFlash(t, { url: details.url }).catch(e => showError(t, e.message));
        return;
      }
    }
    callback({ responseHeaders: details.responseHeaders });
  });
  browsingSession.on('will-download', (_event, item) => {
    const entry = { id: crypto.randomUUID(), filename: item.getFilename(), url: item.getURL(), path: '', total: item.getTotalBytes(), received: 0, state: 'progressing', startedAt: new Date().toISOString() };
    store.data.downloads.unshift(entry); store.data.downloads = store.data.downloads.slice(0, 100);
    downloadItems.set(entry.id, item);
    item.setSaveDialogOptions({ title: 'Save download', defaultPath: path.join(app.getPath('downloads'), entry.filename) });
    item.on('updated', (_event, state) => { entry.state = state; entry.path = item.getSavePath(); entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); sendState(); });
    item.once('done', (_event, state) => { entry.state = state; entry.path = item.getSavePath(); entry.received = item.getReceivedBytes(); downloadItems.delete(entry.id); store.save(); sendState(true); });
    sendState(true);
  });
}

function handleKeys(event, input) {
  if (input.type !== 'keyDown') return;
  const key = input.key.toLowerCase();
  const mod = input.control || input.meta;
  let handled = true;
  const t = activeTab(); const wc = live(t) ? t.view.webContents : null;
  if (mod && key === 'l') { win.webContents.focus(); win.webContents.send('browser:focus-address'); }
  else if (mod && key === 't' && input.shift) { const last = closedTabs.pop(); if (last) createTab(last); }
  else if (mod && key === 't') createTab();
  else if (mod && key === 'w') closeTab(activeId);
  else if (mod && key === 'o') command('open-file');
  else if (mod && key === 'r' || key === 'f5') reload();
  else if (mod && key === 'f') { panel = null; win.webContents.focus(); win.webContents.send('browser:find', { open: true }); }
  else if (mod && key === 'd') command('bookmark');
  else if (mod && key === 'h') command('panel', { name: 'history' });
  else if (mod && key === 'j') command('panel', { name: 'downloads' });
  else if (mod && key === 'p') wc?.print();
  else if (mod && ['+', '=', '-', '0'].includes(key)) zoom(key === '0' ? 0 : key === '-' ? -1 : 1);
  else if (mod && key === 'tab') { const index = tabs.findIndex(t => t.id === activeId); selectTab(tabs[(index + (input.shift ? tabs.length - 1 : 1)) % tabs.length].id); }
  else if (mod && /^[1-9]$/.test(key)) selectTab((key === '9' ? tabs.at(-1) : tabs[Number(key) - 1])?.id);
  else if (input.alt && key === 'arrowleft') { if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); }
  else if (input.alt && key === 'arrowright') { if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); }
  else if (key === 'f11') win.setFullScreen(!win.isFullScreen());
  else if (key === 'f12') wc?.toggleDevTools();
  else if (key === 'escape' && win.isFullScreen()) win.setFullScreen(false);
  else handled = false;
  if (handled) event.preventDefault();
}
function zoom(direction) {
  const t = activeTab(); if (!live(t)) return;
  const wc = t.view.webContents;
  wc.setZoomFactor(direction === 0 ? 1 : Math.max(0.25, Math.min(3, wc.getZoomFactor() + direction * .1)));
  sendState(true);
}

async function command(action, args = {}) {
  const t = activeTab(); const wc = live(t) ? t.view.webContents : null;
  switch (action) {
    case 'state': return getState();
    case 'navigate': panel = null; await navigate(t, args.value); break;
    case 'new-tab': createTab(typeof args.url === 'string' ? args.url : ''); break;
    case 'select-tab': selectTab(args.id); break;
    case 'close-tab': closeTab(args.id); break;
    case 'back': if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'reload': reload(); break;
    case 'stop': wc?.stop(); break;
    case 'home': panel = null; await navigate(t, ''); break;
    case 'collapse': collapsed = !collapsed; layout(); break;
    case 'panel': panel = ['bookmarks', 'history', 'downloads', 'library', 'settings', 'about'].includes(args.name) ? args.name : null; layout(); break;
    case 'open-file': {
      const result = await dialog.showOpenDialog(win, { title: 'Open Flash movie or game', filters: [{ name: 'Flash files', extensions: ['swf'] }], properties: ['openFile', 'multiSelections'] });
      for (const file of result.filePaths) await openLocal(file);
      break;
    }
    case 'play-library': { const entry = store.data.library.find(e => e.id === args.id); if (entry) await openLocal(entry.path); break; }
    case 'remove-library': store.data.library = store.data.library.filter(e => e.id !== args.id); store.save(); break;
    case 'bookmark': {
      if (!t || !isWebURL(t.url)) break;
      const existing = store.data.bookmarks.find(b => b.url === t.url);
      if (existing) store.data.bookmarks = store.data.bookmarks.filter(b => b.id !== existing.id);
      else store.data.bookmarks.unshift({ id: crypto.randomUUID(), url: t.url, title: t.title, addedAt: new Date().toISOString() });
      store.save(); break;
    }
    case 'remove-bookmark': store.data.bookmarks = store.data.bookmarks.filter(b => b.id !== args.id); store.save(); break;
    case 'clear-history': store.data.history = []; store.save(); break;
    case 'clear-data': {
      await browsingSession.clearStorageData(); await browsingSession.clearCache(); permissions.clear(); break;
    }
    case 'settings': {
      if (['duckduckgo', 'google', 'bing'].includes(args.searchEngine)) store.data.settings.searchEngine = args.searchEngine;
      if (typeof args.restoreTabs === 'boolean') store.data.settings.restoreTabs = args.restoreTabs;
      if (typeof args.flashEnabled === 'boolean' && store.data.settings.flashEnabled !== args.flashEnabled) {
        store.data.settings.flashEnabled = args.flashEnabled;
        if (!args.flashEnabled && flashExtension) { browsingSession.extensions.removeExtension(flashExtension.id); flashExtension = null; }
        else await configureFlash();
      }
      store.save(); break;
    }
    case 'download-cancel': downloadItems.get(args.id)?.cancel(); break;
    case 'download-open': { const d = store.data.downloads.find(d => d.id === args.id && d.state === 'completed'); if (d?.path) { const error = await shell.openPath(d.path); if (error) throw new Error(error); } break; }
    case 'download-reveal': { const d = store.data.downloads.find(d => d.id === args.id); if (d?.path) shell.showItemInFolder(d.path); break; }
    case 'download-clear': store.data.downloads = store.data.downloads.filter(d => downloadItems.has(d.id)); store.save(); break;
    case 'find': if (wc && typeof args.text === 'string') { if (args.text) wc.findInPage(args.text.slice(0, 2000), { forward: args.forward !== false, findNext: args.next !== true }); else wc.stopFindInPage('clearSelection'); } break;
    case 'mute': if (wc) wc.setAudioMuted(!wc.isAudioMuted()); break;
    case 'zoom': zoom([-1, 0, 1].includes(args.direction) ? args.direction : 0); break;
    case 'print': wc?.print(); break;
    case 'minimize': win.minimize(); break;
    case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close-window': win.close(); break;
    default: throw new Error('Unknown browser command.');
  }
  sendState(true);
  return getState();
}

async function boot() {
  store = new Store(app.getPath('userData'));
  browsingSession = session.fromPartition('persist:flashborn');
  await session.defaultSession.protocol.handle('flashborn', handleProtocol);
  await browsingSession.protocol.handle('flashborn', handleProtocol);
  configureSession();
  await configureFlash();
  win = new BrowserWindow({ width: 1360, height: 900, minWidth: 800, minHeight: 560, backgroundColor: '#212121', frame: false, show: !testMode,
    title: 'Flashborn', icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, offscreen: testMode, backgroundThrottling: !testMode } });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('before-input-event', handleKeys);
  for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(event, () => { layout(); sendState(true); });
  win.on('close', event => {
    if (!closing && downloadItems.size) {
      const response = dialog.showMessageBoxSync(win, { type: 'question', message: 'Downloads are still running.', detail: 'Closing Flashborn will cancel them.', buttons: ['Keep browsing', 'Close browser'], defaultId: 0, cancelId: 0 });
      if (response === 0) { event.preventDefault(); return; }
    }
    persistTabs(); closing = true;
    for (const t of tabs) if (live(t)) t.view.webContents.close();
  });
  win.on('closed', () => { win = null; });
  ipcMain.handle('browser:command', async (event, action, args) => {
    if (event.sender !== win?.webContents || event.senderFrame?.url !== UI_URL) throw new Error('Untrusted command source.');
    if (typeof action !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid browser command.');
    try { return { ok: true, state: await command(action, args) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  await win.loadURL(UI_URL);
  const saved = [...store.data.tabs];
  createTab();
  if (store.data.settings.restoreTabs) for (const tab of saved.slice(0, 20)) if (isWebURL(tab.url)) createTab(tab.url, true);
  const file = process.argv.find(arg => arg.toLowerCase().endsWith('.swf') && fs.existsSync(arg));
  if (file) await openLocal(file);
  if (testMode) {
    // Accessible only from main-process Playwright evaluation in a test launch.
    global.__flashborn = { getState, command, tabs, activeTab, openLocal, movies, win, browsingSession };
  }
}
if (gotLock) app.whenReady().then(boot).catch(error => { console.error(error); dialog.showErrorBox('Flashborn could not start', error.stack || error.message); app.quit(); });
app.on('second-instance', async (_event, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore(); win.focus();
  const file = argv.find(arg => arg.toLowerCase().endsWith('.swf') && fs.existsSync(arg));
  if (file) try { await openLocal(file); } catch (e) { dialog.showErrorBox('Could not open Flash file', e.message); }
});
app.on('window-all-closed', () => app.quit());
