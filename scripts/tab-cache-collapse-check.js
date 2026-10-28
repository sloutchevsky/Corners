'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = process.env.FLASHBORN_TEST_OUTPUT || path.join(root, 'test-output'), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 25000) { const end = Date.now() + timeout; let value; do { value = await fn(); if (check(value)) return value; await wait(60); } while (Date.now() < end); throw Error('Timeout ' + JSON.stringify(value)); }
(async () => {
  const profile = path.join(process.env.FLASHBORN_TEST_PROFILES || output, 'tab-cache-collapse-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  const requests = [];
  const server = http.createServer((req, res) => { requests.push(req.url); res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }); res.end('<!doctype html><title>' + (req.url === '/private' ? 'Private secret page' : 'Cached ' + req.url) + '</title><style>html{background:' + (req.url === '/private' ? '#ed1288' : '#226d91') + ';color:white;font:40px Arial}body{padding:50px}</style><h1>' + req.url + '</h1><p>Last visible frame</p>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false }, tabs: [...Array.from({ length: 30 }, (_, n) => ({ kind: 'web', title: 'Tab ' + n, url: base + '/tab-' + n })), { kind: 'home', title: 'New tab' }], activeTabIndex: 30 }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app, ui; const passed = [], pass = message => { passed.push(message); console.log('PASS ' + message); };
  const launch = async () => {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); ui = await app.firstWindow();
    await app.evaluate(() => { const win = global.__flashborn.win; win.setBounds({ x: 50, y: 50, width: 1360, height: 900 }); win.show(); win.focus(); });
  };
  const command = (action, args = {}) => app.evaluate(({}, value) => global.__flashborn.command(value.action, value.args), { action, args });
  const getState = () => app.evaluate(() => global.__flashborn.getState());
  const capture = async () => {
    await poll(getState, state => !state.tabs.find(tab => tab.id === state.activeId).loading);
    return poll(() => app.evaluate(async () => { const f = global.__flashborn; await f.requestTabSnapshot(f.activeTab()); return f.tabSnapshots.get(f.activeTab()); }), Boolean);
  };
  try {
    await launch();
    await command('navigate', { value: base + '/regular' }); const regular = (await getState()).activeId; await capture();
    const lazy = (await getState()).tabs[4].id; await command('select-tab', { id: lazy }); await capture();
    const html = require('./html-fixture')(path.join(profile, 'flash'), require('./playback-fixture'));
    await app.evaluate(({}, file) => global.__flashborn.openLocal(file), html); const flash = (await getState()).activeId;
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native?.call('evaluate', { code: 'Number(document.querySelector("embed").GetVariable("ticks"))' }).catch(() => 0)), ticks => ticks > 2);
    await capture();
    await command('new-flashcognito'); await command('navigate', { value: base + '/private' }); const privateId = (await getState()).activeId;
    await poll(getState, state => !state.tabs.find(tab => tab.id === privateId).loading);
    assert.equal(await app.evaluate(async () => { const f = global.__flashborn; await f.requestTabSnapshot(f.activeTab()); return f.tabSnapshots.get(f.activeTab()); }), null);
    const privateRow = ui.locator(`[data-reorder-id="${privateId}"]`);
    assert.equal(await privateRow.locator('.tab-thumbnail img').getAttribute('src'), null);
    assert.equal(await privateRow.locator('.tab-thumbnail-placeholder use').getAttribute('href'), '#i-lock');
    assert.equal(await privateRow.locator('.tab-thumbnail').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(48, 48, 48)');
    await command('select-tab', { id: regular }); await ui.locator('#address').hover(); await wait(250);
    const stored = await app.evaluate(({}, ids) => ids.map(id => { const f = global.__flashborn, tab = f.tabs.find(t => t.id === id); return { id: tab.thumbnailId, url: tab.url, data: f.tabSnapshots.get(tab).data }; }), [regular, lazy, flash]);

    const placeholderRows = await ui.locator('#tabs .tab').evaluateAll(rows => rows.map(row => row.classList.contains('placeholder-tab')));
    let geometrySamples = 0;
    for (const height of [900, 560]) {
      await app.evaluate(({}, height) => global.__flashborn.win.setSize(1360, height), height); await wait(220);
      for (const theme of ['current', 'light']) {
        if ((await getState()).settings.theme !== theme) await command('theme');
        await ui.locator('#address').hover(); await wait(220);
        for (const scroll of [0, 215, 10000]) {
          await ui.locator('#tabs').evaluate((el, scroll) => { el.scrollTop = scroll; }, scroll);
          for (const collapsed of [true, false]) {
            await ui.evaluate(() => {
              const stack = document.getElementById('tabs');
              window.__collapseFrames = [];
              const start = performance.now(), sample = () => {
                window.__collapseFrames.push({ scroll: stack.scrollTop, top: stack.getBoundingClientRect().top, overflow: stack.scrollWidth > stack.clientWidth, rows: [...stack.children].map(row => { const r = row.getBoundingClientRect(), i = row.querySelector('.tab-icon').getBoundingClientRect(); return [r.top, r.height, i.x, i.y, i.width, i.height]; }) });
                if (performance.now() - start < 350) requestAnimationFrame(sample);
              }; sample();
            });
            await command('collapse'); await wait(400);
            const frames = await ui.evaluate(() => window.__collapseFrames), first = frames[0];
            assert.ok(frames.length > 3); geometrySamples += frames.length;
            for (const sample of frames) {
              assert.equal(sample.overflow, false);
              assert.ok(Math.abs(sample.scroll - first.scroll) < .1, 'scroll anchoring changed');
              assert.ok(Math.abs(sample.top - first.top) < .1, `tab stack moved from ${first.top} to ${sample.top}; ${theme}, height ${height}, scroll ${scroll}, collapsed ${collapsed}`);
              sample.rows.forEach((row, index) => row.forEach((value, axis) => { if (placeholderRows[index] && axis === 2) return; assert.ok(Math.abs(value - first.rows[index][axis]) < .1, `row ${index} axis ${axis} moved from ${first.rows[index][axis]} to ${value}; ${theme}, height ${height}, scroll ${scroll}, collapsed ${collapsed}`); }));
            }
            assert.equal(await ui.locator('.sidebar').evaluate(el => el.getBoundingClientRect().width), collapsed ? 68 : 320);
            assert.equal(await ui.locator('.tab.active .tab-icon').evaluate(el => getComputedStyle(el).fontWeight), '700');
          }
        }
      }
    }
    pass('Every animation frame keeps row heights, vertical positions, scroll position and letter/icon anchors fixed at both window heights, both themes and top/middle/bottom scroll positions; selected letter is bold');
    await app.close(); app = null;
    const cached = JSON.parse(fs.readFileSync(path.join(profile, 'tab-thumbnails.json')));
    const disk = new Map(cached.frames); for (const item of stored) assert.ok(disk.get(item.id)?.data, 'missing saved image ' + item.url);
    const text = JSON.stringify(cached); assert.ok(!text.includes('/private')); assert.ok(!text.includes(privateId));
    pass('Real modern and Adobe Flash frames are saved on close; private tabs show grey locks and never capture or save page pixels');
    requests.length = 0; await launch();
    const restarted = await getState(); assert.equal(restarted.tabs.some(t => t.private), false);
    for (const item of stored.filter(item => item.url !== base + '/regular')) {
      const tab = restarted.tabs.find(t => t.url === item.url); assert.ok(tab);
      await poll(() => ui.locator(`[data-reorder-id="${tab.id}"] img`).getAttribute('src'), data => data === disk.get(item.id).data);
      assert.equal(await app.evaluate(({}, id) => { const t = global.__flashborn.tabs.find(t => t.id === id); return !!t.restoreEntry && !t.view && !t.native; }, tab.id), true);
      assert.equal(requests.includes(new URL(item.url).pathname), false);
    }
    pass('A second process restores cached thumbnails under new tab IDs before background HTML or Flash pages are loaded');
    const closed = restarted.tabs.find(t => t.url === stored[1].url); await command('close-tab', { id: closed.id });
    await app.close(); app = null;
    assert.equal(new Map(JSON.parse(fs.readFileSync(path.join(profile, 'tab-thumbnails.json'))).frames).has(stored[1].id), false);
    pass('Closing a restored tab removes its saved thumbnail');
    fs.writeFileSync(path.join(output, 'tab-cache-collapse-results.json'), JSON.stringify({ passed, profile, geometrySamples }, null, 2));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
