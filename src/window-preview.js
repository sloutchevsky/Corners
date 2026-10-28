'use strict';

// DWM previews are separate from the live window stack. Compose the shell and
// its independent movie only for Windows' switcher/taskbar, entirely in RAM.
function compositePreview(shell, movie, rect) {
  const data = Buffer.from(shell.data);
  const left = Math.max(0, rect.x), top = Math.max(0, rect.y);
  const right = Math.min(shell.width, rect.x + movie.width), bottom = Math.min(shell.height, rect.y + movie.height);
  if (right <= left || bottom <= top) return { width: shell.width, height: shell.height, data };
  for (let y = top; y < bottom; y++) {
    const start = ((y - rect.y) * movie.width + left - rect.x) * 4;
    movie.data.copy(data, (y * shell.width + left) * 4, start, start + Math.max(0, right - left) * 4);
  }
  return { width: shell.width, height: shell.height, data };
}

function previewAPI(window) {
  const koffi = require('koffi'), dwm = koffi.load('dwmapi.dll'), gdi = koffi.load('gdi32.dll'), user = koffi.load('user32.dll'), crt = koffi.load('msvcrt.dll');
  const attribute = dwm.func('int __stdcall DwmSetWindowAttribute(intptr_t,uint32_t,void*,uint32_t)');
  const invalidate = dwm.func('int __stdcall DwmInvalidateIconicBitmaps(intptr_t)');
  const thumbnail = dwm.func('int __stdcall DwmSetIconicThumbnail(intptr_t,intptr_t,uint32_t)');
  const live = dwm.func('int __stdcall DwmSetIconicLivePreviewBitmap(intptr_t,intptr_t,void*,uint32_t)');
  const create = gdi.func('intptr_t __stdcall CreateDIBSection(intptr_t,void*,uint32_t,_Out_ void**,intptr_t,uint32_t)');
  const remove = gdi.func('int __stdcall DeleteObject(intptr_t)');
  const copy = crt.func('void* __cdecl memcpy(void*,const void*,size_t)');
  const rect = user.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'), client = user.func('int __stdcall GetClientRect(intptr_t,_Out_ int32_t*)'), origin = user.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)');
  const handle = Number(window.getNativeWindowHandle().readBigUInt64LE());
  const results = {};
  function bitmap(image, publish) {
    const header = Buffer.alloc(40); header.writeUInt32LE(40); header.writeInt32LE(image.width, 4); header.writeInt32LE(-image.height, 8); header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
    const bits = [null], object = create(0, header, 0, bits, 0, 0);
    if (!object || !bits[0]) return false;
    try { copy(bits[0], image.data, image.data.length); return publish(object) === 0; }
    finally { remove(object); }
  }
  return {
    results,
    enable(value) {
      const flag = Buffer.alloc(4); flag.writeInt32LE(value ? 1 : 0);
      results.force = attribute(handle, 7, flag, 4); results.bitmap = attribute(handle, 10, flag, 4);
    },
    invalidate() { invalidate(handle); },
    thumbnail(image, width, height) {
      const scale = Math.min(1, width / image.width, height / image.height);
      const resized = require('electron').nativeImage.createFromBitmap(image.data, { width: image.width, height: image.height }).resize({ width: Math.max(1, Math.floor(image.width * scale)), height: Math.max(1, Math.floor(image.height * scale)), quality: 'best' });
      return bitmap({ ...resized.getSize(), data: resized.toBitmap() }, object => (results.thumbnail = thumbnail(handle, object, 0)));
    },
    live(image) {
      const bounds = [0,0,0,0], point = [0,0], content = [0,0,0,0]; rect(handle, bounds); origin(handle, point); client(handle, content);
      const offset = Buffer.alloc(8); offset.writeInt32LE(point[0] - bounds[0]); offset.writeInt32LE(point[1] - bounds[1], 4);
      const cropped = require('electron').nativeImage.createFromBitmap(image.data, { width: image.width, height: image.height }).crop({ x:0,y:0,width:Math.min(image.width,content[2]),height:Math.min(image.height,content[3]) });
      return bitmap({ ...cropped.getSize(),data:cropped.toBitmap() }, object => (results.live = live(handle, object, offset, 0)));
    }
  };
}

class WindowPreview {
  constructor(window, capture, { api = previewAPI(window), now = Date.now, maxAge = 1000 } = {}) {
    this.window = window; this.capture = capture; this.api = api; this.now = now; this.maxAge = maxAge;
    this.key = null; this.generation = 0; this.image = null; this.capturedAt = 0; this.requests = {}; this.stats = { captures: 0, thumbnails: 0, live: 0 };
    this.onThumbnail = (_wParam, lParam) => {
      const size = lParam.readUInt32LE(); this.requests.thumbnail = { width: size >>> 16, height: size & 0xffff }; this.reply();
    };
    this.onLive = () => { this.requests.live = true; this.reply(); };
    window.hookWindowMessage(0x0323, this.onThumbnail);
    window.hookWindowMessage(0x0326, this.onLive);
  }
  update(key) {
    if (key !== this.key) {
      this.key = key; this.generation++; this.image = null; this.capturedAt = 0; this.requests = {};
      clearImmediate(this.enableQueued);
      this.enableQueued = setImmediate(() => { this.enableQueued = null; if (!this.window.isDestroyed()) this.api.enable(!!this.key); });
    }
    this.refresh();
  }
  refresh() {
    if (!this.key || this.pending || this.window.isDestroyed() || this.window.isMinimized() || !this.window.isVisible() || this.image && this.now() - this.capturedAt < this.maxAge) return;
    const generation = this.generation;
    this.stats.captures++;
    this.pending = Promise.resolve().then(() => this.capture()).then(image => {
      if (generation !== this.generation || !this.key || this.window.isDestroyed() || !image) return;
      this.image = image; this.capturedAt = this.now();
      this.api.invalidate(); this.reply(false);
    }).catch(() => {}).finally(() => { this.pending = null; });
  }
  reply(refresh = true) {
    if (this.replyQueued) return;
    this.replyQueued = setImmediate(() => {
      this.replyQueued = null;
      if (!this.key || this.window.isDestroyed()) return;
      if (this.image) {
        const { thumbnail, live } = this.requests; this.requests = {};
        if (thumbnail?.width > 0 && thumbnail.height > 0 && this.api.thumbnail(this.image, thumbnail.width, thumbnail.height)) this.stats.thumbnails++;
        if (live && this.api.live(this.image)) this.stats.live++;
      }
      if (refresh) this.refresh();
    });
  }
  dispose() {
    this.key = null; this.generation++; this.image = null;
    clearImmediate(this.enableQueued); clearImmediate(this.replyQueued);
    if (!this.window.isDestroyed()) {
      this.window.unhookWindowMessage(0x0323); this.window.unhookWindowMessage(0x0326); this.api.enable(false);
    }
  }
}
module.exports = { WindowPreview, compositePreview };
