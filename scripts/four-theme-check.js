'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/four-theme'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=40000){let value;const end=Date.now()+timeout;do{value=await read();if(check(value))return value;await wait(50);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(value));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const html=fs.readFileSync(path.join(root,'site/flash-gallery/flash.gallery.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/flash.gallery.html';
 const manifest=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8'));
 const items=manifest.items.filter(i=>i.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(i.path||i.url||''));
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(path.join(profile,'Flash Library'),{recursive:true});
 fs.writeFileSync(path.join(profile,'Flash Library/manifest.json'),JSON.stringify({version:1,items}));
 fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({libraryPageOnboarded:true,settings:{theme:'current',highContrast:false,restoreTabs:false,adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:url};delete env.ELECTRON_RUN_AS_NODE;
 let app,ui;const checks=[];
 const launch=async()=>{app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:60,y:60,width:1400,height:1050});w.show();w.focus();});};
 const command=(action,args={})=>app.evaluate(({},d)=>global.__flashborn.command(d.action,d.args),{action,args});
 const state=()=>app.evaluate(()=>global.__flashborn.getState());
 const active=code=>app.evaluate(({},code)=>{const tab=global.__flashborn.activeContent();return tab.native?tab.native.evaluate(code):tab.view.webContents.executeJavaScript(code);},code);
 const modes=[{theme:'light',highContrast:true,index:2,bg:'rgb(255, 255, 255)'},{theme:'light',highContrast:false,index:3,bg:'rgb(222, 222, 222)'},{theme:'current',highContrast:true,index:0,bg:'rgb(0, 0, 0)'},{theme:'current',highContrast:false,index:1,bg:'rgb(23, 23, 23)'}];
 const allPages=()=>app.evaluate(async({},url)=>{
  const f=global.__flashborn,pages=[...f.tabs,...f.libraryPanels.values()].filter(t=>t.url===url);
  const code='JSON.stringify({theme:document.documentElement.dataset.theme,contrast:document.documentElement.dataset.contrast,background:getComputedStyle(document.body).backgroundColor,loaded:window.galleryPhysics&&galleryPhysics.snapshot().loadedCount})';
  return Promise.all(pages.map(async t=>({id:t.id,private:!!t.private,pane:!!t.specialPage,...JSON.parse(await(t.native?t.native.evaluate(code):t.view.webContents.executeJavaScript(code)))})));
 },url);
 const expectPages=async(mode,count=1)=>poll(allPages,pages=>pages.length===count&&pages.every(p=>p.theme===mode.theme&&p.contrast===(mode.highContrast?'high':'normal')&&p.background===mode.bg));
 try{
  await launch();await command('panel',{name:'library'});
  await poll(()=>active('typeof galleryPhysics'),v=>v==='object');
  await poll(()=>active('galleryPhysics.snapshot().introPhase'),v=>v==='complete');
  const loaded=JSON.parse(await active('JSON.stringify({count:galleryPhysics.snapshot().count,loaded:galleryPhysics.snapshot().loadedCount,elapsed:galleryPhysics.snapshot().elapsed})'));
  assert.equal(loaded.count,items.length);assert.equal(loaded.loaded,items.length);
  await active('document.querySelector("[data-value=all]").click()');
  await poll(()=>active('galleryPhysics.snapshot().phase'),v=>v==='magnetized');
  let angle=90;
  await ui.locator('#address').hover();
  assert.equal(await ui.locator('#theme-icon').evaluate(e=>e.style.transform),'rotate(90deg)');
  for(const mode of modes){
   await ui.locator('#theme-button').hover();
   assert.equal(await ui.locator('#theme-icon').evaluate(e=>e.style.transform),'rotate('+(angle+90)+'deg)');
   const unchanged=await state();await ui.locator('#address').hover();
   assert.equal(await ui.locator('#theme-icon').evaluate(e=>e.style.transform),'rotate('+angle+'deg)');
   assert.deepEqual((await state()).settings,unchanged.settings,'Hover must not change appearance preferences');
   await ui.locator('#theme-button').click();angle+=90;
   await poll(state,s=>s.settings.theme===mode.theme&&s.settings.highContrast===mode.highContrast);
   await expectPages(mode);
   await ui.locator('#address').hover();
   assert.equal(await ui.locator('#theme-icon').evaluate(e=>e.style.transform),'rotate('+angle+'deg)');
   assert.equal(await ui.locator('#theme-button').getAttribute('data-position'),String(mode.index));
   const icon=await ui.locator('#theme-icon').evaluate(e=>{const s=getComputedStyle(e);return {fill:s.fill,color:s.color,stroke:s.stroke,background:s.backgroundColor,use:e.querySelector('use').getAttribute('href')};});
   const color=mode.theme==='light'?'rgb(0, 0, 0)':'rgb(255, 255, 255)';
   assert.deepEqual(icon,{fill:'none',color,stroke:color,background:'rgba(0, 0, 0, 0)',use:'#i-theme'});
   assert.equal(await ui.locator('#i-theme path').getAttribute('d'),'M12 3a9 9 0 0 0 0 18Z');
   const controls=ui.locator('.icon-button,.tab-close,.reorder-handle');let checked=0;
   for(let i=0;i<await controls.count();i++){const button=controls.nth(i);if(!await button.isVisible())continue;await button.hover();assert.equal(await button.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)',await button.getAttribute('id'));checked++;}
   await ui.locator('#address').hover();
   const current=JSON.parse(await active('JSON.stringify(galleryPhysics.snapshot())'));
   assert.equal(current.loadedCount,loaded.loaded);assert.equal(current.count,loaded.count);assert.equal(current.option,'all');assert.ok(current.elapsed>=loaded.elapsed);
   await ui.screenshot({path:path.join(out,(process.env.FLASHBORN_EXE?'packaged-':'')+mode.theme+'-'+mode.highContrast+'.png')});
   checks.push({theme:mode.theme,highContrast:mode.highContrast,angle,transparentInlineIcons:checked,projectsRetained:current.count});
   console.log('PASS '+JSON.stringify(checks.at(-1)));
  }
  // Contrast-only Settings edits must be broadcast, even though theme stays put.
  for(const highContrast of [true,false]){await command('settings',{highContrast});await expectPages(highContrast?modes[2]:modes[3]);}
  await command('new-tab');await command('navigate',{value:url});
  await poll(()=>active('typeof galleryPhysics'),v=>v==='object');const regularId=(await state()).activeId;
  await command('new-flashcognito');await command('panel',{name:'library'});
  await poll(()=>active('typeof galleryPhysics'),v=>v==='object');
  for(const mode of modes){await command('settings',{darkTheme:mode.theme!=='light',highContrast:mode.highContrast});await expectPages(mode,3);}
  await command('select-tab',{id:regularId});
  await expectPages(modes[3],3);
  checks.push({threeGallerySurfaces:true,contrastOnlyBroadcasts:true});
  // Persist a white high-contrast state and check the first Gallery response.
  await command('settings',{darkTheme:false,highContrast:true});await expectPages(modes[0],3);
  await app.close();app=null;await launch();await command('panel',{name:'library'});
  await poll(()=>active('typeof galleryPhysics'),v=>v==='object');await expectPages(modes[0]);
  assert.equal((await state()).settings.highContrast,true);
  checks.push({restartRetainsLightHighContrast:true});
  const result={passed:true,version:require('../package.json').version,gallerySHA256:crypto.createHash('sha256').update(html).digest('hex'),checks};
  fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-results.json':'source-results.json'),JSON.stringify(result,null,2));
  console.log('PASS all four theme states, hover preview, transparent original icon, icon backgrounds, all Gallery surfaces, contrast-only updates and restart persistence');
 }finally{if(app)await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
