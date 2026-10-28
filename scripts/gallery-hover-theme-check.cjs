'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check,timeout=30000){let v;const end=Date.now()+timeout;do{try{v=await read();if(check(v))return v;}catch{}await wait(80);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
 const html=fs.readFileSync(path.join(root,'site/flash-gallery/flash.gallery.html')),server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=path.join(output,'gallery-hover-theme-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{theme:'current',adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile,FLASHBORN_LIBRARY_URL:'http://127.0.0.1:'+server.address().port+'/flash.gallery.html'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:require('electron'),args:[root],env});
 const command=(action,args={})=>app.evaluate(({},d)=>global.__flashborn.command(d.action,d.args),{action,args});
 const evaluate=code=>app.evaluate(({},code)=>global.__flashborn.activeContent().native.evaluate(code),code);
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow();await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:70,y:70,width:1400,height:1050});w.show();w.focus();});
  await command('panel',{name:'library'});await poll(()=>evaluate('typeof galleryPhysics'),v=>v==='object');
  for(const theme of ['current','light','current','light']){
   await command('settings',{darkTheme:theme!=='light',highContrast:false});
   const colors=await poll(()=>evaluate('JSON.stringify({theme:document.documentElement.dataset.theme,background:getComputedStyle(document.body).backgroundColor,field:getComputedStyle(document.getElementById("search")).backgroundColor})'),v=>v&&JSON.parse(v).theme===theme);
   assert.equal(JSON.parse(colors).background,theme==='light'?'rgb(222, 222, 222)':'rgb(23, 23, 23)');
  }
  await poll(()=>evaluate('galleryPhysics.snapshot().introPhase'),v=>v==='complete');
  const expected=await app.evaluate(()=>global.__flashborn.getState().library.length);
  await evaluate('document.querySelector("[data-value=all]").click()');await poll(()=>evaluate('galleryPhysics.snapshot().bodies.filter(function(b){return b.docked;}).length'),v=>v===expected);
  await evaluate('(function(){var s=galleryPhysics.snapshot(),id=s.matchIds[Math.min(2,s.matchIds.length-1)],e=document.querySelector(".block[data-id=\\""+id+"\\"]"),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,pointerType:"mouse"}));})()');
  const hovered=await poll(()=>evaluate('JSON.stringify(galleryPhysics.snapshot())'),v=>{const s=JSON.parse(v);return s.hoveredId&&s.bodies.every(b=>b.docked);});
  const s=JSON.parse(hovered),b=s.bodies.find(b=>b.id===s.hoveredId);assert.ok(Math.abs(b.width-(s.gridRail.cellWidth*2+s.gridRail.gap))<.01);assert.ok(Math.abs(b.height-(s.gridRail.cellHeight*2+s.gridRail.gap))<.01);
  fs.writeFileSync(path.join(output,'gallery-hover-theme-results.json'),JSON.stringify({passed:true,themeSwitches:4,exactScale:2,count:s.count,columns:s.columns},null,2));
  console.log('PASS: Native Flash Gallery receives the actual Flashborn theme switch, retains all saved projects, and enlarges hover exactly 2x.');
 }finally{await app.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
