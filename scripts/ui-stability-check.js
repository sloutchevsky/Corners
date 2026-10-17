'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,check,timeout=15000){let v;const end=Date.now()+timeout;do{v=await fn();if(check(v))return v;await wait(60);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(v));}
(async()=>{
  const profile=path.join(output,'ui-stability-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
  const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Permission fixture</title><button onclick="Notification.requestPermission().then(result=>document.body.dataset.permission=result)">Notify</button>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  let app,ui;const passed=[],samples=[];
  const command=(action,args={})=>app.evaluate(({},args)=>global.__flashborn.command(args.action,args.args),{action,args});
  const state=()=>app.evaluate(()=>global.__flashborn.getState());
  const launch=async()=>{
    app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
    await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();
    await app.evaluate(({dialog})=>{global.permissionPrompts=0;dialog.showMessageBox=async()=>{global.permissionPrompts++;return {response:0};};let w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1280,height:820});w.show();w.focus();});
  };
  const pass=message=>{passed.push(message);console.log('PASS '+message);};
  try{
    await launch();await command('navigate',{value:url});
    await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId).loading);
    assert.equal(await app.evaluate(()=>global.__flashborn.activeTab().view.webContents.executeJavaScript('Notification.requestPermission()',true)),'denied');
    assert.equal(await app.evaluate(()=>global.permissionPrompts),1);
    await command('reload');await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId).loading);
    assert.equal(await app.evaluate(()=>global.__flashborn.activeTab().view.webContents.executeJavaScript('Notification.requestPermission()',true)),'denied');assert.equal(await app.evaluate(()=>global.permissionPrompts),1);
    await app.close();app=null;await launch();
    await command('navigate',{value:url});await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId).loading);
    assert.equal(await app.evaluate(()=>global.__flashborn.activeTab().view.webContents.executeJavaScript('Notification.requestPermission()',true)),'denied');assert.equal(await app.evaluate(()=>global.permissionPrompts),0);
    pass('A real website notification choice survives reload and application restart without another dialog');
    await command('new-tab');await command('new-tab');
    const expanded=await ui.locator('.tab-select').first().evaluate(el=>({icon:el.firstElementChild.getBoundingClientRect().x,titleY:el.querySelector('.tab-title').getBoundingClientRect().y,width:el.getBoundingClientRect().width}));
    for(const direction of ['collapse','restore','collapse','restore']){
      const frames=await ui.evaluate(async()=>{
        const frames=[];document.querySelector('[data-action="collapse"]').click();
        const started=performance.now();await new Promise(resolve=>{const frame=()=>{const button=document.querySelector('.tab-select'),title=button.querySelector('.tab-title'),nav=document.querySelector('[data-panel="downloads"] > span');frames.push({at:performance.now()-started,sidebar:document.querySelector('.sidebar').getBoundingClientRect().width,icon:button.firstElementChild.getBoundingClientRect().x,titleY:title.getBoundingClientRect().y,titleWidth:title.getBoundingClientRect().width,titleHeight:title.getBoundingClientRect().height,buttonWidth:button.getBoundingClientRect().width,navHeight:nav.getBoundingClientRect().height,opacity:getComputedStyle(title).opacity,animating:document.body.classList.contains('sidebar-animating')});if(performance.now()-started<310)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});return frames;
      });
      samples.push({direction,frames});
      assert.ok(frames.every(f=>Math.abs(f.icon-expanded.icon)<.1),'Icons moved during '+direction);
      if(direction==='restore'){
        const moving=frames.filter(f=>f.animating&&f.sidebar>68);
        assert.ok(moving.length>=3,'Missing expansion frames');assert.ok(moving.every(f=>f.buttonWidth===expanded.width&&f.titleHeight>0&&Math.abs(f.titleY-expanded.titleY)<.1&&f.navHeight<=18),JSON.stringify(moving));
        assert.ok(moving.some(f=>Number(f.opacity)>0&&Number(f.opacity)<1),'Labels should reveal gradually');
      }
    }
    pass('Repeated collapse/restore keeps icon positions and expanded text geometry stable; labels reveal gradually');
    const ordinaryId=(await state()).activeId;
    await command('new-flashcognito');
    for(const theme of ['current','light']){
      if((await state()).settings.theme!==theme)await command('theme');
      for(const panel of ['history','downloads']){
        await command('panel',{name:panel});await ui.locator('.flashcognito-panel').waitFor();
        const styles=await ui.evaluate(()=>({opacity:getComputedStyle(document.querySelector('.panel')).opacity,label:getComputedStyle(document.querySelector('.sidebar [data-panel="history"] > span')).color,other:getComputedStyle(document.querySelector('.sidebar [data-panel="bookmarks"] > span')).color}));
        assert.equal(styles.opacity,'0.5');assert.notEqual(styles.label,styles.other);
        const png=await app.evaluate(async()=>(await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(path.join(output,`flashcognito-${panel}-${theme}.png`),Buffer.from(png,'base64'));
      }
    }
    await command('select-tab',{id:ordinaryId});await command('panel',{name:'downloads'});await ui.locator('.panel:not(.flashcognito-panel)').waitFor();assert.equal(await ui.locator('.panel').evaluate(el=>getComputedStyle(el).opacity),'1');
    pass('Flashcognito History and Downloads use cool grey labels and half-opacity pages in both themes; normal pages stay unchanged');
    fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-ui-stability-results.json':'ui-stability-results.json'),JSON.stringify({passed,samples,completedAt:new Date().toISOString()},null,2));
  }finally{if(app)await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
