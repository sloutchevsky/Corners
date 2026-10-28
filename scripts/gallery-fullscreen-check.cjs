'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/gallery-fullscreen'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=45000){let v;const end=Date.now()+timeout;do{v=await read();if(check(v))return v;await wait(70);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const html=fs.readFileSync(path.join(root,'site/flash-gallery/flash.gallery.html')),server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const items=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8')).items.filter(i=>i.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(i.path||i.url||''));
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(path.join(profile,'Flash Library'),{recursive:true});fs.writeFileSync(path.join(profile,'Flash Library/manifest.json'),JSON.stringify({version:1,items}));fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({libraryPageOnboarded:true,settings:{restoreTabs:false,adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:'http://127.0.0.1:'+server.address().port+'/flash.gallery.html'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
 const evaluate=code=>app.evaluate(({},code)=>global.__flashborn.activeContent().native.evaluate(code),code);
 const settled=()=>poll(()=>evaluate('(function(){var s=galleryPhysics.snapshot();return s.phase==="magnetized"&&s.matchIds.length>0&&s.bodies.filter(function(b){return b.target;}).every(function(b){return b.docked;});})()'),Boolean);
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);await app.evaluate(()=>{const f=global.__flashborn;f.win.setBounds({x:40,y:40,width:1200,height:1000});f.win.show();f.win.focus();return f.command('panel',{name:'library'});});
  await poll(()=>evaluate('typeof galleryPhysics'),v=>v==='object');await poll(()=>evaluate('galleryPhysics.snapshot().introPhase'),v=>v==='complete');await evaluate('document.querySelector("[data-value=all]").click();true');await settled();
  await evaluate('document.querySelector(".block[data-interactive=true]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));true');await settled();
  await app.evaluate(()=>{const m=global.__flashborn.windowMotion,update=m.api.update.bind(m.api);global.__qaBacking=[];m.api.update=(...args)=>{global.__qaBacking.push({proportional:!!args[3],pixelExact:!!args[4]});return update(...args);};});
  await evaluate('window.qaViewportFrames=[];window.qaRecord=true;(function sample(){if(!qaRecord)return;var h=document.querySelector("h1").getBoundingClientRect(),field=document.getElementById("search").getBoundingClientRect();qaViewportFrames.push({width:innerWidth,height:innerHeight,scrollY:scrollY,titleTop:h.top,titleWidth:h.width,titleFont:parseFloat(getComputedStyle(document.querySelector("h1")).fontSize),fieldWidth:field.width,fieldFont:getComputedStyle(document.getElementById("search")).fontSize,columns:galleryPhysics.snapshot().columns});requestAnimationFrame(sample);})()');
  const cases=[];
  for(const mode of ['maximize','restore','fullscreen','exit-fullscreen','maximize','restore']){
   await app.evaluate(async({},mode)=>{const f=global.__flashborn;if(mode==='maximize')f.win.maximize();else if(mode==='restore')f.win.unmaximize();else await f.command('fullscreen',{value:mode==='fullscreen'});},mode);
   const checks=[];for(let n=0;n<25;n++){checks.push(await app.evaluate(()=>{const f=global.__flashborn,n=f.activeContent().native;return {animating:!!n.hostAnimating,viewport:n.viewport,presented:n.isPresented()};}));await wait(20);}
   await settled();await evaluate('scrollTo(0,0);true');await wait(60);
   const page=await evaluate('(function(){var s=galleryPhysics.snapshot(),r=document.querySelector("h1").getBoundingClientRect();return {width:innerWidth,height:innerHeight,columns:s.columns,titleTop:r.top,scrollY:scrollY,featured:s.featuredId};})()');
   assert.ok(checks.every(c=>!c.animating),mode+': stale snapshot scaling');assert.ok(page.titleTop>=0,mode+': clipped title at scroll top');assert.ok(page.featured);if(mode==='maximize'||mode==='fullscreen')assert.equal(page.columns,8);
   fs.writeFileSync(path.join(out,mode+'-page.png'),Buffer.from(await app.evaluate(()=>global.__flashborn.activeContent().native.screenshot()),'base64'));cases.push({mode,page,liveSamples:checks.length});
  }
  const frames=await evaluate('qaRecord=false;qaViewportFrames'),backing=await app.evaluate(()=>global.__qaBacking);
  assert.ok(backing.length&&backing.every(m=>m.pixelExact&&!m.proportional),'Live Gallery texture must stay at 1:1 pixels');
  for(const f of frames){assert.ok(Math.abs(f.fieldWidth-200)<.1,'Fullscreen scaled the interface');assert.equal(f.fieldFont,'13px');assert.ok(f.titleFont<=78.01);}
  const report={passed:true,version:await app.evaluate(({app})=>app.getVersion()),artifactSHA256:crypto.createHash('sha256').update(html).digest('hex'),cases,frames:frames.length,backingModes:backing};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,version:report.version,cases:cases.map(c=>({mode:c.mode,columns:c.page.columns,titleTop:c.page.titleTop})),frames:frames.length,pixelExact:true}));
 }finally{await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
