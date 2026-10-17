'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,check,timeout=15000){let value;const end=Date.now()+timeout;do{value=await fn();if(check(value))return value;await wait(60);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(value));}
(async()=>{
  const profile=path.join(output,'chrome-polish-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.write('<!doctype html><title>Mode toggle fixture</title><p>Mode toggle fixture</p>');if(req.url.startsWith('/slow'))setTimeout(()=>res.end('<p>Loaded</p>'),1600);else res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  let app;const passed=[],samples=[];const pass=message=>{passed.push(message);console.log('PASS '+message);};
  try{
    app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow();
    const command=(action,args={})=>app.evaluate(({},input)=>global.__flashborn.command(input.action,input.args),{action,args});
    await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1280,height:820});w.show();w.focus();});
    const bolt=ui.locator('#loading-bolt');
    assert.equal(await bolt.getAttribute('data-variant'),'outline');
    assert.equal(await ui.locator('#native-mode').getAttribute('title'),'Flash toggle: off (click to turn on)');
    await command('navigate',{value:url+'/slow'});
    await ui.locator('#native-mode').click();await poll(()=>bolt.getAttribute('data-variant'),value=>value==='filled');
    await poll(()=>bolt.getAttribute('data-motion'),value=>value==='spinning');
    assert.equal(await ui.locator('#native-mode').getAttribute('title'),'Flash toggle: on (click to turn off)');
    const a=await bolt.getAttribute('data-angle');await wait(160);assert.notEqual(await bolt.getAttribute('data-angle'),a);
    await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().loading),value=>!value);
    await poll(()=>bolt.getAttribute('data-motion'),value=>value==='idle');assert.equal(await bolt.getAttribute('data-angle'),'0.0000');
    await ui.locator('#native-mode').click();await poll(()=>bolt.getAttribute('data-variant'),value=>value==='outline');
    assert.equal(await ui.locator('#native-mode').getAttribute('title'),'Flash toggle: off (click to turn on)');
    await poll(()=>bolt.getAttribute('data-motion'),value=>value==='spinning');
    await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().loading),value=>!value);
    await poll(()=>bolt.getAttribute('data-motion'),value=>value==='idle');assert.equal(await bolt.getAttribute('data-angle'),'0.0000');
    assert.equal(await ui.locator('#title-bolt').getAttribute('data-variant'),'filled');
    pass('Clicking the toolbar bolt switches real browser modes and filled/outline meshes; both spin while loading and finish a full turn');
    const preview=await ui.evaluate(()=>{
      const sheet=document.createElement('canvas');sheet.width=768;sheet.height=320;const ctx=sheet.getContext('2d');
      ['current','light'].forEach((theme,row)=>{ctx.fillStyle=theme==='light'?'#e9e9e9':'#212121';ctx.fillRect(0,row*160,768,160);[false,true].forEach((outlined,column)=>{[0,Math.PI/4,Math.PI/2].forEach((angle,index)=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const icon=new GoldLightning(canvas,{outlined});icon.setTheme(theme);icon.draw(angle);ctx.drawImage(canvas,column*384+index*128,row*160,128,128);icon.dispose();});});});
      return sheet.toDataURL().split(',')[1];
    });fs.writeFileSync(path.join(output,'bolt-mode-preview.png'),Buffer.from(preview,'base64'));
    await command('menu');const menu=await poll(()=>app.windows().find(w=>w.url()==='flashborn://ui/menu.html'),Boolean);
    assert.equal(await menu.locator('[data-action="new-flashcognito"] > span').innerText(),'New Flashcognito tab');
    await menu.locator('[data-action="new-flashcognito"]').click();await poll(()=>app.evaluate(()=>global.__flashborn.activeTab().private),Boolean);
    assert.equal(await bolt.getAttribute('data-variant'),'outline');assert.equal(await bolt.getAttribute('data-metal'),'silver');
    pass('The menu says New Flashcognito tab and creates a private tab with the silver outlined mode indicator');
    await command('theme');for(let i=0;i<26;i++)await command('new-tab');
    const bars=await ui.evaluate(()=>{
      const box=document.createElement('textarea');box.id='scroll-fixture';box.style.cssText='position:fixed;left:450px;top:300px;width:240px;height:100px;overflow:auto';box.value='A long scrollable line '.repeat(8)+'\n';box.value=box.value.repeat(30);document.body.append(box);
      return [document.querySelector('.tabs'),document.querySelector('.content'),box].map(el=>({color:getComputedStyle(el).scrollbarColor,width:getComputedStyle(el).scrollbarWidth,vertical:el.scrollHeight>el.clientHeight}));
    });assert.ok(bars.every(bar=>bar.color==='rgb(181, 181, 181) rgba(0, 0, 0, 0)'&&bar.width==='thin'),JSON.stringify(bars));assert.equal(bars[0].vertical,true);assert.equal(bars[2].vertical,true);
    const capture=await app.evaluate(async()=>(await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(path.join(output,'light-scrollbars.png'),Buffer.from(capture,'base64'));await ui.locator('#scroll-fixture').evaluate(el=>el.remove());
    pass('Light-mode tab and text-box scrollbars use the same subtle grey thin thumb and transparent track');
    for(let i=0;i<4;i++){
      const frames=await ui.evaluate(async()=>{document.querySelector('[data-action="collapse"]').click();const frames=[],start=performance.now();await new Promise(resolve=>{const frame=()=>{const tabs=document.querySelector('.tabs');frames.push({gutter:tabs.offsetHeight-tabs.clientHeight,left:tabs.scrollLeft,width:tabs.clientWidth,scroll:tabs.scrollWidth,overflowX:getComputedStyle(tabs).overflowX,animating:document.body.classList.contains('sidebar-animating'),closeVisible:[...document.querySelectorAll('.tab-close')].filter(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0;}).length});if(performance.now()-start<300)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});return frames;});
      samples.push(frames);assert.ok(frames.every(frame=>frame.gutter===0&&frame.left===0&&frame.overflowX==='hidden'&&(!frame.animating||frame.closeVisible===0)),JSON.stringify(frames));
    }
    pass('An overflowing tab stack keeps its vertical scrollbar and shows no horizontal gutter throughout repeated collapse and expansion');
    pass('No tab close X is visible during collapse or expansion, including the active tab');
    fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-chrome-polish-results.json':'chrome-polish-results.json'),JSON.stringify({passed,bars,samples,completedAt:new Date().toISOString()},null,2));
  }finally{if(app)await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
