'use strict';
// Exercise the actual controller and rigid bodies in either supported renderer.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/gallery-falling-size');
const modern=process.env.GALLERY_PROBE_ENGINE==='modern',engine=modern?'modern':'native';
const runtime=path.join(out,engine+'-runtime'),source=path.join(root,modern?'node_modules/electron/dist':'vendor/native-runtime');
function linkTree(from,to){fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){if(e.name==='resources')continue;const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isDirectory())linkTree(a,b);else if(!fs.existsSync(b))fs.linkSync(a,b);}}
linkTree(source,runtime);fs.mkdirSync(path.join(runtime,'resources/app'),{recursive:true});
fs.writeFileSync(path.join(runtime,'resources/app/package.json'),JSON.stringify({name:'gallery-size-qa',version:'1.0.0',main:'main.cjs'}));
fs.copyFileSync(path.join(root,'tests/fixtures/gallery-motion-main.cjs'),path.join(runtime,'resources/app/main.cjs'));
const artifact=process.env.GALLERY_PROBE_HTML||path.join(root,'site/flash-gallery/flash.gallery.html'),original=fs.readFileSync(artifact,'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8'));
const projects=manifest.items.filter(i=>i.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(i.path||i.url||''));
let html=original.replace(/window\.galleryProjects=[\s\S]*?;<\/script>/,'window.galleryProjects='+JSON.stringify(projects).replace(/</g,'\\u003c')+';</script>');
html=html.replace('<script>','<script>var qaSeed=77579;Math.random=function(){return ((qaSeed=(Math.imul(qaSeed,1664525)+1013904223)>>>0)/4294967296);};</script><script>');
html=html.replace('window.galleryPhysics={snapshot:function(){',`stopped=true;cancelAnimationFrame(raf);window.galleryPhysics={
 step:function(ms){if(width!==document.documentElement.clientWidth||height!==innerHeight)resize();for(var qa=0;qa<ms;qa+=step)advance();draw();},
 sizes:function(){return blocks.map(function(b){var points=b.fixture.getShape().m_vertices;return {id:b.id,width:parseFloat(b.element.style.width),height:parseFloat(b.element.style.height),physicalWidth:b.width,physicalHeight:b.height,fixtureWidth:(Math.max.apply(Math,points.map(function(p){return p.x;}))-Math.min.apply(Math,points.map(function(p){return p.x;})))*unit,fixtureHeight:(Math.max.apply(Math,points.map(function(p){return p.y;}))-Math.min.apply(Math,points.map(function(p){return p.y;})))*unit,selected:!!b.target};});},snapshot:function(){`);
assert.notEqual(html,original);const fixture=path.join(out,engine+'-probe.html');fs.writeFileSync(fixture,html);
const pipe='\\\\.\\pipe\\gallery-size-'+process.pid+'-'+Date.now(),server=net.createServer(),pending=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));
let socket,child,sequence=0;
(async()=>{
 await new Promise(r=>server.listen(pipe,r));
 const ready=new Promise((resolve,reject)=>{server.once('connection',stream=>{socket=stream;let buffer='';stream.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.ready)resolve(message);else{const p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(Error(message.error)):p.resolve(message.value);}}}});});setTimeout(()=>reject(Error('Renderer startup timeout')),20000).unref();});
 const env={...process.env,GALLERY_QA_CHANNEL:pipe,GALLERY_QA_HTML:fixture,GALLERY_QA_PROFILE:path.join(out,engine+'-profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 child=spawn(path.join(runtime,modern?'electron.exe':'CornersNative.exe'),[],{env,windowsHide:true,stdio:'ignore'});await ready;
 const command=(action,data={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error('Command timeout '+action)),180000)});socket.write(JSON.stringify({id,action,...data})+'\n');});
 const evaluate=code=>command('evaluate',{code}),step=ms=>evaluate('galleryPhysics.step('+ms+')');
 const report={engine,htmlSHA256:require('node:crypto').createHash('sha256').update(original).digest('hex'),count:projects.length,releases:[]};
 try{
  const initial=await evaluate('galleryPhysics.snapshot().gridRail');
  report.initialSize=await evaluate(`(function(){var samples=0;for(var i=0;i<1800;i++){galleryPhysics.step(16);galleryPhysics.sizes().forEach(function(b){if(Math.abs(b.width-${initial.cellWidth})>.002||Math.abs(b.height-${initial.cellHeight})>.002)throw Error('Introduction changed normal tile size '+JSON.stringify(b));samples++;});}return {frames:1800,samples:samples,width:${initial.cellWidth},height:${initial.cellHeight}};})()`);
  await wait(1300);await step(10000);await wait(900);await step(10000);
  const deck=await evaluate('galleryPhysics.snapshot().deck'),groups={};
  for(const b of deck){groups[b.year]=(groups[b.year]||0)+1;const saved=projects.find(p=>String(p.id)===b.projectId);if(/^(19|20)\d{2}$/.test(String(saved.year||'')))assert.equal(b.year,+saved.year,'Saved date changed');}
  assert.ok(Object.keys(groups).length>=10,'Demo dates must exercise a broad year range');assert.ok(new Set(Object.values(groups)).size>=3,'Demo dates must produce differently sized groups');report.groups=groups;
  await evaluate(`window.qaSizeStable=function(before,frames){var samples=0;for(var i=0;i<frames;i++){galleryPhysics.step(16);galleryPhysics.sizes().forEach(function(b){var a=before.find(function(p){return p.id===b.id;});if(!a)throw Error('Missing prior size');for(var key of ['width','height']){if(Math.abs(b[key]-a[key])>.002)throw Error('Falling tile resized '+JSON.stringify({id:b.id,key:key,before:a[key],after:b[key]}));if(Math.abs(b[key]-b[key==='width'?'fixtureWidth':'fixtureHeight'])>.002)throw Error('Collision box does not match tile '+JSON.stringify(b));}samples++;});}return samples;};true`);
  async function select(value){await evaluate('document.querySelector("[data-value=\\"'+value+'\\"]").click();true');await step(14000);}
  for(const width of [1440,900,700,480]){
   await command('resize',{width,height:1050});await wait(30);await step(10000);await select('all');
   const state=await evaluate('galleryPhysics.snapshot()');assert.equal(state.matchIds.length,projects.length);assert.ok(state.bodies.every(b=>b.docked),'All tiles must finish docking');
   for(const option of [1999,2001,2002,2006]){
    if(option!==1999)await select('all');
    const result=await evaluate(`(function(){var before=galleryPhysics.sizes();document.querySelector('[data-value="${option}"]').click();galleryPhysics.step(0);var after=galleryPhysics.sizes();before.forEach(function(a){var b=after.find(function(b){return b.id===a.id;});if(Math.abs(a.width-b.width)>.01||Math.abs(a.height-b.height)>.01)throw Error('Size jumped at physical handoff '+JSON.stringify({id:a.id,before:a.width,after:b.width}));});return {option:${option},samples:qaSizeStable(after,20)};})()`);
    report.releases.push({viewport:width,columns:state.columns,...result});await step(14000);
   }
   await select('all');
   const preview=await evaluate(`(function(){scrollTo(0,0);var id=galleryPhysics.snapshot().matchIds[0],e=document.querySelector('.block[data-id="'+id+'"]'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.left+r.width/2,clientY:r.top+r.height/2}));galleryPhysics.step(1000);var expanded=galleryPhysics.snapshot();document.querySelector('[data-value="1999"]').click();galleryPhysics.step(0);var after=galleryPhysics.sizes(),b=after.find(function(b){return b.id===expanded.hoveredId;});if(!b||Math.abs(b.width-expanded.gridRail.cellWidth)>.01||Math.abs(b.height-expanded.gridRail.cellHeight)>.01)throw Error('Released preview must return to normal size '+JSON.stringify({hoveredId:expanded.hoveredId,cell:expanded.gridRail.cellWidth,tile:b}));return {id:b.id,width:b.width,samples:qaSizeStable(after,20)};})()`);
   report.releases.push({viewport:width,preview:true,...preview});await step(14000);
  }
  await command('capture',{path:path.join(out,engine+'-falling.png')});report.passed=true;
  fs.writeFileSync(path.join(out,engine+'-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await command('capture',{path:path.join(out,engine+'-failure.png')}).catch(()=>{});throw e;}
 finally{await command('exit').catch(()=>{});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{socket?.destroy();server.close();if(child&&!child.killed)child.kill();});
