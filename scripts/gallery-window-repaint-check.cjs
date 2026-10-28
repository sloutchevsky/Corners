'use strict';
// Exercise WM_SIZING, not just setBounds: the Windows drag path used to
// replace the responsive Gallery with a stretched compositor preview.
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/gallery-window-repaint'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=40000){let v;const end=Date.now()+timeout;do{try{v=await read();if(check(v))return v;}catch{}await wait(60);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const label=process.env.GALLERY_REPAINT_LABEL||'fixed',html=fs.readFileSync(path.join(root,'site/flash-gallery/flash.gallery.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=path.join(out,'profile-'+Date.now()),manifest=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8'));
 fs.mkdirSync(path.join(profile,'Flash Library'),{recursive:true});fs.writeFileSync(path.join(profile,'Flash Library/manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({libraryPageOnboarded:true,settings:{theme:'light',restoreTabs:false,adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:'http://127.0.0.1:'+server.address().port+'/flash.gallery.html'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
 const evaluate=code=>app.evaluate(({},code)=>global.__flashborn.activeContent().native.evaluate(code),code);
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);
  await app.evaluate(()=>{const f=global.__flashborn;f.win.setBounds({x:60,y:60,width:900,height:1000});f.win.show();f.win.focus();return f.command('panel',{name:'library'});});
  await poll(()=>evaluate('typeof galleryPhysics'),v=>v==='object');await poll(()=>evaluate('galleryPhysics.snapshot().introPhase'),v=>v==='complete');
  await evaluate('document.querySelector("[data-value=all]").click();true');
  await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.target&&!b.docked;}).length'),v=>v===0);
  // Dispatch from the separate test process. Calling SendMessage on the
  // browser's own JS stack would re-enter V8 through its native message hook.
  const user=require('koffi').load('user32.dll'),send=user.func('intptr_t __stdcall SendMessageW(intptr_t,uint32_t,intptr_t,void*)'),rect=user.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)');
  const handle=await app.evaluate(()=>Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE()));
  let sizingMessages=0;const previewAtSizingMessage=[],samples=[];
  function sizingMessage(){const bounds=[0,0,0,0];rect(handle,bounds);const bytes=Buffer.alloc(16);bounds.forEach((v,i)=>bytes.writeInt32LE(v,i*4));send(handle,0x214,2,bytes);sizingMessages++;}
  async function sample(phase){
   const data=await app.evaluate(async()=>{
    const f=global.__flashborn,n=f.activeContent().native;
    const page=JSON.parse(await n.evaluate(`JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,searchWidth:document.getElementById('search').getBoundingClientRect().width,font:getComputedStyle(document.getElementById('search')).fontSize,columns:galleryPhysics.snapshot().columns})`));
    return {host:f.win.getBounds(),viewport:n.viewport,source:n.inspect().rect,animating:!!n.hostAnimating,presented:n.isPresented(),page};
   });samples.push({phase,messages:sizingMessages,...data});fs.writeFileSync(path.join(out,label+'-samples.json'),JSON.stringify(samples,null,2));return data;
  }
  if(process.env.GALLERY_EXPECT_LIVE==='0')await app.evaluate(()=>global.__flashborn.windowMotion.liveLayout=()=>false);
  await app.evaluate(()=>{const m=global.__flashborn.windowMotion,update=m.api.update.bind(m.api);global.__galleryBackingModes=[];m.api.update=(...args)=>{global.__galleryBackingModes.push({proportional:!!args[3],pixelExact:!!args[4]});return update(...args);};});
  await sample('initial');
  for(const width of [960,1080,1240,1400,1600,1450,1250,1050,900]){
   sizingMessage();previewAtSizingMessage.push(await app.evaluate(()=>!!global.__flashborn.activeContent().native.hostAnimating));
   await app.evaluate(({},width)=>global.__flashborn.win.setBounds({width}),width);
   await wait(70);await sample('drag-'+width);
  }
  await app.evaluate(()=>global.__flashborn.windowMotion.settle(0));await wait(500);await sample('released');
  // Sidebar animation is another live layout change of the same Gallery.
  await app.evaluate(()=>global.__flashborn.command('collapse',{}));await wait(100);await sample('sidebar-mid');await wait(350);
  await app.evaluate(()=>global.__flashborn.command('collapse',{}));await wait(350);await sample('sidebar-restored');
  if(process.env.GALLERY_REPAINT_MANUAL==='1'){
   await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({width:1400,height:1000});w.show();w.focus();});await wait(300);
   const marker=path.join(out,label+'-drag-finished'),end=Date.now()+90000;
   console.log('READY FOR EDGE DRAG: '+marker);
   while(!fs.existsSync(marker)&&Date.now()<end){await sample('manual-drag');await wait(70);}
   await wait(400);await sample('manual-released');
  }
  const report={label,version:await app.evaluate(({app})=>app.getVersion()),previewAtSizingMessage,backingModes:await app.evaluate(()=>global.__galleryBackingModes),samples};
  fs.writeFileSync(path.join(out,label+'-results.json'),JSON.stringify(report,null,2));
  if(process.env.GALLERY_EXPECT_LIVE!=='0')for(const s of samples){
   assert.equal(s.animating,false,s.phase+': Gallery must keep rendering instead of entering snapshot scaling');
   if(s.phase!=='manual-drag'&&s.phase!=='sidebar-mid')assert.ok(Math.abs(s.page.width-s.viewport.width)<2,s.phase+': native layout must follow live viewport');
   assert.ok(Math.abs(s.page.searchWidth-200)<.1,s.phase+': search field must retain its CSS size');
   assert.equal(s.page.font,'13px');
  }
  if(process.env.GALLERY_EXPECT_LIVE!=='0')assert.ok(report.backingModes.length&&report.backingModes.every(m=>m.pixelExact&&!m.proportional),'The live compositor must use 1:1 pixels, including while its source texture catches up');
  assert.ok(samples.at(-1).messages>=9,'The test must exercise the actual WM_SIZING hook');
  console.log(JSON.stringify({label,version:report.version,sizingMessages:samples.at(-1).messages,previewAtSizingMessage:report.previewAtSizingMessage,maxViewportMismatch:Math.max(...samples.map(s=>Math.abs(s.page.width-s.viewport.width))),parkedDuringDrag:samples.filter(s=>s.animating).length,columns:[...new Set(samples.map(s=>s.page.columns))]}));
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
