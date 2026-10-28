'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { FlashWindowRegion, shellRegion } = require('../src/flash-window-region');
const contains = (rects, x, y) => rects.some(rect => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('only the painted viewport is excluded; toolbar, sidebar, status bar and nonclient edges remain drawable', () => {
  const outer = { x: -1400, y: 60, width: 1360, height: 900 };
  const rects = shellRegion(outer, { x: -1072, y: 168, width: 1024, height: 768 });
  assert.equal(contains(rects, 327, 200), true); assert.equal(contains(rects, 328, 108), false);
  assert.equal(contains(rects, 1351, 875), false); assert.equal(contains(rects, 1352, 875), true);
  assert.equal(contains(rects, 400, 107), true); assert.equal(contains(rects, 400, 876), true);
  for (let y = 0; y < 900; y += 11) for (let x = 0; x < 1360; x += 13) assert.equal(contains(rects, x, y), !(x >= 328 && x < 1352 && y >= 108 && y < 876));
});
test('fullscreen has no opaque shell area and restored regular pages have the full window', async () => {
  const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  const fullscreen = shellRegion(bounds, bounds);
  assert.ok(fullscreen.length); assert.equal(contains(fullscreen, 0, 0), false); assert.equal(contains(fullscreen, 1919, 1079), false);
  const calls = [], handle=Buffer.alloc(8); handle.writeBigUInt64LE(10n);
  const host = { isDestroyed: () => false, getNativeWindowHandle: () => handle };
  const api={rect:()=>bounds,excludes:()=>true,apply:(_handle,rects)=>calls.push(rects)}, movie={hwnd:20,bounds:[0,0,1920,1080]};
  const region = new FlashWindowRegion(host,api); region.update(movie); region.update(movie); await tick(); assert.equal(calls.length, 1);
  region.update(null); await tick(); assert.deepEqual(calls.at(-1), []);
});
test('shape updates are deferred outside native window events and repeated handoffs coalesce', async () => {
  const bounds = { x: 0, y: 0, width: 1000, height: 800 }, viewport = { hwnd:20,bounds:[320,100,680,676] };
  let region, calls = 0;
  const handle=Buffer.alloc(8); handle.writeBigUInt64LE(10n);
  const host = { isDestroyed: () => false,getNativeWindowHandle:()=>handle };
  let excluded=false;
  const api={rect:()=>bounds,excludes:()=>excluded,apply:()=>{calls++;region.update(viewport);excluded=true;}};
  region = new FlashWindowRegion(host,api); region.update(viewport); region.update(viewport); assert.equal(calls,0); await tick(); await tick(); assert.equal(calls, 1);
});

test('a moving movie excludes only painted pixels within the desired viewport and repairs an OS region reset', async () => {
  const handle=Buffer.alloc(8);handle.writeBigUInt64LE(10n);
  const host={isDestroyed:()=>false,getNativeWindowHandle:()=>handle},calls=[];
  let excludes=true;
  const api={rect:hwnd=>hwnd===10 ? {x:79,y:88,width:1244,height:822} : {x:490,y:213,width:826,height:659},excludes:()=>excludes,apply:(_handle,rects)=>calls.push(rects)};
  const movie={hwnd:20,bounds:[488,213,826,659]},region=new FlashWindowRegion(host,api);
  region.update(movie); await tick(); assert.deepEqual(region.viewport,{x:490,y:213,width:824,height:659});
  assert.equal(contains(calls[0],409,200),true);assert.equal(contains(calls[0],411,200),false);
  region.update(movie);await tick();assert.equal(calls.length,1);
  excludes=false;region.update(movie);await tick();assert.equal(calls.length,2);
});

test('caption moves retain the same cutout while an asynchronous movie follows', async () => {
 const handle=Buffer.alloc(8);handle.writeBigUInt64LE(10n);let offset=0,lag=0,calls=0;
 const host={isDestroyed:()=>false,getNativeWindowHandle:()=>handle};
 const api={rect:hwnd=>hwnd===10?{x:offset,y:0,width:1000,height:800}:{x:320+offset-lag,y:100,width:680,height:676},excludes:()=>true,apply:()=>calls++};
 const region=new FlashWindowRegion(host,api),movie={hwnd:20,bounds:[320,100,680,676]};region.update(movie);await tick();const key=region.key;
 region.setMoving(true);for(let i=0;i<20;i++){offset+=3;lag=3;movie.bounds[0]=320+offset;region.update(movie);await tick();assert.equal(region.key,key);}assert.equal(calls,1);
 lag=0;region.setMoving(false);await tick();assert.equal(calls,1);
});

test('a page change during a caption move still removes the old Flash input cutout',async()=>{
 const handle=Buffer.alloc(8);handle.writeBigUInt64LE(10n);const calls=[];
 const host={isDestroyed:()=>false,getNativeWindowHandle:()=>handle},api={rect:()=>({x:0,y:0,width:1000,height:800}),excludes:()=>true,apply:(_h,rects)=>calls.push(rects)};
 const region=new FlashWindowRegion(host,api);region.update({hwnd:20,bounds:[320,100,680,676]});await tick();region.setMoving(true);region.update(null);await tick();assert.deepEqual(calls.at(-1),[]);
});

test('an ordinary page repairs a compositor-reset window mask even when no Flash cutout exists',async()=>{
 const handle=Buffer.alloc(8);handle.writeBigUInt64LE(10n);let signature='initial',calls=0;
 const host={isDestroyed:()=>false,getNativeWindowHandle:()=>handle};
 const api={scale:()=>1,rect:()=>({x:0,y:0,width:1000,height:800}),signature:()=>signature,apply:()=>{calls++;signature='applied-'+calls;},excludes:()=>true};
 const region=new FlashWindowRegion(host,api);region.setFrame([{x:15,y:15,width:970,height:770}]);await tick();assert.equal(calls,1);
 region.update(null);await tick();assert.equal(calls,1);signature='reset-by-compositor';region.update(null);await tick();assert.equal(calls,2);
});


test('stage does not refill a Flash hole; only edge controls stay above it',async()=>{
 const handle=Buffer.alloc(8);handle.writeBigUInt64LE(10n);const calls=[];
 const host={isDestroyed:()=>false,getNativeWindowHandle:()=>handle};
 const bounds={x:0,y:0,width:1000,height:800};
 const api={scale:()=>1,rect:h=>h===10?bounds:{x:335,y:0,width:650,height:800},excludes:()=>true,apply:(_h,rects)=>calls.push(rects)};
 const region=new FlashWindowRegion(host,api);
 region.setFrame(require('../src/legacy/window-frame').frameRectangles(bounds,[]));
 region.update({hwnd:20,bounds:[335,0,650,800]});await tick();
 assert.equal(contains(calls.at(-1),500,300),false);
 assert.equal(contains(calls.at(-1),970,780),true);
 assert.equal(contains(calls.at(-1),5,5),true);
 assert.equal(contains(calls.at(-1),100,5),false);
});
