'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/gallery-featured-browser'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=40000){let v;const end=Date.now()+timeout;do{try{v=await read();if(check(v))return v;}catch{}await wait(60);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v?.bodies?{hoveredId:v.hoveredId,featuredId:v.featuredId,columns:v.columns,moving:v.bodies.filter(b=>b.target&&!b.docked).map(b=>({id:b.id,x:b.x,y:b.y,width:b.width,height:b.height,target:b.target}))}:v));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const html=fs.readFileSync(path.join(root,'site/flash-gallery/flash.gallery.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const manifest=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8'));
 const items=manifest.items.filter(i=>i.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(i.path||i.url||''));
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(path.join(profile,'Flash Library'),{recursive:true});
 fs.writeFileSync(path.join(profile,'Flash Library/manifest.json'),JSON.stringify({version:1,items}));fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({libraryPageOnboarded:true,settings:{restoreTabs:false,adBlockEnabled:false,theme:'current'}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:'http://127.0.0.1:'+server.address().port+'/flash.gallery.html'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
 const command=(action,args={})=>app.evaluate(({},d)=>global.__flashborn.command(d.action,d.args),{action,args});
 const evaluate=code=>app.evaluate(({},code)=>global.__flashborn.activeContent().native.evaluate(code),code);
 const snapshot=async()=>JSON.parse(await evaluate('JSON.stringify(galleryPhysics.snapshot())'));
 const mouse=(type,p)=>app.evaluate(({},v)=>global.__flashborn.activeContent().native.call('test-mouse',v),{type,x:p.x,y:p.y,button:type==='mouseMove'?'none':'left',clickCount:type==='mouseMove'?0:1});
 const settle=()=>poll(snapshot,s=>s.bodies.filter(b=>b.target).every(b=>b.docked));
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:50,y:50,width:1400,height:1050});w.show();w.focus();});
  const ui=await app.firstWindow();await ui.evaluate(()=>{window.qaEntrance=[];browser.onGalleryEntrance(frame=>{const c=document.querySelector('#gallery-entrance'),ctx=c.getContext('2d');if(frame.blocks.length){const pixels=ctx.getImageData(0,0,c.width,1).data;let topPixels=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])topPixels++;qaEntrance.push({blocks:frame.blocks.length,topPixels,active:document.body.classList.contains('gallery-entering'),sourceWidth:frame.sourceWidth});}});});
  await command('panel',{name:'library'});
  await poll(()=>evaluate('typeof galleryPhysics'),v=>v==='object');
  await evaluate('window.qaOpening=[];window.qaOpeningTimer=setInterval(function(){var s=galleryPhysics.snapshot();qaOpening.push({phase:s.phase,intro:s.introPhase,loaded:s.loadedCount,matches:s.matchIds.length});},16);true');
  await poll(snapshot,s=>s.introPhase==='complete');
  await evaluate('window.qaEvents=[];["pointermove","pointerleave","blur","wheel","scroll"].forEach(function(type){window.addEventListener(type,function(e){qaEvents.push({type:type,x:e.clientX,y:e.clientY,target:e.target&&e.target.dataset&&e.target.dataset.id,scrollY:scrollY});if(qaEvents.length>14)qaEvents.shift();},true);});window.qaLaunches=0;window.flashbornGallery.open=function(){qaLaunches++;};document.querySelector("[data-value=all]").click();true');
  await poll(snapshot,s=>s.matchIds.length===items.length&&s.bodies.filter(b=>b.target).every(b=>b.docked));
  const opening=await evaluate('clearInterval(qaOpeningTimer);qaOpening');
  assert.ok(opening.some(s=>s.intro==='controls')&&opening.some(s=>s.intro==='dot'));
  assert.ok(opening.filter(s=>s.intro!=='complete').every(s=>s.matches===0),'Real-clock capture started before the dot settled');
  assert.ok(opening.filter(s=>s.intro==='controls'||s.intro==='dot').every(s=>s.loaded===items.length));
  const openingState=await snapshot();assert.equal(openingState.option,'all');
  const entrance=await ui.evaluate(()=>qaEntrance);assert.ok(entrance.length>28,'The browser never painted the top strip');assert.ok(entrance.some(f=>f.topPixels>0&&f.active),'No tiles entered at the actual window top');assert.equal(await ui.locator('body').evaluate(e=>e.classList.contains('gallery-entering')),false);
  assert.equal(await ui.locator('#gallery-entrance').evaluate(c=>getComputedStyle(c).pointerEvents),'none');
  const openingBodies=openingState.matchIds.map(id=>openingState.bodies.find(b=>b.id===id));
  for(let i=1;i<openingBodies.length;i++){assert.ok(openingBodies[i].capturedAt>openingBodies[i-1].capturedAt);assert.ok(openingBodies[i].dockedAt>openingBodies[i-1].dockedAt);}
  const ids=(await snapshot()).matchIds,tabCount=await app.evaluate(()=>global.__flashborn.tabs.length),checks=[];
  const hover=async id=>{
   await evaluate('dispatchEvent(new WheelEvent("wheel"));true');await mouse('mouseMove',{x:1,y:1});await settle();
   await evaluate('(function(){var r=document.querySelector(".block[data-id=\\"'+id+'\\"]").getBoundingClientRect();scrollTo(0,Math.max(0,r.top+scrollY-innerHeight*.4));return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(function(){resolve(true);});});});})()');
   const p=JSON.parse(await evaluate('(function(){var r=document.querySelector(".block[data-id=\\"'+id+'\\"]").getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()'));
   await mouse('mouseMove',p);try{await poll(snapshot,s=>s.hoveredId===id&&s.bodies.filter(b=>b.target).every(b=>b.docked));}catch(error){console.error('HOVER '+JSON.stringify({id,p,events:await evaluate('qaEvents'),dom:await evaluate('(function(){var e=document.querySelector(".block[data-id=\\"'+id+'\\"]"),r=e.getBoundingClientRect(),hit=document.elementFromPoint('+p.x+','+p.y+');return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},interactive:e.dataset.interactive,scrollY:scrollY,hit:hit&&hit.closest(".block")&&hit.closest(".block").dataset.id};})()')}));throw error;}return p;
  };
  const geometry=s=>{
   const hero=s.bodies.find(b=>b.id===s.featuredId),f=s.gridRail;assert.ok(hero);assert.ok(Math.abs(hero.width-f.width)<.02);assert.ok(Math.abs(hero.x-hero.width/2-f.left)<.02);assert.ok(Math.abs(hero.y-hero.height/2-f.lineY-f.gap)<.02);
   for(const b of s.bodies.filter(b=>b.target&&b.id!==hero.id)){const big=b.id===s.hoveredId;assert.ok(Math.abs(b.width-(big?2*f.cellWidth+f.gap:f.cellWidth))<.02);assert.ok(b.y-b.height/2>=f.gridTop-.02);}
   return {x:hero.x,y:hero.y,width:hero.width,height:hero.height};
  };
  for(const [width,columns] of (process.env.GALLERY_FEATURED_NARROW?[[880,3]]:[[1940,8],[1750,7],[1560,6],[1400,5],[1200,4],[1040,3],[880,3]])){
   await evaluate('dispatchEvent(new WheelEvent("wheel"));true');await app.evaluate(({},width)=>global.__flashborn.win.setBounds({width}),width);await poll(snapshot,s=>s.columns===columns&&s.bodies.filter(b=>b.target).every(b=>b.docked));
   for(const id of [ids.at(-1),ids[0],ids[Math.floor(ids.length/2)]]){
    if((await snapshot()).featuredId===id)continue;
    const p=await hover(id);await mouse('mouseDown',p);await mouse('mouseUp',p);
    const s=await poll(snapshot,s=>s.featuredId===id&&s.bodies.filter(b=>b.target).every(b=>b.docked));const hero=geometry(s);
    const visible=JSON.parse(await evaluate('(function(){var r=document.querySelector(".block[data-size=xlg]").getBoundingClientRect();return JSON.stringify({top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight});})()'));
    assert.ok(visible.top>=-.5&&visible.top<visible.viewport,'Full-width preview was left above the viewport');
    if(visible.height<=visible.viewport-2*s.gridRail.gap)assert.ok(visible.bottom<=visible.viewport+.5,'Full-width preview did not scroll into view');
    assert.equal(s.loadedCount,items.length);assert.equal(await app.evaluate(()=>global.__flashborn.tabs.length),tabCount);assert.equal(await evaluate('qaLaunches'),0);
    const next=ids.find(other=>other!==id);await hover(next);const hovered=await snapshot();const unchanged=geometry(hovered);for(const key of Object.keys(hero))assert.ok(Math.abs(hero[key]-unchanged[key])<.02,'Lower hover moved the top tile');
    checks.push({columns,featured:id,fullWidth:hero.width,lowerHoverIndependent:true,projects:items.length});console.log('PASS '+JSON.stringify(checks.at(-1)));
   }
  }
  const selected=(await snapshot()).featuredId;
  for(const [darkTheme,highContrast] of [[true,true],[false,true],[false,false],[true,false]]){await command('settings',{darkTheme,highContrast});await poll(()=>evaluate('document.documentElement.dataset.contrast'),v=>v===(highContrast?'high':'normal'));assert.equal((await snapshot()).featuredId,selected);}
  await evaluate('(function(){var r=document.querySelector(".block[data-size=xlg] .tile-launch").getBoundingClientRect();scrollTo(0,Math.max(0,r.top+scrollY-innerHeight*.5));return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(function(){resolve(true);});});});})()');
  const launchPoint=JSON.parse(await evaluate('(function(){var r=document.querySelector(".block[data-size=xlg] .tile-launch").getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()'));
  await mouse('mouseMove',launchPoint);await mouse('mouseDown',launchPoint);await mouse('mouseUp',launchPoint);
  await poll(()=>evaluate('qaLaunches'),v=>v===1);
  await evaluate('document.querySelector("[data-value="+JSON.stringify("2006")+"]").click();true');assert.equal((await snapshot()).featuredId,null);
  await poll(snapshot,s=>s.phase==='magnetized'&&s.bodies.filter(b=>b.target).every(b=>b.docked));
  await app.evaluate(()=>global.__flashborn.win.setBounds({width:1400}));await settle();
  const report={passed:true,artifactSHA256:crypto.createHash('sha256').update(html).digest('hex'),opening:{selection:openingState.option,projects:items.length,samples:opening.length,dotBeforeCapture:true,fillDuration:openingBodies.at(-1).dockedAt-openingBodies[0].capturedAt},windowTopEntrance:{frames:entrance.length,topEdgePainted:true,nonInteractive:true,cleared:true},checks,themeRetainsFeatured:true,yearClearsFeatured:true,explicitLaunchButton:true,tileClickLaunches:0,stubbedLaunches:await evaluate('qaLaunches')};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log('PASS real native clicks, full-width previews, resize, independent lower hover, themes and year reset');
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
