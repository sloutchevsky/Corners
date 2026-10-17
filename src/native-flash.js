'use strict';
const { app, screen } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
let windows;
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
const nativeAvailable = () => fs.existsSync(path.join(directory('native-flash'), 'pepflashplayer64.dll')) && fs.existsSync(path.join(directory('native-runtime'), 'FlashRuntime.exe'));
function isAbove(api, upper, lower) {
  // Reading z-order never calls either window's message handler. Activation or
  // moveTop can raise the shell without changing the foreground HWND.
  for (let hwnd = upper, count = 0; hwnd && count < 512; count++, hwnd = api.sibling(hwnd, 2)) if (hwnd === lower) return true;
  return false;
}

class NativeFlash {
  constructor(host, tabId, onEvent, options = {}) {
    this.private = !!options.private;
    this.host = host; this.tabId = tabId; this.onEvent = onEvent; this.pending = new Map(); this.sequence = 0; this.focusRevision = 0; this.hwnd = null; this.disposed = false; this.stopped = false; this.state = {};
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.readyTimer = setTimeout(() => this.rejectReady(new Error('Native Flash runtime did not start.')), 30000);
    this.start().catch(e => this.rejectReady(e));
  }
  async start() {
    const executable = path.join(directory('native-runtime'), 'FlashRuntime.exe');
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
    const env = { ...process.env, FLASHBORN_NATIVE_CHANNEL: channel, FLASHBORN_NATIVE_TOKEN: token, FLASHBORN_NATIVE_PLUGIN: path.join(directory('native-flash'), 'pepflashplayer64.dll'), FLASHBORN_NATIVE_PROFILE: this.profile, FLASHBORN_NATIVE_PRIVATE: this.private ? '1' : '0', FLASHBORN_NATIVE_TEST: process.env.FLASHBORN_TEST || '' };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    this.child = spawn(executable, [], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.child.stderr.on('data', bytes => { this.lastLog = bytes.toString().slice(-3000); if (process.env.FLASHBORN_TEST) console.error(this.lastLog.trim()); });
    this.child.on('error', e => { this.stopped = true; this.rejectReady(e); });
    this.child.on('exit', (code, signal) => {
      this.stopped = true;
      clearInterval(this.windowTimer);
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
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Native Flash ${action} timed out.`)); }, action === 'navigate' ? 60000 : 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ id, action, args }) + '\n');
    });
  }
  bounds(rect, visible) {
    this.viewport = rect; this.wantedVisible = visible;
    this.syncWindow();
  }
  hostHandle() {
    const handle = this.host.getNativeWindowHandle();
    return handle.length === 8 ? Number(handle.readBigUInt64LE()) : handle.readUInt32LE();
  }
  syncWindow() {
    if (!this.hwnd || this.disposed || this.host.isDestroyed() || !this.viewport) return;
    const api = winAPI();
    if (!api.valid(this.hwnd)) return;
    const host = this.hostHandle(), foreground = api.foreground(), pid = [0];
    if (foreground) api.owner(foreground, pid);
    const ownGroup = pid[0] === process.pid || pid[0] === this.child.pid;
    const visible = !!this.wantedVisible && this.host.isVisible() && !this.host.isMinimized();
    const topmost = visible && (ownGroup || this.host.isAlwaysOnTop());
    const actualTopmost = !!(api.getStyle(this.hwnd, -20) & 8);
    if (visible && !ownGroup && !this.host.isAlwaysOnTop()) this.backgrounded = true;
    // A hung UI thread cannot process asynchronous hide/demote requests. Do
    // not leave its viewport floating over another app after switching away.
    if ((!visible || actualTopmost && !topmost) && api.hung(this.hwnd)) {
      this.child.kill(); return;
    }
    if (!this.wantedVisible && this.lastVisible === false) return;
    {
      // ClientToScreen supplies physical coordinates, including negative monitor
      // origins. Only the viewport dimensions/offsets need DIP conversion.
      const origin = [0, 0]; api.origin(host, origin);
      const factor = screen.getDisplayMatching(this.host.getBounds()).scaleFactor;
      const r = this.viewport;
      const pixels = [origin[0] + Math.round(r.x * factor), origin[1] + Math.round(r.y * factor), Math.round(r.width * factor), Math.round(r.height * factor)];
      const changed = !this.lastBounds || pixels.some((n, i) => n !== this.lastBounds[i]);
      const raise = topmost && (!this.lastVisible || !isAbove(api, this.hwnd, host));
      // A separate application's normal HWND can remain below the foreground
      // shell despite HWND_TOP requests. Keep the active viewport topmost only
      // while our browser group is active, and place it below browser popups.
      const zChanged = actualTopmost !== topmost;
      const popup = topmost && this.host.getChildWindows().find(w => !w.isDestroyed() && w.isVisible() && w.isAlwaysOnTop());
      const popupHandle = popup ? Number(popup.getNativeWindowHandle().readBigUInt64LE()) : 0;
      const popupChanged = popupHandle !== this.lastPopup;
      const backgroundOrderChanged = visible && !topmost && api.sibling(this.hwnd, 2) !== host;
      if (changed || raise || zChanged || popupChanged || backgroundOrderChanged) {
        let after = popupHandle || (topmost ? -1 : -2);
        if (visible && !topmost) {
          // Stay directly above the shell in the ordinary window stack. A
          // foreign foreground window stays above both, while uncovered Flash
          // remains visible. Never attach the processes' GUI input queues.
          let previous = api.sibling(host, 3);
          if (previous === this.hwnd) previous = api.sibling(this.hwnd, 3);
          if (previous && !(api.getStyle(previous, -20) & 8)) after = previous;
          else {
            if (actualTopmost) api.position(this.hwnd, -2, ...pixels, 0x0010 | 0x4000);
            after = 0;
          }
        }
        // Asynchronous positioning never waits for the legacy message pump.
        api.position(this.hwnd, after, ...pixels, 0x0010 | 0x4000 | (raise || zChanged || popupChanged || backgroundOrderChanged ? 0 : 0x0004));
        this.lastBounds = pixels;
      }
      this.lastTopmost = topmost; this.lastPopup = popupHandle;
    }
    if (this.lastVisible !== visible) {
      this.lastVisible = visible;
      api.show(this.hwnd, visible ? 8 : 0);
      this.call('visibility', { value: visible }).catch(() => {});
    }
  }
  focus() {
    if (!this.hwnd || !this.lastVisible || this.disposed || this.stopped || this.hostMoving) return;
    if (this.host.getChildWindows().some(popup => !popup.isDestroyed() && popup.isVisible())) return;
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
    if (this.backgrounded && !this.host.isDestroyed()) {
      this.backgrounded = false;
      this.host.moveTop();
      this.syncWindow();
    }
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
    this.host.focus(); this.host.webContents.focus();
  }
  async screenshot() { if (process.env.FLASHBORN_TEST !== '1') throw new Error('Test-only capture'); return this.call('capture'); }
  inspect() {const api=winAPI();const rect=[0,0,0,0];api.rect(this.hwnd,rect);return {hwnd:this.hwnd,parent:api.getParent(this.hwnd),visible:api.visible(this.hwnd),rect,style:api.getStyle(this.hwnd,-16),previous:api.sibling(this.hwnd,3),next:api.sibling(this.hwnd,2),host:this.host.getNativeWindowHandle().readBigUInt64LE().toString()};}
  evaluate(code) { if (process.env.FLASHBORN_TEST !== '1') throw new Error('Evaluation is only available in test launches.'); return this.call('evaluate', { code }); }
  dispose(force = false) {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.readyTimer);
    clearInterval(this.windowTimer);
    if (this.hwnd) winAPI().show(this.hwnd, 0);
    if (this.socket?.writable) this.socket.write(JSON.stringify({ action: 'close', args: {} }) + '\n');
    this.server?.close();
    if (force && this.child?.exitCode === null) this.child.kill();
    const timer = setTimeout(() => { if (this.child?.exitCode === null) this.child.kill(); this.socket?.destroy(); }, 3000); timer.unref();
  }
}
module.exports = { NativeFlash, nativeAvailable };
