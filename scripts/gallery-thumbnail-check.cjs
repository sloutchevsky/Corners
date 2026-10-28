'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'test-output/gallery-thumbnail'),modern=process.env.GALLERY_PROBE_ENGINE==='modern',engine=modern?'modern':'native';
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
 const env={...process.env,GALLERY_QA_HIDDEN:'1',GALLERY_QA_CHANNEL:channel,GALLERY_QA_HTML:fixture,GALLERY_QA_PROFILE:path.join(dir,engine+'-profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 child=spawn(path.join(runtime,modern?'electron.exe':'CornersNative.exe'),[],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>{});
 await ready;
 const command=(action,data={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error('Command timeout '+action)),180000)});socket.write(JSON.stringify({id,action,...data})+'\n');});
 const evaluate=code=>command('evaluate',{code});
 const capture=async name=>{await evaluate('new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(function(){resolve(true);});});})');await command('capture',{path:path.join(dir,engine+'-'+name+'.png')});};
 try{
  await evaluate('document.fonts.ready.then(function(){return true;})');
  await evaluate('galleryPhysics.step(40000)');await wait(1300);await evaluate('galleryPhysics.step(10000)');await wait(500);await evaluate('galleryPhysics.step(10000)');
  await evaluate(`window.qaLaunches=0;window.qaOpened=[];flashbornGallery.open=function(item){qaLaunches++;qaOpened.push(item.projectId);};
  window.qaState=function(){return galleryPhysics.snapshot();};
  window.qaStep=function(ms){galleryPhysics.step(ms);};
  window.qaTile=function(id){return document.querySelector('.block[data-id="'+id+'"]');};
  window.qaClear=function(){dispatchEvent(new WheelEvent('wheel'));document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:1,clientY:1}));qaStep(2000);};
  window.qaHover=function(id){var e=qaTile(id),r=e.getBoundingClientRect();scrollTo(0,Math.max(0,r.top+scrollY-innerHeight*.4));r=e.getBoundingClientRect();var p={x:r.left+r.width/2,y:r.top+r.height/2};e.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:p.x,clientY:p.y}));return p;};
  window.qaCaption=function(id){var e=qaTile(id),r=e.getBoundingClientRect(),m=e.querySelector('.tile-artwork'),im=e.querySelector('img'),c=e.querySelector('.tile-caption'),t=e.querySelector('.tile-title'),d=e.querySelector('.tile-details'),su=e.querySelector('.tile-summary'),b=e.querySelector('.tile-launch'),br=b.getBoundingClientRect(),cr=c.getBoundingClientRect(),sr=su.getBoundingClientRect();return {size:e.dataset.size,width:r.width,height:r.height,caption:cr.height,mask:parseFloat(m.style.bottom),imageHeight:im.getBoundingClientRect().height,imageReady:im.complete&&im.naturalWidth>0,mediaOpacity:+getComputedStyle(m).opacity,title:t.textContent,titleColor:getComputedStyle(t).color,details:getComputedStyle(d).visibility,summaryFits:sr.bottom<=cr.bottom+.1,buttonFits:br.left>=r.left-.1&&br.right<=r.right+.1&&br.top>=cr.top-.1&&br.bottom<=cr.bottom+.1,launchDisabled:b.disabled,launchInk:getComputedStyle(b).color,hidden:c.getAttribute('aria-hidden')};};void 0`);
  let s=await evaluate('qaState()');assert.equal(s.matchIds.length,28);assert.equal(s.deck[0].title,'Square');assert.equal(s.deck[0].year,1999);assert.equal(new Set(s.deck.map(i=>i.title)).size,28);
  const prototype=JSON.parse(fs.readFileSync(path.join(root,'site/flash-gallery/prototype-projects.json'),'utf8'));
  const png=fs.readFileSync(path.join(root,'site/flash-gallery/images/square-99.png')).toString('base64');
  assert.equal(s.deck[0].thumbnail,'data:image/png;base64,'+png);
  assert.equal(s.featuredId,1);
  await evaluate('Array.from(document.querySelectorAll(".index")).find(e=>e.dataset.value==="1999").click();qaStep(3000);document.querySelector("[data-value=all]").click();qaStep(5000)');
  // Idle colors are opaque 50% blends; hover and XLG retain source pixels.
  const tintChecks=[],originalPixel=await evaluate(`new Promise(function(resolve){var im=new Image();im.onload=function(){var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;var ctx=c.getContext('2d');ctx.drawImage(im,0,0);resolve(Array.from(ctx.getImageData(10,10,1,1).data));};im.src=galleryPhysics.snapshot().deck[0].thumbnail;})`);
  for(const [theme,contrast,bg] of [['current','normal',[23,23,23]],['current','high',[0,0,0]],['light','normal',[222,222,222]],['light','high',[255,255,255]]]){
   await evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme)+';document.documentElement.dataset.contrast='+JSON.stringify(contrast)+';qaClear();qaStep(3000)');
   const blend=await evaluate(`new Promise(function(resolve,reject){var end=performance.now()+15000;function check(){var im=qaTile(1).querySelector('img');if(im.complete&&im.naturalWidth&&im.src!==galleryPhysics.snapshot().deck[0].thumbnail){var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;var ctx=c.getContext('2d');ctx.drawImage(im,0,0);resolve({pixel:Array.from(ctx.getImageData(10,10,1,1).data),opacity:getComputedStyle(qaTile(1).querySelector('.tile-artwork')).opacity});return;}if(performance.now()>end)return reject(Error('Opaque tint not ready'));requestAnimationFrame(check);}requestAnimationFrame(check);})`);
   for(let c=0;c<3;c++)assert.ok(Math.abs(blend.pixel[c]-(originalPixel[c]+bg[c])/2)<=1,JSON.stringify({theme,contrast,blend}));assert.equal(blend.pixel[3],255);assert.equal(blend.opacity,'1');
   await evaluate('qaHover(1);qaStep(2200)');assert.equal(await evaluate('qaTile(1).querySelector("img").src'),'data:image/png;base64,'+png);
   tintChecks.push({theme,contrast,opaque:true,pixel:blend.pixel});
  }
  await evaluate('document.documentElement.dataset.theme="current";document.documentElement.dataset.contrast="normal";qaClear();qaStep(3000)');
  assert.ok(s.deck.every(i=>['Firstborn','Freedom + Partners'].includes(i.createdBy)&&i.caption.length>20));
  assert.equal(new Set(s.deck.map(i=>i.thumbnail)).size,28);
  const checks=[];
  for(const width of (process.env.GALLERY_THUMB_QUICK?[1000]:[1800,1400,1200,1000,800,600,390])){
   await command('resize',{width,height:1100});await wait(40);await evaluate('qaClear();qaStep(4000)');
   const layout=await evaluate(`(function(){var search=document.querySelector('#search'),indices=document.querySelector('#indices'),line=document.querySelector('#magnet-line'),marker=document.querySelector('#index-marker'),h=document.querySelector('h1').getBoundingClientRect(),n=document.querySelector('#project-count').getBoundingClientRect(),q=search.getBoundingClientRect(),idx=indices.getBoundingClientRect(),l=line.getBoundingClientRect(),r=marker.getBoundingClientRect(),a=indices.querySelector('[aria-pressed=true]').getBoundingClientRect();return {top:h.top+scrollY,titleRight:h.right,countLeft:n.left,search:q.top,years:idx.top,searchRight:q.right,yearsLeft:idx.left,lineWidth:l.width,markerX:r.left+r.width/2,activeX:a.left+a.width/2,label:getComputedStyle(document.querySelector('#loading-label')).visibility,bodyWidth:document.body.scrollWidth,viewport:innerWidth};})()`);
   assert.ok(Math.abs(layout.top)<.1);assert.ok(layout.countLeft>=layout.titleRight);assert.ok(Math.abs(layout.search-layout.years)<.1);assert.ok(layout.searchRight<layout.yearsLeft);assert.equal(layout.label,'hidden');assert.ok(layout.lineWidth<=layout.viewport);await wait(450);
   const markerError=await evaluate('(function(){var r=document.querySelector("#index-marker").getBoundingClientRect(),a=document.querySelector("#indices").querySelector("[aria-pressed=true]").getBoundingClientRect();return Math.abs(r.left+r.width/2-a.left-a.width/2);})()');assert.ok(markerError<.3,'Marker missed selected year '+markerError);
   for(const id of s.matchIds){const c=await evaluate('qaCaption('+id+')');if(c.size==='normal'){assert.equal(c.caption,0);assert.equal(c.hidden,'true');}assert.ok(c.imageReady);}
   if(width===1400){await evaluate('document.querySelectorAll(".index")[0].click();qaStep(4000);document.querySelector("[data-value=all]").click();qaStep(5000);scrollTo(0,0);qaClear()');await capture('normal');}
   let hovered=0,featured=0;
   for(const id of s.matchIds){
    if((await evaluate('qaState().featuredId'))===id)continue;
    await evaluate('qaClear();qaHover('+id+');qaStep(2200)');
    const hover=await evaluate('qaCaption('+id+')');assert.equal(hover.size,'large',JSON.stringify({id,width,hover,hovered:(await evaluate('qaState().hoveredId'))}));assert.ok(hover.caption>15);assert.ok(Math.abs(hover.caption-hover.mask)<.1);assert.ok(Math.abs(hover.imageHeight-hover.height)<.1,'Image was compressed instead of masked');assert.equal(hover.titleColor,'rgb(128, 128, 128)');assert.equal(hover.details,'hidden');assert.ok(hover.mediaOpacity>.999);
    if(id===1&&width===1400)await capture('hover');
    await evaluate('qaTile('+id+').click();qaStep(3000)');
    const full=await evaluate('qaCaption('+id+')');assert.equal(full.size,'xlg');assert.ok(full.caption>hover.caption);assert.equal(full.details,'visible');assert.ok(Math.abs(full.caption-full.mask)<.1);assert.ok(full.summaryFits,'Description clipped '+JSON.stringify({id,width,full}));assert.ok(full.buttonFits,'Launch clipped '+JSON.stringify({id,width,full}));assert.ok(!full.launchDisabled);assert.equal(full.launchInk,'rgb(255, 255, 255)');
    await evaluate('qaTile('+id+').click();qaStep(16)');assert.equal(await evaluate('qaLaunches'),featured+checks.reduce((n,c)=>n+c.featured,0),'Card click launched a project');
    const expected=s.deck.find(b=>b.id===id).projectId;
    await evaluate('qaTile('+id+').querySelector(".tile-launch").click();true');assert.equal((await evaluate('qaOpened')).at(-1),expected);
    if(id===1&&width===1400)await capture('xlg');
    hovered++;featured++;
   }
   checks.push({width,columns:(await evaluate('qaState()')).columns,hovered,featured});
   console.log('PASS '+engine+' captions '+JSON.stringify(checks.at(-1)));
  }
  // The unmask is driven by continuous height; neither text nor image fades.
  await evaluate('document.querySelectorAll(".index")[0].click();qaStep(4000);qaClear();qaHover(1);');
  let last=0;for(let n=0;n<40;n++){await evaluate('qaStep(8)');const c=await evaluate('qaCaption(1)');assert.ok(c.caption>=last-.001);assert.ok(Math.abs(c.caption-c.mask)<.1);last=c.caption;}
  await evaluate('qaStep(1800);qaTile(1).click();qaStep(3000)');
  for(const [theme,contrast,ink] of [['current','normal','rgb(255, 255, 255)'],['current','high','rgb(255, 255, 255)'],['light','normal','rgb(17, 17, 17)'],['light','high','rgb(17, 17, 17)']]){
   await evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme)+';document.documentElement.dataset.contrast='+JSON.stringify(contrast)+';qaStep(0)');const c=await evaluate('qaCaption(1)');assert.equal(c.launchInk,ink);assert.equal(c.titleColor,ink);assert.ok(c.summaryFits&&c.buttonFits);
  }
  await capture('light');
  const report={passed:true,artifactSHA256:crypto.createHash('sha256').update(original).digest('hex'),projects:28,originalFirstImage:true,uniqueImages:28,checks,tintChecks,compactHeader:true,maskedReveal:true,fourThemes:true,explicitLaunchOnly:true};fs.writeFileSync(path.join(dir,engine+'-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

 }catch(error){fs.writeFileSync(path.join(dir,engine+'-failure.json'),JSON.stringify(await evaluate('(function(){var s=galleryPhysics.snapshot();return {debug:qaRest(),phase:s.phase,looseTop:s.looseTop,floor:s.floorY,size:qaSizes(),bodies:s.bodies.map(function(b){return {id:b.id,target:!!b.target,sleeping:b.sleeping,x:b.x,y:b.y,angle:b.angle,speed:b.speed};})};})()').catch(()=>null),null,2));await command('capture',{path:path.join(dir,engine+'-failure.png')}).catch(()=>{});throw error;}
 finally{await command('exit').catch(()=>{});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{socket?.destroy();server.close();if(child&&!child.killed)child.kill();});




