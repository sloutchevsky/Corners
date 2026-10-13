'use strict';
const { app, BrowserWindow, session, Menu, ipcMain, protocol, net, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const nodeNet = require('net');
const { isFlashFallbackURL, legacyFlashTarget } = require('./compat');
const { nextZoom } = require('./zoom');
const { settingsScript } = require('./flash-settings');
const { pathToFileURL, fileURLToPath } = require('url');
app.setPath('userData', process.env.FLASHBORN_NATIVE_PROFILE);
app.commandLine.appendSwitch('ppapi-flash-path', process.env.FLASHBORN_NATIVE_PLUGIN);
app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.363');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{ scheme: 'flashnative', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let window, source = null, shuttingDown = false, quality = 'high', theme = 'current', pluginLoading = false, sampling = false;
const channel = nodeNet.connect(process.env.FLASHBORN_NATIVE_CHANNEL);
const connected = new Promise(resolve => channel.once('connect', () => { channel.write(JSON.stringify({token:process.env.FLASHBORN_NATIVE_TOKEN})+'\n'); resolve(); }));
channel.on('error', () => app.quit());
channel.on('close', () => { shuttingDown = true; app.quit(); });
const send = data => channel.write(JSON.stringify(data) + '\n');
const isWeb = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
function state() {
  if (!window || window.isDestroyed()) return {};
  const wc = window.webContents;
  return { url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading() || pluginLoading, quality, canBack: wc.canGoBack(), canForward: wc.canGoForward(), zoom: Math.round(wc.getZoomFactor() * 100), muted: wc.isAudioMuted(), audible: wc.isCurrentlyAudible() };
}
function publish() { send({ type: 'state', state: state() }); }
async function applySettings() {
  if (sampling || !window || window.isDestroyed()) return;
  const wc = window.webContents, url = wc.getURL();
  if ((!isWeb(url) && !url.startsWith('flashnative:')) || wc.isLoadingMainFrame()) return;
  sampling = true;
  try {
    const result = await window.webContents.executeJavaScript(settingsScript(quality, theme));
    if (pluginLoading !== result.loading) { pluginLoading = result.loading; publish(); }
    return result;
  } catch { /* A navigation destroys its previous JavaScript context. */ }
  finally { sampling = false; }
}
function remoteBytes(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, session: session.defaultSession });
    const timer = setTimeout(() => { request.abort(); reject(new Error('Flash download timed out.')); }, 60000);
    request.on('error', error => { clearTimeout(timer); reject(error); });
    request.on('response', response => {
      if (response.statusCode < 200 || response.statusCode >= 300) { clearTimeout(timer); request.abort(); reject(new Error('Flash server returned HTTP ' + response.statusCode)); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 256 * 1024 * 1024) { request.abort(); reject(new Error('Flash file exceeds 256 MB.')); } else chunks.push(chunk); });
      response.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      response.on('error', reject);
    });
    request.end();
  });
}
function registerProtocol() {
  session.defaultSession.protocol.registerBufferProtocol('flashnative', async (request, callback) => {
    try {
      const url = new URL(request.url); let data, mimeType;
      if (url.hostname === 'player' && url.pathname === '/movie.swf' && source) {
        data = source.path ? fs.readFileSync(source.path) : await remoteBytes(source.url);
        if (!['FWS','CWS','ZWS'].includes(data.slice(0, 3).toString())) throw new Error('Not a SWF file');
        mimeType = 'application/x-shockwave-flash';
      } else if (url.hostname === 'player' && url.pathname === '/config.json' && source) {
        data = Buffer.from(JSON.stringify(source)); mimeType = 'application/json';
      } else if (url.hostname === 'player' && url.pathname.startsWith('/assets/') && source && source.path) {
        const root = fs.realpathSync(path.dirname(source.path)); const file = fs.realpathSync(path.resolve(root, decodeURIComponent(url.pathname.slice(8))));
        const relative = path.relative(root, file);
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Asset outside selected movie folder');
        data = fs.readFileSync(file); mimeType = 'application/octet-stream';
      } else if (url.hostname === 'player' && ['/', '/index.html', '/player.js', '/player.css'].includes(url.pathname)) {
        const name = url.pathname === '/' || url.pathname === '/index.html' ? 'player.html' : url.pathname.slice(1);
        data = fs.readFileSync(path.join(__dirname, name)); mimeType = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
      } else return callback({ statusCode: 404, data: Buffer.from('Not found') });
      callback({ data, mimeType, headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'self' https: http:; connect-src 'self'; img-src 'self' data:", 'Access-Control-Allow-Origin': 'flashnative://player' } });
    } catch (e) { callback({ statusCode: 400, data: Buffer.from(e.message), mimeType: 'text/plain' }); }
  });
}
async function command(action, args) {
  const wc = window.webContents;
  switch (action) {
    case 'navigate': if (!isWeb(args.url)) throw new Error('Only HTTP and HTTPS pages can use native Flash mode.'); source = null; await wc.loadURL(args.url).catch(e => { if (e.code !== 'ERR_ABORTED') throw e; }); break;
    case 'movie': source = args; quality = args.quality === 'low' ? 'low' : 'high'; await wc.loadURL('flashnative://player/index.html'); await applySettings(); break;
    case 'back': if (wc.canGoBack()) wc.goBack(); break;
    case 'forward': if (wc.canGoForward()) wc.goForward(); break;
    case 'reload': wc.reload(); break;
    case 'stop': wc.stop(); break;
    case 'focus': wc.focus(); break;
    case 'visibility': args.value ? window.showInactive() : window.hide(); break;
    case 'mute': wc.setAudioMuted(args.value === undefined ? !wc.isAudioMuted() : !!args.value); break;
    case 'zoom': wc.setZoomFactor(nextZoom(wc.getZoomFactor() * 100, args.direction) / 100); break;
    case 'quality': quality = args.quality === 'low' ? 'low' : 'high'; await applySettings(); break;
    case 'theme': theme = args.theme === 'light' ? 'light' : 'current'; nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'; await applySettings(); break;
    case 'print': wc.print(); break;
    case 'find': if (args.text) wc.findInPage(args.text, { forward: args.forward !== false, findNext: !args.next }); else wc.stopFindInPage('clearSelection'); break;
    case 'clear-data': await session.defaultSession.clearStorageData(); await session.defaultSession.clearCache(); break;
    case 'capture': return (await wc.capturePage()).toPNG().toString('base64');
    case 'evaluate': if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action'); return wc.executeJavaScript(args.code, true);
    case 'test-wheel': if (process.env.FLASHBORN_NATIVE_TEST !== '1') throw new Error('Test-only action'); if (!wc.debugger.isAttached()) wc.debugger.attach('1.3'); await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseWheel', x: args.x || 100, y: args.y || 150, deltaX: 0, deltaY: -args.deltaY, modifiers: 2 }); break;
    case 'close': shuttingDown = true; window.close(); app.quit(); return;
    default: throw new Error('Unsupported native Flash command');
  }
  publish(); return state();
}
app.whenReady().then(async () => {
  await connected;
  registerProtocol();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
  window = new BrowserWindow({ width: 1100, height: 700, frame: false, show: false, skipTaskbar: true, backgroundColor: '#191919',
    webPreferences: { plugins: true, sandbox: true, nodeIntegration: false, contextIsolation: true, enableRemoteModule: false, webSecurity: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') } });
  Menu.setApplicationMenu(null);
  const wc = window.webContents;
  wc.on('new-window', (event, url) => { event.preventDefault(); if (isWeb(url)) send({ type: 'new-tab', url }); });
  wc.on('will-navigate', (event, url) => {
    if (!isWeb(url)) { event.preventDefault(); return; }
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
  wc.on('will-redirect', (event, url) => { if (!isWeb(url)) event.preventDefault(); });
  wc.on('will-attach-webview', event => event.preventDefault());
  for (const name of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','page-title-updated','audio-state-changed']) wc.on(name, publish);
  wc.on('did-start-loading', () => { pluginLoading = false; });
  wc.on('did-finish-load', applySettings);
  const settingsTimer = setInterval(applySettings, 350);
  window.on('closed', () => clearInterval(settingsTimer));
  wc.on('did-fail-load', (_event, code, message, _url, main) => { if (main && code !== -3) send({ type: 'error', message: 'Native Flash page could not load (' + message + ').' }); });
  wc.on('found-in-page', (_event, result) => send({ type: 'find', result }));
  wc.on('enter-html-full-screen', () => send({ type: 'fullscreen', value: true }));
  wc.on('leave-html-full-screen', () => send({ type: 'fullscreen', value: false }));
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (((input.control || input.meta) && ['l','t','w','o','r','f','d','h','j','p','+','=','-','0','tab','1','2','3','4','5','6','7','8','9'].includes(key)) || (input.alt && ['arrowleft','arrowright'].includes(key)) || ['f11','f5','escape'].includes(key)) { event.preventDefault(); send({ type: 'key', input }); }
  });
  wc.on('zoom-changed', (_event, direction) => send({ type: 'zoom-wheel', direction }));
  ipcMain.on('browser:wheel', (event, direction) => { if (event.sender === wc && [-1, 1].includes(direction)) send({ type: 'zoom-wheel', direction: direction === 1 ? 'in' : 'out', source: 'dom' }); });
  ipcMain.on('browser:drop-files', (event, paths) => { if (event.sender === wc && Array.isArray(paths)) send({ type: 'drop-files', paths }); });
  session.defaultSession.on('will-download', (event, item) => { event.preventDefault(); send({ type: item.getMimeType() === 'application/pdf' ? 'open-pdf' : 'download', url: item.getURL() }); });
  ipcMain.handle('player:mute', event => { if (event.sender !== wc || wc.getURL() !== 'flashnative://player/index.html') throw new Error('Untrusted player'); wc.setAudioMuted(!wc.isAudioMuted()); publish(); return wc.isAudioMuted(); });
  const reader = readline.createInterface({ input: channel });
  reader.on('line', async line => { let message; try { message = JSON.parse(line); const value = await command(message.action, message.args || {}); if (message.id) send({ reply: message.id, value }); } catch (e) { if (message && message.id) send({ reply: message.id, error: e.message }); else send({ type: 'error', message: e.message }); } });
  reader.on('close', () => { shuttingDown = true; app.quit(); });
  const handle = window.getNativeWindowHandle();
  send({ type: 'ready', handle: Buffer.from(handle).reverse().toString('hex'), pid:process.pid, electron: process.versions.electron, chromium: process.versions.chrome, flash: '32.0.0.363' });
});
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', e => { send({ type: 'error', message: e.stack || e.message }); if (!window) app.quit(); });
