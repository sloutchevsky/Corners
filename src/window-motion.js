'use strict';
function proportionalCrop(width,height,destinationWidth,destinationHeight) {
  const factor=Math.max(destinationWidth/width,destinationHeight/height);
  const w=destinationWidth/factor,h=destinationHeight/factor;
  return {left:(width-w)/2,top:(height-h)/2,right:(width+w)/2,bottom:(height+h)/2};
}
function pixelExactCrop(width,height,destinationWidth,destinationHeight) {
  return {left:0,top:0,right:Math.min(width,destinationWidth),bottom:Math.min(height,destinationHeight)};
}
// The compositor backing belongs to the browser's own visual. Windows can
// transform it with the browser while the independent input HWND is parked.
// Normal Flash/menu ordering and independent input queues remain unchanged.
function motionAPI(window) {
  const koffi=require('koffi'),dwm=koffi.load('dwmapi.dll'),user=koffi.load('user32.dll');
  const register=dwm.func('int __stdcall DwmRegisterThumbnail(intptr_t,intptr_t,_Out_ intptr_t*)');
  const update=dwm.func('int __stdcall DwmUpdateThumbnailProperties(intptr_t,void*)');
  const unregister=dwm.func('int __stdcall DwmUnregisterThumbnail(intptr_t)');
  const sourceSize=dwm.func('int __stdcall DwmQueryThumbnailSourceSize(intptr_t,_Out_ int32_t*)');
  const clientRect=user.func('int __stdcall GetClientRect(intptr_t,_Out_ int32_t*)');
  const attribute=dwm.func('int __stdcall DwmSetWindowAttribute(intptr_t,uint32_t,_In_ uint32_t*,uint32_t)');
  const sources=new Map();
  const destination=Number(window.getNativeWindowHandle().readBigUInt64LE());
  const styleChange=koffi.struct('FlashbornFrameStyle',{previous:'uint32_t',next:'uint32_t'});
  window.hookWindowMessage(0x007c,(wParam,lParam)=>{
    if(wParam.readInt32LE()!==-16)return;
    const pointer=koffi.decode(lParam,'void*'),value=koffi.decode(pointer,styleChange);
    if(value.next&0x40000){value.next&=~0x40000;koffi.encode(pointer,styleChange,value);}
  });
  // Keep native minimize/maximize animations available without WS_THICKFRAME.
  // Electron's frameless client covers the complete HWND, so this capability
  // flag creates no caption area or extra side/bottom geometry.
  const getStyle=user.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t,int)');
  const setStyle=user.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t,int,intptr_t)');
  const position=user.func('int __stdcall SetWindowPos(intptr_t,intptr_t,int,int,int,int,uint32_t)');
  setStyle(destination,-16,(getStyle(destination,-16)|0xc00000)&~0x40000);
  position(destination,0,0,0,0,0,0x0237);
  window.setHasShadow(false);
  const framePolicy=attribute(destination,2,[1],4); // DWMNCRP_DISABLED: no painted frame or shadow.
  return {
    framePolicy,
    register(source) { const id=[0]; if(register(destination,source,id)!==0)return 0;sources.set(id[0],source);return id[0]; },
    update(id,rect,sourceLimit,proportional=false,pixelExact=false) {
      const scale=require('electron').screen.getDisplayMatching(window.getBounds()).scaleFactor;
      const properties=Buffer.alloc(48);properties.writeUInt32LE(1|4|8|16);
      properties.writeInt32LE(Math.round(rect.x*scale),4);properties.writeInt32LE(Math.round(rect.y*scale),8);
      properties.writeInt32LE(Math.round((rect.x+rect.width)*scale),12);properties.writeInt32LE(Math.round((rect.y+rect.height)*scale),16);
      const size=[0,0];
      if(sourceSize(id,size)===0){
        const client=[0,0,0,0];
        if(clientRect(sources.get(id),client)){size[0]=Math.min(size[0],client[2]);size[1]=Math.min(size[1],client[3]);}
        // Keep the source crop inside both sizes while a parked source shrinks.
        // Otherwise DWM samples outside its new texture for one display frame.
        if(sourceLimit){size[0]=Math.min(size[0],Math.max(1,Math.floor(sourceLimit.width*scale)-2));size[1]=Math.min(size[1],Math.max(1,Math.floor(sourceLimit.height*scale)-2));}
        const destinationWidth=properties.readInt32LE(12)-properties.readInt32LE(4),destinationHeight=properties.readInt32LE(16)-properties.readInt32LE(8);
        const crop=pixelExact ? pixelExactCrop(size[0],size[1],destinationWidth,destinationHeight) : proportional ? proportionalCrop(size[0],size[1],destinationWidth,destinationHeight) : {left:0,top:0,right:size[0],bottom:size[1]};
        // A responsive HTML backing must never magnify an older texture,
        // even for the frame before its independent renderer catches up.
        if(pixelExact){properties.writeInt32LE(properties.readInt32LE(4)+crop.right,12);properties.writeInt32LE(properties.readInt32LE(8)+crop.bottom,16);}
        properties.writeUInt32LE(1|2|4|8|16);
        for(const [i,value] of [crop.left,crop.top,crop.right,crop.bottom].entries())properties.writeInt32LE(Math.round(value),20+i*4);
      }
      properties.writeUInt8(255,36);properties.writeInt32LE(1,40);properties.writeInt32LE(1,44);
      return update(id,properties)===0;
    },
    remove:id=>{sources.delete(id);return unregister(id);}
  };
}
class WindowMotion {
  constructor(window,current,layout,{api=motionAPI(window),duration=260,liveLayout=()=>false}={}) {
    this.window=window;this.current=current;this.layout=layout;this.api=api;this.duration=duration;
    this.liveLayout=liveLayout;
    this.parked=new Set();
  }
  update(native) {
    if (!native?.hwnd || native.disposed || native.stopped) native=null;
    if (native!==this.native) {
      if(this.id)this.api.remove(this.id);
      this.sourceLimit=null;
      this.native=native;this.id=native ? this.api.register(native.hwnd) : 0;
    }
    if(this.id && native.viewport && !this.window.isMinimized()) this.api.update(this.id,{...native.viewport,width:native.viewport.width+(native.resizeInset||0)},this.sourceLimit,!!native.hostAnimating,this.liveLayout(native)&&!native.hostAnimating);
  }
  begin(kind) {
    const native=this.current(); if(!native?.hwnd)return;
    // Responsive HTML must receive each real viewport size during an edge
    // drag or sidebar change. Parking it freezes layout, and the compositor
    // magnifies that old page until release instead of letting its grid wrap.
    // Flash movies retain their proportional preview and existing ordering.
    if(kind!=='minimize'&&this.liveLayout(native)){
      // Maximizing must follow the same live, pixel-exact path as resizing.
      // Only a preceding minimize can have left an input surface parked.
      if(this.parked.size)this.settle(0);
      return;
    }
    this.revision=(this.revision||0)+1;
    this.update(native);clearTimeout(this.timer);
    if(!this.id)return;
    this.parked.add(native);
    this.active=true;native.hostAnimating=true;native.syncWindow();
    if(kind!=='minimize')this.settle();
  }
  settle(delay=this.duration) {
    clearTimeout(this.timer);
    const revision=this.revision=(this.revision||0)+1;
    this.timer=setTimeout(async()=>{
      if(this.window.isDestroyed() || this.window.isMinimized())return;
      if(this.id && this.native?.viewport){
        const viewport=this.native.viewport;
        this.sourceLimit={width:Math.min(this.sourceLimit?.width??Infinity,viewport.width),height:Math.min(this.sourceLimit?.height??Infinity,viewport.height)};
        this.update(this.native);
      }
      await Promise.all([...this.parked].map(native=>native.prepareViewport?.().catch(()=>{})));
      if(this.window.isDestroyed() || this.window.isMinimized() || revision!==this.revision)return;
      this.sourceLimit=null;
      this.update(this.native);
      const restoring=[...this.parked];
      for(const native of restoring)native.hostAnimating=false;
      this.parked.clear();
      this.layout();
      await Promise.all(restoring.map(native=>native.wantedVisible ? native.present?.().catch(()=>{}) : null));
      if(revision===this.revision)this.active=false;
    },delay);
  }
  dispose() { this.revision=(this.revision||0)+1;clearTimeout(this.timer);if(this.id)this.api.remove(this.id);this.id=0;for(const native of this.parked)native.hostAnimating=false;this.parked.clear();this.native=null; }
}
module.exports={WindowMotion,proportionalCrop,pixelExactCrop};
