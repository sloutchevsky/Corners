'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FRAME,surface,frameRectangles,intersectRegions}=require('../src/legacy/window-frame');
const has=(r,x,y)=>r.some(v=>x>=v.x&&x<v.x+v.width&&y>=v.y&&y<v.y+v.height);
test('masked perimeter passes input through except for its corners and requested scroll tracks',()=>{
 for(const width of [800,1250,3840])for(const height of [560,850,2109]){
  const b={width,height},r=frameRectangles(b),s=surface(b);assert.equal(FRAME,15);
  assert.equal(s.width,width-30);assert.equal(s.height,height-30);
  assert.ok(has(r,5,5)&&has(r,width-5,height-5));assert.equal(has(r,100,5),false);
  assert.equal(has(r,5,100),false);assert.equal(has(r,width-5,100),false);
  const bar={visible:true,rect:{x:width-15,y:75,width:15,height:height-115}};
  assert.ok(has(frameRectangles(b,[bar]),width-5,100));assert.equal(has(frameRectangles(b,[{...bar,visible:false}]),width-5,100),false);
 }
});
test('Flash cutout intersection preserves the mask rather than reintroducing a rectangular frame',()=>{
 const r=intersectRegions([{x:15,y:15,width:970,height:770}],[{x:0,y:0,width:300,height:800}]);
 assert.deepEqual(r,[{x:15,y:15,width:285,height:770}]);
});

test('scrolling stage is masked 15 px inside both vertical window edges',()=>{
 const b={x:7,y:7,width:1200,height:800},s=surface(b),r=frameRectangles(b);
 assert.deepEqual(s,{x:22,y:22,width:1170,height:770});
 for(const x of [100,341,500,1000]){
  assert.equal(has(r,x,21),false);assert.ok(has(r,x,22));
  assert.ok(has(r,x,791));assert.equal(has(r,x,792),false);
 }
 assert.equal(has(r,8,400),false);
});
