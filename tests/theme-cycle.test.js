'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const cycle=require('../src/ui/theme-cycle');
test('four theme positions cycle clockwise and preserve the existing preference format',()=>{
  const start={theme:'current',highContrast:false,searchEngine:'duckduckgo'};
  let state={...start};
  const actual=[];
  for(let i=0;i<8;i++){const next=cycle.next(state);state={...state,theme:next.theme,highContrast:next.highContrast};actual.push([cycle.index(state),state.theme,state.highContrast]);}
  assert.deepEqual(actual,[[2,'light',true],[3,'light',false],[0,'current',true],[1,'current',false],[2,'light',true],[3,'light',false],[0,'current',true],[1,'current',false]]);
  assert.equal(state.searchEngine,start.searchEngine);assert.deepEqual(start,{theme:'current',highContrast:false,searchEngine:'duckduckgo'});
  assert.equal(cycle.current().label,'Dark grey');
});
test('Settings combinations map to the same quarter-turn positions without changing shared states',()=>{
  for(const state of cycle.states){assert.equal(cycle.current(state),state);assert.equal(state.angle,cycle.index(state)*90);assert.ok(Object.isFrozen(state));}
  assert.equal(cycle.index({theme:'unknown',highContrast:'true'}),1);
});
test('the chrome loads the same theme cycle without CommonJS',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/ui/theme-cycle.js'),'utf8'),context);
  assert.equal(context.window.FlashbornTheme.next({theme:'light',highContrast:false}).angle,0);
});
