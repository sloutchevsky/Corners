'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,check,timeout=30000){const end=Date.now()+timeout;let value;do{value=await read();if(check(value))return value;await wait(80);}while(Date.now()<end);throw Error('Timeout: '+JSON.stringify(value));}
(async()=>{
 const server=http.createServer((request,response)=>{if(request.url==='/fixture.swf'){response.setHeader('Content-Type','application/x-shockwave-flash');response.end(require('./playback-fixture'));return;}response.setHeader('Content-Type','text/html');response.end(request.url.startsWith('/flash.gallery.html')?fs.readFileSync('C:/_projects/flashborn/flash.gallery.html'):'<!doctype html><title>Original website</title><h1>Regular website</h1>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,url=base+'/flash.gallery.html';
 const profile=path.join(out,'library-pane-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 const savedTabs=[{kind:'web',title:'Original website',url:base+'/regular'},{kind:'home',title:'New tab',url:''}];
 const card={id:crypto.randomUUID(),kind:'html',title:'Saved website',titleEdited:true,url:base+'/saved'};
 fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({tabs:savedTabs,activeTabIndex:0,library:[card],settings:{theme:'light',adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:url};delete env.ELECTRON_RUN_AS_NODE;
 let app,ui;const passed=[],pass=text=>{passed.push(text);console.log('PASS '+text);};
 const launch=async()=>{app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();await app.evaluate(()=>{global.__flashborn.win.setBounds({x:60,y:60,width:1360,height:1040});global.__flashborn.win.showInactive();});};
 const command=(action,args={})=>app.evaluate(({},value)=>global.__flashborn.command(value.action,value.args),{action,args});
 const state=()=>app.evaluate(()=>global.__flashborn.getState());
 const native=code=>app.evaluate(({},code)=>global.__flashborn.activeContent().native.evaluate(code),code);
 const ready=()=>poll(()=>native('!document.getElementById("browse-page").hidden'),Boolean);
 const selection=()=>ui.evaluate(()=>({panes:Array.from(document.querySelectorAll('.sidebar-bottom [data-panel].active')).map(el=>el.dataset.panel),tabs:document.querySelectorAll('#tabs .tab.active').length}));
 try{
  await launch();const original=(await state()).activeId;await command('panel',{name:'library'});await ready();
  assert.equal((await state()).tabs.length,2);assert.equal((await state()).activeId,original);assert.equal((await state()).panel,'library');assert.equal((await state()).panelPage.url,url);assert.equal(await ui.locator('#address').inputValue(),url);assert.deepEqual(await selection(),{panes:['library'],tabs:0});
  const pane=await app.evaluate(()=>({id:global.__flashborn.activeContent().id,pid:global.__flashborn.activeContent().native.child.pid}));assert.ok(!(await state()).tabs.some(tab=>tab.id===pane.id));
  await poll(()=>app.evaluate(()=>global.__flashborn.activeContent().native.isPresented()),Boolean);assert.equal(await native('document.querySelector(".card-title").textContent'),card.title);
  await native('document.querySelector("[data-edit]").click();document.querySelector("[name=title]").value="Edited inside pane";document.getElementById("page-form").requestSubmit()');await poll(state,value=>value.library[0].title==='Edited inside pane');
  pass('Library loads and edits inside its own pane without adding a tab or changing the selected regular tab');
  for(const name of ['bookmarks','history','downloads','settings','about','support']){await command('panel',{name});assert.deepEqual(await selection(),{panes:['settings','about'].includes(name)?[]:[name],tabs:0});assert.equal((await state()).tabs.length,2);assert.equal((await state()).panelPage,null);assert.equal(await ui.locator('#address').inputValue(),'');assert.equal(await app.evaluate(()=>global.__flashborn.libraryPanels.get(false).native.wantedVisible),false);}
  await command('panel',{name:'library'});await ready();assert.deepEqual(await app.evaluate(()=>({id:global.__flashborn.activeContent().id,pid:global.__flashborn.activeContent().native.child.pid})),pane);assert.deepEqual(await selection(),{panes:['library'],tabs:0});
  await command('select-tab',{id:original});assert.deepEqual(await selection(),{panes:[],tabs:1});assert.equal((await state()).tabs.find(tab=>tab.id===original).url,base+'/regular');assert.equal(await app.evaluate(()=>global.__flashborn.libraryPanels.get(false).native.wantedVisible),false);
  pass('Every special pane has one selection; returning to a regular tab restores its selection and hides Library');
  await app.evaluate(()=>global.__flashborn.activeTab().view.webContents.executeJavaScript('document.body.insertAdjacentHTML("beforeend",\'<object data="/fixture.swf" type="application/x-shockwave-flash" width="700" height="400"></object>\')'));await command('native-mode');await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native?.isPresented()),Boolean);await command('panel',{name:'library'});await ready();assert.equal(await app.evaluate(()=>global.__flashborn.tabs.find(tab=>tab.id===global.__flashborn.getState().activeId).native.wantedVisible),false);await command('select-tab',{id:original});await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native.isPresented()),Boolean);assert.deepEqual(await selection(),{panes:[],tabs:1});assert.equal(await app.evaluate(()=>global.__flashborn.libraryPanels.get(false).native.wantedVisible),false);
  pass('Switching between a regular native Flash view and the Library pane presents only the active surface');
  await command('panel',{name:'library'});const previous=await app.evaluate(()=>global.__flashborn.activeContent().native.child.pid);await command('reload');await ready();assert.notEqual(await app.evaluate(()=>global.__flashborn.activeContent().native.child.pid),previous);assert.equal((await state()).tabs.length,2);assert.deepEqual(await selection(),{panes:['library'],tabs:0});
  await command('theme');await poll(()=>native('document.documentElement.dataset.theme'),value=>value==='current');await command('theme');
  pass('Reload and theme changes affect the Library pane without creating tabs');
  await native('document.querySelector(".card-art").click()');await poll(state,value=>value.panel===null&&value.tabs.some(tab=>tab.url===base+'/saved'));assert.equal((await state()).tabs.length,3);assert.deepEqual(await selection(),{panes:[],tabs:1});await command('panel',{name:'library'});await ready();assert.equal((await state()).tabs.length,3);assert.deepEqual(await selection(),{panes:['library'],tabs:0});
  pass('Opening a saved website creates a regular tab and returning to Library reuses its pane');
  await command('new-flashcognito');const privateId=(await state()).activeId;await command('panel',{name:'library'});await ready();assert.equal((await state()).panelPage.private,true);assert.equal((await state()).tabs.length,4);assert.deepEqual(await selection(),{panes:['library'],tabs:0});assert.notEqual((await state()).panelPage.id,pane.id);await command('close-tab',{id:privateId});assert.equal(await app.evaluate(()=>global.__flashborn.libraryPanels.has(true)),false);
  await command('panel',{name:'library'});await ready();assert.equal((await state()).panelPage.id,pane.id);
  pass('Flashcognito uses an isolated Library pane that is disposed with its last private tab');
  await wait(6500);fs.writeFileSync(path.join(out,'library-pane.png'),Buffer.from(await app.evaluate(()=>global.__flashborn.activeContent().native.screenshot()),'base64'));await ui.screenshot({path:path.join(out,'library-pane-shell.png')});
  await app.evaluate(({app})=>app.exit(0)).catch(()=>{});app=null;
  const profileFile=path.join(profile,'browser.json'),saved=JSON.parse(fs.readFileSync(profileFile));assert.ok(saved.tabs.every(tab=>tab.url!==url));saved.tabs=[...savedTabs,{kind:'web',native:true,title:'Flash Library',url:'https://flashborn.sloutchevsky.com/flash.library.html'}];saved.activeTabIndex=2;fs.writeFileSync(profileFile,JSON.stringify(saved));
  await launch();await ready();assert.equal((await state()).panel,'library');assert.equal((await state()).tabs.length,2);assert.deepEqual(await selection(),{panes:['library'],tabs:0});assert.ok(JSON.parse(fs.readFileSync(profileFile)).tabs.every(tab=>tab.url!==url));
  pass('Previous-version Library tabs migrate into the special pane and are excluded from restored tab sessions');
  fs.writeFileSync(path.join(out,'library-pane-results.json'),JSON.stringify({passed,profile,pane},null,2));
 }catch(error){console.log('FAILURE_STATE',JSON.stringify(await state().catch(()=>null)));throw error;}finally{if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
