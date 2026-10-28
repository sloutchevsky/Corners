 'use strict';
const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/clear-frame'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check){let value;for(let i=0;i<100;i++){value=await read();if(check(value))return value;await wait(15);}throw Error('Timeout '+JSON.stringify(value));}
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'Corners-motion-check-'));fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{restoreTabs:false,adBlockEnabled:false}}));const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:require('electron'),args:[root],env});const checks=[];
 try{
  await app.firstWindow();await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);
  await app.evaluate(({},module)=>{const f=global.__flashborn;f.win.setBounds({x:80,y:80,width:1000,height:740});f.win.show();const edge=process.mainModule.require(module);global.__cornerQa={corner:false,topLeftCorner:false};global.__cornerHoveredBefore=edge.hoveredView;edge.hoveredView=(window,rect)=>{if(window===f.win){for(const key of ['corner','topLeftCorner'])if(f[key].rect===rect)return __cornerQa[key];}return __cornerHoveredBefore(window,rect);};},path.join(root,'src/window-edge.js'));
  await poll(()=>app.evaluate(()=>global.__flashborn.corner.ready&&global.__flashborn.topLeftCorner.ready),Boolean);
  const read=key=>app.evaluate(async({},key)=>{const c=global.__flashborn[key];return {rect:{...c.rect},...await c.view.webContents.executeJavaScript('(()=>{const s=getComputedStyle(document.body,"::after"),m=new DOMMatrix(s.transform);return {x:m.m41,y:m.m42,opacity:s.opacity,color:s.borderColor,stroke:15,reduced:matchMedia("(prefers-reduced-motion:reduce)").matches,hover:document.documentElement.dataset.hover,resizing:document.documentElement.dataset.resizing}})()')};},key);
  const hover=(key,value)=>app.evaluate(({},v)=>{__cornerQa[v.key]=v.value;global.__flashborn[v.key].setHover(v.value);},{key,value});
  const frames=async(key,ms=250)=>{const poses=[],end=Date.now()+ms;do{poses.push(await read(key));await wait(12);}while(Date.now()<end);return poses;};
  const checkSeam=async(key,sign,darkTheme)=>{
   const samples=[];
   for(const offset of [0,2,5,8,10]){
    await app.evaluate(async({},v)=>{const wc=global.__flashborn[v.key].view.webContents;await wc.executeJavaScript('(()=>{let s=document.getElementById("corner-paint-qa");if(!s){s=document.createElement("style");s.id="corner-paint-qa";document.head.append(s);}s.textContent='+JSON.stringify('body::after{transition:none!important;transform:translate('+v.distance+'px,'+v.distance+'px)!important}')+';})()');},{key,distance:sign*offset});
    await wait(25);
    const paint=await app.evaluate(async({},key)=>{const image=await global.__flashborn[key].view.webContents.capturePage(),size=image.getSize(),pixels=image.toBitmap();return {size,points:[[14,26],[26,14],[20,20]].map(([x,y])=>{const at=(Math.floor(y/40*size.height)*size.width+Math.floor(x/40*size.width))*4;return Array.from(pixels.subarray(at,at+4));})};},key);
    for(const pixel of paint.points.slice(0,2)){assert.ok(pixel[3]>=250,'Gap opened at the browser edge: '+JSON.stringify({key,offset,paint}));for(const channel of pixel.slice(0,3))assert.ok(Math.abs(channel-(darkTheme?255:0))<=1,'Corner seam changed color');}
    assert.ok(paint.points[2][3]<=1,'Corner paint overlapped the browser interior');samples.push({offset,seamOpaque:true,interiorClear:true});
   }
   await app.evaluate(async({},key)=>global.__flashborn[key].view.webContents.executeJavaScript('document.getElementById("corner-paint-qa").remove()'),key);await wait(220);return samples;
  };
  const verify=(poses,rect,sign)=>{for(const p of poses){assert.deepEqual(p.rect,rect,'Animation changed the hit target');assert.equal(p.opacity,'1');assert.ok(Math.abs(p.x-p.y)<.001,'Motion is not diagonal');assert.ok(sign*p.x>=-.01&&sign*p.x<=10.01,'Corner overshot its track');}};
  for(const [darkTheme,highContrast]of [[true,true],[true,false],[false,true],[false,false]]){
   await app.evaluate(({},settings)=>global.__flashborn.command('settings',settings),{darkTheme,highContrast});await wait(220);
   for(const key of ['topLeftCorner','corner']){
    const sign=key==='topLeftCorner'?1:-1;await hover(key,false);await wait(220);const idle=await read(key),rect=idle.rect;assert.ok(Math.abs(idle.x-sign*10)<.01&&Math.abs(idle.y-sign*10)<.01);assert.equal(idle.color,darkTheme?'rgb(255, 255, 255)':'rgb(0, 0, 0)');assert.equal(15-Math.abs(idle.x),5);
    await hover(key,true);const entering=await frames(key);verify(entering,rect,sign);assert.ok(Math.abs(entering.at(-1).x)<.01);if(!idle.reduced)assert.ok(entering.some(p=>Math.abs(p.x)>.05&&Math.abs(p.x)<9.95),'Hover jumped instead of animating');
    await app.evaluate(({},key)=>{const f=global.__flashborn,c=f[key],b=f.win.getBounds();c.begin({x:b.x+c.rect.x+20,y:b.y+c.rect.y+20});},key);
    await poll(()=>read(key),p=>p.resizing==='true');await hover(key,false);const held=await frames(key,90);verify(held,rect,sign);assert.ok(held.every(p=>Math.abs(p.x)<.01),'Drag retracted on pointer leave');
    await app.evaluate(({},key)=>global.__flashborn[key].finish(),key);const exiting=await frames(key);verify(exiting,rect,sign);assert.ok(Math.abs(exiting.at(-1).x-sign*10)<.01);if(!idle.reduced)assert.ok(exiting.some(p=>Math.abs(p.x)>.05&&Math.abs(p.x)<9.95),'Hover-out jumped instead of animating');
    // Press before the hover animation completes: dragging must latch fully open.
    await hover(key,true);await wait(45);await app.evaluate(({},key)=>{const f=global.__flashborn,c=f[key],b=f.win.getBounds();c.begin({x:b.x+c.rect.x+20,y:b.y+c.rect.y+20});},key);await poll(()=>read(key),p=>p.resizing==='true');assert.ok(Math.abs((await read(key)).x)<.01);
    await app.evaluate(({},key)=>global.__flashborn[key].finish(),key);const releasedInside=await frames(key,90);assert.ok(releasedInside.every(p=>Math.abs(p.x)<.01),'Mouse-up inside briefly retracted the corner');
    await hover(key,false);await wait(45);await hover(key,true);const reversed=await frames(key);verify(reversed,rect,sign);assert.ok(Math.abs(reversed.at(-1).x)<.01);await hover(key,false);await wait(220);
    const seamSamples=await checkSeam(key,sign,darkTheme);
    checks.push({seamSamples,theme:darkTheme?'dark':'light',highContrast,edge:key,restingStroke:5,hoverStroke:15,opaque:true,fixedHitTarget:rect,smoothInOut:!idle.reduced,dragHeld:true,releaseInsideStable:true,rapidReversalStable:true,enterSamples:entering.length,exitSamples:exiting.length});
    fs.writeFileSync(path.join(out,'corner-motion-results.json'),JSON.stringify({passed:true,checks},null,2));console.log('PASS '+key+' '+(darkTheme?'dark':'light')+' contrast='+highContrast);
   }
  }
 }finally{await app.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
