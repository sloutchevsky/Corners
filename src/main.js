'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, protocol, net, dialog, shell, Menu, nativeTheme, clipboard, screen, nativeImage } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { resolveInput, isWebURL, containedPath, isSWF, isPDFURL, reorderItems } = require('./core');
const { contentType, supportedLocalFile, urlSuggestions } = require('./files');
const { Store } = require('./store');
const { NativeFlash, nativeAvailable } = require('./native-flash');
const { isFlashFallbackURL, detectionScript } = require('./legacy/compat');
const { nextZoom } = require('./legacy/zoom');

protocol.registerSchemesAsPrivileged([{ scheme: 'flashborn', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const testMode = process.env.FLASHBORN_TEST === '1';
if (testMode) process.on('uncaughtException', error => { console.error('TEST MAIN EXCEPTION', error.stack || error); app.exit(1); });
if (testMode && process.env.FLASHBORN_PROFILE) app.setPath('userData', process.env.FLASHBORN_PROFILE);
const gotLock = testMode || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.setAppUserModelId('com.flashborn.browser');
nativeTheme.themeSource = 'dark';

const UI_URL = 'flashborn://ui/index.html';
const MENU_URL = 'flashborn://ui/menu.html';
const ZOOM_URL = 'flashborn://ui/zoom.html';
const SUGGEST_URL = 'flashborn://ui/suggestions.html';
const COLOR_URL = 'flashborn://ui/color.html';
const MAX_SWF_SIZE = 256 * 1024 * 1024;
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash', '.json': 'application/json', '.mp3': 'audio/mpeg', '.xml': 'text/xml', '.txt': 'text/plain' };
let win, store, browsingSession, activeId, panel = null, collapsed = false, closing = false;
const tabs = [];
const downloadItems = new Map();
const permissions = new Map();
const closedTabs = [];
const documents = new Map();
let stateTimer, menuWindow, menuOpen = false, zoomWindow, zoomTimer, editMenu;
let zoomQueue = Promise.resolve();
let suggestionWindow, suggestionData = null;
let colorWindow, colorTabId, colorPicking = false, colorPreview = null, tabMenu;
let privateSession;
const privateDownloads = [];

const activeTab = () => tabs.find(t => t.id === activeId);
const live = t => !!t?.view?.webContents && !t.view.webContents.isDestroyed();
const tabDownloads = t => t?.private ? privateDownloads : store.data.downloads;
function getPrivateSession() {
  if (!privateSession) {
    privateSession = session.fromPartition(`flashcognito-${crypto.randomUUID()}`, { cache: false });
    privateSession.protocol.handle('flashborn', handleProtocol);
    configureSession(privateSession, true);
  }
  return privateSession;
}
function finishPrivateSession() {
  if (tabs.some(t => t.private)) return;
  for (const entry of privateDownloads) downloadItems.get(entry.id)?.cancel();
  privateDownloads.length = 0;
  const ended = privateSession;
  privateSession = null;
  if (ended) Promise.allSettled([ended.clearStorageData(), ended.clearCache(), ended.clearAuthCache()]);
}

function publicTab(t) {
  const wc = live(t) ? t.view.webContents : null;
  if (t.native) return { id: t.id, private: !!t.private, kind: t.kind, title: t.title, url: t.url, loading: t.loading, error: t.error, native: true,
    muted: !!t.native.state.muted, audible: !!t.native.state.audible, canBack: !!t.native.state.canBack, canForward: !!t.native.state.canForward, zoom: t.native.state.zoom || 100 };
  return { id: t.id, private: !!t.private, kind: t.kind, title: t.title, url: t.url, loading: t.loading, error: t.error, muted: wc?.isAudioMuted() || false, audible: wc?.isCurrentlyAudible() || false,
    canBack: wc?.navigationHistory.canGoBack() || false, canForward: wc?.navigationHistory.canGoForward() || false, zoom: Math.round((wc?.getZoomFactor() || 1) * 100) };
}
function getState() {
  return { tabs: tabs.map(publicTab), activeId, panel, collapsed, menuOpen, suggestions: suggestionData, flashBackground: activeTab()?.flashSource?.background || '#ffffff', colorPicking, colorPreview, maximized: win?.isMaximized(), fullscreen: win?.isFullScreen(), bookmarks: store.data.bookmarks,
    history: activeTab()?.private ? [] : store.data.history, library: store.data.library, downloads: tabDownloads(activeTab()), settings: store.data.settings,
    flashReady: nativeAvailable(), version: app.getVersion(), chromium: process.versions.chrome, flashVersion: '32.0.0.363', flashRuntime: '9.4.4' };
}
function sendState(immediate = false) {
  if (closing) return;
  if (immediate) {
    clearTimeout(stateTimer);
    stateTimer = null;
    const state = getState();
    if (win && !win.isDestroyed()) win.webContents.send('browser:state', state);
    if (menuWindow && !menuWindow.isDestroyed()) menuWindow.webContents.send('browser:state', state);
    if (zoomWindow && !zoomWindow.isDestroyed()) zoomWindow.webContents.send('browser:state', state);
    if (suggestionWindow && !suggestionWindow.isDestroyed()) suggestionWindow.webContents.send('browser:state', state);
    if (colorWindow && !colorWindow.isDestroyed()) colorWindow.webContents.send('browser:state', state);
  } else if (!stateTimer) {
    stateTimer = setTimeout(() => { stateTimer = null; sendState(true); }, 40);
  }
}
function persistTabs() {
  store.data.tabs = tabs.filter(t => !t.private && t.kind === 'web').slice(0, 30).map(t => ({ url: t.url, title: t.title, native: !!t.native }));
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
    if (t.native) t.native.bounds(rect, t.id === activeId && !panel && !t.error && !(colorPicking && colorTabId === t.id));
  }
}
function selectTab(id) {
  const t = tabs.find(t => t.id === id);
  if (!t) return;
  closeZoomPopup();
  closeSuggestions();
  closeColorPicker();
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
  if (colorTabId === id) closeColorPicker();
  for (const [token, document] of documents) if (document.tabId === id) documents.delete(token);
  clearTimeout(t.flashDetectionTimer);
  if (t.native) t.native.dispose();
  if (!t.private && t.kind === 'web') closedTabs.push(t.url);
  if (closedTabs.length > 20) closedTabs.shift();
  if (live(t)) {
    win.contentView.removeChildView(t.view);
    t.view.webContents.close();
    t.view = null;
  }
  tabs.splice(index, 1);
  if (!tabs.length) createTab('', false, false);
  else if (activeId === id) selectTab(tabs[Math.min(index, tabs.length - 1)].id);
  persistTabs();
  finishPrivateSession();
  sendState(true);
}
function wireContents(t) {
  const wc = t.view.webContents;
  // Manual mode records zoom levels but deliberately does not scale the renderer.
  wc.setZoomMode('isolated');
  wc.on('zoom-changed', (_event, direction) => wheelZoom(t, direction === 'in' ? 1 : -1, 'browser'));
  wc.setWindowOpenHandler(({ url }) => {
    if (isWebURL(url)) createTab(url, false, t.private);
    return { action: 'deny' };
  });
  wc.on('will-attach-webview', event => event.preventDefault());
  wc.on('will-frame-navigate', (event, url) => {
    const destination = event.url || url;
    if (isWebURL(destination) || isDocumentURL(destination) || destination === 'about:blank' || destination.startsWith('blob:') || destination.startsWith('chrome-extension:')) return;
    event.preventDefault();
  });
  wc.on('will-navigate', (event, url) => {
    const destination = event.url || url;
    if (isDocumentURL(destination)) return;
    if (!isWebURL(destination)) { event.preventDefault(); return; }
    if (store.data.settings.flashEnabled && !t.native && !t.forceModern && isFlashFallbackURL(destination)) {
      const original = isWebURL(wc.getURL()) ? wc.getURL() : t.url;
      if (isWebURL(original) && new URL(original).origin === new URL(destination).origin && !isFlashFallbackURL(original)) { event.preventDefault(); activateNative(t, original).catch(e => showError(t, e.message)); return; }
    }
    if (t.kind === 'flash') { event.preventDefault(); createTab(destination, false, t.private); return; }
    if (/\.swf$/i.test(new URL(destination).pathname)) { event.preventDefault(); loadFlash(t, { url: destination }).catch(e => showError(t, e.message)); }
  });
  wc.on('will-redirect', (event, url) => {
    const destination = event.url || url;
    if (!isWebURL(destination) && !isDocumentURL(destination)) event.preventDefault();
    else if (/\.swf$/i.test(new URL(destination).pathname)) { event.preventDefault(); loadFlash(t, { url: destination }).catch(e => showError(t, e.message)); }
  });
  wc.on('did-start-loading', () => { t.loading = true; sendState(true); });
  wc.on('did-stop-loading', () => { t.loading = false; sendState(); });
  wc.on('page-title-updated', (_event, title) => { if (['web', 'local'].includes(t.kind)) t.title = title.slice(0, 200); sendState(); });
  const navigated = () => {
    if (['web', 'pdf', 'local'].includes(t.kind)) {
      const url = wc.getURL();
      if (isWebURL(url)) { t.kind = 'web'; t.url = url; t.title = wc.getTitle() || new URL(url).hostname; t.error = null; }
      persistTabs();
    }
    layout(); sendState();
  };
  wc.on('did-navigate', navigated);
  wc.on('did-navigate-in-page', navigated);
  wc.on('did-finish-load', () => {
    if (t.kind === 'web' && isWebURL(t.url)) {
      const item = { id: crypto.randomUUID(), url: t.url, title: wc.getTitle() || t.title, visitedAt: new Date().toISOString() };
      if (!t.private) {
        store.data.history = [item, ...store.data.history.filter(h => h.url !== t.url)].slice(0, 500);
        store.save(); sendState();
      }
      detectFlashFrames(t);
    }
  });
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) showError(t, description === 'ERR_INTERNET_DISCONNECTED' ? 'You appear to be offline. Check your connection and try again.' : `Could not load this page (${description}).`);
  });
  wc.on('did-frame-finish-load', () => { detectFlashFrames(t); wirePDFZoom(t); });
  wc.on('render-process-gone', (_event, details) => showError(t, `This tab stopped responding (${details.reason}). Reload to continue.`));
  wc.on('found-in-page', (_event, result) => { if (t.id === activeId) win.webContents.send('browser:find', result); });
  wc.on('audio-state-changed', () => sendState());
  wc.on('enter-html-full-screen', () => { win.setFullScreen(true); layout(); sendState(true); });
  wc.on('leave-html-full-screen', () => { win.setFullScreen(false); layout(); sendState(true); });
  wc.on('before-input-event', (event, input) => handleKeys(event, input));
  wc.on('context-menu', (_event, params) => {
    const items = [];
    if (params.isEditable) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' }, { label: 'Search selection', click: () => createTab((require('./core').SEARCH_ENGINES[store.data.settings.searchEngine] || require('./core').SEARCH_ENGINES.duckduckgo) + encodeURIComponent(params.selectionText.slice(0, 2000)), false, t.private) });
    if (isWebURL(params.linkURL)) items.push({ label: 'Open link in new tab', click: () => createTab(params.linkURL, false, t.private) }, { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) });
    if (isWebURL(params.srcURL)) items.push({ label: 'Save image / media as…', click: () => wc.downloadURL(params.srcURL) });
    if (items.length) items.push({ type: 'separator' });
    items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: 'Reload', click: () => reload(t) }, { label: 'Print…', click: () => wc.print() });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}
function detectFlashFrames(t) {
  clearTimeout(t.flashDetectionTimer);
  const eligible = () => t.kind === 'web' || t.kind === 'local' && /\.html?$/i.test(t.localPath || '');
  if (!store.data.settings.flashEnabled || t.native || t.forceModern || !eligible()) return;
  t.flashDetectionTimer = setTimeout(async () => {
    if (!live(t) || t.native || !eligible()) return;
    const found = await Promise.all(t.view.webContents.mainFrame.framesInSubtree.map(frame => frame.executeJavaScript(detectionScript).catch(() => false)));
    if (found.some(Boolean) && live(t) && !t.native) (t.kind === 'local' ? addLibrarySource(t.localPath, 'html', t) : activateNative(t, t.url)).catch(e => showError(t, e.message));
  }, 120);
}
function wirePDFZoom(t) {
  if (!live(t)) return;
  const wc = t.view.webContents, frames = wc.mainFrame.framesInSubtree;
  if (!frames.some(frame => frame.url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/'))) return;
  const token = t.pdfZoomToken ||= crypto.randomUUID();
  wc.send('browser:pdf-token', token);
  // The built-in viewer owns PDF scaling. Observe its trusted wheel input while
  // leaving Chromium's document zoom, fit-to-page and toolbar controls intact.
  const code = `(()=>{if(window.__flashbornPDFWheel)return;window.__flashbornPDFWheel=true;window.addEventListener('wheel',event=>{if(event.isTrusted&&event.ctrlKey&&event.deltaY)window.top.postMessage({type:'flashborn-pdf-zoom',token:${JSON.stringify(token)}},'*');},{capture:true,passive:true});})()`;
  for (const frame of frames.slice(1)) {
    let ancestor = frame;
    while (ancestor && !ancestor.url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')) ancestor = ancestor.parent;
    if (ancestor) frame.executeJavaScript(code).catch(() => {});
  }
}
function ensureView(t) {
  if (live(t)) return;
  t.view = new WebContentsView({ webPreferences: { session: t.private ? getPrivateSession() : browsingSession, preload: path.join(__dirname, 'content-preload.js'), plugins: true, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: true, navigateOnDragDrop: false, backgroundThrottling: !testMode } });
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
      t.kind = 'home'; t.url = ''; t.title = t.private ? 'Flashcognito' : 'New tab'; t.loading = false;
    layout(); persistTabs(); sendState(true); return;
  }
  if (target.type === 'file') { await openLocal(target.path, t); return; }
  if (target.type === 'flash') { await loadFlash(t, { url: target.url }); return; }
  if (t.native) { t.native.dispose(); t.native = null; }
  t.kind = 'web'; t.url = target.url; t.title = new URL(target.url).hostname; t.loading = true;
  ensureView(t); layout(); sendState(true);
  try { await t.view.webContents.loadURL(target.url); } catch (e) { if (e.code !== 'ERR_ABORTED') showError(t, e.message); }
}
function createTab(value = '', background = false, privateMode = !!activeTab()?.private) {
  if (tabs.length >= 50) { dialog.showMessageBox(win, { type: 'info', message: 'Close a tab before opening another.', detail: 'Flashborn supports up to 50 open tabs.' }); return; }
  const t = { id: crypto.randomUUID(), private: !!privateMode, kind: 'home', url: '', title: privateMode ? 'Flashcognito' : 'New tab', loading: false, error: null, view: null };
  tabs.push(t);
  if (!background) selectTab(t.id);
  if (value) navigate(t, value).catch(e => showError(t, e.message));
  sendState(true);
  return t;
}

async function openLocal(filename, existing) {
  const absolute = path.resolve(filename);
  if (!supportedLocalFile(absolute)) throw new Error('Choose a Flash, HTML, PDF, image or video file.');
  if (path.extname(absolute).toLowerCase() !== '.swf') { await openDocument(absolute, existing); return; }
  const stats = await fsp.stat(absolute);
  if (!stats.isFile() || stats.size > MAX_SWF_SIZE) throw new Error('Choose a SWF file smaller than 256 MB.');
  const handle = await fsp.open(absolute, 'r');
  const header = Buffer.alloc(8);
  try { await handle.read(header, 0, 8, 0); } finally { await handle.close(); }
  if (!isSWF(header)) throw new Error('This file does not contain a valid SWF header.');
  const t = existing || createTab();
  let entry = store.data.library.find(e => e.path === absolute);
  if (!entry) {
    entry = { id: crypto.randomUUID(), path: absolute, title: path.basename(absolute, '.swf'), addedAt: new Date().toISOString() };
    if (!t.private) store.data.library.unshift(entry);
  }
  if (!t.private) { entry.lastPlayedAt = new Date().toISOString(); store.save(); }
  await loadFlash(t, { path: absolute, title: entry.title, libraryId: entry.id, background: entry.background || '#ffffff' });
}
function isDocumentURL(value) {
  try { const url = new URL(value); return url.protocol === 'flashborn:' && url.hostname === 'document' && documents.has(url.pathname.split('/')[1]); } catch { return false; }
}
async function openDocument(absolute, existing) {
  const stats = await fsp.stat(absolute);
  if (!stats.isFile()) throw new Error('Choose a file to open.');
  const pdf = path.extname(absolute).toLowerCase() === '.pdf';
  if (pdf) {
    if (stats.size > MAX_SWF_SIZE) throw new Error('Choose a PDF file smaller than 256 MB.');
    const handle = await fsp.open(absolute, 'r'), header = Buffer.alloc(1024);
    try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
    if (!header.includes(Buffer.from('%PDF-'))) throw new Error('This file does not contain a valid PDF header.');
  }
  const t = existing || createTab();
  if (t.native) { t.native.dispose(); t.native = null; }
  const token = crypto.randomUUID();
  const real = await fsp.realpath(absolute);
  documents.set(token, { path: real, root: path.dirname(real), assets: /\.html?$/i.test(real), tabId: t.id });
  t.kind = pdf ? 'pdf' : 'local'; t.localPath = real; t.title = path.basename(absolute); t.url = pathToFileURL(absolute).href; t.loading = true; t.error = null;
  panel = null; ensureView(t); layout(); sendState(true);
  await t.view.webContents.loadURL(`flashborn://document/${token}/${encodeURIComponent(t.title)}`);
}
async function addLibrarySource(value, kind, existing) {
  if (!['swf', 'html'].includes(kind)) throw new Error('Choose a SWF or HTML Flash page.');
  const input = String(value || '').trim().replace(/^"(.*)"$/, '$1'), target = resolveInput(input);
  if (!String(value || '').trim() || target.type === 'home') throw new Error('Enter a web URL or a local file path.');
  if (target.type === 'web' && target.url === 'https://duckduckgo.com/?q=' + encodeURIComponent(input)) throw new Error('Enter a web URL or an absolute local file path.');
  if (target.type === 'file' && kind === 'swf') { if (!/\.swf$/i.test(target.path)) throw new Error('Choose a SWF file.'); await openLocal(target.path, existing); return; }
  if (target.type === 'file' && !/\.html?$/i.test(target.path)) throw new Error('Choose an HTML or HTM file for an HTML Flash page.');
  if (target.type === 'file') { const stat = await fsp.stat(target.path); if (!stat.isFile()) throw new Error('Choose an HTML file.'); }
  const local = target.type === 'file' ? await fsp.realpath(target.path) : null;
  const url = local ? null : target.url;
  const title = local ? path.basename(local, path.extname(local)) : decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname);
  const t = existing || createTab();
  let entry = store.data.library.find(item => local ? item.path === local : item.url === url && (item.kind || 'swf') === kind);
  if (!entry) { entry = { id: crypto.randomUUID(), kind, ...(local ? { path: local } : { url }), title, addedAt: new Date().toISOString() }; if (!t.private) store.data.library.unshift(entry); }
  if (!t.private) { entry.lastPlayedAt = new Date().toISOString(); store.save(); }
  if (kind === 'swf') { await loadFlash(t, { url, title: entry.title, libraryId: entry.id, background: entry.background || '#ffffff' }); return; }
  t.flashSource = null;
  if (!local) { await activateNative(t, url); return; }
  t.kind = 'local'; t.localPath = local; t.url = pathToFileURL(local).href; t.title = entry.title; t.loading = true; t.error = null;
  await ensureNative(t);
  if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
  panel = null; layout(); sendState(true);
  await t.native.call('local-html', { path: local, token: crypto.randomUUID() });
}
async function loadFlash(t, source) {
  source = { ...source, background: /^#[0-9a-f]{6}$/i.test(source.background || '') ? source.background.toLowerCase() : '#ffffff' };
  t.flashSource = source; t.kind = 'flash'; t.error = null; t.loading = true;
  t.title = source.title || decodeURIComponent(new URL(source.url).pathname.split('/').pop() || 'Flash player');
  t.url = source.url || pathToFileURL(source.path).href;
  sendState(true);
  await ensureNative(t);
  layout(); sendState(true);
  await t.native.call('movie', { ...source, title: t.title, quality: store.data.settings.flashQuality, theme: store.data.settings.theme });
}
async function ensureNative(t) {
  if (t.native?.child && t.native.child.exitCode !== null) { t.native.dispose(); t.native = null; }
  if (t.native) { await t.native.ready; return; }
  if (!nativeAvailable()) throw new Error('Native Flash files are missing. Reinstall Flashborn.');
  t.native = new NativeFlash(win, t.id, message => {
    if (message.type === 'ready') layout();
    else if (message.type === 'state') {
      if (!isWebURL(message.state.url) && !message.state.url?.startsWith('flashnative:')) return;
      const started = !!message.state.loading && !t.loading;
      t.loading = !!message.state.loading;
      if (t.kind === 'web' && isWebURL(message.state.url)) { t.url = message.state.url; t.title = message.state.title || new URL(t.url).hostname; }
      if (!t.private && !t.loading && t.kind === 'web' && isWebURL(t.url)) {
        store.data.history = [{ id: crypto.randomUUID(), url: t.url, title: t.title, visitedAt: new Date().toISOString() }, ...store.data.history.filter(h => h.url !== t.url)].slice(0, 500);
        persistTabs();
      }
      sendState(started);
    } else if (message.type === 'new-tab') { const created = createTab('', false, t.private); if (created) activateNative(created, message.url).catch(e => showError(created, e.message)); }
    else if (message.type === 'open-pdf' && isWebURL(message.url)) { navigate(t, message.url).catch(e => showError(t, e.message)); }
    else if (message.type === 'zoom-wheel') wheelZoom(t, message.direction === 'in' ? 1 : -1, message.source || 'browser');
    else if (message.type === 'drop-files') openDroppedFiles(message.paths).catch(e => win?.webContents.send('browser:notice', e.message));
    else if (message.type === 'download' && isWebURL(message.url)) { ensureView(t); t.view.webContents.downloadURL(message.url); }
    else if (message.type === 'key') handleKeys({ preventDefault() {} }, message.input);
    else if (message.type === 'fullscreen' && t.id === activeId) setFullscreen(message.value);
    else if (message.type === 'player-fullscreen' && t.id === activeId) setFullscreen(!win.isFullScreen());
    else if (message.type === 'player-color' && t.id === activeId && t.kind === 'flash') showColorPicker(t).catch(e => win?.webContents.send('browser:notice', e.message));
    else if (message.type === 'find') win.webContents.send('browser:find', message.result);
    else if (message.type === 'error') showError(t, message.message);
  }, { private: !!t.private });
  layout();
  await t.native.ready;
  await t.native.call('quality', { quality: store.data.settings.flashQuality });
  await t.native.call('theme', { theme: store.data.settings.theme });
  layout();
}
async function activateNative(t, url) {
  if (isPDFURL(url)) { await navigate(t, url); return; }
  t.kind = 'web'; t.url = url; t.title = new URL(url).hostname; t.error = null; t.loading = true;
  await ensureNative(t);
  if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
  layout(); sendState(true);
  await t.native.call('navigate', { url });
}
async function duplicateTab(id) {
  const source = tabs.find(tab => tab.id === id);
  if (!source) return;
  const copy = createTab('', false, source.private);
  if (!copy) return;
  tabs.splice(tabs.indexOf(copy), 1);
  tabs.splice(tabs.indexOf(source) + 1, 0, copy);
  copy.forceModern = source.forceModern;
  if (source.kind === 'flash') await loadFlash(copy, { ...source.flashSource });
  else if (source.kind === 'local' && source.native) await addLibrarySource(source.localPath, 'html', copy);
  else if (['local', 'pdf'].includes(source.kind)) await openLocal(source.localPath, copy);
  else if (source.kind === 'web') {
    if (source.native) await activateNative(copy, source.url);
    else await navigate(copy, source.url);
  }
  if (live(copy) && live(source)) {
    copy.view.webContents.setZoomFactor(source.view.webContents.getZoomFactor());
    copy.view.webContents.setAudioMuted(source.view.webContents.isAudioMuted());
  }
  persistTabs(); sendState(true);
}
function showTabMenu(args) {
  if (!tabs.some(tab => tab.id === args.id)) return;
  closeBrowserMenu(); closeSuggestions(); closeZoomPopup();
  const menu = tabMenu = Menu.buildFromTemplate([
    { label: 'Duplicate Tab', click: () => duplicateTab(args.id).catch(e => win?.webContents.send('browser:notice', e.message)) },
    { label: 'Close Tab', click: () => closeTab(args.id) }
  ]);
  const [width, height] = win.getContentSize();
  menu.popup({ window: win, x: Math.max(0, Math.min(width - 1, Math.round(args.x) || 0)), y: Math.max(0, Math.min(height - 1, Math.round(args.y) || 0)),
    callback: () => { if (tabMenu === menu) tabMenu = null; } });
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
    if (url.hostname === 'document') {
      const document = documents.get(url.pathname.split('/')[1]);
      if (!document) return new Response('Document is no longer open.', { status: 404 });
      const relative = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
      const filename = await fsp.realpath(containedPath(document.root, relative));
      containedPath(document.root, path.relative(document.root, filename));
      if (!document.assets && filename !== document.path) return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(filename).href, { headers: request.headers });
      const headers = new Headers(response.headers);
      headers.set('Content-Type', contentType(filename)); headers.set('Content-Disposition', 'inline');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    }
    if (url.hostname !== 'ui') return new Response('Not found', { status: 404 });
    if (url.pathname.startsWith('/library-image/')) {
      const entry = store.data.library.find(item => item.id === url.pathname.slice(15));
      if (!entry?.image || !/^[\da-f-]{36}\.png$/.test(entry.image)) return new Response('Not found', { status: 404 });
      return new Response(await fsp.readFile(containedPath(path.join(app.getPath('userData'), 'library-images'), entry.image)), { headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' } });
    }
    const filename = containedPath(path.join(__dirname, 'ui'), decodeURIComponent(url.pathname.slice(1) || 'index.html'));
    return new Response(await fsp.readFile(filename), { headers: {
      'Content-Type': mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'"
    } });
  } catch (e) { return new Response(e.message, { status: 400 }); }
}
async function openDroppedFiles(paths) {
  if (!Array.isArray(paths) || paths.length > 30 || paths.some(file => typeof file !== 'string' || !path.isAbsolute(file))) throw new Error('Invalid dropped files.');
  const errors = [];
  for (const file of paths) { try { await openLocal(file); } catch (e) { errors.push(`${path.basename(file)}: ${e.message}`); } }
  if (errors.length) win.webContents.send('browser:notice', errors.join('\n'));
}
function wheelZoom(t, direction, source) {
  if (!t || t.id !== activeId) return;
  const last = t.lastWheel, now = Date.now();
  if (last && last.source !== source && last.direction === direction && now - last.time < 60) return;
  t.lastWheel = { source, direction, time: now };
  zoom(direction).catch(e => win?.webContents.send('browser:notice', e.message));
}
async function setLibraryImage(id, file) {
  const entry = store.data.library.find(item => item.id === id);
  if (!entry) throw new Error('This Flash library item is no longer available.');
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Choose an image file.');
  const stat = await fsp.stat(file);
  if (!stat.isFile() || stat.size > 30 * 1024 * 1024) throw new Error('Choose an image smaller than 30 MB.');
  let image = nativeImage.createFromBuffer(await fsp.readFile(file));
  if (image.isEmpty()) throw new Error('This image format could not be read. Choose PNG, JPEG, WebP or BMP.');
  const size = image.getSize(), scale = Math.min(1, 640 / Math.max(size.width, size.height));
  image = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' });
  const directory = path.join(app.getPath('userData'), 'library-images'), name = crypto.randomUUID() + '.png', previous = entry.image;
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(containedPath(directory, name), image.toPNG());
  entry.image = name; store.save();
  if (/^[\da-f-]{36}\.png$/.test(previous || '')) await fsp.unlink(containedPath(directory, previous)).catch(() => {});
  sendState(true);
}
async function removeLibraryImage(entry) {
  const image = entry?.image;
  if (!entry) return;
  delete entry.image; store.save();
  if (/^[\da-f-]{36}\.png$/.test(image || '')) await fsp.unlink(containedPath(path.join(app.getPath('userData'), 'library-images'), image)).catch(() => {});
}
function setFullscreen(value) {
  closeColorPicker();
  win.setFullScreen(!!value);
  // Exiting the host must also leave a website/plugin's HTML fullscreen state.
  for (const tab of tabs) if (tab.native) tab.native.call('host-fullscreen', { value: !!value && tab.id === activeId }).then(layout).catch(() => {});
  if (!value) for (const tab of tabs) if (live(tab)) tab.view.webContents.executeJavaScript('if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});').catch(() => {});
  layout(); sendState(true);
}
function closeColorPicker() {
  const popup = colorWindow; colorWindow = null; colorTabId = null; colorPicking = false; colorPreview = null;
  if (popup && !popup.isDestroyed()) popup.close();
  layout(); sendState(true);
}
async function showColorPicker(t) {
  closeColorPicker(); closeZoomPopup(); closeBrowserMenu(); closeSuggestions();
  colorTabId = t.id;
  const bounds = win.getContentBounds(), work = screen.getDisplayMatching(bounds).workArea;
  const width = 292, height = 390, full = win.isFullScreen();
  const x = Math.max(work.x, Math.min(work.x + work.width - width, bounds.x + bounds.width - width - 20));
  const y = Math.max(work.y, Math.min(work.y + work.height - height, bounds.y + (full ? 62 : 162)));
  const popup = colorWindow = new BrowserWindow({ x, y, width, height, parent: win, frame: false, show: false, skipTaskbar: true,
    resizable: false, minimizable: false, maximizable: false, alwaysOnTop: true,
    backgroundColor: store.data.settings.theme === 'light' ? '#f0f0f0' : '#282828',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  popup.setAlwaysOnTop(true, 'pop-up-menu'); popup.setMenu(null);
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); popup.webContents.on('will-navigate', event => event.preventDefault());
  popup.on('blur', () => { if (colorWindow === popup && !colorPicking) closeColorPicker(); });
  popup.on('closed', () => { if (colorWindow === popup) { colorWindow = null; colorTabId = null; colorPicking = false; colorPreview = null; layout(); sendState(true); } });
  await popup.loadURL(COLOR_URL);
  if (colorWindow === popup && !popup.isDestroyed()) { popup.show(); popup.focus(); sendState(true); }
}
function closeSuggestions() {
  const popup = suggestionWindow; suggestionWindow = null; suggestionData = null;
  if (popup && !popup.isDestroyed()) popup.close();
}
async function showSuggestions(args) {
  const privateMode = !!activeTab()?.private;
  const items = urlSuggestions(args.query, [...store.data.bookmarks, ...(privateMode ? [] : store.data.history), ...tabs.filter(tab => !!tab.private === privateMode)]);
  if (!items.length || typeof args.query !== 'string' || !args.bounds) { closeSuggestions(); return; }
  suggestionData = { query: args.query, items, selected: -1 };
  const bounds = win.getContentBounds(), rect = args.bounds, work = screen.getDisplayMatching(bounds).workArea;
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) throw new Error('Invalid address field bounds.');
  const width = Math.min(work.width, Math.max(250, Math.min(bounds.width, Math.round(rect.width))));
  const height = items.length * 48 + 12;
  const x = Math.max(work.x, Math.min(work.x + work.width - width, bounds.x + Math.round(rect.x)));
  const y = Math.max(work.y, Math.min(work.y + work.height - height, bounds.y + Math.round(rect.y + rect.height) + 5));
  if (!suggestionWindow || suggestionWindow.isDestroyed()) {
    const popup = suggestionWindow = new BrowserWindow({ x, y, width, height, parent: win, frame: false, show: false, skipTaskbar: true,
      resizable: false, minimizable: false, maximizable: false, focusable: false, alwaysOnTop: true,
      backgroundColor: store.data.settings.theme === 'light' ? '#f0f0f0' : '#282828',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    popup.setAlwaysOnTop(true, 'pop-up-menu'); popup.setMenu(null);
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); popup.webContents.on('will-navigate', event => event.preventDefault());
    popup.on('closed', () => { if (suggestionWindow === popup) { suggestionWindow = null; suggestionData = null; } });
    await popup.loadURL(SUGGEST_URL);
    if (suggestionWindow === popup && !popup.isDestroyed()) popup.showInactive();
  } else suggestionWindow.setBounds({ x, y, width, height });
}

function configureSession(targetSession = browsingSession, privateMode = false) {
  const permissionMap = privateMode ? new Map() : permissions;
  const ua = targetSession.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\sFlashborn\/\S+/, '');
  targetSession.setUserAgent(ua);
  targetSession.setPermissionCheckHandler((_wc, permission, origin) => {
    if (permission === 'fullscreen') return true;
    return permissionMap.get(`${origin}|${permission}`) === true;
  });
  targetSession.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (permission === 'fullscreen') return callback(true);
    const allowed = ['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'];
    if (!allowed.includes(permission)) return callback(false);
    const origin = details.requestingUrl || wc?.getURL() || '';
    let host; try { host = new URL(origin).origin; } catch { return callback(false); }
    const key = `${host}|${permission}`;
    if (permissionMap.has(key)) return callback(permissionMap.get(key));
    const names = { media: 'your camera or microphone', geolocation: 'your location', notifications: 'notifications', 'clipboard-read': 'your clipboard', 'clipboard-sanitized-write': 'copy text to your clipboard' };
    const result = await dialog.showMessageBox(win, { type: 'question', title: 'Site permission', message: `${host} wants access to ${names[permission]}.`, buttons: ['Block', 'Allow'], defaultId: 0, cancelId: 0 });
    permissionMap.set(key, result.response === 1);
    callback(result.response === 1);
  });
  targetSession.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (_details, callback) => callback({ cancel: true }));
  targetSession.webRequest.onHeadersReceived((details, callback) => {
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
  targetSession.on('will-download', (_event, item) => {
    const entry = { id: crypto.randomUUID(), filename: item.getFilename(), url: item.getURL(), path: '', total: item.getTotalBytes(), received: 0, state: 'progressing', startedAt: new Date().toISOString() };
    const downloads = privateMode ? privateDownloads : store.data.downloads;
    downloads.unshift(entry); downloads.splice(100);
    downloadItems.set(entry.id, item);
    item.setSaveDialogOptions({ title: 'Save download', defaultPath: path.join(app.getPath('downloads'), entry.filename) });
    item.on('updated', (_event, state) => { entry.state = state; entry.path = item.getSavePath(); entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); sendState(); });
    item.once('done', (_event, state) => { entry.state = state; entry.path = item.getSavePath(); entry.received = item.getReceivedBytes(); downloadItems.delete(entry.id); if (!privateMode) store.save(); sendState(true); });
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
  else if (mod && key === 'n' && input.shift) createTab('', false, true);
  else if (mod && key === 't' && input.shift) { const last = !t?.private && closedTabs.pop(); if (last) createTab(last, false, false); }
  else if (mod && key === 't') createTab();
  else if (mod && key === 'w') closeTab(activeId);
  else if (mod && key === 'o') command('open-file');
  else if (mod && key === 'r' || key === 'f5') reload();
  else if (mod && key === 'f') { panel = null; layout(); sendState(true); win.webContents.focus(); win.webContents.send('browser:find', { open: true }); }
  else if (mod && key === 'd') command('bookmark');
  else if (mod && key === 'h') command('panel', { name: 'history' });
  else if (mod && key === 'j') command('panel', { name: 'downloads' });
  else if (mod && key === 'p') command('print');
  else if (mod && ['+', '=', '-', '0'].includes(key)) zoom(key === '0' ? 0 : key === '-' ? -1 : 1);
  else if (mod && key === 'tab') { const index = tabs.findIndex(t => t.id === activeId); selectTab(tabs[(index + (input.shift ? tabs.length - 1 : 1)) % tabs.length].id); }
  else if (mod && /^[1-9]$/.test(key)) selectTab((key === '9' ? tabs.at(-1) : tabs[Number(key) - 1])?.id);
  else if (input.alt && key === 'arrowleft') command('back');
  else if (input.alt && key === 'arrowright') command('forward');
  else if (key === 'f11') setFullscreen(!win.isFullScreen());
  else if (key === 'f12') wc?.toggleDevTools();
  else if (key === 'escape' && win.isFullScreen()) setFullscreen(false);
  else handled = false;
  if (handled) event.preventDefault();
}
function zoom(direction, popup = true) {
  const t = activeTab();
  const task = zoomQueue.then(async () => {
    if (!t || !tabs.includes(t)) return;
    if (t.native) await t.native.call('zoom', { direction });
    else if (live(t)) { const wc = t.view.webContents; wc.setZoomFactor(nextZoom(wc.getZoomFactor() * 100, direction) / 100); }
    else return;
    sendState(true);
    if (popup && t.id === activeId) await showZoomPopup();
  });
  zoomQueue = task.catch(() => {});
  return task;
}
function closeZoomPopup() {
  clearTimeout(zoomTimer);
  const popup = zoomWindow; zoomWindow = null;
  if (popup && !popup.isDestroyed()) popup.close();
}
async function showZoomPopup() {
  clearTimeout(zoomTimer);
  if (!zoomWindow || zoomWindow.isDestroyed()) {
    const bounds = win.getContentBounds(), work = screen.getDisplayMatching(bounds).workArea;
    const width = 280, height = 58;
    const popup = zoomWindow = new BrowserWindow({ width, height, x: Math.max(work.x, Math.min(work.x + work.width - width, bounds.x + bounds.width - width - 106)),
      y: Math.max(work.y, Math.min(work.y + work.height - height, bounds.y + 96)), parent: win, frame: false, show: false, skipTaskbar: true,
      resizable: false, minimizable: false, maximizable: false, alwaysOnTop: true, focusable: false,
      backgroundColor: store.data.settings.theme === 'light' ? '#f0f0f0' : '#282828',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    popup.setAlwaysOnTop(true, 'pop-up-menu'); popup.setMenu(null);
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    popup.webContents.on('will-navigate', event => event.preventDefault());
    popup.on('closed', () => { if (zoomWindow === popup) zoomWindow = null; });
    await popup.loadURL(ZOOM_URL);
    if (zoomWindow === popup && !popup.isDestroyed()) { popup.showInactive(); sendState(true); }
  }
  zoomTimer = setTimeout(closeZoomPopup, 2500);
}
function showEditMenu(wc, params) {
  if (!params.isEditable) return;
  const flags = params.editFlags;
  const actions = [
    { label: 'Select all', enabled: flags.canSelectAll, click: () => wc.selectAll() }, { type: 'separator' },
    { label: 'Cut', enabled: flags.canCut, click: () => wc.cut() },
    { label: 'Copy', enabled: flags.canCopy, click: () => wc.copy() },
    { label: 'Paste', enabled: flags.canPaste, click: () => wc.paste() }
  ];
  const menu = editMenu = Menu.buildFromTemplate(actions);
  // Keep the native menu alive until Windows has finished its close callback.
  menu.popup({ window: win, callback: () => { if (editMenu === menu) editMenu = null; } });
}

function closeBrowserMenu(restoreFocus = false) {
  const popup = menuWindow;
  menuWindow = null; menuOpen = false;
  if (popup && !popup.isDestroyed()) popup.close();
  if (restoreFocus && win && !win.isDestroyed()) win.focus();
  sendState(true);
}
async function showBrowserMenu() {
  closeZoomPopup();
  closeSuggestions();
  if (menuWindow && !menuWindow.isDestroyed()) { closeBrowserMenu(true); return; }
  const bounds = win.getContentBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  const width = 320, height = Math.min(503, work.height - 20);
  const x = Math.max(work.x, Math.min(work.x + work.width - width, bounds.x + bounds.width - width - 12));
  const y = Math.max(work.y, Math.min(work.y + work.height - height, bounds.y + 92));
  const popup = menuWindow = new BrowserWindow({ x, y, width, height, parent: win, frame: false, show: false,
    skipTaskbar: true, resizable: false, minimizable: false, maximizable: false, alwaysOnTop: true,
    backgroundColor: store.data.settings.theme === 'light' ? '#f0f0f0' : '#282828',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, backgroundThrottling: false } });
  // A separate owned window stays above the native Adobe Flash child HWND.
  popup.setAlwaysOnTop(true, 'pop-up-menu');
  popup.setMenu(null);
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  popup.webContents.on('will-navigate', event => event.preventDefault());
  popup.on('blur', () => { if (menuWindow === popup) closeBrowserMenu(); });
  popup.on('closed', () => { if (menuWindow === popup) { menuWindow = null; menuOpen = false; sendState(true); } });
  menuOpen = true; sendState(true);
  await popup.loadURL(MENU_URL);
  if (menuWindow === popup && !popup.isDestroyed()) { popup.show(); popup.focus(); sendState(true); }
}

async function command(action, args = {}) {
  const t = activeTab(); const wc = live(t) ? t.view.webContents : null;
  switch (action) {
    case 'state': return getState();
    case 'menu': await showBrowserMenu(); break;
    case 'menu-close': closeBrowserMenu(true); break;
    case 'menu-find': panel = null; layout(); win.webContents.focus(); win.webContents.send('browser:find', { open: true }); break;
    case 'fullscreen': setFullscreen(typeof args.value === 'boolean' ? args.value : !win.isFullScreen()); break;
    case 'color-close': closeColorPicker(); break;
    case 'color-picking':
      if (!colorWindow || colorTabId !== t?.id || typeof args.value !== 'boolean') throw new Error('Open the background color dialog first.');
      if (args.value) {
        const image = await t.native.screenshot();
        if (!colorWindow || colorTabId !== t.id || activeId !== t.id) return getState();
        colorPreview = `data:image/png;base64,${image}`;
      } else colorPreview = null;
      colorPicking = args.value;
      layout();
      if (!colorPicking) colorWindow.focus();
      break;
    case 'flash-background': {
      if (!t?.native || t.kind !== 'flash' || (colorTabId && colorTabId !== t.id)) throw new Error('Open a SWF to set its background.');
      if (!/^#[0-9a-f]{6}$/i.test(args.color || '')) throw new Error('Enter a six-digit hex color.');
      const color = args.color.toLowerCase();
      t.flashSource.background = color;
      const entry = store.data.library.find(item => item.id === t.flashSource.libraryId);
      if (entry && !t.private) { entry.background = color; store.save(); }
      await t.native.call('background', { color });
      break;
    }
    case 'theme': {
      store.data.settings.theme = store.data.settings.theme === 'light' ? 'current' : 'light';
      nativeTheme.themeSource = store.data.settings.theme === 'light' ? 'light' : 'dark';
      win.setBackgroundColor(store.data.settings.theme === 'light' ? '#e9e9e9' : '#212121');
      store.save();
      await Promise.all(tabs.filter(tab => tab.native).map(tab => tab.native.call('theme', { theme: store.data.settings.theme }).catch(() => {})));
      break;
    }
    case 'flash-quality': {
      if (!['high', 'medium', 'low'].includes(args.quality)) throw new Error('Choose high, medium or low Flash quality.');
      store.data.settings.flashQuality = args.quality; store.save();
      await Promise.all(tabs.filter(tab => tab.native).map(tab => tab.native.call('quality', { quality: args.quality })));
      break;
    }
    case 'native-mode': if (t && isWebURL(t.url)) { if (t.native) { t.native.dispose(); t.native = null; t.forceModern = true; await navigate(t, t.url); } else { t.forceModern = false; await activateNative(t, t.url); } } break;
    case 'navigate': closeSuggestions(); closeZoomPopup(); panel = null; await navigate(t, args.value); break;
    case 'contact-email': await shell.openExternal('mailto:sloutchevsky@gmail.com'); break;
    case 'suggest': await showSuggestions(args); break;
    case 'suggest-close': closeSuggestions(); break;
    case 'suggest-select': if (suggestionData) { const index = suggestionData.selected + (args.direction === -1 ? -1 : 1); suggestionData.selected = index < -1 ? suggestionData.items.length - 1 : index >= suggestionData.items.length ? -1 : index; } break;
    case 'suggest-open': { const item = suggestionData?.items[args.index]; if (item) { closeSuggestions(); panel = null; await navigate(t, item.url); } break; }
    case 'new-tab': createTab(typeof args.url === 'string' ? args.url : ''); break;
    case 'new-flashcognito': createTab('', false, true); break;
    case 'duplicate-tab': await duplicateTab(args.id); break;
    case 'tab-menu': showTabMenu(args); break;
    case 'select-tab': selectTab(args.id); break;
    case 'reorder': {
      const items = args.collection === 'tabs' ? tabs : args.collection === 'downloads' ? tabDownloads(t) : ['library', 'bookmarks'].includes(args.collection) ? store.data[args.collection] : null;
      if (!items) throw new Error('That collection cannot be reordered.');
      reorderItems(items, args.id, args.targetId, args.position);
      if (args.collection === 'tabs') persistTabs(); else if (!(t?.private && args.collection === 'downloads')) store.save();
      break;
    }
    case 'close-tab': closeTab(args.id); break;
    case 'back': if (t?.native) await t.native.call('back'); else if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (t?.native) await t.native.call('forward'); else if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'reload': reload(); break;
    case 'stop': if (t?.native) await t.native.call('stop'); else wc?.stop(); break;
    case 'home': panel = null; await navigate(t, ''); break;
    case 'collapse': collapsed = !collapsed; layout(); break;
    case 'panel': closeColorPicker(); closeZoomPopup(); closeSuggestions(); panel = ['bookmarks', 'history', 'downloads', 'library', 'settings', 'about'].includes(args.name) ? args.name : null; layout(); if (panel) win.webContents.focus(); break;
    case 'open-file': {
      const result = await dialog.showOpenDialog(win, { title: 'Open file', filters: [{ name: 'Browser files', extensions: ['swf', 'html', 'htm', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'mp4', 'm4v', 'webm', 'ogv', 'mov'] }, { name: 'Flash files', extensions: ['swf'] }, { name: 'PDF documents', extensions: ['pdf'] }], properties: ['openFile', 'multiSelections'] });
      for (const file of result.filePaths) await openLocal(file);
      break;
    }
    case 'add-library-source': await addLibrarySource(args.value, args.kind); break;
    case 'browse-library-source': {
      if (!['swf', 'html'].includes(args.kind)) throw new Error('Choose a SWF or HTML Flash page.');
      const result = await dialog.showOpenDialog(win, { title: args.kind === 'html' ? 'Open HTML with SWF' : 'Open a SWF', filters: [{ name: args.kind === 'html' ? 'HTML Flash pages' : 'Flash movies', extensions: args.kind === 'html' ? ['html', 'htm'] : ['swf'] }], properties: ['openFile', 'multiSelections'] });
      for (const file of result.filePaths) await addLibrarySource(file, args.kind);
      break;
    }
    case 'play-library': { const entry = store.data.library.find(e => e.id === args.id); if (entry) await addLibrarySource(entry.path || entry.url, entry.kind || 'swf'); break; }
    case 'library-image': {
      if (!store.data.library.some(item => item.id === args.id)) throw new Error('Library item not found.');
      const result = await dialog.showOpenDialog(win, { title: 'Choose a Flash library image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }], properties: ['openFile'] });
      if (!result.canceled && result.filePaths[0]) await setLibraryImage(args.id, result.filePaths[0]);
      break;
    }
    case 'library-image-remove': await removeLibraryImage(store.data.library.find(item => item.id === args.id)); break;
    case 'remove-library': await removeLibraryImage(store.data.library.find(e => e.id === args.id)); store.data.library = store.data.library.filter(e => e.id !== args.id); store.save(); break;
    case 'bookmark': {
      if (!t || !isWebURL(t.url)) break;
      const existing = store.data.bookmarks.find(b => b.url === t.url);
      if (existing) store.data.bookmarks = store.data.bookmarks.filter(b => b.id !== existing.id);
      else store.data.bookmarks.unshift({ id: crypto.randomUUID(), url: t.url, title: t.title, addedAt: new Date().toISOString() });
      store.save(); break;
    }
    case 'remove-bookmark': store.data.bookmarks = store.data.bookmarks.filter(b => b.id !== args.id); store.save(); break;
    case 'clear-history': if (!t?.private) { store.data.history = []; store.save(); } break;
    case 'clear-data': {
      const targetSession = t?.private ? privateSession : browsingSession;
      if (targetSession) { await targetSession.clearStorageData(); await targetSession.clearCache(); }
      if (!t?.private) permissions.clear();
      await Promise.all(tabs.filter(tab => tab.native && !!tab.private === !!t?.private).map(tab => tab.native.call('clear-data'))); break;
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
    case 'download-open': { const d = tabDownloads(t).find(d => d.id === args.id && d.state === 'completed'); if (d?.path) { if (/\.pdf$/i.test(d.path)) await openLocal(d.path); else { const error = await shell.openPath(d.path); if (error) throw new Error(error); } } break; }
    case 'download-reveal': { const d = tabDownloads(t).find(d => d.id === args.id); if (d?.path) shell.showItemInFolder(d.path); break; }
    case 'download-clear': if (t?.private) { for (let i = privateDownloads.length - 1; i >= 0; i--) if (!downloadItems.has(privateDownloads[i].id)) privateDownloads.splice(i, 1); } else { store.data.downloads = store.data.downloads.filter(d => downloadItems.has(d.id)); store.save(); } break;
    case 'find': if (t?.native) await t.native.call('find', args); else if (wc && typeof args.text === 'string') { if (args.text) wc.findInPage(args.text.slice(0, 2000), { forward: args.forward !== false, findNext: args.next !== true }); else wc.stopFindInPage('clearSelection'); } break;
    case 'mute': if (t?.native) await t.native.call('mute'); else if (wc) wc.setAudioMuted(!wc.isAudioMuted()); break;
    case 'zoom': await zoom([-1, 0, 1].includes(args.direction) ? args.direction : 0, !menuOpen); break;
    case 'zoom-hold': clearTimeout(zoomTimer); break;
    case 'zoom-release': clearTimeout(zoomTimer); zoomTimer = setTimeout(closeZoomPopup, 1500); break;
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
  nativeTheme.themeSource = store.data.settings.theme === 'light' ? 'light' : 'dark';
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
  win.webContents.setZoomMode('manual');
  win.webContents.on('zoom-changed', (_event, direction) => wheelZoom(activeTab(), direction === 'in' ? 1 : -1, 'browser'));
  win.webContents.on('context-menu', (_event, params) => showEditMenu(win.webContents, params));
  for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(event, () => { closeColorPicker(); closeBrowserMenu(); closeZoomPopup(); closeSuggestions(); layout(); sendState(true); });
  for (const event of ['enter-full-screen', 'leave-full-screen']) win.on(event, () => { for (const t of tabs) if (t.native) t.native.call('host-fullscreen', { value: win.isFullScreen() && t.id === activeId }).then(layout).catch(() => {}); });
  win.on('move', () => { closeColorPicker(); closeBrowserMenu(); closeZoomPopup(); closeSuggestions(); });
  win.on('minimize', () => { closeZoomPopup(); closeSuggestions(); });
  win.on('close', event => {
    if (!closing && downloadItems.size) {
      const response = dialog.showMessageBoxSync(win, { type: 'question', message: 'Downloads are still running.', detail: 'Closing Flashborn will cancel them.', buttons: ['Keep browsing', 'Close browser'], defaultId: 0, cancelId: 0 });
      if (response === 0) { event.preventDefault(); return; }
    }
    closeColorPicker(); closeBrowserMenu(); closeZoomPopup(); closeSuggestions(); persistTabs(); closing = true;
    for (const t of tabs) { if (t.native) t.native.dispose(); if (live(t)) t.view.webContents.close(); }
  });
  win.on('closed', () => { win = null; });
  ipcMain.handle('browser:command', async (event, action, args) => {
    const fromMenu = event.sender === menuWindow?.webContents && event.senderFrame?.url === MENU_URL;
    const fromZoom = event.sender === zoomWindow?.webContents && event.senderFrame?.url === ZOOM_URL;
    const fromSuggestions = event.sender === suggestionWindow?.webContents && event.senderFrame?.url === SUGGEST_URL;
    const fromColor = event.sender === colorWindow?.webContents && event.senderFrame?.url === COLOR_URL;
    if (!fromMenu && !fromZoom && !fromSuggestions && !fromColor && (event.sender !== win?.webContents || event.senderFrame?.url !== UI_URL)) throw new Error('Untrusted command source.');
    if (typeof action !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid browser command.');
    if (fromZoom && !['state', 'zoom', 'zoom-hold', 'zoom-release'].includes(action)) throw new Error('Unsupported zoom command.');
    if (fromSuggestions && !['state', 'suggest-open'].includes(action)) throw new Error('Unsupported address suggestion command.');
    if (fromColor && !['state', 'flash-background', 'color-close', 'color-picking'].includes(action)) throw new Error('Unsupported color picker command.');
    if (fromMenu && !['state', 'menu-close', 'new-tab', 'new-flashcognito', 'open-file', 'native-mode', 'panel', 'menu-find', 'print', 'zoom', 'mute', 'flash-quality', 'fullscreen'].includes(action)) throw new Error('Unsupported menu command.');
    if (fromMenu && !['state', 'zoom', 'flash-quality', 'mute', 'menu-close'].includes(action)) closeBrowserMenu(true);
    try { return { ok: true, state: await command(action, args) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  const trustedInput = event => event.sender === win?.webContents && event.senderFrame?.url === UI_URL || tabs.some(tab => live(tab) && tab.view.webContents === event.sender && event.sender.mainFrame === event.senderFrame);
  ipcMain.on('browser:private-key', event => { if (trustedInput(event)) createTab('', false, true); });
  ipcMain.on('browser:wheel', (event, direction) => { if (trustedInput(event) && [-1, 1].includes(direction)) wheelZoom(activeTab(), direction, 'dom'); });
  ipcMain.on('browser:zoom-key', (event, direction) => { if (event.sender === win?.webContents && event.senderFrame?.url === UI_URL && [-1, 0, 1].includes(direction)) zoom(direction).catch(e => win?.webContents.send('browser:notice', e.message)); });
  ipcMain.on('browser:pdf-zoom', (event, token) => {
    const t = tabs.find(tab => live(tab) && tab.view.webContents === event.sender);
    if (!t || t.id !== activeId || token !== t.pdfZoomToken) return;
    clearTimeout(t.pdfZoomTimer);
    t.pdfZoomTimer = setTimeout(() => {
      if (!live(t) || t.id !== activeId || !t.view.webContents.mainFrame.framesInSubtree.some(frame => frame.url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/'))) return;
      sendState(true); showZoomPopup().catch(() => {});
    }, 150);
  });
  ipcMain.handle('browser:drop-files', async (event, paths) => { if (!trustedInput(event)) throw new Error('Untrusted file drop.'); await openDroppedFiles(paths); });
  ipcMain.handle('browser:library-image-drop', async (event, id, paths) => {
    if (event.sender !== win?.webContents || event.senderFrame?.url !== UI_URL || !Array.isArray(paths) || paths.length !== 1) throw new Error('Invalid library image drop.');
    try { await setLibraryImage(id, paths[0]); } catch (e) { win.webContents.send('browser:notice', e.message); }
  });
  await win.loadURL(UI_URL);
  const saved = [...store.data.tabs];
  createTab();
  if (store.data.settings.restoreTabs) for (const tab of saved.slice(0, 20)) if (isWebURL(tab.url)) { const restored = createTab(tab.native ? '' : tab.url, true); if (tab.native) activateNative(restored, tab.url).catch(e => showError(restored, e.message)); }
  const file = process.argv.find(arg => /\.(swf|pdf)$/i.test(arg) && fs.existsSync(arg));
  if (file) await openLocal(file);
  if (testMode) {
    // Accessible only from main-process Playwright evaluation in a test launch.
    global.__flashborn = { getState, command, tabs, activeTab, openLocal, win, browsingSession, get privateSession() { return privateSession; }, get tabMenu() { return tabMenu; }, get menuWindow() { return menuWindow; }, get zoomWindow() { return zoomWindow; }, get editMenu() { return editMenu; }, get suggestionWindow() { return suggestionWindow; }, get colorWindow() { return colorWindow; } };
  }
}
if (gotLock) app.whenReady().then(boot).catch(error => { console.error(error); dialog.showErrorBox('Flashborn could not start', error.stack || error.message); app.quit(); });
app.on('second-instance', async (_event, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore(); win.focus();
  const file = argv.find(arg => /\.(swf|pdf)$/i.test(arg) && fs.existsSync(arg));
  if (file) try { await openLocal(file); } catch (e) { dialog.showErrorBox('Could not open file', e.message); }
});
app.on('window-all-closed', () => app.quit());
