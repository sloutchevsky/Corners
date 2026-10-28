'use strict';
const {FRAME}=require('./legacy/window-frame');

// A transparent native popup stays above Flash. Its content slides through the
// popup viewport; the mask never moves above the bottom of the top frame.
function menuFrame(host, popup, top, scale, progress) {
  const hidden = Math.round(popup.height * (1 - progress));
  return {
    x: host.x + host.width - popup.width,
    y: host.y + Math.round(top * scale),
    width: popup.width, height: popup.height,
    hidden, visible: popup.height - hidden
  };
}

function nativeAPI(host, popup) {
  const k = require('koffi'), user = k.load('user32.dll'), dwm = k.load('dwmapi.dll');
  const origin = user.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)');
  const client = user.func('int __stdcall GetClientRect(intptr_t,_Out_ int32_t*)');
  const rect = user.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)');
  const position = user.func('int __stdcall SetWindowPos(intptr_t,intptr_t,int,int,int,int,uint32_t)');
  const attribute = dwm.func('int __stdcall DwmSetWindowAttribute(intptr_t,uint32_t,_In_ uint32_t*,uint32_t)');
  const handle = window => Number(window.getNativeWindowHandle().readBigUInt64LE());
  const parent = handle(host), window = handle(popup);
  attribute(window, 2, [1], 4); // No nonclient border or shadow.
  attribute(window, 3, [1], 4); // Disable the Windows popup fade.
  attribute(window, 33, [1], 4); // Square native corners.
  return {
    animate(target,duration) {
      attribute(window, 3, [1], 4);
      return popup.webContents.executeJavaScript(`window.animateMenu(${target},${duration})`);
    },
    geometry() {
      const p = [0, 0], area = [0, 0, 0, 0], r = [0, 0, 0, 0];
      if (!origin(parent, p) || !client(parent, area) || !rect(window, r)) return null;
      return { host: { x:p[0], y:p[1], width:(require('./window-edge').frame(host).x+require('./window-edge').frame(host).width-FRAME)*require('electron').screen.getDisplayMatching(host.getBounds()).scaleFactor, height:area[3] }, popup: { width:r[2]-r[0], height:r[3]-r[1] },
        scale:require('electron').screen.getDisplayMatching(host.getBounds()).scaleFactor };
    },
    apply(frame) {
      position(window, 0, frame.x, frame.y, 0, 0, 0x15); // No activation, resize or z-order change.
    }
  };
}

class MenuMotion {
  constructor(host, popup, { top=100, duration=190, reduced=false, api=nativeAPI(host,popup),
    now=()=>performance.now(), schedule=setTimeout, cancel=clearTimeout }={}) {
    Object.assign(this, { host, popup, top, duration:reduced ? 0 : duration, api, now, schedule, cancel });
    this.progress = 0;
    this.target = 0;
    this.align();
  }
  align() {
    if (this.disposed || this.host.isDestroyed() || this.popup.isDestroyed()) return;
    const geometry = this.api.geometry();
    if (geometry) {
      this.hostSize ||= {width:geometry.host.width,height:geometry.host.height};
      this.api.apply(menuFrame(geometry.host,geometry.popup,this.top,geometry.scale,this.progress));
    }
  }
  sizeChanged() {
    const size = this.api.geometry()?.host;
    // setPosition can round a fractional-DPI client size by two physical pixels
    // and emit resize. That is still a move, not a reason to dismiss the menu.
    return !!size && (Math.abs(size.width-this.hostSize.width)>2 || Math.abs(size.height-this.hostSize.height)>2);
  }
  animate(target, complete=()=>{}) {
    this.cancel(this.timer);
    if (this.disposed) return;
    const start = this.progress, began = this.now(), duration = this.duration * Math.abs(target-start);
    const revision = this.revision = (this.revision || 0) + 1;
    const painted = this.api.animate?.(target,duration)?.catch(()=>{});
    this.target = target;
    const tick = () => {
      if (this.disposed) return;
      const elapsed = duration ? Math.min(1,(this.now()-began)/duration) : 1;
      this.progress = start + (target-start) * (1-Math.pow(1-elapsed,3));
      this.align();
      if (elapsed < 1) this.timer = this.schedule(tick,16);
      else {
        this.timer = null;
        const finish = () => { if (!this.disposed && revision === this.revision) complete(); };
        // Let Chromium unwind the animation's script result before a closing
        // callback destroys its WebContents/native popup.
        if (painted) painted.then(()=>{if(!this.disposed && revision===this.revision)this.timer=this.schedule(()=>{this.timer=null;finish();},0);});
        else finish();
      }
    };
    tick();
  }
  dispose() { this.disposed=true; this.cancel(this.timer); this.timer=null; }
}
module.exports = { MenuMotion, menuFrame };
