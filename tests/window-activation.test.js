'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WindowActivation,activationFlags}=require('../src/window-activation');
function fixture() {
  const hooks=new Map();let time=1000,own=true;
  const native={hwnd:20,child:{pid:5000},isPresented:()=>true,wantedVisible:true,nextLayer:()=>10,hostHandle:()=>10};
  let current=native;
  const window={hookWindowMessage:(message,callback)=>hooks.set(message,callback),unhookWindowMessage:message=>hooks.delete(message),isDestroyed:()=>false};
  const api={ownForeground:()=>own,read:value=>({pointer:value,value:{...value}}),write:(pointer,value)=>Object.assign(pointer,value)};
  const guard=new WindowActivation(window,()=>current,{api,now:()=>time});
  return {guard,hooks,native,advance:()=>{time+=1000;},external:()=>{own=false;},switch:()=>{current={...native};}};
}
test('only automatic activation raises at unchanged geometry can preserve the existing order',()=>{
  assert.equal(activationFlags(3),7);
  for(const flags of [1,2,7,0x13,0x43,0x83,0x213])assert.equal(activationFlags(flags),flags);
});
test('a click from the movie keeps the existing frame/movie order without changing geometry or activation flags',()=>{
  const f=fixture(),position={hwnd:10,after:0,x:50,y:60,width:1200,height:800,flags:3};
  f.hooks.get(0x21)();f.hooks.get(0x46)(null,position);
  assert.deepEqual(position,{hwnd:10,after:0,x:50,y:60,width:1200,height:800,flags:7});
  assert.equal(f.guard.prevented,1);f.guard.dispose();assert.equal(f.hooks.size,0);
});
test('another app, expired input and a changed tab retain ordinary Windows activation',()=>{
  for(const change of ['external','advance','switch']){
    const f=fixture();if(change==='external')f.external();f.guard.arm();if(change!=='external')f[change]();
    const position={after:0,flags:3};f.hooks.get(0x46)(null,position);assert.equal(position.flags,3);assert.equal(f.guard.prevented,0);
  }
});
test('tab preparation, retirement, handoffs and native move loops never receive activation constraints',()=>{
  for(const property of ['preparing','retiring','handoff','above','hostMoving']){
    const f=fixture();f.native[property]=true;f.guard.arm();const position={after:0,flags:3};f.hooks.get(0x46)(null,position);assert.equal(position.flags,3);
  }
});
test('explicit scene placement and topmost requests retain their original order',()=>{
  const f=fixture();f.guard.arm();for(const after of [-1,-2,20,30]){const position={after,flags:3};f.hooks.get(0x46)(null,position);assert.deepEqual(position,{after,flags:3});}
});
