'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output'), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check) {
  const until = Date.now() + 25000; let value;
  do { value = await read(); if (check(value)) return value; await wait(60); } while (Date.now() < until);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'window-border-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], samples = [];
  const command = (action, args = {}) => app.evaluate(({}, input) => global.__flashborn.command(input.action, input.args), { action, args });
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); const ui = await app.firstWindow();
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = global.__flashborn.win;
      // Sample only our test window's margins over its own uniform backdrop.
      global.__borderBackdrop = new BrowserWindow({ x:10, y:10, width:1450, height:1050, show:false, webPreferences:{sandbox:true} });
      await global.__borderBackdrop.loadURL('data:text/html,<style>html{background:rgb(221,107,179)}</style><title>Owned border test backdrop</title>');
      global.__borderBackdrop.show(); w.setBounds({ x:80, y:80, width:1250, height:850 }); w.show(); w.focus();
    });
    await app.evaluate(({}, module) => {
      const koffi = process.mainModule.require(module), user = koffi.load('user32.dll'), gdi = koffi.load('gdi32.dll'), f = global.__flashborn, h = Number(f.win.getNativeWindowHandle().readBigUInt64LE());
      const rect = user.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'), client = user.func('int __stdcall GetClientRect(intptr_t,_Out_ int32_t*)'), origin = user.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)');
      const dc = user.func('intptr_t __stdcall GetDC(intptr_t)'), release = user.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'), pixel = gdi.func('uint32_t __stdcall GetPixel(intptr_t,int,int)');
      const hit = user.func('intptr_t __stdcall SendMessageW(intptr_t,uint32_t,intptr_t,intptr_t)');
      const style=user.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t,int)');
      const create = gdi.func('intptr_t __stdcall CreateRectRgn(int,int,int,int)'), remove = gdi.func('int __stdcall DeleteObject(intptr_t)'), region = user.func('int __stdcall GetWindowRgn(intptr_t,intptr_t)'), contains = gdi.func('int __stdcall PtInRegion(intptr_t,int,int)');
      global.__borderRead = () => {
        const outer=[0,0,0,0], area=[0,0,0,0], point=[0,0]; rect(h,outer); client(h,area); origin(h,point);
        const points=[[point[0]-4,point[1]+200],[point[0]+area[2]+3,point[1]+200],[point[0]+200,point[1]+area[3]+3]], context=dc(0), shape=create(0,0,0,0), shaped=region(h,shape);
        let colors, resizeIncluded;
        try {
          colors=points.map(([x,y]) => { const value=pixel(context,x,y); return [value&255,value>>>8&255,value>>>16&255]; });
          resizeIncluded=points.map(([x,y]) => !shaped || !!contains(shape,x-outer[0],y-outer[1]));
        } finally { release(0,context); remove(shape); }
        const native=f.activeTab().native;
        return { outer, area, point, colors, resizeIncluded, style:Number(style(h,-16)), hits:points.map(([x,y]) => Number(hit(h,0x84,0,(y<<16)|(x&65535)))), pid:native?.child.pid, orderCorrect:!native || native.nextLayer(native.hwnd,2,native.hostHandle())===native.hostHandle() };
      };
    }, path.join(root, 'node_modules', 'koffi'));
    const homeId = await app.evaluate(() => global.__flashborn.activeTab().id);
    await command('new-tab');
    await app.evaluate(({}, file) => global.__flashborn.openLocal(file, global.__flashborn.activeTab()), require('./html-fixture')(path.join(profile, 'movie'), require('./playback-fixture')));
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native?.isPresented()), Boolean);
    const flashId = await app.evaluate(() => global.__flashborn.activeTab().id), pid = (await app.evaluate(() => global.__borderRead())).pid;
    for (const theme of ['current', 'light']) {
      if (await ui.locator('body').getAttribute('data-theme') !== theme) await command('theme');
      await poll(() => ui.locator('body').getAttribute('data-theme'), value => value === theme);
      await ui.locator(`[data-reorder-id="${homeId}"]`).click(); await wait(300);
      const html = await app.evaluate(() => global.__borderRead()); samples.push({ theme, page:'html', ...html });
      for (let i=0; i<3; i++) {
        await ui.locator(`[data-reorder-id="${flashId}"]`).click();
        await poll(() => app.evaluate(() => global.__flashborn.activeTab().native?.isPresented() && !global.__flashborn.getState().tabPresentation), Boolean); await wait(250);
        const flash=await app.evaluate(() => global.__borderRead()); samples.push({ theme, page:'flash', ...flash });
        assert.deepEqual(flash.outer,html.outer,'Selecting Flash must not grow the native window');
        assert.equal(flash.style&0x40000,0,'The native thick-frame object must not exist');
        assert.equal(flash.outer[2]-flash.outer[0],flash.area[2]);
        assert.equal(flash.outer[3]-flash.outer[1],flash.area[3]);
        assert.ok(flash.orderCorrect); assert.equal(flash.pid,pid);
        for (const color of flash.colors) {
          const shade=color[0]/221;
          assert.ok(shade>.3 && Math.abs(color[1]-107*shade)<4 && Math.abs(color[2]-179*shade)<4,'Only the owned backdrop or its shadow may occupy the removed frame: '+JSON.stringify(color));
        }
        await ui.locator(`[data-reorder-id="${homeId}"]`).click(); await wait(200);
      }
      passed.push(theme+': repeatedly selecting Flash retains HTML edges and movie order, with no native thick frame or extra outer margins'); console.log('PASS '+passed.at(-1));
    }
    fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-window-border-results.json':'window-border-results.json'),JSON.stringify({passed,samples,profile},null,2));
  } finally { await app.evaluate(({app}) => app.exit(0)).catch(() => {}); }
})().catch(error => { console.error(error.stack); process.exitCode=1; });
