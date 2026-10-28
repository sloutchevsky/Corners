'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/browser-stage-edges'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=25000){let v;const end=Date.now()+timeout;do{v=await read();if(check(v))return v;await wait(60);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({libraryPageOnboarded:true,settings:{restoreTabs:false,adBlockEnabled:false}}));
 const html='<!doctype html><title>Scrollbar test</title><style>html,body{margin:0}body{width:5000px;height:6000px;background:#121212;color:white}</style><h1>Scrollbar input test</h1>';
 const server=http.createServer((req,res)=>res.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/ordinary';
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});const checks=[];
 const command=(action,args={})=>app.evaluate(({},v)=>global.__flashborn.command(v.action,v.args),{action,args});
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow();await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:50,y:50,width:1400,height:1050});w.show();w.focus();});
  // The refresh control is enabled on every special page and precedes Theme.
  for(const name of ['bookmarks','history','downloads','settings','about','support','extensions']){
   await command('panel',{name});await ui.locator('#reload').waitFor();const reload=await ui.locator('#reload').boundingBox(),theme=await ui.locator('#theme-button').boundingBox();assert.ok(reload.x+reload.width<theme.x);assert.equal(await ui.locator('#reload').isEnabled(),true);
   await ui.locator('#content').evaluate(e=>e.firstElementChild.dataset.reloadProbe='old');await ui.locator('#reload').click();await poll(()=>ui.locator('#content').evaluate(e=>!e.querySelector('[data-reload-probe]')&&e.children.length>0),Boolean);
   assert.equal(await ui.locator('.statusbar').isVisible(),false);const content=await ui.locator('#content').boundingBox();assert.ok(Math.abs(content.y+content.height-await ui.evaluate(()=>innerHeight))<1);
  }
  await command('new-tab');await command('navigate',{value:url});await poll(()=>app.evaluate(()=>global.__flashborn.activeContent()?.view?.webContents.getURL()),v=>v===url);
  const probe=`(()=>{const e=document.documentElement,s=getComputedStyle(e,'::-webkit-scrollbar'),t=getComputedStyle(e,'::-webkit-scrollbar-thumb'),b=getComputedStyle(e,'::-webkit-scrollbar-button');return {w:innerWidth,h:innerHeight,clientWidth:e.clientWidth,clientHeight:e.clientHeight,x:scrollX,y:scrollY,barWidth:s.width,barHeight:s.height,thumb:t.backgroundColor,radius:t.borderRadius,arrows:b.display};})()`;
  async function engineCheck(engine){
   const evaluate=code=>app.evaluate(async({},v)=>{const t=global.__flashborn.activeContent();return v.engine==='native'?t.native.evaluate(v.code):t.view.webContents.executeJavaScript(v.code);},{engine,code});
   const mouse=async(type,x,y)=>app.evaluate(async({},v)=>{const t=global.__flashborn.activeContent();if(v.engine==='native')return t.native.call('test-mouse',{type:v.type,x:v.x,y:v.y,button:v.type==='mouseMove'?'none':'left',clickCount:1});const wc=t.view.webContents;wc.focus();if(!wc.debugger.isAttached())wc.debugger.attach('1.3');return wc.debugger.sendCommand('Input.dispatchMouseEvent',{type:{mouseMove:'mouseMoved',mouseDown:'mousePressed',mouseUp:'mouseReleased'}[v.type],x:v.x,y:v.y,button:v.type==='mouseMove'?'none':'left',buttons:v.type==='mouseDown'?1:0,clickCount:1});},{engine,type,x:Math.round(x),y:Math.round(y)});
   const click=async(x,y)=>{await mouse('mouseMove',x,y);await wait(30);await mouse('mouseDown',x,y);await wait(30);await mouse('mouseUp',x,y);};
   const p=await poll(()=>evaluate(probe),p=>p.barWidth==='15px');assert.equal(p.barHeight,'15px');assert.equal(p.radius,'0px');assert.equal(p.thumb,'rgb(51, 51, 51)');assert.equal(p.arrows,'none');
   const bounds=await app.evaluate(({},engine)=>{const t=global.__flashborn.activeContent();return {host:global.__flashborn.win.getContentBounds(),stage:engine==='native'?t.native.viewport:t.view.getBounds(),corner:global.__flashborn.corner.view.getBounds(),cornerContent:global.__flashborn.corner.popup.getContentBounds(),cornerHandle:Number(global.__flashborn.corner.popup.getNativeWindowHandle().readBigUInt64LE())};},engine);
   assert.equal(bounds.stage.x+bounds.stage.width,bounds.host.width);assert.equal(bounds.stage.y+bounds.stage.height,bounds.host.height);assert.ok(Math.abs(bounds.corner.x+40-(bounds.host.x+bounds.host.width)-15)<1.1,JSON.stringify(bounds));assert.ok(Math.abs(bounds.corner.y+40-(bounds.host.y+bounds.host.height)-15)<1.1);assert.ok(bounds.corner.width>=40&&bounds.corner.height>=40);
   console.log('CHECK '+engine+' '+JSON.stringify(p));await click(p.w-7,p.h*.72);await poll(()=>evaluate('scrollY'),y=>y>100);await evaluate('scrollTo(0,3000)');await wait(100);await click(p.w-7,10);await poll(()=>evaluate('scrollY'),y=>y<2900);
   await evaluate('scrollTo(0,0)');await wait(100);await click(p.w*.72,p.h-7);await poll(()=>evaluate('scrollX'),x=>x>100);
   await mouse('mouseMove',p.w-7,10);await wait(80);
   const capture=()=>app.evaluate(async({},engine)=>{const t=global.__flashborn.activeContent();return engine==='native'?t.native.call('capture'):(await t.view.webContents.capturePage()).toPNG().toString('base64');},engine);
   const pixel=async()=>app.evaluate(({nativeImage},v)=>{const image=nativeImage.createFromBuffer(Buffer.from(v.png,'base64')),size=image.getSize(),x=Math.round((v.w-7)*size.width/v.w),y=Math.round(20*size.height/v.h),o=(y*size.width+x)*4,b=image.toBitmap();return [b[o+2],b[o+1],b[o]];},{png:await capture(),w:p.w,h:p.h});
   await evaluate('scrollTo(0,0)');await mouse('mouseMove',p.w-7,20);await wait(120);assert.deepEqual(await pixel(),[128,128,128],engine+' dark hover');
   await mouse('mouseDown',p.w-7,20);await wait(80);assert.deepEqual(await pixel(),[255,255,255],engine+' dark pressed');await mouse('mouseUp',p.w-7,20);
   await command('settings',{darkTheme:false});await mouse('mouseMove',50,50);await poll(()=>evaluate(probe),s=>['rgb(170, 170, 170)','rgb(119, 119, 119)'].includes(s.thumb));
   await mouse('mouseMove',p.w-7,20);await wait(120);assert.deepEqual(await pixel(),[119,119,119],engine+' light hover');
   await mouse('mouseDown',p.w-7,20);await wait(80);assert.deepEqual(await pixel(),[0,0,0],engine+' light pressed');await mouse('mouseUp',p.w-7,20);await command('settings',{darkTheme:true});await mouse('mouseMove',50,50);
   checks.push({engine,flushEdges:true,rectangular15px:true,noArrows:true,verticalTrackDown:true,verticalTrackUp:true,horizontalTrack:true});
  }
  await engineCheck('modern');
  // A real PPAPI movie shares the viewport with a long, wide HTML document.
  const file=require('./html-fixture')(path.join(profile,'movie'),require('./playback-fixture'));fs.appendFileSync(file,'<div style="width:5000px;height:6000px"></div>');
  await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),file);await poll(()=>app.evaluate(()=>global.__flashborn.activeContent()?.native?.isPresented()),Boolean);await engineCheck('native');
  const hit=await app.evaluate(()=>({hwnd:Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE()),movie:global.__flashborn.activeContent().native.hwnd,corner:Number(global.__flashborn.corner.popup.getNativeWindowHandle().readBigUInt64LE())}));
  const user=require('koffi').load('user32.dll'),getRect=user.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'),at=user.func('intptr_t __stdcall WindowFromPoint(uint64_t)'),ancestor=user.func('intptr_t __stdcall GetAncestor(intptr_t,uint32_t)');
  const dpi=user.func('intptr_t __stdcall SetThreadDpiAwarenessContext(intptr_t)'),previousDPI=dpi(-4);const r=[0,0,0,0];getRect(hit.hwnd,r);const point=(x,y)=>Number(ancestor(at((BigInt(y>>>0)<<32n)|BigInt(x>>>0)),2));
  hit.grip=point(r[2]-15,r[3]-15);hit.edge=point(r[2]-7,r[3]-80);dpi(previousDPI);
  assert.equal(hit.grip,hit.corner,'The entire grip must receive browser input over Flash');assert.equal(hit.edge,hit.movie,'The movie scrollbar must remain at the outer edge');
  await app.evaluate(()=>{global.__flashborn.win.setTitle('Corners corner drag test');});
  const corner=await app.evaluate(()=>global.__flashborn.corner.view.webContents.executeJavaScript(`({cursor:getComputedStyle(document.body).cursor,right:parseFloat(getComputedStyle(document.body,'::after').borderRightWidth),bottom:parseFloat(getComputedStyle(document.body,'::after').borderBottomWidth)})`));assert.equal(corner.cursor,'nwse-resize');assert.ok(Math.abs(corner.right-15)<1&&Math.abs(corner.bottom-15)<1);
  async function cornerGeometry(inside){
   await wait(200);const p=await app.evaluate(({screen},koffiPath)=>{const f=global.__flashborn,u=process.mainModule.require(koffiPath).load('user32.dll'),rect=u.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'),client=u.func('int __stdcall GetClientRect(intptr_t,_Out_ int32_t*)'),origin=u.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)'),h=Number(f.win.getNativeWindowHandle().readBigUInt64LE()),area=[0,0,0,0],o=[0,0];client(h,area);origin(h,o);return {host:{x:o[0],y:o[1],width:area[2],height:area[3]},scale:screen.getDisplayMatching(f.win.getBounds()).scaleFactor,corners:[f.corner,f.topLeftCorner].map(c=>{const r=[0,0,0,0];rect(Number(c.popup.getNativeWindowHandle().readBigUInt64LE()),r);return {edge:c.edge,x:r[0],y:r[1],owner:c.popup.getParentWindow().id,host:c.window.id,visible:c.popup.isVisible()};})};},require.resolve('koffi'));
   const size=Math.round(40*p.scale),outside=inside?0:Math.round(15*p.scale);
   for(const c of p.corners){assert.equal(c.owner,c.host);assert.equal(c.visible,true);const x=c.edge==='top-left'?p.host.x-outside:p.host.x+p.host.width-size+outside,y=c.edge==='top-left'?p.host.y-outside:p.host.y+p.host.height-size+outside;assert.ok(Math.abs(c.x-x)<=(inside?3:1)&&Math.abs(c.y-y)<=(inside?3:1),JSON.stringify({p,expected:{x,y}}));}
  }
  await cornerGeometry(false);
  for(const [darkTheme,activeColor,hoverColor]of [[true,'rgb(255, 255, 255)','rgb(128, 128, 128)'],[false,'rgb(0, 0, 0)','rgb(119, 119, 119)']]){
   await command('settings',{darkTheme});await wait(100);
   for(const key of ['corner','topLeftCorner']){
    const read=()=>app.evaluate(({},key)=>global.__flashborn[key].popup.webContents.executeJavaScript(`({opacity:getComputedStyle(document.body,'::after').opacity,color:getComputedStyle(document.body,'::after').borderColor,width:document.body.getBoundingClientRect().width,height:document.body.getBoundingClientRect().height})`),key);
    await app.evaluate(({},key)=>global.__flashborn[key].popup.webContents.sendInputEvent({type:'mouseLeave',x:0,y:0}),key);await wait(60);assert.equal((await read()).opacity,'0.5');assert.equal((await read()).width,40);assert.equal((await read()).height,40);
    await app.evaluate(({},key)=>global.__flashborn[key].popup.webContents.sendInputEvent({type:'mouseMove',x:20,y:20}),key);await wait(60);assert.equal((await read()).opacity,'1');assert.equal((await read()).color,hoverColor);
    await app.evaluate(({},key)=>global.__flashborn[key].setResizing(true),key);await wait(60);assert.equal((await read()).color,activeColor);await app.evaluate(({},key)=>global.__flashborn[key].setResizing(false),key);
   }
  }
  await app.evaluate(()=>global.__flashborn.win.maximize());await cornerGeometry(true);await app.evaluate(()=>global.__flashborn.win.unmaximize());await cornerGeometry(false);
  await command('fullscreen',{value:true});await cornerGeometry(true);await command('fullscreen',{value:false});await cornerGeometry(false);
  await app.evaluate(()=>global.__flashborn.win.minimize());await poll(()=>app.evaluate(()=>!global.__flashborn.corner.popup.isVisible()&&!global.__flashborn.topLeftCorner.popup.isVisible()),Boolean);await app.evaluate(()=>{global.__flashborn.win.restore();global.__flashborn.win.focus();});await cornerGeometry(false);
  const report={passed:true,version:require('../package.json').version,checks,refreshSpecialPages:true,noBottomFrame:true,corner:{size:40,stroke:15,fullInputAreaOverFlash:true}};fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-results.json':'source-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(process.env.FLASHBORN_EDGE_HOLD){fs.rmSync(path.join(out,'stop-hold'),{force:true});fs.writeFileSync(path.join(out,'holding.json'),JSON.stringify({profile,until:Date.now()+180000}));while(!fs.existsSync(path.join(out,'stop-hold'))&&Date.now()-fs.statSync(path.join(out,'holding.json')).mtimeMs<180000)await wait(500);}
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
