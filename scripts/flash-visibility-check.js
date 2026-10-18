'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,check,timeout=20000){let value;const end=Date.now()+timeout;do{value=await fn();if(check(value))return value;await wait(70);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(value));}
(async()=>{
  const profile=path.join(output,'flash-visibility-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
  const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  const coverFile=path.join(profile,'cover.cjs');fs.writeFileSync(coverFile,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(profile,'cover-profile'))});app.whenReady().then(async()=>{global.cover=new BrowserWindow({x:620,y:160,width:500,height:540,show:false,webPreferences:{sandbox:true}});await global.cover.loadURL('data:text/html,<title>Flashborn overlap test</title><style>html{background:rgb(44,90,170)}</style><p>Separate application test window</p>');global.cover.setAlwaysOnTop(true);global.cover.show();global.cover.focus();});`);
  let app,cover;const passed=[],pass=message=>{passed.push(message);console.log('PASS '+message);};
  try{
    app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);await app.firstWindow();
    await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1160,height:800});w.show();w.focus();});
    await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),require('./html-fixture')(profile,require('./playback-fixture')));
    const native=(action,args={})=>app.evaluate(({},input)=>global.__flashborn.activeTab().native.call(input.action,input.args),{action,args});
    const script=code=>app.evaluate(({},code)=>global.__flashborn.activeTab().native?.evaluate(code),code);
    await poll(()=>script('Number(document.querySelector("embed")?.GetVariable("ticks"))'),ticks=>ticks>2);
    const pid=await app.evaluate(()=>global.__flashborn.activeTab().native.child.pid);await script('document.querySelector("embed").SetVariable("marker",73)');
    cover=await electron.launch({executablePath:require('electron'),args:[coverFile],env});await cover.firstWindow();
    const coverInfo=await cover.evaluate(()=>({handle:Number(global.cover.getNativeWindowHandle().readBigUInt64LE()),pid:process.pid}));
    await app.evaluate(({},input)=>{const api=process.mainModule.require(input.module).load('user32.dll');global.visibilityAPI={style:api.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t,int)'),next:api.func('intptr_t __stdcall GetWindow(intptr_t,uint32_t)'),fg:api.func('intptr_t __stdcall GetForegroundWindow()'),owner:api.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t,_Out_ uint32_t*)'),allow:api.func('int __stdcall AllowSetForegroundWindow(uint32_t)')};global.coverHandle=input.handle;global.visibilityAPI.allow(input.pid);}, {...coverInfo,module:path.join(root,'node_modules','koffi')});
    await cover.evaluate(()=>global.cover.focus());
    const snapshot=()=>app.evaluate(()=>{const n=global.__flashborn.activeTab().native,a=global.visibilityAPI,pid=[0],fg=a.fg();a.owner(fg,pid);let above=false;for(let h=global.coverHandle,i=0;h&&i<512;i++,h=a.next(h,2))if(h===n.hwnd){above=true;break;}return {foreground:pid[0],shellPID:process.pid,nativePID:n.child.pid,visible:n.inspect().visible,parent:n.inspect().parent,topmost:!!(a.style(n.hwnd,-20)&8),coverAbove:above,next:a.next(n.hwnd,2),host:n.hostHandle(),lastVisible:n.lastVisible};});
    const background=await poll(snapshot,s=>s.foreground!==s.shellPID&&s.foreground!==s.nativePID&&s.visible===1&&!s.topmost&&s.coverAbove&&s.next===s.host);
    const tick=await script('Number(document.querySelector("embed").GetVariable("ticks"))');await poll(()=>script('Number(document.querySelector("embed").GetVariable("ticks"))'),value=>value>tick+3);assert.equal(await script('Number(document.querySelector("embed").GetVariable("marker"))'),73);assert.equal(background.parent,0);assert.equal((await native('test-playback')).visible,true);
    pass('Losing focus keeps the same live Flash movie visible without parenting the legacy window or promoting it above the other application');
    await cover.evaluate(()=>global.cover.setAlwaysOnTop(false));
    await poll(snapshot,s=>s.visible===1&&!s.topmost&&s.coverAbove&&s.next===s.host);
    pass('An ordinary overlapping application remains above Flash while the Flash surface stays directly above its own browser shell');
    const presses=await script('Number(document.querySelector("embed").GetVariable("presses"))');await native('test-mouse',{type:'mouseDown',x:120,y:120,button:'left',clickCount:1});await native('test-mouse',{type:'mouseUp',x:120,y:120,button:'left',clickCount:1});await poll(()=>script('Number(document.querySelector("embed").GetVariable("presses"))'),value=>value===presses+1);
    assert.equal(await app.evaluate(()=>global.__flashborn.activeTab().native.child.pid),pid);
    pass('The real Adobe plugin still accepts mouse input after backgrounding without reloading or losing movie state');
    await app.evaluate(()=>global.__flashborn.win.minimize());await poll(snapshot,s=>s.visible===0&&!s.topmost);await app.evaluate(()=>global.__flashborn.win.restore());await poll(snapshot,s=>s.visible===1);
    assert.equal(await script('Number(document.querySelector("embed").GetVariable("marker"))'),73);
    pass('Minimize still hides Flash; restoring brings back the same live movie even without foreground focus');
    fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-flash-visibility-results.json':'flash-visibility-results.json'),JSON.stringify({passed,background,completedAt:new Date().toISOString()},null,2));
  }finally{if(cover)await cover.close();if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
