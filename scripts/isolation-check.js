'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 20000) {
  const end = Date.now() + timeout; let value;
  do { value = await fn(); if (check(value)) return value; await wait(50); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'isolation-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  const file = require('./html-fixture')(profile, require('./playback-fixture'));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = message => { passed.push(message); console.log('PASS ' + message); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const ready = () => poll(() => app.evaluate(async () => {
      try { return await global.__flashborn.activeTab().native?.evaluate('document.querySelector("embed")?.GetVariable("ticks")'); } catch { return null; }
    }), value => Number(value) > 2);
    await app.evaluate(() => { const w = global.__flashborn.win; w.show(); w.focus(); });
    await command('add-library-source', { kind: 'html', value: file }); await ready();
    const detail = await app.evaluate(() => { const n = global.__flashborn.activeTab().native; return { ...n.inspect(), pid: n.child.pid, id: n.tabId }; });
    assert.equal(detail.parent, 0, 'Flash must have neither a cross-process parent nor owner');
    assert.equal(Number(detail.style) & 0x40000000, 0, 'Flash must not be a WS_CHILD window');
    await app.evaluate(() => global.__flashborn.activeTab().native.call('restore-state', { zoom: 125, muted: true }));
    await app.evaluate(({}, modulePath) => {
      const api = process.mainModule.require(modulePath).load('user32.dll');
      global.__testHung = api.func('int __stdcall IsHungAppWindow(intptr_t hwnd)');
    }, path.join(root, 'node_modules', 'koffi'));
    await app.evaluate(() => global.__flashborn.activeTab().native.call('test-host-hang'));
    await wait(100);
    // This exercises the application's focus path while the other message pump
    // is blocked, rather than assuming that a separate process is sufficient.
    await app.evaluate(() => global.__flashborn.activeTab().native.focusHost());
    await poll(() => app.evaluate(({}, hwnd) => global.__testHung(hwnd), detail.hwnd), Boolean, 10000);
    const start = Date.now();
    await ui.locator('#address').click(); await ui.locator('#address').fill('editable while Flash is hung');
    await ui.keyboard.type(' and still typing');
    assert.equal(await ui.locator('#address').inputValue(), 'editable while Flash is hung and still typing');
    await ui.locator('#address').click({ button: 'right' });
    await poll(() => app.evaluate(() => !!global.__flashborn.editMenu), Boolean);
    await app.evaluate(() => global.__flashborn.editMenu.closePopup(global.__flashborn.win));
    await poll(() => app.evaluate(() => !global.__flashborn.editMenu), Boolean);
    await command('new-tab'); await ui.locator('.home').waitFor();
    await command('select-tab', { id: detail.id });
    assert.ok(Date.now() - start < 6000, 'Toolbar/menu/tab actions must not wait for the 30-second legacy stall');
    pass('Windows reports the Flash host hung, while the browser address bar, edit context menu and tab switching remain responsive');
    await ui.locator('#reload').click(); await ready();
    const restored = await app.evaluate(() => { const n = global.__flashborn.activeTab().native; return { pid: n.child.pid, state: n.state }; });
    assert.notEqual(restored.pid, detail.pid);
    assert.equal(restored.state.zoom, 125); assert.equal(restored.state.muted, true);
    const first = await app.evaluate(() => global.__flashborn.activeTab().native.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))'));
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))')), ticks => ticks > first);
    pass('The real Reload button replaces the hung runtime immediately, restores the HTML source and zoom/mute state, and resumes Flash frame callbacks');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-isolation-results.json' : 'isolation-results.json'), JSON.stringify({ passed, detail, restored, completedAt: new Date().toISOString() }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
