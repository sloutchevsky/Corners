'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'test-output/gallery-uniform-resize'),modern=process.env.GALLERY_PROBE_ENGINE==='modern',engine=modern?'modern':'native';
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
html=html.replace('stopped=true;cancelAnimationFrame(raf);','window.qaSizes=function(){return {base:baseWidth,right:looseRight,floor:floorY,hold:resizeHoldUntil,elapsed:elapsed,items:blocks.filter(function(b){return !b.target;}).map(function(b){var v=b.fixture.getShape().m_vertices,p=b.body.getPosition();return {id:b.id,width:b.width,height:b.height,held:!!b.resizeHeld,shrinking:!!b.releaseSize,x:p.x*unit,y:p.y*unit,angle:b.body.getAngle(),fixtureWidth:(Math.max.apply(Math,v.map(function(p){return p.x;}))-Math.min.apply(Math,v.map(function(p){return p.x;})))*unit};})};};window.qaWeights=function(){return blocks.map(function(b){var c=b.body.getLocalCenter();return {id:b.id,x:c.x*unit/b.width,y:c.y*unit/b.height,mass:b.body.getMass(),inertia:b.body.getInertia()};});};stopped=true;cancelAnimationFrame(raf);');
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
  await evaluate('galleryPhysics.step(1200)');
  const checks=[];
  function uniform(s){for(const b of s.items){assert.ok(b.width>0&&b.height>0);assert.ok(Math.abs(b.width-b.fixtureWidth)<.005,'Collision fixture must follow the shared scale');if(!b.shrinking){assert.ok(Math.abs(b.width-s.base)<.02,'Mixed normal tile widths: '+JSON.stringify({id:b.id,width:b.width,base:s.base}));assert.ok(Math.abs(b.height-s.base/2)<.02,'Mixed normal tile heights');}}}
  for(const width of [1000,800,600,390,700,1800]){
   const before=await evaluate('qaSizes()');await command('resize',{width,height:600});await wait(30);await evaluate('galleryPhysics.step(0)');
   const first=await evaluate('qaSizes()');uniform(first);
   if(first.items.length){
    assert.ok(first.items.every(b=>b.held),'Resizing must briefly suspend the whole loose group');
    await evaluate('galleryPhysics.step(80)');const held=await evaluate('qaSizes()');uniform(held);
    for(const b of first.items){const next=held.items.find(n=>n.id===b.id);assert.ok(next.held);assert.ok(Math.abs((first.right-b.x)/b.width-(held.right-next.x)/next.width)<.005,'Suspended corner changed horizontally');assert.ok(Math.abs((first.floor-b.y)/b.width-(held.floor-next.y)/next.width)<.005,'Suspended group fell before the brief hold ended');}
   }
   let samples=0;for(let n=0;n<75;n++){await evaluate('galleryPhysics.step(16)');uniform(await evaluate('qaSizes()'));samples++;}
   assert.ok((await evaluate('qaSizes()')).items.every(b=>!b.held),'Resize hold never released');checks.push({width,samples,uniform:true});
  }
  await evaluate('galleryPhysics.step(60000)');await wait(1400);await evaluate('galleryPhysics.step(1000)');await wait(600);await evaluate('galleryPhysics.step(20000)');
  const intro=await evaluate('galleryPhysics.snapshot()');assert.equal(intro.loadedCount,items.length);assert.equal(intro.introPhase,'complete');
  await evaluate('document.querySelector("[data-value=all]").click();galleryPhysics.step(14000);document.querySelector("[data-value=\\"2006\\"]").click();galleryPhysics.step(50000);');
  const stable=await evaluate('galleryPhysics.snapshot()'),loose=stable.bodies.filter(b=>!b.target),sleepers=loose.filter(b=>b.sleeping);assert.ok(sleepers.length>=Math.min(3,loose.length),'Supported contact islands never settled');
  let drift=0,turn=0;for(let n=0;n<90;n++){await evaluate('galleryPhysics.step(16)');const s=await evaluate('galleryPhysics.snapshot()');for(const b of sleepers){const next=s.bodies.find(n=>n.id===b.id);drift=Math.max(drift,Math.hypot(next.x-b.x,next.y-b.y));turn=Math.max(turn,Math.abs(next.angle-b.angle));}}
  assert.ok(drift<.6&&turn<.006,'Resting contact islands jittered without an impact or resize '+JSON.stringify({drift,turn}));
  await command('capture',{path:path.join(dir,engine+'-uniform.png')});
  const report={passed:true,artifactSHA256:crypto.createHash('sha256').update(original).digest('hex'),checks,loaded:intro.loadedCount,settledIslands:sleepers.length,maxRestDrift:drift,maxRestTurn:turn};fs.writeFileSync(path.join(dir,engine+'-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(error){fs.writeFileSync(path.join(dir,engine+'-failure.json'),JSON.stringify(await evaluate('(function(){var s=galleryPhysics.snapshot();return {phase:s.phase,looseTop:s.looseTop,floor:s.floorY,size:qaSizes(),bodies:s.bodies.map(function(b){return {id:b.id,target:!!b.target,sleeping:b.sleeping,x:b.x,y:b.y,angle:b.angle,speed:b.speed};})};})()').catch(()=>null),null,2));await command('capture',{path:path.join(dir,engine+'-failure.png')}).catch(()=>{});throw error;}
 finally{await command('exit').catch(()=>{});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{socket?.destroy();server.close();if(child&&!child.killed)child.kill();});
