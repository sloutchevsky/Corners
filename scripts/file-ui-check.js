'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const demo = require('./create-demo'), pdf = require('./create-pdf-demo');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout=30000) { const end=Date.now()+timeout;let value;do {value=await fn();if(check(value))return value;await wait(120);}while(Date.now()<end);throw Error('Timeout: '+JSON.stringify(value)); }
async function run() {
  const fixture = path.join(output, 'drop-fixtures'); fs.mkdirSync(fixture, {recursive:true});
  fs.writeFileSync(path.join(fixture,'Dropped.pdf'),pdf);fs.writeFileSync(path.join(fixture,'Dropped.swf'),demo);
  fs.writeFileSync(path.join(fixture,'style.css'),'body{background:rgb(10,30,50);color:white}');
  fs.writeFileSync(path.join(fixture,'Dropped.html'),'<!doctype html><title>Dropped HTML</title><link rel="stylesheet" href="style.css"><h1>Local HTML verified</h1><img src="Dropped.png" width="320" height="180">');
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><title>${req.url}</title><h1>URL autocomplete fixture</h1>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://flashborn.test:${server.address().port}`;
  const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:path.join(output,'file-ui-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
  let app;const results=[];const pass=text=>{results.push(text);console.log('PASS '+text);};
  try {
    app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:[...(process.env.FLASHBORN_EXE?[]:[root]),'--host-resolver-rules=MAP flashborn.test 127.0.0.1'],env});
    await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);
    const ui=await app.firstWindow(),state=()=>app.evaluate(()=>global.__flashborn.getState());
    const command=(action,args={})=>app.evaluate(({},data)=>global.__flashborn.command(data.action,data.args),{action,args});
    const script=code=>app.evaluate(({},code)=>{const t=global.__flashborn.activeTab();return t.native?t.native.evaluate(code):t.view?.webContents.executeJavaScript(code,true);},code);
    await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1280,height:820});w.show();w.focus();});
    const png=await app.evaluate(({nativeImage})=>{const pixels=Buffer.alloc(320*180*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=210;pixels[i+1]=110;pixels[i+2]=30;pixels[i+3]=255;}return nativeImage.createFromBitmap(pixels,{width:320,height:180}).toPNG().toString('base64');});
    fs.writeFileSync(path.join(fixture,'Dropped.png'),Buffer.from(png,'base64'));
    await command('navigate',{value:base+'/alpha'});await command('bookmark');
    await command('navigate',{value:base+'/alphabet'});await command('bookmark');
    await ui.locator('#address').fill(base.replace('http://','')+'/al');
    await poll(()=>ui.locator('#address').evaluate(el=>({value:el.value,start:el.selectionStart,end:el.selectionEnd})),s=>s.end>s.start&&s.value.endsWith('/alphabet'));
    await ui.locator('#address').press('Enter');
    await poll(state,s=>!s.suggestions&&s.tabs.find(t=>t.id===s.activeId)?.url===base+'/alphabet');
    await ui.locator('#address').fill(base+'/al');
    await poll(state,s=>s.suggestions?.items.length===2);
    await poll(()=>ui.locator('#address').evaluate(el=>({value:el.value,start:el.selectionStart,end:el.selectionEnd})),s=>s.end>s.start&&s.value.endsWith('/alphabet'));
    const suggestions=await poll(()=>app.windows().find(page=>page.url()==='flashborn://ui/suggestions.html'),Boolean);
    assert.equal(await suggestions.locator('button').count(),2);
    await ui.locator('#address').press('ArrowDown');await ui.locator('#address').press('Enter');
    await poll(state,s=>!s.suggestions&&s.tabs.find(t=>t.id===s.activeId)?.url===base+'/alphabet');
    await ui.locator('#address').fill(base+'/al');await poll(state,s=>!!s.suggestions);
    await ui.locator('#address').press('Escape');await poll(state,s=>!s.suggestions);
    assert.equal(await ui.locator('#address').inputValue(),base+'/al');
    await ui.locator('#address').fill(base+'/al');await poll(state,s=>!!s.suggestions);
    const suggestionClick=await poll(()=>app.windows().find(page=>page.url()==='flashborn://ui/suggestions.html'),Boolean);
    await suggestionClick.locator('button').filter({hasText:base+'/alpha'}).last().click();
    await poll(state,s=>!s.suggestions&&s.tabs.find(t=>t.id===s.activeId)?.url===base+'/alpha');
    pass('URL autocomplete preserves HTTP addresses and supports inline completion, arrows, Enter, Escape and clicking suggestions');
    const video=await script(`new Promise(resolve=>{const c=document.createElement('canvas');c.width=320;c.height=180;const g=c.getContext('2d');let n=0;const draw=setInterval(()=>{g.fillStyle=n++%2?'#1e6ed2':'#d26e1e';g.fillRect(0,0,320,180)},50);const chunks=[],rec=new MediaRecorder(c.captureStream(10),{mimeType:'video/webm;codecs=vp8'});rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=()=>{clearInterval(draw);const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));c.remove();};rec.start();setTimeout(()=>rec.stop(),650);})`);
    fs.writeFileSync(path.join(fixture,'Dropped.webm'),Buffer.from(video,'base64'));
    const drop=async(file,content=false,reject=false)=>{
      const count=(await state()).tabs.length;
      await app.evaluate(async({},args)=>{const b=global.__flashborn,wc=args.content?b.activeTab().view.webContents:b.win.webContents;if(!wc.debugger.isAttached())wc.debugger.attach('1.3');for(const type of ['dragEnter','dragOver','drop'])await wc.debugger.sendCommand('Input.dispatchDragEvent',{type,x:args.content?100:180,y:180,data:{items:[],files:[args.file],dragOperationsMask:1}});},{file,content});
      if (reject) return;
      await poll(state,s=>{const t=s.tabs.find(t=>t.id===s.activeId);return s.tabs.length===count+1&&t&&t.kind!=='home'&&!t.loading;},60000);
      await poll(()=>app.evaluate(()=>{
        const t=global.__flashborn.activeTab(),wc=t?.view?.webContents;
        if(t?.native)return !t.loading;
        return !!wc&&!wc.isDestroyed()&&wc.getURL().startsWith('flashborn://document/')&&!wc.isLoading()&&!t.loading;
      }),Boolean);
      return state();
    };
    await drop(path.join(fixture,'Dropped.html'));
    await poll(()=>script('({title:document.title,bg:getComputedStyle(document.body).backgroundColor,image:document.querySelector("img")?.naturalWidth,node:typeof require,api:typeof window.browser})'),s=>s.title==='Dropped HTML'&&s.bg==='rgb(10, 30, 50)'&&s.image===320&&s.node==='undefined'&&s.api==='undefined');
    const denied=await script('fetch("../package.json").then(r=>r.status).catch(()=>0)');assert.ok(denied>=400||denied===0);
    pass('Dropping HTML opens a tab with relative CSS and images; local pages have no Node or application API');
    await drop(path.join(fixture,'Dropped.png'),true);
    await poll(()=>script('document.querySelector("img")?.naturalWidth'),n=>n===320);
    pass('Dropping an image onto page content displays the image in a new tab');
    await drop(path.join(fixture,'Dropped.webm'));
    await poll(()=>script('({state:document.querySelector("video")?.readyState,width:document.querySelector("video")?.videoWidth,error:document.querySelector("video")?.error?.message})'),s=>{if(s.error)throw Error(s.error);return s.state>=2&&s.width===320;});
    await script('document.querySelector("video").play()');
    await poll(()=>script('document.querySelector("video").currentTime'),time=>time>0);
    pass('Dropping video opens native browser video controls and plays decoded frames');
    await drop(path.join(fixture,'Dropped.pdf'));
    await poll(()=>app.evaluate(async()=>{
      const wc=global.__flashborn.activeTab().view?.webContents;
      if(!wc||wc.isDestroyed()||wc.isLoading())return 0;
      let bitmap;
      try {bitmap=(await wc.capturePage()).toBitmap();}
      catch(error) {if(error.message.includes('UnknownVizError'))return 0;throw error;}
      let blue=0;for(let i=0;i<bitmap.length;i+=4)if(bitmap[i]>150&&bitmap[i+1]>70&&bitmap[i+1]<150&&bitmap[i+2]<60)blue++;return blue;
    }),n=>n>2000);
    pass('Dropping a PDF displays the rendered document');
    const beforeDrop = (await state()).tabs.length;
    await drop(path.join(fixture,'Dropped.swf'),false,true);
    await poll(() => ui.locator('#toast').innerText(), value => value.includes('Standalone SWF playback has been removed'));
    assert.equal((await state()).tabs.length, beforeDrop);
    const flashHTML = require('./html-fixture')(path.join(fixture,'Flash-page'));
    await command('add-library-source', {kind:'html',value:flashHTML});
    await poll(()=>script('document.getElementById("flash-movie")?.GetVariable("$version")'),v=>v==='WIN 34,0,0,376');
    pass('Raw SWF drops are rejected; a local HTML page can still load its embedded Adobe Flash movie');
    await command('panel',{name:'library'});
    await ui.locator('[data-open-library="html"]').click();
    await ui.locator('#library-open-address').fill('movie');
    await poll(state,s=>s.suggestions?.field==='library-open-address'&&s.suggestions.items[0]?.type==='file');
    await poll(()=>ui.locator('#library-open-address').getAttribute('aria-expanded'),value=>value==='true');
    await ui.locator('#library-open-address').press('ArrowDown');
    await poll(()=>ui.locator('#library-open-address').inputValue(),value=>value===flashHTML);
    await ui.locator('#library-open-address').press('Enter');
    await poll(()=>script('document.getElementById("flash-movie")?.GetVariable("$version")'),v=>v==='WIN 34,0,0,376');
    pass('Flash library predictions complete saved HTML sources and open them with Adobe playback');
    await ui.locator('.sidebar-wordmark').click();
    await ui.locator('.about-copyright').click();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.url==='https://www.sloutchevsky.com/');
    await command('navigate',{value:base+'/alpha'});
    pass('Clicking the copyright line navigates to sloutchevsky.com');
    fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-file-ui-results.json':'file-ui-results.json'),JSON.stringify({passed:results,completedAt:new Date().toISOString()},null,2));
    console.log('Completed '+results.length+' file and autocomplete checks.');
  } catch(error) { console.error(error);if(app)console.error(await app.evaluate(()=>global.__flashborn?.getState()));throw error; }
  finally {if(app)await app.close();server.close();}
}
run().catch(()=>{process.exitCode=1});
