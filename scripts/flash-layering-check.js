'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 25000) {
  const end = Date.now() + timeout; let value;
  do { value = await read(); if (check(value)) return value; await wait(30); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(process.env.FLASHBORN_TEST_PROFILES || output, 'flash-layering-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = message => { passed.push(message); console.log('PASS ' + message); };
  const command = (action, args = {}) => app.evaluate(({}, value) => global.__flashborn.command(value.action, value.args), { action, args });
  const ready = () => poll(async () => { try { return await app.evaluate(() => global.__flashborn.activeTab().native?.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))')); } catch { return null; } }, n => n > 2);
  const settled = () => poll(() => app.evaluate(() => global.__flashborn.getState().tabPresentation), serial => !serial);
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); const ui = await app.firstWindow();
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 70, y: 70, width: 1250, height: 900 }); w.show(); w.focus(); });
    const ids = [];
    for (let i = 0; i < 2; i++) {
      if (i) await command('new-tab');
      await app.evaluate(({}, file) => global.__flashborn.openLocal(file, global.__flashborn.activeTab()), require('./html-fixture')(path.join(profile, 'movie' + i), require('./playback-fixture')));
      await ready(); await settled(); ids.push(await app.evaluate(() => global.__flashborn.activeTab().id));
    }
    await app.evaluate(({}, module) => {
      const user = process.mainModule.require(module).load('user32.dll');
      const next = user.func('intptr_t __stdcall GetWindow(intptr_t,uint32_t)'), visible = user.func('int __stdcall IsWindowVisible(intptr_t)'), foreground = user.func('intptr_t __stdcall GetForegroundWindow()');
      const gdi = process.mainModule.require(module).load('gdi32.dll');
      const createRegion = gdi.func('intptr_t __stdcall CreateRectRgn(int,int,int,int)'), contains = gdi.func('int __stdcall PtInRegion(intptr_t,int,int)');
      const getRegion = user.func('int __stdcall GetWindowRgn(intptr_t,intptr_t)'), rect = user.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)');
      const position = user.func('int __stdcall SetWindowPos(intptr_t,intptr_t,int,int,int,int,uint32_t)');
      global.forceLayerHost = after => position(Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE()), after, 0, 0, 0, 0, 0x0013);
      const fromPoint = user.func('intptr_t __stdcall WindowFromPoint(uint64_t)'), ancestor = user.func('intptr_t __stdcall GetAncestor(intptr_t,uint32_t)');
      const region = createRegion(0, 0, 0, 0); global.deleteLayerRegion = () => gdi.func('int __stdcall DeleteObject(intptr_t)')(region);
      global.dumpLayerRegion = () => {
        getRegion(Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE()), region);
        const data = gdi.func('uint32_t __stdcall GetRegionData(intptr_t,uint32_t,_Out_ void*)'), bytes = Buffer.alloc(data(region, 0, null)); data(region, bytes.length, bytes);
        return Array.from({ length: bytes.readUInt32LE(8) }, (_, i) => Array.from({ length: 4 }, (_, n) => bytes.readInt32LE(32 + i * 16 + n * 4)));
      };
      global.layerFrames = [];
      global.readLayers = () => {
        const api = global.__flashborn, host = Number(api.win.getNativeWindowHandle().readBigUInt64LE());
        const movies = api.tabs.filter(t => t.native?.hwnd).map(t => ({ id: t.id, hwnd: t.native.hwnd, preparing: t.native.preparing, retiring: t.native.retiring, readyVisible: t.native.readyVisible, opacity: t.native.presentedOpacity, above: t.native.above, lastVisible: t.native.lastVisible, wantedVisible: t.native.wantedVisible }));
        const popup = api.menuWindow && !api.menuWindow.isDestroyed() ? Number(api.menuWindow.getNativeWindowHandle().readBigUInt64LE()) : null;
        const handles = [host, popup, ...movies.map(t => t.hwnd)]; let top = host;
        for (let i = 0; i < 1024 && next(top, 3); i++) top = next(top, 3);
        const order = [];
        for (let h = top, i = 0; h && i < 1024; i++, h = next(h, 2)) if (handles.includes(h) && visible(h)) order.push(h);
        const surface=api.activeTab().native || api.tabs.find(t => t.native).native, hostRect=[0,0,0,0];rect(host,hostRect);
        const scale=process.mainModule.require('electron').screen.getDisplayMatching(api.win.getBounds()).scaleFactor,r=surface.viewport;
        const viewport=surface.wantedVisible ? surface.lastBounds : [hostRect[0]+Math.round(r.x*scale),hostRect[1]+Math.round(r.y*scale),Math.round(r.width*scale),Math.round(r.height*scale)];
        const kind = getRegion(host, region);
        const shellCovers = [[.01,.01],[.99,.01],[.5,.5],[.01,.99],[.99,.99]].map(([x,y]) => !kind || !!contains(region, Math.round(viewport[0] + viewport[2] * x - hostRect[0]), Math.round(viewport[1] + viewport[3] * y - hostRect[1])));
        // A shaped shell cannot draw over the movie even when Windows raises
        // its HWND. Read the actual OS region, not the application's intent.
        const painted = movies.filter(t => t.opacity === 1 && order.includes(t.hwnd) && (!shellCovers.some(Boolean) || order.indexOf(t.hwnd) < order.indexOf(host)));
        const x = Math.round(viewport[0] + viewport[2] / 2), y = Math.round(viewport[1] + viewport[3] / 2);
        const inputTarget = ancestor(fromPoint(BigInt(y >>> 0) * 0x100000000n + BigInt(x >>> 0)), 2);
        return { at: Date.now(), host, hostRect, viewport, foreground: foreground(), area: api.focusArea, backing:api.windowMotion?.active && api.windowMotion.id, backingTab:api.windowMotion?.native?.tabId, presentation: api.presentation && { serial: api.presentation.serial, swapping: api.presentation.swapping }, popup: popup && visible(popup) ? popup : null, active: api.activeTab().id, top: painted.sort((a,b) => order.indexOf(a.hwnd)-order.indexOf(b.hwnd))[0]?.id || null, order, movies, shellCovers, kind, inputTarget };
      };
      global.layerTimer = setInterval(() => { global.layerFrames.push(global.readLayers()); if (global.layerFrames.length > 2000) global.layerFrames.shift(); }, 1);
    }, path.join(root, 'node_modules', 'koffi'));
    const capture = () => app.evaluate(async ({ nativeImage }) => {
      const image = nativeImage.createFromBuffer(Buffer.from(await global.__flashborn.activeTab().native.screenshot(), 'base64'));
      const bytes = image.getBitmap(); let dark = 0, cream = 0;
      for (let i = 0; i < bytes.length; i += 4) { if (bytes[i] === 37 && bytes[i+1] === 32 && bytes[i+2] === 30) dark++; if (bytes[i] === 186 && bytes[i+1] === 214 && bytes[i+2] === 233) cream++; }
      return { dark, cream, pixels: bytes.length/4 };
    });
    const before = await capture(); assert.ok(before.dark > before.pixels * .5 && before.cream > 1000, 'The real Flash fixture must be painted, not just logically visible');
    for (let i = 0; i < 4; i++) {
      await app.evaluate(() => { global.layerFrames = []; global.__flashborn.win.focus(); });
      await ui.locator('#menu-button').click();
      await poll(() => app.evaluate(() => global.__flashborn.menuWindow?.isVisible()), Boolean); await wait(100);
      const frames = await app.evaluate(() => global.layerFrames.filter(frame => frame.popup));
      assert.ok(frames.length > 0);
      for (const frame of frames) {
        const movie = frame.movies.find(t => t.id === frame.active).hwnd;
        assert.ok(frame.order.indexOf(frame.popup) < frame.order.indexOf(movie) && frame.top === frame.active, 'Menu must stay above the painted Flash surface, which the shell must never obscure: ' + JSON.stringify(frame));
      }
      assert.deepEqual(await capture(), before, 'Opening a menu must not blank or replace the real Adobe movie frame');
      await ui.locator('#address').click(); await poll(() => app.evaluate(() => !global.__flashborn.menuWindow), Boolean);
      await ready(); assert.deepEqual(await capture(), before);
    }
    pass('Repeated menu opening and outside dismissal retain real Flash pixels with the menu above the movie and no shell covering it');
    await app.evaluate(() => {
      const api = global.__flashborn;
      global.savedLayerSync = api.tabs.filter(t => t.native).map(t => [t.native, t.native.syncWindow, t.native.raiseHostBehindFlash]);
      for (const [native] of global.savedLayerSync) { native.syncWindow = () => {}; native.raiseHostBehindFlash = () => false; }
      // Deliberately bypass every protection while exercising the old region
      // fallback, including the new guard against an activation-time raise.
      global.savedActivationCurrent=api.windowActivation?.current;
      if(api.windowActivation)api.windowActivation.current=()=>null;
      global.forceLayerHost(-1);
    });
    let raised;
    try { raised = await poll(() => app.evaluate(() => global.readLayers()), frame => frame.order[0] === frame.host, 3000); }
    finally { await app.evaluate(() => { global.forceLayerHost(-2); if(global.savedActivationCurrent)global.__flashborn.windowActivation.current=global.savedActivationCurrent; for (const [native, sync, raise] of global.savedLayerSync) { native.syncWindow = sync; native.raiseHostBehindFlash = raise; } }); }
    assert.equal(raised.order[0], raised.host, 'Exercise the actual activation race by raising the shell over its movie');
    assert.equal(raised.top, raised.active, 'Raising the shell must not cover any Flash pixels');
    assert.ok(raised.shellCovers.every(covered => !covered));
    assert.equal(raised.inputTarget, raised.movies.find(movie => movie.id === raised.active).hwnd, 'Windows must still route viewport mouse input to the live movie below the raised shell');
    pass('A deliberately raised browser shell cannot paint over Flash or intercept mouse input in its viewport');
    if (process.env.FLASHBORN_MANUAL_ACTIVATION === '1') {
      console.log('READY_FOR_WINDOWS_ACTIVATION ' + profile);
      await poll(() => fs.existsSync(path.join(profile, 'foreground-ready')), Boolean, 180000);
    }
    for (const id of [ids[0], ids[1], ids[0], ids[1], ids[0], ids[1]]) {
      // CDP pointer events do not perform Windows' physical mouse activation.
      // Activate the chrome input surface before sampling the tab click.
      await ui.locator('#address').click();
      await poll(() => app.evaluate(() => global.__flashborn.win.isFocused()), Boolean);
      const previous = await app.evaluate(() => global.__flashborn.activeTab().id);
      await poll(() => app.evaluate(() => global.readLayers().top), top => top === previous);
      await app.evaluate(() => { global.layerFrames = []; });
      await ui.locator(`[data-reorder-id="${id}"]`).click(); await settled(); await wait(70);
      const frames = await app.evaluate(() => global.layerFrames);
      fs.writeFileSync(path.join(output, 'flash-layering-trace.json'), JSON.stringify(frames, null, 2));
      assert.ok(frames.length > 0); let changed = false;
      for (const frame of frames) {
        assert.ok(frame.top, 'No Flash switch may expose the blank shell: ' + JSON.stringify(frame));
        if (frame.top === id) changed = true;
        if (changed) assert.equal(frame.top, id, 'The outgoing movie must never jump back above the incoming movie');
        else assert.equal(frame.top, previous);
      }
      assert.ok(changed); assert.deepEqual(await capture(), before);
    }
    pass('Flash tab switches present the next painted movie once, without blank shell frames or the previous movie jumping back');
    const pid = await app.evaluate(() => global.__flashborn.activeTab().native.child.pid);
    for (const [width, height] of [[980,650], [1360,900]]) {
      await app.evaluate(({}, bounds) => global.__flashborn.win.setSize(...bounds), [width, height]);
      await poll(() => app.evaluate(() => { const f = global.__flashborn, n = f.activeTab().native, r = n.inspect().rect, layers = global.readLayers(); return { presented: n.isPresented(), expected: n.lastBounds, viewport: n.viewport, outer: f.win.getBounds(), content: f.win.getContentBounds(), shape: f.windowRegion.key, physicalRegion: global.dumpLayerRegion(), actual: [r[0],r[1],r[2]-r[0],r[3]-r[1]], covers: layers.shellCovers, hostRect: layers.hostRect, sampledViewport: layers.viewport }; }), value => value.presented && value.expected.every((n, i) => n === value.actual[i]) && value.covers.every(covered => !covered), 6000);
      for (let i = 0; i < 2; i++) {
        await app.evaluate(() => { global.layerFrames = []; });
        const targetCollapsed = !await app.evaluate(() => global.__flashborn.getState().collapsed);
        await command('collapse');
        await poll(() => ui.evaluate(() => ({collapsed:document.body.classList.contains('collapsed'),animating:document.body.classList.contains('sidebar-animating')})),value=>value.collapsed===targetCollapsed && !value.animating);
        await poll(() => app.evaluate(() => global.readLayers()), value => value.shellCovers.every(covered => !covered) && value.top === value.active);
        const frames = await app.evaluate(() => global.layerFrames);
        fs.writeFileSync(path.join(output, 'sidebar-layering-trace.json'), JSON.stringify(frames, null, 2));
        assert.ok(frames.length>0);
        const gap=frames.find(frame => !(frame.top === frame.active || frame.backing && frame.backingTab === frame.active));
        assert.ok(!gap,'Sidebar motion must retain the active movie or its live compositor backing: '+JSON.stringify(gap));
      }
      await command('theme'); assert.ok((await app.evaluate(() => global.readLayers())).shellCovers.every(value => !value));
    }
    await command('fullscreen', { value: true });
    await poll(() => app.evaluate(() => global.__flashborn.getState().fullscreen && global.readLayers().shellCovers.every(value => !value)), Boolean);
    await command('fullscreen', { value: false });
    await poll(() => app.evaluate(() => !global.__flashborn.getState().fullscreen && global.readLayers().shellCovers.every(value => !value)), Boolean);
    assert.equal(await app.evaluate(() => global.__flashborn.activeTab().native.child.pid), pid);
    pass('Resize, sidebar animation, both themes and fullscreen preserve the live Flash surface and its runtime');
    const flashId = await app.evaluate(() => global.__flashborn.activeTab().id);
    await command('panel', { name: 'bookmarks' });
    await poll(() => app.evaluate(() => global.readLayers().shellCovers), covers => covers.every(Boolean));
    await command('select-tab', { id: flashId }); await settled(); await ready();
    const plain = path.join(profile, 'plain.html'); fs.writeFileSync(plain, '<title>Ordinary page</title><h1>Full page input</h1>');
    await command('new-tab'); await command('navigate', { value: plain }); await settled();
    await poll(() => app.evaluate(() => global.readLayers().shellCovers), covers => covers.every(Boolean));
    await command('new-flashcognito'); await settled(); await poll(() => app.evaluate(() => global.readLayers().shellCovers), covers => covers.every(Boolean));
    await command('select-tab', { id: flashId }); await settled(); await ready();
    await poll(() => app.evaluate(() => global.readLayers().shellCovers), covers => covers.every(value => !value));
    pass('Bookmarks, ordinary pages and private new tabs restore the complete drawable/input region; returning to Flash restores its viewport');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-flash-layering-results.json' : 'flash-layering-results.json'), JSON.stringify({ passed, before, profile }, null, 2));
  } finally { await app.evaluate(() => { clearInterval(global.layerTimer); global.deleteLayerRegion?.(); }).catch(() => {}); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
