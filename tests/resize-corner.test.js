'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CORNER_SIZE,CORNER_STROKE,cornerFrame}=require('../src/legacy/resize-corner');
test('both 40px corner hit targets are inside the same window in every state',()=>{
 assert.equal(CORNER_SIZE,40);assert.equal(CORNER_STROKE,15);
 for(const b of [{x:50,y:50,width:800,height:560},{x:-2000,y:-600,width:801,height:563},{x:0,y:0,width:3840,height:2109}])for(const inside of [false,true]){
  const br=cornerFrame(b,inside),tl=cornerFrame(b,inside,'top-left');
  assert.equal(br.x+40,b.x+b.width);assert.equal(br.y+40,b.y+b.height);
  assert.equal(tl.x,b.x);assert.equal(tl.y,b.y);
 }
});

const {dragBounds,restoreAtCorner}=require('../src/legacy/resize-corner');
test('corner dragging anchors the opposite corner, including minimum sizes',()=>{
 const start={x:100,y:80,width:1200,height:850};
 for(const edge of ['top-left','bottom-right'])for(const x of [-900,-83,0,47,900])for(const y of [-900,-61,0,39,900]){
  const b=dragBounds(start,{x,y},edge,[800,560]);assert.ok(b.width>=800&&b.height>=560);
  if(edge==='top-left'){assert.equal(b.x+b.width,1300);assert.equal(b.y+b.height,930);}else{assert.equal(b.x,100);assert.equal(b.y,80);}
 }
});
test('undocking keeps the grabbed corner under the pointer',()=>{
 const normal={x:100,y:80,width:1200,height:850},point={x:1800,y:900},offset={x:12,y:29},work={x:0,y:0,width:2560,height:1440};
 for(const edge of ['top-left','bottom-right']){const b=restoreAtCorner(normal,point,offset,edge,work),f=cornerFrame(b,false,edge);assert.equal(f.x+offset.x,point.x);assert.equal(f.y+offset.y,point.y);}
});
