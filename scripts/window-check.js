'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const http = require('node:http');
const captureVisible = require('./capture-visible');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const user32 = require('koffi').load('user32.dll');
const position = user32.func('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int width, int height, uint32_t flags)');
const getRect = user32.func('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ int32_t *rect)');
async function poll(fn, check, timeout = 30000) { const end = Date.now() + timeout; let value; do { value = await fn(); if (check(value)) return value; await wait(80); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
(async () => {
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: path.join(output, 'window-profile-' + Date.now()) }; delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync(env.FLASHBORN_PROFILE, { recursive: true });
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Memory fixture</title><p>A regular browser tab.</p>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [];
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const state = () => app.evaluate(() => global.__flashborn.getState());
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 100, y: 80, width: 1100, height: 760 }); w.setAlwaysOnTop(true, 'pop-up-menu'); w.show(); w.focus(); });
    await app.evaluate(({}, file) => global.__flashborn.command('add-library-source', {kind:'html',value:file}), require('./html-fixture')(path.join(output, 'window-check-html')));
    const native = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.activeTab().native.call(data.action, data.args), { action, args });
    const script = code => app.evaluate(({}, code) => global.__flashborn.activeTab().native.evaluate(code), code);
    await poll(() => script('document.getElementById("flash-movie")?.GetVariable("$version")'), v => v === 'WIN 34,0,0,376');
    await wait(300); await native('test-paints', { reset: true });
    const before = await app.evaluate(() => global.__flashborn.activeTab().native.inspect());
    const hostBefore = await app.evaluate(({ screen }) => ({ bounds: global.__flashborn.win.getBounds(), content: global.__flashborn.win.getContentBounds(), scale: screen.getDisplayMatching(global.__flashborn.win.getBounds()).scaleFactor }));
    const hostHandle = await app.evaluate(() => Number(global.__flashborn.win.getNativeWindowHandle().readBigUInt64LE()));
    const physical = [0, 0, 0, 0]; getRect(hostHandle, physical);
    // SWP_NOSIZE models a real title-bar move. Electron's DIP setPosition/
    // setBounds rounding can resize a frameless window at fractional DPI.
    for (let i = 0; i < 35; i++) { position(hostHandle, 0, physical[0] + i * 3, physical[1] + i, 0, 0, 0x0015); await wait(18); }
    await wait(200);
    const paints = await native('test-paints'), after = await app.evaluate(() => global.__flashborn.activeTab().native.inspect());
    console.log('MOVEMENT', JSON.stringify({ paints, before: before.rect, after: after.rect, hostBefore, hostAfter: await app.evaluate(() => ({ bounds: global.__flashborn.win.getBounds(), content: global.__flashborn.win.getContentBounds() })) }));
    if (process.env.FLASHBORN_BASELINE === '1') {
      assert.ok(paints.frame > 10, 'Baseline must reproduce repeated native frame invalidations');
      fs.writeFileSync(path.join(output, 'window-baseline.json'), JSON.stringify({ paints, before, after }, null, 2));
      return;
    }
    assert.equal(paints.frame, 0, 'Moving the parent must not force the Flash child frame to repaint');
    assert.equal(paints.size, 0, 'Moving the parent must not resize the Flash viewport');
    assert.equal(after.visible, 1);
    assert.equal(after.rect[2] - after.rect[0], before.rect[2] - before.rect[0]);
    assert.equal(after.rect[3] - after.rect[1], before.rect[3] - before.rect[1]);
    assert.ok(Math.abs(after.rect[0] - before.rect[0] - 102 * hostBefore.scale) <= 1); assert.ok(Math.abs(after.rect[1] - before.rect[1] - 34 * hostBefore.scale) <= 1);
    passed.push('Moving a loaded Flash window preserves its child surface with zero forced frame invalidations or resizes');
    console.log('PASS ' + passed.at(-1));
    // Verify real geometry changes still reach Adobe's renderer.
    await native('test-paints', { reset: true });
    await command('collapse'); await wait(300);
    const collapsed = await app.evaluate(() => global.__flashborn.activeTab().native.inspect());
    assert.ok(collapsed.rect[0] < after.rect[0]); assert.ok(collapsed.rect[2] - collapsed.rect[0] > after.rect[2] - after.rect[0]);
    await command('collapse'); await wait(300);
    await app.evaluate(() => global.__flashborn.win.setSize(1200, 800)); await wait(150);
    assert.ok((await native('test-paints')).size > 0);
    const frame = await script('document.getElementById("flash-movie").CurrentFrame()');
    await poll(() => script('document.getElementById("flash-movie").CurrentFrame()'), v => v !== frame);
    passed.push('Collapse and actual window resize still resize the live Flash viewport correctly'); console.log('PASS ' + passed.at(-1));
    const flashId = (await state()).activeId;
    const measuredFlash = (await command('tab-memory', { id: flashId })).tabMemory;
    assert.ok(Number.isInteger(measuredFlash.megabytes) && measuredFlash.megabytes > 0, JSON.stringify(measuredFlash));
    const flashRow = ui.locator(`[data-reorder-id="${flashId}"]`); await ui.mouse.move(28,70); await flashRow.hover();
    await poll(() => flashRow.getAttribute('aria-description'), v => /· \d+ MB$/.test(v));
    const sameRow = await flashRow.evaluate(el => { window.__memoryRow = el; return true; }); assert.equal(sameRow, true);
    await command('new-tab'); const homeId = (await state()).activeId;
    await ui.locator(`[data-reorder-id="${homeId}"]`).hover();
    await poll(() => ui.locator(`[data-reorder-id="${homeId}"]`).getAttribute('aria-description'), v => /· \d+ MB$/.test(v));
    assert.equal((await command('tab-memory', { id: homeId })).tabMemory.shared, true);
    await command('navigate', { value: 'http://127.0.0.1:' + server.address().port });
    await poll(state, s => !s.tabs.find(t => t.id === homeId).loading);
    const initial = (await command('tab-memory', { id: homeId })).tabMemory;
    assert.ok(initial.megabytes > 0);
    await app.evaluate(() => global.__flashborn.activeTab().view.webContents.executeJavaScript('window.__memoryTest = new Uint8Array(64 * 1024 * 1024); window.__memoryTest.fill(165); "ready"'));
    const grown = await poll(async () => (await command('tab-memory', { id: homeId })).tabMemory, v => v.megabytes >= initial.megabytes + 40);
    await command('select-tab', { id: flashId });
    await wait(2100);
    const inactiveRow = ui.locator(`[data-reorder-id="${homeId}"]`); await ui.mouse.move(28,70); await inactiveRow.hover();
    await poll(() => inactiveRow.getAttribute('aria-description'), v => /· \d+ MB$/.test(v));
    assert.equal((await state()).activeId, flashId, 'Hover must not activate an inactive tab');
    const memoryTitle = await inactiveRow.getAttribute('aria-description');
    assert.ok(Number(memoryTitle.match(/· (\d+) MB/)[1]) >= initial.megabytes + 40);
    passed.push('Tab hover reports real Flash runtime, shared new-tab, and inactive modern renderer memory; a touched 64 MB allocation increases the estimate without activating the tab'); console.log('PASS ' + passed.at(-1));
    if (process.env.FLASHBORN_KPF === '1') {
      await command('new-tab'); await command('navigate', { value: 'https://www.sloutchevsky.com/demos/kpf/main.htm?fullscreen=no' });
      await poll(() => app.evaluate(() => !!global.__flashborn.activeTab().native), Boolean, 60000);
      await poll(state, s => !s.tabs.find(t => t.id === s.activeId).loading && !s.tabs.find(t => t.id === s.activeId).error, 60000);
      const versions = await poll(() => script(`(()=>{const result=[];function visit(w){try{for(const e of w.document.querySelectorAll('object,embed')){try{const v=e.GetVariable?.('$version');if(v)result.push(v);}catch{}}for(let i=0;i<w.frames.length;i++)visit(w.frames[i]);}catch{}}visit(window);return result;})()`), v => v.includes('WIN 34,0,0,376'), 60000);
      await wait(1000); await native('test-paints', { reset: true });
      getRect(hostHandle, physical);
      for (let i = 0; i < 35; i++) { position(hostHandle, 0, physical[0] + i * 2, physical[1] + i, 0, 0, 0x0015); await wait(18); }
      await wait(150); const kpfPaints = await native('test-paints'); assert.equal(kpfPaints.frame, 0); assert.equal(kpfPaints.size, 0);
      console.log('KPF', JSON.stringify(kpfPaints));
      const screenshot = await captureVisible(app);
      fs.writeFileSync(path.join(output, 'kpf-moved-1.7.2.png'), Buffer.from(screenshot.png, 'base64'));
      console.log('KPF FLASH', JSON.stringify(versions));
      passed.push('The user’s live KPF site also moves without forced Flash frame invalidations or viewport resizes'); console.log('PASS ' + passed.at(-1));
    }
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-window-results.json' : 'window-results.json'), JSON.stringify({ passed, paints, measuredFlash, modern: { initial, grown }, completedAt: new Date().toISOString() }, null, 2));
  } finally { await app.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
