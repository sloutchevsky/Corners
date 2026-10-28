'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { MenuMotion, menuFrame } = require('../src/menu-motion');

test('the native mask stays under the top frame and flush right at every slide position and DPI', () => {
  for (const scale of [1,1.25,1.5,2]) for (const progress of [0,.05,.4,.9,1]) {
    const host={x:-1165,y:87,width:Math.round(1250*scale)}, popup={width:Math.round(320*scale),height:Math.round(690*scale)};
    const frame=menuFrame(host,popup,100,scale,progress);
    assert.equal(frame.y,host.y+Math.round(100*scale));
    assert.equal(frame.x+frame.width,host.x+host.width);
    assert.equal(frame.hidden+frame.visible,popup.height);
    if (!progress) assert.equal(frame.visible,0);
    if (progress===1) assert.equal(frame.hidden,0);
  }
});

function fixture(options={}) {
  let time=0,id=0,position={x:80,y:70,width:1200,height:900}; const timers=new Map(),frames=[];
  const window={isDestroyed:()=>false};
  const motion=new MenuMotion(window,window,{...options,api:{geometry:()=>({host:position,popup:{width:400,height:850},scale:1.25}),apply:frame=>frames.push(frame),...options.api},
    now:()=>time,schedule:callback=>{timers.set(++id,callback);return id;},cancel:id=>timers.delete(id)});
  return {motion,frames,move:value=>position=value,tick(ms){time+=ms;const next=[...timers.values()];timers.clear();next.forEach(callback=>callback());},timers};
}

test('opening, reversing, reopening and host movement keep a single coherent mask', () => {
  const f=fixture();let closed=0;
  f.motion.animate(1);f.tick(70);const opening=f.motion.progress;
  assert.ok(opening>0 && opening<1);
  f.motion.animate(0,()=>closed++);assert.equal(f.motion.progress,opening);
  f.tick(35);assert.ok(f.motion.progress<opening);
  f.motion.animate(1);f.move({x:310,y:140,width:1200,height:900});f.motion.align();
  assert.equal(f.frames.at(-1).x,1110);assert.equal(f.frames.at(-1).y,265);
  f.tick(240);assert.equal(f.motion.progress,1);assert.equal(closed,0);assert.equal(f.timers.size,0);
  f.motion.animate(0,()=>closed++);f.tick(240);assert.equal(closed,1);assert.equal(f.frames.at(-1).visible,0);
});

test('caption movement and fractional pixel rounding retain the menu; resizing is detected', () => {
  const f=fixture();f.move({x:130,y:210,width:1200,height:900});assert.equal(f.motion.sizeChanged(),false);
  f.move({x:130,y:210,width:1202,height:901});assert.equal(f.motion.sizeChanged(),false);
  f.move({x:130,y:210,width:1230,height:910});assert.equal(f.motion.sizeChanged(),true);
});

test('reduced motion completes immediately and disposal cancels pending close callbacks', () => {
  const f=fixture({reduced:true});let closed=0;
  f.motion.animate(1);assert.equal(f.motion.progress,1);assert.equal(f.timers.size,0);
  f.motion.animate(0,()=>closed++);assert.equal(closed,1);
  const animated=fixture();animated.motion.animate(1);animated.tick(240);animated.motion.animate(0,()=>closed++);
  animated.motion.dispose();animated.tick(500);assert.equal(closed,1);assert.equal(animated.timers.size,0);
});

test('completion waits for the compositor, then leaves its script callback before closing', async () => {
  let painted,complete=0;
  const f=fixture({api:{animate:()=>new Promise(resolve=>painted=resolve)}});
  f.motion.animate(1,()=>complete++);f.tick(190);assert.equal(complete,0);
  painted();await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,0);
  f.tick(0);assert.equal(complete,1);
});

test('a canceled compositor result cannot complete an older transition', async () => {
  const results=[];let completed=0;
  const f=fixture({api:{animate:()=>new Promise(resolve=>results.push(resolve))}});
  f.motion.animate(1,()=>completed++);f.tick(190);
  f.motion.animate(0);results[0]();await new Promise(resolve=>setImmediate(resolve));f.tick(0);
  assert.equal(completed,0);
  f.motion.dispose();results[1]();await new Promise(resolve=>setImmediate(resolve));f.tick(0);assert.equal(completed,0);
});
