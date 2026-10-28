'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,check,timeout=25000){const end=Date.now()+timeout;let value;do{value=await read();if(check(value))return value;await wait(100);}while(Date.now()<end);throw Error('Timeout: '+JSON.stringify(value));}
(async()=>{
 const server=http.createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end(fs.readFileSync('C:/_projects/flashborn/flash.library.html'));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=process.env.FLASHBORN_LIBRARY_LIVE==='1'?'https://flashborn.sloutchevsky.com/flash.library.html':'http://127.0.0.1:'+server.address().port+'/flash.library.html';
 const profile=path.join(out,'flash-inset-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{theme:'light',adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.FLASHBORN_LIBRARY_URL;if(url.startsWith('http:'))env.FLASHBORN_LIBRARY_URL=url;
 const app=await electron.launch({executablePath:path.join(root,'release','win-unpacked','Flashborn.exe'),args:[],env});
 const evaluate=code=>app.evaluate(({},code)=>global.__flashborn.activeContent().native.evaluate(code),code);
 const mouse=(type,x,y,button='left')=>app.evaluate(({},args)=>global.__flashborn.activeContent().native.call('test-mouse',args),{type,x,y,button,clickCount:1});
 const capture=async name=>fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(await app.evaluate(()=>global.__flashborn.activeContent().native.screenshot()),'base64'));
 try{
  await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:40,y:40,width:1360,height:1040});w.show();w.focus();return global.__flashborn.command('panel',{name:'library'});});
  await poll(()=>evaluate('!document.getElementById("browse-page").hidden'),Boolean);await wait(8500);
  const geometry=await evaluate('(()=>{var movie=document.getElementById("freedomDemo"),stage=document.getElementById("feature-stage"),r=stage.getBoundingClientRect();return{width:movie.clientWidth,height:movie.clientHeight,stageWidth:stage.clientWidth,stageHeight:stage.clientHeight,transform:getComputedStyle(movie).transform,pointer:getComputedStyle(movie).pointerEvents,menu:movie.querySelector("param[name=menu]").value,overlay:document.querySelectorAll(".feature-link,#flash-menu").length,x:r.left+r.width/2,y:r.top+r.height/2}})()');
  assert.equal(geometry.width,geometry.stageWidth*2);assert.equal(geometry.height,geometry.stageHeight*2);assert.equal(geometry.transform,'none');assert.equal(geometry.pointer,'auto');assert.equal(geometry.menu,'true');assert.equal(geometry.overlay,0);console.log('PASS real Flash viewport',JSON.stringify(geometry));
  await capture('flash-inset-native-render');
  await evaluate('window.insetEvents=[];window.insetOpenRequests=[];window.open=function(url){insetOpenRequests.push(url);return null;};["mousedown","mouseup","click","wheel","contextmenu"].forEach(function(type){document.getElementById("feature-stage").addEventListener(type,function(event){insetEvents.push({type:event.type,button:event.button,trusted:event.isTrusted,target:event.target.id,defaultPrevented:event.defaultPrevented});},true);});true');
  if(process.env.FLASHBORN_INSET_MENU==='1'){
   await mouse('mouseMove',geometry.x,geometry.y,'none');await mouse('mouseDown',geometry.x,geometry.y,'right');await mouse('mouseUp',geometry.x,geometry.y,'right');
   console.log('READY_NATIVE_MENU');await wait(1000);console.log('EVENTS',JSON.stringify(await evaluate('insetEvents')));
  }
  if(process.env.FLASHBORN_INSET_WHEEL==='1'){console.log('READY_REAL_WHEEL');await poll(()=>evaluate('insetEvents.some(function(event){return event.type==="wheel"&&event.trusted;})'),Boolean,45000);assert.ok(Number(await evaluate('document.getElementById("feature-stage").dataset.zoom'))>2);console.log('PASS real wheel over the Flash object changes the actual viewport');}
  const initialZoom=Number(await evaluate('document.getElementById("feature-stage").dataset.zoom'));
  await evaluate('document.getElementById("freedomDemo").dispatchEvent(new WheelEvent("wheel",{deltaY:-100,bubbles:true,cancelable:true}))');assert.ok(Number(await evaluate('document.getElementById("feature-stage").dataset.zoom'))>initialZoom);assert.equal(await evaluate('getComputedStyle(document.getElementById("freedomDemo")).transform'),'none');
  const before=await app.evaluate(()=>global.__flashborn.activeContent().id);
  await mouse('mouseMove',geometry.x,geometry.y,'none');await mouse('mouseDown',geometry.x,geometry.y);await mouse('mouseUp',geometry.x,geometry.y);await wait(1200);
  const clicked=await evaluate('insetOpenRequests');console.log('CLICK_RESULT',JSON.stringify(clicked));assert.ok(clicked.includes('https://www.sloutchevsky.com/demos/freedom_and_partners/'));
  console.log('CLICK_EVENTS',JSON.stringify(await app.evaluate(({},id)=>global.__flashborn.libraryPanels.get(false).native.evaluate('insetEvents'),before)));
  fs.writeFileSync(path.join(out,'flash-inset-results.json'),JSON.stringify({url,profile,geometry},null,2));
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
