'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'test-output/gallery-grid-motion'),modern=process.env.GALLERY_PROBE_ENGINE==='modern',source=path.join(root,modern?'node_modules/electron/dist':'vendor/native-runtime'),runtime=path.join(dir,modern?'native-qa-modern':'native-qa-runtime');
function linkTree(from,to){fs.mkdirSync(to,{recursive:true});for(const entry of fs.readdirSync(from,{withFileTypes:true})){const a=path.join(from,entry.name),b=path.join(to,entry.name);if(entry.name==='resources')continue;if(entry.isDirectory())linkTree(a,b);else if(!fs.existsSync(b))fs.linkSync(a,b);}}
linkTree(source,runtime);fs.mkdirSync(path.join(runtime,'resources/app'),{recursive:true});
fs.writeFileSync(path.join(runtime,'resources/app/package.json'),JSON.stringify({name:'gallery-native-qa',version:'1.0.0',main:'main.cjs'}));
fs.copyFileSync(path.join(root,'tests/fixtures/gallery-motion-main.cjs'),path.join(runtime,'resources/app/main.cjs'));
const artifact=process.env.GALLERY_PROBE_HTML||path.join(root,'site/flash-gallery/flash.gallery.html');
let html=fs.readFileSync(artifact,'utf8');
if(process.env.GALLERY_PROJECTS_FIXTURE)html=html.replace(/window\.galleryProjects=[\s\S]*?;<\/script>/,'window.galleryProjects='+fs.readFileSync(process.env.GALLERY_PROJECTS_FIXTURE,'utf8')+';</script>');
html=html.replace('<script>','<script>window.onerror=function(m,u,l,c){window.qaError=[m,l,c];};if(!Element.prototype.replaceChildren)Element.prototype.replaceChildren=function(){while(this.firstChild)this.removeChild(this.firstChild);};var qaSeed=77579;Math.random=function(){return ((qaSeed=(Math.imul(qaSeed,1664525)+1013904223)>>>0)/4294967296);};</script><script>');
html=html.replace('window.galleryPhysics={snapshot:function(){','stopped=true;cancelAnimationFrame(raf);window.galleryPhysics={step:function(ms){if(width!==document.documentElement.clientWidth||height!==innerHeight)resize();for(var qa=0;qa<ms;qa+=step)advance();draw();},snapshot:function(){');
html=html.replace('snapshot:function(){','qaHover:function(){return {anchor:hoverAnchor,point:hoverPoint,scrollY:scrollY,renderHeight:renderHeight};},qaResetGrid:function(){setHovered(null);matches.forEach(function(b){b.motion=null;b.visual={x:b.target.x,y:b.target.y,width:b.target.width,height:b.target.height,angle:0,vx:0,vy:0};b.docked=true;b.laidOut=true;b.clearOfPile=true;});draw();},snapshot:function(){');
const fixture=path.join(dir,modern?'modern-probe.html':'native-probe.html');fs.writeFileSync(fixture,html);
const pipe='\\\\.\\pipe\\gallery-probe-'+process.pid+'-'+Date.now(),pending=new Map();let seq=0,child,socket;
const server=net.createServer();const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await new Promise(r=>server.listen(pipe,r));const ready=new Promise((resolve,reject)=>{server.once('connection',stream=>{socket=stream;let buffer='';stream.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const msg=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(msg.ready)resolve(msg);else{const item=pending.get(msg.id);if(item){pending.delete(msg.id);clearTimeout(item.timer);msg.error?item.reject(Error(msg.error)):item.resolve(msg.value);}}}});});setTimeout(()=>reject(Error('Native QA launch timed out')),20000).unref();});
 const env={...process.env,GALLERY_QA_CHANNEL:pipe,GALLERY_QA_HTML:fixture,GALLERY_QA_PROFILE:path.join(dir,modern?'modern-probe-profile':'native-profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 child=spawn(path.join(runtime,modern?'electron.exe':'CornersNative.exe'),[],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});let log='';child.stderr.on('data',s=>{log=(log+s).slice(-2500);if(String(s).includes('RENDERER'))console.log(String(s).trim());});
 const meta=await ready;console.log(JSON.stringify(meta));
 const command=(action,data={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error('QA command timeout '+action+' '+log)),180000)});socket.write(JSON.stringify({id,action,...data})+'\n');});
 const evaluate=code=>command('evaluate',{code}),step=ms=>evaluate('galleryPhysics.step('+ms+')');
 console.log(JSON.stringify(await evaluate('({url:location.href,scripts:document.scripts.length,physics:typeof galleryPhysics,planck:typeof planck,error:window.qaError})')));
 const results=[];let expectedCount=0;
 const read=()=>evaluate('galleryPhysics.snapshot()');
 async function settle(){await step(6000);await wait(20);await step(6000);}
 try{
  await evaluate('document.fonts.ready.then(function(){return true;})');await step(40000);await wait(1300);await step(10000);await wait(900);await step(10000);
  await evaluate('document.querySelector("[data-value=all]").click()');await settle();
  expectedCount=(await read()).count;console.log('All '+expectedCount+' projects loaded; starting directional neighbor matrix.');
  await evaluate(`window.qaRect=function(id){var r=document.querySelector('.block[data-id="'+id+'"]').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  window.qaOwner=function(){var e=document.querySelector('.block[data-expanded=true]');return e?+e.dataset.id:null;};
  window.qaUI=function(){return ['h1','#search','#indices','#magnet-line'].map(function(s){var e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.left,y:r.top+scrollY,w:r.width,h:r.height,font:getComputedStyle(e).fontSize};});};
  window.qaFixedUI=function(){if(!window.qaBaseline)return;var now=qaUI();for(var k=0;k<now.length;k++){if(now[k].font!==qaBaseline[k].font)throw Error('Interface font scaled during hover');for(var key of ['x','y','w','h'])if(Math.abs(now[k][key]-qaBaseline[k][key])>.03)throw Error('Interface moved during hover '+key);}};
  window.qaMove=function(p,expected){var hit=document.elementFromPoint(p.x,p.y),b=hit&&hit.closest('.block[data-interactive=true]');if(expected!==undefined&&(!b||+b.dataset.id!==expected))throw Error('Intended neighbor was obscured BEFORE entry '+JSON.stringify({expected:expected,hit:b&&b.dataset.id,point:p}));(hit||document.body).dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:p.x,clientY:p.y}));return b&&+b.dataset.id;};
  window.qaPoint=function(id,fx,fy){var r=qaRect(id),p={x:r.left+r.width*fx,y:r.top+r.height*fy};if(p.x<=0||p.x>=innerWidth||p.y<=0||p.y>=innerHeight)return null;var hit=document.elementFromPoint(p.x,p.y),b=hit&&hit.closest('.block');return b&&+b.dataset.id===id?p:null;};
  window.qaClear=function(){qaMove({x:1,y:1});galleryPhysics.qaResetGrid();};
  window.qaHold=function(id,p,acquired,frames){var full=0,body=galleryPhysics.snapshot().bodies.find(function(b){return b.id===id;});for(var i=0;i<frames;i++){
   galleryPhysics.step(16);var owner=qaOwner(),hit=document.elementFromPoint(p.x,p.y),tile=hit&&hit.closest('.block'),r=qaRect(id);
   if(i===6)qaFixedUI();
   if(owner!==id||!tile||+tile.dataset.id!==id)throw Error('Neighbor escaped under stationary pointer '+JSON.stringify({id:id,point:p,owner:owner,hit:tile&&tile.dataset.id,rect:r}));
   var t=body.target,top=acquired.top+scrollY;
   if(t.x-t.width/2<=acquired.left+.02&&t.x+t.width/2>=acquired.right-.02&&t.y-t.height/2<=top+.02&&t.y+t.height/2>=top+acquired.height-.02){
    if(r.left>acquired.left+.025||r.right<acquired.right-.025||r.top>acquired.top+.025||r.bottom<acquired.bottom-.025)throw Error('Acquired visible tile moved away '+JSON.stringify({id:id,point:p,acquired:acquired,rect:r,target:t,hover:galleryPhysics.qaHover()}));full++;
   }
  }return full;};void 0`);
  for(const viewport of (process.env.GALLERY_QA_RESIZE_ONLY?[]:process.env.GALLERY_QA_WIDTHS?process.env.GALLERY_QA_WIDTHS.split(',').map(Number):[1440,950,700,490,330])){
   await command('resize',{width:viewport,height:2200});await wait(40);await evaluate('qaClear();scrollTo(0,0)');await settle();
   await evaluate('window.qaBaseline=qaUI();void 0');
   const s=await read();
   // Build actual directional adjacency, including diagonals, for EVERY card.
   await evaluate(`window.qaRunNeighbors=function(startEdge,endEdge){var ids=galleryPhysics.snapshot().matchIds,cases=0,held=0,coverage=0,paths=0,directions={};
    qaClear();var base=ids.map(function(id){var r=qaRect(id);return {id:id,x:r.left+r.width/2,y:r.top+r.height/2};});
    var edges=[];base.forEach(function(a){var nearest={};base.forEach(function(b){if(a.id===b.id)return;var dx=b.x-a.x,dy=b.y-a.y,angle=Math.atan2(dy,dx),direction=(Math.round(angle/(Math.PI/4))+8)%8,distance=Math.hypot(dx,dy);if(!nearest[direction]||distance<nearest[direction].distance)nearest[direction]={id:b.id,distance:distance};});Object.keys(nearest).forEach(function(d){edges.push({from:a.id,to:nearest[d].id,direction:d});});});
    for(var edge of edges.slice(startEdge,endEdge))for(var delay of [0,32,160,650])for(var location of [.025,.5,.975]){
     qaClear();var sr=qaRect(edge.from);scrollTo(0,Math.max(0,sr.top+scrollY-innerHeight*.35));
     var p=qaPoint(edge.from,.5,.5);if(!p)throw Error('Missing source '+edge.from);qaMove(p,edge.from);galleryPhysics.step(delay);
     var q=qaPoint(edge.to,location,1-location)||qaPoint(edge.to,.5,.5);
     if(!q){var tr=qaRect(edge.to);scrollBy(0,tr.top+tr.height/2-innerHeight/2);qaMove({x:1,y:1});galleryPhysics.step(1600);q=qaPoint(edge.to,location,1-location)||qaPoint(edge.to,.5,.5);}
     if(!q)throw Error('Neighbor not reachable '+JSON.stringify(edge));
     var acquired=qaRect(edge.to);qaMove(q,edge.to);coverage+=qaHold(edge.to,q,acquired,12);held+=12;cases++;directions[edge.direction]=true;
     // Reverse before the new preview settles, taking its near corner.
     var back=qaPoint(edge.from,1-location,location)||qaPoint(edge.from,.5,.5);
     if(back){var old=qaRect(edge.from);qaMove(back,edge.from);coverage+=qaHold(edge.from,back,old,8);held+=8;paths++;}
    }
    // Slow and fast crossings of the visible gutters. Every real entry gets
    // captured; a tile must stay under that entry while the pointer pauses.
    for(var edge of edges.slice(startEdge,endEdge))for(var speed of [2,8,24]){
     qaClear();var sr=qaRect(edge.from);scrollTo(0,Math.max(0,sr.top+scrollY-innerHeight*.35));var p=qaPoint(edge.from,.5,.5);if(!p)continue;
     qaMove(p,edge.from);galleryPhysics.step(32);var dest=qaPoint(edge.to,.5,.5);if(!dest)continue;
     for(var k=1;k<=speed;k++){var q={x:p.x+(dest.x-p.x)*k/speed,y:p.y+(dest.y-p.y)*k/speed},hit=document.elementFromPoint(q.x,q.y),b=hit&&hit.closest('.block[data-interactive=true]'),old=b&&qaRect(+b.dataset.id),id=qaMove(q);if(id){qaHold(id,q,old,2);held+=2;}else galleryPhysics.step(32);paths++;}
    }
    qaClear();return {cases:cases,heldFrames:held,preservedFootprintFrames:coverage,pathSteps:paths,directions:Object.keys(directions),ids:ids.length,totalEdges:edges.length};};void 0`);
   const stats={cases:0,heldFrames:0,preservedFootprintFrames:0,pathSteps:0,directions:[],ids:expectedCount},empty=await evaluate('qaRunNeighbors(0,0)');
   for(let start=0;start<empty.totalEdges;start+=8){const batch=await evaluate('qaRunNeighbors('+start+','+(start+8)+')');for(const k of ['cases','heldFrames','preservedFootprintFrames','pathSteps'])stats[k]+=batch[k];stats.directions=[...new Set([...stats.directions,...batch.directions])];if(start%32===0)console.log('Checked width '+s.width+', neighbors '+Math.min(start+8,empty.totalEdges)+'/'+empty.totalEdges);}
   const uniform=await evaluate(`(function(){var ids=galleryPhysics.snapshot().matchIds,checks=0;for(var id of ids){qaClear();var sr=qaRect(id);scrollTo(0,Math.max(0,sr.top+scrollY-innerHeight*.35));var point=qaPoint(id,.5,.5);if(!point)throw Error('Missing uniform-grid hover tile '+id);qaMove(point,id);galleryPhysics.step(2200);var state=galleryPhysics.snapshot(),f=state.gridRail;for(var b of state.bodies){var active=b.id===id,w=active?2*f.cellWidth+f.gap:f.cellWidth,h=active?2*f.cellHeight+f.gap:f.cellHeight;if(Math.abs(b.width-w)>.015||Math.abs(b.height-h)>.015)throw Error('Hover squeezed a rendered neighbor '+JSON.stringify({hover:id,id:b.id,width:b.width,height:b.height,expected:[w,h]}));if(b.target.column===0&&Math.abs(b.x-b.width/2-f.left)>.015)throw Error('Left hover edge stopped filling the line');if(b.target.column+b.target.span===state.columns&&Math.abs(b.x+b.width/2-f.left-f.width)>.015)throw Error('Right hover edge stopped filling the line');}for(var a=0;a<state.bodies.length;a++)for(var b=a+1;b<state.bodies.length;b++){var first=state.bodies[a],second=state.bodies[b],dx=Math.abs(first.x-second.x)-(first.width+second.width)/2,dy=Math.abs(first.y-second.y)-(first.height+second.height)/2;if(dx<f.gap-.02&&dy<f.gap-.02)throw Error('Rendered hover gutters became unequal');}checks++;}qaClear();return checks;})()`);
   results.push({width:s.width,columns:s.columns,uniformHoverTiles:uniform,...stats});console.log(JSON.stringify(results[results.length-1]));
  }
  await evaluate('qaClear();scrollTo(0,0);window.qaBaseline=null');await command('resize',{width:1440,height:1000});await wait(30);await settle();
  // Continuous live drags through every column threshold, in both directions.
  // Column changes cannot reset tile scale. The rail can rearrange, while
  // tiles follow the continuous size function rather than stretching to it.
  let previous=await read(),thresholds=0,frames=0;
  for(const direction of [-1,1])for(let n=0;n<=144;n++){
   const w=direction<0?1440-n*8:288+n*8;
   previous=await read();
   await command('resize',{width:w,height:1000});await wait(6);await step(0);
   const next=await read(),scale=next.gridRail.width/previous.gridRail.width;
   if(next.columns<2||next.columns>5)throw Error('Columns outside 2–5');
   if(next.columns!==previous.columns)thresholds++;
   for(const b of next.bodies){const a=previous.bodies.find(p=>p.id===b.id);const expected={x:next.gridRail.left+(a.x-previous.gridRail.left)*scale,y:next.gridRail.lineY+(a.y-previous.gridRail.lineY)*scale,width:a.width*scale,height:a.height*scale};for(const key of ['x','y','width','height'])if(Math.abs(b[key]-expected[key])>.03)throw Error('Resize assigned a breakpoint pose '+JSON.stringify({w,id:b.id,key,expected:expected[key],actual:b[key],before:previous.columns,after:next.columns}));}
   // The first animation frame must begin at the previous velocity, rather
   // than jump straight to a new slot or wait until resizing has ended.
   await step(16);frames++;
   const moved=await read();if(moved.bodies.some(b=>!Number.isFinite(b.x+b.y+b.width+b.height)))throw Error('Invalid live reflow');
   const left=Math.min(...moved.bodies.map(b=>b.x-b.width/2)),right=Math.max(...moved.bodies.map(b=>b.x+b.width/2));
   if(Math.abs(left-moved.gridRail.left)>.03||Math.abs(right-moved.gridRail.left-moved.gridRail.width)>.03)throw Error('Animated group stopped filling the line');
   const live=await evaluate('(function(){var s=galleryPhysics.snapshot(),r=document.getElementById("magnet-line").getBoundingClientRect();return {rail:{left:r.left,width:r.width,center:r.left+r.width/2},grid:s.gridRail,columns:s.columns,width:s.width,actualWidth:document.documentElement.clientWidth};})()');
   if(Math.abs(live.rail.center-live.grid.center)>.03||Math.abs(live.rail.width-live.grid.availableWidth)>.03)throw Error('Line must follow the full available width '+JSON.stringify({requested:w,...live}));
  }
  // Repeat with NO time to settle between resize events.
  await evaluate('qaClear()');
  for(let n=0;n<240;n++){const w=n<120?1440-n*9.2:336+(n-120)*9.2;await command('resize',{width:Math.round(w),height:1000});await wait(3);await step(16);frames++;const s=await read(),left=Math.min(...s.bodies.map(b=>b.x-b.width/2)),right=Math.max(...s.bodies.map(b=>b.x+b.width/2));if(s.columns<2||s.columns>5||Math.abs(left-s.gridRail.left)>.03||Math.abs(right-s.gridRail.left-s.gridRail.width)>.03)throw Error('Group lost the line during uninterrupted drag');}
  await settle();let final=await read();if(final.bodies.some(b=>!b.docked)||final.matchIds.length!==expectedCount)throw Error('Missing final card after live drag');
  const years=[];
  for(const year of [1999,2000,2001,2002,2003,2004,2005,2006,2007,2008,2009,'all']){await evaluate('document.querySelector("[data-value=\\"'+year+'\\"]").click()');await settle();const s=await read();if(s.option!==year||s.matchIds.length!==s.deck.filter(b=>year==='all'||b.year===year).length)throw Error('Unclickable year '+year);years.push(year);}
  await command('resize',{width:1000,height:900});await wait(20);await settle();await evaluate('window.qaBaseline=qaUI();void 0');
  for(const h of [600,720,1080,1400,800,1200]){await command('resize',{width:1000,height:h});await wait(10);await step(500);await evaluate('qaFixedUI()');}
  await evaluate('window.qaBaseline=null;void 0');await command('resize',{width:700,height:1100});await wait(20);await settle();
  await evaluate('scrollTo(0,0);var id=galleryPhysics.snapshot().matchIds[1];var p=qaPoint(id,.5,.5);qaMove(p,id);galleryPhysics.step(900);void 0');
  await command('capture',{path:path.join(dir,(modern?'modern':'native')+'-neighbor-final.png')});
  const report={passed:true,artifactSHA256:require('node:crypto').createHash('sha256').update(fs.readFileSync(artifact)).digest('hex'),results,thresholds,liveResizeFrames:frames,verticalResizes:6,solidInterface:true,years};
  fs.writeFileSync(path.join(dir,(modern?'modern':'native')+'-neighbor-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await command('capture',{path:path.join(dir,(modern?'modern':'native')+'-neighbor-failure.png')}).catch(()=>{});throw e;}
 finally{await command('exit').catch(()=>{});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{socket?.destroy();server.close();if(child&&!child.killed)child.kill();});
