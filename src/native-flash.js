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
    parent: user32.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
    getStyle: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
    setStyle: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
    position: user32.func('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int width, int height, uint32_t flags)'),
    show: user32.func('int __stdcall ShowWindowAsync(intptr_t hwnd, int command)'),
    valid: user32.func('int __stdcall IsWindow(intptr_t hwnd)'),
    visible: user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)'),
    getParent: user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)'),
    rect: user32.func('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ int32_t *rect)'),
    sibling: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t direction)'),
    owner: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)')
  };
  return windows;
}
const directory = name => app.isPackaged ? path.join(process.resourcesPath, name) : path.join(__dirname, '..', 'vendor', name);
const nativeAvailable = () => fs.existsSync(path.join(directory('native-flash'), 'pepflashplayer64.dll')) && fs.existsSync(path.join(directory('native-runtime'), 'FlashRuntime.exe'));

class NativeFlash {
  constructor(host, tabId, onEvent, options = {}) {
    this.private = !!options.private;
    this.host = host; this.tabId = tabId; this.onEvent = onEvent; this.pending = new Map(); this.sequence = 0; this.hwnd = null; this.disposed = false; this.state = {};
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
    this.child.on('error', e => this.rejectReady(e));
    this.child.on('exit', (code, signal) => {
      clearTimeout(this.readyTimer);
      this.hwnd = null;
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Native Flash runtime exited.')); }
      this.pending.clear();
      this.socket?.destroy(); this.server.close();
      // Remove only this helper's generated directory, after its process exits.
      if (path.dirname(path.resolve(this.profile)) === this.profileRoot) fs.promises.rm(this.profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }).catch(() => {});
      if (!this.disposed) { this.rejectReady(new Error(`Native Flash runtime exited (${code ?? signal}). ${this.lastLog || ''}`)); this.onEvent({ type: 'error', message: 'Native Flash stopped. Reload this tab to restart it.' }); }
    });
  }
  receive(message) {
    if (message.type === 'ready') {
      const hwnd = Number(BigInt('0x' + message.handle));
      const api = winAPI(); const pid = [0]; api.owner(hwnd, pid);
      if (!api.valid(hwnd) || pid[0] !== this.child.pid) return this.rejectReady(new Error('Unexpected native Flash window owner.'));
      this.hwnd = hwnd;
      const handle = this.host.getNativeWindowHandle();
      const parent = handle.length === 8 ? Number(handle.readBigUInt64LE()) : handle.readUInt32LE();
      api.show(hwnd, 0);
      let style = Number(api.getStyle(hwnd, -16));
      style = ((style & ~0x80000000 & ~0x00c00000 & ~0x00040000) | 0x40000000 | 0x04000000 | 0x02000000) >>> 0;
      api.setStyle(hwnd, -16, style);
      api.parent(hwnd, parent);
      this.frameStylePending = true;
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
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Native Flash ${action} timed out.`)); }, action === 'navigate' ? 60000 : 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ id, action, args }) + '\n');
    });
  }
  bounds(rect, visible) {
    if (!this.hwnd || !winAPI().valid(this.hwnd)) return;
    const factor = screen.getDisplayMatching(this.host.getBounds()).scaleFactor;
    const pixels = [rect.x, rect.y, rect.width, rect.height].map(n => Math.round(n * factor));
    if (this.frameStylePending || !this.lastBounds || pixels.some((n, i) => n !== this.lastBounds[i])) {
      // Apply the changed WS_CHILD frame once. Repeating FRAMECHANGED or SHOW
      // during a parent move invalidates/restores the legacy Chromium surface.
      const flags = 0x0010 | 0x4000 | (this.frameStylePending ? 0x0020 : 0x0004);
      winAPI().position(this.hwnd, 0, ...pixels, flags);
      this.lastBounds = pixels; this.frameStylePending = false;
    }
    // Win32 visibility alone leaves Electron's compositor in its hidden state.
    if (this.lastVisible !== visible) {
      this.lastVisible = visible;
      winAPI().show(this.hwnd, visible ? 8 : 0); // SW_SHOWNA preserves current bounds.
      this.call('visibility', { value: visible }).catch(() => {});
    }
  }
  focus() { if (this.hwnd) this.call('focus').catch(() => {}); }
  async screenshot() { return this.call('capture'); }
  inspect() {const api=winAPI();const rect=[0,0,0,0];api.rect(this.hwnd,rect);return {hwnd:this.hwnd,parent:api.getParent(this.hwnd),visible:api.visible(this.hwnd),rect,style:api.getStyle(this.hwnd,-16),previous:api.sibling(this.hwnd,3),next:api.sibling(this.hwnd,2),host:this.host.getNativeWindowHandle().readBigUInt64LE().toString()};}
  evaluate(code) { if (process.env.FLASHBORN_TEST !== '1') throw new Error('Evaluation is only available in test launches.'); return this.call('evaluate', { code }); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.readyTimer);
    if (this.hwnd) winAPI().show(this.hwnd, 0);
    if (this.socket?.writable) this.socket.write(JSON.stringify({ action: 'close', args: {} }) + '\n');
    this.server?.close();
    const timer = setTimeout(() => { if (this.child?.exitCode === null) this.child.kill(); this.socket?.destroy(); }, 3000); timer.unref();
  }
}
module.exports = { NativeFlash, nativeAvailable };
