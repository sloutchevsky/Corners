'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, test, timeout = 25000) { const end = Date.now() + timeout; let value; do { value = await fn(); if (test(value)) return value; await wait(30); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
(async () => {
  const profile = path.join(output, 'input-stability-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  const movie = require('./html-fixture')(profile, require('./playback-fixture'));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = text => { passed.push(text); console.log('PASS ' + text); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); const ui = await app.firstWindow();
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const native = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.activeTab().native.call(data.action, data.args), { action, args });
    const values = () => app.evaluate(() => global.__flashborn.activeTab().native.evaluate('(()=>{const e=document.querySelector("embed");return {presses:Number(e.GetVariable("presses")),drags:Number(e.GetVariable("drags")),down:e.GetVariable("down")}})()'));
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.show(); w.focus(); });
    await command('theme'); await app.evaluate(({}, file) => global.__flashborn.openLocal(file), movie);
    await poll(async () => { try { return await values(); } catch { return null; } }, value => value?.presses === 0);
    await app.evaluate(() => { const n = global.__flashborn.activeTab().native, focus = n.focus.bind(n); n.focusCalls = 0; n.focus = () => { n.focusCalls++; return focus(); }; });
    for (let cycle = 0; cycle < 5; cycle++) {
      await ui.locator('#address').click(); await ui.locator('#address').fill('still editable ' + cycle);
      const before = await values();
      await native('test-mouse', { type: 'mouseDown', x: 300, y: 220, button: 'left', clickCount: 1 });
      await poll(() => app.evaluate(() => global.__flashborn.focusArea), area => area === 'content');
      await wait(150);
      assert.equal(await app.evaluate(() => global.__flashborn.activeTab().native.focusCalls), 0, 'A real mouse-down must not schedule another focus transfer');
      // CDP dispatches directly to Chromium and does not create Windows mouse
      // capture. Physical capture is checked separately with computer use.
      assert.equal((await values()).down, 'true');
      for (let move = 1; move <= 8; move++) await native('test-mouse', { type: 'mouseMove', x: 300 + move * 12, y: 220 + move * 3, button: 'left' });
      await native('test-mouse', { type: 'mouseUp', x: 396, y: 244, button: 'left', clickCount: 1 });
      await poll(values, value => value.presses > before.presses && value.drags >= before.drags + 6 && value.down === 'false');
      await command('fullscreen', { value: true }); await wait(180); await command('fullscreen', { value: false }); await wait(180);
      await app.evaluate(({}, i) => global.__flashborn.win.setSize(1200 + i * 7, 780 + i * 5), cycle); await wait(200);
      await app.evaluate(() => { global.__flashborn.activeTab().native.focusCalls = 0; });
    }
    pass('Light-mode Flash keeps held mouse/drag callbacks across repeated address edits, fullscreen and resizes without reloading or a second focus handoff');
    const palette = await ui.evaluate(() => [...document.querySelectorAll('.sidebar .nav-gold')].map(canvas => {
      const rect = canvas.getBoundingClientRect(), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let partial = 0, opaque = 0, minimum = 255;
      for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 0 && data[i + 3] < 255) partial++; if (data[i + 3] > 220) { opaque++; minimum = Math.min(minimum, data[i], data[i + 1]); } }
      return { kind: canvas.dataset.navIcon, width: canvas.width, expected: Math.round(rect.width * devicePixelRatio), filter: getComputedStyle(canvas).filter, partial, opaque, minimum };
    }));
    for (const icon of palette) { assert.equal(icon.width, icon.expected); assert.equal(icon.filter, 'none'); assert.ok(icon.partial >= 8); assert.ok(icon.opaque > 0); assert.ok(icon.minimum >= 65, JSON.stringify(icon)); }
    pass('All five light-mode icons have antialiased edge coverage at the real display density and softened opaque gold shadows');
    await ui.locator('.sidebar-bottom').screenshot({ path: path.join(output, 'light-mode-icons-1.8.3.png') });
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-input-stability-results.json' : 'input-stability-results.json'), JSON.stringify({ passed, palette, completedAt: new Date().toISOString() }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
