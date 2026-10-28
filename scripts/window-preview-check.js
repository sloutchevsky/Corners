'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,check,timeout=25000){const until=Date.now()+timeout;let value;do{value=await read();if(check(value))return value;await wait(60);}while(Date.now()<until);throw Error('Timeout: '+JSON.stringify(value));}
(async()=>{
 const profile=path.join(output,'window-preview-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env}),passed=[];
 const pass=text=>{passed.push(text);console.log('PASS '+text);};
 const command=(action,args={})=>app.evaluate(({},input)=>global.__flashborn.command(input.action,input.args),{action,args});
 const read=()=>app.evaluate(()=>{const f=global.__flashborn,p=f.windowPreview,n=f.activeContent()?.native;return {key:p.key,stats:p.stats,results:p.api.results,image:p.image&&{width:p.image.width,height:p.image.height},pid:n?.child.pid,tab:f.getState().activeId,minimized:f.win.isMinimized()};});
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow();
  await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:70,y:70,width:1250,height:850});w.show();w.focus();});
  await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),require('./html-fixture')(path.join(profile,'movie'),require('./playback-fixture')));
  await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().native?.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))').catch(()=>0)),ticks=>ticks>3);
  await app.evaluate(()=>global.__flashborn.activeTab().native.evaluate('document.querySelector("embed").SetVariable("marker",73)'));
  const ready=await poll(read,value=>value.image&&value.image.width>800),pid=ready.pid,flashId=ready.tab;
  for(const theme of ['current','light']){
   if(await ui.locator('body').getAttribute('data-theme')!==theme)await command('theme');
   await poll(()=>ui.locator('body').getAttribute('data-theme'),value=>value===theme);
   await poll(()=>app.evaluate(({nativeTheme})=>nativeTheme.themeSource),value=>value===(theme==='light'?'light':'dark'));
   await app.evaluate(async()=>{const p=global.__flashborn.windowPreview;await p.pending;p.capturedAt=0;p.refresh();await p.pending;});
   const picture=await app.evaluate(({nativeImage})=>{
    const p=global.__flashborn.windowPreview,image=p.image,bytes=image.data;let cream=0,dark=0;
    for(let i=0;i<bytes.length;i+=4){if(bytes[i]>140&&bytes[i]<220&&bytes[i+1]>180&&bytes[i+1]<235&&bytes[i+2]>225)cream++;if(Math.abs(bytes[i]-37)<5&&Math.abs(bytes[i+1]-32)<5&&Math.abs(bytes[i+2]-30)<5)dark++;}
    return {cream,dark,pixels:image.width*image.height,png:nativeImage.createFromBitmap(bytes,{width:image.width,height:image.height}).toPNG().toString('base64')};
   });
   assert.ok(picture.cream>1000&&picture.dark>picture.pixels*.4,JSON.stringify({...picture,png:undefined}));fs.writeFileSync(path.join(output,'window-preview-'+theme+'.png'),Buffer.from(picture.png,'base64'));
  }
  pass('The complete switcher image contains browser chrome and real Flash pixels in both themes; the native frame theme follows the selected skin');
  // Stay within Windows' cached taskbar bounds for a synthetic request. The
  // production handler uses the exact dimensions requested by DWM itself.
  await app.evaluate(()=>{const p=global.__flashborn.windowPreview,size=Buffer.alloc(8);size.writeUInt32LE((160<<16)|100);p.onThumbnail(null,size);p.onLive();});
  await poll(read,value=>value.stats.thumbnails>0&&value.stats.live>0);
  pass('Windows accepts the real 32-bit DWM thumbnail and full-size Peek bitmap, with cached buffers freed after publication');
  await app.evaluate(()=>global.__flashborn.win.minimize());await poll(read,value=>value.minimized);
  const parked=await read();assert.ok(parked.image&&parked.key);
  await app.evaluate(()=>{const p=global.__flashborn.windowPreview,size=Buffer.alloc(8);size.writeUInt32LE((160<<16)|100);p.onThumbnail(null,size);});await poll(read,value=>value.stats.thumbnails>parked.stats.thumbnails);
  await app.evaluate(()=>{global.__flashborn.win.restore();global.__flashborn.win.show();});
  await poll(read,value=>!value.minimized&&value.pid===pid);
  assert.equal(await app.evaluate(()=>global.__flashborn.activeTab().native.evaluate('Number(document.querySelector("embed").GetVariable("marker"))')),73);
  pass('A minimized Flash window retains its completed preview and restores the same running movie without reloading');
  await command('new-flashcognito');await poll(read,value=>!value.key&&!value.image);
  const privateId=(await read()).tab;await command('close-tab',{id:privateId});await command('select-tab',{id:flashId});await poll(read,value=>value.image&&value.pid===pid);
  await command('panel',{name:'bookmarks'});await poll(read,value=>!value.key&&!value.image);
  await command('select-tab',{id:flashId});await poll(read,value=>value.image&&value.pid===pid);
  pass('Changing to a regular special page or private New Tab clears the old preview; returning to Flash rebuilds it without changing its runtime');
  fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-window-preview-results.json':'window-preview-results.json'),JSON.stringify({passed,profile,pid},null,2));
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

