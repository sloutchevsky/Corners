'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'test-output');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:path.join(output,'real-sites-'+Date.now())}; delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env,timeout:45000});
 app.process().stderr.on('data',b=>process.stderr.write(b));
 try{
  await app.firstWindow();
  for(let i=0;i<100;i++){if(await app.evaluate(()=>!!global.__flashborn))break;await delay(100);}
  await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1280,height:820});w.show();w.focus();});
  const urls=process.argv.slice(2).length?process.argv.slice(2):['https://www.sloutchevsky.com/demos/firstborn4/','https://www.sloutchevsky.com/demos/kpf/','https://www.sloutchevsky.com/demos/firstborn5/flashSmall.htm'];
  const results=[];
  for(let i=0;i<urls.length;i++){
   console.log('SITE',urls[i]);
   await app.evaluate(async({},url)=>global.__flashborn.command('navigate',{value:url}),urls[i]);
   await delay(6000);
   let state=await app.evaluate(()=>global.__flashborn.getState());
   if(!state.tabs.find(t=>t.id===state.activeId).native){
    assert.notEqual(process.env.FLASHBORN_AUTO_ONLY,'1','The site must switch to native Flash automatically');
    await app.evaluate(()=>global.__flashborn.command('native-mode'));await delay(6000);
   }
   const inspect='('+function inspectSite(){
    const flash=[];
    function visit(w){try{
     for(const e of w.document.querySelectorAll('object,embed')){
      let version,percent,frame,error;try{version=e.GetVariable?.('$version');percent=e.PercentLoaded?.();frame=e.CurrentFrame?.();}catch(ex){error=ex.message;}
      flash.push({tag:e.tagName,type:e.type,src:e.src||e.data,version,percent,frame,error});
     }
     for(let i=0;i<w.frames.length;i++)visit(w.frames[i]);
    }catch{}}
    visit(window);
    return {url:location.href,title:document.title,text:document.body?.innerText?.slice(0,1600),plugins:[...navigator.plugins].map(p=>({name:p.name,description:p.description})),html:document.documentElement.outerHTML.slice(0,15000),flash};
   }.toString()+')()';
   let result=await app.evaluate(({},code)=>global.__flashborn.activeTab().native.evaluate(code),inspect);
   if(process.env.FLASHBORN_AUTO_ONLY==='1'){
    const deadline=Date.now()+60000;
    while(!result.flash.some(movie=>movie.percent===100)&&Date.now()<deadline){await delay(300);result=await app.evaluate(({},code)=>global.__flashborn.activeTab().native.evaluate(code),inspect);}
   }
   if(process.env.FLASHBORN_SITE_WAIT){await delay(Number(process.env.FLASHBORN_SITE_WAIT));result=await app.evaluate(({},code)=>global.__flashborn.activeTab().native.evaluate(code),inspect);}
   result.shell=await app.evaluate(()=>global.__flashborn.getState().tabs.find(t=>t.id===global.__flashborn.getState().activeId));
   console.log('RESULT',JSON.stringify({...result,html:undefined},null,2));
   if(process.env.FLASHBORN_AUTO_ONLY==='1'){
    assert.ok(!/\/update\.html\?/.test(result.url),'The original site must survive Flash version detection');
    assert.ok(result.flash.some(movie=>movie.version==='WIN '+require('../src/legacy/runtime.json').version.replaceAll('.',',')&&movie.percent===100),'At least one real Flash instance must load completely');
   }
   results.push(result);
   console.log('WINDOW',await app.evaluate(()=>global.__flashborn.activeTab().native.inspect?.()));
   const bytes=await app.evaluate(()=>global.__flashborn.activeTab().native.screenshot());
   fs.writeFileSync(path.join(output,'real-site-'+i+'.png'),Buffer.from(bytes,'base64'));
   const composite=await app.evaluate(async({desktopCapturer})=>{const w=global.__flashborn.win;const [width,height]=w.getSize();const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:Math.round(width*1.25),height:Math.round(height*1.25)}});const target=sources.find(s=>s.id===w.getMediaSourceId());return target?.thumbnail.toPNG().toString('base64');});
   if(composite)fs.writeFileSync(path.join(output,'real-window-'+i+'.png'),Buffer.from(composite,'base64'));
   const screenImage=await app.evaluate(async({desktopCapturer,screen})=>{const w=global.__flashborn.win;w.focus();const b=w.getBounds();const d=screen.getDisplayMatching(b);const factor=d.scaleFactor;const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(d.size.width*factor),height:Math.round(d.size.height*factor)}});const target=sources.find(s=>s.display_id===String(d.id));if(!target)return;return target.thumbnail.crop({x:Math.round((b.x-d.bounds.x)*factor),y:Math.round((b.y-d.bounds.y)*factor),width:Math.round(b.width*factor),height:Math.round(b.height*factor)}).toPNG().toString('base64');});
   if(screenImage)fs.writeFileSync(path.join(output,'real-visible-'+i+'.png'),Buffer.from(screenImage,'base64'));
  }
  fs.writeFileSync(path.join(output,'real-sites.json'),JSON.stringify(results,null,2));
 }finally{await app.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
