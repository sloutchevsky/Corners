'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'test-output/gallery-sequence'),modern=process.env.GALLERY_PROBE_ENGINE==='modern',engine=modern?'modern':'native';
const source=path.join(root,modern?'node_modules/electron/dist':'vendor/native-runtime'),runtime=path.join(dir,engine+'-runtime');
function linkTree(from,to){fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){if(e.name==='resources')continue;const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isDirectory())linkTree(a,b);else if(!fs.existsSync(b))fs.linkSync(a,b);}}
linkTree(source,runtime);fs.mkdirSync(path.join(runtime,'resources/app'),{recursive:true});
fs.writeFileSync(path.join(runtime,'resources/app/package.json'),JSON.stringify({name:'gallery-featured-qa',version:'1.0.0',main:'main.cjs'}));
fs.copyFileSync(path.join(root,'tests/fixtures/gallery-motion-main.cjs'),path.join(runtime,'resources/app/main.cjs'));
const artifact=path.join(root,'site/flash-gallery/flash.gallery.html'),original=fs.readFileSync(artifact,'utf8');
const items=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8')).items.filter(i=>i.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(i.path||i.url||''));
let html=original.replace(/window\.galleryProjects=[\s\S]*?;<\/script>/,'window.galleryProjects='+JSON.stringify(items).replace(/</g,'\\u003c')+';</script>');
html=html.replace('<script>','<script>window.qaLaunches=0;window.open=function(){qaLaunches++;};window.qaScrolls=[];var qaScroll=scrollTo.bind(window);window.scrollTo=function(a,b){if(typeof a==="object"){qaScrolls.push(a);return qaScroll(a.left||0,a.top||0);}return qaScroll(a,b);};if(!Element.prototype.replaceChildren)Element.prototype.replaceChildren=function(){while(this.firstChild)this.removeChild(this.firstChild);};</script><script>');
html=html.replace('window.galleryPhysics={snapshot:function(){','stopped=true;cancelAnimationFrame(raf);window.galleryPhysics={step:function(ms){if(width!==document.documentElement.clientWidth||height!==innerHeight)resize();for(var qa=0;qa<ms;qa+=step)advance();draw();},snapshot:function(){');
html=html.replace('stopped=true;cancelAnimationFrame(raf);','window.qaRest=function(){return {moving:resizeMotion,settling:resizeSettling,hold:resizeHoldUntil,kick:resizeKickEnd,elapsed:elapsed,wall:walls[2].getPosition().y,items:blocks.filter(function(b){return !b.target;}).map(function(b){var contacts=[];for(var e=b.body.getContactList();e;e=e.next)contacts.push({floor:e.other===walls[2],touch:e.contact.isTouching()});return {id:b.id,rest:b.restPose,wasSleeping:b.wasSleeping,active:b.body.isActive(),contacts:contacts};})};};window.qaSizes=function(){return {base:baseWidth,right:looseRight,floor:floorY,hold:resizeHoldUntil,elapsed:elapsed,items:blocks.filter(function(b){return !b.target;}).map(function(b){var v=b.fixture.getShape().m_vertices,p=b.body.getPosition();return {id:b.id,width:b.width,height:b.height,held:!!b.resizeHeld,shrinking:!!b.releaseSize,x:p.x*unit,y:p.y*unit,angle:b.body.getAngle(),fixtureWidth:(Math.max.apply(Math,v.map(function(p){return p.x;}))-Math.min.apply(Math,v.map(function(p){return p.x;})))*unit};})};};window.qaWeights=function(){return blocks.map(function(b){var c=b.body.getLocalCenter();return {id:b.id,x:c.x*unit/b.width,y:c.y*unit/b.height,mass:b.body.getMass(),inertia:b.body.getInertia()};});};stopped=true;cancelAnimationFrame(raf);');
const fixture=path.join(dir,engine+'-probe.html');fs.writeFileSync(fixture,html);
const channel='\\\\.\\pipe\\gallery-featured-'+process.pid+'-'+Date.now(),server=net.createServer(),pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));let socket,child,sequence=0;
(async()=>{
 await new Promise(r=>server.listen(channel,r));
 const ready=new Promise((resolve,reject)=>{server.once('connection',stream=>{socket=stream;let buffer='';stream.on('data',chunk=>{buffer+=chunk;let n;while((n=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);if(m.ready)resolve(m);else{const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.value);}}}});});setTimeout(()=>reject(Error('Renderer launch timed out')),20000).unref();});
 const env={...process.env,GALLERY_QA_CHANNEL:channel,GALLERY_QA_HTML:fixture,GALLERY_QA_PROFILE:path.join(dir,engine+'-profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 child=spawn(path.join(runtime,modern?'electron.exe':'CornersNative.exe'),[],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>{});
 await ready;
 const command=(action,data={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error('Command timeout '+action)),180000)});socket.write(JSON.stringify({id,action,...data})+'\n');});
 const evaluate=code=>command('evaluate',{code});
 try{
  await evaluate('document.fonts.ready.then(function(){return true;})');
  await evaluate('galleryPhysics.step(50000)');
  let s=await evaluate('galleryPhysics.snapshot()');
  assert.equal(s.loadedCount,items.length);
  assert.equal(s.option,'all');
  assert.equal(s.matchIds.length,0,'No capture before the dot arrives');
  assert.equal(s.introPhase,'controls');
  await wait(680);
  s=await evaluate('galleryPhysics.snapshot()');
  assert.equal(s.matchIds.length,0,'Tiles moved before dot settled');
  await wait(500);
  s=await evaluate('galleryPhysics.snapshot()');
  assert.equal(s.introPhase,'complete');
  assert.equal(s.matchIds.length,0);
  assert.equal(s.pendingCaptureIds.length,items.length);
  const marker=await evaluate('(function(){var a=document.querySelector("[data-value=all]"),b=a.getBoundingClientRect(),d=document.getElementById("index-marker-dot").getBoundingClientRect();return {selected:a.getAttribute("aria-pressed"),disabled:a.disabled,dx:(b.left+b.width/2)-(d.left+d.width/2),dy:(b.top+b.height/2)-(d.top+d.height/2)};})()');
  assert.equal(marker.selected,'true');assert.equal(marker.disabled,true);assert.ok(Math.abs(marker.dx)<.1&&Math.abs(marker.dy)<.1);
  const ordered=s.deck.slice().sort((a,b)=>a.year-b.year||a.order-b.order).map(b=>b.id),timeline=[];
  let previous=0;
  for(let n=0;n<230;n++){
   await evaluate('galleryPhysics.step(8)');s=await evaluate('galleryPhysics.snapshot()');
   assert.ok(s.matchIds.length-previous<=1,'Capture must advance one tile at a time');
   assert.deepEqual(s.matchIds,ordered.slice(0,s.matchIds.length));
   if(s.matchIds.length!==previous)timeline.push({count:s.matchIds.length,time:s.elapsed});
   previous=s.matchIds.length;
   const docked=s.bodies.filter(b=>b.docked).map(b=>b.id);
   assert.deepEqual(ordered.filter(id=>docked.includes(id)),ordered.slice(0,docked.length),'Arrival order skipped a grid slot');
  }
  assert.equal(s.phase,'magnetized','Sequential assembly failed to finish');assert.equal(s.matchIds.length,items.length);
  const arrivals=ordered.map(id=>s.bodies.find(b=>b.id===id).dockedAt);
  for(let i=1;i<arrivals.length;i++)assert.ok(arrivals[i]>arrivals[i-1],'Two tiles docked simultaneously or out of order');
  const fillDuration=arrivals.at(-1)-s.bodies.find(b=>b.id===ordered[0]).capturedAt;
  assert.ok(fillDuration<1600,'Sequential fill took too long: '+fillDuration);
  // Interrupt an in-flight All selection, then filter by another year.
  await evaluate('document.querySelectorAll(".index")[7].click();galleryPhysics.step(3000);document.querySelector("[data-value=all]").click();galleryPhysics.step(560);document.querySelectorAll(".index")[1].click();galleryPhysics.step(4000);');
  s=await evaluate('galleryPhysics.snapshot()');
  assert.equal(s.phase,'magnetized');assert.ok(s.matchIds.length>0);assert.ok(s.bodies.filter(b=>b.target).every(b=>b.year===2000));assert.equal(s.pendingCaptureIds.length,0);
  // Interrupt assembly with a viewport change; retain a complete, uniform grid.
  await evaluate('document.querySelector("[data-value=all]").click();galleryPhysics.step(700)');
  await command('resize',{width:900,height:650});await wait(40);await evaluate('galleryPhysics.step(3000)');
  s=await evaluate('galleryPhysics.snapshot()');assert.equal(s.phase,'magnetized');assert.deepEqual(s.matchIds,ordered);assert.ok(s.bodies.every(b=>b.docked));
  assert.ok(Math.max(...s.bodies.map(b=>b.width))-Math.min(...s.bodies.map(b=>b.width))<.01);
  await evaluate('document.querySelectorAll(".index")[7].click();galleryPhysics.step(60000)');
  const kicks=[];
  for(const [edge,width,height] of [['bottom',900,540],['right',1000,540],['corner',850,620]]){
   await command('resize',{width,height});await wait(40);await evaluate('galleryPhysics.step(0)');
   const held=await evaluate('galleryPhysics.snapshot()'),loose=held.bodies.filter(b=>!b.target);
   assert.ok(loose.length>0&&loose.every(b=>b.resizeHeld),'Entire loose pile must suspend briefly');
   await evaluate('galleryPhysics.step(170)');
   const kicked=await evaluate('galleryPhysics.snapshot()'),free=kicked.bodies.filter(b=>!b.target);
   assert.ok(free.every(b=>!b.resizeHeld));
   const lifted=free.filter(b=>b.vy < -50);
   assert.ok(lifted.length>=Math.min(3,free.length),'Resize failed to lift the pile: '+edge);
   if(edge==='bottom')assert.equal(lifted.length,free.length,'A bottom-only resize must lift the whole pile together');
   const normal=free.map(b=>b.width);assert.ok(Math.max(...normal)-Math.min(...normal)<.01);
   const start=free.map(b=>({id:b.id,y:b.y}));
   await evaluate('galleryPhysics.step(70)');
   const apex=await evaluate('galleryPhysics.snapshot()');
   const rises=start.map(b=>b.y-apex.bodies.find(n=>n.id===b.id).y);
   // Horizontal wrapping also scales and repacks the pile. Isolate hop
   // distance on a bottom-only resize; all three edges must launch upward.
   if(edge==='bottom')assert.ok(Math.min(...rises)>1&&Math.max(...rises)<20,'Kick should be a small visible hop');
   await evaluate('galleryPhysics.step(60000)');
   const rest=await evaluate('galleryPhysics.snapshot()'),sleepers=rest.bodies.filter(b=>!b.target&&b.sleeping);assert.equal(sleepers.length,free.length,'Pile did not rest after the kick');
   await evaluate('galleryPhysics.step(2000)');const later=await evaluate('galleryPhysics.snapshot()');
   const drift=Math.max(...sleepers.map(b=>Math.hypot(b.x-later.bodies.find(n=>n.id===b.id).x,b.y-later.bodies.find(n=>n.id===b.id).y)));assert.ok(drift<.01,'Pile moved without another resize');
   kicks.push({edge,tiles:free.length,lifted:lifted.length,minVelocity:Math.min(...free.map(b=>b.vy)),rise:Math.max(...rises),restDrift:drift});
  }
  await command('capture',{path:path.join(dir,engine+'-sequence.png')});
  const report={passed:true,artifactSHA256:crypto.createHash('sha256').update(original).digest('hex'),loaded:items.length,initialSelection:'all',marker,launches:timeline,fillDuration,arrivalOrder:ordered,kicks};fs.writeFileSync(path.join(dir,engine+'-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

 }catch(error){fs.writeFileSync(path.join(dir,engine+'-failure.json'),JSON.stringify(await evaluate('(function(){var s=galleryPhysics.snapshot();return {debug:qaRest(),phase:s.phase,looseTop:s.looseTop,floor:s.floorY,size:qaSizes(),bodies:s.bodies.map(function(b){return {id:b.id,target:!!b.target,sleeping:b.sleeping,x:b.x,y:b.y,angle:b.angle,speed:b.speed};})};})()').catch(()=>null),null,2));await command('capture',{path:path.join(dir,engine+'-failure.png')}).catch(()=>{});throw error;}
 finally{await command('exit').catch(()=>{});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{socket?.destroy();server.close();if(child&&!child.killed)child.kill();});
