'use strict';
const {_electron:electron} = require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(fn,check,timeout=30000){const end=Date.now()+timeout;let value;do{value=await fn();if(check(value))return value;await wait(80);}while(Date.now()<end);throw Error('Timeout: '+JSON.stringify(value));}
(async()=>{
  const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:path.join(output,'eyedropper-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync(env.FLASHBORN_PROFILE,{recursive:true});
  const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
  const passed=[],pass=text=>{passed.push(text);console.log('PASS '+text);};
  try{
    await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);
    const ui=await app.firstWindow();
    await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1280,height:820});w.show();w.focus();});
    const state=()=>app.evaluate(()=>global.__flashborn.getState());
    const command=(action,args={})=>app.evaluate(({},data)=>global.__flashborn.command(data.action,data.args),{action,args});
    const script=code=>app.evaluate(({},code)=>global.__flashborn.activeTab().native.evaluate(code),code);
    await app.evaluate(({},file)=>global.__flashborn.openLocal(file),path.join(root,'assets','Flashborn-Demo.swf'));
    await poll(()=>script('document.body.dataset.ready'),value=>value==='true');
    assert.equal(await script('document.getElementById("flash-movie").GetVariable("$version")'),'WIN 32,0,0,363');
    await script('document.getElementById("background").click()');
    const color=await poll(()=>app.windows().find(w=>w.url()==='flashborn://ui/color.html'),Boolean);
    await color.evaluate(()=>{
      const Native=window.EyeDropper;
      window.EyeDropper=class extends Native{
        open(options){window.__realPickerStarted=true;return super.open(options).catch(error=>{window.__realPickerError=error.name;throw error;});}
      };
    });
    const original=(await state()).flashBackground;
    await color.locator('#color-pick').click();
    await poll(()=>color.evaluate(()=>({started:window.__realPickerStarted,error:window.__realPickerError,picking,abort:!!pickAbort})),v=>v.started&&!v.error&&v.picking&&v.abort);
    await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native.inspect().visible),v=>v===0);
    await ui.locator('#color-pick-preview').evaluate(el=>el.decode());
    await wait(650);
    assert.equal(await color.evaluate(()=>window.__realPickerError),undefined);
    assert.equal((await state()).colorPicking,true);
    assert.equal(await app.evaluate(()=>global.__flashborn.colorWindow.isAlwaysOnTop()),true);
    const pixels=await app.evaluate(({nativeImage})=>{
      const png=global.__flashborn.getState().colorPreview.split(',')[1],bitmap=nativeImage.createFromBuffer(Buffer.from(png,'base64')).toBitmap();
      let cream=0;for(let i=0;i<bitmap.length;i+=4)if(bitmap[i+2]>200&&bitmap[i+1]>160&&bitmap[i+1]<235&&bitmap[i]>100&&bitmap[i]<220)cream++;
      return cream;
    });
    assert.ok(pixels>500,'Real Flash pixels must remain available while the native child is hidden.');
    const png=await app.evaluate(async()=> (await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(path.join(output,'native-eyedropper-flash-1.7.0.png'),Buffer.from(png,'base64'));
    pass('The real Windows/Chromium eyedropper opens above genuine Flash: the native Flash child is hidden, the color dialog stays on top, and real Flash pixels remain visible');
    await color.evaluate(()=>pickAbort.abort());
    await poll(state,s=>!s.colorPicking&&!s.colorPreview);
    assert.equal(await color.evaluate(()=>window.__realPickerError),'AbortError');
    assert.equal((await state()).flashBackground,original);
    await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native.inspect().visible),Boolean);
    const frame=await script('document.getElementById("flash-movie").CurrentFrame()');
    await poll(()=>script('document.getElementById("flash-movie").CurrentFrame()'),value=>value!==frame);
    pass('Canceling screen picking restores live Flash playback and preserves the background color');
    await command('color-close');
    fs.writeFileSync(path.join(output,'eyedropper-results.json'),JSON.stringify({passed,completedAt:new Date().toISOString()},null,2));
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
