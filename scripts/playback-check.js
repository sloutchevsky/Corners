'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const fixture = require('./playback-fixture');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 30000) { let value; const end=Date.now()+timeout; do{value=await fn();if(check(value))return value;await wait(100);}while(Date.now()<end);throw Error('Timeout: '+JSON.stringify(value)); }
(async () => {
 fs.mkdirSync(output,{recursive:true}); const profile=path.join(output,'playback-profile-'+Date.now());fs.mkdirSync(profile);
 const movie=path.join(profile,'drag.swf'),html=path.join(profile,'drag.html');fs.writeFileSync(movie,fixture);
 const markup='<!doctype html><title>Native drag fixture</title><style>html,body{margin:0;height:100%}embed{width:100%;height:100%}</style><embed id="movie" src="drag.swf" type="application/x-shockwave-flash" allowScriptAccess="always">';fs.writeFileSync(html,markup);
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url.endsWith('.swf')?'application/x-shockwave-flash':'text/html');res.end(req.url.endsWith('.swf')?fixture:req.url.startsWith('/flash')?markup:'<!doctype html><title>Ordinary page</title><p>Regular tab</p>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app; const passed=[],pass=message=>{passed.push(message);console.log('PASS '+message);};
 const launch=async()=>{app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env,timeout:45000});app.process().stderr.on('data',b=>fs.appendFileSync(path.join(output,'playback-electron.log'),b));await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1280,height:820});w.show();w.focus();});};
 const command=(action,args={})=>app.evaluate(({},data)=>global.__flashborn.command(data.action,data.args),{action,args});
 const state=()=>app.evaluate(()=>global.__flashborn.getState());
 const script=code=>app.evaluate(({},code)=>global.__flashborn.activeTab().native.evaluate(code),code);
 const native=(action,args={})=>app.evaluate(({},data)=>global.__flashborn.activeTab().native.call(data.action,data.args),{action,args});
 const values=()=>script('(()=>{const e=document.querySelector("embed");return {presses:e.GetVariable("presses"),drags:e.GetVariable("drags"),ticks:e.GetVariable("ticks"),maxGap:e.GetVariable("maxGap"),focus:document.hasFocus()}})()');
 const ready=()=>poll(async()=>{try{return await values();}catch(e){return {error:e.message};}},v=>v&&v.presses!==undefined&&v.presses!==null);
 const drag=async()=>{const before=await values();await native('focus');await native('test-mouse',{type:'mouseMove',x:300,y:220});await native('test-mouse',{type:'mouseDown',x:300,y:220,button:'left',clickCount:1});for(let i=1;i<=12;i++){await native('test-mouse',{type:'mouseMove',x:300+i*12,y:220+i*3,button:'left'});await wait(20);}await native('test-mouse',{type:'mouseUp',x:444,y:256,button:'left',clickCount:1});return poll(values,v=>Number(v.presses)>Number(before.presses)&&Number(v.drags)>Number(before.drags));};
 try {
  await launch();await command('navigate',{value:base+'/flash'});await poll(()=>app.evaluate(()=>!!global.__flashborn.activeTab().native),Boolean);await ready();
  console.log('INITIAL',await values(),await native('test-playback'),await script('document.visibilityState'));await drag();pass('Genuine Flash receives mouse-down, movement while held, and mouse-up');
  await wait(1200);await script('document.querySelector("embed").SetVariable("maxGap",0)');const before=await native('test-playback');await wait(4000);const after=await native('test-playback');assert.equal(after.settingsRuns,before.settingsRuns);pass('Settled playback performs no recurring Flash settings calls');
  const clock=await values();assert.ok(clock.ticks>50);console.log('FRAME CLOCK',clock);
  const first=(await state()).activeId;await script('document.querySelector("embed").SetVariable("marker",42)');
  for(let i=0;i<3;i++){await command('new-tab');await command('navigate',{value:base+'/flash?'+i});await poll(()=>app.evaluate(()=>!!global.__flashborn.activeTab().native),Boolean);await ready();}
  await command('select-tab',{id:first});await ready();assert.equal(Number(await script('document.querySelector("embed").GetVariable("marker")')),42);await drag();pass('Returning to older tabs preserves the live movie and restores drag interactivity');
  await command('new-tab');await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),html);await ready();await drag();const htmlId=(await state()).activeId;
  await command('new-tab');await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),movie);await ready();await drag();const swfId=(await state()).activeId;
  await command('new-tab');await command('navigate',{value:base+'/ordinary'});await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId).loading);
  await command('new-flashcognito');await command('navigate',{value:base+'/private'});await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId).loading);
  await command('select-tab',{id:htmlId});await ready();await native('restore-state',{zoom:125,muted:true});
  const original=await state();await app.close();app=null;
  const stored=JSON.parse(fs.readFileSync(path.join(profile,'browser.json')));assert.equal(stored.tabs.length,original.tabs.filter(t=>!t.private).length);assert.ok(stored.tabs.some(t=>t.kind==='flash'&&t.source.path===movie));assert.ok(stored.tabs.some(t=>t.kind==='local'&&t.path===html&&t.native));assert.ok(!JSON.stringify(stored.tabs).includes('/private'));pass('Session saves web, SWF and local HTML sources; private tabs stay excluded');
  await launch();await ready();const restored=await state();assert.equal(restored.tabs.find(t=>t.id===restored.activeId).kind,'local');assert.equal(restored.tabs.find(t=>t.id===restored.activeId).zoom,125);assert.equal(restored.tabs.find(t=>t.id===restored.activeId).muted,true);
  assert.equal(await app.evaluate(()=>global.__flashborn.tabs.filter(t=>t.native).length),1);await drag();pass('Restart reloads the selected local Flash tab with its zoom/mute state and loads other tabs on demand');
  for(const target of [restored.tabs.find(t=>t.url===base+'/flash'),restored.tabs.find(t=>t.kind==='flash')]){
   await command('select-tab',{id:target.id});await ready();await drag();const old=await app.evaluate(()=>global.__flashborn.activeTab().native.child.pid);
   await app.evaluate(()=>global.__flashborn.activeTab().native.child.kill());await poll(state,s=>!!s.tabs.find(t=>t.id===s.activeId).error);await command('reload');await ready();await drag();assert.notEqual(await app.evaluate(()=>global.__flashborn.activeTab().native.child.pid),old);assert.equal((await state()).tabs.find(t=>t.id===target.id).error,null);
  }
  const local=(await state()).tabs.find(t=>t.kind==='local');await command('select-tab',{id:local.id});await ready();const old=await app.evaluate(()=>global.__flashborn.activeTab().native.child.pid);await app.evaluate(()=>global.__flashborn.activeTab().native.child.kill());await poll(state,s=>!!s.tabs.find(t=>t.id===s.activeId).error);await command('reload');await ready();await drag();assert.notEqual(await app.evaluate(()=>global.__flashborn.activeTab().native.child.pid),old);
  pass('Reload recovers terminated web, SWF and local HTML runtimes from their original sources');
  const rendererHost=await app.evaluate(()=>global.__flashborn.activeTab().native.child.pid);await native('test-renderer-crash');await poll(state,s=>!!s.tabs.find(t=>t.id===s.activeId).error);await command('reload');await ready();await drag();assert.notEqual(await app.evaluate(()=>global.__flashborn.activeTab().native.child.pid),rendererHost);pass('A crashed Flash renderer is replaced even when its host process remains alive');
  await command('reload');await ready();await drag();pass('Normal reload leaves genuine Flash mouse interaction working');
  fs.writeFileSync(path.join(output,'playback-results.json'),JSON.stringify({passed,clock,profile},null,2));console.log(JSON.stringify({passed},null,2));
 } catch(error) { if(app)console.error('FAILURE STATE',await state(),await app.evaluate(()=>{const t=global.__flashborn.activeTab();return {restoring:!!t.restoring,restoreEntry:t.restoreEntry,native:t.native&&{pid:t.native.child?.pid,exit:t.native.child?.exitCode,state:t.native.state,disposed:t.native.disposed}};}));throw error;
 } finally { if(app)await app.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
