'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, protocol, net, dialog, shell, Menu, nativeTheme, clipboard } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { resolveInput, isWebURL, containedPath, isSWF } = require('./core');
const { Store } = require('./store');
const { NativeFlash, nativeAvailable } = require('./native-flash');
const { isFlashFallbackURL, detectionScript } = require('./legacy/compat');

protocol.registerSchemesAsPrivileged([{ scheme: 'flashborn', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const testMode = process.env.FLASHBORN_TEST === '1';
if (testMode) process.on('uncaughtException', error => { console.error('TEST MAIN EXCEPTION', error.stack || error); app.exit(1); });
if (testMode && process.env.FLASHBORN_PROFILE) app.setPath('userData', process.env.FLASHBORN_PROFILE);
const gotLock = testMode || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.setAppUserModelId('com.flashborn.browser');
nativeTheme.themeSource = 'dark';

const UI_URL = 'flashborn://ui/index.html';
const MAX_SWF_SIZE = 256 * 1024 * 1024;
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash', '.json': 'application/json', '.mp3': 'audio/mpeg', '.xml': 'text/xml', '.txt': 'text/plain' };
let win, store, browsingSession, activeId, panel = null, collapsed = false, closing = false;
const tabs = [];
const downloadItems = new Map();
const permissions = new Map();
const closedTabs = [];
let stateTimer, lastMenu, menuOpen = false;

const activeTab = () => tabs.find(t => t.id === activeId);
const live = t => !!t?.view?.webContents && !t.view.webContents.isDestroyed();

function publicTab(t) {
  const wc = live(t) ? t.view.webContents : null;
  if (t.native) return { id: t.id, kind: t.kind, title: t.title, url: t.url, loading: t.loading, error: t.error, native: true,
    muted: !!t.native.state.muted, audible: !!t.native.state.audible, canBack: !!t.native.state.canBack, canForward: !!t.native.state.canForward, zoom: t.native.state.zoom || 100 };
  return { id: t.id, kind: t.kind, title: t.title, url: t.url, loading: t.loading, error: t.error, muted: wc?.isAudioMuted() || false, audible: wc?.isCurrentlyAudible() || false,
    canBack: wc?.navigationHistory.canGoBack() || false, canForward: wc?.navigationHistory.canGoForward() || false, zoom: Math.round((wc?.getZoomFactor() || 1) * 100) };
}
function getState() {
  return { tabs: tabs.map(publicTab), activeId, panel, collapsed, menuOpen, maximized: win?.isMaximized(), fullscreen: win?.isFullScreen(), bookmarks: store.data.bookmarks,
    history: store.data.history, library: store.data.library, downloads: store.data.downloads, settings: store.data.settings,
    flashReady: nativeAvailable(), version: app.getVersion(), chromium: process.versions.chrome, flashVersion: '32.0.0.363', flashRuntime: '9.4.4' };
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
  store.data.tabs = tabs.filter(t => t.kind === 'web').slice(0, 30).map(t => ({ url: t.url, title: t.title, native: !!t.native }));
  store.save();
}
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  for (const t of tabs) {
    const full = win.isFullScreen();
    const left = full ? 0 : collapsed ? 68 : 248;
    const top = full ? 0 : 100;
    const rect = { x: left, y: top, width: Math.max(1, width - left), height: Math.max(1, height - top - (full ? 0 : 24)) };
    if (live(t)) { t.view.setBounds(rect); t.view.setVisible(!t.native && t.id === activeId && !panel && !t.error); }
    if (t.native) t.native.bounds(rect, t.id === activeId && !panel && !t.error);
  }
}
function selectTab(id) {
  const t = tabs.find(t => t.id === id);
  if (!t) return;
  activeId = id;
  panel = null;
  layout();
  if (t.native && !t.error) t.native.focus();
  else if (live(t) && !t.error) t.view.webContents.focus();
  sendState(true);
}
function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  if (index < 0) return;
  const t = tabs[index];
  clearTimeout(t.flashDetectionTimer);
  if (t.native) t.native.dispose();
  if (t.kind === 'web') closedTabs.push(t.url);
  if (closedTabs.length > 20) closedTabs.shift();
  if (live(t)) {
    win.contentView.removeChildView(t.view);
    t.view.webContents.close();
    t.view = null;
  }
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
    if (store.data.settings.flashEnabled && !t.native && !t.forceModern && isFlashFallbackURL(destination)) {
      const original = isWebURL(wc.getURL()) ? wc.getURL() : t.url;
      if (isWebURL(original) && new URL(original).origin === new URL(destination).origin && !isFlashFallbackURL(original)) { event.preventDefault(); activateNative(t, original).catch(e => showError(t, e.message)); return; }
    }
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
      detectFlashFrames(t);
    }
  });
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) showError(t, description === 'ERR_INTERNET_DISCONNECTED' ? 'You appear to be offline. Check your connection and try again.' : `Could not load this page (${description}).`);
  });
  wc.on('did-frame-finish-load', () => detectFlashFrames(t));
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
function detectFlashFrames(t) {
  clearTimeout(t.flashDetectionTimer);
  if (!store.data.settings.flashEnabled || t.native || t.forceModern || t.kind !== 'web') return;
  t.flashDetectionTimer = setTimeout(async () => {
    if (!live(t) || t.native || t.kind !== 'web') return;
    const found = await Promise.all(t.view.webContents.mainFrame.framesInSubtree.map(frame => frame.executeJavaScript(detectionScript).catch(() => false)));
    if (found.some(Boolean) && live(t) && !t.native) activateNative(t, t.url).catch(e => showError(t, e.message));
  }, 120);
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
    if (t.native) { t.native.dispose(); t.native = null; }
    if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
      t.kind = 'home'; t.url = ''; t.title = 'New tab'; t.loading = false;
    layout(); persistTabs(); sendState(true); return;
  }
  if (target.type === 'file') { await openLocal(target.path, t); return; }
  if (target.type === 'flash') { await loadFlash(t, { url: target.url }); return; }
  if (t.native) { t.native.dispose(); t.native = null; }
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
  t.flashSource = source; t.kind = 'flash'; t.error = null;
  t.title = source.title || decodeURIComponent(new URL(source.url).pathname.split('/').pop() || 'Flash player');
  t.url = source.url || pathToFileURL(source.path).href;
  await ensureNative(t);
  layout(); sendState(true);
  await t.native.call('movie', { ...source, title: t.title });
}
async function ensureNative(t) {
  if (t.native?.child && t.native.child.exitCode !== null) { t.native.dispose(); t.native = null; }
  if (t.native) { await t.native.ready; return; }
  if (!nativeAvailable()) throw new Error('Native Flash files are missing. Reinstall Flashborn.');
  t.native = new NativeFlash(win, t.id, message => {
    if (message.type === 'ready') layout();
    else if (message.type === 'state') {
      t.loading = !!message.state.loading;
      if (t.kind === 'web' && isWebURL(message.state.url)) { t.url = message.state.url; t.title = message.state.title || new URL(t.url).hostname; }
      if (!t.loading && t.kind === 'web' && isWebURL(t.url)) {
        store.data.history = [{ id: crypto.randomUUID(), url: t.url, title: t.title, visitedAt: new Date().toISOString() }, ...store.data.history.filter(h => h.url !== t.url)].slice(0, 500);
        persistTabs();
      }
      sendState();
    } else if (message.type === 'new-tab') { const created = createTab(); activateNative(created, message.url).catch(e => showError(created, e.message)); }
    else if (message.type === 'download' && isWebURL(message.url)) { ensureView(t); t.view.webContents.downloadURL(message.url); }
    else if (message.type === 'key') handleKeys({ preventDefault() {} }, message.input);
    else if (message.type === 'fullscreen') win.setFullScreen(message.value);
    else if (message.type === 'find') win.webContents.send('browser:find', message.result);
    else if (message.type === 'error') showError(t, message.message);
  });
  layout();
  await t.native.ready;
  layout();
}
async function activateNative(t, url) {
  t.kind = 'web'; t.url = url; t.title = new URL(url).hostname; t.error = null; t.loading = true;
  await ensureNative(t);
  if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
  layout(); sendState(true);
  await t.native.call('navigate', { url });
}
function reload(t = activeTab()) {
  if (t?.native?.child && t.native.child.exitCode !== null) { const url = t.url; t.native.dispose(); t.native = null; (t.kind === 'flash' ? loadFlash(t, t.flashSource) : activateNative(t, url)).catch(e => showError(t, e.message)); return; }
  if (t?.native) { t.error = null; layout(); t.native.call('reload').catch(e => showError(t, e.message)); return; }
  if (!live(t)) return;
  t.error = null;
  layout();
  t.view.webContents.reload();
  sendState(true);
}

async function handleProtocol(request) {
  try {
    const url = new URL(request.url);
    if (url.hostname !== 'ui') return new Response('Not found', { status: 404 });
    const filename = containedPath(path.join(__dirname, 'ui'), decodeURIComponent(url.pathname.slice(1) || 'index.html'));
    return new Response(await fsp.readFile(filename), { headers: {
      'Content-Type': mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'"
    } });
  } catch (e) { return new Response(e.message, { status: 400 }); }
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
  else if (mod && key === 'p') command('print');
  else if (mod && ['+', '=', '-', '0'].includes(key)) zoom(key === '0' ? 0 : key === '-' ? -1 : 1);
  else if (mod && key === 'tab') { const index = tabs.findIndex(t => t.id === activeId); selectTab(tabs[(index + (input.shift ? tabs.length - 1 : 1)) % tabs.length].id); }
  else if (mod && /^[1-9]$/.test(key)) selectTab((key === '9' ? tabs.at(-1) : tabs[Number(key) - 1])?.id);
  else if (input.alt && key === 'arrowleft') command('back');
  else if (input.alt && key === 'arrowright') command('forward');
  else if (key === 'f11') win.setFullScreen(!win.isFullScreen());
  else if (key === 'f12') wc?.toggleDevTools();
  else if (key === 'escape' && win.isFullScreen()) win.setFullScreen(false);
  else handled = false;
  if (handled) event.preventDefault();
}
function zoom(direction) {
  if (activeTab()?.native) { activeTab().native.call('zoom', { direction }).catch(console.error); return; }
  const t = activeTab(); if (!live(t)) return;
  const wc = t.view.webContents;
  wc.setZoomFactor(direction === 0 ? 1 : Math.max(0.25, Math.min(3, wc.getZoomFactor() + direction * .1)));
  sendState(true);
}

function showBrowserMenu() {
  const t = activeTab();
  const run = (action, args) => () => command(action, args).catch(error => dialog.showErrorBox('Flashborn', error.message));
  lastMenu = Menu.buildFromTemplate([
    { label: 'New tab', accelerator: 'Ctrl+T', click: run('new-tab') },
    { label: 'Open Flash file…', accelerator: 'Ctrl+O', click: run('open-file') },
    { label: 'Native Adobe Flash mode', type: 'checkbox', checked: !!t?.native, enabled: isWebURL(t?.url), click: run('native-mode') },
    { type: 'separator' },
    { label: 'Downloads', accelerator: 'Ctrl+J', click: run('panel', { name: 'downloads' }) },
    { label: 'Bookmarks', click: run('panel', { name: 'bookmarks' }) },
    { label: 'Find in page', accelerator: 'Ctrl+F', click: () => { win.webContents.focus(); win.webContents.send('browser:find', { open: true }); } },
    { label: 'Print…', accelerator: 'Ctrl+P', click: run('print') },
    { type: 'separator' },
    { label: `Zoom (${publicTab(t).zoom}%)`, submenu: [ { label: 'Zoom in', click: run('zoom', { direction: 1 }) }, { label: 'Zoom out', click: run('zoom', { direction: -1 }) }, { label: 'Reset zoom', click: run('zoom', { direction: 0 }) } ] },
    { label: t?.native?.state.muted || live(t) && t.view.webContents.isAudioMuted() ? 'Unmute tab' : 'Mute tab', click: run('mute') },
    { type: 'separator' },
    { label: 'Settings', click: run('panel', { name: 'settings' }) },
    { label: 'About Flashborn', click: run('panel', { name: 'about' }) }
  ]);
  menuOpen = true; sendState(true);
  // A Windows popup menu is above native plugin HWNDs as well as Chromium views.
  lastMenu.popup({ window: win, x: Math.max(0, win.getContentSize()[0] - 320), y: 92, callback: () => { menuOpen = false; sendState(true); } });
}

async function command(action, args = {}) {
  const t = activeTab(); const wc = live(t) ? t.view.webContents : null;
  switch (action) {
    case 'state': return getState();
    case 'menu': showBrowserMenu(); break;
    case 'native-mode': if (t && isWebURL(t.url)) { if (t.native) { t.native.dispose(); t.native = null; t.forceModern = true; await navigate(t, t.url); } else { t.forceModern = false; await activateNative(t, t.url); } } break;
    case 'navigate': panel = null; await navigate(t, args.value); break;
    case 'new-tab': createTab(typeof args.url === 'string' ? args.url : ''); break;
    case 'select-tab': selectTab(args.id); break;
    case 'close-tab': closeTab(args.id); break;
    case 'back': if (t?.native) await t.native.call('back'); else if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (t?.native) await t.native.call('forward'); else if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'reload': reload(); break;
    case 'stop': if (t?.native) await t.native.call('stop'); else wc?.stop(); break;
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
      await browsingSession.clearStorageData(); await browsingSession.clearCache(); permissions.clear();
      await Promise.all(tabs.filter(tab => tab.native).map(tab => tab.native.call('clear-data'))); break;
    }
    case 'settings': {
      if (['duckduckgo', 'google', 'bing'].includes(args.searchEngine)) store.data.settings.searchEngine = args.searchEngine;
      if (typeof args.restoreTabs === 'boolean') store.data.settings.restoreTabs = args.restoreTabs;
      if (typeof args.flashEnabled === 'boolean' && store.data.settings.flashEnabled !== args.flashEnabled) {
        store.data.settings.flashEnabled = args.flashEnabled;
      }
      store.save(); break;
    }
    case 'download-cancel': downloadItems.get(args.id)?.cancel(); break;
    case 'download-open': { const d = store.data.downloads.find(d => d.id === args.id && d.state === 'completed'); if (d?.path) { const error = await shell.openPath(d.path); if (error) throw new Error(error); } break; }
    case 'download-reveal': { const d = store.data.downloads.find(d => d.id === args.id); if (d?.path) shell.showItemInFolder(d.path); break; }
    case 'download-clear': store.data.downloads = store.data.downloads.filter(d => downloadItems.has(d.id)); store.save(); break;
    case 'find': if (t?.native) await t.native.call('find', args); else if (wc && typeof args.text === 'string') { if (args.text) wc.findInPage(args.text.slice(0, 2000), { forward: args.forward !== false, findNext: args.next !== true }); else wc.stopFindInPage('clearSelection'); } break;
    case 'mute': if (t?.native) await t.native.call('mute'); else if (wc) wc.setAudioMuted(!wc.isAudioMuted()); break;
    case 'zoom': zoom([-1, 0, 1].includes(args.direction) ? args.direction : 0); break;
    case 'print': if (t?.native) await t.native.call('print'); else wc?.print(); break;
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
  win = new BrowserWindow({ width: 1360, height: 900, minWidth: 800, minHeight: 560, backgroundColor: '#212121', frame: false, show: !testMode,
    title: 'Flashborn', icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, offscreen: testMode && process.env.FLASHBORN_OFFSCREEN === '1', backgroundThrottling: !testMode } });
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
    for (const t of tabs) { if (t.native) t.native.dispose(); if (live(t)) t.view.webContents.close(); }
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
  if (store.data.settings.restoreTabs) for (const tab of saved.slice(0, 20)) if (isWebURL(tab.url)) { const restored = createTab(tab.native ? '' : tab.url, true); if (tab.native) activateNative(restored, tab.url).catch(e => showError(restored, e.message)); }
  const file = process.argv.find(arg => arg.toLowerCase().endsWith('.swf') && fs.existsSync(arg));
  if (file) await openLocal(file);
  if (testMode) {
    // Accessible only from main-process Playwright evaluation in a test launch.
    global.__flashborn = { getState, command, tabs, activeTab, openLocal, win, browsingSession, get menu() { return lastMenu; } };
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
