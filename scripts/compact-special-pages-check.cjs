'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/compact-special-pages'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=30000){let v;const end=Date.now()+timeout;do{v=await read();if(check(v))return v;await wait(60);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const html=fs.readFileSync(path.join(root,'site/flash-gallery/flash.gallery.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(req.url.startsWith('/flash.gallery.html')?html:'<!doctype html><title>Ordinary page</title><h1>Ordinary page</h1>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 const bookmarks=[1,2,3].map(id=>({id:'bookmark-'+id,title:'Bookmark '+id,url:base+'/page-'+id})),history=bookmarks.map((b,i)=>({...b,id:'history-'+i,visitedAt:Date.now()-i*1000})),downloads=bookmarks.map((b,i)=>({id:'download-'+i,filename:'Archive '+i+'.zip',url:b.url,path:path.join(profile,'Archive '+i+'.zip'),received:100,total:100,state:'completed'}));
 fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({bookmarks,history,downloads,libraryPageOnboarded:true,settings:{restoreTabs:false,adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:base+'/flash.gallery.html'};delete env.ELECTRON_RUN_AS_NODE;
 let app,ui;const checks=[];
 try{
  app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();
  const command=(action,args={})=>app.evaluate(({},v)=>global.__flashborn.command(v.action,v.args),{action,args}),state=()=>app.evaluate(()=>global.__flashborn.getState());
  await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:50,y:50,width:1400,height:1050});w.show();w.focus();});
  const chrome=async()=>{await poll(()=>ui.locator('body').getAttribute('class'),v=>v?.includes('special-page'));assert.equal(await ui.locator('#address').isVisible(),false);assert.equal(await ui.locator('#native-mode').isVisible(),false);assert.equal(await ui.locator('#back').isVisible(),false);assert.equal(await ui.locator('#forward').isVisible(),false);assert.ok(await ui.locator('#reload').isVisible());assert.equal(await ui.locator('#reload').isEnabled(),true);assert.ok(await ui.locator('#theme-button').isVisible());assert.ok(await ui.locator('#menu-button').isVisible());const box=await ui.locator('#content').boundingBox();assert.equal(box.y,60);for(const id of ['reload','theme-button','menu-button']){const r=await ui.locator('#'+id).boundingBox();assert.ok(r.y>=36&&r.y+r.height<=60,JSON.stringify({id,r}));}};
  await chrome();
  for(const [darkTheme,highContrast] of [[true,false],[true,true],[false,false],[false,true]]){
   await command('settings',{darkTheme,highContrast});
   for(const name of ['history','bookmarks','downloads','settings','about','support','extensions']){
    await command('panel',{name});await poll(state,s=>s.panel===name);await chrome();await ui.locator('.panel').waitFor();
    const r=await ui.locator('.panel').boundingBox();assert.equal(r.y,60);
    if(['history','bookmarks','downloads'].includes(name)){
     const rows=await ui.locator('.collection-row').evaluateAll(items=>items.map(e=>{const r=e.getBoundingClientRect(),t=e.querySelector('.collection-thumbnail').getBoundingClientRect();return {top:r.top,height:r.height,width:t.width,tileHeight:t.height};}));assert.ok(rows.length>=3);for(let i=1;i<3;i++)assert.ok(Math.abs(rows[i].top-rows[i-1].top-150)<.01);assert.ok(rows.every(r=>r.height===48&&r.width===96&&r.tileHeight===48));
     checks.push({name,darkTheme,highContrast,rowPitch:150});
    }
   }
   await command('panel',{name:'bookmarks'});await ui.screenshot({path:path.join(out,(process.env.FLASHBORN_EXE?'packaged-':'source-')+(darkTheme?'dark':'light')+(highContrast?'-high':'')+'.png')});
  }
  await command('new-tab');await chrome();await command('new-flashcognito');await chrome();await command('new-tab');await chrome();await wait(250);
  // Hidden by default, but address keyboard navigation must remain usable.
  await ui.locator('#home-input').click();
  const addressShortcut=()=>app.evaluate(()=>{const wc=global.__flashborn.win.webContents;wc.sendInputEvent({type:'keyDown',keyCode:'L',modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'L',modifiers:['control']});});
  await addressShortcut();await poll(()=>ui.locator('#address').isVisible(),Boolean);await ui.locator('#address').fill(base+'/ordinary');await ui.keyboard.press('Escape');assert.equal(await ui.locator('#address').isVisible(),false);
  await addressShortcut();await ui.locator('#address').fill(base+'/ordinary');await ui.keyboard.press('Enter');await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.url===base+'/ordinary');await poll(()=>ui.locator('body').getAttribute('class'),v=>!v?.includes('special-page'));assert.ok(await ui.locator('#address').isVisible());
  const ordinary=await app.evaluate(()=>global.__flashborn.activeContent().view.getBounds());assert.equal(ordinary.y,100);
  await command('panel',{name:'library'});await poll(()=>ui.locator('.gallery-stage:not([hidden])').count(),n=>n===1);await chrome();
  const nativeBounds=()=>ui.locator('.gallery-stage:not([hidden])').boundingBox();assert.equal((await nativeBounds()).y,0);
  await ui.locator('#menu-button').click();await poll(()=>app.evaluate(()=>!!global.__flashborn.menuWindow?.isVisible()),Boolean);await wait(500);
  const menu=await app.evaluate(()=>({host:global.__flashborn.win.getContentBounds(),menu:global.__flashborn.menuWindow.getBounds()}));assert.equal(menu.menu.y-menu.host.y,60);assert.ok(Math.abs(menu.menu.x+menu.menu.width-menu.host.x-menu.host.width)<=1.1);await command('menu-close');
  await command('collapse');await wait(600);await chrome();assert.equal((await nativeBounds()).y,0);await command('collapse');await wait(600);
  await command('fullscreen',{value:true});await poll(nativeBounds,r=>r.y===0);assert.equal(await ui.locator('#theme-button').isVisible(),false);await command('fullscreen',{value:false});await poll(nativeBounds,r=>r.y===0);await chrome();
  await app.evaluate(()=>global.__flashborn.win.maximize());await wait(600);assert.equal((await nativeBounds()).y,0);await app.evaluate(()=>global.__flashborn.win.unmaximize());await wait(600);await chrome();
  const report={passed:true,version:require('../package.json').version,checks,specialContentTop:60,ordinaryContentTop:100,keyboardAddress:true,singleHTMLGallery:true,menuAligned:true,sidebarFullscreenMaximize:true};fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-results.json':'source-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(app)await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});








