'use strict';
// Real Flashborn, real animation clock: no mocked requestAnimationFrame or physics.
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/gallery-live-resize'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=40000){let v;const end=Date.now()+timeout;do{try{v=await read();if(check(v))return v;}catch{}await wait(80);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const label=process.env.GALLERY_RESIZE_LABEL||'current',htmlPath=process.env.GALLERY_TEST_HTML||path.join(root,'site/flash-gallery/flash.gallery.html');
 const originalHtml=fs.readFileSync(htmlPath,'utf8');
 let html=originalHtml.replace('  function resize(){','  function resize(){var qaStart=performance.now(),qaBefore=window.qaSteps||0;try{')
  .replace('moveMarker();resizeCount++;draw();\n  }','moveMarker();resizeCount++;draw();\n  }finally{if(window.qaResizeLog)qaResizeLog.push({ms:performance.now()-qaStart,steps:(window.qaSteps||0)-qaBefore,w:width,h:height,cols:gridColumns});}}')
  .replace('world.step(dt,24,24);','window.qaSteps=(window.qaSteps||0)+1;world.step(dt,24,24);')
  .replace('window.galleryPhysics={snapshot:function(){',`window.qaPeek=function(){return {width:width,height:height,columns:gridColumns,gridRail:Object.assign({},gridRail),bodies:matches.map(function(b){return {id:b.id,x:b.visual.x,y:b.visual.y,width:b.visual.width,height:b.visual.height,target:b.target};})};};window.galleryPhysics={snapshot:function(){`);
 assert.notEqual(html,originalHtml);
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const manifest=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'flashborn-browser/Flash Library/manifest.json'),'utf8'));
 const items=manifest.items.filter(i=>i.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(i.path||i.url||''));
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(path.join(profile,'Flash Library'),{recursive:true});
 fs.writeFileSync(path.join(profile,'Flash Library/manifest.json'),JSON.stringify({version:1,items}));
 fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({libraryPageOnboarded:true,settings:{theme:'light',restoreTabs:false,adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:'http://127.0.0.1:'+server.address().port+'/flash.gallery.html'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:require('electron'),args:[root],env});
 const evaluate=code=>app.evaluate(({},code)=>global.__flashborn.activeContent().native.evaluate(code),code);
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);
  await app.evaluate(({},h)=>{var w=global.__flashborn.win;w.setBounds({x:50,y:50,width:1400,height:h});w.show();w.focus();global.__flashborn.command('panel',{name:'library'});},Number(process.env.GALLERY_START_HEIGHT)||1050);
  await poll(()=>evaluate('typeof galleryPhysics'),v=>v==='object');
  try{await poll(()=>evaluate('galleryPhysics.snapshot().introPhase'),v=>v==='complete');}
  catch(error){
   const state=await evaluate('JSON.stringify(galleryPhysics.snapshot())');
   fs.writeFileSync(path.join(out,label+'-intro-timeout.json'),state);
   fs.writeFileSync(path.join(out,label+'-intro-timeout.png'),Buffer.from(await app.evaluate(()=>global.__flashborn.activeContent().native.screenshot()),'base64'));
   throw error;
  }
  await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.target&&!b.docked;}).length'),v=>v===0);
  const introduction=JSON.parse(await evaluate('(function(){var s=galleryPhysics.snapshot(),whites=s.bodies.filter(function(b){return !b.target;});return JSON.stringify({count:s.count,loaded:s.loadedCount,width:s.width,height:s.height,rowBottom:s.gridRail.lineY+s.gridRail.gap+s.gridRail.cellHeight,clearance:s.looseTop,whiteTop:whites.length?Math.min.apply(Math,whites.map(function(b){return Math.min.apply(Math,b.vertices.map(function(p){return p.y;}));})):null,maxOverlap:s.maxOverlap,maxOutside:s.maxOutside});})()'));
  assert.equal(introduction.loaded,items.length,'Real-clock introduction stalled');
  assert.ok(introduction.whiteTop===null||introduction.whiteTop>=introduction.rowBottom+23,'White pile entered the reserved first row');
  assert.ok(introduction.maxOverlap<.5&&introduction.maxOutside<.5,'Introduction ended with overlapping or out-of-bounds blocks');
  fs.writeFileSync(path.join(out,label+'-intro.png'),Buffer.from(await app.evaluate(()=>global.__flashborn.activeContent().native.screenshot()),'base64'));
  await evaluate(`window.qaResizeLog=[];window.qaFrames=[];window.qaRecording=false;window.qaSteps=0;
   window.qaRecord=function(){if(qaRecording){var s=qaPeek();if(qaFrames.length>=2000)qaFrames.shift();qaFrames.push({t:performance.now(),w:s.width,h:s.height,cols:s.columns,rail:s.gridRail,b:s.bodies.map(function(b){return {id:b.id,x:b.x,y:b.y,w:b.width,h:b.height,target:b.target};})});}requestAnimationFrame(qaRecord);};requestAnimationFrame(qaRecord);true`);
  const report={label,htmlSHA256:require('node:crypto').createHash('sha256').update(originalHtml).digest('hex'),count:items.length,introduction,runs:[]};
  async function saveRun(name){
   const data=JSON.parse(await evaluate('qaRecording=false;JSON.stringify({frames:qaFrames,resizes:qaResizeLog})'));
   const times=data.frames.slice(1).map((f,i)=>f.t-data.frames[i].t),costs=data.resizes.map(r=>r.ms),columns=[...new Set(data.frames.map(f=>f.cols))];
   const sorted=times.slice().sort((a,b)=>a-b),sortedCosts=costs.slice().sort((a,b)=>a-b);
   const final=JSON.parse(await evaluate('JSON.stringify(galleryPhysics.snapshot())'));
   const wrapTransitions=[];
   if(name==='all')for(let i=1;i<data.frames.length;i++){
    const a=data.frames[i-1],b=data.frames[i];
    assert.ok(Math.abs(b.rail.displayWidth-b.rail.availableWidth)<.03,'The line must scale directly with the available width');
    if(b.b.length){
     const left=Math.min(...b.b.map(tile=>tile.x-tile.w/2)),right=Math.max(...b.b.map(tile=>tile.x+tile.w/2));
     assert.ok(Math.abs(left-b.rail.left)<.04&&Math.abs(right-b.rail.left-b.rail.width)<.04,'The rendered tile group must fill the line on every live frame');
    }
    if(a.cols<=b.cols)continue;
    const carried=a.b.find(tile=>tile.target.row===0&&tile.target.column===b.cols);
    if(!carried)continue;
    const destination=b.b.find(tile=>tile.id===carried.id);
    assert.equal(destination.target.row,1);assert.equal(destination.target.column,0);
    for(const tile of a.b.filter(tile=>tile.target.row===0&&tile.target.column<b.cols)){
     const next=b.b.find(n=>n.id===tile.id);
     assert.equal(next.target.row,0);assert.equal(next.target.column,tile.target.column);
    }
    wrapTransitions.push({from:a.cols,to:b.cols,carriedId:carried.id,orderPreserved:true});
   }
   const summary={name,frames:data.frames.length,resizes:data.resizes.length,columns,wrapTransitions,maxFrameMs:Math.max(0,...times),p95FrameMs:sorted[Math.floor(sorted.length*.95)],maxResizeMs:Math.max(0,...costs),p95ResizeMs:sortedCosts[Math.floor(sortedCosts.length*.95)],maxResizeSteps:Math.max(0,...data.resizes.map(r=>r.steps)),finalOutside:final.maxOutside,finalOverlap:final.maxOverlap};
   fs.writeFileSync(path.join(out,label+'-'+name+'.json'),JSON.stringify(data));report.runs.push(summary);console.log(JSON.stringify(summary));
  }
  if(process.env.GALLERY_HOVER_UNIFORM==='1'){
   await evaluate('document.querySelector("[data-value=all]").click();true');
   await poll(()=>evaluate('JSON.stringify((function(){var s=galleryPhysics.snapshot();return {count:s.matchIds.length,moving:s.bodies.filter(function(b){return b.target&&!b.docked;}).length};})())'),value=>{const state=JSON.parse(value);return state.count===items.length&&state.moving===0;});
   const ids=JSON.parse(await evaluate('JSON.stringify(galleryPhysics.snapshot().matchIds)'));
   report.uniformHovers=[];
   for(const id of ids.concat(ids[Math.min(8,ids.length-1)])){
    await evaluate('dispatchEvent(new WheelEvent("wheel"));true');
    await app.evaluate(()=>global.__flashborn.activeContent().native.call('test-mouse',{type:'mouseMove',x:1,y:1,button:'none',clickCount:0}));
    await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.target&&!b.docked;}).length'),v=>v===0);
    const point=JSON.parse(await evaluate('(function(){var e=Array.from(document.querySelectorAll(".block")).find(function(e){return +e.dataset.id==='+id+';}),r=e.getBoundingClientRect();scrollTo(0,Math.max(0,r.top+scrollY-innerHeight*.4));r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()'));
    await app.evaluate(({},p)=>global.__flashborn.activeContent().native.call('test-mouse',{type:'mouseMove',x:p.x,y:p.y,button:'none',clickCount:0}),point);
    await poll(()=>evaluate('JSON.stringify((function(){var s=galleryPhysics.snapshot();return {hover:s.hoveredId,moving:s.bodies.filter(function(b){return b.target&&!b.docked;}).length};})())'),value=>{const state=JSON.parse(value);return state.hover===id&&state.moving===0;});
    const s=JSON.parse(await evaluate('JSON.stringify(galleryPhysics.snapshot())')),f=s.gridRail;
    assert.equal(s.columns,5);
    for(const b of s.bodies){
     assert.ok(Math.abs(b.width-(b.id===id?2*f.cellWidth+f.gap:f.cellWidth))<.02,'Native hover changed a normal tile width');
     assert.ok(Math.abs(b.height-(b.id===id?2*f.cellHeight+f.gap:f.cellHeight))<.02,'Native hover changed a normal tile height');
     if(b.target.column+b.target.span===5)assert.ok(Math.abs(b.x+b.width/2-f.left-f.width)<.02,'Native hover left spare space at the right edge');
    }
    for(let a=0;a<s.bodies.length;a++)for(let b=a+1;b<s.bodies.length;b++){
     const first=s.bodies[a],second=s.bodies[b],dx=Math.abs(first.x-second.x)-(first.width+second.width)/2,dy=Math.abs(first.y-second.y)-(first.height+second.height)/2;
     assert.ok(dx>=f.gap-.02||dy>=f.gap-.02,'Native hover changed a gutter');
    }
    const hit=await evaluate('(function(){var e=document.elementFromPoint('+point.x+','+point.y+');return e&&e.closest(".block")&&+e.closest(".block").dataset.id;})()');assert.equal(hit,id,'Native hover moved away from the acquired pointer');
    report.uniformHovers.push({id,pointerHeld:true,uniformCells:true,equalGutters:true});
    console.log('Native uniform hover '+report.uniformHovers.length+'/'+(ids.length+1));
   }
   fs.writeFileSync(path.join(out,label+'-hover.png'),Buffer.from(await app.evaluate(()=>global.__flashborn.activeContent().native.screenshot()),'base64'));
   report.passed=true;fs.writeFileSync(path.join(out,label+'-results.json'),JSON.stringify(report,null,2));return;
  }
  for(const option of process.env.GALLERY_DRAG_ONLY==='1'?[]:['all','2006']){
   await evaluate('document.querySelector("[data-value="+JSON.stringify('+JSON.stringify(option)+')+"]").click();true');
   await poll(()=>evaluate('JSON.stringify((function(){var s=galleryPhysics.snapshot();return {count:s.matchIds.length,expected:s.deck.filter(function(b){return s.option==="all"||b.year===s.option;}).length,moving:s.bodies.filter(function(b){return b.target&&!b.docked;}).length};})())'),v=>{const s=JSON.parse(v);return s.count===s.expected&&s.moving===0;});
   await evaluate('scrollTo(0,0);qaResizeLog=[];qaFrames=[];qaRecording=true;true');
   await app.evaluate(async()=>{
    const w=global.__flashborn.win;
    // Main-process timer drives a continuous gesture without per-step IPC waits.
    for(const [from,to] of [[1400,900],[900,1600],[1600,900],[900,1400]]){await new Promise(resolve=>{var start=Date.now(),duration=Math.abs(to-from)*2;var timer=setInterval(()=>{var p=Math.min(1,(Date.now()-start)/duration);w.setBounds({width:Math.round(from+(to-from)*p)});if(p===1){clearInterval(timer);resolve();}},16);});await new Promise(r=>setTimeout(r,120));}
   });
   await wait(1000);await saveRun(option);
  }
  await evaluate('document.querySelector("[data-value=all]").click();scrollTo(0,0);true');
  await app.evaluate(()=>global.__flashborn.win.setBounds({width:900,height:1050}));await wait(1500);
  await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.target&&!b.docked;}).length'),v=>v===0);
  const point=JSON.parse(await evaluate('(function(){var s=galleryPhysics.snapshot(),e=Array.from(document.querySelectorAll(".block")).find(function(e){return +e.dataset.id===s.matchIds[0];}),r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()'));
  await app.evaluate(({},p)=>global.__flashborn.activeContent().native.call('test-mouse',{type:'mouseMove',x:p.x,y:p.y,button:'none',clickCount:0}),point);await wait(1000);
  const preview=JSON.parse(await evaluate('(function(){var s=galleryPhysics.snapshot(),b=s.bodies.find(function(b){return b.id===s.hoveredId;});return JSON.stringify({columns:s.columns,rail:s.gridRail,preview:b&&{left:b.x-b.width/2,right:b.x+b.width/2,width:b.width}});})()'));
  report.preview=preview;console.log('PREVIEW '+JSON.stringify(preview));
  fs.writeFileSync(path.join(out,label+'-two-columns.png'),Buffer.from(await app.evaluate(()=>global.__flashborn.activeContent().native.screenshot()),'base64'));
  if(process.env.GALLERY_DRAG_WAIT==='1'){
   await app.evaluate(()=>global.__flashborn.win.setBounds({width:1400,height:1050}));
   await evaluate('dispatchEvent(new WheelEvent("wheel"));scrollTo(0,0);qaResizeLog=[];qaFrames=[];qaRecording=true;true');
   const sentinel=path.join(out,label+'-drag-finished');
   console.log('READY FOR MANUAL WINDOW DRAG. Create '+sentinel+' when finished.');
   const deadline=Date.now()+90000;while(!fs.existsSync(sentinel)&&Date.now()<deadline)await wait(500);
   await wait(700);await saveRun('os-drag');
   report.manualDragExercised=report.runs[report.runs.length-1].columns.length>1;
   assert.ok(report.manualDragExercised,'The manual recording did not capture a column transition');
  }
  if(process.env.GALLERY_RESIZE_ASSERT==='1'){
   assert.equal(preview.columns,2);assert.ok(preview.preview);
   assert.ok(Math.abs(preview.preview.left-preview.rail.left)<.1&&Math.abs(preview.preview.right-preview.rail.left-preview.rail.width)<.1,'Preview must fill both columns, including gutter');
   for(const run of report.runs)assert.ok(run.maxResizeSteps<=12,'Resize work must be bounded independently of distance');
  }
  report.passed=true;fs.writeFileSync(path.join(out,label+'-results.json'),JSON.stringify(report,null,2));
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
