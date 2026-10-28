'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {tabLimit,excessTabs}=require('../src/tab-limit');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/store');
const tabs=Array.from({length:24},(_,i)=>({id:String(i)}));
test('tab limits use the requested 20–100 range and default to 50',()=>{
  for(const value of [20,50,100])assert.equal(tabLimit(value),value);
  for(const value of [undefined,null,19,101,50.5,'30',NaN])assert.equal(tabLimit(value),50);
});
test('auto-close removes bottom tabs in order, keeping active and protected tabs',()=>{
  assert.deepEqual(excessTabs(tabs,'22',{autoCloseTabs:true,tabLimit:20},new Set(['23','21'])),['20','19','18','17']);
  assert.deepEqual(excessTabs(tabs,'0',{autoCloseTabs:true,tabLimit:20}),['23','22','21','20']);
});
test('disabled auto-close and protected tabs may retain more than the chosen limit',()=>{
  assert.deepEqual(excessTabs(tabs,'0',{autoCloseTabs:false,tabLimit:20}),[]);
  assert.deepEqual(excessTabs(tabs,'0',{autoCloseTabs:true,tabLimit:20},new Set(tabs.map(t=>t.id))),[]);
  assert.equal(tabs.length,24);
});
test('profiles retain the tab settings and repair invalid saved values',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flashborn-tab-limit-'));
 try{
  const store=new Store(directory);assert.equal(store.data.settings.autoCloseTabs,true);assert.equal(store.data.settings.tabLimit,50);
  store.data.settings.autoCloseTabs=false;store.data.settings.tabLimit=100;store.save();
  const restored=new Store(directory);assert.equal(restored.data.settings.autoCloseTabs,false);assert.equal(restored.data.settings.tabLimit,100);
  fs.writeFileSync(path.join(directory,'browser.json'),JSON.stringify({settings:{autoCloseTabs:'yes',tabLimit:200}}));
  const repaired=new Store(directory);assert.equal(repaired.data.settings.autoCloseTabs,true);assert.equal(repaired.data.settings.tabLimit,50);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
