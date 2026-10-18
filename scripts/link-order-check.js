'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,check,timeout=20000){let value;const end=Date.now()+timeout;do{value=await fn();if(check(value))return value;await wait(70);}while(Date.now()<end);throw Error('Timeout '+JSON.stringify(value));}
(async()=>{
  const profile=path.join(output,'link-order-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
  const server=http.createServer((req,res)=>{if(req.url==='/movie.swf'){res.setHeader('Content-Type','application/x-shockwave-flash');return res.end(require('./playback-fixture'));}res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Link opener fixture</title><a id="link" href="/child?from='+encodeURIComponent(req.url)+'" target="_blank">Open child</a>'+(req.url.startsWith('/flash')?'<embed src="/movie.swf" type="application/x-shockwave-flash" width="640" height="400">':''));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  let app;const passed=[],pass=message=>{passed.push(message);console.log('PASS '+message);};
  try{
    app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);await app.firstWindow();
    const command=(action,args={})=>app.evaluate(({},input)=>global.__flashborn.command(input.action,input.args),{action,args});const state=()=>app.evaluate(()=>global.__flashborn.getState());
    const click=async(opener,method='link')=>{
      const before=await state(),index=before.tabs.findIndex(t=>t.id===opener);
      await app.evaluate(async({Menu},args)=>{
        const tab=global.__flashborn.tabs.find(t=>t.id===args.opener);
        const code=args.method==='script'?'window.open("/script-child","_blank");true':'document.querySelector("#link").click();true';
        if(args.method==='context'){
          const original=Menu.buildFromTemplate;
          try{Menu.buildFromTemplate=items=>{const menu=original(items);menu.popup=()=>{global.linkMenu=menu;};return menu;};tab.view.webContents.emit('context-menu',{}, {linkURL:args.url+'/context-child',selectionText:'',isEditable:false});global.linkMenu.items.find(item=>item.label==='Open link in new tab').click();}
          finally{Menu.buildFromTemplate=original;}
        }else if(tab.native)await tab.native.evaluate(code);
        else await tab.view.webContents.executeJavaScript(code,true);
      },{opener,method,url});
      const after=await poll(state,s=>s.tabs.length===before.tabs.length+1);const child=after.tabs.find(t=>!before.tabs.some(old=>old.id===t.id));
      assert.equal(after.tabs[0].id,child.id);assert.equal(after.activeId,child.id);assert.equal(child.private,before.tabs[index].private);assert.deepEqual(after.tabs.filter(t=>t.id!==child.id).map(t=>t.id),before.tabs.map(t=>t.id));return child;
    };
    await command('navigate',{value:url+'/modern'});const opener=(await state()).activeId;for(let i=0;i<3;i++)await command('new-tab');await command('select-tab',{id:opener});
    await click(opener);await command('select-tab',{id:opener});await click(opener,'context');
    pass('Modern target-blank links and Open link in new tab insert at the top, preserving all other tab order');
    await click(opener,'script');pass('A scripted popup from an inactive tab uses that actual opener rather than the currently selected tab');
    await command('new-flashcognito');await command('navigate',{value:url+'/private'});const privateOpener=(await state()).activeId;for(let i=0;i<2;i++)await command('new-tab');await command('select-tab',{id:privateOpener});await click(privateOpener);
    pass('Private link tabs insert at the top and retain Flashcognito isolation');
    for(const [source,isPrivate] of [[opener,false],[privateOpener,true]]){
      await command('select-tab',{id:source});await command('navigate',{value:url+'/flash-'+(isPrivate?'private':'normal')});await poll(state,s=>s.tabs.find(t=>t.id===source).native&&!s.tabs.find(t=>t.id===source).loading);
      for(let i=0;i<2;i++)await command('new-tab');await command('select-tab',{id:source});const child=await click(source);assert.equal(child.native,true);
    }
    pass('Both ordinary and private native Flash pages open linked tabs at the top and retain their engine/session');
    assert.ok(JSON.parse(fs.readFileSync(path.join(profile,'browser.json'))).tabs.every(t=>!t.url?.includes('/private')&&!t.url?.includes('flash-private')));
    fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-link-order-results.json':'link-order-results.json'),JSON.stringify({passed,completedAt:new Date().toISOString()},null,2));
  }finally{if(app)await app.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
