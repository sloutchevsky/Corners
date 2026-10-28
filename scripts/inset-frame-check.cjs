'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,process.env.CORNERS_CLEAR_TEST?'test-output/clear-frame':'test-output/inset-frame'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,test,timeout=20000){let v;const end=Date.now()+timeout;do{v=await read();if(test(v))return v;await wait(60);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile);fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{restoreTabs:false,adBlockEnabled:false}}));
 const server=http.createServer((req,res)=>res.end('<!doctype html><html><body style="margin:0;background:#383b45;color:white"><h1>In-window frame test</h1><div style="width:4000px;height:5000px;background:linear-gradient(#383b45,#708090)">Scroll test</div></body></html>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
 app.process().stderr?.on('data',b=>fs.appendFileSync(path.join(out,'stderr.log'),b));
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow(),errors=[];ui.on('pageerror',e=>errors.push(e.message));
  const cmd=(action,args={})=>app.evaluate(({},v)=>global.__flashborn.command(v.action,v.args),{action,args});
  await app.evaluate(async({BrowserWindow})=>{if(process.env.CORNERS_CLEAR_TEST){global.__frameBackdrop=new BrowserWindow({x:1450,y:50,width:1500,height:1100,frame:false,show:false,focusable:true,skipTaskbar:true,backgroundColor:'#eef5ff',webPreferences:{sandbox:true}});await global.__frameBackdrop.loadURL('data:text/html,<style>html{background:%23eef5ff}</style><title>Owned frame verification backdrop</title>');global.__frameBackdrop.showInactive();}});
  await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:1550,y:120,width:1250,height:850});w.show();w.focus();w.setTitle('Corners — masked frame test');});await wait(250);
  const surface=await ui.locator('#browser-surface').boundingBox();assert.equal(surface.x,15);assert.equal(surface.y,15);assert.ok(Math.abs(surface.width-1220)<2&&Math.abs(surface.height-820)<2,JSON.stringify(surface));
  await cmd('new-tab');await cmd('navigate',{value:'http://127.0.0.1:'+server.address().port});await poll(()=>app.evaluate(()=>global.__flashborn.edgeScrollbars.state),v=>v?.scrollHeight>=5000);
  const geometry=await app.evaluate(({BrowserWindow})=>{const g=global.__flashborn;return {windows:BrowserWindow.getAllWindows().map(w=>w.getTitle()),size:g.win.getContentSize(),view:g.activeContent().view.getBounds(),corners:[g.corner,g.topLeftCorner].map(c=>({rect:c.rect,type:c.view.constructor.name})),bars:g.edgeScrollbars.bars.map(b=>({axis:b.axis,visible:b.visible,rect:b.rect,type:b.view.constructor.name}))};});
  assert.ok(!geometry.windows.some(t=>/Resize browser|scrollbar/.test(t)),'Functional edge controls must not be top-level windows');
  assert.equal(geometry.view.x,335);assert.equal(geometry.view.y,115);assert.equal(geometry.view.width,geometry.size[0]-350);assert.equal(geometry.view.height,geometry.size[1]-130);
  for(const c of [...geometry.corners,...geometry.bars]){assert.equal(c.type,'WebContentsView');assert.ok(c.rect.x>=0&&c.rect.y>=0&&c.rect.x+c.rect.width<=geometry.size[0]&&c.rect.y+c.rect.height<=geometry.size[1]);}

  if(process.env.CORNERS_CLEAR_TEST){
   const visuals=[];
   for(const [darkTheme,highContrast]of [[true,false],[true,true],[false,true],[false,false]]){
   await cmd('settings',{darkTheme,highContrast});await app.evaluate(()=>{global.__frameBackdrop.moveTop();global.__flashborn.win.moveTop();global.__flashborn.win.focus();});await wait(160);
   const visual=await app.evaluate(({},module)=>{
    const k=process.mainModule.require(module),u=k.load('user32.dll'),gd=k.load('gdi32.dll'),getDC=u.func('intptr_t __stdcall GetDC(intptr_t)'),release=u.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'),pixel=gd.func('uint32_t __stdcall GetPixel(intptr_t,int,int)'),origin=u.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)'),at=u.func('intptr_t __stdcall WindowFromPoint(uint64_t)'),ancestor=u.func('intptr_t __stdcall GetAncestor(intptr_t,uint32_t)');
    global.__readFramePixels=(special=false)=>{
     const f=global.__flashborn,h=Number(f.win.getNativeWindowHandle().readBigUInt64LE()),back=Number(global.__frameBackdrop.getNativeWindowHandle().readBigUInt64LE()),p=[0,0],scale=process.mainModule.require('electron').screen.getDisplayMatching(f.win.getBounds()).scaleFactor,[width,height]=f.win.getContentSize();origin(h,p);const dc=getDC(0);
     const points=special?[['left',3,200],['top-over-sidebar',100,3],['bottom-over-sidebar',100,height-3],['stage-top',420,3],['stage-top-14',420,14],['stage-bottom',420,height-3],['stage-bottom-14',420,height-14],['inner-top',420,16],['inner-bottom',420,height-16]]:[['left',3,200],['top',600,3],['bottom',100,height-3],['right-above-track',width-3,55]];
     try{return {bounds:f.win.getBounds(),samples:points.map(([name,x,y])=>{x=p[0]+Math.round(x*scale);y=p[1]+Math.round(y*scale);const color=pixel(dc,x,y),root=Number(ancestor(at((BigInt(y>>>0)<<32n)|BigInt(x>>>0)),2));return {name,owner:root,backdrop:back,host:h,rgb:[color&255,color>>>8&255,color>>>16&255],passesToBackdrop:root===back,passesToUnderlying:root!==h&&root!==0,stillOwnedByBrowser:root===h};})};}finally{release(0,dc);}
    };
    return global.__readFramePixels();
   },path.join(root,'node_modules/koffi'));
   fs.writeFileSync(path.join(out,'perimeter-pixels.json'),JSON.stringify(visual,null,2));
   // Keep the owned backdrop immediately behind the host while sampling clear pixels and click-through ownership.
   for(const point of visual.samples){assert.ok(point.rgb.every((n,i)=>Math.abs(n-[238,245,255][i])<=2),'Unused perimeter is still painted: '+JSON.stringify(point));assert.ok(point.passesToBackdrop,'Unused perimeter still intercepts input: '+JSON.stringify(point));}
   visuals.push({darkTheme,highContrast,...visual});
   }
   fs.writeFileSync(path.join(out,'perimeter-all-themes.json'),JSON.stringify(visuals,null,2));
   console.log('PASS composed pixels and input pass through all four unused sides in all four themes');
  }
  for(const axis of ['vertical','horizontal']){
   await app.evaluate(({},axis)=>{const b=global.__flashborn.edgeScrollbars.bars.find(b=>b.axis===axis),p=axis==='vertical'?{x:7,y:b.length-3}:{x:b.length-3,y:7};for(const type of ['mouseDown','mouseUp'])b.view.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});},axis);
   await poll(()=>app.evaluate(({},axis)=>global.__flashborn.edgeScrollbars.state[axis==='vertical'?'scrollTop':'scrollLeft'],axis),n=>n>0);
   await app.evaluate(async({},axis)=>{const b=global.__flashborn.edgeScrollbars.bars.find(b=>b.axis===axis),vertical=axis==='vertical',r=await b.view.webContents.executeJavaScript('(()=>{const r=document.getElementById("thumb").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()'),start=vertical?{x:7,y:r.y+r.height/2}:{x:r.x+r.width/2,y:7},end=vertical?{x:7,y:b.length-1}:{x:b.length-1,y:7};for(const e of [{type:'mouseMove',...start},{type:'mouseDown',...start,button:'left',clickCount:1},{type:'mouseMove',...end,button:'left'},{type:'mouseUp',...end,button:'left',clickCount:1}])b.view.webContents.sendInputEvent(e);},axis);
   await poll(()=>app.evaluate(({},axis)=>{const s=global.__flashborn.edgeScrollbars.state;return axis==='vertical'?s.scrollHeight-s.clientHeight-s.scrollTop:s.scrollWidth-s.clientWidth-s.scrollLeft;},axis),n=>Math.abs(n)<3);
  }
  const resize=[];
  for(const key of ['corner','topLeftCorner']){
   await app.evaluate(()=>global.__flashborn.win.setBounds({x:1550,y:120,width:1250,height:850}));
   const result=await app.evaluate(({},key)=>{const g=global.__flashborn,c=g[key],w=g.win.getBounds();c.begin({x:w.x+c.rect.x+20,y:w.y+c.rect.y+20});const p=c.drag.point;c.step({x:p.x+57,y:p.y+43},true);const actual=g.win.getBounds();c.finish();return {key,start:w,actual};},key);
   assert.ok(Math.abs(result.actual.width-(result.start.width+(key==='corner'?57:-57)))<=2,JSON.stringify(result));assert.ok(Math.abs(result.actual.height-(result.start.height+(key==='corner'?43:-43)))<=2,JSON.stringify(result));resize.push(result);
   for(const mode of ['maximize','fullscreen']){
    await app.evaluate(({},mode)=>{const g=global.__flashborn;if(mode==='maximize')g.win.maximize();else g.command('fullscreen',{value:true});},mode);await wait(200);
    if(mode==='maximize'){const fit=await app.evaluate(({screen})=>{const g=global.__flashborn,b=g.win.getBounds(),work=screen.getDisplayMatching(b).workArea;return {b,work,rects:[g.corner.rect,g.topLeftCorner.rect,...g.edgeScrollbars.bars.filter(v=>v.visible).map(v=>v.rect)]};});for(const v of fit.rects){assert.ok(fit.b.x+v.x>=fit.work.x-2&&fit.b.y+v.y>=fit.work.y-2);assert.ok(fit.b.x+v.x+v.width<=fit.work.x+fit.work.width+2&&fit.b.y+v.y+v.height<=fit.work.y+fit.work.height+2);}}
    await app.evaluate(({},key)=>{const c=global.__flashborn[key],b=global.__flashborn.win.getContentBounds();c.undock({x:b.x+c.rect.x+20,y:b.y+c.rect.y+20});},key);
    await poll(()=>app.evaluate(()=>({max:global.__flashborn.win.isMaximized(),fs:global.__flashborn.getState().fullscreen,pending:!!(global.__flashborn.corner.pendingRestore||global.__flashborn.topLeftCorner.pendingRestore)})),v=>!v.max&&!v.fs&&!v.pending);
    for(const gesture of ['drag','double-click']){
     await app.evaluate(({},mode)=>{const g=global.__flashborn;if(mode==='maximize')g.win.maximize();else g.command('fullscreen',{value:true});},mode);await wait(180);
     await app.evaluate(({},v)=>{const wc=global.__flashborn[v.key].view.webContents;wc.focus();if(v.gesture==='drag'){for(const event of [{type:'mouseMove',x:30,y:30},{type:'mouseDown',x:30,y:30,button:'left',clickCount:1},{type:'mouseMove',x:5,y:5,button:'left'},{type:'mouseUp',x:5,y:5,button:'left',clickCount:1}])wc.sendInputEvent(event);}else{for(const count of [1,2])for(const type of ['mouseDown','mouseUp'])wc.sendInputEvent({type,x:25,y:25,button:'left',clickCount:count});}},{key,gesture});
     await poll(()=>app.evaluate(()=>({max:global.__flashborn.win.isMaximized(),fs:global.__flashborn.getState().fullscreen,pending:!!(global.__flashborn.corner.pendingRestore||global.__flashborn.topLeftCorner.pendingRestore)})),v=>!v.max&&!v.fs&&!v.pending);
    }
   }
  }
  await app.evaluate(()=>global.__flashborn.win.setBounds({x:1550,y:120,width:1250,height:850}));
  const movie=require('./html-fixture')(path.join(profile,'movie'),require('./playback-fixture'));fs.appendFileSync(movie,'<div style="width:4000px;height:6000px"></div>');
  await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),movie);await poll(()=>app.evaluate(()=>!!global.__flashborn.activeContent()?.native?.isPresented()),Boolean);
  await poll(()=>app.evaluate(()=>global.__flashborn.edgeScrollbars.active),v=>v?.startsWith('native:'));
  for(const axis of ['vertical','horizontal']){
   await app.evaluate(({},axis)=>{const b=global.__flashborn.edgeScrollbars.bars.find(b=>b.axis===axis),p=axis==='vertical'?{x:7,y:b.length-3}:{x:b.length-3,y:7};for(const type of ['mouseDown','mouseUp'])b.view.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});},axis);
   await poll(()=>app.evaluate(({},axis)=>global.__flashborn.edgeScrollbars.state[axis==='vertical'?'scrollTop':'scrollLeft'],axis),n=>n>0);
  }
  const region=await app.evaluate(({screen},module)=>{const g=global.__flashborn,k=process.mainModule.require(module),u=k.load('user32.dll'),gd=k.load('gdi32.dll'),create=gd.func('intptr_t __stdcall CreateRectRgn(int,int,int,int)'),get=u.func('int __stdcall GetWindowRgn(intptr_t,intptr_t)'),inside=gd.func('int __stdcall PtInRegion(intptr_t,int,int)'),del=gd.func('int __stdcall DeleteObject(intptr_t)'),h=Number(g.win.getNativeWindowHandle().readBigUInt64LE()),scale=screen.getDisplayMatching(g.win.getBounds()).scaleFactor,shape=create(0,0,0,0);try{get(h,shape);const has=(x,y)=>!!inside(shape,Math.round(x*scale),Math.round(y*scale));return {tl:has(5,5),br:has(1245,845),brInner:has(1220,820),topGap:has(100,5),leftGap:has(5,100),viewportHole:has(600,300),vTrack:has(1245,200)};}finally{del(shape);}},path.join(root,'node_modules/koffi'));
  assert.deepEqual(region,{tl:true,br:true,brInner:true,topGap:false,leftGap:false,viewportHole:false,vTrack:true});
  await cmd('panel',{name:'about'});await wait(300);await ui.locator('#menu-button').click();await wait(260);
  const menu=await app.evaluate(()=>({host:global.__flashborn.win.getContentBounds(),menu:global.__flashborn.menuWindow.getBounds()}));assert.ok(menu.menu.x+menu.menu.width<=menu.host.x+menu.host.width-14);await ui.locator('#content').click({position:{x:40,y:60}});await poll(()=>app.evaluate(()=>global.__flashborn.getState().menuOpen),v=>!v);
  for(let i=0;i<4;i++){await cmd('theme');await wait(100);assert.ok(await app.evaluate(()=>global.__flashborn.corner.view.webContents.executeJavaScript('document.documentElement.dataset.theme')));}
  if(process.env.CORNERS_CLEAR_TEST){
   const specialVisuals=[];
   for(const [darkTheme,highContrast]of [[true,false],[true,true],[false,true],[false,false]]){
    await cmd('settings',{darkTheme,highContrast});await app.evaluate(()=>{global.__frameBackdrop.moveTop();global.__flashborn.win.moveTop();global.__flashborn.win.focus();});await wait(180);
    const visual=await app.evaluate(()=>global.__readFramePixels(true));
    if(visual.samples.some(p=>p.name.startsWith('inner-')&&!p.stillOwnedByBrowser)){
     const debug=await app.evaluate(async()=>{const f=global.__flashborn;return {state:{panel:f.getState().panel,fullscreen:f.getState().fullscreen},bounds:f.win.getBounds(),content:f.win.getContentBounds(),max:f.win.isMaximized(),alwaysTop:f.win.isAlwaysOnTop(),region:Object.fromEntries(Object.entries(f.windowRegion).filter(([k,v])=>['key','frame','frameKey','desiredKey','moving'].includes(k))),dom:await f.win.webContents.executeJavaScript('(()=>{const e=document.getElementById("browser-surface"),r=e.getBoundingClientRect();return {class:document.body.className,rect:{x:r.x,y:r.y,width:r.width,height:r.height},background:getComputedStyle(e).backgroundColor};})()')};});fs.writeFileSync(path.join(out,'packaged-special-debug.json'),JSON.stringify({visual,debug},null,2));
    }
    for(const point of visual.samples){if(point.name.startsWith('inner-')){assert.ok(point.stillOwnedByBrowser,'Stage is masked beyond 15 px: '+JSON.stringify(point));continue;}assert.ok(point.rgb.every((n,i)=>Math.abs(n-[238,245,255][i])<=2),'Special-page 15 px mask is still painted: '+JSON.stringify(point));/* A fractional display scale can round the last mask pixel onto the client hit region. */if(!point.name.endsWith('-14'))assert.ok(point.passesToBackdrop,'Special-page 15 px mask intercepts input: '+JSON.stringify(point));}
    specialVisuals.push({darkTheme,highContrast,...visual});
   }
   fs.writeFileSync(path.join(out,'special-perimeter-all-themes.json'),JSON.stringify(specialVisuals,null,2));
   const edges=await ui.locator('#content').boundingBox(),size=await app.evaluate(()=>global.__flashborn.win.getContentSize());assert.equal(edges.y,15);assert.ok(Math.abs(edges.y+edges.height-(size[1]-15))<2,JSON.stringify({edges,size}));
   const glyphs=await ui.locator('.window-controls .icon').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));assert.ok(glyphs.every(r=>r.top>=15&&r.bottom<=51),JSON.stringify(glyphs));
   console.log('PASS special scrolling area is masked 15 px at top/bottom and the entire unused perimeter is clear in all four themes');
  }
  assert.deepEqual(errors,[]);const report={passed:true,geometry,region,resize,scrollBothAxes:true,flashScrollBothAxes:true,menuInsideMask:true,separateCornerSurfaces:true,errors};fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-results.json':'source-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  await app.evaluate(()=>{global.__flashborn.win.setTitle('Corners — masked frame test');global.__flashborn.win.setBounds({x:1550,y:120,width:1250,height:850});});
  await ui.screenshot({path:path.join(out,'inset-frame.png')});
  if(process.env.CORNERS_UI_HOLD){
   fs.rmSync(path.join(out,'stop'),{force:true});fs.writeFileSync(path.join(out,'holding'),'ready');
   const end=Date.now()+600000;
   while(!fs.existsSync(path.join(out,'stop'))&&Date.now()<end){fs.writeFileSync(path.join(out,'pointer-state.json'),JSON.stringify(await app.evaluate(()=>{const g=global.__flashborn;return {bounds:g.win.getBounds(),max:g.win.isMaximized(),fs:g.getState().fullscreen,corners:[g.corner,g.topLeftCorner].map(c=>({edge:c.edge,rect:c.rect,hover:c.hover,drag:c.drag,inputs:c.testInputs})),bars:g.edgeScrollbars.bars.map(b=>({axis:b.axis,rect:b.rect,hover:b.hover,drag:b.drag})),scroll:g.edgeScrollbars.state};}),null,2));await wait(100);}
  }
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
