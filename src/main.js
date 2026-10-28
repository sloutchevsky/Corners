'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, protocol, net, dialog, shell, Menu, nativeTheme, systemPreferences, clipboard, screen, nativeImage } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { resolveInput, isWebURL, containedPath, isPDFURL, reorderItems } = require('./core');
const { contentType, supportedLocalFile } = require('./files');
const { canPredict, suggestions, SearchPredictions } = require('./search-suggestions');
const { searchPage, readPageScript, makeSummary } = require('./page-summary');
const { Store } = require('./store');
const themeCycle = require('./ui/theme-cycle');
const { placeholderColor, pageTitle } = require('./library');
const { LIBRARY_PAGE_URL, isLibraryPage, isSavedLibraryPage } = require('./legacy/library-page-url');
const libraryDefaults = require('./library-page-defaults.json');
const { SupportLinks } = require('./support');
const { SitePermissions } = require('./site-permissions');
const { deletionChoices, clearSessionData } = require('./legacy/browsing-data');
const { Extensions, readManifest } = require('./extensions');
const { ExtensionBridge } = require('./extension-bridge');
const { sessionEntry, savedEntry } = require('./tab-session');
const { NativeFlash, nativeAvailable } = require('./native-flash');
const { TabSnapshots } = require('./tab-snapshots');
const { cropThumbnail } = require('./legacy/thumbnail');
const { TabThumbnailStore } = require('./tab-thumbnail-store');
const { FlashWindowRegion } = require('./flash-window-region');
const { WindowCorner } = require('./window-corner');
const {WindowScrollbars}=require('./window-scrollbars');
const {FRAME,frameRectangles}=require('./legacy/window-frame');
const {frame:windowFrame}=require('./window-edge');
const { scrollbarStyle } = require('./legacy/scrollbar-style');
const { WindowPreview, compositePreview } = require('./window-preview');
const { WindowActivation } = require('./window-activation');
const { WindowMotion } = require('./window-motion');
const { MenuMotion } = require('./menu-motion');
const { MAX_OPEN_TABS, tabLimit, excessTabs } = require('./tab-limit');
const { isFlashFallbackURL, detectionScript } = require('./legacy/compat');
const { nextZoom } = require('./legacy/zoom');
const { swfInfo, DEFAULT_BACKGROUND } = require('./swf-info');
const { qualityKey, initializeQuality } = require('./flash-quality');
const { registerSWF } = require('./file-association');
const flashRuntime = require('./legacy/runtime.json');

app.commandLine.appendSwitch('force-color-profile', 'srgb');
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: 'flashborn', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const testMode = process.env.FLASHBORN_TEST === '1';
const alphaFrame=process.env.CORNERS_ALPHA_FRAME!=='0';
const libraryPageURL = testMode && /^http:\/\/127\.0\.0\.1:\d+\/flash\.(?:gallery|library)\.html$/.test(process.env.FLASHBORN_LIBRARY_URL || '') ? process.env.FLASHBORN_LIBRARY_URL : LIBRARY_PAGE_URL;
if (testMode) process.on('uncaughtException', error => { console.error('TEST MAIN EXCEPTION', error.stack || error); app.exit(1); });
if (testMode && process.env.FLASHBORN_PROFILE) app.setPath('userData', process.env.FLASHBORN_PROFILE);
const gotLock = testMode || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.setAppUserModelId('com.flashborn.browser');
nativeTheme.themeSource = 'system';

const UI_URL = 'flashborn://ui/index.html';
const MENU_URL = 'flashborn://ui/menu.html';
const ZOOM_URL = 'flashborn://ui/zoom.html';
const SUGGEST_URL = 'flashborn://ui/suggestions.html';
const MAX_PDF_SIZE = 256 * 1024 * 1024;
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash', '.json': 'application/json', '.mp3': 'audio/mpeg', '.xml': 'text/xml', '.txt': 'text/plain' };
let win, store, supportLinks, browsingSession, activeId, panel = null, collapsed = false, closing = false;
let windowCorner,topLeftCorner,windowScrollbars;
let panelSection = null;
let restoringTabs=false;
const tabs = [];
const libraryPanels = new Map();
const downloadItems = new Map();
const sitePermissions = new WeakMap();
let windowMoving = false;
let borderlessFullscreen = false;
const isFullscreen=()=>borderlessFullscreen || !!win?.isFullScreen();
const compactChrome=()=>!!panel || activeTab()?.kind==='home' || isLibraryPage(activeTab()?.url,libraryPageURL);
const chromeContentTop=()=>windowFrame(win).y+(isFullscreen()?FRAME:compactChrome()?FRAME+120:FRAME+100);
const closedTabs = [];
const documents = new Map();
let stateTimer, menuWindow, menuPopup, menuReady, menuMotion, menuOpen = false, zoomWindow, zoomTimer, editMenu;
let menuRequest=0;
let zoomQueue = Promise.resolve();
let suggestionWindow, suggestionData = null;
let suggestionSerial = 0;
let predictionAbort;
const searchPredictions = new SearchPredictions((url, options) => net.fetch(url, options));
let tabMenu;
let privateSession;
let extensions, extensionBridge;
const extensionWindows = new Map();
let sidebarWidth = 320;
let focusArea = 'chrome';
let focusIntentAt = 0, contentFocusTimer;
let tabPresentation = null, presentationSerial = 0;
const closingMenus = new Set();
function retainClosingMenu(menu) {
  // Chromium can still be unwinding its native popup loop when this callback
  // fires. Keep the wrapper alive beyond the callback before allowing GC.
  closingMenus.add(menu);
  setTimeout(() => closingMenus.delete(menu), 1000).unref();
}
const SUMMARY_MODE = 'search';
const privateDownloads = [];
let snapshotTimer, thumbnailStore, flashWindowRegion, windowPreview, windowActivation, windowMotion;
let libraryPageKey = '';
function appearanceBackground(popup = false) {
  const light = store.data.settings.theme === 'light';
  return store.data.settings.highContrast ? light ? '#ffffff' : '#000000' : light ? popup ? '#f0f0f0' : '#e9e9e9' : popup ? '#282828' : '#212121';
}
function applyAppearance() {
  nativeTheme.themeSource = store.data.settings.theme === 'light' ? 'light' : 'dark';
  if (win && !win.isDestroyed()) win.setBackgroundColor(alphaFrame?'#00000000':appearanceBackground());
  for (const popup of [zoomWindow, suggestionWindow]) if (popup && !popup.isDestroyed()) popup.setBackgroundColor(appearanceBackground(true));
  windowCorner?.setTheme(store.data.settings.theme==='light');
  topLeftCorner?.setTheme(store.data.settings.theme==='light');
  windowScrollbars?.layout();
  for(const tab of allContents())stylePageScrollbars(tab);
}
function scrollbarTarget(){
 const tab=activeContent();
 if(tab?.galleryFrame){const frame=win.webContents.mainFrame.framesInSubtree.find(frame=>frame.name==='corners-gallery-'+tab.id&&isLibraryPage(frame.url,libraryPageURL));return frame?{id:'gallery:'+tab.id,run:code=>frame.executeJavaScript(code)}:null;}
 if(panel||!tab||tab.kind==='home'||tab.error)return {id:'shell:'+panel+':'+(tab?.id||''),selector:'#content',run:code=>win.webContents.executeJavaScript(code)};
 if(tab.native)return {id:'native:'+tab.id,run:code=>tab.native.evaluate(code)};
 if(live(tab))return {id:'web:'+tab.view.webContents.id,run:code=>tab.view.webContents.executeJavaScript(code)};
 return null;
}
async function stylePageScrollbars(tab){
  const light=store.data.settings.theme==='light';
  if(tab.native){tab.native.call('scrollbar-theme',{light}).catch(()=>{});return;}
  if(!live(tab))return;
  const wc=tab.view.webContents,revision=tab.scrollbarRevision=(tab.scrollbarRevision||0)+1;
  try{
    const key=await wc.insertCSS(scrollbarStyle(light),{cssOrigin:'user'});
    if(wc.isDestroyed())return;
    if(revision!==tab.scrollbarRevision){wc.removeInsertedCSS(key).catch(()=>{});return;}
    const previous=tab.scrollbarCSS;tab.scrollbarCSS=key;
    if(previous)wc.removeInsertedCSS(previous).catch(()=>{});
  }catch{}
}
const tabSnapshots = new TabSnapshots(captureTabSnapshot, tab => JSON.stringify([snapshotPage(tab), tab.native?.child?.pid || 0, live(tab) ? tab.view.webContents.id : 0]), {
  page: snapshotPage,
  onFrame: (tab, frame) => {
    if (closing) return;
    retainThumbnails(); thumbnailStore?.put(sessionEntry(tab), frame);
    if (['bookmarks', 'history'].includes(panel)) sendState();
  }
});

const activeTab = () => tabs.find(t => t.id === activeId);
const allContents = () => [...tabs, ...libraryPanels.values()];
const activeContent = () => panel === 'library' ? libraryPanels.get(!!activeTab()?.private) : panel ? null : activeTab();
const ownsContent = t => !!t && (tabs.includes(t) || libraryPanels.get(!!t.private) === t);
const live = t => !!t?.view?.webContents && !t.view.webContents.isDestroyed();
const tabDownloads = t => t?.private ? privateDownloads : store.data.downloads;
function snapshotPage(tab) { return JSON.stringify([tab.url, tab.kind, !!tab.native || !!tab.restoreEntry?.native]); }
function smallSnapshot(image, tab) {
  if (!image || image.isEmpty()) return null;
  image = cropThumbnail(image);
  const size = image.getSize(), scale = Math.min(512 / size.width, 320 / size.height, 1);
  const resized = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'good' });
  return { data: 'data:image/jpeg;base64,' + resized.toJPEG(72).toString('base64'), ...resized.getSize(), page: snapshotPage(tab) };
}
async function captureTabSnapshot(tab) {
  if (closing || tab.private || tab.kind === 'home' || !tabs.includes(tab) || tab.loading || tab.error || tab.restoreEntry || tab.recreateNative || windowMoving) return null;
  const page = snapshotPage(tab), native = tab.native;
  if (native) {
    // Keep background Flash asleep. Its last visible frame is retained in RAM;
    // never show, focus, reload or change plugin settings to obtain a preview.
    if (tab.id !== activeId || panel || !native.isPresented() || native.stopped) return null;
    const frame = await native.call('snapshot');
    return frame && native === tab.native && page === snapshotPage(tab) ? { ...frame, page } : null;
  }
  if (!live(tab)) return null;
  const wc = tab.view.webContents, image = await wc.capturePage(undefined, { stayHidden: true });
  return !wc.isDestroyed() && page === snapshotPage(tab) ? smallSnapshot(image, tab) : null;
}
async function requestTabSnapshot(tab) {
  const frame = await tabSnapshots.request(tab);
  if (!frame || closing || !tabs.includes(tab) || frame.page !== snapshotPage(tab)) return;
  win?.webContents.send('browser:tab-snapshot', frame);
}
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
  const library = libraryPanels.get(true);
  if (library) { library.native?.dispose(); if (live(library)) library.view.webContents.close(); libraryPanels.delete(true); }
  for (const entry of privateDownloads) downloadItems.get(entry.id)?.cancel();
  privateDownloads.length = 0;
  const ended = privateSession;
  privateSession = null;
  if (ended) Promise.allSettled([ended.clearStorageData(), ended.clearCache(), ended.clearAuthCache()]);
}

function publicTab(t) {
  const wc = live(t) ? t.view.webContents : null;
  const flash = { flashDetected: t.native?.state.hasFlash ?? t.hasFlash ?? !!t.restoreEntry?.native, boltRevision: t.boltRevision || 0, flashQuality: t.flashQuality || store.data.settings.flashQuality };
  if (t.native) return { id: t.id, private: !!t.private, kind: t.kind, title: t.title, url: t.url, loading: t.loading, error: t.error, native: true,
    ...flash, muted: !!t.native.state.muted, audible: !!t.native.state.audible, canBack: !!t.native.state.canBack, canForward: !!t.native.state.canForward, zoom: t.native.state.zoom || 100 };
  return { id: t.id, galleryFrame:!!t.galleryFrame, private: !!t.private, kind: t.kind, title: t.title, url: t.url, loading: t.loading, error: t.error, native: !!t.restoreEntry?.native, muted: wc?.isAudioMuted() || false, audible: wc?.isCurrentlyAudible() || false,
    ...flash, canBack: wc?.navigationHistory.canGoBack() || false, canForward: wc?.navigationHistory.canGoForward() || false, zoom: Math.round((wc?.getZoomFactor() || 1) * 100) };
}
function getState() {
  return { tabs: tabs.map(publicTab), activeId, panel, panelSection, collapsed, menuOpen, compactChrome:compactChrome(), pageSummary: summaryFor(activeTab()), suggestions: suggestionData, maximized: win?.isMaximized(), fullscreen: isFullscreen(), bookmarks: store.data.bookmarks,
    history: activeTab()?.private ? [] : store.data.history, library: flashPages(), downloads: tabDownloads(activeTab()), settings: store.data.settings, thumbnailRevision: thumbnailStore?.revision || 0,
    support: supportLinks?.state() || {}, supporter:store.data.supporter, libraryDirectory: store.libraryFolder.directory, libraryHeading: store.libraryFolder.heading, hostedLibraryActive: panel === 'library', panelPage: panel === 'library' && activeContent() ? publicTab(activeContent()) : null, libraryPageURL, tabPresentation: tabPresentation?.serial || 0,
    presentationHome: !panel && tabPresentation?.from.kind === 'home' ? publicTab(tabPresentation.from) : null,
    extensions: extensions?.state() || [], flashReady: nativeAvailable(), version: require('../package.json').version, chromium: process.versions.chrome, flashVersion: flashRuntime.version, flashRuntime: '9.4.4' };
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
    publishLibraryPages();
  } else if (!stateTimer) {
    stateTimer = setTimeout(() => { stateTimer = null; sendState(true); }, 40);
  }
}
function retainThumbnails() {
  thumbnailStore?.retain(store.data.settings.restoreTabs ? store.data.tabs : [], [...store.data.bookmarks, ...store.data.history].map(item => item.url));
}
function persistTabs() {
  const saved = tabs.map(t => ({ tab: t, entry: sessionEntry(t) })).filter(item => item.entry).slice(0, MAX_OPEN_TABS);
  store.data.tabs = saved.map(item => item.entry);
  retainThumbnails();
  const selected = saved.findIndex(item => item.tab.id === activeId);
  if (selected >= 0) store.data.activeTabIndex = selected;
  store.save();
}
function fileDialogDirectory(fallback) {
  const saved = store.data.settings.lastFileDialogFolder || store.data.settings.lastAddPageFolder;
  if (typeof saved === 'string' && path.isAbsolute(saved)) {
    try { if (fs.statSync(saved).isDirectory()) return saved; } catch { /* A removed folder falls back to the dialog's default. */ }
  }
  return fallback;
}
function rememberFileDialogLocation(selectedPath, directory = false) {
  if (typeof selectedPath !== 'string' || !path.isAbsolute(selectedPath)) return;
  const folder = directory ? selectedPath : path.dirname(selectedPath);
  if (store.data.settings.lastFileDialogFolder === folder) return;
  store.data.settings.lastFileDialogFolder = folder;
  store.save();
}
async function showOpenFileDialog(options) {
  const result = await dialog.showOpenDialog(win, { ...options, defaultPath: fileDialogDirectory() });
  if (!result.canceled) rememberFileDialogLocation(result.filePaths[0], options.properties?.includes('openDirectory'));
  return result;
}
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize(),frame=windowFrame(win);
  const vertical=FRAME;
  const insets={left:frame.x+FRAME,top:frame.y+vertical,right:width-frame.x-frame.width+FRAME,bottom:height-frame.y-frame.height+vertical};
  const frameKey=JSON.stringify(insets);if(frameKey!==win.chromeFrameKey){win.chromeFrameKey=frameKey;win.webContents.send('browser:window-frame',insets);}
  const retiring = !panel && tabPresentation?.from;
  const current = activeContent();
  const ordered = [...new Set([retiring, current, ...allContents()].filter(Boolean))];
  for (const t of ordered) {
    const full = isFullscreen();
    const left = frame.x + FRAME + (full ? 0 : sidebarWidth);
    const summaryHeight = !full && !panel && t.id === activeId && summaryFor(t) ? t.summaryHeight || 0 : 0;
    const special=t.specialPage || t.kind==='home' || isLibraryPage(t.url,libraryPageURL);
    const top = frame.y + (full || special ? FRAME : FRAME+100+summaryHeight);
    const rect = { x: left, y: top, width: Math.max(1, frame.x+frame.width - FRAME - left), height: Math.max(1, frame.y+frame.height - FRAME - top) };
    const shown = !t.error && (t === current || t === retiring);
    if (live(t)) {
      t.view.setBounds(rect); t.view.setVisible(!t.native && shown);
      const inputEnabled = t === current && !t.error;
      if (t.inputEnabled !== inputEnabled) { t.inputEnabled = inputEnabled; t.view.webContents.send('browser:tab-active', inputEnabled); }
    }
    if (t.native) {
      t.native.resizeInset = 0;
      t.native.bounds(rect, !win.isMinimized() && shown, { retiring: t === retiring, above: t === current ? retiring?.native?.hwnd : null, preparing: t === current && !!tabPresentation && !tabPresentation.swapping, handoff: t === current && !!tabPresentation });
    }
  }
  windowCorner?.layout();
  topLeftCorner?.layout();
  windowScrollbars?.layout();
  updateFlashWindowRegion();
}
function updateFlashWindowRegion() {
  if (!flashWindowRegion || !win || win.isDestroyed()) return;
  flashWindowRegion.setFrame(frameRectangles(windowFrame(win),windowScrollbars?.bars));
  const current = activeContent();
  const movie = !current?.error && [current?.native, !panel && tabPresentation?.from.native].find(native => native?.wantedVisible && native.isPresented());
  flashWindowRegion.update(movie?.lastBounds ? { hwnd: movie.hwnd, bounds: movie.lastBounds } : null);
  windowScrollbars?.stackAbove(movie?.hwnd);windowCorner?.stackAbove(movie?.hwnd);topLeftCorner?.stackAbove(movie?.hwnd);
  const previewMovie = movie || (win.isMinimized() && current?.native);
  windowMotion?.update(movie || (!current?.error && current?.native && (windowMotion.active || windowMotion.native===current.native) ? current.native : null));
  windowPreview?.update(previewMovie ? previewMovie.tabId + ':' + previewMovie.child.pid : null);
}
async function captureWindowPreview() {
  const native = activeContent()?.native;
  if (!native?.isPresented()) return null;
  const [shell, frame] = await Promise.all([win.webContents.capturePage(), native.call('snapshot', { windowPreview: true })]);
  if (!frame || native !== activeContent()?.native || !native.isPresented() || win.isDestroyed()) return null;
  const shellImage = nativeImage.createFromBuffer(shell.toPNG()), size = shellImage.getSize(), [width, height] = win.getContentSize();
  const bounds = native.viewport, rect = { x: Math.round(bounds.x * size.width / width), y: Math.round(bounds.y * size.height / height), width: Math.round(bounds.width * size.width / width), height: Math.round(bounds.height * size.height / height) };
  const movie = nativeImage.createFromDataURL(frame.data).resize({ width: rect.width, height: rect.height, quality: 'best' });
  return compositePreview({ ...size, data: shellImage.toBitmap() }, { ...movie.getSize(), data: movie.toBitmap() }, rect);
}
function clearPresentation() {
  if (!tabPresentation) return;
  clearTimeout(tabPresentation.deadline); clearTimeout(tabPresentation.release);
  tabPresentation = null;
}
function swapPresentation(serial) {
  const p = tabPresentation;
  if (!p || p.serial !== serial || p.swapping || !p.hostReady || !p.surfaceReady) return;
  p.swapping = true; layout();
  const release = () => {
    if (tabPresentation !== p) return;
    const next = activeTab();
    if (next?.native && !next.error && !next.native.isPresented()) { p.release = setTimeout(release, 8); return; }
    clearPresentation(); layout(); sendState(true);
    if (next?.native && focusArea === 'content' && !panel && !next.error) next.native.focus();
  };
  p.release = setTimeout(release, 32);
}
function preparePresentation(previous, next) {
  if (previous === next) return;
  const old = tabPresentation;
  const from = old && (!old.swapping || previous?.native && !previous.native.isPresented()) ? old.from : previous;
  clearPresentation();
  if (!from || from === next || from.error || !(from.native?.lastVisible || live(from) || from.kind === 'home' && next.native)) return;
  const p = tabPresentation = { serial: ++presentationSerial, from, hostReady: false, surfaceReady: false, swapping: false };
  p.deadline = setTimeout(() => {
    if (tabPresentation !== p) return;
    // A slow/failed Flash renderer must not replace a valid frame with an empty
    // HWND. Keep the UI responsive and offer its usual Reload error instead.
    clearPresentation();
    showError(next, 'This tab could not prepare its next frame. Reload to try again.');
  }, 5000);
  // One compositor capture requests a ready frame without reading movie APIs
  // or sending image data through IPC. A hung renderer cannot delay the shell.
  const ready = next.native ? next.native.present() : live(next) ? next.view.webContents.capturePage() : Promise.resolve();
  Promise.resolve(ready).then(() => { if (tabPresentation === p) { p.surfaceReady = true; swapPresentation(p.serial); } }).catch(error => {
    if (tabPresentation !== p) return;
    clearPresentation(); showError(next, error.message);
  });
}
function summaryFor(t) {
  return store?.data.settings.pageSummaries && !t?.native && !t?.error && t?.summary && t.summary.url === t.url ? t.summary : null;
}
function clearSummary(t) {
  if (!t) return;
  clearTimeout(t.summaryTimer); t.summarySerial = (t.summarySerial || 0) + 1;
  const hadSummary = !!t.summary; t.summary = null; t.summaryHeight = 0;
  if (hadSummary) { layout(); sendState(true); }
}
function scheduleSummary(t, delay = 180) {
  clearTimeout(t.summaryTimer);
  const eligible = store.data.settings.pageSummaries && t.summaryDismissedURL !== t.url && !t.native && t.kind === 'web' && live(t) && isWebURL(t.url) && (SUMMARY_MODE !== 'search' || !!searchPage(t.url));
  if (live(t)) t.view.webContents.send('browser:summary-watch', !!eligible);
  if (!eligible) { clearSummary(t); return; }
  const serial = t.summarySerial = (t.summarySerial || 0) + 1, url = t.url;
  const read = async attempt => {
    if (serial !== t.summarySerial || !store.data.settings.pageSummaries || t.native || !live(t) || t.url !== url || t.view.webContents.getURL() !== url) return;
    try {
      const content = await t.view.webContents.executeJavaScript(readPageScript);
      if (serial !== t.summarySerial || t.native || !live(t) || t.url !== url || !store.data.settings.pageSummaries) return;
      const summary = makeSummary(content, url, SUMMARY_MODE);
      if (summary?.provider && content.results.length < 2 && attempt < 5) {
        t.summaryTimer = setTimeout(() => read(attempt + 1), 600); return;
      }
      if (summary) {
        const zoom = t.view.webContents.getZoomFactor();
        summary.layout.left *= zoom; summary.layout.width = Math.min(900, summary.layout.width * zoom);
        if (JSON.stringify(summary) !== JSON.stringify(t.summary)) { t.summary = summary; if (t.id === activeId) { layout(); sendState(true); } }
      } else if (attempt < 5) t.summaryTimer = setTimeout(() => read(attempt + 1), 600);
      else clearSummary(t);
    } catch { /* Navigation destroys the previous page's execution context. */ }
  };
  t.summaryTimer = setTimeout(() => read(0), delay);
}
function selectTab(id) {
  const t = tabs.find(t => t.id === id);
  if (!t) return;
  const previous = panel ? null : activeTab();
  // A keyboard tab switch can originate in the independent Flash window.
  // Activate our shell before hiding that window so Windows does not choose
  // an unrelated application as the next foreground window.
  if (win.isVisible() && !win.isMinimized()) win.focus();
  closeZoomPopup();
  closeSuggestions();
  activeId = id;
  panel = null;
  focusArea = t.kind === 'home' ? 'chrome' : 'content';
  focusIntentAt = Date.now();
  preparePresentation(previous, t);
  layout();
  if (t.restoreEntry) resumeTab(t).catch(e => showError(t, e.message));
  if (t.native && !t.error && !tabPresentation) t.native.focus();
  else if (live(t) && !t.error) t.view.webContents.focus();
  else win.webContents.focus();
  extensionBridge?.selected(t);
  persistTabs();
  sendState(true);
}
async function resumeTab(t) {
  if (t.restoring) return t.restoring;
  const entry = t.restoreEntry;
  if (!entry) return;
  t.restoreEntry = null;
  if (entry.quality) t.flashQuality = entry.quality;
  t.restoring = (async () => {
    try {
      if (entry.kind === 'flash') await openStandalone(entry.path || entry.url, t);
      else if (entry.kind === 'local' && entry.native) await activateNativeLocal(t, entry.path);
      else if (['local', 'pdf'].includes(entry.kind)) await openLocal(entry.path, t);
      else if (entry.kind === 'web') {
        if (entry.native&&!isLibraryPage(entry.url,libraryPageURL)) await activateNative(t, entry.url);
        else await navigate(t, entry.url);
      }
      if (t.native) {
        await t.native.call('restore-state', { zoom: entry.zoom, muted: entry.muted });
        if (t.id === activeId && !panel && focusArea === 'content') t.native.focus();
      } else if (live(t)) {
        t.view.webContents.setZoomFactor((entry.zoom || 100) / 100); t.view.webContents.setAudioMuted(!!entry.muted);
      }
    } catch (e) { t.restoreEntry = entry; throw e; }
    finally { t.restoring = null; }
  })();
  return t.restoring;
}
function closeTab(id, batch=false) {
  const index = tabs.findIndex(t => t.id === id);
  if (index < 0) return;
  const t = tabs[index];
  const closed=sessionEntry(t);
  tabSnapshots.forget(id);
  if (tabPresentation && (tabPresentation.from === t || id === activeId)) clearPresentation();
  if (t.native && t.id === activeId && win.isVisible() && !win.isMinimized()) win.focus();
  for (const [token, document] of documents) if (document.tabId === id) documents.delete(token);
  clearTimeout(t.flashDetectionTimer);
  clearSummary(t);
  if (t.native) t.native.dispose();
  if (closed) closedTabs.push(closed);
  if (closedTabs.length > MAX_OPEN_TABS) closedTabs.shift();
  if (live(t)) {
    win.contentView.removeChildView(t.view);
    t.view.webContents.close();
    t.view = null;
  }
  tabs.splice(index, 1);
  if(batch)return;
  if (!tabs.length) createTab('', false, false);
  else if (activeId === id) selectTab(tabs[Math.min(index, tabs.length - 1)].id);
  else layout();
  persistTabs();
  finishPrivateSession();
  sendState(true);
}
function enforceTabLimit(keepId,limit=store.data.settings.tabLimit) {
  if(restoringTabs)return;
  const protectedIds=new Set(keepId ? [keepId] : []);
  for(const tab of tabs){
    const audible=tab.native ? tab.native.state.audible : live(tab) && tab.view.webContents.isCurrentlyAudible();
    if(audible || [...store.data.downloads,...privateDownloads].some(item=>item.tabId===tab.id && downloadItems.has(item.id)))protectedIds.add(tab.id);
  }
  const victims=excessTabs(tabs,activeId,{...store.data.settings,tabLimit:limit},protectedIds);
  if(!victims.length)return;
  for(const id of victims)closeTab(id,true);
  layout();persistTabs();finishPrivateSession();sendState(true);
}
function wireContents(t) {
  const wc = t.view.webContents;
  wc.on('focus', () => {
    if (t.id === activeId && !panel && !t.native) { focusArea = 'content'; closeBrowserMenu(); closeSuggestions(); win.webContents.send('browser:blur-fields'); }
  });
  // Manual mode records zoom levels but deliberately does not scale the renderer.
  wc.setZoomMode('isolated');
  wc.on('zoom-changed', (_event, direction) => wheelZoom(t, direction === 'in' ? 1 : -1, 'browser'));
  wc.setWindowOpenHandler(({ url }) => {
    if (isWebURL(url)) {
      const opened = createTab(url, false, t.private, t.id);
      if (!t.private && live(opened)) extensionBridge?.emit('webNavigation.onCreatedNavigationTarget', [{ sourceTabId: wc.id, sourceFrameId: 0, tabId: opened.view.webContents.id, url, timeStamp: Date.now() }]);
    }
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
    if (/\.swf$/i.test(new URL(destination).pathname)) { event.preventDefault(); openStandalone(destination, t).catch(e => showError(t, e.message)); }
  });
  wc.on('will-redirect', (event, url) => {
    const destination = event.url || url;
    if (!isWebURL(destination) && !isDocumentURL(destination)) event.preventDefault();
    else if (store.data.settings.flashEnabled && !t.native && !t.forceModern && isFlashFallbackURL(destination)) {
      const original = isWebURL(wc.getURL()) ? wc.getURL() : t.url;
      if (isWebURL(original) && new URL(original).origin === new URL(destination).origin && !isFlashFallbackURL(original)) { event.preventDefault(); activateNative(t, original).catch(e => showError(t, e.message)); }
    }
    else if (/\.swf$/i.test(new URL(destination).pathname)) { event.preventDefault(); openStandalone(destination, t).catch(e => showError(t, e.message)); }
  });
  wc.on('did-start-loading', () => {
    if (wc.isLoadingMainFrame()) {
      t.summaryDismissedURL = null; clearSummary(t);
    }
    t.loading = true; sendState(true);
  });
  wc.on('did-stop-loading', () => { t.loading = false; sendState(); requestTabSnapshot(t).catch(() => {}); });
  wc.on('page-title-updated', (_event, title) => { if (['web', 'local', 'extension'].includes(t.kind)) t.title = title.slice(0, 200); sendState(); });
  const navigated = () => {
    if (['web', 'pdf', 'local', 'extension'].includes(t.kind)) {
      const url = wc.getURL();
      if (isWebURL(url)) { t.kind = 'web'; t.url = url; t.title = wc.getTitle() || new URL(url).hostname; t.error = null; }
      persistTabs();
    }
    layout(); sendState();
    scheduleSummary(t);
  };
  wc.on('did-navigate', navigated);
  wc.on('did-navigate-in-page', navigated);
  wc.on('dom-ready', () => {
    stylePageScrollbars(t);
    wc.send('browser:tab-active', t.inputEnabled !== false);
    scheduleSummary(t);
  });
  wc.on('did-finish-load', () => {
    if (t.kind === 'web' && isWebURL(t.url)) {
      const item = { id: crypto.randomUUID(), url: t.url, title: wc.getTitle() || t.title, visitedAt: new Date().toISOString() };
      if (!t.private) {
        store.data.history = [item, ...store.data.history.filter(h => h.url !== t.url)].slice(0, 500);
        store.save(); retainThumbnails(); sendState();
      }
      detectFlashFrames(t);
      scheduleSummary(t);
    }
  });
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) showError(t, description === 'ERR_INTERNET_DISCONNECTED' ? 'You appear to be offline. Check your connection and try again.' : `Could not load this page (${description}).`);
  });
  wc.on('did-frame-finish-load', () => { detectFlashFrames(t); wirePDFZoom(t); });
  wc.on('render-process-gone', (_event, details) => showError(t, `This tab stopped responding (${details.reason}). Reload to continue.`));
  wc.on('found-in-page', (_event, result) => { if (t.id === activeId) win.webContents.send('browser:find', result); });
  wc.on('audio-state-changed', () => sendState());
  wc.on('enter-html-full-screen', () => setFullscreen(true));
  wc.on('leave-html-full-screen', () => setFullscreen(false));
  wc.on('before-input-event', (event, input) => handleKeys(event, input));
  wc.on('context-menu', (_event, params) => {
    const items = [];
    if (params.isEditable) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' }, { label: 'Search selection', click: () => createTab((require('./core').SEARCH_ENGINES[store.data.settings.searchEngine] || require('./core').SEARCH_ENGINES.duckduckgo) + encodeURIComponent(params.selectionText.slice(0, 2000)), false, t.private, t.id) });
    if (isWebURL(params.linkURL)) items.push({ label: 'Open link in new tab', click: () => createTab(params.linkURL, false, t.private, t.id) }, { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) });
    if (isWebURL(params.srcURL)) items.push({ label: 'Save image / media as…', click: () => wc.downloadURL(params.srcURL) });
    if (items.length) items.push({ type: 'separator' });
    items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: 'Reload', click: () => reload(t) }, { label: 'Print…', click: () => wc.print() });
    const extensionItems = extensionBridge?.contextMenu(t, params) || [];
    if (extensionItems.length) items.push({ type: 'separator' }, ...extensionItems);
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}
function detectFlashFrames(t) {
  clearTimeout(t.flashDetectionTimer);
  const eligible = () => t.kind === 'web' || t.kind === 'local' && /\.html?$/i.test(t.localPath || '');
  if (!store.data.settings.flashEnabled || t.native || t.forceModern || !eligible()) return;
  t.flashDetectionTimer = setTimeout(async () => {
    if (!live(t) || t.native || !eligible()) return;
    await checkFlashPage(t).catch(e => showError(t, e.message));
  }, 120);
}
async function checkFlashPage(t) {
  if (t.flashCheckPending) return t.flashCheckPending;
  t.flashCheckPending = scanFlashPage(t);
  try { await t.flashCheckPending; }
  finally { t.flashCheckPending = null; }
}
async function scanFlashPage(t) {
  if (!live(t) || t.native) return;
  const wc = t.view.webContents, url = wc.getURL();
  const found = await Promise.all(wc.mainFrame.framesInSubtree.map(frame => frame.executeJavaScript(detectionScript).catch(() => false)));
  if (!tabs.includes(t) || !live(t) || t.view.webContents !== wc || wc.getURL() !== url || t.native) return;
  t.hasFlash = found.some(Boolean);
  sendState(true);
  if (t.hasFlash) await (t.kind === 'local' ? activateNativeLocal(t, t.localPath) : activateNative(t, t.url));
}
async function toggleFlash(t) {
  if (!t) return;
  t.boltRevision = (t.boltRevision || 0) + 1;
  sendState(true);
  if (t.flashTogglePending) return;
  t.flashTogglePending = (async () => {
    // An explicit click can recover a stopped player even if its IPC thread is
    // unresponsive. Detection, rather than the chosen engine, controls the icon.
    if (t.restoring || t.nativeNavigation) { await (t.restoring || t.nativeNavigation); return; }
    if (t.native || t.restoreEntry) { await reload(t); return; }
    t.forceModern = false;
    if (t.kind === 'web' || t.kind === 'local' && /\.html?$/i.test(t.localPath || '')) await checkFlashPage(t);
  })();
  try { await t.flashTogglePending; }
  finally { t.flashTogglePending = null; }
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
  // Transparent website canvases use the normal browser default, independently
  // of Corners's chrome. The site's own CSS paints over this backing.
  t.view.setBackgroundColor('#ffffff');
  win.contentView.addChildView(t.view);
  windowCorner?.raise();
  wireContents(t);
  extensionBridge?.addTab(t);
  layout();
}
function showError(t, message) { if (closing || !ownsContent(t)) return; t.error = message; t.loading = false; layout(); sendState(true); }
async function navigate(t, value) {
  if (/^(?:chrome|flashborn):\/\/extensions\/?$/i.test(String(value).trim())) { panel = 'extensions'; layout(); focusChrome(); sendState(true); return; }
  const target = resolveInput(value, store.data.settings.searchEngine);
  t.galleryFrame=false;
  t.restoreEntry = null;
  t.hasFlash = false;
  t.forceModern = false;
  t.error = null;
  if (target.type === 'home') {
    if (t.native) { t.native.dispose(); t.native = null; }
    if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
      t.kind = 'home'; t.url = ''; t.title = t.private ? 'Flashcognito tab' : 'New tab'; t.loading = false;
    layout(); persistTabs(); sendState(true); return;
  }
  if (target.type === 'file') { await openLocal(target.path, t); return; }
  if (target.type === 'flash') { await openStandalone(target.url, t); return; }
  if(isLibraryPage(target.url,libraryPageURL)){
    t.native?.dispose();t.native=null;if(live(t)){win.contentView.removeChildView(t.view);t.view.webContents.close();t.view=null;}
    t.kind='web';t.url=target.url;t.title='Flash Gallery';t.loading=false;t.galleryFrame=true;
    layout();persistTabs();sendState(true);return;
  }
  if (t.native) { t.native.dispose(); t.native = null; }
  t.kind = 'web'; t.url = target.url; t.title = new URL(target.url).hostname; t.loading = true;
  initializeQuality(t, store.data.flashQualities);
  ensureView(t); layout(); sendState(true);
  try { await t.view.webContents.loadURL(target.url); } catch (e) { if (e.code !== 'ERR_ABORTED') showError(t, e.message); }
}
function createTab(value = '', background = false, privateMode = !!activeTab()?.private, openerId = null, append = false) {
  if(tabs.length>=MAX_OPEN_TABS){
    enforceTabLimit(undefined,Math.min(store.data.settings.tabLimit,MAX_OPEN_TABS-1));
    if(tabs.length>=MAX_OPEN_TABS){dialog.showMessageBox(win,{type:'info',message:'Close a tab before opening another.',detail:'Corners supports up to 100 open tabs. Audible tabs and active downloads are kept open.'});return;}
  }
  const t = { id: crypto.randomUUID(), thumbnailId: privateMode ? null : crypto.randomUUID(), private: !!privateMode, kind: 'home', url: '', title: privateMode ? 'Flashcognito tab' : 'New tab', loading: false, error: null, view: null };
  if (append) tabs.push(t);
  else tabs.unshift(t);
  if (!background) selectTab(t.id);
  enforceTabLimit(t.id);
  if (value) navigate(t, value).catch(e => showError(t, e.message));
  sendState(true);
  return t;
}

async function openLocal(filename, existing) {
  const absolute = path.resolve(filename);
  if (/\.swf$/i.test(absolute)) { await openStandalone(absolute, existing); return; }
  if (!supportedLocalFile(absolute)) throw new Error('Choose an HTML, SWF, PDF, image or video file.');
  await openDocument(absolute, existing);
}
async function openStandalone(value, existing) {
  const remote = isWebURL(value), file = remote ? null : await fsp.realpath(value);
  let info = { background: DEFAULT_BACKGROUND };
  if (file) {
    const stat = await fsp.stat(file);
    if (!stat.isFile() || stat.size > 256 * 1024 * 1024) throw new Error('Choose a SWF file smaller than 256 MB.');
    info = await swfInfo(await fsp.readFile(file));
  } else {
    // Background metadata is best-effort for remote movies. Adobe streams the
    // original URL itself, preserving relative asset locations.
    try {
      const response = await net.fetch(value, { signal: AbortSignal.timeout(5000), credentials: 'omit' });
      const reader = response.body.getReader(), parts = []; let size = 0;
      try { while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > 16 * 1024 * 1024) throw new Error('Metadata limit'); parts.push(Buffer.from(result.value)); } info = await swfInfo(Buffer.concat(parts)); }
      finally { await reader.cancel().catch(() => {}); }
    } catch { /* Missing optional metadata uses light grey. */ }
  }
  const t = existing || createTab(); if (!t) return;
  t.kind = 'flash'; t.localPath = file; t.url = remote ? value : pathToFileURL(file).href;
  t.title = remote ? decodeURIComponent(new URL(value).pathname.split('/').pop()) : path.basename(file);
  t.hasFlash = true; t.loading = true; t.error = null; t.flashBackground = info.background;
  await ensureNative(t);
  if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
  if (t.id === activeId) panel = null;
  layout(); sendState(true);
  await t.native.call('standalone', { path: file, url: remote ? value : null, token: crypto.randomUUID(), background: info.background });
  persistTabs();
}
function flashPages() {
  // Keep previous SWF records on disk, but never launch them in website-only mode.
  return store.data.library.filter(entry => entry.kind === 'html' && !/\.swf(?:[?#]|$)/i.test(entry.path || entry.url || ''));
}

async function openHostedLibrary() {
  const privateMode = !!activeTab()?.private;
  let page = libraryPanels.get(privateMode);
  if (!page) {
    page = { id: crypto.randomUUID(), specialPage: 'library', galleryFrame:true, private: privateMode, kind: 'web', url: libraryPageURL, title: 'Flash Gallery', loading: false, error: null, view: null };
    libraryPanels.set(privateMode, page);
  }
  panel = 'library'; panelSection = null; focusArea = 'content'; focusIntentAt = Date.now();
  layout(); sendState(true);
  focusChrome();
}
function libraryPageState() {
  let imageBytes = 0;
  const items = flashPages().map(entry => {
    const item = Object.fromEntries(['id','title','url','path','year','createdBy','description','color'].filter(key => entry[key] !== undefined).map(key => [key, entry[key]]));
    if (/^[a-f\d-]{36}\.png$/i.test(entry.image || '')) {
      try {
        const file = containedPath(store.libraryFolder.images, entry.image), bytes = fs.readFileSync(file);
        if (imageBytes + bytes.length < 12 * 1024 * 1024) { item.imageData = 'data:image/png;base64,' + bytes.toString('base64'); imageBytes += bytes.length; }
      } catch { /* An unavailable thumbnail retains its original placeholder. */ }
    }
    return item;
  });
  return { items, heading: store.libraryFolder.heading, theme: store.data.settings.theme, highContrast: !!store.data.settings.highContrast };
}
function publishLibraryPages() {
  if (!store) return;
  const key = JSON.stringify([store.data.library, store.libraryFolder.heading, store.data.settings.theme, !!store.data.settings.highContrast]);
  if (key === libraryPageKey) return;
  libraryPageKey = key;
  const pages = allContents().filter(tab => isLibraryPage(tab.url, libraryPageURL));
  if (!pages.length) return;
  const state = libraryPageState();
  for (const tab of pages) {
    if(tab.galleryFrame)win.webContents.send('browser:gallery-state',state);
    else if (tab.native) tab.native.call('library-response', { ok: true, state }).catch(() => {});
    else if (live(tab)) tab.view.webContents.send('browser:library-page-state', state);
  }
}
async function handleLibraryPage(tab, request) {
  if (!isLibraryPage(tab?.url, libraryPageURL) || !request || typeof request.id !== 'string' || request.id.length > 80 || !['state','open','update','add','browse','remove','image','heading','reorder'].includes(request.action)) throw new Error('Unsupported Flash Gallery request.');
  const args = request.args || {};
  if (typeof args !== 'object' || Array.isArray(args) || JSON.stringify(args).length > 24000) throw new Error('Invalid library edit.');
  if (request.action !== 'state' && tab !== activeContent()) throw new Error('Switch to the Flash Gallery to edit it.');
  if (!store.data.libraryPageOnboarded) {
    if (!flashPages().length) for (const item of libraryDefaults.items) store.data.library.push({ ...item, id: crypto.randomUUID(), kind: 'html', addedAt: new Date().toISOString(), titleEdited: true });
    if (store.libraryFolder.heading.subtitle === 'Flash design portfolio') store.libraryFolder.heading.subtitle = libraryDefaults.introduction;
    store.data.libraryPageOnboarded = true; store.save();
  }
  const entry = flashPages().find(item => item.id === args.id);
  switch (request.action) {
    case 'state': break;
    case 'open': if (!entry) throw new Error('Library page not found.'); await command('play-library', { id: entry.id }); break;
    case 'add': {
      if (!isWebURL(args.source)) throw new Error('Enter an HTTP or HTTPS address, or use Browse to select a local HTML file.');
      await addLibrarySource(args.source, 'html');
      const item = flashPages().find(item => item.url === new URL(args.source).href);
      await command('library-update', { ...args, id: item.id }); break;
    }
    case 'browse': await command('browse-library-source', { kind: 'html' }); break;
    case 'update':
      if (!entry) throw new Error('Library page not found.');
      if (args.source !== (entry.path || entry.url) && !isWebURL(args.source)) throw new Error('Use Browse to choose a different local HTML file.');
      await command('library-update', { ...args, id: entry.id }); break;
    case 'remove': if (!entry) throw new Error('Library page not found.'); await command('remove-library', { id: entry.id }); break;
    case 'image': if (!entry) throw new Error('Library page not found.'); await command('library-image', { id: entry.id }); break;
    case 'heading': await command('library-heading', { title: store.libraryFolder.heading.title, subtitle: String(args.subtitle || '').slice(0, 600) }); break;
    case 'reorder': await command('reorder', { collection: 'library', id: args.id, targetId: args.targetId, position: args.position }); break;
  }
  return libraryPageState();
}
function isDocumentURL(value) {
  try { const url = new URL(value); return url.protocol === 'flashborn:' && url.hostname === 'document' && documents.has(url.pathname.split('/')[1]); } catch { return false; }
}
async function openDocument(absolute, existing) {
  const stats = await fsp.stat(absolute);
  if (!stats.isFile()) throw new Error('Choose a file to open.');
  const pdf = path.extname(absolute).toLowerCase() === '.pdf';
  if (pdf) {
    if (stats.size > MAX_PDF_SIZE) throw new Error('Choose a PDF file smaller than 256 MB.');
    const handle = await fsp.open(absolute, 'r'), header = Buffer.alloc(1024);
    try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
    if (!header.includes(Buffer.from('%PDF-'))) throw new Error('This file does not contain a valid PDF header.');
  }
  const t = existing || createTab();
  if (!t) return;
  t.hasFlash = false;
  if (t.native) { t.native.dispose(); t.native = null; }
  const token = crypto.randomUUID();
  const real = await fsp.realpath(absolute);
  documents.set(token, { path: real, root: path.dirname(real), assets: /\.html?$/i.test(real), tabId: t.id });
  t.kind = pdf ? 'pdf' : 'local'; t.localPath = real; t.title = path.basename(absolute); t.url = pathToFileURL(absolute).href; t.loading = true; t.error = null;
  initializeQuality(t, store.data.flashQualities);
  if (t.id === activeId) panel = null;
  ensureView(t); layout(); sendState(true);
  await t.view.webContents.loadURL(`flashborn://document/${token}/${encodeURIComponent(t.title)}`);
}
async function librarySource(value) {
  const input = String(value || '').trim().replace(/^"(.*)"$/, '$1'), target = resolveInput(input);
  if (!String(value || '').trim() || target.type === 'home') throw new Error('Enter a web URL or a local file path.');
  if (target.type === 'web' && target.url === 'https://duckduckgo.com/?q=' + encodeURIComponent(input)) throw new Error('Enter a web URL or an absolute local file path.');
  if (target.type === 'flash') throw new Error('Open the HTML page containing this Flash movie. Standalone SWF playback has been removed.');
  if (target.type === 'file' && !/\.html?$/i.test(target.path)) throw new Error('Choose an HTML or HTM file for an HTML Flash page.');
  if (target.type === 'file') { const stat = await fsp.stat(target.path); if (!stat.isFile()) throw new Error('Choose an HTML file.'); }
  const local = target.type === 'file' ? await fsp.realpath(target.path) : null;
  const url = local ? null : target.url;
  let title = local ? path.basename(local, path.extname(local)) : new URL(url).hostname;
  if (local) {
    const handle = await fsp.open(local, 'r');
    try { const buffer = Buffer.alloc(512 * 1024); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0); title = pageTitle(buffer.subarray(0, bytesRead).toString('utf8')) || title; } finally { await handle.close(); }
  }
  return { local, url, title };
}
async function discoverLibraryTitle(entry) {
  if (!entry?.url || entry.titleEdited) return;
  const source = entry.url;
  try {
    const response = await net.fetch(source, { credentials: 'omit', signal: AbortSignal.timeout(6000) });
    if (!response.ok || !/html/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); return; }
    const reader = response.body.getReader(), chunks = []; let length = 0, title = '';
    try {
      while (length < 512 * 1024) {
        const { done, value } = await reader.read(); if (done) break;
        const chunk = Buffer.from(value).subarray(0, 512 * 1024 - length); chunks.push(chunk); length += chunk.length;
        title = pageTitle(Buffer.concat(chunks).toString('utf8')); if (title) break;
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (!closing && title && store.data.library.includes(entry) && !entry.titleEdited && entry.url === source) { entry.title = title; store.save(); sendState(true); }
  } catch { /* The page can still be added offline and its title edited. */ }
}
function captureLibraryTitle(t, title) {
  if (!t.libraryTitlePending || t.private || !title) return;
  const entry = store.data.library.find(item => item.id === t.libraryId);
  if (!entry || entry.titleEdited) { t.libraryTitlePending = false; return; }
  const cleaned = String(title).replace(/\s+/g, ' ').trim().slice(0, 300);
  if (cleaned && cleaned !== 'Corners Native Flash') { entry.title = cleaned; t.libraryTitlePending = false; store.save(); }
}
async function addLibrarySource(value, kind, { play = false } = {}) {
  if (kind !== 'html') throw new Error('Choose a Flash website or an HTML file.');
  const { local, url, title } = await librarySource(value);
  let entry = store.data.library.find(item => local ? item.path === local : item.url === url && item.kind === 'html');
  if (!entry) { entry = { id: crypto.randomUUID(), kind, ...(local ? { path: local } : { url }), title, color: placeholderColor(), addedAt: new Date().toISOString() }; store.data.library.unshift(entry); store.save(); }
  discoverLibraryTitle(entry);
  if (!play) { sendState(true); return; }
  const t = createTab();
  if (!t) return;
  if (!t.private) { entry.lastPlayedAt = new Date().toISOString(); t.libraryId = entry.id; t.libraryTitlePending = !entry.titleEdited; store.save(); }
  if (!local) { await activateNative(t, url); return; }
  await activateNativeLocal(t, local, entry.title);
}
async function activateNativeLocal(t, filename, title) {
  if (t.nativeNavigation) return t.nativeNavigation;
  t.nativeNavigation = loadNativeLocal(t, filename, title);
  try { await t.nativeNavigation; }
  finally { t.nativeNavigation = null; }
}
async function loadNativeLocal(t, filename, title) {
  const local = await fsp.realpath(filename);
  if (!/\.html?$/i.test(local) || !(await fsp.stat(local)).isFile()) throw new Error('Choose an HTML Flash page.');
  t.kind = 'local'; t.localPath = local; t.url = pathToFileURL(local).href; t.title = title || t.title || path.basename(local); t.loading = true; t.error = null;
  await ensureNative(t);
  if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
  if (t.id === activeId) panel = null;
  layout(); sendState(true);
  await t.native.call('local-html', { path: local, token: crypto.randomUUID() });
  persistTabs();
}
async function ensureNative(t) {
  initializeQuality(t, store.data.flashQualities);
  if (t.native && (t.native.stopped || t.native.child && (t.native.child.exitCode !== null || t.native.child.signalCode !== null))) { t.native.dispose(); t.native = null; }
  if (t.native) { await t.native.ready; return; }
  if (!nativeAvailable()) throw new Error('Native Flash files are missing. Reinstall Corners.');
  const native = t.native = new NativeFlash(win, t.id, message => {
    if (t.native !== native || !ownsContent(t) || closing) return;
    if (message.type === 'ready') layout();
    else if (message.type === 'presented' || message.type === 'surface') updateFlashWindowRegion();
    else if (message.type === 'activated' && t === activeContent()) native.raiseHostBehindFlash();
    else if (message.type === 'input-pointer' && Number.isFinite(message.at) && message.at >= focusIntentAt && t === activeContent()) {
      focusIntentAt = message.at; focusArea = 'content'; native.contentPointer(); closeBrowserMenu(); closeSuggestions();
      win.webContents.send('browser:blur-fields');
    }
    else if (message.type === 'state') {
      if (!isWebURL(message.state.url) && !message.state.url?.startsWith('flashnative:')) return;
      const started = !!message.state.loading && !t.loading, finished = !message.state.loading && t.loading;
      t.loading = !!message.state.loading;
      if (typeof message.state.hasFlash === 'boolean') t.hasFlash = message.state.hasFlash;
      if (started) t.nativeHistoryURL = null;
      if (t.kind === 'web' && isWebURL(message.state.url)) {
        t.url = message.state.url; t.title = message.state.title || new URL(t.url).hostname;
        const previousQualityPage = t.flashQualityKey;
        initializeQuality(t, store.data.flashQualities);
        if (previousQualityPage !== t.flashQualityKey) native.call('quality', { quality: t.flashQuality || store.data.settings.flashQuality, initial: !t.flashQuality }).catch(() => {});
      }
      if (!t.loading) captureLibraryTitle(t, message.state.title);
      if (!t.specialPage && !t.private && !t.loading && t.kind === 'web' && isWebURL(t.url) && t.nativeHistoryURL !== t.url) {
        t.nativeHistoryURL = t.url;
        store.data.history = [{ id: crypto.randomUUID(), url: t.url, title: t.title, visitedAt: new Date().toISOString() }, ...store.data.history.filter(h => h.url !== t.url)].slice(0, 500);
        persistTabs();
      }
      sendState(started);
      if (finished) requestTabSnapshot(t).catch(() => {});
    } else if (message.type === 'library-page') {
      if (!isLibraryPage(t.url, libraryPageURL)) return;
      handleLibraryPage(t, message.request).then(state => native.call('library-response', { id: message.request.id, ok: true, state })).catch(error => native.call('library-response', { id: message.request?.id, ok: false, error: error.message }).catch(() => {}));
    } else if (message.type === 'new-tab') { const created = createTab('', false, t.private, t.id); if (created) activateNative(created, message.url).catch(e => showError(created, e.message)); }
    else if (message.type === 'open-pdf' && isWebURL(message.url)) { navigate(t, message.url).catch(e => showError(t, e.message)); }
    else if (message.type === 'open-swf' && isWebURL(message.url)) { openStandalone(message.url, t).catch(e => showError(t, e.message)); }
    else if (message.type === 'zoom-wheel') wheelZoom(t, message.direction === 'in' ? 1 : -1, message.source || 'browser');
    else if (message.type === 'drop-files') openDroppedFiles(message.paths).catch(e => win?.webContents.send('browser:notice', e.message));
    else if (message.type === 'download' && isWebURL(message.url)) { ensureView(t); t.view.webContents.downloadURL(message.url); }
    else if (message.type === 'key') handleKeys({ preventDefault() {} }, message.input);
    else if (message.type === 'fullscreen' && t === activeContent()) setFullscreen(message.value);
    else if (message.type === 'find') win.webContents.send('browser:find', message.result);
    else if (message.type === 'unresponsive') t.recreateNative = true;
    else if (message.type === 'responsive' && !t.error) t.recreateNative = false;
    else if (message.type === 'error') { if (message.recreate) t.recreateNative = true; showError(t, message.message); }
  }, { private: !!t.private, libraryURL: libraryPageURL });
  layout();
  await t.native.ready;
  if (closing || !ownsContent(t) || t.native !== native) { native.dispose(); throw new Error('Flash page was closed.'); }
  await t.native.call('quality', { quality: t.flashQuality || store.data.settings.flashQuality, initial: !t.flashQuality });
  await t.native.call('scrollbar-theme',{light:store.data.settings.theme==='light'});
  layout();
}
async function activateNative(t, url) {
  if (t.nativeNavigation) return t.nativeNavigation;
  t.nativeNavigation = loadNativePage(t, url);
  try { await t.nativeNavigation; }
  finally { t.nativeNavigation = null; }
}
async function loadNativePage(t, url) {
  if (/\.swf$/i.test(new URL(url).pathname)) { await openStandalone(url, t); return; }
  if (isPDFURL(url)) { await navigate(t, url); return; }
  t.kind = 'web'; t.url = url; t.title = new URL(url).hostname; t.error = null; t.loading = true;
  await ensureNative(t);
  if (live(t)) { win.contentView.removeChildView(t.view); t.view.webContents.close(); t.view = null; }
  layout(); sendState(true);
  await t.native.call('navigate', { url });
  if (t === activeContent() && focusArea === 'content') t.native.focus();
}
async function duplicateTab(id) {
  const source = tabs.find(tab => tab.id === id);
  if (!source) return;
  const copy = createTab('', false, source.private);
  if (!copy) return;
  copy.forceModern = source.forceModern;
  copy.flashQuality = source.flashQuality;
  if (source.restoreEntry) { copy.restoreEntry = { ...source.restoreEntry }; await resumeTab(copy); }
  else if (source.kind === 'flash') await openStandalone(source.localPath || source.url, copy);
  else if (source.kind === 'local' && source.native) await activateNativeLocal(copy, source.localPath, source.title);
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
    callback: () => { retainClosingMenu(menu); if (tabMenu === menu) tabMenu = null; } });
}
function reload(t = activeContent()) {
  if(panel&&panel!=='library'){win.webContents.send('browser:special-reload');sendState(true);return;}
  if (!t) return;
  if(t.galleryFrame){win.webContents.send('browser:gallery-reload',t.id);return;}
  if(t.kind==='home'){win.webContents.send('browser:special-reload');sendState(true);return;}
  if (t.restoring || t.nativeNavigation) return t.restoring || t.nativeNavigation;
  if (t.restoreEntry) { t.error = null; return resumeTab(t).catch(e => showError(t, e.message)); }
  if (t.native) {
    // Reload must work even when the legacy UI thread cannot process IPC.
    // Recreate the complete tab runtime, retaining URL, zoom and mute state.
    if (t === activeContent() && win.isVisible() && !win.isMinimized()) win.focus();
    const entry = sessionEntry({ ...t, private: false }); t.native.dispose(true); t.native = null; t.recreateNative = false;
    t.restoreEntry = entry; t.error = null; return resumeTab(t).catch(e => showError(t, e.message));
  }
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
      return new Response(await fsp.readFile(containedPath(store.libraryFolder.images, entry.image)), { headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' } });
    }
    const filename = url.pathname==='/scrollbars.css'?path.join(__dirname,'legacy','page-scrollbars.css'):containedPath(path.join(__dirname, 'ui'), decodeURIComponent(url.pathname.slice(1) || 'index.html'));
    return new Response(await fsp.readFile(filename), { headers: {
      'Content-Type': mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src "+new URL(libraryPageURL).origin+new URL(libraryPageURL).pathname
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
  if (!t || t !== activeContent()) return;
  const last = t.lastWheel, now = Date.now();
  if (last && last.source !== source && last.direction === direction && now - last.time < 60) return;
  t.lastWheel = { source, direction, time: now };
  zoom(direction).catch(e => win?.webContents.send('browser:notice', e.message));
}
async function setLibraryImage(id, file) {
  const entry = store.data.library.find(item => item.id === id);
  if (!entry) throw new Error('This Flash gallery item is no longer available.');
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Choose an image file.');
  const stat = await fsp.stat(file);
  if (!stat.isFile() || stat.size > 30 * 1024 * 1024) throw new Error('Choose an image smaller than 30 MB.');
  let image = nativeImage.createFromBuffer(await fsp.readFile(file));
  if (image.isEmpty()) throw new Error('This image format could not be read. Choose PNG, JPEG, WebP or BMP.');
  const size = image.getSize(), scale = Math.min(1, 640 / Math.max(size.width, size.height));
  image = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' });
  const directory = store.libraryFolder.images, name = crypto.randomUUID() + '.png', previous = entry.image;
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
  if (/^[\da-f-]{36}\.png$/.test(image || '')) await fsp.unlink(containedPath(store.libraryFolder.images, image)).catch(() => {});
}
function setFullscreen(value) {
  focusArea = 'content'; focusIntentAt = Date.now();
  win.webContents.send('browser:blur-fields');
  const changed=borderlessFullscreen!==!!value;
  borderlessFullscreen=!!value;
  if(changed)win.setFullScreen(!!value);
  // Exiting the host must also leave a website/plugin's HTML fullscreen state.
  for (const tab of allContents()) if (tab.native) tab.native.call('host-fullscreen', { value: !!value && tab === activeContent() }).then(layout).catch(() => {});
  if (!value) for (const tab of allContents()) if (live(tab)) tab.view.webContents.executeJavaScript('if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});').catch(() => {});
  layout(); sendState(true);
}
function closeSuggestions() {
  suggestionSerial++;
  predictionAbort?.abort(); predictionAbort = null;
  const popup = suggestionWindow; suggestionWindow = null; suggestionData = null;
  if (popup && !popup.isDestroyed()) popup.close();
}
async function showSuggestions(args) {
  predictionAbort?.abort(); predictionAbort = null;
  const serial = ++suggestionSerial;
  const privateMode = !!activeTab()?.private;
  const field = ['address', 'home-input', 'library-open-address'].includes(args.field) ? args.field : 'address';
  const entries = [...store.data.bookmarks, ...(privateMode ? [] : store.data.history), ...tabs.filter(tab => !!tab.private === privateMode), ...(field === 'library-open-address' ? flashPages() : [])];
  const items = suggestions(args.query, entries, store.data.settings.searchEngine, [], { allowSearch: field !== 'library-open-address', library: flashPages() });
  if (!items.length || typeof args.query !== 'string' || !args.bounds) { closeSuggestions(); return; }
  suggestionData = { query: args.query, items, selected: -1, field, serial, tabId: activeId, bounds: args.bounds, libraryKind: 'html' };
  const engine = store.data.settings.searchEngine;
  if (field !== 'library-open-address' && canPredict(args.query)) {
    const controller = predictionAbort = new AbortController();
    // Keep known pages responsive while conventional provider predictions arrive.
    searchPredictions.get(args.query, engine, { signal: controller.signal, privateMode }).then(async terms => {
      if (controller.signal.aborted || serial !== suggestionSerial || suggestionData?.serial !== serial || suggestionData.tabId !== activeId || store.data.settings.searchEngine !== engine) return;
      const selected = suggestionData.items[suggestionData.selected];
      suggestionData.items = suggestions(args.query, entries, engine, terms);
      suggestionData.selected = selected ? suggestionData.items.findIndex(item => item.type === selected.type && item.url === selected.url) : -1;
      await positionSuggestions(); sendState(true);
    }).catch(() => { /* Offline or unavailable providers leave local results usable. */ });
  }
  await positionSuggestions();
}
async function positionSuggestions() {
  if (!suggestionData || !win || win.isDestroyed()) return;
  const { items, bounds: rect } = suggestionData;
  const bounds = win.getContentBounds(), work = screen.getDisplayMatching(bounds).workArea;
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) throw new Error('Invalid address field bounds.');
  const width = Math.min(work.width, Math.max(250, Math.min(bounds.width, Math.round(rect.width))));
  const height = items.reduce((sum, item) => sum + (item.type === 'search' ? 38 : 48), 0) + 12;
  const x = Math.max(work.x, Math.min(work.x + work.width - width, bounds.x + Math.round(rect.x)));
  const y = Math.max(work.y, Math.min(work.y + work.height - height, bounds.y + Math.round(rect.y + rect.height) + 5));
  if (!suggestionWindow || suggestionWindow.isDestroyed()) {
    const popup = suggestionWindow = new BrowserWindow({ x, y, width, height, frame: false, show: false, skipTaskbar: true,
      resizable: false, minimizable: false, maximizable: false, focusable: false, alwaysOnTop: true,
      backgroundColor: appearanceBackground(true),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    popup.setAlwaysOnTop(true, 'pop-up-menu'); popup.setMenu(null);
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); popup.webContents.on('will-navigate', event => event.preventDefault());
    popup.on('closed', () => { if (suggestionWindow === popup) { suggestionWindow = null; suggestionData = null; } });
    try { await popup.loadURL(SUGGEST_URL); } catch (error) { if (popup.isDestroyed() || suggestionWindow !== popup) return; throw error; }
    if (suggestionWindow === popup && !popup.isDestroyed()) popup.showInactive();
  } else suggestionWindow.setBounds({ x, y, width, height });
}

function configureSession(targetSession = browsingSession, privateMode = false) {
  const ua = targetSession.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\sFlashborn\/\S+/, '');
  targetSession.setUserAgent(ua);
  const permissions = new SitePermissions({
    saved: privateMode ? [] : store.data.sitePermissions,
    save: entries => { if (!privateMode) { store.data.sitePermissions = entries; store.save(); } },
    canPrompt: wc => !windowMoving && !!win && !win.isDestroyed() && win.isFocused() && !win.isMinimized() && !panel && activeTab()?.view?.webContents === wc,
    prompt: async (origin, name) => (await dialog.showMessageBox(win, { type:'question', title:'Site permission', message:`${origin} wants access to ${name}.`, buttons:['Block','Allow'], defaultId:0, cancelId:0 })).response === 1
  });
  permissions.install(targetSession); sitePermissions.set(targetSession, permissions);
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith('file:')) { callback({cancel:true}); return; }
    if (privateMode || !extensions?.filtering.hosts.size || details.webContentsId === undefined || details.webContentsId < 0) { callback({}); return; }
    // Never hold a network request indefinitely for an extension process.
    let settled = false;
    const finish = result => { if (!settled) { settled = true; clearTimeout(timer); callback(result); } };
    const timer = setTimeout(() => finish({}), 1500);
    const tab = tabs.find(tab => live(tab) && tab.view.webContents.id === details.webContentsId);
    extensions.filtering.beforeRequest({...details, pageURL:tab?.url}).then(finish, () => finish({}));
  });
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const header = Object.entries(details.responseHeaders || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.[0] || '';
    if (details.resourceType === 'mainFrame' && /application\/(x-shockwave-flash|futuresplash|vnd.adobe.flash.movie)/i.test(header)) {
      const t = tabs.find(t => live(t) && t.view.webContents.id === details.webContentsId);
      if (t && t.kind === 'web') {
        callback({ cancel: true });
        openStandalone(details.url, t).catch(e => showError(t, e.message));
        return;
      }
    }
    callback({ responseHeaders: details.responseHeaders });
  });
  targetSession.on('will-download', (_event, item, contents) => {
    const sourceTab=tabs.find(tab=>live(tab) && tab.view.webContents===contents);
    const entry = { id: crypto.randomUUID(), tabId:sourceTab?.id, filename: item.getFilename(), url: item.getURL(), path: '', total: item.getTotalBytes(), received: 0, state: 'progressing', startedAt: new Date().toISOString() };
    const downloads = privateMode ? privateDownloads : store.data.downloads;
    downloads.unshift(entry); downloads.splice(100);
    downloadItems.set(entry.id, item);
    item.setSaveDialogOptions({ title: 'Save download', defaultPath: path.join(fileDialogDirectory(app.getPath('downloads')), entry.filename) });
    item.on('updated', (_event, state) => { entry.state = state; entry.path = item.getSavePath(); entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); rememberFileDialogLocation(entry.path); sendState(); });
    item.once('done', (_event, state) => {
      entry.state = state; entry.path = item.getSavePath(); entry.received = item.getReceivedBytes();
      entry.isNew = state === 'completed' && !(panel === 'downloads' && !!activeTab()?.private === privateMode);
      rememberFileDialogLocation(entry.path);
      downloadItems.delete(entry.id); if (!privateMode) store.save(); sendState(true);
    });
    sendState(true);
  });
}

function handleKeys(event, input) {
  if (input.type !== 'keyDown') return;
  const key = input.key.toLowerCase();
  const mod = input.control || input.meta;
  if (menuOpen && menuWindow && !mod && !input.alt && ['escape', 'arrowdown', 'arrowup', 'enter', ' ', 'tab'].includes(key)) {
    event.preventDefault(); menuWindow.webContents.send('browser:menu-key', { key: input.key, shift: !!input.shift }); return;
  }
  let handled = true;
  const t = activeTab(); const wc = live(t) ? t.view.webContents : null;
  if (mod && key === 'l') { focusChrome(); win.webContents.send('browser:focus-address'); }
  else if (mod && key === 'n' && input.shift) createTab('', false, true);
  else if (mod && key === 't' && input.shift) {
    const entry=!t?.private && closedTabs.pop();
    if(entry){const restored=createTab('',true,false);if(restored){Object.assign(restored,{kind:entry.kind,title:entry.title,url:entry.url,localPath:entry.path,restoreEntry:entry.kind==='home'?null:entry});selectTab(restored.id);}else closedTabs.push(entry);}
  }
  else if (mod && key === 't') createTab();
  else if (mod && key === 'w') { if (panel) selectTab(activeId); else closeTab(activeId); }
  else if (mod && key === 'o') command('open-file');
  else if (mod && key === 'r' || key === 'f5') reload();
  else if (mod && key === 'f') { if (panel !== 'library') panel = null; layout(); sendState(true); focusChrome(); win.webContents.send('browser:find', { open: true }); }
  else if (mod && key === 'd') command('bookmark');
  else if (mod && key === 'h') command('panel', { name: 'history' });
  else if (mod && key === 'j') command('panel', { name: 'downloads' });
  else if (mod && key === 'p') command('print');
  else if (mod && ['+', '=', '-', '0'].includes(key)) zoom(key === '0' ? 0 : key === '-' ? -1 : 1);
  else if (mod && key === 'tab') { const index = tabs.findIndex(t => t.id === activeId); selectTab(tabs[(index + (input.shift ? tabs.length - 1 : 1)) % tabs.length].id); }
  else if (mod && /^[1-9]$/.test(key)) selectTab((key === '9' ? tabs.at(-1) : tabs[Number(key) - 1])?.id);
  else if (input.alt && key === 'arrowleft') command('back');
  else if (input.alt && key === 'arrowright') command('forward');
  else if (key === 'f11') setFullscreen(!isFullscreen());
  else if (key === 'f12') wc?.toggleDevTools();
  else if (key === 'escape' && isFullscreen()) setFullscreen(false);
  else handled = false;
  if (handled) { closeBrowserMenu(); event.preventDefault(); }
}
function zoom(direction, popup = true) {
  const t = activeContent();
  const task = zoomQueue.then(async () => {
    if (!t || !ownsContent(t)) return;
    if (t.native) await t.native.call('zoom', { direction });
    else if (live(t)) { const wc = t.view.webContents; wc.setZoomFactor(nextZoom(wc.getZoomFactor() * 100, direction) / 100); }
    else return;
    sendState(true);
    if (popup && t === activeContent()) await showZoomPopup();
  });
  zoomQueue = task.catch(() => {});
  return task;
}
function focusChrome(at = Date.now()) {
  if (at < focusIntentAt) return;
  focusIntentAt = at;
  focusArea = 'chrome';
  if (!win || win.isDestroyed()) return;
  if (windowMoving) return;
  windowActivation?.arm();
  if (activeContent()?.native) activeContent().native.focusHost();
  else win.webContents.focus();
}
function restoreContentFocus() {
  clearTimeout(contentFocusTimer);
  contentFocusTimer = setTimeout(() => {
    const t = activeContent();
    if (!closing && !windowMoving && !windowCorner?.drag && !topLeftCorner?.drag && focusArea === 'content' && !t?.error && !menuWindow && !suggestionWindow) t?.native?.focus();
  }, 120);
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
      y: Math.max(work.y, Math.min(work.y + work.height - height, bounds.y + 96)), frame: false, show: false, skipTaskbar: true,
      resizable: false, minimizable: false, maximizable: false, alwaysOnTop: true, focusable: false,
      backgroundColor: appearanceBackground(true),
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
  menu.popup({ window: win, callback: () => { retainClosingMenu(menu); if (editMenu === menu) editMenu = null; } });
}

function closeBrowserMenu(restoreFocus = false, immediate = false) {
  const popup = menuWindow;
  if (!popup && !menuOpen) return;
  menuRequest++;
  menuOpen = false;
  const finish = () => {
    if (menuWindow === popup) { menuMotion?.dispose(); menuMotion = null; menuWindow = null; }
    if (popup && !popup.isDestroyed()) {
      parkBrowserMenu(popup);
      popup.webContents.executeJavaScript('window.resetMenu()').catch(()=>{});
    }
  };
  if (popup && !popup.isDestroyed()) popup.setIgnoreMouseEvents(true);
  if (menuMotion && !immediate) { if (menuMotion.target !== 0) menuMotion.animate(0, finish); }
  else finish();
  if (restoreFocus && win && !win.isDestroyed()) win.focus();
  sendState(true);
}
function parkBrowserMenu(popup) {
  const displays=screen.getAllDisplays(),bounds=popup.getBounds();
  popup.setIgnoreMouseEvents(true);
  popup.setPosition(Math.floor(Math.min(...displays.map(display=>display.bounds.x)))-bounds.width-200,
    Math.floor(Math.min(...displays.map(display=>display.bounds.y)))-bounds.height-200,false);
}
function prepareBrowserMenu() {
  if (menuPopup && !menuPopup.isDestroyed()) return menuReady;
  const origin=win.getContentBounds();
  const popup=menuPopup=new BrowserWindow({ parent:win,x:origin.x,y:origin.y,width:320,height:700,frame:false,thickFrame:false,roundedCorners:false,hasShadow:false,show:false,
    skipTaskbar:true,resizable:false,minimizable:false,maximizable:false,focusable:false,
    transparent:true,backgroundColor:'#00000000',
    webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,spellcheck:false,backgroundThrottling:false} });
  // An owned, non-topmost popup stays with Corners's place in the app stack.
  // Showing it once while parked finishes Windows' visibility transition before
  // any menu slide; other applications can cover the entire browser normally.
  popup.setMenu(null);
  popup.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  popup.webContents.on('will-navigate',event=>event.preventDefault());
  popup.on('closed',()=>{
    if(menuPopup===popup){menuPopup=null;menuReady=null;}
    if(menuWindow===popup){menuMotion?.dispose();menuMotion=null;menuWindow=null;menuOpen=false;sendState(true);}
  });
  parkBrowserMenu(popup);popup.showInactive();const shown=performance.now();
  menuReady=popup.loadURL(MENU_URL).then(async()=>{
    const remaining=220-(performance.now()-shown);
    if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
    return popup;
  }).catch(error=>{if(!popup.isDestroyed())popup.destroy();throw error;});
  return menuReady;
}
async function showBrowserMenu(args = {}) {
  closeZoomPopup();
  closeSuggestions();
  if (menuWindow && !menuWindow.isDestroyed()) {
    if (menuOpen) closeBrowserMenu(true);
    else if (menuMotion) { menuOpen=true; menuWindow.setIgnoreMouseEvents(false); menuMotion.animate(1); sendState(true); }
    return;
  }
  if(menuOpen){closeBrowserMenu(true);return;}
  const request=++menuRequest;
  menuOpen=true;sendState(true);
  const bounds = win.getContentBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  const width=320, top=chromeContentTop();
  const x=bounds.x+windowFrame(win).x+windowFrame(win).width-FRAME-width, y=bounds.y+top;
  const available=Math.max(1,Math.min(bounds.height-FRAME-top,work.y+work.height-y)-2);
  const height=Math.min(700,available);
  const popup=await prepareBrowserMenu().catch(error=>{if(request===menuRequest){menuOpen=false;sendState(true);}throw error;});
  if(closing || popup.isDestroyed() || !menuOpen || request!==menuRequest)return;
  menuWindow=popup;
  await popup.webContents.executeJavaScript('window.resetMenu();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  if(menuWindow!==popup || !menuOpen || request!==menuRequest)return;
  // Move an already-clear texture to the host display before fitting it. This
  // lets Windows settle the popup's DPI without exposing old menu pixels.
  popup.setBounds({x,y,width,height});
  menuOpen = true; sendState(true);
  if (menuWindow === popup && !popup.isDestroyed()) {
    const needed = await popup.webContents.executeJavaScript(`(() => { const nav = document.querySelector('.browser-menu'), css = getComputedStyle(nav); return Math.ceil([...nav.children].reduce((height, child) => { const c = getComputedStyle(child); return height + child.getBoundingClientRect().height + parseFloat(c.marginTop || 0) + parseFloat(c.marginBottom || 0); }, parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)) + 2); })()`);
    const fitted = Math.min(available, Math.max(360, needed));
    popup.setBounds({x,y,width,height:fitted});
    // Finish resizing the transparent texture while it is still parked. Moving
    // an old-sized DWM texture onscreen can expose a stale strip below the menu.
    await popup.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  }
  if (menuWindow === popup && !popup.isDestroyed()) {
    // A mouse menu is an overlay, not another activation target. Keeping the
    // browser focused removes the native blur-before-second-click race.
    menuMotion = new MenuMotion(win,popup,{top,reduced:systemPreferences.getAnimationSettings().prefersReducedMotion});
    popup.setIgnoreMouseEvents(false);
    menuMotion.animate(1);
    if (args.keyboard) popup.webContents.send('browser:menu-key', { key: 'ArrowDown' });
    activeContent()?.native?.syncWindow();
    sendState(true);
  }
}
async function showExtensionPage(key, kind) {
  const url = extensions.page(key, kind), identity = key + ':' + kind;
  const previous = extensionWindows.get(identity);
  if (previous && !previous.isDestroyed()) { previous.show(); previous.focus(); return; }
  const popup = new BrowserWindow({ parent: win, width: kind === 'popup' ? 400 : 1040, height: kind === 'popup' ? 710 : 800, minWidth: 330, minHeight: 350,
    title: extensions.state().find(item => item.key === key)?.name || 'Extension', autoHideMenuBar: true, backgroundColor: '#ffffff', show: false,
    webPreferences: { session: browsingSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  extensionWindows.set(identity, popup); popup.setMenu(null);
  popup.on('closed', () => extensionWindows.delete(identity));
  popup.webContents.setWindowOpenHandler(({ url }) => { if (isWebURL(url)) createTab(url, false, false); return { action: 'deny' }; });
  popup.webContents.on('will-navigate', (event, nextURL) => { const destination = event.url || nextURL, origin = 'chrome-extension://' + new URL(url).hostname + '/'; if (!destination.startsWith(origin)) { event.preventDefault(); if (isWebURL(destination)) createTab(destination, false, false); } });
  try { await popup.loadURL(url); popup.show(); }
  catch (error) { popup.close(); throw error; }
}

async function command(action, args = {}) {
  const t = activeContent() || activeTab(); const wc = live(t) ? t.view.webContents : null;
  switch (action) {
    case 'state': return getState();
    case 'summary-height': {
      if (t?.id !== args.id || summaryFor(t)?.url !== args.url || !Number.isFinite(args.height)) break;
      const height = Math.max(0, Math.min(Math.max(120, win.getContentSize()[1] - 300), Math.ceil(args.height)));
      if (t.summaryHeight !== height) { t.summaryHeight = height; layout(); }
      break;
    }
    case 'summary-dismiss': if (summaryFor(t)) { t.summaryDismissedURL = t.url; clearSummary(t); } break;
    case 'tab-memory': {
      const tab = tabs.find(item => item.id === args.id);
      if (!tab) throw new Error('This tab is closed.');
      if (tab.native) return { tabMemory: { id: tab.id, ...(await tab.native.call('memory')), shared: false } };
      const contents = tab.kind === 'home' ? win.webContents : live(tab) ? tab.view.webContents : null;
      const pid = contents?.getOSProcessId();
      const metric = pid && app.getAppMetrics().find(item => item.pid === pid);
      const kb = metric?.memory?.privateBytes ?? metric?.memory?.workingSetSize;
      const shared = tab.kind === 'home' || tabs.some(other => other.id !== tab.id && !other.native && live(other) && other.view.webContents.getOSProcessId() === pid);
      return { tabMemory: { id: tab.id, megabytes: !contents ? 0 : Number.isFinite(kb) && kb > 0 ? Math.max(1, Math.round(kb / 1024)) : null, shared } };
    }
    case 'tab-snapshot': {
      const tab = tabs.find(item => item.id === args.id);
      if (tab) requestTabSnapshot(tab).catch(() => {});
      return {};
    }
    case 'collection-thumbnails': {
      const urls = Array.isArray(args.urls) ? args.urls.slice(0, 1000) : [];
      return { thumbnails: urls.filter(url => typeof url === 'string').map(url => {
        const frame = thumbnailStore.getPage(url);
        return frame ? { url, data: frame.data, capturedAt: frame.capturedAt } : { url };
      }) };
    }
    case 'menu': await showBrowserMenu(args); break;
    case 'menu-close': closeBrowserMenu(true); break;
    case 'menu-key':
      if (menuWindow && ['Escape', 'ArrowDown', 'ArrowUp', 'Tab', 'Enter', ' '].includes(args.key)) menuWindow.webContents.send('browser:menu-key', { key: args.key, shift: !!args.shift });
      break;
    case 'menu-find': if (panel !== 'library') panel = null; layout(); focusChrome(); win.webContents.send('browser:find', { open: true }); break;
    case 'fullscreen': setFullscreen(typeof args.value === 'boolean' ? args.value : !isFullscreen()); break;
    case 'theme': {
      const next = themeCycle.next(store.data.settings);
      store.data.settings.theme = next.theme;
      store.data.settings.highContrast = next.highContrast;
      applyAppearance();
      store.save();
      break;
    }
    case 'flash-quality': {
      if (!['high', 'medium', 'low'].includes(args.quality)) throw new Error('Choose high, medium or low Flash quality.');
      if (!t) break;
      t.flashQuality = args.quality; t.flashQualityKey = qualityKey(t);
      if (!t.private && t.flashQualityKey) store.data.flashQualities[t.flashQualityKey] = args.quality;
      if (t.native) await t.native.call('quality', { quality: args.quality });
      persistTabs(); store.save();
      break;
    }
    case 'native-mode': if (t?.specialPage) await reload(t); else await toggleFlash(t); break;
    case 'navigate': closeSuggestions(); closeZoomPopup(); focusArea = 'content'; panel = null; await navigate(activeTab(), args.value); break;
    case 'contact-email': clipboard.writeText('sloutchevsky@gmail.com'); break;
    case 'suggest': await showSuggestions(args); break;
    case 'suggest-close': closeSuggestions(); break;
    case 'suggest-select': if (suggestionData) { const index = suggestionData.selected + (args.direction === -1 ? -1 : 1); suggestionData.selected = index < -1 ? suggestionData.items.length - 1 : index >= suggestionData.items.length ? -1 : index; } break;
    case 'suggest-open': {
      const data = suggestionData, item = data?.items[args.index];
      if (item && data.tabId === activeId) {
        closeSuggestions();
        if (data.field === 'library-open-address') await command('add-library-source', { kind: data.libraryKind, value: item.url });
        else { focusArea = 'content'; panel = null; await navigate(activeTab(), item.url); }
      }
      break;
    }
    case 'new-tab': createTab(typeof args.url === 'string' ? args.url : ''); break;
    case 'new-flashcognito': createTab('', false, true); break;
    case 'duplicate-tab': await duplicateTab(args.id); break;
    case 'tab-menu': showTabMenu(args); break;
    case 'select-tab': selectTab(args.id); break;
    case 'tab-presented': if (tabPresentation?.serial === args.serial) { tabPresentation.hostReady = true; swapPresentation(args.serial); } break;
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
    case 'reload': await reload(); break;
    case 'stop': if (t?.native) await t.native.call('stop'); else wc?.stop(); break;
    case 'home': panel = null; await navigate(activeTab(), ''); break;
    case 'collapse': closeBrowserMenu(); closeZoomPopup(); closeSuggestions(); windowMotion?.begin('sidebar'); collapsed = !collapsed; break;
    case 'sidebar-width': {
      if (!Number.isFinite(args.width) || args.width < 160 || args.width > 320) throw new Error('Invalid sidebar width.');
      sidebarWidth = Math.round(args.width); layout();
      if (windowMotion?.active) windowMotion.settle(args.finished ? 0 : undefined);
      return { sidebarWidth };
    }
    case 'panel':
      clearPresentation();
      closeZoomPopup(); closeSuggestions();
      if (args.name === 'library') { await openHostedLibrary(); break; }
      panel = ['bookmarks', 'history', 'downloads', 'library', 'extensions', 'settings', 'about', 'support'].includes(args.name) ? args.name : null;
      panelSection = panel === 'settings' && args.section === 'privacy' ? 'privacy' : null;
      if (panel === 'downloads') {
        const unseen = tabDownloads(t).filter(entry => entry.isNew);
        for (const entry of unseen) entry.isNew = false;
        if (unseen.length && !t?.private) store.save();
      }
      layout(); if (panel) focusChrome(); break;
    case 'extension-install': {
      const result = await showOpenFileDialog({ title: 'Load unpacked Chrome extension', properties: ['openDirectory'] });
      if (result.canceled || !result.filePaths[0]) break;
      const { name, manifest } = await readManifest(result.filePaths[0]);
      const permissions = [...(manifest.permissions || []), ...(manifest.host_permissions || [])].filter(value => typeof value === 'string');
      const accepted = await dialog.showMessageBox(win, { type: 'question', title: 'Add extension', message: `Add ${name}?`, detail: `Requested permissions:\n${permissions.join('\n') || 'None listed'}\n\nOnly add extensions you trust. Some Chrome APIs are unavailable in Corners.`, buttons: ['Cancel', 'Add extension'], defaultId: 0, cancelId: 0 });
      if (accepted.response === 1) await extensions.install(result.filePaths[0]);
      break;
    }
    case 'extension-toggle': case 'extension-reload': case 'extension-remove':
      for (const [identity, popup] of extensionWindows) if (identity.startsWith(args.key + ':') && !popup.isDestroyed()) popup.close();
      await extensions.change(args.key, action.replace('extension-', '')); break;
    case 'extension-page': {
      if (!['options', 'popup'].includes(args.kind)) throw new Error('Invalid extension page.');
      await showExtensionPage(args.key, args.kind); break;
    }
    case 'open-file': {
      const result = await showOpenFileDialog({ title: 'Open file', filters: [{ name: 'Browser files', extensions: ['swf', 'html', 'htm', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'mp4', 'm4v', 'webm', 'ogv', 'mov'] }, { name: 'Flash movies', extensions: ['swf'] }, { name: 'PDF documents', extensions: ['pdf'] }], properties: ['openFile', 'multiSelections'] });
      for (const file of result.filePaths) await openLocal(file);
      break;
    }
    case 'add-library-source': await addLibrarySource(args.value, args.kind); break;
    case 'browse-library-source': {
      if (args.kind !== 'html') throw new Error('Choose a Flash website or HTML file.');
      const result = await showOpenFileDialog({ title: 'Open HTML with Flash', filters: [{ name: 'HTML Flash pages', extensions: ['html', 'htm'] }], properties: ['openFile', 'multiSelections'] });
      for (const file of result.filePaths) await addLibrarySource(file, args.kind);
      break;
    }
    case 'play-library': { const entry = flashPages().find(e => e.id === args.id); if (!entry) throw new Error('This item is not a Flash website or HTML page.'); await addLibrarySource(entry.path || entry.url, 'html', { play: true }); break; }
    case 'library-update': {
      const entry = flashPages().find(item => item.id === args.id);
      if (!entry) throw new Error('Library item not found.');
      const title = String(args.title || '').trim().slice(0, 300), description = String(args.description || '').trim().slice(0, 4000), year = String(args.year || '').trim().slice(0, 40), createdBy = String(args.createdBy || '').trim().slice(0, 300);
      if (!title) throw new Error('Enter a title for this Flash page.');
      const requestedSource = String(args.source || entry.path || entry.url).trim();
      const source = requestedSource === (entry.path || entry.url) ? { local: entry.path || null, url: entry.url || null } : await librarySource(requestedSource);
      const changed = (source.local || source.url) !== (entry.path || entry.url);
      delete entry.path; delete entry.url;
      Object.assign(entry, source.local ? { path: source.local } : { url: source.url });
      entry.title = title; entry.description = description; entry.year = year; entry.createdBy = createdBy; entry.titleEdited = true;
      entry.updatedAt = new Date().toISOString(); store.save();
      if (changed) for (const tab of tabs) if (tab.libraryId === entry.id) tab.libraryTitlePending = false;
      break;
    }
    case 'library-heading': store.libraryFolder.heading = { title: String(args.title || '').trim().slice(0, 300), subtitle: String(args.subtitle || '').trim().slice(0, 600) }; store.save(); break;
    case 'library-folder': { const error = await shell.openPath(store.libraryFolder.directory); if (error) throw new Error(error); break; }
    case 'support-folder': { shell.showItemInFolder(supportLinks.file); break; }
    case 'support-checkout': { const url = supportLinks.checkout(args.provider, args.frequency, args.amount); await shell.openExternal(url); break; }
    case 'support-confirm': { store.data.supporter=true;store.save();break; }
    case 'library-image': {
      if (!store.data.library.some(item => item.id === args.id)) throw new Error('Library item not found.');
      const result = await showOpenFileDialog({ title: 'Choose a Flash gallery image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }], properties: ['openFile'] });
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
      store.save(); retainThumbnails(); break;
    }
    case 'remove-bookmark': store.data.bookmarks = store.data.bookmarks.filter(b => b.id !== args.id); store.save(); retainThumbnails(); break;
    case 'clear-history': if (!t?.private) { store.data.history = []; store.save(); retainThumbnails(); } break;
    case 'clear-data':
    case 'delete-browsing-data': {
      const choices = deletionChoices(action === 'clear-data' ? { cookies: true, cache: true } : args);
      if (!Object.values(choices).some(Boolean)) throw new Error('Select at least one type of browsing data.');
      const targetSession = t?.private ? privateSession : browsingSession;
      const extensionOrigins = (extensions?.state() || []).filter(item => item.id).map(item => `chrome-extension://${item.id}`);
      await clearSessionData(targetSession, choices, extensionOrigins);
      if (choices.cookies && targetSession) sitePermissions.get(targetSession)?.clear();
      await Promise.all(allContents().filter(tab => tab.native && !!tab.private === !!t?.private).map(tab => tab.native.call('delete-browsing-data', choices)));
      if (choices.history && !t?.private) { store.data.history = []; store.save(); retainThumbnails(); closeSuggestions(); }
      break;
    }
    case 'settings': {
      if (typeof args.darkTheme === 'boolean') store.data.settings.theme = args.darkTheme ? 'current' : 'light';
      if (typeof args.highContrast === 'boolean') store.data.settings.highContrast = args.highContrast;
      if (typeof args.darkTheme === 'boolean' || typeof args.highContrast === 'boolean') applyAppearance();
      if (['duckduckgo', 'google', 'bing'].includes(args.searchEngine)) store.data.settings.searchEngine = args.searchEngine;
      if (typeof args.restoreTabs === 'boolean') store.data.settings.restoreTabs = args.restoreTabs;
      if(typeof args.autoCloseTabs==='boolean')store.data.settings.autoCloseTabs=args.autoCloseTabs;
      if(args.tabLimit!==undefined)store.data.settings.tabLimit=tabLimit(args.tabLimit);
      enforceTabLimit();
      if (typeof args.pageSummaries === 'boolean' && args.pageSummaries !== store.data.settings.pageSummaries) {
        store.data.settings.pageSummaries = args.pageSummaries;
        for (const tab of tabs) scheduleSummary(tab, 0);
        layout();
      }
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
    case 'minimize': windowMotion?.begin('minimize'); win.minimize(); break;
    case 'maximize': windowMotion?.begin('maximize'); win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close-window': win.close(); break;
    default: throw new Error('Unknown browser command.');
  }
  sendState(true);
  return getState();
}

async function boot() {
  store = new Store(app.getPath('userData'));
  nativeTheme.themeSource = store.data.settings.theme === 'light' ? 'light' : 'dark';
  thumbnailStore = new TabThumbnailStore(app.getPath('userData'));
  if (process.platform === 'win32' && app.isPackaged && !testMode && store.data.settings.swfAssociationPath !== process.execPath) registerSWF(process.execPath).then(() => { store.data.settings.swfAssociationPath = process.execPath; store.save(); }).catch(error => console.error('SWF association:', error.message));
  supportLinks = new SupportLinks(app.getPath('userData'));
  browsingSession = session.fromPartition('persist:flashborn');
  extensions = new Extensions(store, browsingSession, path.join(app.getPath('userData'), 'extensions'), () => sendState());
  extensionBridge = new ExtensionBridge(browsingSession, { tabs: () => tabs.filter(t => !t.private && !t.native && live(t)), active: activeTab, window: () => win, create: createTab, select: selectTab, close: closeTab, ensureView, options: id => extensions.state().find(item => item.id === id) });
  await session.defaultSession.protocol.handle('flashborn', handleProtocol);
  await browsingSession.protocol.handle('flashborn', handleProtocol);
  configureSession();
  win = new BrowserWindow({ width: 1360, height: 900, minWidth: 800, minHeight: 560, backgroundColor:alphaFrame?'#00000000':appearanceBackground(),transparent:alphaFrame,resizable:true,maximizable:true,frame:false,thickFrame:false,roundedCorners:false,hasShadow:false,show:!testMode,
    title: 'Corners', icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, offscreen: testMode && process.env.FLASHBORN_OFFSCREEN === '1', backgroundThrottling: !testMode } });
  win.cornersAlphaFrame=alphaFrame;
  if (process.platform === 'win32') { flashWindowRegion = new FlashWindowRegion(win); windowPreview = new WindowPreview(win, captureWindowPreview); windowActivation = new WindowActivation(win, () => tabPresentation ? null : activeContent()?.native); }
  if (process.platform==='win32') windowMotion=new WindowMotion(win,()=>activeContent()?.native,layout,{
    liveLayout:native=>{const page=activeContent();return page?.native===native&&isLibraryPage(page.url,libraryPageURL);}
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-frame-navigate',(event,url)=>{const target=event.url||url;if(target!==UI_URL&&!isLibraryPage(target,libraryPageURL))event.preventDefault();});
  win.webContents.on('before-input-event', handleKeys);
  win.webContents.setZoomMode('manual');
  win.webContents.on('zoom-changed', (_event, direction) => wheelZoom(activeContent(), direction === 'in' ? 1 : -1, 'browser'));
  win.webContents.on('context-menu', (_event, params) => showEditMenu(win.webContents, params));
  if (process.platform === 'win32') {
    win.hookWindowMessage(0x0112,wParam=>{
      const action=wParam.readUInt32LE()&0xfff0;
      if(action===0xf020)windowMotion?.begin('minimize');
      else if(action===0xf030 || action===0xf120)windowMotion?.begin('restore');
    });
    win.hookWindowMessage(0x00a1, wParam => {
      if (wParam.readUInt32LE(0) !== 2) return; // HTCAPTION
      // Keep the menu attached through caption drags without transferring focus.
      clearTimeout(contentFocusTimer);
      closeZoomPopup(); closeSuggestions();
    });
    // Do not transfer activation to the independent Flash window while Windows
    // owns the title-bar move/resize loop and its mouse capture.
    win.hookWindowMessage(0x0231, () => {
      windowMoving = true; clearTimeout(contentFocusTimer);
      flashWindowRegion?.setMoving(true);
      for (const tab of allContents()) if (tab.native) tab.native.hostMoving = true;
    });
    // WM_SIZING changes viewport geometry; only a pure caption move keeps the
    // existing cutout. Leave normal resizing responsive throughout its loop.
    win.hookWindowMessage(0x0214, () => { flashWindowRegion?.setMoving(false); windowMotion?.begin('resize'); });
    win.hookWindowMessage(0x0232, () => {
      windowMoving = false;
      windowCorner?.setResizing(false);
      topLeftCorner?.setResizing(false);
      flashWindowRegion?.setMoving(false);
      for (const tab of allContents()) if (tab.native) tab.native.hostMoving = false;
      if (windowMotion?.active) windowMotion.settle(0);
      layout(); restoreContentFocus();
    });
  }
  for(const event of ['maximize','unmaximize','restore'])win.on(event,()=>windowMotion?.begin(event));
  for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(event, () => {
    if (event !== 'resize' || !menuMotion || menuMotion.sizeChanged()) closeBrowserMenu(false,true);
    else menuMotion.align();
    closeZoomPopup(); closeSuggestions(); layout(); sendState(true);
  });
  for (const event of ['resize', 'resized', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore']) win.on(event, restoreContentFocus);
  for (const event of ['enter-full-screen', 'leave-full-screen']) win.on(event, () => { for (const t of allContents()) if (t.native) t.native.call('host-fullscreen', { value: isFullscreen() && t === activeContent() }).then(layout).catch(() => {}); });
  win.on('move', () => {
    menuMotion?.align();
    if (!windowMoving) { closeZoomPopup(); closeSuggestions(); }
    // Geometry within the shell has not changed. Re-showing/repositioning its
    // WebContentsViews here can disturb the ongoing native caption drag.
    for (const tab of allContents()) tab.native?.syncWindow();
  });
  win.on('minimize', () => {
    windowMotion?.begin('minimize');
    closeBrowserMenu(false,true); closeZoomPopup(); closeSuggestions();
    // Minimize intentionally parks every surface. Cancel frame-readiness waits
    // instead of reporting that ordinary window gesture as a renderer failure.
    clearPresentation(); layout(); sendState(true);
  });
  win.on('restore', layout);
  win.on('focus', () => activeContent()?.native?.syncWindow());
  win.on('blur', () => { closeBrowserMenu(); closeZoomPopup(); closeSuggestions(); });
  // Windows restores the last input target on activation. Transfer focus on an
  // explicit tab/page/toolbar action; a parent focus event can itself result
  // from that transfer and must not start another cross-process handoff.
  win.on('close', event => {
    if (!closing && downloadItems.size) {
      const response = dialog.showMessageBoxSync(win, { type: 'question', message: 'Downloads are still running.', detail: 'Closing Corners will cancel them.', buttons: ['Keep browsing', 'Close browser'], defaultId: 0, cancelId: 0 });
      if (response === 0) { event.preventDefault(); return; }
    }
    if (!closing) {
      event.preventDefault();
      clearInterval(snapshotTimer);
      closeBrowserMenu(false,true); closeZoomPopup(); closeSuggestions(); persistTabs(); closing = true;
      if(menuPopup && !menuPopup.isDestroyed())menuPopup.destroy();
      windowPreview?.dispose();
      windowMotion?.dispose();
      windowActivation?.dispose();
      windowCorner?.dispose();
      topLeftCorner?.dispose();
      windowScrollbars?.dispose();
      // Save the last completed captures, without waiting for any renderer.
      thumbnailStore.close().catch(error => console.error('Tab thumbnails:', error.message)).finally(() => { if (win && !win.isDestroyed()) win.close(); });
      return;
    }
    clearPresentation(); tabSnapshots.clear();
    for (const popup of extensionWindows.values()) if (!popup.isDestroyed()) popup.destroy();
    extensions?.dispose();
    for (const t of allContents()) { if (t.native) t.native.dispose(); if (live(t)) t.view.webContents.close(); }
  });
  win.on('closed', () => { win = null; });
  ipcMain.handle('browser:command', async (event, action, args) => {
    const fromMenu = event.sender === menuPopup?.webContents && event.senderFrame?.url === MENU_URL;
    const fromZoom = event.sender === zoomWindow?.webContents && event.senderFrame?.url === ZOOM_URL;
    const fromSuggestions = event.sender === suggestionWindow?.webContents && event.senderFrame?.url === SUGGEST_URL;
    if (!fromMenu && !fromZoom && !fromSuggestions && (event.sender !== win?.webContents || event.senderFrame?.url !== UI_URL)) throw new Error('Untrusted command source.');
    if (typeof action !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid browser command.');
    if (fromZoom && !['state', 'zoom', 'zoom-hold', 'zoom-release'].includes(action)) throw new Error('Unsupported zoom command.');
    if (fromSuggestions && !['state', 'suggest-open'].includes(action)) throw new Error('Unsupported address suggestion command.');
    if (fromMenu && !['state', 'menu-close', 'new-tab', 'new-flashcognito', 'open-file', 'native-mode', 'panel', 'menu-find', 'print', 'zoom', 'mute', 'flash-quality', 'fullscreen'].includes(action)) throw new Error('Unsupported menu command.');
    if (fromMenu && !menuOpen && !['state','menu-close'].includes(action)) throw new Error('The browser menu is closed.');
    if (fromMenu && !['state', 'zoom', 'flash-quality', 'mute', 'menu-close'].includes(action)) closeBrowserMenu(true);
    try { return { ok: true, state: await command(action, args) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('browser:gallery-frame',async(event,request)=>{
    const tab=activeContent();
    if(event.sender!==win?.webContents||event.senderFrame?.url!==UI_URL||!tab?.galleryFrame)throw new Error('Untrusted Gallery frame.');
    try{return {id:request?.id,ok:true,state:await handleLibraryPage(tab,request)};}
    catch(error){return {id:request?.id,ok:false,error:error.message};}
  });
  ipcMain.handle('browser:library-page', async (event, request) => {
    const tab = allContents().find(tab => live(tab) && tab.view.webContents === event.sender && event.senderFrame === event.sender.mainFrame);
    if (!tab || !isLibraryPage(event.senderFrame.url, libraryPageURL)) return { id: request?.id, ok: false, error: 'This page cannot access the Flash Gallery.' };
    try { return { id: request.id, ok: true, state: await handleLibraryPage(tab, request) }; }
    catch (error) { return { id: request?.id, ok: false, error: error.message }; }
  });
  const trustedInput = event => event.sender === win?.webContents && event.senderFrame?.url === UI_URL || tabs.some(tab => live(tab) && tab.view.webContents === event.sender && event.sender.mainFrame === event.senderFrame);
  ipcMain.on('browser:menu-outside', event => { if (trustedInput(event)) closeBrowserMenu(); });
  ipcMain.on('browser:chrome-focus', (event, at) => { if (event.sender === win?.webContents && event.senderFrame?.url === UI_URL && Number.isFinite(at)) focusChrome(at); });
  ipcMain.on('browser:private-key', event => { if (trustedInput(event)) createTab('', false, true); });
  ipcMain.on('browser:summary-changed', event => {
    const tab = tabs.find(t => live(t) && t.view.webContents === event.sender && event.senderFrame === event.sender.mainFrame);
    if (tab && store.data.settings.pageSummaries && !tab.native) scheduleSummary(tab, 150);
  });
  ipcMain.on('browser:wheel', (event, direction) => { if (trustedInput(event) && [-1, 1].includes(direction)) wheelZoom(activeContent(), direction, 'dom'); });
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
  windowCorner=new WindowCorner(win,()=>{closeBrowserMenu(true);},()=>isFullscreen()||win.isMaximized(),'bottom-right',()=>{if(isFullscreen())setFullscreen(false);});
  windowCorner.setTheme(store.data.settings.theme==='light');
  topLeftCorner=new WindowCorner(win,()=>{closeBrowserMenu(true);},()=>isFullscreen()||win.isMaximized(),'top-left',()=>{if(isFullscreen())setFullscreen(false);});
  topLeftCorner.setTheme(store.data.settings.theme==='light');
  windowScrollbars=new WindowScrollbars(win,scrollbarTarget,()=>({inside:true,top:isFullscreen()||compactChrome()?FRAME:FRAME+100,left:FRAME+(isFullscreen()?0:sidebarWidth),light:store.data.settings.theme==='light'}),()=>closeBrowserMenu(true),updateFlashWindowRegion,()=>({id:'shell:tabs',selector:'#tabs',run:code=>win.webContents.executeJavaScript(code)}));

  prepareBrowserMenu().catch(error=>console.error('Browser menu:',error.message));
  const saved = store.data.settings.restoreTabs ? store.data.tabs.map(savedEntry).filter(Boolean).slice(0, MAX_OPEN_TABS) : [];
  const savedIndex = store.data.tabs.slice(0, store.data.activeTabIndex || 0).map(savedEntry).filter(Boolean).length;
  const restoreLibraryPanel = isSavedLibraryPage(saved[savedIndex]?.url, libraryPageURL);
  const regularIndex = saved.slice(0, savedIndex).filter(entry => !isSavedLibraryPage(entry.url, libraryPageURL)).length;
  restoringTabs=true;
  for (const entry of saved) {
    if (isSavedLibraryPage(entry.url, libraryPageURL)) continue;
    const restored = createTab('', true, false, null, true);
    entry.thumbnailId ||= restored.thumbnailId;
    Object.assign(restored, { kind: entry.kind, title: entry.title, url: entry.url, localPath: entry.path, restoreEntry: entry.kind === 'home' ? null : entry });
    if (entry.thumbnailId) restored.thumbnailId = entry.thumbnailId;
    tabSnapshots.seed(restored, thumbnailStore.get(entry));
  }
  if (tabs.length) selectTab(tabs[Math.min(Math.max(0, regularIndex), tabs.length - 1)].id);
  else createTab();
  restoringTabs=false;enforceTabLimit();
  if (restoreLibraryPanel) await openHostedLibrary();
  for (const tab of tabs) {
    const frame = tabSnapshots.get(tab);
    if (frame) win.webContents.send('browser:tab-snapshot', frame);
  }
  const file = process.argv.find(arg => /\.(swf|html?|pdf|png|jpe?g|gif|webp|svg|avif|bmp|ico|mp4|m4v|webm|ogv|mov)$/i.test(arg) && fs.existsSync(arg));
  if (file) await openLocal(file);
  await extensions.start();
  snapshotTimer = setInterval(() => {
    if (closing || !win || win.isDestroyed() || win.isMinimized() || !win.isVisible() || windowMoving || tabPresentation) return;
    const tab = activeTab();
    if (tab && !panel) requestTabSnapshot(tab).catch(() => {});
  }, 750);
  snapshotTimer.unref();
  if (testMode) {
    // Accessible only from main-process Playwright evaluation in a test launch.
    global.__flashborn = { getState, command, tabs, activeTab, activeContent, libraryPanels, openLocal, win, browsingSession, extensions, extensionBridge, tabSnapshots, requestTabSnapshot, get edgeScrollbars(){return windowScrollbars;}, get corner() { return windowCorner; }, get topLeftCorner() { return topLeftCorner; }, get windowMotion() { return windowMotion; }, get windowActivation() { return windowActivation; }, get windowPreview() { return windowPreview; }, get windowRegion() { return flashWindowRegion; }, get presentation() { return tabPresentation; }, get focusArea() { return focusArea; }, get privateSession() { return privateSession; }, get tabMenu() { return tabMenu; }, get menuWindow() { return menuWindow; }, get menuMotion() { return menuMotion; }, get zoomWindow() { return zoomWindow; }, get editMenu() { return editMenu; }, get suggestionWindow() { return suggestionWindow; } };
  }
}
if (gotLock) app.whenReady().then(boot).catch(error => { console.error(error); dialog.showErrorBox('Corners could not start', error.stack || error.message); app.quit(); });
app.on('second-instance', async (_event, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore(); win.focus();
  const file = argv.find(arg => /\.(swf|html?|pdf|png|jpe?g|gif|webp|svg|avif|bmp|ico|mp4|m4v|webm|ogv|mov)$/i.test(arg) && fs.existsSync(arg));
  if (file) try { await openLocal(file); } catch (e) { dialog.showErrorBox('Could not open file', e.message); }
});
app.on('window-all-closed', () => app.quit());
