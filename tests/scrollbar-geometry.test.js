'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {thumbMetrics,scrollbarFrames}=require('../src/legacy/scrollbar-geometry');
test('tracks stay within the host bounds and stop at the corner in every state',()=>{
 const b={x:100,y:80,width:1400,height:1000};
 for(const inside of [false,true]){const f=scrollbarFrames(b,75,415,inside);assert.equal(f.vertical.x,1485);assert.equal(f.horizontal.y,1065);assert.equal(f.vertical.y+f.vertical.height,1040);assert.equal(f.horizontal.x+f.horizontal.width,1460);}
});

test('scroll thumb maps start and end exactly even with a minimum-size thumb',()=>{
 for(const length of [100,500,1200])for(const total of [500,2000,500000]){const viewport=400,start=thumbMetrics(length,viewport,total,0),end=thumbMetrics(length,viewport,total,total-viewport);assert.equal(start.offset,0);assert.ok(end.size<=length);assert.ok(Math.abs(end.offset+end.size-length)<1e-6);}
});
