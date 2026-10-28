'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check){const until=Date.now()+25000;let value;do{value=await read();if(check(value))return value;await wait(40);}while(Date.now()<until);throw Error(JSON.stringify(value));}
(async()=>{
 const profile=path.join(out,'sidebar-flash-edge-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
 const k=require('koffi'),u=k.load('user32.dll'),g=k.load('gdi32.dll');
 u.func('int __stdcall SetProcessDpiAwarenessContext(intptr_t)')(-4);
 const rect=u.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'),at=u.func('intptr_t __stdcall WindowFromPoint(uint64_t)'),ancestor=u.func('intptr_t __stdcall GetAncestor(intptr_t,uint32_t)'),hit=u.func('intptr_t __stdcall SendMessageW(intptr_t,uint32_t,intptr_t,intptr_t)');
 const dc=u.func('intptr_t __stdcall GetDC(intptr_t)'),release=u.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'),pixel=g.func('uint32_t __stdcall GetPixel(intptr_t,int,int)');
 let timer,phase='initial';const frames=[],context=dc(0);
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);
  await app.evaluate(async({BrowserWindow})=>{const backdrop=global.__edgeBackdrop=new BrowserWindow({x:60,y:60,width:2000,height:1200,frame:false,hasShadow:false,show:false,backgroundColor:'#134961'});await backdrop.loadURL('data:text/html,<style>html{background:rgb(19,73,97)}</style>');backdrop.showInactive();const w=global.__flashborn.win;w.setBounds({x:100,y:90,width:1250,height:900});w.show();w.focus();});
  const ui=await app.firstWindow();
  for(const theme of ['current','light']){
   if(await app.evaluate(()=>global.__flashborn.getState().settings.theme)!==theme)await app.evaluate(()=>global.__flashborn.command('theme',{}));
   for(const privateMode of [false,true]){
    await app.evaluate(({},privateMode)=>global.__flashborn.command(privateMode?'new-flashcognito':'new-tab',{}),privateMode);
    const button=ui.locator('.search-submit'),arrow=button.locator('.icon');await button.waitFor();
    const circle=await button.evaluate(el=>({radius:getComputedStyle(el).borderRadius,width:el.offsetWidth,height:el.offsetHeight}));assert.equal(circle.radius,'50%');assert.equal(circle.width,circle.height);
    await button.hover();await wait(40);const during=await arrow.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m12);assert.ok(during>0&&during<1);
    await wait(210);assert.ok(Math.abs(await arrow.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m12)-1)<.001);
    await ui.locator('.title-note').hover();await wait(240);assert.equal(await arrow.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m12),0);
   }
  }
  await app.evaluate(()=>global.__flashborn.command('new-tab',{}));console.log('PASS Round Go buttons and reversible clockwise arrow animation on ordinary/private new tabs in both themes');
  const host=await app.evaluate(()=>Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE()));
  const shadow=await app.evaluate(()=>({hasShadow:global.__flashborn.win.hasShadow(),framePolicy:global.__flashborn.windowMotion.api.framePolicy}));assert.equal(shadow.hasShadow,false);assert.equal(shadow.framePolicy,0);
  const sampleEdge=()=>{const r=[0,0,0,0];rect(host,r);const x=r[2]-1,y=Math.floor((r[1]+r[3])/2),target=ancestor(at(BigInt(y)*0x100000000n+BigInt(x)),2);return {target,hit:Number(hit(target,0x84,0,(y<<16)|(x&65535)))};};
  const ordinaryEdge=sampleEdge();
  await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),require('./html-fixture')(path.join(profile,'movie'),require('./playback-fixture')));
  const movie=await poll(()=>app.evaluate(()=>{const n=global.__flashborn.activeTab().native;return n?.isPresented()?n.hwnd:null;}),Boolean);
  await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))').catch(()=>0)),ticks=>ticks>3);
  const flashEdge=sampleEdge();
  timer=setInterval(()=>{const h=[0,0,0,0],m=[0,0,0,0],after=[0,0,0,0],sample=[];rect(host,h);rect(movie,m);const y=Math.floor((h[1]+h[3])/2);for(const inset of [1,3,6,12,-2,-5]){const x=h[2]-inset,p=pixel(context,x,y),target=ancestor(at(BigInt(y)*0x100000000n+BigInt(x)),2);sample.push({phase,inset,host:h,movie:m,target,hostHandle:host,movieHandle:movie,rgb:[p&255,p>>>8&255,p>>>16&255]});}rect(host,after);if(h.every((value,i)=>value===after[i]))frames.push(...sample);},1);
  for(const theme of ['current','light']){
   if(await app.evaluate(()=>global.__flashborn.getState().settings.theme)!==theme)await app.evaluate(()=>global.__flashborn.command('theme',{}));
   for(let i=0;i<6;i++){phase=theme+'-toggle-'+i;await app.evaluate(()=>global.__flashborn.command('collapse',{}));await wait(330);}
   for(let i=0;i<5;i++){phase=theme+'-interrupted-'+i;await app.evaluate(()=>global.__flashborn.command('collapse',{}));await wait(55);}await wait(400);
   for(const width of [1100,1250]){
    phase=theme+'-resize-'+width;const r=[0,0,0,0];rect(host,r);const sizing=Buffer.alloc(16);r.forEach((value,i)=>sizing.writeInt32LE(value,i*4));
    hit(host,0x231,0,0);hit(host,0x214,2,k.address(sizing));
    await app.evaluate(({},width)=>global.__flashborn.win.setSize(width,900),width);await wait(100);hit(host,0x232,0,0);await wait(330);
    const edge=sampleEdge();assert.equal(edge.target,host);assert.equal(edge.hit,11);
   }
  }
  clearInterval(timer);timer=null;
  const overshoot=frames.filter(f=>f.movie[2]>f.host[2]),badPixels=frames.filter(f=>f.rgb.some((value,i)=>Math.abs(value-(f.inset>0?[30,32,37]:[19,73,97])[i])>2));
  const report={profile,shadow,ordinaryEdge,flashEdge,frames:frames.length,overshoot:overshoot.length,badPixels:badPixels.length,firstOvershoot:overshoot.slice(0,8),firstBad:badPixels.slice(0,8)};
  fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-sidebar-flash-edge-results.json':'sidebar-flash-edge-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(process.env.FLASHBORN_DIAGNOSE!=='1'){assert.equal(overshoot.length,0,'Flash must never extend beyond the browser right edge');assert.equal(badPixels.length,0,'Sidebar motion must preserve pixels at the fixed Flash right edge');assert.equal(flashEdge.target,host);assert.equal(flashEdge.hit,ordinaryEdge.hit);assert.equal(flashEdge.hit,11,'Right edge must resize the browser');}
 }finally{clearInterval(timer);release(0,context);await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
