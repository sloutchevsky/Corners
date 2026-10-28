'use strict';
const { _electron: electron } = require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=25000){let v;const end=Date.now()+timeout;do{v=await read();if(check(v))return v;await wait(60);}while(Date.now()<end);throw Error('Timeout: '+JSON.stringify(v));}
(async()=>{
 const profile=path.join(output,'appearance-thumbnails-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Thumbnail '+req.url+'</title><style>html,body{margin:0;width:100%;height:100%;background:#226d91}aside{position:fixed;right:0;top:0;width:10%;height:100%;background:#ff00ff}</style><aside></aside>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app,ui;const passed=[],pass=s=>{passed.push(s);console.log('PASS '+s);};
 const launch=async()=>{app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:70,y:70,width:1280,height:900});w.show();w.focus();});};
 const command=(action,args={})=>app.evaluate(({},d)=>global.__flashborn.command(d.action,d.args),{action,args});
 const state=()=>app.evaluate(()=>global.__flashborn.getState());
 const capture=async()=>{await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId).loading);return poll(()=>app.evaluate(async()=>{const f=global.__flashborn;await f.requestTabSnapshot(f.activeTab());return f.tabSnapshots.get(f.activeTab());}),Boolean);};
 const picture=async(id)=>ui.locator('[data-reorder-id="'+id+'"]').evaluate(row=>{const art=row.querySelector('.tab-thumbnail'),img=art.querySelector('img');return {width:art.getBoundingClientRect().width,display:getComputedStyle(art).display,hasImage:!img.hidden&&!!img.src,iconOpacity:+getComputedStyle(row.querySelector('.tab-icon')).opacity};});
 const appearance=()=>ui.evaluate(()=>Object.fromEntries(['body','.titlebar','.toolbar','.sidebar','.statusbar','.content'].map(s=>[s,getComputedStyle(document.querySelector(s)).backgroundColor])));
 try{
  await launch();await command('panel',{name:'settings'});await ui.locator('#darkTheme').waitFor();
  assert.equal(await ui.locator('#darkTheme').isChecked(),true);assert.equal(await ui.locator('#highContrast').isChecked(),false);
  assert.equal(await ui.locator('.title-note').count(),0);assert.equal((await appearance())['.sidebar'],'rgb(23, 23, 23)');
  pass('Appearance defaults preserve the current dark grey theme; the tagline is removed');
  for(const light of [false,true]){
   await ui.locator('#darkTheme').setChecked(!light);await poll(state,s=>(s.settings.theme==='light')===light);
   await ui.locator('#highContrast').check();await poll(state,s=>s.settings.highContrast===true);await wait(100);
   const colors=await appearance(),expected=light?'rgb(255, 255, 255)':'rgb(0, 0, 0)';
   for(const color of Object.values(colors))assert.equal(color,expected,JSON.stringify(colors));
   await command('menu',{width:280,height:780,top:100});
   const menu=await poll(()=>app.evaluate(()=>global.__flashborn.menuWindow?.webContents.executeJavaScript('({contrast:document.body.dataset.contrast,bg:getComputedStyle(document.querySelector(".menu-surface")).backgroundColor})')),v=>v?.contrast==='high');
   assert.equal(menu.bg,expected);await command('menu-close');
   await ui.screenshot({path:path.join(output,'appearance-'+(light?'light':'dark')+'-high-contrast.png')});
   await ui.locator('#highContrast').uncheck();await poll(state,s=>!s.settings.highContrast);await wait(80);
   assert.equal((await appearance())['.sidebar'],light?'rgb(222, 222, 222)':'rgb(23, 23, 23)');
  }
  pass('Both Settings switches update immediately; black/white chrome and menu backgrounds revert to the original greys when contrast is off');
  await ui.locator('#darkTheme').check();await poll(state,s=>s.settings.theme==='current');
  for(const [dark,contrast] of [[false,true],[false,false],[true,true],[true,false]]){
   await ui.locator('#theme-button').click();await poll(state,s=>(s.settings.theme!=='light')===dark&&s.settings.highContrast===contrast);
   assert.equal(await ui.locator('#darkTheme').isChecked(),dark);assert.equal(await ui.locator('#highContrast').isChecked(),contrast);
  }
  pass('All four toolbar positions keep both Appearance switches synchronized');
  const ids=[];
  for(const page of ['/alpha','/bravo']){
   if(ids.length)await command('new-tab');await command('navigate',{value:base+page});await capture();ids.push((await state()).activeId);
  }
  const crop=await app.evaluate(async({nativeImage})=>{const f=global.__flashborn,t=f.activeTab(),frame=f.tabSnapshots.get(t),full=await t.view.webContents.capturePage(),size=full.getSize(),w=Math.floor(size.width*.9),scale=Math.min(512/w,320/size.height,1),image=nativeImage.createFromDataURL(frame.data),p=image.toBitmap(),s=image.getSize(),x=s.width-3,y=Math.floor(s.height/2),offset=(y*s.width+x)*4;return {actual:s,expected:{width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(size.height*scale))},edge:[p[offset+2],p[offset+1],p[offset]]};});
  assert.deepEqual(crop.actual,crop.expected);assert.ok(Math.abs(crop.edge[0]-34)<15&&Math.abs(crop.edge[1]-109)<15&&Math.abs(crop.edge[2]-145)<15,JSON.stringify(crop));
  pass('Modern captures remove the rightmost 10% before resizing; a magenta scrollbar-edge fixture is absent from the JPEG');
  await ui.locator('#address').hover();await wait(230);await command('collapse');await wait(300);
  assert.equal((await picture(ids[1])).width,68);assert.equal((await picture(ids[1])).hasImage,true);assert.equal((await picture(ids[1])).iconOpacity,0);
  assert.equal((await picture(ids[0])).width,0);
  await ui.evaluate(id=>{window.__thumbWidths=[];const tile=document.querySelector('[data-reorder-id="'+id+'"] .tab-thumbnail'),start=performance.now();function frame(){window.__thumbWidths.push(tile.getBoundingClientRect().width);if(performance.now()-start<350)requestAnimationFrame(frame);}frame();},ids[0]);
  await ui.locator('[data-reorder-id="'+ids[0]+'"]').hover();await wait(280);
  assert.equal((await picture(ids[0])).width,68);assert.equal((await picture(ids[0])).hasImage,true);assert.equal((await picture(ids[1])).width,68);
  assert.ok((await ui.evaluate(()=>window.__thumbWidths)).some(w=>w>0&&w<68));
  await ui.locator('#address').hover();await wait(260);assert.equal((await picture(ids[0])).width,0);assert.equal((await picture(ids[1])).width,68);
  assert.equal((await state()).activeId,ids[1]);
  await ui.screenshot({path:path.join(output,'thumbnail-collapsed-selected.png')});
  pass('Collapsed selection retains its thumbnail while another tab slides its preview in and out without changing selection');
  const movie=require('./html-fixture')(path.join(profile,'flash'),require('./playback-fixture'));
  await app.evaluate(({},file)=>global.__flashborn.openLocal(file),movie);
  await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native?.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))').catch(()=>0)),v=>v>2);
  await capture();const nativeCrop=await app.evaluate(async({nativeImage})=>{const n=global.__flashborn.activeTab().native,full=nativeImage.createFromBuffer(Buffer.from(await n.call('capture'),'base64')).getSize(),thumb=await n.call('snapshot'),preview=await n.call('snapshot',{windowPreview:true}),w=Math.floor(full.width*.9),scale=Math.min(512/w,320/full.height,1),ps=Math.min(1600/full.width,1000/full.height,1);return {thumb:{width:thumb.width,height:thumb.height},expected:{width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(full.height*scale))},preview:{width:preview.width,height:preview.height},expectedPreview:{width:Math.max(1,Math.round(full.width*ps)),height:Math.max(1,Math.round(full.height*ps))}};});
  assert.deepEqual(nativeCrop.thumb,nativeCrop.expected);assert.deepEqual(nativeCrop.preview,nativeCrop.expectedPreview);
  pass('Adobe Flash thumbnails use the same crop; full window and Alt-Tab previews keep their complete image');
  await command('new-flashcognito');await command('navigate',{value:base+'/private'});await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId).loading);await command('tab-snapshot',{id:(await state()).activeId});
  assert.equal(await ui.locator('.tab.active .tab-thumbnail img').getAttribute('src'),null);
  assert.equal(await ui.locator('.tab.active .tab-icon use').getAttribute('href'),'#i-lock');
  pass('Flashcognito keeps its lock placeholder and never captures page pixels');
  await command('panel',{name:'settings'});await ui.locator('#darkTheme').uncheck();await ui.locator('#highContrast').check();await poll(state,s=>s.settings.theme==='light'&&s.settings.highContrast);
  await app.close();app=null;await launch();await command('panel',{name:'settings'});await ui.locator('#highContrast').waitFor();
  assert.equal(await ui.locator('#darkTheme').isChecked(),false);assert.equal(await ui.locator('#highContrast').isChecked(),true);assert.equal((await appearance())['.sidebar'],'rgb(255, 255, 255)');
  pass('Theme and contrast preferences persist across a complete restart');
  fs.writeFileSync(path.join(output,'appearance-thumbnails-results.json'),JSON.stringify({passed,profile,crop,nativeCrop},null,2));
 }finally{if(app)await app.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
