const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'Corners-groove-check-'));fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{restoreTabs:false,adBlockEnabled:false}}));
 const server=http.createServer((req,res)=>res.end('<body style="margin:0"><div style="width:4000px;height:5000px;background:#6688aa">Scrollbar groove test</div>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:require('electron'),args:[root],env});
 try{
  await app.firstWindow();for(let i=0;i<200&&!(await app.evaluate(()=>!!global.__flashborn));i++)await wait(30);
  await app.evaluate(async({BrowserWindow,app},url)=>{global.__backdrop=new BrowserWindow({x:80,y:50,width:1500,height:1100,frame:false,focusable:false,skipTaskbar:true,backgroundColor:'#eef5ff',webPreferences:{sandbox:true}});await global.__backdrop.loadURL('data:text/html,<style>html{background:%23eef5ff}</style><title>Owned groove check backdrop</title>');global.__backdrop.showInactive();const f=global.__flashborn;f.win.setBounds({x:180,y:120,width:1250,height:850});await f.command('navigate',{value:url});f.win.show();f.win.focus();app.focus({steal:true});f.win.setTitle('Corners scrollbar groove check');},'http://127.0.0.1:'+server.address().port);
  for(let i=0;i<200;i++){if(await app.evaluate(()=>global.__flashborn.edgeScrollbars.bars.every(b=>b.visible)))break;await wait(30);}await wait(200);
  if(process.env.CORNERS_GROOVE_MANUAL){const go=path.join(root,'test-output/clear-frame/groove-go');fs.rmSync(go,{force:true});fs.writeFileSync(path.join(root,'test-output/clear-frame/groove-ready.json'),JSON.stringify(await app.evaluate(()=>({pid:process.pid,hwnd:Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE())})),null,2));console.log('READY for focused groove check');while(!fs.existsSync(go))await wait(100);}
  const report=[];
  for(const [darkTheme,highContrast]of [[true,false],[true,true],[false,true],[false,false]]){
   await app.evaluate(async({},settings)=>{const f=global.__flashborn;await f.command('settings',settings);global.__backdrop.moveTop();f.win.moveTop();f.win.focus();},{darkTheme,highContrast});
   await app.evaluate(async()=>{const s=global.__flashborn.edgeScrollbars;for(const axis of ['vertical','horizontal'])await s.scroll(s.bars.find(b=>b.axis===axis),'absolute',0);});await wait(160);
   const readPixels=()=>app.evaluate(async({screen},module)=>{
    const k=process.mainModule.require(module),u=k.load('user32.dll'),gd=k.load('gdi32.dll'),getDC=u.func('intptr_t __stdcall GetDC(intptr_t)'),release=u.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'),pixel=gd.func('uint32_t __stdcall GetPixel(intptr_t,int,int)'),origin=u.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)'),at=u.func('intptr_t __stdcall WindowFromPoint(uint64_t)'),ancestor=u.func('intptr_t __stdcall GetAncestor(intptr_t,uint32_t)'),f=global.__flashborn,h=Number(f.win.getNativeWindowHandle().readBigUInt64LE()),back=Number(global.__backdrop.getNativeWindowHandle().readBigUInt64LE()),scale=screen.getDisplayMatching(f.win.getBounds()).scaleFactor,p=[0,0];origin(h,p);const create=gd.func('intptr_t __stdcall CreateRectRgn(int,int,int,int)'),get=u.func('int __stdcall GetWindowRgn(intptr_t,intptr_t)'),contains=gd.func('int __stdcall PtInRegion(intptr_t,int,int)'),remove=gd.func('int __stdcall DeleteObject(intptr_t)'),shape=create(0,0,0,0);get(h,shape);const dc=getDC(0);
    try{const bars=[];for(const b of f.edgeScrollbars.bars){const x=b.rect.x+(b.axis==='vertical'?7:b.rect.width*.9),y=b.rect.y+(b.axis==='vertical'?b.rect.height*.9:7),sx=p[0]+Math.round(x*scale),sy=p[1]+Math.round(y*scale),rgb=pixel(dc,sx,sy),owner=Number(ancestor(at((BigInt(sy>>>0)<<32n)|BigInt(sx>>>0)),2));bars.push({axis:b.axis,inRegion:!!contains(shape,Math.round(x*scale),Math.round(y*scale)),host:f.win.getBounds(),origin:p,scale,handles:{host:h,back,owner},visible:f.win.isVisible(),focused:f.win.isFocused(),rect:b.rect,point:{x,y},rgb:[rgb&255,rgb>>>8&255,rgb>>>16&255],owned:owner===h,backdrop:owner===back,css:await b.view.webContents.executeJavaScript('getComputedStyle(document.body).backgroundColor')});}return bars;}finally{release(0,dc);remove(shape);}
   },path.join(root,'node_modules/koffi'));
   const visible=await readPixels();
   const keys=await app.evaluate(async()=>{const keys=[];for(const b of global.__flashborn.edgeScrollbars.bars)keys.push(await b.view.webContents.insertCSS('html,body{background:transparent!important}'));return keys;});await wait(120);
   const clear=await readPixels();
   await app.evaluate(async({},keys)=>{const bars=global.__flashborn.edgeScrollbars.bars;for(let i=0;i<bars.length;i++)await bars[i].view.webContents.removeInsertedCSS(keys[i]);},keys);await wait(120);
   const result=await readPixels();
   fs.writeFileSync(path.join(root,'test-output/clear-frame/groove-last-probe.json'),JSON.stringify({darkTheme,highContrast,visible,clear,restored:result},null,2));
   for(let i=0;i<result.length;i++){const b=result[i],reference=clear[i];assert.ok(b.rgb.every((n,j)=>Math.abs(n-reference.rgb[j])<=2),'Groove differs visibly from the fully transparent reference: '+JSON.stringify({b,reference}));assert.equal(b.owned,true,'Groove passes clicks to another window: '+b.axis);assert.equal(b.css,'rgba(128, 128, 128, 0.004)');}
   const clicks=[];
   for(const axis of ['vertical','horizontal']){
    const click=await app.evaluate(async({},axis)=>{const s=global.__flashborn.edgeScrollbars,b=s.bars.find(b=>b.axis===axis),key=axis==='vertical'?'scrollTop':'scrollLeft',before=s.state[key],p=axis==='vertical'?{x:7,y:b.length*.9}:{x:b.length*.9,y:7};for(const type of ['mouseDown','mouseUp'])b.view.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});return {before,key};},axis);
    let after=click.before;for(let i=0;i<80&&after<=click.before;i++){await wait(20);after=await app.evaluate(({},key)=>global.__flashborn.edgeScrollbars.state[key],click.key);}assert.ok(after>click.before,'Clicking the groove failed to advance '+axis);
    await app.evaluate(async({},axis)=>{const s=global.__flashborn.edgeScrollbars,b=s.bars.find(b=>b.axis===axis);await s.scroll(b,'absolute',s.state[axis==='vertical'?'scrollHeight':'scrollWidth']*.5);},axis);await wait(60);
    const mid=await app.evaluate(({},key)=>global.__flashborn.edgeScrollbars.state[key],click.key);
    await app.evaluate(({},axis)=>{const b=global.__flashborn.edgeScrollbars.bars.find(b=>b.axis===axis),p=axis==='vertical'?{x:7,y:1}:{x:1,y:7};for(const type of ['mouseDown','mouseUp'])b.view.webContents.sendInputEvent({type,...p,button:'left',clickCount:1});},axis);
    let back=mid;for(let i=0;i<80&&back>=mid;i++){await wait(20);back=await app.evaluate(({},key)=>global.__flashborn.edgeScrollbars.state[key],click.key);}assert.ok(back<mid,'Clicking before the thumb failed to reverse '+axis);clicks.push({axis,before:click.before,advanced:after,mid,reversed:back});
   }
   report.push({darkTheme,highContrast,bars:result,fullyClearReference:clear,clicks});
  }
  fs.writeFileSync(path.join(root,'test-output/clear-frame/groove-probe.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(r=>({darkTheme:r.darkTheme,highContrast:r.highContrast,clicks:r.clicks,colorDifference:r.bars.map((b,i)=>({axis:b.axis,maxChannelDifference:Math.max(...b.rgb.map((n,j)=>Math.abs(n-r.fullyClearReference[i].rgb[j]))),owned:b.owned}))}))));
 }finally{await app.close();server.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
