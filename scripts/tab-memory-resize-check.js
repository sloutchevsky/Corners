'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check){let value;const until=Date.now()+25000;do{value=await read();if(check(value))return value;await wait(50);}while(Date.now()<until);throw Error(JSON.stringify(value));}
(async()=>{
 const profile=path.join(out,'tab-memory-resize-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app,ui;const samples=[],passed=[];
 const launch=async()=>{app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1250,height:900});w.show();w.focus();});};
 const command=(action,args={})=>app.evaluate(({},v)=>global.__flashborn.command(v.action,v.args),{action,args});
 const state=()=>app.evaluate(()=>global.__flashborn.getState());
 const pass=s=>{passed.push(s);console.log('PASS '+s);};
 const fixture=require('./html-fixture')(path.join(profile,'movie'),require('./playback-fixture'));
 try{
  await launch();await command('panel',{name:'settings'});await ui.locator('#tab-limit').waitFor();
  assert.equal(await ui.locator('#autoCloseTabs').isChecked(),true);assert.equal(await ui.locator('#tab-limit').inputValue(),'50');
  assert.equal(await ui.locator('#tab-limit').getAttribute('min'),'20');assert.equal(await ui.locator('#tab-limit').getAttribute('max'),'100');
  for(const theme of ['current','light']){if((await state()).settings.theme!==theme)await command('theme');assert.equal(await ui.locator('.sidebar-bottom').evaluate(el=>getComputedStyle(el,'::before').height),'72px');}
  await ui.locator('#autoCloseTabs').uncheck();await poll(state,s=>!s.settings.autoCloseTabs);assert.equal(await ui.locator('#tab-limit').isDisabled(),true);
  await command('new-tab');await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),fixture);
  await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native?.isPresented()),Boolean);
  const flashId=(await state()).activeId;
  await app.evaluate(async()=>{for(let i=0;i<21;i++){await global.__flashborn.command('new-tab',{});await new Promise(r=>setTimeout(r,20));}});
  await app.evaluate(({},id)=>{const f=global.__flashborn;global.memoryTab=f.tabs.find(t=>t.id===id);global.memoryNative=global.memoryTab.native;global.memoryNative.state.audible=true;return f.command('settings',{autoCloseTabs:true,tabLimit:20});},flashId);
  assert.equal((await state()).tabs.length,20);assert.ok((await state()).tabs.some(t=>t.id===flashId));
  await wait(100);
  await app.evaluate(()=>{global.memoryNative.state.audible=false;return global.__flashborn.command('new-tab',{});});
  assert.equal((await state()).tabs.length,20);assert.ok(!(await state()).tabs.some(t=>t.id===flashId));assert.equal(await app.evaluate(()=>global.memoryNative.disposed),true);
  await app.evaluate(()=>global.__flashborn.win.focus());await ui.locator('#address').click();
  // CDP key dispatch bypasses Electron's before-input-event; use its native input path.
  await app.evaluate(()=>{const wc=global.__flashborn.win.webContents;for(const type of ['keyDown','keyUp'])wc.sendInputEvent({type,keyCode:'T',modifiers:['control','shift']});});
  await poll(()=>app.evaluate(()=>{const t=global.__flashborn.activeTab();return {id:t.id,kind:t.kind,error:t.error,native:!!t.native,presented:t.native?.isPresented(),restoring:!!t.restoring};}),v=>v.presented);
  const reopened=await state();assert.equal(reopened.tabs.length,20);assert.equal(reopened.tabs.find(t=>t.id===reopened.activeId).kind,'local');
  await poll(()=>app.evaluate(()=>global.memoryNative.child.exitCode!==null || global.memoryNative.child.signalCode!==null),Boolean);
  pass('Default/range/toggle and 72px gradient work; bottom eviction keeps audible/current tabs, disposes Flash and permits reopening it');
  const k=require('koffi'),u=k.load('user32.dll'),g=k.load('gdi32.dll');u.func('int __stdcall SetProcessDpiAwarenessContext(intptr_t)')(-4);
  const dc=u.func('intptr_t __stdcall GetDC(intptr_t)'),release=u.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'),origin=u.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)');
  const compatible=g.func('intptr_t __stdcall CreateCompatibleDC(intptr_t)'),bitmap=g.func('intptr_t __stdcall CreateCompatibleBitmap(intptr_t,int,int)'),select=g.func('intptr_t __stdcall SelectObject(intptr_t,intptr_t)'),blit=g.func('int __stdcall BitBlt(intptr_t,int,int,int,int,intptr_t,int,int,uint32_t)'),bits=g.func('int __stdcall GetDIBits(intptr_t,intptr_t,uint32_t,uint32_t,_Out_ void*,_Inout_ void*,uint32_t)'),remove=g.func('int __stdcall DeleteObject(intptr_t)'),removeDC=g.func('int __stdcall DeleteDC(intptr_t)');
  const measure=async label=>{
   console.log('Measuring Flash square: '+label);
   const value=await app.evaluate(({screen})=>{const f=global.__flashborn;return {host:Number(f.win.getNativeWindowHandle().readBigUInt64LE()),viewport:f.activeTab().native.viewport,scale:screen.getDisplayMatching(f.win.getBounds()).scaleFactor,pid:f.activeTab().native.child.pid};});
   const p=[0,0];origin(value.host,p);const r=value.viewport,s=value.scale,left=p[0]+Math.round(r.x*s),top=p[1]+Math.round(r.y*s),width=Math.round(r.width*s),height=Math.round(r.height*s),context=dc(0);
   const memory=compatible(context),image=bitmap(context,width,height),old=select(memory,image),pixels=Buffer.alloc(width*height*4),info=Buffer.alloc(40);
   info.writeUInt32LE(40,0);info.writeInt32LE(width,4);info.writeInt32LE(-height,8);info.writeUInt16LE(1,12);info.writeUInt16LE(32,14);
   assert.ok(blit(memory,0,0,width,height,context,left,top,0x40cc0020));select(memory,old);assert.equal(bits(memory,image,0,height,pixels,info,0),height);
   const cream=(x,y)=>{const index=((y-top)*width+x-left)*4;return Math.abs(pixels[index]-186)<3 && Math.abs(pixels[index+1]-214)<3 && Math.abs(pixels[index+2]-233)<3;};
   try{
    const points=[];for(let y=top+12;y<top+height-12;y+=24)for(let x=left+12;x<left+width-12;x+=24)if(cream(x,y))points.push([x,y]);
    assert.ok(points.length>4,'Real Flash square must remain visible: '+label);
    const cx=Math.round((Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2),cy=Math.round((Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2);
    let l=cx,rr=cx,t=cy,b=cy;while(l>left&&cream(l-1,cy))l--;while(rr<left+width&&cream(rr+1,cy))rr++;while(t>top&&cream(cx,t-1))t--;while(b<top+height&&cream(cx,b+1))b++;
    const shape={label,width:rr-l+1,height:b-t+1,pid:value.pid};samples.push(shape);assert.ok(Math.abs(shape.width-shape.height)<=3,JSON.stringify(shape));return value.pid;
   }finally{remove(image);removeDC(memory);release(0,context);}
  };
  await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))').catch(()=>0)),n=>n>3);
  const pid=await measure('live');await app.evaluate(()=>{const m=global.__flashborn.windowMotion;m.begin('resize');clearTimeout(m.timer);});await wait(100);
  for(const size of [[850,950],[1450,600],[1100,850]]){await app.evaluate(({},s)=>global.__flashborn.win.setSize(...s),size);await wait(150);assert.equal(await measure(size.join('x')),pid);}
  await app.evaluate(()=>global.__flashborn.windowMotion.settle(0));await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native.isPresented()&&!global.__flashborn.windowMotion.active),Boolean);
  pass('Real Flash square stays square in wide/tall resize previews, retains its process, and returns to live input');
  await command('settings',{autoCloseTabs:false,tabLimit:100});await app.evaluate(async()=>{while(global.__flashborn.tabs.length<100){await global.__flashborn.command('new-tab',{});await new Promise(r=>setTimeout(r,20));}});
  assert.equal((await state()).tabs.length,100);
  await app.close();app=null;await launch();assert.equal((await state()).tabs.length,100);assert.equal((await state()).settings.tabLimit,100);assert.equal((await state()).settings.autoCloseTabs,false);
  await command('settings',{autoCloseTabs:true,tabLimit:20});assert.equal((await state()).tabs.length,20);
  await command('panel',{name:'settings'});await ui.locator('#tab-limit').waitFor();assert.equal(await ui.locator('#tab-limit').inputValue(),'20');
  await ui.locator('#tab-limit').focus();await ui.keyboard.press('End');await poll(state,s=>s.settings.tabLimit===100);assert.equal(await ui.locator('#tab-limit-value').innerText(),'100 tabs');
  await ui.screenshot({path:path.join(out,'tab-memory-settings.png')});pass('Disabled auto-close permits 100 tabs, all 100 survive restart, lowering the limit trims immediately, and the slider saves keyboard changes');
  fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-tab-memory-resize-results.json':'tab-memory-resize-results.json'),JSON.stringify({passed,samples,profile},null,2));
 }finally{if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
