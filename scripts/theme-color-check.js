'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const captureVisible = require('./capture-visible');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 20000) {
  const end = Date.now() + timeout; let value;
  do { value = await fn(); if (check(value)) return value; await wait(50); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'theme-color-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
  const file = require('./html-fixture')(profile, require('./playback-fixture'));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = message => { passed.push(message); console.log('PASS ' + message); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const script = code => app.evaluate(({}, code) => global.__flashborn.activeTab().native.evaluate(code), code);
    const native = action => app.evaluate(({}, action) => global.__flashborn.activeTab().native.call(action), action);
    await app.evaluate(({}, modulePath) => {
      const api = process.mainModule.require(modulePath).load('user32.dll');
      global.__themeStyle = api.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t,int)');
      const w = global.__flashborn.win; w.setBounds({ x: 100, y: 80, width: 1280, height: 820 }); w.show(); w.focus();
    }, path.join(root, 'node_modules', 'koffi'));
    await command('add-library-source', { kind: 'html', value: file });
    await poll(() => script('document.querySelector("embed")?.GetVariable("ticks")'), value => Number(value) > 2);
    assert.equal(await app.evaluate(({ app }) => app.commandLine.getSwitchValue('force-color-profile')), 'srgb');
    assert.equal((await native('test-playback')).colorProfile, 'srgb');
    pass('Modern Chromium and the native Flash engine both start with force-color-profile=srgb');
    const pid = await app.evaluate(() => global.__flashborn.activeTab().native.child.pid);
    await script('document.querySelector("embed").SetVariable("marker",42)');
    for (let i = 0; i < 6; i++) {
      await ui.locator('#theme-button').click();
      await poll(() => app.evaluate(() => { const b = global.__flashborn; return { focused: b.win.isFocused(), topmost: !!(global.__themeStyle(b.activeTab().native.hwnd, -20) & 8), hostTopmost: b.win.isAlwaysOnTop() }; }), value => value.focused && value.topmost && !value.hostTopmost);
      const image = await captureVisible(app, { raise: false });
      assert.ok(image.creamPixels > 1000, 'Flash must remain physically visible after the theme click without raising the browser for its screenshot');
      assert.equal(await script('Number(document.querySelector("embed").GetVariable("marker"))'), 42);
      assert.equal(await app.evaluate(() => global.__flashborn.activeTab().native.child.pid), pid);
      if (i === 0) fs.writeFileSync(path.join(output, 'theme-light-live-flash.png'), Buffer.from(image.png, 'base64'));
    }
    assert.equal((await native('test-playback')).settingsRuns, 0);
    const ticks = await script('Number(document.querySelector("embed").GetVariable("ticks"))');
    await poll(() => script('Number(document.querySelector("embed").GetVariable("ticks"))'), value => value > ticks);
    pass('Six real theme-button clicks retain on-screen Flash pixels, its process and movie state, and running frame callbacks without changing Flash settings');
    await app.evaluate(() => global.__flashborn.win.minimize());
    await poll(() => app.evaluate(() => { const n = global.__flashborn.activeTab().native; return { visible: n.inspect().visible, topmost: !!(global.__themeStyle(n.hwnd, -20) & 8) }; }), value => !value.visible && !value.topmost);
    await app.evaluate(() => { const w = global.__flashborn.win; w.restore(); w.focus(); });
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.inspect().visible), Boolean);
    pass('Minimizing hides and demotes the separate Flash viewport; restoring shows the same movie');
    await native('test-host-hang'); await wait(5500);
    await app.evaluate(() => global.__flashborn.win.minimize());
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.stopped), Boolean);
    await app.evaluate(() => { const w = global.__flashborn.win; w.restore(); w.focus(); });
    await command('reload');
    await poll(() => app.evaluate(async () => { try { return Number(await global.__flashborn.activeTab().native?.evaluate('document.querySelector("embed")?.GetVariable("ticks")')); } catch { return 0; } }), value => value > 2);
    assert.notEqual(await app.evaluate(() => global.__flashborn.activeTab().native.child.pid), pid);
    pass('A hung Flash viewport is terminated when hidden so it cannot float above other applications, and Reload restores the source');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-theme-color-results.json' : 'theme-color-results.json'), JSON.stringify({ passed, completedAt: new Date().toISOString() }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
