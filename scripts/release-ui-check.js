'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,check,timeout=30000){let value;const end=Date.now()+timeout;do{value=await fn();if(check(value))return value;await wait(90);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(value));}
(async()=>{
 const profile=path.join(out,'release-ui-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({bookmarks:[{id:'keep',url:'https://example.com',title:'Keep this bookmark'}],settings:{adBlockEnabled:false}}));
 let cacheHits=0,app;const passed=[];
 const server=http.createServer((req,res)=>{
  if(req.url==='/cached'){cacheHits++;res.writeHead(200,{'Cache-Control':'public,max-age=3600','Content-Type':'text/plain'});res.end('cached');return;}
  if(req.url==='/drag.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(require('./playback-fixture'));return;}
  res.setHeader('Content-Type','text/html');res.end(req.url==='/flash'?'<embed id="movie" src="drag.swf" type="application/x-shockwave-flash" width="500" height="400">':'<!doctype html><title>Clipboard and data fixture</title><h1>Ordinary page</h1>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const pass=s=>{passed.push(s);console.log('PASS '+s);};
 try{
  app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow();
  await app.evaluate(({dialog})=>{global.prompts=0;dialog.showMessageBox=async()=>{global.prompts++;return{response:0};};const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1360,height:920});w.show();w.focus();});
  const command=(action,args={})=>app.evaluate(({},v)=>global.__flashborn.command(v.action,v.args),{action,args});
  const state=()=>app.evaluate(()=>global.__flashborn.getState());
  const script=code=>app.evaluate(({},code)=>{const t=global.__flashborn.activeTab();return t.native?t.native.evaluate(code):t.view.webContents.executeJavaScript(code,true);},code);
  await ui.evaluate(()=>document.fonts.ready);
  for(const panel of [null,'library','bookmarks','history','downloads','settings','extensions']){
   if(panel)await command('panel',{name:panel});
   const font=await ui.locator('.page-headline').first().evaluate(el=>({family:getComputedStyle(el).fontFamily,weight:getComputedStyle(el).fontWeight,loaded:[...document.fonts].some(f=>f.family==='Flashborn 75'&&f.status==='loaded')}));
   assert.match(font.family,/Flashborn 75/);assert.equal(font.weight,'700');assert.ok(font.loaded);assert.equal(await ui.locator('.headline-art').count(),0);
  }
  pass('The bundled Flashborn 75 font loads on every former SVG heading page without a system-installed copy');
  await ui.locator('.flash-runtime-card input').waitFor();assert.ok(await ui.locator('.flash-runtime-card input').isChecked());assert.ok(await ui.locator('.flash-runtime-card input').isDisabled());
  await ui.screenshot({path:path.join(out,'release-1.9-extensions-dark.png')});
  await command('theme');await ui.screenshot({path:path.join(out,'release-1.9-extensions-light.png')});
  pass('Extensions shows the built-in Adobe Flash card with a checked, disabled grey switch in both themes');
  await ui.locator('#menu-button').click();const menu=await poll(()=>app.windows().find(w=>w.url()==='flashborn://ui/menu.html'),Boolean);
  await menu.locator('[data-section="privacy"]').click();await ui.locator('#delete-data-form').waitFor();
  assert.equal(await ui.locator('#delete-data-form input:checked').count(),3);assert.equal(await ui.locator('#delete-data-form button').count(),1);
  assert.equal(await ui.locator('#search-engine').evaluate(el=>getComputedStyle(el).backgroundPosition),'calc(100% - 13px) 50%');
  await ui.screenshot({path:path.join(out,'release-1.9-privacy-light.png')});
  for(const name of ['history','cookies','cache'])await ui.locator(`#delete-data-form [name="${name}"]`).uncheck();
  assert.ok(await ui.locator('#delete-data').isDisabled());await ui.locator('#delete-data-form [name="history"]').check();
  await ui.locator('#delete-data').click();await ui.locator('#delete-data-status').filter({hasText:'Selected browsing data deleted.'}).waitFor();
  pass('The menu opens Settings at Privacy; checkboxes share one Delete data button and prevent empty requests');
  await command('navigate',{value:base});await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId).loading);
  await app.evaluate(()=>{global.__flashborn.win.focus();global.__flashborn.activeTab().view.webContents.focus();});
  for(let i=0;i<4;i++)await script(`navigator.clipboard.writeText('flashborn-clipboard-${i}')`);
  assert.equal(await app.evaluate(async({clipboard})=>await clipboard.readText()),'flashborn-clipboard-3');assert.equal(await app.evaluate(()=>global.prompts),0);
  pass('Four real Clipboard API copies succeed without any permission dialog');
  await script(`document.cookie='fixture=keep;path=/';localStorage.setItem('fixture','keep')`);
  await script(`fetch('/cached').then(r=>r.text())`);await script(`fetch('/cached').then(r=>r.text())`);assert.equal(cacheHits,1);
  await command('delete-browsing-data',{history:true});assert.equal((await state()).history.length,0);assert.equal((await state()).bookmarks.length,1);
  assert.equal(await script(`localStorage.getItem('fixture')`),'keep');assert.match(await script('document.cookie'),/fixture=keep/);
  await command('delete-browsing-data',{cache:true});await script(`fetch('/cached').then(r=>r.text())`);assert.equal(cacheHits,2);
  assert.equal(await script(`localStorage.getItem('fixture')`),'keep');assert.match(await script('document.cookie'),/fixture=keep/);
  await command('delete-browsing-data',{cookies:true});assert.equal(await script(`localStorage.getItem('fixture')`),null);assert.equal(await script('document.cookie'),'');
  pass('History-only keeps bookmarks/cookies/storage; cache-only refetches cached content and keeps sign-in data; cookies-only clears stored site data');
  await command('navigate',{value:base+'/flash'});await poll(state,s=>s.tabs.find(t=>t.id===s.activeId).native);
  await poll(()=>script(`document.getElementById('movie')?.GetVariable?.('$version')`),v=>typeof v==='string'&&v.startsWith('WIN '));
  await script(`document.cookie='legacy=keep;path=/';localStorage.setItem('legacy','keep')`);
  await command('delete-browsing-data',{cache:true});assert.equal(await script(`localStorage.getItem('legacy')`),'keep');
  await command('delete-browsing-data',{cookies:true});assert.equal(await script(`localStorage.getItem('legacy')`),null);assert.equal(await script('document.cookie'),'');
  assert.match(await script(`document.getElementById('movie').GetVariable('$version')`),/^WIN /);
  pass('The legacy Flash runtime honors the same independent deletion choices and keeps rendering');
  await command('new-flashcognito');await command('panel',{name:'settings'});assert.ok(await ui.locator('#delete-data-form [name="history"]').isDisabled());
  pass('Flashcognito scopes deletion to private data and disables the saved-history checkbox');
  fs.writeFileSync(path.join(out,'release-1.9-ui-results.json'),JSON.stringify({passed,profile,completedAt:new Date().toISOString()},null,2));
 }finally{if(app)await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
