'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/gallery-shared-stage'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=40000){let v;const end=Date.now()+timeout;do{try{v=await read();if(check(v))return v;}catch{}await wait(40);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const html=fs.readFileSync(path.join(root,'site/flash-gallery/flash.gallery.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/flash.gallery.html';
 const manifest=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8')),items=manifest.items.filter(i=>i.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(i.path||i.url||''));
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(path.join(profile,'Flash Library'),{recursive:true});fs.writeFileSync(path.join(profile,'Flash Library/manifest.json'),JSON.stringify({version:1,items}));fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({libraryPageOnboarded:true,settings:{restoreTabs:false,adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:url};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
 const command=(action,args={})=>app.evaluate(({},v)=>global.__flashborn.command(v.action,v.args),{action,args});let ui,frame;
 const snap=()=>frame.evaluate(()=>galleryPhysics.snapshot());
 const settled=()=>poll(snap,s=>s.phase==='magnetized'&&s.bodies.filter(b=>b.target).every(b=>b.docked));
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:50,y:50,width:1400,height:1050});w.show();w.focus();});await command('panel',{name:'library'});
  frame=await poll(async()=>ui.frames().find(f=>f.url().startsWith(url)),Boolean);await poll(()=>frame.evaluate(()=>typeof galleryPhysics),v=>v==='object');
  assert.equal(await frame.evaluate(()=>typeof window.browser),'undefined');await poll(()=>app.evaluate(()=>global.__flashborn.edgeScrollbars?.active),id=>id?.startsWith('gallery:'));assert.equal(await frame.evaluate(()=>document.documentElement.classList.contains('exterior-scrollbars')),true);await poll(()=>frame.evaluate(()=>flashbornGallery.managed),Boolean);
  await frame.evaluate(()=>{window.qaNodes=new Map();window.qaCrossings=new Set();window.qaIdentityErrors=0;window.qaRoot={};window.qaOpening=[];window.qaClock=setInterval(()=>{const s=galleryPhysics.snapshot();qaOpening.push({loaded:s.loadedCount,phase:s.introPhase,matches:s.matchIds.length});document.querySelectorAll('.block').forEach(e=>{const id=e.dataset.id;if(qaNodes.has(id)&&qaNodes.get(id)!==e)qaIdentityErrors++;qaNodes.set(id,e);const r=e.getBoundingClientRect();if(r.bottom>=0&&r.top<60)qaCrossings.add(id);});},8);});
  // Menu is an owned popup above the complete HTML stage, including its top.
  await ui.locator('#menu-button').click();await poll(()=>app.evaluate(()=>!!global.__flashborn.menuWindow?.isVisible()),Boolean);
  assert.equal(await app.evaluate(()=>global.__flashborn.menuWindow.getParentWindow().id===global.__flashborn.win.id),true);assert.equal(await ui.locator('.gallery-stage').count(),1);await wait(350);
  const stageBox=await ui.locator('.gallery-stage').boundingBox();await ui.mouse.click(stageBox.x+10,160);await poll(()=>app.evaluate(()=>!global.__flashborn.menuWindow),Boolean);
  // Resize while the same nodes are crossing the frame/stage boundary.
  await app.evaluate(()=>global.__flashborn.win.setBounds({width:1200,height:860}));await wait(400);await app.evaluate(()=>global.__flashborn.win.setBounds({width:1400,height:1050}));
  await settled();const start=await snap();assert.equal(start.count,28);assert.equal(start.loadedCount,28);assert.equal(start.matchIds.length,28);assert.ok(start.deck.every(p=>p.projectId));
  assert.equal(start.featuredId,1,'Square must become the initial full-width preview');
  await poll(()=>ui.locator('.gallery-stage:not([hidden])').evaluate(e=>parseFloat(getComputedStyle(e).clipPath.slice(6))),v=>Math.abs(v)<.01);
  const intro=await frame.evaluate(()=>{clearInterval(qaClock);return {nodes:qaNodes.size,crossings:qaCrossings.size,errors:qaIdentityErrors,opening:qaOpening,label:getComputedStyle(document.querySelector('#loading-label')).visibility,top:document.querySelector('h1').getBoundingClientRect().top+scrollY,backgrounds:[document.documentElement,document.body,document.querySelector('.scene')].map(e=>getComputedStyle(e).backgroundColor)};});
  assert.equal(intro.nodes,28);assert.ok(intro.crossings>15);assert.equal(intro.errors,0);assert.equal(intro.label,'hidden');assert.equal(intro.top,60);assert.ok(intro.backgrounds.every(c=>c==='rgba(0, 0, 0, 0)'));assert.ok(intro.opening.filter(s=>s.phase!=='complete').every(s=>!s.matches));
  const edgeStage=await ui.locator('.gallery-stage:not([hidden])').boundingBox(),edgeViewport=await ui.evaluate(()=>innerHeight);
  assert.ok(Math.abs(edgeStage.y-15)<1,'Special stage must start inside the 15 px top mask');assert.ok(Math.abs(edgeStage.y+edgeStage.height-(edgeViewport-15))<2,'Special stage must stop inside the 15 px bottom mask');
  assert.equal(await app.evaluate(()=>!!global.__flashborn.activeContent().native),false);
  // Search narrows in place; an existing match is never released/re-captured.
  const squareBefore=start.bodies.find(b=>b.id===1);
  await frame.locator('#search').fill('Square');await settled();
  assert.equal((await snap()).featuredId,1);assert.equal((await snap()).matchIds.length,1);
  await frame.evaluate(()=>{window.qaSquareSamples=[];window.qaSearchClock=setInterval(()=>{const s=galleryPhysics.snapshot(),b=s.bodies.find(b=>b.id===1);qaSquareSamples.push({featured:s.featuredId,x:b.x,y:b.y,width:b.width,height:b.height,capturedAt:b.capturedAt,docked:b.docked});},10);});
  await frame.locator('#search').fill('S');await poll(snap,s=>s.phase==='magnetized'&&s.matchIds.length>1&&s.bodies.filter(b=>b.target).every(b=>b.docked));
  const samples=await frame.evaluate(()=>{clearInterval(qaSearchClock);return qaSquareSamples;});
  assert.ok(samples.length>10);assert.ok(samples.every(b=>b.featured===1&&b.docked&&b.capturedAt===squareBefore.capturedAt&&Math.abs(b.x-squareBefore.x)<.01&&Math.abs(b.y-squareBefore.y)<.01&&Math.abs(b.width-squareBefore.width)<.01&&Math.abs(b.height-squareBefore.height)<.01),'Search moved an existing Square preview');
  await frame.locator('#search').fill('');await settled();assert.equal((await snap()).matchIds.length,28);await frame.locator('#search').blur();
  await frame.evaluate(()=>{window.qaLaunches=0;flashbornGallery.open=()=>qaLaunches++;});
  const checks=[];
  for(const width of (process.env.GALLERY_STAGE_WIDTHS?process.env.GALLERY_STAGE_WIDTHS.split(',').map(Number):process.env.GALLERY_STAGE_QUICK?[1400,880]:[1940,1750,1560,1400,1200,1040,880])){
   await ui.mouse.move(10,100);await app.evaluate(({},width)=>global.__flashborn.win.setBounds({width}),width);await wait(80);await settled();
   const ids=(await snap()).matchIds;
   for(const id of [ids.at(-1),ids[0],ids[14]]){
    if((await snap()).featuredId===id)continue;
    await frame.evaluate(id=>{dispatchEvent(new WheelEvent('wheel'));const r=document.querySelector('.block[data-id="'+id+'"]').getBoundingClientRect();scrollTo(0,Math.max(0,r.top+scrollY-innerHeight*.4));},id);await wait(60);
    const p=await frame.locator('.block[data-id="'+id+'"]').boundingBox();await ui.mouse.move(p.x+p.width/2,p.y+p.height/2);
    await poll(snap,s=>s.hoveredId===id&&s.bodies.filter(b=>b.target).every(b=>b.docked));await ui.mouse.click(p.x+p.width/2,p.y+p.height/2);const s=await poll(snap,s=>s.featuredId===id&&s.bodies.filter(b=>b.target).every(b=>b.docked));
    const b=s.bodies.find(b=>b.id===id);assert.ok(Math.abs(b.width-s.gridRail.width)<.03);assert.equal(await frame.evaluate(()=>qaLaunches),0);
    checks.push({width,columns:s.columns,featured:id,fullWidth:true});
   }
   console.log('PASS shared stage '+width);
  }
  for(const [theme,highContrast]of [['current',false],['current',true],['light',true],['light',false]]){await command('settings',{darkTheme:theme!=='light',highContrast});await poll(()=>frame.evaluate(()=>[document.documentElement.dataset.theme,document.documentElement.dataset.contrast]),v=>v[0]===theme&&v[1]===(highContrast?'high':'normal'));assert.equal(await frame.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgba(0, 0, 0, 0)');}
  await command('panel',{name:'bookmarks'});assert.equal(await ui.locator('.gallery-stage').isVisible(),false);await command('panel',{name:'library'});assert.equal(await frame.evaluate(()=>qaNodes.get('1')===document.querySelector('.block[data-id="1"]')),true);
  await command('fullscreen',{value:true});await poll(()=>frame.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--heading-top')),v=>v==='0px');await command('fullscreen',{value:false});await poll(()=>frame.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--heading-top')),v=>v==='60px');
  await wait(600);await settled();await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await frame.evaluate(()=>Array.from(document.querySelectorAll('.block')).every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&Number.isFinite(r.x)&&Number.isFinite(r.y);})),true,'Hidden or fullscreen stages corrupted tile coordinates');await ui.screenshot({path:path.join(out,process.env.FLASHBORN_EXE?'packaged.png':'source.png')});
  await command('new-tab');await command('navigate',{value:url});await poll(()=>ui.locator('.gallery-stage').count(),n=>n===2);const regular=await app.evaluate(()=>global.__flashborn.getState().activeId);await command('close-tab',{id:regular});await poll(()=>ui.locator('.gallery-stage').count(),n=>n===1);
  await command('new-flashcognito');await command('panel',{name:'library'});await poll(()=>ui.locator('.gallery-stage:not([hidden])').getAttribute('credentialless'),v=>v==='');const privateId=await app.evaluate(()=>global.__flashborn.getState().activeId);await command('close-tab',{id:privateId});await poll(()=>ui.locator('.gallery-stage').count(),n=>n===1);
  const report={passed:true,version:require('../package.json').version,sha256:crypto.createHash('sha256').update(html).digest('hex'),opening:{nodes:intro.nodes,topCrossings:intro.crossings,identityErrors:0,headerTop:60,maskAfterFall:0,transparent:true},menuAboveStage:true,allThemesTransparent:true,persistentObjects:true,regularTabCleanup:true,privateCredentiallessCleanup:true,noTileLaunch:true,checks};fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-results.json':'source-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

