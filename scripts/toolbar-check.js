'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 25000) {
  const end = Date.now() + timeout; let value;
  do { value = await fn(); if (check(value)) return value; await wait(20); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'toolbar-profile-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { restoreTabs: false, adBlockEnabled: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = text => { passed.push(text); console.log('PASS ' + text); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const native = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.activeTab().native.call(data.action, data.args), { action, args });
    const ready = () => poll(() => app.evaluate(() => global.__flashborn.activeTab().native?.evaluate('document.getElementById("flash-movie")?.GetVariable("$version")')), v => v === ('WIN ' + require('../src/legacy/runtime.json').version.replaceAll('.', ',')));
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.show(); w.focus(); });
    await app.evaluate(({}, file) => global.__flashborn.openLocal(file, global.__flashborn.activeTab()), require('./html-fixture')(path.join(output, 'toolbar-check-html')));
    await ready(); const flashId = (await state()).activeId;
    for (let i = 0; i < 4; i++) {
      await command('select-tab', { id: flashId });
      await ui.locator('#address').click(); await ui.locator('#address').fill(''); await ui.keyboard.type('editable address ' + i);
      await poll(() => app.evaluate(() => ({ focused: global.__flashborn.win.webContents.isFocused(), area: global.__flashborn.focusArea })), v => v.focused && v.area === 'chrome');
      await command('reload'); await ready();
      await ui.keyboard.type(' after load');
      assert.equal(await ui.locator('#address').inputValue(), 'editable address ' + i + ' after load');
      assert.equal(await ui.locator('#address').evaluate(el => el === document.activeElement), true);
    }
    pass('Address editing keeps Windows and DOM focus through repeated Flash selection and reload completion');
    await command('select-tab', { id: flashId });
    await native('test-key', { key: 'L', control: true });
    await poll(() => ui.locator('#address').evaluate(el => el === document.activeElement), Boolean);
    await ui.keyboard.type('keyboard address'); assert.equal(await ui.locator('#address').inputValue(), 'keyboard address');
    await command('select-tab', { id: flashId }); await native('test-key', { key: 'F', control: true });
    await ui.locator('#find-input').waitFor({ state: 'visible' });
    await ui.keyboard.type('Flash'); assert.equal(await ui.locator('#find-input').inputValue(), 'Flash');
    await ui.locator('#find-close').click();
    pass('Ctrl+L and Ctrl+F from the legacy renderer transfer keyboard input to editable browser fields');
    await ui.locator('#address').click(); await ui.locator('#address').fill('return to Flash');
    await native('test-mouse', { type: 'mouseDown', x: 300, y: 220, button: 'left', clickCount: 1 });
    await native('test-mouse', { type: 'mouseUp', x: 300, y: 220, button: 'left', clickCount: 1 });
    await poll(() => app.evaluate(() => global.__flashborn.focusArea), area => area === 'content');
    await poll(() => ui.locator('#address').evaluate(el => el !== document.activeElement), Boolean);
    assert.equal((await state()).suggestions, null);
    await ui.locator('#address').click(); await ui.keyboard.type('back to editing');
    assert.equal(await ui.locator('#address').inputValue(), 'back to editing');
    pass('Clicking back into the Flash player clears address focus and suggestions; returning to the address bar remains editable');
    await ui.emulateMedia({ reducedMotion: 'no-preference' });
    for (const target of [68, 248]) {
      await app.evaluate(() => global.__flashborn.win.focus());
      await wait(100);
      await app.evaluate(() => {
        global.__sidebarSamples = []; clearInterval(global.__sidebarTimer);
        global.__sidebarTimer = setInterval(() => {
          const n = global.__flashborn.activeTab()?.native;
          if (n?.lastBounds) global.__sidebarSamples.push({ time: performance.now(), x: n.lastBounds[0] });
        }, 8);
      });
      await command('collapse');
      await poll(() => ui.locator('body').evaluate(el => Math.round(parseFloat(el.style.getPropertyValue('--sidebar-width')))), x => x === target);
      await ui.locator('body:not(.sidebar-animating)').waitFor({ state: 'attached' });
      const data = await app.evaluate(({ screen }) => { clearInterval(global.__sidebarTimer); return { samples: global.__sidebarSamples, scale: screen.getDisplayMatching(global.__flashborn.win.getBounds()).scaleFactor, bounds: global.__flashborn.activeTab().native.lastBounds }; });
      const globalWidth = await app.evaluate(() => global.__flashborn.win.getContentSize()[0]);
      const distinct = [...new Set(data.samples.map(s => s.x))];
      assert.ok(distinct.length >= 3, 'Native Flash must move through intermediate sidebar positions: ' + JSON.stringify(data));
      assert.equal(data.bounds[2], Math.round((globalWidth - target) * data.scale));
      assert.equal(Math.round((await ui.locator('.toolbar').boundingBox()).x), target);
      const moving = data.samples.filter((s, i, list) => i && s.x !== list[i - 1].x);
      assert.ok(moving.at(-1).time - moving[0].time < 280, 'Sidebar must finish at the same quick 190 ms reveal speed');
    }
    await command('collapse'); await wait(60); await command('collapse');
    await ui.locator('body:not(.sidebar-animating)').waitFor({ state: 'attached' });
    assert.equal(Math.round((await ui.locator('.toolbar').boundingBox()).x), 248);
    await ui.emulateMedia({ reducedMotion: 'reduce' }); await command('collapse');
    await poll(() => ui.locator('.toolbar').boundingBox(), box => Math.round(box.x) === 68);
    assert.equal(await ui.locator('body').evaluate(el => el.classList.contains('sidebar-animating')), false);
    pass('Sidebar collapse and restore animate the real Flash viewport in sync, handle rapid reversals, and respect reduced motion');
    await command('collapse');
    await ui.locator('body:not(.collapsed):not(.sidebar-animating)').waitFor({state:'attached'});
    const row = ui.locator(`[data-reorder-id="${flashId}"]`);
    assert.equal(await row.getAttribute('title'), null);
    await row.hover();
    await poll(() => row.locator('.tab-memory').innerText(), v => /^\d+ MB$/.test(v));
    assert.equal(await row.locator('.tab-memory').isVisible(), true);
    const memory = await row.locator('.tab-memory').boundingBox(), close = await row.locator('.tab-close').boundingBox();
    assert.ok(memory.x + memory.width < close.x);
    assert.equal(app.windows().some(page => page.url().includes('tab-tooltip')), false);
    await ui.mouse.move(28,85);
    assert.equal(await row.locator('.tab-memory').isVisible(), false);
    await command('collapse'); await row.hover();
    assert.equal(await row.locator('.tab-memory').isVisible(), false);
    await command('collapse');
    await app.evaluate(() => { const n = global.__flashborn.activeTab().native, call = n.call.bind(n); n.call = async (action, args) => { if (action === 'memory') await new Promise(resolve => setTimeout(resolve, 400)); return call(action, args); }; });
    await wait(2100); await row.hover(); await ui.mouse.move(28,85); await wait(600);
    assert.equal(await row.locator('.tab-memory').isVisible(), false);
    await row.hover(); await poll(() => row.locator('.tab-memory').isVisible(), Boolean);
    pass('Memory appears inline before Close on expanded hover, hides on rollout, never appears on collapsed tabs, and late measurements cannot restore it');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-toolbar-results.json' : 'toolbar-results.json'), JSON.stringify({ passed, completedAt: new Date().toISOString() }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
