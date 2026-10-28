'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output'), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 30000) { let value; const end = Date.now() + timeout; do { value = await read(); if (check(value)) return value; await wait(50); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
(async () => {
  const profile = path.join(process.env.FLASHBORN_TEST_PROFILES || output, 'tab-presentation-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const movie = require('./html-fixture')(path.join(profile, 'first'), require('./playback-fixture'));
  const secondMovie = require('./html-fixture')(path.join(profile, 'second'), require('./playback-fixture'));
  const plain = path.join(profile, 'plain.html'); fs.writeFileSync(plain, '<title>Ordinary page</title><style>html{background:#abcdee}</style><h1>Ordinary page</h1>');
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = message => { passed.push(message); console.log('PASS ' + message); };
  const command = (action, args = {}) => app.evaluate(({}, d) => global.__flashborn.command(d.action, d.args), { action, args });
  const state = () => app.evaluate(() => global.__flashborn.getState());
  const activeId = async () => (await state()).activeId;
  const ready = () => poll(async () => { try { return await app.evaluate(() => global.__flashborn.activeTab().native?.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))')); } catch { return null; } }, n => Number(n) > 2);
  try {
    await app.firstWindow(); await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 70, y: 70, width: 1200, height: 850 }); w.show(); w.focus(); });
    await command('navigate', { value: movie }); await ready(); const first = await activeId();
    await command('new-tab'); await command('navigate', { value: secondMovie }); await ready(); const second = await activeId();
    await command('new-tab'); await command('navigate', { value: plain }); const modern = await activeId();
    await command('new-tab'); const home = await activeId();
    for (const id of [first, second, modern, first, home, first, second, first]) {
      await poll(state, s => !s.tabPresentation);
      await app.evaluate(() => {
        global.__frameSamples = [];
        clearInterval(global.__frameSampleTimer);
        global.__frameSampleTimer = setInterval(() => {
          const api = global.__flashborn, p = api.presentation;
          const shown = api.tabs.filter(t => t.native?.isPresented() || t.view && !t.view.webContents.isDestroyed() && t.view.getVisible()).map(t => t.id);
          global.__frameSamples.push({ active: api.activeTab().id, home: api.activeTab().kind === 'home' || !!api.getState().presentationHome, shown, presentation: p && { from: p.from.id, surface: p.surfaceReady, host: p.hostReady, swapping: p.swapping } });
        }, 3);
      });
      await command('select-tab', { id }); await poll(state, s => !s.tabPresentation); await wait(70);
      const samples = await app.evaluate(() => { clearInterval(global.__frameSampleTimer); return global.__frameSamples; });
      assert.ok(samples.every(s => s.home || s.shown.length > 0), 'A tab switch must not expose an empty shell between existing surfaces: ' + JSON.stringify({ id, first, second, modern, home, empty: samples.filter(s => !s.home && !s.shown.length) }));
      assert.ok(samples.filter(s => s.presentation?.swapping).every(s => s.presentation.surface && s.presentation.host), 'Swap waits for both the host and replacement frame');
    }
    pass('Flash-to-Flash, Flash-to-modern and Flash-to-home handoffs retain a presented surface and wait for compositor readiness');
    await command('select-tab', { id: home }); await poll(state, s => !s.tabPresentation);
    const ui = await app.firstWindow(); await ui.locator('#home-search').waitFor({ state: 'visible' });
    await app.evaluate(({}, id) => {
      const native = global.__flashborn.tabs.find(t => t.id === id).native;
      global.__realPresent = native.present.bind(native);
      native.present = async () => { await new Promise(resolve => setTimeout(resolve, 100)); return global.__realPresent(); };
    }, first);
    await command('select-tab', { id: first });
    await ui.locator('#content[inert] #home-search').waitFor({ state: 'visible' });
    await poll(state, s => !s.tabPresentation);
    assert.equal(await ui.locator('#content').evaluate(el => el.inert), false);
    assert.equal(await ui.locator('#home-search').count(), 0);
    await app.evaluate(({}, id) => { global.__flashborn.tabs.find(t => t.id === id).native.present = global.__realPresent; delete global.__realPresent; }, first);
    pass('The real new-tab UI remains visible and inert while Flash warms, then clears only after the movie is presented');
    await command('select-tab', { id: home }); await poll(state, s => !s.tabPresentation);
    await app.evaluate(({}, id) => { const api = global.__flashborn; api.command('select-tab', { id }); api.win.minimize(); }, first);
    await wait(1800);
    await app.evaluate(() => { const win = global.__flashborn.win; win.restore(); win.focus(); });
    await ready(); await poll(state, s => !s.tabPresentation);
    assert.equal(await activeId(), first);
    assert.equal(await app.evaluate(() => !!global.__flashborn.activeTab().error), false);
    pass('Minimize during preparation cancels the handoff without a false renderer error; restore resumes the selected movie');
    await command('select-tab', { id: first }); await ready();
    const n = await app.evaluate(() => global.__flashborn.activeTab().native.call('test-playback')); assert.equal(n.settingsRuns, 0);
    pass('Frame preparation does not poll or change Flash movie settings during tab switches');
    for (const id of [second, modern, home, first, second, first]) await command('select-tab', { id });
    await poll(state, s => !s.tabPresentation); await ready();
    assert.equal(await activeId(), first); assert.equal(await app.evaluate(() => global.__flashborn.tabs.filter(t => t.native?.retiring).length), 0);
    pass('Rapid switches cancel stale handoffs and leave no old native surface covering the selected tab');
    fs.writeFileSync(path.join(output, 'tab-presentation-results.json'), JSON.stringify({ passed, profile }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
