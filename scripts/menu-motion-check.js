'use strict';
const { _electron:electron } = require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,check,timeout=20000) {
  const until=Date.now()+timeout;let value;
  do {value=await read();if(check(value))return value;await wait(20);}while(Date.now()<until);
  throw Error(JSON.stringify(value));
}
(async()=>{
  const profile=path.join(out,'menu-motion-'+Date.now());fs.mkdirSync(profile,{recursive:true});
  fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
  const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
  if(process.env.FLASHBORN_MENU_TRACE){app.process().stderr.on('data',bytes=>process.stdout.write(bytes));app.process().on('exit',(code,signal)=>console.log('MENU_TEST_EXIT',code,signal));}
  const passed=[],samples=[],pass=text=>{passed.push(text);console.log('PASS '+text);};
  const command=(action,args={})=>app.evaluate(({},value)=>global.__flashborn.command(value.action,value.args),{action,args});
  const fullyOpen=()=>poll(()=>app.evaluate(()=>global.__flashborn.menuMotion?.progress),value=>value===1);
  const closed=()=>poll(()=>app.evaluate(()=>!global.__flashborn.menuWindow),Boolean);
  const mover=require('koffi').load('user32.dll'),moveRect=mover.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'),moveWindow=mover.func('int __stdcall SetWindowPos(intptr_t,intptr_t,int,int,int,int,uint32_t)'),moveMessage=mover.func('intptr_t __stdcall SendMessageW(intptr_t,uint32_t,intptr_t,intptr_t)');
  const sibling=mover.func('intptr_t __stdcall GetWindow(intptr_t,uint32_t)');
  const above=(window,target)=>{for(let next=sibling(window,3),count=0;next && count<1000;next=sibling(next,3),count++)if(next===target)return true;return false;};
  try {
    await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow();
    await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1250,height:900});w.show();w.focus();});
    await app.evaluate(({},module)=>{
      const k=process.mainModule.require(module),u=k.load('user32.dll'),g=k.load('gdi32.dll');
      const rect=u.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'),origin=u.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)'),client=u.func('int __stdcall GetClientRect(intptr_t,_Out_ int32_t*)');
      const foreground=u.func('intptr_t __stdcall GetForegroundWindow()'),owner=u.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t,_Out_ uint32_t*)');
      const dc=u.func('intptr_t __stdcall GetDC(intptr_t)'),release=u.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'),pixel=g.func('uint32_t __stdcall GetPixel(intptr_t,int,int)');
      global.__flashSurfacePixel=()=>{
        const n=global.__flashborn.activeTab().native;if(!n)return null;
        const r=n.inspect().rect,c=dc(0),value=pixel(c,r[0]+30,r[3]-60);release(0,c);
        return [value&255,value>>>8&255,value>>>16&255];
      };
      global.__menuSample=()=>{
        const f=global.__flashborn,popup=f.menuWindow;if(!popup || !f.menuMotion)return null;
        const h=Number(f.win.getNativeWindowHandle().readBigUInt64LE()),m=Number(popup.getNativeWindowHandle().readBigUInt64LE()),p=[0,0],area=[0,0,0,0],r=[0,0,0,0];
        origin(h,p);client(h,area);rect(m,r);
        const scale=process.mainModule.require('electron').screen.getDisplayMatching(f.win.getBounds()).scaleFactor,top=p[1]+Math.round(100*scale),c=dc(0);
        const read=(x,y)=>{const value=pixel(c,x,y);return [value&255,value>>>8&255,value>>>16&255];};
        const pixels=process.env.FLASHBORN_MENU_NO_PIXELS ? {} : {frame:read(r[0]+10,top-20),below:read(r[0]+10,r[3]+10),inside:r[3]>top+12?read(r[0]+10,top+10):null};release(0,c);
        const pid=[0];owner(foreground(),pid);
        return {progress:f.menuMotion.progress,target:f.menuMotion.target,ownForeground:pid[0]===process.pid||pid[0]===f.activeTab().native?.child.pid,host:{x:p[0],y:p[1],width:area[2]},rect:r,top,pixels};
      };
    },require.resolve('koffi'));
    const sample=async label=>{const s=await app.evaluate(()=>global.__menuSample());if(s){samples.push({label,...s});assert.equal(s.rect[1],s.top,JSON.stringify(s));assert.equal(s.rect[2],s.host.x+s.host.width);}return s;};
    for(const mode of ['new-tab','flash']) {
      if(mode==='flash') {
        await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),require('./html-fixture')(path.join(profile,'movie'),require('./playback-fixture')));
        await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native?.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))').catch(()=>0)),value=>value>2);
        await poll(()=>app.evaluate(()=>!global.__flashborn.presentation && global.__flashborn.activeTab().native.isPresented()),Boolean);
        await poll(()=>app.evaluate(()=>global.__flashSurfacePixel()),value=>value?.join(',')==='30,32,37');
      }
      for(const theme of ['current','light']) {
        if(await app.evaluate(()=>global.__flashborn.getState().settings.theme)!==theme)await command('theme');
        await ui.locator('#address').hover();
        assert.equal(await ui.locator('#native-mode').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
        await ui.locator('#native-mode').hover();
        const hover=await ui.locator('#native-mode').evaluate(el=>getComputedStyle(el).backgroundColor);
        assert.equal(hover,theme==='light'?'rgb(206, 206, 206)':'rgb(48, 48, 48)');
        await ui.locator('#address').hover();
        await command('menu');await sample(mode+'-'+theme+'-opening');await wait(45);const middle=await sample(mode+'-'+theme+'-opening-middle');
        assert.ok(middle.progress>0 && middle.progress<1,JSON.stringify(middle));
        await fullyOpen();const open=await sample(mode+'-'+theme+'-open');
        if(process.env.FLASHBORN_MENU_TRACE)await app.evaluate(()=>{
          const f=global.__flashborn,m=f.menuMotion,animate=m.animate.bind(m);m.animate=(target,...args)=>{if(!target)console.error('MENU_CLOSE_TRACE',new Error().stack);return animate(target,...args);};
          f.menuWindow.on('close',()=>console.error('MENU_POPUP_CLOSE',new Error().stack));
          const changed=m.sizeChanged.bind(m);m.sizeChanged=()=>{const result=changed();console.error('MENU_SIZE',JSON.stringify({initial:m.hostSize,current:m.api.geometry()?.host,result}));return result;};
          for(const event of ['move','resize','blur'])f.win.once(event,()=>console.error('MENU_HOST_'+event));
        });
        assert.equal(open.rect[1],open.top);
        const popup=app.windows().find(window=>window.url().endsWith('/menu.html'));
        const ownership=await app.evaluate(()=>({owned:global.__flashborn.menuWindow.getParentWindow()===global.__flashborn.win,topmost:global.__flashborn.menuWindow.isAlwaysOnTop()}));
        assert.deepEqual(ownership,{owned:true,topmost:false});
        await poll(()=>popup.locator('.menu-surface').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42),value=>value===0);
        const mask=await popup.evaluate(()=>({html:getComputedStyle(document.documentElement).overflow,body:getComputedStyle(document.body).backgroundColor,surface:getComputedStyle(document.querySelector('.menu-surface')).backgroundColor}));
        assert.deepEqual(mask,{html:'hidden',body:'rgba(0, 0, 0, 0)',surface:theme==='light'?'rgb(240, 240, 240)':'rgb(40, 40, 40)'});
        assert.equal(await popup.locator('.menu-surface').evaluate(el=>getComputedStyle(el).opacity),'1');
        if(mode==='flash' && theme==='current'){
          const fixtureFile=path.join(profile,'overlap-fixture.cjs'),fixtureProfile=path.join(profile,'overlap-profile');
          fs.writeFileSync(fixtureFile,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(fixtureProfile)});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,frame:false,skipTaskbar:true,width:500,height:400,backgroundColor:'#1863cc',webPreferences:{sandbox:true}});await w.loadURL('data:text/html,<style>html,body{margin:0;background:%231863cc}</style>');global.fixture=w;});app.on('window-all-closed',()=>app.quit());`);
          const overlay=await electron.launch({executablePath:require('electron'),args:[fixtureFile],env});
          try{
            await poll(()=>overlay.evaluate(()=>!!global.fixture),Boolean);
            const b=await app.evaluate(()=>global.__flashborn.menuWindow.getBounds());
            await overlay.evaluate(({},b)=>{global.fixture.setBounds({x:b.x,y:b.y,width:500,height:400});global.fixture.showInactive();global.fixture.moveTop();},b);
            const other=await overlay.evaluate(()=>Number(global.fixture.getNativeWindowHandle().readBigUInt64LE()));
            const handles=await app.evaluate(()=>({menu:Number(global.__flashborn.menuWindow.getNativeWindowHandle().readBigUInt64LE()),host:Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE()),flash:global.__flashborn.activeTab().native.hwnd}));
            await poll(()=>Promise.resolve(above(handles.menu,other)&&above(handles.host,other)&&above(handles.flash,other)),Boolean);
            await sample('covered-by-other-window');
            assert.equal(await overlay.evaluate(()=>global.fixture.isAlwaysOnTop()),false);
            pass('An ordinary window covers the menu and Flashborn together; the menu is owned and never globally topmost');
          }finally{await overlay.evaluate(({app})=>app.exit(0)).catch(()=>{});}
          await wait(100);
        }
        const before=await app.evaluate(()=>global.__flashborn.activeTab().native?{pid:global.__flashborn.activeTab().native.child.pid,region:global.__flashborn.windowRegion.key}:null);
        const h=await app.evaluate(()=>Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE())),b=[0,0,0,0];moveRect(h,b);
        moveMessage(h,0x231,0,0);
        for(let step=1;step<=6;step++){moveWindow(h,0,b[0]+step*8,b[1]+step*5,0,0,0x15);await wait(15);await sample(mode+'-'+theme+'-drag-'+step);}
        moveMessage(h,0x232,0,0);
        await poll(()=>app.evaluate(()=>global.__menuSample()),s=>s && s.rect[2]===s.host.x+s.host.width && s.rect[1]===s.top);
        assert.equal(await app.evaluate(()=>global.__flashborn.getState().menuOpen),true,'Moving the host must keep the menu open');
        await ui.locator('.titlebar').dispatchEvent('pointerdown',{button:0});await wait(35);
        assert.equal(await app.evaluate(()=>global.__flashborn.getState().menuOpen),true,'Caption pointerdown must not dismiss the menu');
        await sample(mode+'-'+theme+'-moved');
        await ui.locator('#address').click();const rolling=await sample(mode+'-'+theme+'-closing');
        assert.equal(rolling.target,0);await wait(40);const hiding=await sample(mode+'-'+theme+'-closing-middle');
        assert.ok(hiding.progress>0 && hiding.progress<rolling.progress);
        await closed();
        if(before) {
          const after=await app.evaluate(()=>({pid:global.__flashborn.activeTab().native.child.pid,region:global.__flashborn.windowRegion.key,presented:global.__flashborn.activeTab().native.isPresented()}));
          assert.equal(after.pid,before.pid);assert.equal(after.region,before.region);assert.equal(after.presented,true);
          const covered=samples.filter(s=>s.label.startsWith('flash-'+theme) && s.ownForeground && s.progress>.3 && s.target===1 && s.pixels.inside);
          for(const s of covered){assert.deepEqual(s.pixels.inside,theme==='light'?[240,240,240]:[40,40,40],JSON.stringify(s));assert.deepEqual(s.pixels.below,[30,32,37],JSON.stringify(s));}
        }
        pass(mode+' '+theme+': transparent resting bolt, grey hover, masked slide down/up, menu follows movement, caption press retains it'+(before?', live Flash stays below the menu and visible below its mask':''));
      }
      await command('menu');await fullyOpen();await command('menu');await wait(40);
      const reversing=await sample(mode+'-reverse');await command('menu');await fullyOpen();
      assert.equal(await app.evaluate(()=>global.__flashborn.getState().menuOpen),true);
      assert.ok(reversing.progress>0 && reversing.progress<1);
      await command('menu-close');await closed();
      const parked=await app.evaluate(({BrowserWindow,screen})=>{const popup=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/menu.html')),b=popup.getBounds();return {id:popup.id,visible:popup.isVisible(),outside:screen.getAllDisplays().every(d=>b.x+b.width<=d.bounds.x||b.y+b.height<=d.bounds.y||b.x>=d.bounds.x+d.bounds.width||b.y>=d.bounds.y+d.bounds.height)};});
      assert.equal(parked.visible,true);assert.equal(parked.outside,true);samples.push({label:mode+'-prepared-popup',...parked});
      pass(mode+': toggle during roll-up reverses smoothly and closes without an orphan window');
    }
    if(process.env.FLASHBORN_MENU_MANUAL==='1') {
      if(await app.evaluate(()=>global.__flashborn.getState().settings.theme)!=='current')await command('theme');
      await command('menu');await fullyOpen();
      await app.evaluate(()=>global.__flashborn.win.setTitle('Flashborn menu motion QA'));
      console.log('READY_MENU_MOTION '+profile);
      await poll(()=>Promise.resolve(fs.existsSync(path.join(profile,'finish'))),Boolean,180000);
    }
    fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-menu-motion-results.json':'menu-motion-results.json'),JSON.stringify({passed,samples,profile},null,2));
  } finally {await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
