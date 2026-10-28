'use strict';
const { _electron: electron } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const demo = require('./create-demo');
const pdfDemo = require('./create-pdf-demo');
const captureVisible = require('./capture-visible');
const root = path.join(__dirname, '..');
const output = path.join(root, 'test-output');
fs.mkdirSync(output, { recursive: true });

async function poll(fn, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let value;
  do { value = await fn(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 150)); } while (Date.now() < deadline);
  throw new Error('Timed out waiting for ' + JSON.stringify(value));
}

async function run() {
  const server = http.createServer((req, res) => {
    if (req.url === '/document.pdf' || req.url === '/pdf-mime') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(pdfDemo); return; }
    if (req.url === '/slow') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.write('<!doctype html><title>Loading test</title>'); setTimeout(() => res.end('<p>Complete</p>'), 900); return; }
    if (req.url === '/movie.swf' || req.url === '/mime-flash') { res.writeHead(200, { 'Content-Type': 'application/x-shockwave-flash' }); res.end(demo); return; }
    if (req.url === '/download') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="browser-test.txt"' }); res.end('Flashborn download verified.'); return; }
    if (req.url === '/broken') { res.writeHead(404); res.end('Missing'); return; }
    if(req.url==='/detector'){res.writeHead(200,{'Content-Type':'text/html'});res.end(`<html><head><title>Legacy detector</title><script src="/detect.js"></script></head><body></body></html>`);return;}
    if(req.url==='/detect.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(`var flashPage='/embed',maxVersion=9,requiredVersion=7;var p=navigator.plugins['Shockwave Flash'];var v=p?parseInt(p.description.charAt(p.description.indexOf('.')-1)):0;location.replace(v>=requiredVersion?flashPage:'/noflash.htm');`);return;}
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; object-src 'self'; frame-src 'self'" });
    if(req.url==='/frameset')res.end('<html><head><title>Flash frameset</title></head><frameset rows="*,0"><frame src="/embed"><frame src="/one"></frameset></html>');
    else if (req.url === '/embed') res.end('<!doctype html><html><head><title>Embedded Flash test</title></head><body style="background:#eee"><h1>Embedded Flash</h1><object type="application/x-shockwave-flash" data="/movie.swf" width="640" height="400"><param name="movie" value="/movie.swf"></object></body></html>');
    else res.end(`<!doctype html><html><head><title>${req.url === '/two' ? 'Second page' : 'First page'}</title></head><body><h1>${req.url === '/two' ? 'Second page' : 'First page'}</h1><p>Needle find test. Needle.</p><a href="/two" id="next">Next page</a><a href="/one" target="_blank" id="popup">New tab</a><a href="/download" id="download">Download file</a></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: path.join(output, 'profile-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const results = [];
  const addResult=results.push.bind(results); results.push=value=>{console.log('PASS '+value);return addResult(value);};
  try {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env, timeout: 45000 });
    app.process().stderr.on('data', data => fs.appendFileSync(path.join(output, 'electron.log'), data));
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    const saveUI = async filename => { await new Promise(resolve => setTimeout(resolve, 300)); const bytes = await app.evaluate(async () => (await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64')); fs.writeFileSync(path.join(output, filename), Buffer.from(bytes, 'base64')); };
    const command = (action, args = {}) => app.evaluate(({ }, { action, args }) => global.__flashborn.command(action, args), { action, args });
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const pageScript = code => app.evaluate(({ }, code) => {const t=global.__flashborn.activeTab(); return t.native ? t.native.evaluate(code) : t.view.webContents.executeJavaScript(code,true);}, code);
    const saveView = async filename => { await new Promise(resolve => setTimeout(resolve, 700)); const bytes = await app.evaluate(async () => {const t=global.__flashborn.activeTab();return t.native ? t.native.screenshot() : (await t.view.webContents.capturePage()).toPNG().toString('base64');}); fs.writeFileSync(path.join(output, filename), Buffer.from(bytes, 'base64')); };
    const wheel = (deltaY=120) => app.evaluate(async ({}, deltaY) => {
      const t=global.__flashborn.activeTab();
      if(t.native) await t.native.call('test-wheel',{deltaY,x:150,y:170});
      else {const wc=t.view.webContents;wc.focus();if(!wc.debugger.isAttached())wc.debugger.attach('1.3');await wc.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',x:450,y:300,deltaX:0,deltaY:-deltaY,modifiers:2});}
    },deltaY);
    const dragReorder = async (collection,id,targetId,position='before') => {
      const target=ui.locator(`[data-collection="${collection}"][data-reorder-id="${targetId}"]`);
      const height=await target.evaluate(el=>el.getBoundingClientRect().height);
      const source=ui.locator(`[data-collection="${collection}"][data-reorder-id="${id}"]`);
      const sourceHeight=await source.evaluate(el=>el.getBoundingClientRect().height);
      await source.dragTo(target,{sourcePosition:{x:24,y:sourceHeight/2},targetPosition:{x:24,y:position==='before'?3:height-3}});
      await poll(state,s=>{const items=s[collection],a=items.findIndex(item=>item.id===id),b=items.findIndex(item=>item.id===targetId);return position==='before'?a<b:a>b;});
    };
    const pdfRendered = () => app.evaluate(async () => {
      const wc=global.__flashborn.activeTab().view.webContents,image=await wc.capturePage(),pixels=image.toBitmap();let blue=0;
      for(let i=0;i<pixels.length;i+=4) if(pixels[i]>150&&pixels[i+1]>70&&pixels[i+1]<150&&pixels[i+2]<60) blue++;
      return {blue,frames:wc.mainFrame.framesInSubtree.map(frame=>frame.url)};
    });
    await app.evaluate(() => {const w=global.__flashborn.win;w.setBounds({x:80,y:80,width:1280,height:820});w.show();w.focus();});

    await ui.locator('.home h1').waitFor();
    await saveUI('home.png');
    assert.equal((await state()).tabs.length, 1);
    assert.equal((await state()).flashReady, true);
    results.push('Desktop shell and bundled native Adobe Flash load');
    const sidebarPositions = () => ui.evaluate(() => ({ settings:document.querySelector('.nav-button[data-panel="support"] .nav-gold').getBoundingClientRect().x, selection:document.querySelector('.tab.active').getBoundingClientRect().x, newTab:document.querySelector('.new-tab').getBoundingClientRect().x }));
    const expanded = await sidebarPositions();
    await command('collapse');
    assert.deepEqual(await sidebarPositions(), expanded);
    await command('collapse');
    assert.equal(await ui.locator('.brand-dot').count(), 0);
    assert.ok(await ui.locator('.sidebar-wordmark').evaluate(el => getComputedStyle(el).maskImage.includes('wordmark.svg')));
    assert.equal(await ui.locator('.sidebar-wordmark').evaluate(el=>el.getBoundingClientRect().height),11);
    assert.ok(await ui.locator('.title-brand').evaluate(el=>getComputedStyle(el).fontFamily.includes('Segoe UI')));
    results.push('Helvetica logo outlines render without periods; sidebar icon and selection left edges stay fixed');
    await ui.locator('#theme-button').click();
    await poll(state,s=>s.settings.theme==='light');
    assert.equal(await ui.locator('body').getAttribute('data-theme'),'light');
    assert.equal(await ui.locator('#theme-icon').evaluate(el=>el.style.transform),'rotate(180deg)');
    await saveUI('home-light.png');
    for(const [theme,highContrast,angle] of [['light',false,270],['current',true,360],['current',false,450]]){
      await ui.locator('#theme-button').click();
      await poll(state,s=>s.settings.theme===theme&&s.settings.highContrast===highContrast);
      assert.equal(await ui.locator('#theme-icon').evaluate(el=>el.style.transform),'rotate('+angle+'deg)');
    }
    results.push('Theme button cycles white, light grey, black and dark grey with clockwise quarter turns');
    assert.equal(await ui.locator('.nav-button[data-panel="about"]').count(), 0);
    assert.equal(await ui.locator('.profile').count(), 0);
    await ui.locator('.sidebar-wordmark').click();
    await poll(state,s=>s.panel==='about');
    const aboutAngle = await ui.locator('#about-bolt').getAttribute('data-angle');
    await new Promise(resolve=>setTimeout(resolve,300));
    assert.notEqual(await ui.locator('#about-bolt').getAttribute('data-angle'),aboutAngle);
    assert.ok(await ui.locator('.about-copyright').innerText().then(text=>text.includes('2026 Vas Sloutchevsky')));
    assert.equal(await ui.locator('.about-copyright').getAttribute('href'), 'https://www.sloutchevsky.com/');
    const copyrightStyle = await ui.locator('.about-copyright').evaluate(el => ({ color:getComputedStyle(el).color, decoration:getComputedStyle(el).textDecoration }));
    await ui.locator('.about-copyright').hover();
    assert.deepEqual(await ui.locator('.about-copyright').evaluate(el => ({ color:getComputedStyle(el).color, decoration:getComputedStyle(el).textDecoration })), copyrightStyle);
    await ui.locator('.about-license summary').click();
    await saveUI('about.png');
    await command('panel',{name:null});
    results.push('About has a larger continuously spinning bolt, copyright and complete MIT license');
    results.push('Bottom About button is removed; logo opens About and copyright link has no hover change');
    await command('navigate',{value:base+'/slow'});
    await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId)?.loading);
    await poll(()=>ui.locator('#loading-bolt').getAttribute('data-motion'),motion=>motion==='finishing',1500);
    const boltOffset = await ui.locator('#loading-bolt').evaluate(canvas => {
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let left=canvas.width,right=0;
      for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) if(pixels[(y*canvas.width+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);}
      const rect=canvas.getBoundingClientRect(),button=canvas.parentElement.getBoundingClientRect();
      return rect.x+(left+right+1)/2/canvas.width*rect.width-(button.x+button.width/2);
    });
    assert.ok(Math.abs(boltOffset)<0.6,'Animated bolt must stay horizontally centered in its button');
    await poll(()=>ui.locator('#loading-bolt').getAttribute('data-motion'),motion=>motion==='idle',4000);
    assert.equal(await ui.locator('#loading-bolt').getAttribute('data-angle'),'0.0000');
    results.push('Loading bolt continues through the current complete turn and stops facing forward');

    await ui.locator('#address').fill(base + '/one');
    await ui.locator('#address').press('Enter');
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.title === 'First page');
    assert.equal(await pageScript('typeof require'), 'undefined');
    assert.equal(await pageScript('typeof process'), 'undefined');
    assert.equal(await pageScript('typeof window.browser'), 'undefined');
    results.push('Address bar Enter navigates; web pages have no Node or browser IPC access');
    await ui.locator('#address').fill(base+'/two');
    await ui.locator('#address-go').click();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.title==='Second page');
    await command('back');
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.title==='First page');
    results.push('Address bar Go button navigates the typed URL');

    await pageScript('document.getElementById("next").click()');
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.title === 'Second page');
    await command('back');
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.title === 'First page');
    await command('forward');
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.title === 'Second page');
    await command('reload');
    await poll(state, s => !s.tabs.find(t => t.id === s.activeId)?.loading);
    results.push('Links, back, forward and reload work');

    await command('bookmark');
    assert.equal((await state()).bookmarks.length, 1);
    await command('panel', { name: 'bookmarks' });
    await ui.locator('.item-title').filter({ hasText: 'Second page' }).waitFor();
    await command('panel', { name: 'history' });
    assert.ok((await state()).history.length >= 2);
    await command('panel', { name: null });
    await command('zoom', { direction: 1 });
    assert.ok((await state()).tabs[0].zoom >= 110);
    await command('zoom', { direction: 0 });
    results.push('Bookmarks, history, panels and page zoom work');
    await wheel();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom===110);
    const zoomBubble=await poll(()=>app.windows().find(page=>page.url()==='flashborn://ui/zoom.html'),Boolean);
    await poll(()=>zoomBubble.locator('#zoom-level').innerText(),text=>text==='110%');
    await wheel(-120);
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom===100);
    await zoomBubble.locator('[data-zoom="1"]').click();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom===110);
    await zoomBubble.locator('[data-zoom="0"]').click();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom===100);
    await poll(()=>app.evaluate(()=>!!global.__flashborn.zoomWindow),open=>!open,5000);
    results.push('Ctrl+wheel changes browser zoom and shows a Chrome-style minus/percentage/plus/Reset popup that dismisses');

    await pageScript('document.getElementById("popup").click()');
    await poll(state, s => s.tabs.length === 2 && s.tabs.find(t => t.id === s.activeId)?.title === 'First page');
    const beforeReorder=await state(),firstId=beforeReorder.tabs[0].id,secondId=beforeReorder.tabs[1].id;
    await dragReorder('tabs',secondId,firstId);
    assert.equal((await state()).tabs[0].id,secondId);assert.equal((await state()).activeId,secondId);
    await ui.locator(`[data-tab="${secondId}"]`).press('Alt+ArrowDown');
    await poll(state,s=>s.tabs[1].id===secondId);
    results.push('Tabs reorder by dragging and Alt+arrow keys while retaining the active page');
    await command('close-tab', { id: (await state()).activeId });
    assert.equal((await state()).tabs.length, 1);
    results.push('Popup links become tabs; tabs switch and close');

    const found = await app.evaluate(async () => {
      const wc = global.__flashborn.activeTab().view.webContents;
      const result = new Promise(resolve => wc.once('found-in-page', (_event, result) => resolve(result)));
      wc.findInPage('Needle'); return result;
    });
    assert.equal(found.matches, 2);
    results.push('Find in page reports the correct matches');
    await app.evaluate(()=>global.__flashborn.win.webContents.send('browser:find',{open:true}));
    for(const selector of Array.from({length:5},()=>['#address','#find-input']).flat()) {
      await ui.locator(selector).fill('Field editing test');await ui.locator(selector).click({button:'right'});
      // Native popup creation is asynchronous; do not cancel it during setup.
      await new Promise(resolve=>setTimeout(resolve,300));
      const labels=await app.evaluate(()=>global.__flashborn.editMenu.items.filter(item=>item.type!=='separator').map(item=>item.label));
      assert.deepEqual(labels,['Select all','Cut','Copy','Paste']);
      // End Windows popup tracking before invoking the action through the test harness.
      await app.evaluate(()=>{const b=global.__flashborn;global.__testEditAction=b.editMenu.items.find(item=>item.label==='Select all').click;b.editMenu.closePopup(b.win);});
      await poll(()=>app.evaluate(()=>!!global.__flashborn.editMenu),open=>!open);
      await app.evaluate(()=>{global.__flashborn.win.webContents.focus();global.__testEditAction();delete global.__testEditAction;});
      await poll(()=>ui.locator(selector).evaluate(el=>el.selectionEnd-el.selectionStart),n=>n==='Field editing test'.length);
    }
    await ui.locator('#find-close').click();
    results.push('Address and find fields have native Select all, Cut, Copy and Paste menus; Select all works');

    const downloadPath = path.join(output, 'browser-test-' + Date.now() + '.txt');
    await app.evaluate(({ }, filename) => { global.__flashborn.browsingSession.once('will-download', (_event, item) => item.setSavePath(filename)); }, downloadPath);
    await pageScript('document.getElementById("download").click()');
    await poll(state, s => s.downloads.some(d => d.state === 'completed'));
    assert.equal(fs.readFileSync(downloadPath, 'utf8'), 'Flashborn download verified.');
    results.push('Download saves the exact file and records completion');
    const secondDownload=path.join(output,'second-download-'+Date.now()+'.txt');
    await app.evaluate(({},filename)=>{global.__flashborn.browsingSession.once('will-download',(_event,item)=>item.setSavePath(filename));},secondDownload);
    await pageScript('document.getElementById("download").click()');
    await poll(state,s=>s.downloads.length===2&&s.downloads.every(d=>d.state==='completed'));
    await command('panel',{name:'downloads'});
    const downloads=(await state()).downloads;
    await dragReorder('downloads',downloads[1].id,downloads[0].id);
    assert.equal((await state()).downloads[0].path,downloadPath);
    const persistedDownloads=JSON.parse(fs.readFileSync(path.join(env.FLASHBORN_PROFILE,'browser.json'))).downloads;
    assert.equal(persistedDownloads[0].id,downloads[1].id);
    results.push('Downloads reorder by dragging and the saved order retains paths and completion records');
    await command('panel',{name:null});

    const downloadsBeforePDF=(await state()).downloads.length;
    await command('navigate',{value:base+'/document.pdf'});
    await poll(pdfRendered,result=>result.blue>2000,30000);
    await saveView('pdf-online.png');
    assert.equal((await state()).downloads.length,downloadsBeforePDF);
    await command('navigate',{value:base+'/pdf-mime'});
    await poll(pdfRendered,result=>result.blue>2000,30000);
    const pdfPath=path.join(output,'Flashborn-Test.pdf');fs.writeFileSync(pdfPath,pdfDemo);
    await command('navigate',{value:pdfPath});
    await poll(pdfRendered,result=>result.blue>2000,30000);
    await saveView('pdf-local.png');
    const localPDFState=await state();assert.equal(localPDFState.tabs.find(t=>t.id===localPDFState.activeId).kind,'pdf');
    const pdfZoomBefore=localPDFState.tabs.find(t=>t.id===localPDFState.activeId).zoom;
    await wheel();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom!==pdfZoomBefore);
    await poll(()=>app.evaluate(()=>!!global.__flashborn.zoomWindow),Boolean);
    results.push('Ctrl+wheel inside PDF pages retains the viewer zoom and displays the browser zoom popup');
    assert.equal(await pageScript('typeof require'),'undefined');
    const routeAccess=await app.evaluate(async()=>{const r=await global.__flashborn.browsingSession.fetch('flashborn://document/unknown/file.pdf');return r.status;});
    assert.equal(routeAccess,404);
    results.push('Online PDF URLs, PDF MIME responses and local PDFs display real rendered pages without downloading');
    await command('navigate',{value:base+'/one'});

    await command('navigate', { value: 'javascript:alert(1)' }).then(() => assert.fail('Scheme should be rejected'), () => {});
    results.push('Executable navigation schemes are rejected');

    const firstHTML = require('./html-fixture')(path.join(output,'smoke-html-first'));
    await command('add-library-source', {kind:'html',value:firstHTML});
    await poll(() => pageScript('document.getElementById("flash-movie")?.GetVariable("$version")'), value => value === ('WIN ' + require('../src/legacy/runtime.json').version.replaceAll('.', ',')));
    assert.equal(await pageScript('typeof require'),'undefined');
    assert.equal(await pageScript('typeof process'),'undefined');
    const initialFrame=await pageScript('document.getElementById("flash-movie").CurrentFrame()');
    await poll(()=>pageScript('document.getElementById("flash-movie").CurrentFrame()'),n=>n!==initialFrame);
    await command('mute'); const muted = await state(); assert.equal(muted.tabs.find(t=>t.id===muted.activeId).muted,true);
    assert.equal((await state()).library.length, 1);
    results.push('Local HTML embeds execute genuine Adobe frames without exposing Node; library records HTML pages');

    const flashId=(await state()).activeId;
    await wheel();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom===110);
    await poll(() => app.evaluate(() => global.__flashborn.zoomWindow?.isVisible() && global.__flashborn.zoomWindow.isAlwaysOnTop()), Boolean);
    await command('zoom',{direction:0});
    results.push('Ctrl+wheel also zooms genuine Flash content and its zoom popup stays above the native player');
    const secondMovie=require('./html-fixture')(path.join(output,'smoke-html-second'));
    await app.evaluate(async({},filename)=>global.__flashborn.command("add-library-source",{kind:"html",value:filename}),secondMovie);
    await poll(()=>pageScript('document.getElementById("flash-movie")?.GetVariable("$version")'),value=>value===('WIN ' + require('../src/legacy/runtime.json').version.replaceAll('.', ',')),60000);
    const secondFlashId=(await state()).activeId;
    await command('panel',{name:'library'});
    const library=(await state()).library;
    await dragReorder('library',library[1].id,library[0].id);
    assert.equal((await state()).library[0].path,firstHTML);
    const persistedLibrary=JSON.parse(fs.readFileSync(path.join(env.FLASHBORN_PROFILE,'browser.json'))).library;
    assert.equal(persistedLibrary[0].id,library[1].id);
    await command('close-tab',{id:secondFlashId});await command('select-tab',{id:flashId});
    results.push('Flash library reorders by dragging and persists the selected order without changing files');
    await new Promise(r=>setTimeout(r,400));
    let visible=await captureVisible(app);
    fs.writeFileSync(path.join(output,'stacking-smoke-diagnostic.png'),Buffer.from(visible.png,'base64'));
    if (visible.creamPixels <= 1000) console.log('STACKING', await app.evaluate(({}, mod) => {const b=global.__flashborn,n=b.activeTab().native,k=process.mainModule.require(mod).load('user32.dll'),f=k.func('intptr_t __stdcall GetForegroundWindow()'),st=k.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t,int)');return {tab:b.getState().tabs.find(t=>t.id===b.getState().activeId),panel:b.getState().panel,viewport:n.viewport,wanted:n.wantedVisible,last:n.lastVisible,fg:f(),top:n.lastTopmost,style:st(n.hwnd,-20),native:n.inspect()};},path.join(root,'node_modules','koffi')));
    assert.ok(visible.creamPixels>1000,'Flash square must be visible on the physical display, not just an offscreen render');
    fs.writeFileSync(path.join(output,'visible-flash.png'),Buffer.from(visible.png,'base64'));
    await command('new-tab');await new Promise(r=>setTimeout(r,400));
    visible=await captureVisible(app);assert.ok(visible.creamPixels<500,'Inactive native tab must be hidden');
    await command('select-tab',{id:flashId});await new Promise(r=>setTimeout(r,400));
    visible=await captureVisible(app);assert.ok(visible.creamPixels>1000,'Flash must become visible when its tab is selected again');
    results.push('Flash pixels are visible on screen and remain correct when switching tabs');

    await ui.locator('#menu-button').click();
    await poll(state,s=>s.menuOpen);
    const nativeMenu=await app.evaluate(()=>({popup:global.__flashborn.menuWindow.isAlwaysOnTop(),flashWindow:global.__flashborn.activeTab().native.hwnd}));
    assert.ok(nativeMenu.flashWindow);
    assert.ok(nativeMenu.popup);
    const menu = await poll(()=>app.windows().find(page=>page.url()==='flashborn://ui/menu.html'),Boolean);
    await menu.locator('#zoom-in').waitFor();
    await menu.locator('#zoom-in').click();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom===110);
    await menu.locator('#zoom-in').click();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom===125);
    assert.equal(await menu.locator('#zoom-reset').innerText(),'125%');
    await menu.locator('#zoom-reset').click();
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.zoom===100);
    await menu.locator('[data-quality="low"]').click();
    await poll(()=>pageScript('document.getElementById("flash-movie").TGetProperty("/",19)'),q=>q==='LOW');
    assert.equal((await state()).settings.flashQuality,'low');
    await menu.locator('[data-quality="high"]').click();
    await poll(()=>pageScript('document.getElementById("flash-movie").TGetProperty("/",19)'),q=>q==='HIGH');
    await new Promise(r=>setTimeout(r,250));const menuCapture=await captureVisible(app);fs.writeFileSync(path.join(output,'visible-flash-menu.png'),Buffer.from(menuCapture.png,'base64'));
    if (!menu.isClosed()) {
      try { await menu.keyboard.press('Escape'); }
      catch(error) { if((await state()).menuOpen) throw error; }
    }
    await poll(state,s=>!s.menuOpen);
    results.push('Menu stays above Flash; inline Chrome zoom steps and genuine Adobe High/Low quality controls work');

    await ui.locator('#address').fill(base+'/one');
    await ui.locator('#address').press('Enter');
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.title==='First page'&&!s.tabs.find(t=>t.id===s.activeId)?.native);
    results.push('Address bar Enter works with Flash active and returns ordinary URLs to modern Chromium');

    await assert.rejects(command('navigate', { value: base + '/movie.swf' }), /Standalone SWF playback has been removed/);
    await command('navigate', { value: base + '/mime-flash' });
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.error?.includes('Standalone SWF playback has been removed'));
    results.push('Direct SWF URLs and main-frame Flash MIME responses cannot launch a standalone player');

    await command('navigate', { value: base + '/embed' });
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.native);
    await poll(() => pageScript('document.querySelector("object")?.PercentLoaded?.()'), s => s===100, 60000);
    assert.equal(await pageScript('document.querySelector("object").GetVariable("$version")'),('WIN ' + require('../src/legacy/runtime.json').version.replaceAll('.', ',')));
    await saveView('embedded-flash.png');
    results.push('Embedded Flash website automatically loads the native Adobe plugin under a website CSP');
    await command('native-mode');
    await poll(state,s=>!s.tabs.find(t=>t.id===s.activeId)?.native);
    await new Promise(resolve=>setTimeout(resolve,500));
    const modernState=await state(); assert.ok(!modernState.tabs.find(t=>t.id===modernState.activeId)?.native);
    await command('native-mode');
    await poll(()=>pageScript('document.querySelector("object")?.PercentLoaded?.()'),s=>s===100);
    results.push('Native Flash mode can be switched off and back on');

    await command('navigate',{value:base+'/frameset'});
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.native);
    await poll(()=>pageScript('frames[0].document.querySelector("object")?.PercentLoaded?.()'),s=>s===100);
    results.push('Flash in a frameset is detected automatically');
    await command('navigate',{value:base+'/detector'});
    await poll(state,s=>s.tabs.find(t=>t.id===s.activeId)?.native&&s.tabs.find(t=>t.id===s.activeId)?.url.endsWith('/embed'));
    await poll(()=>pageScript('document.querySelector("object")?.PercentLoaded?.()'),s=>s===100);
    results.push('Classic single-digit Flash detectors recover their real Flash page');

    await command('panel', { name: 'library' });
    await saveUI('library.png');
    await command('panel', { name: 'settings' });
    await saveUI('settings.png');
    await command('collapse');
    assert.ok(await ui.locator('body').evaluate(el => el.classList.contains('collapsed')));
    const denied = await ui.evaluate(async () => await window.browser.call('not-a-command'));
    assert.equal(denied.ok, false);
    results.push('Sidebar and settings render; invalid IPC actions are rejected');

    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-results.json' : 'smoke-results.json'), JSON.stringify({ passed: results, completedAt: new Date().toISOString() }, null, 2));
    console.log('Completed '+results.length+' browser checks.');
  } catch (e) {
    console.error('Smoke test failed:', e);
    console.log(results.map(r => 'PASS ' + r).join('\n'));
    throw e;
  } finally { if (app) await app.close(); server.close(); }
}
run().catch(() => { process.exitCode = 1; });
