'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=35000){let v;const end=Date.now()+timeout;do{try{v=await read();if(check(v))return v;}catch{}await wait(80);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 const html=fs.readFileSync(process.env.GALLERY_TEST_HTML||path.join(root,'site/flash-gallery/flash.gallery.html')),server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(req.url.startsWith('/flash.gallery.html')?html:'<!doctype html><title>Gallery launch fixture</title><h1>Project launched</h1>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const manifest=process.env.GALLERY_TEST_MANIFEST||path.join(process.env.APPDATA,'flashborn-browser','Flash Library','manifest.json');
 const original=JSON.parse(fs.readFileSync(manifest,'utf8')).items.filter(item=>item.kind==='html'&&!/\.swf(?:[?#]|$)/i.test(item.path||item.url||''));
 const profile=path.join(output,'gallery-anchor-launch-'+Date.now());fs.mkdirSync(path.join(profile,'Flash Library'),{recursive:true});
 fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({libraryPageOnboarded:true,settings:{theme:'current',adBlockEnabled:false,restoreTabs:false}}));
 fs.writeFileSync(path.join(profile,'Flash Library','manifest.json'),JSON.stringify({version:1,items:original}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:base+'/flash.gallery.html'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:require('electron'),args:[root],env});
 const command=(action,args={})=>app.evaluate(({},d)=>global.__flashborn.command(d.action,d.args),{action,args});
 const evaluate=code=>app.evaluate(({},code)=>global.__flashborn.activeContent().native.evaluate(code),code);
 const state=()=>app.evaluate(()=>global.__flashborn.getState());
 const mouse=(type,x,y)=>app.evaluate(({},args)=>global.__flashborn.activeContent().native.call('test-mouse',args),{type,x,y,button:type==='mouseMove'?'none':'left',clickCount:type==='mouseMove'?0:1});
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow();
  await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:70,y:70,width:1400,height:1080});w.show();w.focus();});
  await command('panel',{name:'library'});await poll(()=>evaluate('typeof galleryPhysics'),v=>v==='object');
  await poll(()=>evaluate('galleryPhysics.snapshot().introPhase'),v=>v==='complete');
  let s=JSON.parse(await evaluate('JSON.stringify(galleryPhysics.snapshot())'));
  assert.equal(s.count,original.length);assert.equal(s.loadedCount,original.length);
  assert.deepEqual(s.deck.map(item=>item.projectId),original.map(item=>item.id));
  assert.ok(s.deck.every((item,i)=>item.title===original[i].title&&item.path===(original[i].path||'')&&item.url===(original[i].url||'')));
  const counter=s.loadedCount;
  for(const theme of ['light','current','light','current']){
   await command('settings',{darkTheme:theme!=='light',highContrast:false});
   await poll(()=>evaluate('document.documentElement.dataset.theme'),v=>v===theme);
   assert.equal(await evaluate('galleryPhysics.snapshot().loadedCount'),counter);
  }
  await evaluate('document.querySelector("[data-value=all]").click()');
  await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.docked;}).length'),v=>v===original.length);
  await evaluate(`window.qaMotionEvent=null;window.qaMotionLast=null;window.qaMotionCount=0;
   addEventListener('pointermove',function(e){var b=e.target.closest('.block[data-interactive=true]'),moved=!qaMotionLast||qaMotionLast.x!==e.clientX||qaMotionLast.y!==e.clientY;if(moved)qaMotionEvent={x:e.clientX,y:e.clientY,id:b?+b.dataset.id:null,moved:true};qaMotionLast={x:e.clientX,y:e.clientY};qaMotionCount++;},true);
   window.qaVisible=function(id){var e=document.querySelector('.block[data-id="'+id+'"]'),r=e.getBoundingClientRect();for(var fy of [.5,.2,.8])for(var fx of [.5,.2,.8]){var p={x:r.left+r.width*fx,y:r.top+r.height*fy};if(p.y<0||p.y>innerHeight||p.x<0||p.x>innerWidth)continue;var hit=document.elementFromPoint(p.x,p.y),tile=hit&&hit.closest('.block');if(tile&&+tile.dataset.id===id)return p;}return null;};
   window.qaVerifyMotion=function(){var e=qaMotionEvent;if(!e||e.id===null||!e.moved)return true;var s=galleryPhysics.snapshot(),hit=document.elementFromPoint(e.x,e.y),tile=hit&&hit.closest('.block');if(s.hoveredId!==e.id||!tile||+tile.dataset.id!==e.id)throw Error('Real moving hover lost: '+JSON.stringify({event:e,owner:s.hoveredId,hit:tile&&tile.dataset.id}));return true;};true`);
  const motionIds=JSON.parse(await evaluate('JSON.stringify(galleryPhysics.snapshot().matchIds)'));
  let motionPaths=0;
  for(const id of motionIds){
   await evaluate('(function(){var e=document.querySelector(".block[data-id=\\"'+id+'\\"]"),r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight){dispatchEvent(new WheelEvent("wheel"));scrollBy(0,r.top+r.height/2-innerHeight/2);}return true;})()');
   const source=await poll(()=>evaluate('JSON.stringify(qaVisible('+id+'))'),p=>p&&JSON.parse(p));
   const start=JSON.parse(source);await mouse('mouseMove',start.x,start.y);await wait(16);await evaluate('qaVerifyMotion()');
   const destination=JSON.parse(await evaluate('(function(){var ids=galleryPhysics.snapshot().matchIds,p='+JSON.stringify(start)+';return JSON.stringify(ids.filter(function(id){return id!=='+id+';}).map(function(id){return qaVisible(id);}).filter(Boolean).sort(function(a,b){return Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y);})[0]||null);})()'));
   if(!destination)continue;
   for(const [from,to] of [[start,destination],[destination,start]])for(let k=1;k<=8;k++){
    await mouse('mouseMove',from.x+(to.x-from.x)*k/8,from.y+(to.y-from.y)*k/8);
    await evaluate('qaVerifyMotion()');await wait(k%3===0?16:4);await evaluate('qaVerifyMotion()');motionPaths++;
   }
  }
  await evaluate('dispatchEvent(new WheelEvent("wheel"));true');
  await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.docked;}).length'),v=>v===original.length);
  await app.evaluate(()=>global.__flashborn.win.setBounds({width:1060,height:1080}));await wait(700);
  await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.docked;}).length'),v=>v===original.length);
  await evaluate('scrollTo(0,0);true');
  const preview=JSON.parse(await evaluate('(function(){var id=galleryPhysics.snapshot().matchIds[1],e=document.querySelector(".block[data-id=\\""+id+"\\"]"),r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()'));
  await mouse('mouseMove',preview.x,preview.y);await wait(900);await evaluate('qaVerifyMotion()');
  fs.writeFileSync(path.join(output,'gallery-native-middle-preview.png'),Buffer.from(await app.evaluate(()=>global.__flashborn.activeContent().native.screenshot()),'base64'));
  await evaluate('dispatchEvent(new WheelEvent("wheel"));true');await app.evaluate(()=>global.__flashborn.win.setBounds({width:1400,height:1080}));await wait(700);
  await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.docked;}).length'),v=>v===original.length);
  // Capture all real project IDs without launching 28 heavyweight sites.
  await evaluate('window.qaLaunches=[];window.qaPost=window.postMessage;window.postMessage=function(data,origin){if(data&&data.type==="flashborn-library-request"&&data.action==="open"){qaLaunches.push(data.args.id);return;}return qaPost.call(window,data,origin);};true');
  s=JSON.parse(await evaluate('JSON.stringify(galleryPhysics.snapshot())'));
  for(const id of s.matchIds){
   const point=JSON.parse(await evaluate('(function(){var e=document.querySelector(".block[data-id=\\"'+id+'\\"]"),r=e.getBoundingClientRect();scrollBy(0,r.top+r.height/2-innerHeight/2);r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()'));
   await mouse('mouseMove',point.x,point.y);await wait(250);
   const hit=await evaluate('(function(){var e=document.elementFromPoint('+point.x+','+point.y+');return e&&e.closest(".block")&&+e.closest(".block").dataset.id;})()');assert.equal(hit,id);
   await mouse('mouseDown',point.x,point.y);await mouse('mouseUp',point.x,point.y);
   await poll(()=>evaluate('qaLaunches.length'),v=>v===s.matchIds.indexOf(id)+1);
  }
  const opened=await evaluate('JSON.stringify(qaLaunches)');assert.deepEqual(JSON.parse(opened),s.matchIds.map(id=>s.deck.find(item=>item.id===id).projectId));
  // The native bridge must route both URL and local HTML launches correctly.
  const web=original.find(item=>item.url),local=original.find(item=>item.path),fixture=path.join(profile,'project.html');
  fs.writeFileSync(fixture,'<!doctype html><title>Local launch fixture</title><h1>Local project launched</h1>');
  for(const [entry,source] of [[web,base+'/project'],[local,fixture]]){
   await command('library-update',{...entry,source});
   await evaluate('window.postMessage=qaPost;flashbornGallery.open({projectId:'+JSON.stringify(entry.id)+'});true');
   const openedState=await poll(state,s=>s.panel===null&&s.tabs.some(t=>source===fixture?t.url.startsWith('file:')&&t.url.endsWith('/project.html'):t.url===source));
   const tab=openedState.tabs.find(t=>source===fixture?t.url.startsWith('file:')&&t.url.endsWith('/project.html'):t.url===source);
   assert.ok(tab);await command('close-tab',{id:tab.id});await command('panel',{name:'library'});
  }
  fs.writeFileSync(path.join(output,process.env.GALLERY_TEST_HTML?'gallery-anchor-regression-results.json':'gallery-anchor-launch-results.json'),JSON.stringify({passed:true,artifactSHA256:require('node:crypto').createHash('sha256').update(html).digest('hex'),savedProjectCount:original.length,realPointerClicks:original.length,realMovingPointerSteps:motionPaths,themeSwitches:4,nativeWebLaunch:true,nativeLocalLaunch:true},null,2));
  console.log('PASS: All '+original.length+' saved Gallery projects load and receive real pointer clicks; themes and native web/local launches work.');
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
