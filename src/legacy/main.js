'use strict';
const { app, BrowserWindow, session, Menu, ipcMain, protocol, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const nodeNet = require('net');
const { isFlashFallbackURL, legacyFlashTarget } = require('./compat');
const { nextZoom } = require('./zoom');
const { settingsScript } = require('./flash-settings');
const flashRuntime = require('./runtime.json');
app.setPath('userData', process.env.FLASHBORN_NATIVE_PROFILE);
app.commandLine.appendSwitch('force-color-profile', 'srgb');
nativeTheme.themeSource = 'system';
app.commandLine.appendSwitch('ppapi-flash-path', process.env.FLASHBORN_NATIVE_PLUGIN);
app.commandLine.appendSwitch('ppapi-flash-version', flashRuntime.version);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Like the reference Flash Browser, keep the legacy renderer at normal process
// priority when Windows gives foreground ownership to the modern parent HWND.
// Hidden tabs still throttle their timers through the visibility command.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
protocol.registerSchemesAsPrivileged([{ scheme: 'flashnative', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let window, runtimeSession, source = null, shuttingDown = false, quality = 'high', qualityOverride = false, hostFullscreen = false;
let settingsTimer, visible = false, settingsRuns = 0;
const channel = nodeNet.connect(process.env.FLASHBORN_NATIVE_CHANNEL);
const connected = new Promise(resolve => channel.once('connect', () => { channel.write(JSON.stringify({token:process.env.FLASHBORN_NATIVE_TOKEN})+'\n'); resolve(); }));
channel.on('error', () => app.quit());
channel.on('close', () => { shuttingDown = true; app.quit(); });
const send = data => channel.write(JSON.stringify(data) + '\n');
const isWeb = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
function state() {
  if (!window || window.isDestroyed()) return {};
  const wc = window.webContents;
  return { url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), quality, canBack: wc.canGoBack(), canForward: wc.canGoForward(), zoom: Math.round(wc.getZoomFactor() * 100), muted: wc.isAudioMuted(), audible: wc.isCurrentlyAudible() };
}
function publish() { send({ type: 'state', state: state() }); }
async function applySettings() {
  if (!window || window.isDestroyed() || !qualityOverride) return;
  const wc = window.webContents;
  const url = wc.getURL();
  if ((!isWeb(url) && !url.startsWith('flashnative://document/')) || wc.isLoadingMainFrame()) return;
  // Never poll PercentLoaded or change embed attributes during playback.
  // Only a requested quality override calls into a movie, once per instance.
  settingsRuns++;
  await wc.executeJavaScript(settingsScript(quality)).catch(() => {});
}
function scheduleSettings() {
  clearTimeout(settingsTimer);
  // Let the movie's first frame initialize before its one requested override.
  // This is a single delayed application, never a loading/PercentLoaded poll.
  if (qualityOverride) settingsTimer = setTimeout(applySettings, 600);
}
function registerProtocol() {
  runtimeSession.protocol.registerBufferProtocol('flashnative', async (request, callback) => {
    try {
      const url = new URL(request.url); let data, mimeType;
      if (url.hostname === 'document' && source && source.kind === 'html' && url.pathname.split('/')[1] === source.token) {
        const root = fs.realpathSync(path.dirname(source.path)), file = fs.realpathSync(path.resolve(root, decodeURIComponent(url.pathname.split('/').slice(2).join('/'))));
        const relative = path.relative(root, file);
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Asset outside selected HTML folder');
        data = fs.readFileSync(file);
        const types = { '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.swf': 'application/x-shockwave-flash', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.json': 'application/json', '.mp3': 'audio/mpeg' };
        return callback({ data, mimeType: types[path.extname(file).toLowerCase()] || 'application/octet-stream', headers: { 'X-Content-Type-Options': 'nosniff' } });
      }
      callback({ statusCode: 404, data: Buffer.from('Not found') });
    } catch (e) { callback({ statusCode: 400, data: Buffer.from(e.message), mimeType: 'text/plain' }); }
  });
}
async function command(action, args) {
  const wc = window.webContents;
  switch (action) {
    case 'navigate': if (!isWeb(args.url) || /\.swf$/i.test(new URL(args.url).pathname)) throw new Error('Only HTTP and HTTPS pages can use native Flash mode.'); source = null; await wc.loadURL(args.url).catch(e => { if (e.code !== 'ERR_ABORTED') throw e; }); break;
    case 'local-html': source = { ...args, kind: 'html', path: fs.realpathSync(args.path) }; await wc.loadURL('flashnative://document/' + source.token + '/' + encodeURIComponent(path.basename(source.path))); break;
    case 'back': if (wc.canGoBack()) wc.goBack(); break;
    case 'forward': if (wc.canGoForward()) wc.goForward(); break;
    case 'reload': wc.reload(); break;
    case 'stop': clearTimeout(settingsTimer); wc.stop(); break;
    case 'focus': if (visible && (args.before === undefined || Date.now() <= args.before)) { window.focus(); wc.focus(); } break;
    case 'focus-host': break;
    case 'visibility':
      visible = !!args.value;
      wc.setBackgroundThrottling(!visible);
      if (visible) window.showInactive();
      else window.hide();
      break;
    case 'mute': wc.setAudioMuted(args.value === undefined ? !wc.isAudioMuted() : !!args.value); break;
    case 'zoom': wc.setZoomFactor(nextZoom(wc.getZoomFactor() * 100, args.direction) / 100); break;
    case 'restore-state':
      wc.setZoomFactor(Math.max(25, Math.min(500, Number(args.zoom) || 100)) / 100);
      wc.setAudioMuted(!!args.muted); break;
    case 'host-fullscreen':
      hostFullscreen = !!args.value;
      if (!hostFullscreen) await wc.executeJavaScript('if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});').catch(() => {});
      if (!hostFullscreen && window.isFullScreen()) window.setFullScreen(false);
      break;
    case 'quality': quality = ['low', 'medium', 'high'].includes(args.quality) ? args.quality : 'high'; qualityOverride = !args.initial || quality !== 'high'; await applySettings(); break;
    case 'print': wc.print(); break;
    case 'find': if (args.text) wc.findInPage(args.text, { forward: args.forward !== false, findNext: !args.next }); else wc.stopFindInPage('clearSelection'); break;
    case 'clear-data': await runtimeSession.clearStorageData(); await runtimeSession.clearCache(); break;
    case 'capture': if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action'); return (await wc.capturePage()).toPNG().toString('base64');
    case 'memory': {
      // Each Flash tab has its own complete runtime, including the PPAPI player.
      const metrics = app.getAppMetrics();
      const kb = metrics.reduce((total, metric) => total + (metric.memory && Number.isFinite(metric.memory.privateBytes) ? metric.memory.privateBytes : metric.memory && metric.memory.workingSetSize || 0), 0);
      return { megabytes: kb > 0 ? Math.max(1, Math.round(kb / 1024)) : null };
    }
    case 'test-paints': {
      if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action');
      if (!window.paintStats) {
        window.paintStats = {};
        for (const [name, message] of Object.entries({ frame: 0x83, erase: 0x14, paint: 0xf, size: 5 })) {
          window.paintStats[name] = 0;
          window.hookWindowMessage(message, () => { window.paintStats[name]++; });
        }
      }
      if (args.reset) for (const name of Object.keys(window.paintStats)) window.paintStats[name] = 0;
      return { ...window.paintStats };
    }
    case 'evaluate': if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action'); return wc.executeJavaScript(args.code, true);
    case 'test-playback':
      if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action');
      return { settingsRuns, visible, focused: wc.isFocused(), windowFocused: window.isFocused(), backgroundThrottling: wc.getWebPreferences().backgroundThrottling, normalRendererPriority: app.commandLine.hasSwitch('disable-renderer-backgrounding'), colorProfile: app.commandLine.getSwitchValue('force-color-profile') };
    case 'test-renderer-crash':
      if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action');
      setTimeout(() => process.kill(wc.getOSProcessId(), 'SIGKILL'), 0); return;
    case 'test-host-hang':
      if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action');
      setTimeout(() => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000), 20); return;
    case 'test-key':
      if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action');
      wc.sendInputEvent({ type: 'keyDown', keyCode: args.key, modifiers: args.control ? ['control'] : [] });
      wc.sendInputEvent({ type: 'keyUp', keyCode: args.key, modifiers: args.control ? ['control'] : [] }); break;
    case 'test-mouse':
      if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action');
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' }[args.type], x: args.x, y: args.y, button: args.button || 'none', buttons: args.type === 'mouseDown' || args.type === 'mouseMove' && args.button === 'left' ? 1 : 0, clickCount: args.clickCount || 0 }); return;
    case 'test-wheel': if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action'); if (!wc.debugger.isAttached()) wc.debugger.attach('1.3'); await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseWheel', x: args.x || 100, y: args.y || 150, deltaX: 0, deltaY: -args.deltaY, modifiers: 2 }); break;
    case 'close': shuttingDown = true; window.close(); app.quit(); return;
    default: throw new Error('Unsupported native Flash command');
  }
  publish(); return state();
}
app.whenReady().then(async () => {
  await connected;
  runtimeSession = process.env.FLASHBORN_NATIVE_PRIVATE === '1' ? session.fromPartition('flashcognito', { cache: false }) : session.defaultSession;
  registerProtocol();
  runtimeSession.webRequest.onHeadersReceived((details, callback) => {
    const type = Object.keys(details.responseHeaders || {}).find(key => key.toLowerCase() === 'content-type');
    const mime = type && details.responseHeaders[type].join(';');
    const standalone = details.resourceType === 'mainFrame' && /application\/(x-shockwave-flash|futuresplash|vnd.adobe.flash.movie)/i.test(mime || '');
    callback({ cancel: !!standalone, responseHeaders: details.responseHeaders });
    if (standalone) send({ type: 'error', message: 'Open the HTML page containing this Flash movie. Standalone SWF playback has been removed.' });
  });
  runtimeSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
  window = new BrowserWindow({ width: 1100, height: 700, type: 'toolbar', frame: false, show: false, skipTaskbar: true, resizable: false, minimizable: false, maximizable: false, backgroundColor: '#191919',
    webPreferences: { session: runtimeSession, plugins: true, sandbox: true, nodeIntegration: false, contextIsolation: true, enableRemoteModule: false, webSecurity: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') } });
  Menu.setApplicationMenu(null);
  const wc = window.webContents;
  ipcMain.on('browser:content-focus', (event, at) => { if (event.sender === wc && Number.isFinite(at)) send({ type: 'input-pointer', at }); });
  if (process.env.FLASHBORN_NATIVE_TEST === '1') {
    runtimeSession.webRequest.onErrorOccurred(details => console.error('NATIVE REQUEST ERROR', details.error, details.url));
    wc.on('console-message', (_event, level, message, line, source) => { if (level >= 2) console.error('NATIVE PAGE', message, source, line); });
  }
  wc.on('new-window', (event, url) => { event.preventDefault(); if (isWeb(url)) send({ type: 'new-tab', url }); });
  wc.on('will-navigate', (event, url) => {
    const scopedLocal = source && source.kind === 'html' && url.startsWith('flashnative://document/' + source.token + '/');
    if (!isWeb(url) && !scopedLocal) { event.preventDefault(); return; }
    if (/\.swf$/i.test(new URL(url).pathname)) { event.preventDefault(); return; }
    if (/\.pdf$/i.test(new URL(url).pathname)) { event.preventDefault(); send({ type: 'open-pdf', url }); return; }
    if (!isFlashFallbackURL(url)) return;
    event.preventDefault();
    // Old Macromedia detectors recognize versions 2–9 and misread 32 as 2.
    const current = wc.getURL();
    wc.executeJavaScript(`({flashPage:window.flashPage,maxVersion:window.maxVersion,requiredVersion:window.requiredVersion,plugin:!!navigator.plugins['Shockwave Flash']})`).then(values => {
      const target = values.plugin && legacyFlashTarget(current, values);
      return wc.loadURL(target || url);
    }).catch(e => { if (e.code !== 'ERR_ABORTED') send({type:'error',message:e.message}); });
  });
  wc.on('will-redirect', (event, url) => { if (!isWeb(url) && !(source && source.kind === 'html' && url.startsWith('flashnative://document/' + source.token + '/'))) event.preventDefault(); });
  wc.on('will-attach-webview', event => event.preventDefault());
  for (const name of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','page-title-updated','audio-state-changed']) wc.on(name, publish);
  wc.on('did-start-loading', () => clearTimeout(settingsTimer));
  wc.on('did-frame-finish-load', () => scheduleSettings());
  window.on('closed', () => clearTimeout(settingsTimer));
  wc.on('render-process-gone', () => send({ type: 'error', recreate: true, message: 'This Flash tab stopped. Reload to start a fresh player.' }));
  wc.on('plugin-crashed', () => send({ type: 'error', recreate: true, message: 'The Flash player stopped. Reload this tab to restart it.' }));
  wc.on('unresponsive', () => send({ type: 'unresponsive' }));
  wc.on('responsive', () => send({ type: 'responsive' }));
  wc.on('did-fail-load', (_event, code, message, _url, main) => { if (main && code !== -3) send({ type: 'error', message: 'Native Flash page could not load (' + message + ').' }); });
  wc.on('found-in-page', (_event, result) => send({ type: 'find', result }));
  wc.on('enter-html-full-screen', () => send({ type: 'fullscreen', value: true }));
  wc.on('leave-html-full-screen', () => send({ type: 'fullscreen', value: false }));
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (((input.control || input.meta) && (input.shift && key === 'n' || ['l','t','w','o','r','f','d','h','j','p','+','=','-','0','tab','1','2','3','4','5','6','7','8','9'].includes(key))) || (input.alt && ['arrowleft','arrowright'].includes(key)) || ['f11','f5','escape'].includes(key)) { event.preventDefault(); send({ type: 'key', input }); }
  });
  wc.on('zoom-changed', (_event, direction) => send({ type: 'zoom-wheel', direction }));
  ipcMain.on('browser:wheel', (event, direction) => { if (event.sender === wc && [-1, 1].includes(direction)) send({ type: 'zoom-wheel', direction: direction === 1 ? 'in' : 'out', source: 'dom' }); });
  ipcMain.on('browser:drop-files', (event, paths) => { if (event.sender === wc && Array.isArray(paths)) send({ type: 'drop-files', paths }); });
  runtimeSession.on('will-download', (event, item) => { event.preventDefault(); send({ type: item.getMimeType() === 'application/pdf' ? 'open-pdf' : 'download', url: item.getURL() }); });
  const reader = readline.createInterface({ input: channel });
  reader.on('line', async line => { let message; try { message = JSON.parse(line); const value = await command(message.action, message.args || {}); if (message.id) send({ reply: message.id, value }); } catch (e) { if (message && message.id) send({ reply: message.id, error: e.message }); else send({ type: 'error', message: e.message }); } });
  reader.on('close', () => { shuttingDown = true; app.quit(); });
  const handle = window.getNativeWindowHandle();
  send({ type: 'ready', handle: Buffer.from(handle).reverse().toString('hex'), pid:process.pid, electron: process.versions.electron, chromium: process.versions.chrome, flash: flashRuntime.version });
});
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', e => { send({ type: 'error', message: e.stack || e.message }); if (!window) app.quit(); });
