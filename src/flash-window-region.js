'use strict';
const {intersectRegions}=require('./legacy/window-frame');
let native;
function regionAPI() {
  if (native) return native;
  const koffi = require('koffi'), user = koffi.load('user32.dll'), gdi = koffi.load('gdi32.dll');
  const getRect = user.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)');
  const getRegion = user.func('int __stdcall GetWindowRgn(intptr_t,intptr_t)');
  const create = gdi.func('intptr_t __stdcall CreateRectRgn(int,int,int,int)');
  const contains = gdi.func('int __stdcall PtInRegion(intptr_t,int,int)');
  const remove = gdi.func('int __stdcall DeleteObject(intptr_t)');
  const regionData=gdi.func('uint32_t __stdcall GetRegionData(intptr_t,uint32_t,void*)');
  native = {
    signature(handle){const region=create(0,0,0,0);try{if(!getRegion(handle,region))return 'unshaped';const length=regionData(region,0,null);if(!length||length>1048576)return 'invalid';const data=Buffer.alloc(length);return regionData(region,length,data)?data.toString('base64'):'invalid';}finally{remove(region);}},
    scale:window=>require('electron').screen.getDisplayMatching(window.getBounds()).scaleFactor,
    rect(handle) { const r = [0,0,0,0]; return getRect(handle,r) ? {x:r[0],y:r[1],width:r[2]-r[0],height:r[3]-r[1]} : null; },
    excludes(handle,hole) {
      const region=create(0,0,0,0);
      const inset=Math.min(3,Math.floor(Math.min(hole.width,hole.height)/3));
      try { return !!getRegion(handle,region) && [[hole.x+inset,hole.y+inset],[hole.x+hole.width-1-inset,hole.y+inset],[hole.x+inset,hole.y+hole.height-1-inset],[hole.x+hole.width-1-inset,hole.y+hole.height-1-inset]].every(([x,y]) => !contains(region,x,y)); }
      finally { remove(region); }
    },
    apply(_handle,rects,window) {
      const scale=require('electron').screen.getDisplayMatching(window.getBounds()).scaleFactor;
      // Electron owns its native window region and the associated Chromium
      // frame state. Use its API, keeping rounding on the chrome side of the
      // boundary so a fractional display scale cannot expose desktop pixels.
      window.setShape(rects.map(r => { const x=Math.floor(r.x/scale),y=Math.floor(r.y/scale); return {x,y,width:Math.ceil((r.x+r.width)/scale)-x,height:Math.ceil((r.y+r.height)/scale)-y}; }));
    }
  };
  return native;
}

function shellRegion(bounds,viewport) {
  const width=bounds.width,height=bounds.height;
  const left=Math.max(0,viewport.x-bounds.x),top=Math.max(0,viewport.y-bounds.y);
  const right=Math.min(width,viewport.x+viewport.width-bounds.x),bottom=Math.min(height,viewport.y+viewport.height-bounds.y);
  if (right<=left || bottom<=top) return [];
  const rects=[
    {x:0,y:0,width,height:top},{x:0,y:bottom,width,height:height-bottom},
    {x:0,y:top,width:left,height:bottom-top},{x:right,y:top,width:width-right,height:bottom-top}
  ].filter(r => r.width>0 && r.height>0);
  return rects.length ? rects : [{x:-1,y:-1,width:1,height:1}];
}

class FlashWindowRegion {
  constructor(window,api=regionAPI()) {
    this.window=window; this.api=api; this.key=''; this.viewport=null;
  }
  setFrame(rects) {const key=JSON.stringify(rects);if(key===this.frameKey)return;this.frameKey=key;this.frame=rects;this.update(this.movie);}
  setMoving(value) {
    if (this.moving===value) return;
    this.moving=value;
    if (!value) this.update(this.movie);
  }
  update(movie) {
    this.movie=movie;
    if (this.queued || this.window.isDestroyed()) return;
    // SetWindowRgn dispatches native window messages. Apply after the current
    // activation/resize message has returned, never inside its Chromium stack.
    this.queued=setImmediate(() => { this.queued=null; this.flush(); });
  }
  flush() {
    if (this.window.isDestroyed()) return;
    const movie=this.movie;
    // A caption drag translates the existing region with its HWND. Intersecting
    // it with the asynchronously following movie would resize that cutout on
    // every mouse movement and repeatedly rebuild Windows' resize frame.
    if (this.moving && movie?.hwnd===this.appliedMovie && this.viewport) return;
    const buffer=this.window.getNativeWindowHandle(),handle=buffer.length===8 ? Number(buffer.readBigUInt64LE()) : buffer.readUInt32LE();
    const outer=(movie||this.frame) && this.api.rect(handle),painted=movie && this.api.rect(movie.hwnd);
    let hole=null;
    if (outer && painted) {
      // HWND pixels include the invisible resize borders omitted by DIP bounds.
      const [x,y,width,height]=movie.bounds;
      const left=Math.max(x,painted.x,outer.x),top=Math.max(y,painted.y,outer.y);
      const right=Math.min(x+width,painted.x+painted.width,outer.x+outer.width),bottom=Math.min(y+height,painted.y+painted.height,outer.y+outer.height);
      if (right>left && bottom>top) hole={x:left,y:top,width:right-left,height:bottom-top};
    }
    let rects=hole ? shellRegion(outer,hole) : [];
    if(this.frame){const scale=this.api.scale(this.window),frame=this.frame.map(r=>({x:Math.round(r.x*scale),y:Math.round(r.y*scale),width:Math.round(r.width*scale),height:Math.round(r.height*scale),overlay:!!r.overlay}));rects=hole?[...intersectRegions(frame,rects),...frame.filter(r=>r.overlay)]:frame;}
    const key=JSON.stringify(rects);
    let relative=hole && {...hole,x:hole.x-outer.x,y:hole.y-outer.y};
    if(relative&&this.frame){const pad=40*this.api.scale(this.window),left=Math.max(relative.x,pad),top=Math.max(relative.y,pad),right=Math.min(relative.x+relative.width,outer.width-pad),bottom=Math.min(relative.y+relative.height,outer.height-pad);relative=right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;}
    if (this.key===key && (!this.signature||this.signature===this.api.signature?.(handle)) && (!relative || this.api.excludes(handle,relative))) return;
    this.key=key; this.viewport=hole;
    this.appliedMovie=movie?.hwnd;
    // Cut out only already-painted pixels inside this browser's Flash viewport.
    // Activation cannot paint over the movie or intercept its mouse input. No
    // parent/owner, shared input queue or globally topmost player is needed.
    this.api.apply(handle,rects,this.window);
    this.signature=this.api.signature?.(handle);
  }
}
module.exports={FlashWindowRegion,shellRegion};
