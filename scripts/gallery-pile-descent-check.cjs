'use strict';
// Regression for the introduction filling the spawn area in short viewports.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/gallery-pile-descent');
const modern=process.env.GALLERY_PROBE_ENGINE==='modern',engine=modern?'modern':'native',label=process.env.GALLERY_PILE_LABEL||engine;
const runtime=path.join(out,engine+'-runtime'),source=path.join(root,modern?'node_modules/electron/dist':'vendor/native-runtime');
function linkTree(from,to){fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){if(e.name==='resources')continue;const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isDirectory())linkTree(a,b);else if(!fs.existsSync(b))fs.linkSync(a,b);}}
linkTree(source,runtime);fs.mkdirSync(path.join(runtime,'resources/app'),{recursive:true});
fs.writeFileSync(path.join(runtime,'resources/app/package.json'),JSON.stringify({name:'gallery-pile-qa',version:'1.0.0',main:'main.cjs'}));
fs.copyFileSync(path.join(root,'tests/fixtures/gallery-motion-main.cjs'),path.join(runtime,'resources/app/main.cjs'));
const artifact=process.env.GALLERY_PROBE_HTML||path.join(root,'site/flash-gallery/flash.gallery.html'),original=fs.readFileSync(artifact,'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8'));
const saved=manifest.items.filter(i=>i.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(i.path||i.url||''));
const cases=[{name:'wide-short',w:1000,h:420,count:28,seed:77579},{name:'narrow-short',w:480,h:360,count:28,seed:31817},{name:'very-short',w:760,h:280,count:28,seed:99},{name:'resize-loading',w:1000,h:500,count:28,seed:1987,resize:true},{name:'larger-collection',w:760,h:420,count:56,seed:77579}].filter(c=>!process.env.GALLERY_PILE_CASE||c.name===process.env.GALLERY_PILE_CASE);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function run(test){
 const projects=Array.from({length:test.count},(_,i)=>({...saved[i%saved.length],id:'pile-qa-'+i}));
 let html=original.replace(/window\.galleryProjects=[\s\S]*?;<\/script>/,'window.galleryProjects='+JSON.stringify(projects).replace(/</g,'\\u003c')+';</script>');
 html=html.replace('<script>','<script>var qaSeed='+test.seed+';Math.random=function(){return ((qaSeed=(Math.imul(qaSeed,1664525)+1013904223)>>>0)/4294967296);};</script><script>');
 html=html.replace('window.galleryPhysics={snapshot:function(){',`stopped=true;cancelAnimationFrame(raf);window.qaMaxPileIntrusion=0;window.galleryPhysics={
 step:function(ms){if(width!==document.documentElement.clientWidth||height!==innerHeight)resize();else if(layoutDirty){layoutDirty=false;layoutTargets();}for(var qa=0;qa<ms;qa+=step){advance();if(!ready||introPending)blocks.forEach(function(b){if(b.inPile&&!b.target){var intrusion=looseTop-extent(vertices(b)).top;if(intrusion>1&&!window.qaFirstIntrusion)window.qaFirstIntrusion={elapsed:elapsed,top:looseTop,id:b.id,entered:b.entered,held:!!b.resizeHeld,bounds:extent(vertices(b)),width:b.width,height:b.height};qaMaxPileIntrusion=Math.max(qaMaxPileIntrusion,intrusion);};});}draw();},
 pile:function(){var enteredTop=Infinity,pileTop=Infinity,dimensions=true,pileCount=0;blocks.forEach(function(b){if(!b.target){if(b.width!==baseWidth||b.height!==baseWidth/2)dimensions=false;if(b.inPile){pileCount++;var top=extent(vertices(b)).top;pileTop=Math.min(pileTop,top);if(b.entered)enteredTop=Math.min(enteredTop,top);}}});return {elapsed:elapsed,count:blocks.length,loaded:loadedCount,ready:ready,intro:introPhase,matches:matches.length,width:width,height:height,floor:floorY,clearance:looseTop,rowBottom:gridRail.lineY+gridRail.gap+gridRail.cellHeight,baseWidth:baseWidth,enteredTop:enteredTop,pileTop:pileTop,pileCount:pileCount,dimensions:dimensions};},snapshot:function(){`);
 assert.notEqual(html,original);const fixture=path.join(out,label+'-'+test.name+'.html');fs.writeFileSync(fixture,html);
 const pipe='\\\\.\\pipe\\gallery-pile-'+process.pid+'-'+Date.now(),server=net.createServer(),pending=new Map();let socket,child,sequence=0;
 await new Promise(r=>server.listen(pipe,r));
 const ready=new Promise((resolve,reject)=>{server.once('connection',stream=>{socket=stream;let buffer='';stream.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.ready)resolve(message);else{const p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(Error(message.error)):p.resolve(message.value);}}}});});setTimeout(()=>reject(Error('Renderer startup timeout')),20000).unref();});
 const env={...process.env,GALLERY_QA_CHANNEL:pipe,GALLERY_QA_HTML:fixture,GALLERY_QA_PROFILE:path.join(out,label+'-'+test.name+'-profile'),GALLERY_QA_WIDTH:String(test.w),GALLERY_QA_HEIGHT:String(test.h)};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 child=spawn(path.join(runtime,modern?'electron.exe':'CornersNative.exe'),[],{env,windowsHide:true,stdio:'ignore'});
 const command=(action,data={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error('Command timeout '+action)),180000)});socket.write(JSON.stringify({id,action,...data})+'\n');});
 const evaluate=code=>command('evaluate',{code}),step=ms=>evaluate('galleryPhysics.step('+ms+')'),read=()=>evaluate('galleryPhysics.pile()');
 const trace=[];
 try{
  await ready;await evaluate('document.fonts.ready.then(function(){return true;})');let previous=await read(),resizedDown=false,resizedUp=false,maxStep=0,maxIntrusion=0;
  for(let t=0;t<40000&&!previous.ready;t+=250){
   let resized=false;
   if(test.resize&&t>=2000&&!resizedDown){await command('resize',{width:700,height:280});resizedDown=true;resized=true;await wait(20);}
   if(test.resize&&t>=6000&&!resizedUp){await command('resize',{width:1000,height:560});resizedUp=true;resized=true;await wait(20);}
   await step(250);const state=await read();trace.push(state);
   assert.ok(state.dimensions,'Pile descent resized a falling tile');
   if(state.loaded<test.count)assert.equal(state.matches,0,'Resize magnetized projects before loading finished');
   if(!resized){const delta=state.floor-previous.floor;maxStep=Math.max(maxStep,delta);assert.ok(delta>=-.05&&delta<=state.baseWidth*6*.26+1,'Pile floor jumped instead of descending progressively');}
   if(state.pileTop!==null&&!resized)maxIntrusion=Math.max(maxIntrusion,state.clearance-state.pileTop);
   previous=state;
  }
  const loaded=await read();assert.equal(loaded.loaded,test.count,'Introduction stalled before all projects loaded');assert.equal(loaded.count,test.count);assert.ok(loaded.ready,'Sorting interface never became ready');
  maxIntrusion=Math.max(maxIntrusion,await evaluate('qaMaxPileIntrusion'));
  assert.ok(loaded.clearance>=loaded.rowBottom+23.9,'Introduction did not reserve a row beneath the line');
  assert.ok(maxIntrusion<1,'The pile entered the reserved row: '+maxIntrusion);
  for(let i=0;i<24&&(await read()).intro!=='complete';i++){await wait(250);await step(500);}
  await step(8000);
  const final=await read(),state=await evaluate('galleryPhysics.snapshot()');
  assert.equal(final.intro,'complete','Sorting entrance did not finish');assert.ok(final.matches>0,'Initial year never magnetized');
  assert.ok(state.bodies.filter(b=>b.target).every(b=>b.docked),'Initial year did not finish docking');
  await command('capture',{path:path.join(out,label+'-'+test.name+'.png')});
  fs.writeFileSync(path.join(out,label+'-'+test.name+'-trace.json'),JSON.stringify(trace));
  return {name:test.name,viewport:[test.w,test.h],count:test.count,loadedAt:loaded.elapsed,floorDescent:loaded.floor-test.h,maxFloorChangePerQuarterSecond:maxStep,maxPileIntrusion:maxIntrusion,intro:final.intro,initialMatches:final.matches,passed:true};
 }catch(e){fs.writeFileSync(path.join(out,label+'-'+test.name+'-failure.json'),JSON.stringify({trace,intrusion:await evaluate("window.qaFirstIntrusion||null"),state:await read().catch(()=>null)},null,2));await command('capture',{path:path.join(out,label+'-'+test.name+'-failure.png')}).catch(()=>{});throw e;}
 finally{await command('exit').catch(()=>{});socket?.destroy();server.close();if(child&&!child.killed)child.kill();}
}
(async()=>{const report={engine,htmlSHA256:require('node:crypto').createHash('sha256').update(original).digest('hex'),cases:[]};for(const test of cases){const result=await run(test);report.cases.push(result);console.log(JSON.stringify(result));}report.passed=true;fs.writeFileSync(path.join(out,label+'-results.json'),JSON.stringify(report,null,2));})().catch(e=>{console.error(e.stack);process.exitCode=1;});

