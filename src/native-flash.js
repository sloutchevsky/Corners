'use strict';
const { app, screen } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { parkedBounds } = require('./native-flash-bounds');
let windows;
const viewports = new WeakMap();
function winAPI() {
  if (windows) return windows;
  const user32 = require('koffi').load('user32.dll');
  windows = {
    getStyle: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
    position: user32.func('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int width, int height, uint32_t flags)'),
    show: user32.func('int __stdcall ShowWindowAsync(intptr_t hwnd, int command)'),
    valid: user32.func('int __stdcall IsWindow(intptr_t hwnd)'),
    hung: user32.func('int __stdcall IsHungAppWindow(intptr_t hwnd)'),
    visible: user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)'),
    getParent: user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)'),
    rect: user32.func('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ int32_t *rect)'),
    sibling: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t direction)'),
    owner: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
    foreground: user32.func('intptr_t __stdcall GetForegroundWindow()'),
    child: user32.func('int __stdcall IsChild(intptr_t parent, intptr_t child)'),
    guiInfo: user32.func('int __stdcall GetGUIThreadInfo(uint32_t thread, void *info)'),
    origin: user32.func('int __stdcall ClientToScreen(intptr_t hwnd, _Inout_ int32_t *point)'),
    allowForeground: user32.func('int __stdcall AllowSetForegroundWindow(uint32_t pid)')
  };
  return windows;
}
const directory = name => app.isPackaged ? path.join(process.resourcesPath, name) : path.join(__dirname, '..', 'vendor', name);
const nativeAvailable = () => fs.existsSync(path.join(directory('native-flash'), 'pepflashplayer64.dll')) && fs.existsSync(path.join(directory('native-runtime'), 'CornersNative.exe'));
class NativeFlash {
  constructor(host, tabId, onEvent, options = {}) {
    this.private = !!options.private;
    this.libraryURL = options.libraryURL || '';
    this.host = host; this.tabId = tabId; this.onEvent = onEvent; this.pending = new Map(); this.sequence = 0; this.focusRevision = 0; this.hwnd = null; this.disposed = false; this.stopped = false; this.state = {};
    if (!viewports.has(host)) viewports.set(host, new Set());
    viewports.get(host).add(this);
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.readyTimer = setTimeout(() => this.rejectReady(new Error('Native Flash runtime did not start.')), 30000);
    this.start().catch(e => this.rejectReady(e));
  }
  async start() {
    const executable = path.join(directory('native-runtime'), 'CornersNative.exe');
    const token = crypto.randomBytes(32).toString('hex');
    this.profileRoot = path.resolve(app.getPath('userData'), 'native-flash-profile');
    this.profile = path.join(this.profileRoot, this.tabId + '-' + crypto.randomBytes(8).toString('hex'));
    const channel = '\\\\.\\pipe\\flashborn-' + process.pid + '-' + token;
    this.server = net.createServer(socket => {
      let buffer = '', authenticated = false;
      socket.on('error', () => {});
      socket.on('data', bytes => {
        buffer += bytes.toString();
        if (buffer.length > 24 * 1024 * 1024) return socket.destroy();
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          try {
            const message = JSON.parse(line);
            if (!authenticated) {
              if (message.token !== token || this.socket) return socket.destroy();
              authenticated = true; this.socket = socket; this.server.close();
            } else this.receive(message);
          } catch (e) { console.error('Native Flash message:', e.message); }
        }
      });
    });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(channel, resolve); });
    if (this.disposed) { this.server.close(); return; }
    const env = { ...process.env, FLASHBORN_NATIVE_CHANNEL: channel, FLASHBORN_NATIVE_TOKEN: token, FLASHBORN_NATIVE_PLUGIN: path.join(directory('native-flash'), 'pepflashplayer64.dll'), FLASHBORN_NATIVE_PROFILE: this.profile, FLASHBORN_NATIVE_PRIVATE: this.private ? '1' : '0', FLASHBORN_NATIVE_TEST: process.env.FLASHBORN_TEST || '', FLASHBORN_LIBRARY_URL: this.libraryURL };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    this.child = spawn(executable, [], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.child.stderr.on('data', bytes => { this.lastLog = bytes.toString().slice(-3000); if (process.env.FLASHBORN_TEST) console.error(this.lastLog.trim()); });
    this.child.on('error', e => { this.stopped = true; this.rejectReady(e); });
    this.child.on('exit', (code, signal) => {
      this.stopped = true;
      clearInterval(this.windowTimer);
      clearTimeout(this.opacityTimer); this.readyVisible = false;
      clearTimeout(this.readyTimer);
      this.hwnd = null;
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Native Flash runtime exited.')); }
      this.pending.clear();
      this.socket?.destroy(); this.server.close();
      // Remove only this helper's generated directory, after its process exits.
      if (path.dirname(path.resolve(this.profile)) === this.profileRoot) fs.promises.rm(this.profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }).catch(() => {});
      if (!this.disposed) { this.rejectReady(new Error(`Native Flash runtime exited (${code ?? signal}). ${this.lastLog || ''}`)); this.onEvent({ type: 'error', recreate: true, message: 'Native Flash stopped. Reload this tab to restart it.' }); }
    });
  }
  receive(message) {
    if (message.type === 'ready') {
      const hwnd = Number(BigInt('0x' + message.handle));
      const api = winAPI(); const pid = [0]; api.owner(hwnd, pid);
      if (!api.valid(hwnd) || pid[0] !== this.child.pid) return this.rejectReady(new Error('Unexpected native Flash window owner.'));
      this.hwnd = hwnd;
      // Keep this an UNOWNED top-level window. Both SetParent and assigning an
      // owner implicitly join GUI input queues across processes. A busy Flash
      // thread would then block the modern address bar, menus and Reload too.
      this.windowTimer = setInterval(() => this.syncWindow(), 60);
      this.windowTimer.unref();
      clearTimeout(this.readyTimer);
      this.resolveReady(this);
      this.onEvent({ type: 'ready', electron: message.electron, chromium: message.chromium, flash: message.flash });
    } else if (message.reply) {
      const pending = this.pending.get(message.reply);
      if (pending) { clearTimeout(pending.timer); this.pending.delete(message.reply); message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.value); }
    } else {
      if (message.type === 'state') this.state = message.state;
      this.onEvent(message);
    }
  }
  async call(action, args = {}) {
    await this.ready;
    if (this.disposed) throw new Error('Native Flash tab is closed.');
    if (this.stopped || !this.socket?.writable) throw new Error('Native Flash stopped. Reload this tab to restart it.');
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Native Flash ${action} timed out.`)); }, action === 'navigate' ? 60000 : action === 'snapshot' ? 1500 : 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ id, action, args }) + '\n');
    });
  }
  bounds(rect, visible, { retiring = false, above = null, preparing = false, handoff = false } = {}) {
    if (retiring !== this.retiring) this.retirePlaced = false;
    this.retiring = retiring; this.above = above; this.preparing = preparing; this.handoff = handoff;
    this.viewport = rect; this.wantedVisible = visible;
    this.syncViewportSize();
    this.syncWindow();
    this.syncOpacity();
  }
  syncViewportSize(whileParked = false) {
    if (!this.viewport || this.disposed || this.stopped || !this.wantedVisible || this.hostAnimating && !whileParked) return Promise.resolve();
    if (this.sizingViewport) return whileParked ? this.sizingViewport.then(() => this.syncViewportSize(true)) : this.sizingViewport;
    const size = [Math.max(1, Math.round(this.viewport.width)), Math.max(1, Math.round(this.viewport.height))];
    if (this.viewportSize?.every((value, i) => value === size[i])) return Promise.resolve();
    // Coalesce a busy helper's intermediate sidebar animation sizes. Never
    // replay a backlog of old constraints after the host reaches its final size.
    this.viewportSize = size;
    this.sizingViewport = this.call('viewport-size', { width: size[0], height: size[1] }).catch(() => {}).finally(() => {
      this.sizingViewport = null;
      this.syncViewportSize(); this.syncWindow(); this.syncOpacity();
    });
    return this.sizingViewport;
  }
  async prepareViewport() {
    await this.syncViewportSize(true);
    if (!this.disposed && !this.stopped) await this.call('present');
  }
  syncOpacity() {
    if (!this.hwnd || this.stopped || this.host.isDestroyed() || !this.readyVisible || !this.wantedVisible || this.disposed) return;
    // Never change WS_EX_LAYERED/alpha for a tab handoff. The incoming opaque
    // compositor paints behind the outgoing page before their order changes.
    if (this.preparing || this.presentedOpacity === 1) return;
    const anchor = this.above && winAPI().valid(this.above) ? this.above : this.hostHandle();
    const inPlace = this.handoff || this.above ? this.nextLayer(anchor, 2, this.hwnd) === this.hwnd : this.nextLayer(this.hwnd, 2, anchor) === anchor;
    const actual = [0, 0, 0, 0]; winAPI().rect(this.hwnd, actual);
    const pixels = [actual[0], actual[1], actual[2] - actual[0], actual[3] - actual[1]];
    if (!winAPI().visible(this.hwnd) || !inPlace || !this.lastBounds?.every((n, i) => n === pixels[i])) {
      if (!this.opacityTimer) this.opacityTimer = setTimeout(() => { this.opacityTimer = null; this.syncWindow(); this.syncOpacity(); }, 8);
      return;
    }
    this.sentOpacity = this.presentedOpacity = 1;
    this.onEvent({ type: 'presented' });
  }
  async present() {
    await this.ready;
    const until = Date.now() + 1500;
    while (!this.disposed && !this.stopped && Date.now() < until) {
      const rect = [0, 0, 0, 0]; winAPI().rect(this.hwnd, rect);
      const pixels = [rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]];
      if (this.readyVisible && this.lastBounds?.every((n, i) => n === pixels[i])) return this.call('present');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Flash frame preparation was superseded or timed out.');
  }
  hostHandle() {
    const handle = this.host.getNativeWindowHandle();
    return handle.length === 8 ? Number(handle.readBigUInt64LE()) : handle.readUInt32LE();
  }
  nextLayer(handle, direction, anchor) {
    const api = winAPI();
    // Hidden HWNDs and other movies in this browser are not stacking barriers.
    // Treating the outgoing movie as one can put it back above its replacement.
    const siblings = [...viewports.get(this.host) || []].map(view => view.hwnd).filter(hwnd => hwnd && hwnd !== anchor);
    let next = api.sibling(handle, direction);
    for (let i = 0; next && i < 1024 && (!api.visible(next) || siblings.includes(next)); i++) next = api.sibling(next, direction);
    return next;
  }
  raiseHostBehindFlash() {
    if (!this.hwnd || this.disposed || this.host.isDestroyed() || !this.wantedVisible || this.preparing || this.retiring || this.handoff || this.above || !this.readyVisible) return false;
    const api = winAPI(), foreground = api.foreground(), pid = [0];
    if (!foreground || !api.visible(this.hwnd)) return false;
    api.owner(foreground, pid);
    if (pid[0] !== this.child.pid && pid[0] !== process.pid) return false;
    if (this.nextLayer(this.hwnd, 2, this.hostHandle()) !== this.hostHandle()) {
      const host = this.hostHandle(), flags = 0x0001 | 0x0002 | 0x0010 | 0x0200 | 0x4000;
      if (pid[0] === process.pid && this.nextLayer(host, 2, this.hwnd) !== this.hwnd) {
        let below = api.sibling(host, 2);
        for (let i = 0; below && below !== this.hwnd && i < 1024; i++) below = api.sibling(below, 2);
        if (below === this.hwnd) {
          // If another app was between the pair before the frame activated,
          // first move the movie just behind our frame. Wait for that async
          // move before swapping the pair, preserving the frame's stack slot.
          api.position(this.hwnd, host, 0, 0, 0, 0, flags);
          return true;
        }
      }
      // Activating the address bar or a menu can raise the opaque shell over
      // its independent movie. Windows may accept a cross-process raise of
      // that movie without actually changing its Z-order. Move our own shell
      // behind the already visible movie instead, for either foreground
      // process in this browser. This also handles PPAPI activation before DOM
      // input arrives, without changing focus, visibility or mouse capture.
      api.position(host, this.hwnd, 0, 0, 0, 0, flags);
      return true;
    }
    return false;
  }
  syncWindow() {
    if (!this.hwnd || this.disposed || this.host.isDestroyed() || !this.viewport) return;
    const api = winAPI();
    if (!api.valid(this.hwnd)) return;
    const host = this.hostHandle(), foreground = api.foreground(), pid = [0];
    if (foreground) api.owner(foreground, pid);
    const ownGroup = pid[0] === process.pid || pid[0] === this.child.pid;
    const visible = !!this.wantedVisible && this.host.isVisible() && !this.host.isMinimized() && !this.hostAnimating;
    if (visible && this.readyVisible && this.presentedOpacity === 1) this.onEvent({ type: 'surface' });
    if (visible && !this.retiring && !this.preparing && this.raiseHostBehindFlash()) return;
    const actualTopmost = !!(api.getStyle(this.hwnd, -20) & 8);
    if (visible && !ownGroup && !this.host.isAlwaysOnTop()) this.backgrounded = true;
    // A hung UI thread cannot process asynchronous hide/demote requests. Do
    // not leave its viewport floating over another app after switching away.
    if ((!visible || actualTopmost) && api.hung(this.hwnd)) {
      this.child.kill(); return;
    }
    {
      // ClientToScreen supplies physical coordinates, including negative monitor
      // origins. Only the viewport dimensions/offsets need DIP conversion.
      const origin = [0, 0]; api.origin(host, origin);
      const factor = screen.getDisplayMatching(this.host.getBounds()).scaleFactor;
      const r = this.viewport;
      const actual = [0, 0, 0, 0]; api.rect(this.hwnd, actual);
      const measured = [actual[0], actual[1], actual[2] - actual[0], actual[3] - actual[1]];
      const left = origin[0] + Math.round(r.x * factor), top = origin[1] + Math.round(r.y * factor);
      let pixels = [left, top, origin[0] + Math.round((r.x + r.width) * factor) - left, origin[1] + Math.round((r.y + r.height) * factor) - top];
      if (!visible) {
        // Keep the compositor mapped and opaque outside the virtual desktop.
        // Moving a prepared surface back into its viewport needs no show,
        // hide, alpha or input-style transition, all of which can blink.
        const displays = screen.getAllDisplays().map(d => ({ bounds: screen.dipToScreenRect(null, d.bounds), scaleFactor: d.scaleFactor }));
        pixels = parkedBounds(displays, measured, this.viewportSize);
      }
      // Moving between an offscreen parking position and a scaled display can
      // deliver WM_DPICHANGED after our asynchronous SetWindowPos. Repair the
      // actual HWND bounds, not only the last rectangle we requested.
      const changed = !this.lastBounds || pixels.some((n, i) => n !== this.lastBounds[i] || n !== measured[i]);
      const anchor = this.above && api.valid(this.above) ? this.above : host;
      const behind = this.preparing || this.handoff || !!this.above;
      const inPlace = behind ? this.nextLayer(anchor, 2, this.hwnd) === this.hwnd : this.nextLayer(this.hwnd, 2, anchor) === anchor;
      const orderChanged = visible && (!this.retiring || !this.retirePlaced) && !inPlace;
      const unplaced = this.lastVisible === undefined;
      if (changed || actualTopmost || orderChanged || unplaced) {
        // Follow the shell's existing place in the normal Z-order. Never use
        // HWND_TOPMOST: it floats Flash above unrelated applications. Browser
        // popups naturally remain above this ordinary viewport window.
        if (actualTopmost) api.position(this.hwnd, -2, ...pixels, 0x0010 | 0x4000);
        const previous = behind ? anchor : this.nextLayer(anchor, 3, anchor);
        const after = previous && !(api.getStyle(previous, -20) & 8) ? previous : 0;
        // Asynchronous positioning never waits for the legacy message pump.
        api.position(this.hwnd, after, ...pixels, 0x0010 | 0x4000 | (!visible ? 0x0001 : 0) | (actualTopmost || orderChanged || unplaced ? 0 : 0x0004));
        this.lastBounds = pixels;
        if (this.retiring) this.retirePlaced = true;
      }
      this.lastTopmost = false;
    }
    if (this.lastVisible !== visible) {
      this.lastVisible = visible;
      this.readyVisible = false; this.sentOpacity = this.presentedOpacity = 0;
      const revision = this.visibilityRevision = (this.visibilityRevision || 0) + 1;
      // The helper was mapped offscreen before announcing readiness. The
      // command only changes timer throttling; native visibility never churns.
      this.call('visibility', { value: visible }).then(() => {
        if (revision !== this.visibilityRevision || this.disposed) return;
        this.readyVisible = visible;
        this.syncWindow(); this.syncOpacity();
      }).catch(() => {});
    }
  }
  isPresented() { return !!this.hwnd && this.presentedOpacity === 1 && !!winAPI().visible(this.hwnd); }
  focus() {
    if (!this.hwnd || !this.lastVisible || this.preparing || this.retiring || this.disposed || this.stopped || this.hostMoving) return;
    if (this.host.getChildWindows().some(popup => !popup.browserCorner && !popup.isDestroyed() && popup.isVisible())) return;
    const api = winAPI();
    if (api.foreground() !== this.hostHandle()) return;
    const hostInfo = Buffer.alloc(72); hostInfo.writeUInt32LE(72);
    if (api.guiInfo(api.owner(this.hostHandle(), [0]), hostInfo) && (hostInfo.readUInt32LE(4) & 2 || hostInfo.readBigUInt64LE(24))) return;
    const input = this.inputState();
    if (input?.capture || input?.moving) return;
    // A resize/tab restore must not pull focus out of the existing plugin or
    // RenderWidgetHost. Chromium can still report focused after such a pull.
    if (input?.focus && (input.focus === this.hwnd || api.child(this.hwnd, input.focus))) return;
    api.allowForeground(this.child.pid);
    this.call('focus', { epoch: ++this.focusRevision, before: Date.now() + 250 }).catch(() => {});
  }
  contentPointer() {
    // A real pointer event has already reached Flash. Invalidate any queued
    // toolbar handoff without changing focus or capture after mouse-down.
    this.call('focus-host', { epoch: ++this.focusRevision }).catch(() => {});
    this.backgrounded = false;
    this.raiseHostBehindFlash();
  }
  inputState() {
    if (!this.hwnd || !winAPI().valid(this.hwnd)) return null;
    const api = winAPI(), info = Buffer.alloc(72); info.writeUInt32LE(72);
    if (!api.guiInfo(api.owner(this.hwnd, [0]), info)) return null;
    return { focus: Number(info.readBigUInt64LE(16)), capture: Number(info.readBigUInt64LE(24)), moving: !!(info.readUInt32LE(4) & 2) };
  }
  focusHost() {
    ++this.focusRevision;
    if (this.disposed || this.host.isDestroyed()) return;
    // Focus only our own process. Never wait for a legacy focus acknowledgement.
    if (!this.host.isFocused()) this.host.focus();
    if (!this.host.webContents.isFocused()) this.host.webContents.focus();
  }
  async screenshot() { if (process.env.FLASHBORN_TEST !== '1') throw new Error('Test-only capture'); return this.call('capture'); }
  inspect() {const api=winAPI();const rect=[0,0,0,0];api.rect(this.hwnd,rect);return {hwnd:this.hwnd,parent:api.getParent(this.hwnd),visible:api.visible(this.hwnd),rect,style:api.getStyle(this.hwnd,-16),previous:api.sibling(this.hwnd,3),next:api.sibling(this.hwnd,2),host:this.host.getNativeWindowHandle().readBigUInt64LE().toString()};}
  evaluate(code) { if (process.env.FLASHBORN_TEST !== '1') throw new Error('Evaluation is only available in test launches.'); return this.call('evaluate', { code }); }
  dispose(force = false) {
    if (this.disposed) return;
    this.disposed = true;
    viewports.get(this.host)?.delete(this);
    clearTimeout(this.readyTimer);
    clearTimeout(this.opacityTimer);
    clearInterval(this.windowTimer);
    if (this.hwnd) winAPI().show(this.hwnd, 0);
    if (this.socket?.writable) this.socket.write(JSON.stringify({ action: 'close', args: {} }) + '\n');
    this.server?.close();
    if (force && this.child?.exitCode === null) this.child.kill();
    const timer = setTimeout(() => { if (this.child?.exitCode === null) this.child.kill(); this.socket?.destroy(); }, 3000); timer.unref();
  }
}
module.exports = { NativeFlash, nativeAvailable };
