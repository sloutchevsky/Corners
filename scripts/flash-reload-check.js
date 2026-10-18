'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  do { value = await read(); if (check(value)) return value; await wait(80); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(out, 'flash-reload-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const html = require('./html-fixture')(path.join(profile, 'portfolio'), require('./playback-fixture'));
  const plain = path.join(profile, 'plain.html'); fs.writeFileSync(plain, '<title>No Flash here</title><input id="draft" value="Keep my draft">');
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app, ui; const passed = [], pass = message => { passed.push(message); console.log('PASS ' + message); };
  const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
  const state = () => app.evaluate(() => global.__flashborn.getState());
  const active = async () => { const s = await state(); return s.tabs.find(t => t.id === s.activeId); };
  const script = code => app.evaluate(({}, code) => global.__flashborn.activeTab().native?.evaluate(code), code);
  const ready = () => poll(async () => { try { return await script('document.querySelector("embed").GetVariable("$version")'); } catch { return null; } }, v => typeof v === 'string' && v.startsWith('WIN '));
  const launch = async () => {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); ui = await app.firstWindow();
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 850 }); w.show(); w.focus(); });
    await ui.emulateMedia({ reducedMotion: 'no-preference' });
  };
  try {
    await launch();
    for (const action of ['new-tab', 'new-flashcognito']) {
      await command(action); assert.equal(await ui.locator('#native-mode').isEnabled(), true);
      await ui.locator('#native-mode').click();
      await poll(() => ui.locator('#loading-bolt').getAttribute('data-motion'), v => v === 'finishing');
      await poll(() => ui.locator('#loading-bolt').getAttribute('data-angle'), v => Number(v) > 1);
      await poll(() => ui.locator('#loading-bolt').getAttribute('data-motion'), v => v === 'idle', 4000);
      assert.equal(await ui.locator('#loading-bolt').getAttribute('data-variant'), 'outline');
      assert.equal((await active()).kind, 'home'); assert.equal((await active()).native, false);
    }
    pass('New tab and Flashcognito both accept the bolt click, finish one spin and stay hollow');
    await command('select-tab', { id: (await state()).tabs.find(t => !t.private).id });
    await command('new-tab'); await command('navigate', { value: plain }); await poll(active, t => !t.loading);
    await command('native-mode'); assert.equal((await active()).native, false); assert.equal((await active()).flashDetected, false);
    assert.equal(await app.evaluate(() => global.__flashborn.activeTab().view.webContents.executeJavaScript('document.getElementById("draft").value')), 'Keep my draft');
    pass('Clicking on a page without Flash keeps the page and form contents intact');
    await command('navigate', { value: html }); await ready(); await poll(active, t => t.flashDetected === true);
    const tabId = (await active()).id, tabCount = (await state()).tabs.length;
    for (let i = 0; i < 3; i++) {
      await script('document.querySelector("embed").SetVariable("marker",42)');
      await command('reload'); await ready();
      assert.equal((await active()).id, tabId); assert.equal((await state()).tabs.length, tabCount);
      assert.notEqual(Number(await script('document.querySelector("embed").GetVariable("marker")')), 42);
    }
    const before = await app.evaluate(() => global.__flashborn.activeTab().native.child.pid);
    await command('native-mode'); await ready(); await poll(active, t => t.flashDetected === true);
    assert.notEqual(await app.evaluate(() => global.__flashborn.activeTab().native.child.pid), before);
    assert.equal(await ui.locator('#loading-bolt').getAttribute('data-variant'), 'filled');
    await command('duplicate-tab', { id: tabId }); await ready();
    assert.notEqual((await active()).id, tabId); assert.equal((await active()).kind, 'local');
    pass('Repeated local reload, bolt recovery and Duplicate Tab create working Adobe players with the correct source');
    await command('panel', { name: 'about' }); await command('theme');
    const color = await ui.locator('#support-heading').evaluate(el => getComputedStyle(el).color);
    assert.equal(color, 'rgb(112, 91, 55)');
    assert.equal(await ui.locator('.about-note').evaluate(el => getComputedStyle(el).color), color);
    await command('theme'); assert.equal(await ui.locator('#support-heading').evaluate(el => getComputedStyle(el).color), 'rgb(182, 166, 140)');
    pass('Light About uses the sidebar brown; dark About retains tan');
    await app.evaluate(({ dialog }, file) => {
      global.browseOptions = []; global.browseCancel = false;
      dialog.showOpenDialog = async (_window, options) => { global.browseOptions.push(options); return global.browseCancel ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [file] }; };
    }, html);
    await command('browse-library-source', { kind: 'html' });
    await app.evaluate(() => { global.browseCancel = true; }); await command('browse-library-source', { kind: 'html' });
    assert.equal(await app.evaluate(() => global.browseOptions.at(-1).defaultPath), path.dirname(html));
    await command('select-tab', { id: tabId }); await app.close(); app = null;
    await launch(); await ready();
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async (_window, options) => { global.restoredBrowsePath = options.defaultPath; return { canceled: true, filePaths: [] }; }; });
    await command('browse-library-source', { kind: 'html' });
    assert.equal(await app.evaluate(() => global.restoredBrowsePath), path.dirname(html));
    assert.equal((await active()).kind, 'local'); await command('reload'); await ready();
    pass('Local Flash restores after restart, and Add a Flash page remembers its folder across cancellation and restart');
    const johnFrieda = 'C:/_DEMOS/demos/club_john_frieda/index.html';
    if (fs.existsSync(johnFrieda)) {
      await command('navigate', { value: johnFrieda }); await ready();
      for (let i = 0; i < 2; i++) { await command('reload'); await ready(); }
      await command('native-mode'); await ready(); await poll(active, t => t.flashDetected === true);
      // The real portfolio has an animated intro; a ready scripting API alone
      // can still be its solid-color first frame.
      await wait(7000);
      const image = await app.evaluate(() => global.__flashborn.activeTab().native.screenshot());
      const varied = await app.evaluate(({ nativeImage }, data) => {
        const pixels = nativeImage.createFromBuffer(Buffer.from(data, 'base64')).toBitmap(), first = pixels.readUInt32LE(0);
        let different = 0, samples = 0;
        for (let i = 0; i < pixels.length; i += 16) { samples++; if (pixels.readUInt32LE(i) !== first) different++; }
        return different / samples;
      }, image);
      assert.ok(varied > .02, 'The movie must paint visible content, not just its solid background');
      fs.writeFileSync(path.join(out, 'club-john-frieda-reloaded.png'), Buffer.from(image, 'base64'));
      pass('The actual local Club John Frieda page loads its Adobe movie after repeated reloads and a bolt click');
    }
    fs.writeFileSync(path.join(out, 'flash-reload-results.json'), JSON.stringify({ passed, profile }, null, 2));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
