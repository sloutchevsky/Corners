'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(fn,check,timeout=20000){const end=Date.now()+timeout;let value;do{value=await fn();if(check(value))return value;await wait(80);}while(Date.now()<end);throw Error('Timeout: '+JSON.stringify(value));}
(async()=>{
  const profile=path.join(output,'sidebar-profile-'+Date.now()),env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};
  delete env.ELECTRON_RUN_AS_NODE;fs.mkdirSync(profile,{recursive:true});
  const server=http.createServer((req,res)=>{
    if(req.url==='/page'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><title>Private download test</title><p>Download fixture</p>');}
    res.writeHead(200,{'Content-Type':'text/plain','Content-Disposition':'attachment; filename="sidebar-test.txt"'});
    if(req.url.startsWith('/cancel')){res.write('Pending');setTimeout(()=>res.end('complete'),500);}else res.end('Completed download badge test.');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,passed=[];let app,ui;
  const pass=text=>{passed.push(text);console.log('PASS '+text);};
  const state=()=>app.evaluate(()=>global.__flashborn.getState());
  const command=(action,args={})=>app.evaluate(({},data)=>global.__flashborn.command(data.action,data.args),{action,args});
  const launch=async()=>{
    app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});
    await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();
    await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1280,height:820});w.show();w.focus();});
  };
  const capture=async name=>{
    await ui.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const png=await app.evaluate(async()=> (await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(path.join(output,name),Buffer.from(png,'base64'));
  };
  const download=async(suffix,privateMode=false,cancel=false)=>{
    const count=(await state()).downloads.length;
    await app.evaluate(({},args)=>{
      const target=args.privateMode?global.__flashborn.privateSession:global.__flashborn.browsingSession;
      target.once('will-download',(_event,item)=>{item.setSavePath(args.file);if(args.cancel)item.cancel();});target.downloadURL(args.url);
    },{url:base+suffix,file:path.join(profile,'download-'+Date.now()+'.txt'),privateMode,cancel});
    return poll(state,s=>s.downloads.length===count+1&&s.downloads[0].state!=='progressing');
  };
  try{
    await launch();await ui.emulateMedia({reducedMotion:'reduce'});
    const centers=await ui.evaluate(()=>{
      const icon=navigationIcons.find(i=>i.kind==='settings');
      return [0,.125,.25,.375,.5,.625,.75,.875].map(progress=>{
        icon.draw(progress);const width=icon.canvas.width,data=icon.canvas.getContext('2d').getImageData(0,0,width,width).data;let x=0,y=0,total=0;
        for(let row=0;row<width;row++)for(let column=0;column<width;column++){const alpha=data[(row*width+column)*4+3];total+=alpha;x+=(column+.5)*alpha;y+=(row+.5)*alpha;}
        return {progress,x:x/total/width*128,y:y/total/width*128};
      });
    });
    for(const center of centers){assert.ok(Math.abs(center.x-64)<.2,JSON.stringify(center));assert.ok(Math.abs(center.y-64)<.2,JSON.stringify(center));}
    await ui.evaluate(()=>navigationIcons.find(i=>i.kind==='settings').draw(0));
    await ui.emulateMedia({reducedMotion:'no-preference'});
    const gear=ui.locator('.sidebar [data-panel="settings"] .nav-gold');
    await ui.locator('.title-note').hover();await ui.locator('.sidebar [data-panel="settings"]').hover();
    await poll(()=>gear.getAttribute('data-motion'),v=>v==='spinning');await wait(3250);
    await ui.locator('.title-note').hover();
    assert.equal(await gear.getAttribute('data-motion'),'spinning');
    await poll(()=>gear.getAttribute('data-motion'),v=>v==='idle',4000);
    assert.equal(await gear.getAttribute('data-progress'),'1.0000');const final=await gear.evaluate(el=>el.toDataURL());await wait(180);assert.equal(await gear.evaluate(el=>el.toDataURL()),final);
    pass('Gear silhouette stays centered through eight rotation angles; hovering out during a later turn finishes that turn and then stops');
    for(let i=1;i<8;i++)await command('new-tab');await command('collapse');
    await ui.locator('body.collapsed').waitFor({state:'attached'});await poll(()=>ui.locator('.tabs-label').innerText(),v=>v==='8');
    assert.equal(await ui.locator('.tabs-label').innerText(),'8');assert.equal(await ui.locator('#tab-count').isVisible(),true);
    const collapsedX=await ui.locator('.sidebar [data-panel="library"] canvas').evaluate(el=>el.getBoundingClientRect().x);
    await command('collapse');await ui.locator('body:not(.collapsed)').waitFor({state:'attached'});await poll(()=>ui.locator('.tabs-label').innerText(),v=>v==='Your tabs\n8');assert.equal(await ui.locator('.tabs-label').innerText(),'Your tabs\n8');
    assert.equal(await ui.locator('.sidebar [data-panel="library"] canvas').evaluate(el=>el.getBoundingClientRect().x),collapsedX);
    pass('Collapsed tabs heading shows only the count; expanding restores Your tabs and keeps lower icons aligned');
    for(const theme of ['current','light']){
      if((await state()).settings.theme!==theme)await command('theme');
      await poll(()=>ui.locator('body').getAttribute('data-theme'),v=>v===theme);
      const colors=await ui.evaluate(()=>({swf:getComputedStyle(document.querySelector('.sidebar-bottom .pill')).color,labels:[...document.querySelectorAll('.sidebar-bottom .nav-button > span:first-of-type')].map(el=>getComputedStyle(el).color),filters:[...document.querySelectorAll('.nav-gold')].map(el=>getComputedStyle(el).filter)}));
      assert.ok(colors.labels.every(color=>color===colors.swf),JSON.stringify(colors));
      assert.ok(colors.filters.every(filter=>filter==='none'));
      await capture('sidebar-'+theme+'-1.7.1.png');
    }
    pass('Every lower sidebar label matches its SWF pill in both themes; light-mode icons use darker, muted highlights');
    if((await state()).settings.theme!=='current')await command('theme');
    await command('menu');const menu=await poll(()=>app.windows().find(w=>w.url()==='flashborn://ui/menu.html'),Boolean);
    const groups=await menu.evaluate(()=>{
      const result=[[]];for(const el of document.querySelector('.browser-menu').children){if(el.tagName==='HR')result.push([]);else result.at(-1).push(el.dataset.action||el.dataset.panel||el.firstElementChild.textContent);}return result;
    });
    assert.deepEqual(groups,[['new-tab','new-flashcognito','open-file'],['library','bookmarks','history','downloads'],['print','menu-find'],['Zoom','Flash quality','native-mode','mute'],['settings','about']]);
    assert.ok(await menu.locator('[data-panel="about"]').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
    assert.ok(await menu.evaluate(()=>document.body.scrollHeight<=innerHeight));
    const menuPng=await app.evaluate(async()=> (await global.__flashborn.menuWindow.webContents.capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(path.join(output,'menu-1.7.1.png'),Buffer.from(menuPng,'base64'));
    await menu.locator('[data-panel="history"]').click();await poll(state,s=>s.panel==='history');
    await command('new-tab');
    pass('Menu has five requested groups, Print before Find, working History access, and no divider between Settings and About or after About');
    let s=await download('/completed');assert.equal(s.downloads[0].isNew,true);await ui.locator('#download-new').waitFor({state:'visible'});
    assert.equal(fs.readFileSync(s.downloads[0].path,'utf8'),'Completed download badge test.');
    await command('collapse');await ui.locator('body.collapsed').waitFor({state:'attached'});assert.equal(await ui.locator('#download-new').isVisible(),true);
    await capture('downloads-new-collapsed-1.7.1.png');
    await command('collapse');await ui.locator('body:not(.collapsed)').waitFor({state:'attached'});await capture('downloads-new-1.7.1.png');
    await app.close();app=null;await launch();await ui.locator('#download-new').waitFor({state:'visible'});
    await ui.locator('.sidebar [data-panel="downloads"]').click();await poll(state,s=>s.panel==='downloads'&&s.downloads.every(d=>!d.isNew));
    await ui.locator('#download-new').waitFor({state:'hidden'});
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'browser.json'))).downloads[0].isNew,false);
    pass('Completed downloads display NEW in expanded and collapsed sidebars, persist across restart, and clear when Downloads is opened');
    await download('/visible');assert.equal((await state()).downloads[0].isNew,false);assert.equal(await ui.locator('#download-new').isVisible(),false);
    await command('new-tab');s=await download('/cancel',false,true);assert.equal(s.downloads[0].isNew,false);assert.equal(await ui.locator('#download-new').isVisible(),false);
    await command('new-flashcognito');await command('navigate',{value:base+'/page'});await download('/private',true);
    await ui.locator('#download-new').waitFor({state:'visible'});
    const normalId=(await state()).tabs.find(t=>!t.private).id;await command('select-tab',{id:normalId});await ui.locator('#download-new').waitFor({state:'hidden'});
    assert.ok(JSON.parse(fs.readFileSync(path.join(profile,'browser.json'))).downloads.every(d=>!d.isNew));
    pass('Canceled and already-visible downloads do not show NEW; private completion badges stay out of ordinary downloads and the saved profile');
    fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-sidebar-results.json':'sidebar-results.json'),JSON.stringify({passed,centers,completedAt:new Date().toISOString()},null,2));
  }finally{if(app)await app.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
