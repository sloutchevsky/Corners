'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WindowMotion,proportionalCrop,pixelExactCrop}=require('../src/window-motion');
const wait=()=>new Promise(resolve=>setTimeout(resolve,30));
function fixture(options={}){
 const calls=[],native={hwnd:20,viewport:{x:320,y:100,width:800,height:600},syncWindow:()=>calls.push('park')};let current=native,minimized=false;
 const window={isDestroyed:()=>false,isMinimized:()=>minimized},api={register:h=>{calls.push(['register',h]);return h+100;},update:(id,rect,limit,proportional,pixelExact)=>calls.push(['rect',id,{...rect},proportional,pixelExact]),remove:id=>calls.push(['remove',id])};
 const motion=new WindowMotion(window,()=>current,()=>calls.push('layout'),{api,duration:5,...options});
 return {motion,native,calls,switch:n=>current=n,minimize:value=>minimized=value};
}
test('responsive Gallery stays live through resize, sidebar, maximize and fullscreen changes',()=>{
 const f=fixture({liveLayout:()=>true});
 for(const kind of ['resize','sidebar','maximize','unmaximize','restore','enter-full-screen','leave-full-screen']){
  f.motion.begin(kind);
  assert.equal(!!f.native.hostAnimating,false);
  assert.equal(f.motion.parked.size,0);
  assert.ok(!f.calls.includes('park'));
 }
 f.motion.update(f.native);assert.equal(f.calls.at(-1)[4],true,'The Gallery backing must never stretch a stale texture');
 f.motion.dispose();
});
test('a live backing keeps one source pixel per destination pixel at every resize',()=>{
 for(const [w,h] of [[720,1095],[1344,1095],[1,1],[1920,1080]])for(const [dw,dh] of [[1344,1095],[720,1095],[1,1],[2400,1600]]){
  const crop=pixelExactCrop(w,h,dw,dh);
  assert.equal(crop.left,0);assert.equal(crop.top,0);
  assert.equal(crop.right,Math.min(w,dw));assert.equal(crop.bottom,Math.min(h,dh));
  assert.ok(crop.right<=w&&crop.right<=dw&&crop.bottom<=h&&crop.bottom<=dh);
 }
});
test('opting the Gallery into live resize preserves Flash previews and minimize restoration',async()=>{
 const f=fixture({liveLayout:n=>n.gallery===true});
 f.motion.begin('resize');assert.equal(f.native.hostAnimating,true);await wait();
 f.native.gallery=true;f.motion.begin('minimize');f.minimize(true);
 assert.equal(f.native.hostAnimating,true);assert.equal(f.motion.parked.size,1);
 f.minimize(false);f.motion.begin('restore');await wait();
 assert.equal(f.native.hostAnimating,false);assert.equal(f.motion.parked.size,0);f.motion.dispose();
});
test('a live backing reuses its source and releases it on ordinary or private page switches',()=>{
 const f=fixture();f.motion.update(f.native);f.motion.update(f.native);assert.equal(f.calls.filter(c=>c[0]==='register').length,1);f.motion.update(null);assert.deepEqual(f.calls.at(-1),['remove',120]);f.motion.dispose();
});
test('minimize retains its backing while restore releases the parked input window after the transition',async()=>{
 const f=fixture();f.motion.begin('minimize');f.minimize(true);f.native.viewport={x:320,y:100,width:1,height:1};f.motion.update(f.native);await wait();assert.equal(f.native.hostAnimating,true);assert.equal(f.motion.id,120);assert.equal(f.calls.filter(c=>c[0]==='rect').length,1,'Minimizing must retain the full destination rectangle');
 f.minimize(false);f.motion.begin('restore');await wait();assert.equal(f.native.hostAnimating,false);assert.equal(f.motion.active,false);assert.equal(f.calls.at(-1),'layout');f.motion.dispose();
});
test('changing tabs during animation cannot leave the earlier Flash window permanently parked',async()=>{
 const f=fixture();f.motion.begin('maximize');const next={...f.native,hwnd:30};f.switch(next);f.motion.update(next);await wait();assert.equal(f.native.hostAnimating,false);f.motion.dispose();assert.deepEqual(f.calls.at(-1),['remove',130]);
});
test('disposing an interrupted transition frees the compositor relationship and unblocks the native surface',async()=>{
 const f=fixture();f.motion.begin('maximize');f.motion.dispose();await wait();assert.equal(f.native.hostAnimating,false);assert.ok(!f.calls.includes('layout'));
});

test('the input surface stays parked until its final viewport has been painted',async()=>{
 const f=fixture();let release;
 f.native.prepareViewport=()=>new Promise(resolve=>release=resolve);
 f.motion.begin('sidebar');await wait();assert.equal(f.native.hostAnimating,true);assert.equal(f.motion.active,true);assert.ok(!f.calls.includes('layout'));
 release();await wait();assert.equal(f.native.hostAnimating,false);assert.equal(f.motion.active,false);assert.equal(f.calls.at(-1),'layout');f.motion.dispose();
});

test('a late viewport preparation cannot unpark a newer minimize transition',async()=>{
 const f=fixture();let release;
 f.native.prepareViewport=()=>new Promise(resolve=>release=resolve);
 f.motion.begin('sidebar');await wait();f.motion.begin('minimize');f.minimize(true);release();await wait();
 assert.equal(f.native.hostAnimating,true);assert.equal(f.motion.active,true);assert.ok(!f.calls.includes('layout'));f.motion.dispose();
});

test('resize previews fill wide and tall viewports without changing image proportions',()=>{
 for(const [w,h,dw,dh] of [[1200,800,600,800],[1200,800,1600,500],[801,599,987,765],[800,600,800,600]]){
  const crop=proportionalCrop(w,h,dw,dh),width=crop.right-crop.left,height=crop.bottom-crop.top;
  assert.ok(Math.abs(dw/width-dh/height)<1e-10);
  assert.ok(crop.left>=-1e-9 && crop.top>=-1e-9 && crop.right<=w+1e-9 && crop.bottom<=h+1e-9);
  assert.ok(Math.abs(crop.left-(w-crop.right))<1e-9 && Math.abs(crop.top-(h-crop.bottom))<1e-9);
 }
});
