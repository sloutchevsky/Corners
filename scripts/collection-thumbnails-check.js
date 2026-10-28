'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 25000) {
  const end = Date.now() + timeout; let value;
  do { value = await read(); if (check(value)) return value; await wait(70); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const requests = [], server = http.createServer((request, response) => {
    requests.push(request.url); response.setHeader('Content-Type', 'text/html;charset=utf-8');
    response.end('<!doctype html><title>' + (request.url === '/alpha' ? 'Alpha design studio' : request.url === '/bravo' ? 'Bravo archive' : 'Private page') + '</title><style>html{background:' + (request.url === '/alpha' ? '#286687' : '#8d4a36') + ';color:white;font:38px Arial}body{padding:60px}</style><h1>' + request.url + '</h1><p>Latest captured website picture</p>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port, profile = path.join(output, 'collection-thumbnails-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  const bookmarks = [
    { id: crypto.randomUUID(), title: 'Alpha design studio', url: base + '/alpha' },
    { id: crypto.randomUUID(), title: 'Unvisited bookmark', url: base + '/never-load-for-a-thumbnail' }
  ];
  const downloads = ['Design archive.zip', 'Reference photo.JPG', 'Website.html'].map((filename, index) => ({ id: crypto.randomUUID(), filename, url: base + '/download-' + index, path: path.join(profile, filename), received: 12000, total: 12000, state: 'completed' }));
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ bookmarks, downloads, tabs: [{ kind: 'home', title: 'New tab', url: '' }], settings: { theme: 'current', adBlockEnabled: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app, ui; const passed = [], pass = text => { passed.push(text); console.log('PASS ' + text); };
  const launch = async () => {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); ui = await app.firstWindow();
    await app.evaluate(() => { const f = global.__flashborn; f.win.setBounds({ x: 50, y: 50, width: 1360, height: 940 }); f.win.show(); f.win.focus(); global.__homeCaptures = 0; const capture = f.tabSnapshots.capture; f.tabSnapshots.capture = tab => { if (tab.kind === 'home') global.__homeCaptures++; return capture(tab); }; });
  };
  const command = (action, args = {}) => app.evaluate(({}, value) => global.__flashborn.command(value.action, value.args), { action, args });
  const state = () => app.evaluate(() => global.__flashborn.getState());
  const capture = async () => {
    await poll(state, value => !value.tabs.find(tab => tab.id === value.activeId).loading);
    return poll(() => app.evaluate(async () => { const f = global.__flashborn; await f.requestTabSnapshot(f.activeTab()); return f.tabSnapshots.get(f.activeTab()); }), Boolean);
  };
  const shutdown = async () => {
    const closed = app.waitForEvent('close', { timeout: 20000 });
    await app.evaluate(() => global.__flashborn.win.close()); await closed; app = null;
  };
  const geometry = () => ui.evaluate(() => {
    const row = document.querySelector('#tabs .tab.active'), tile = row.querySelector('.tab-thumbnail'), glyph = row.querySelector('.tab-icon'), r = row.getBoundingClientRect(), t = tile.getBoundingClientRect(), g = glyph.getBoundingClientRect();
    return { rowY: r.y, rowHeight: r.height, width: t.width, height: t.height, tileX: t.x, iconX: g.x + g.width / 2, iconY: g.y + g.height / 2, ink: getComputedStyle(glyph).color, fill: getComputedStyle(tile).backgroundColor, href: glyph.querySelector('use').getAttribute('href'), snapshot: tile.classList.contains('has-snapshot'), src: tile.querySelector('img').getAttribute('src'), selection: getComputedStyle(document.getElementById('tabs')).backgroundSize };
  });
  try {
    await launch(); const home = (await state()).activeId;
    for (const privateMode of [false, true]) {
      if (privateMode) await command('new-flashcognito');
      else await command('select-tab', { id: home });
      for (const theme of ['current', 'light']) {
        if ((await state()).settings.theme !== theme) await command('theme');
        await ui.locator('#address').hover(); await wait(240);
        const expanded = await geometry();
        assert.equal(expanded.width, 86); assert.equal(expanded.height, 43);
        assert.equal(expanded.iconX, 43); assert.ok(Math.abs(expanded.iconY - (expanded.rowY + 21.5)) < .1);
        assert.equal(expanded.href, privateMode ? '#i-lock' : '#i-globe');
        assert.equal(expanded.fill, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(48, 48, 48)');
        assert.equal(expanded.ink, theme === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
        assert.equal(expanded.src, null); assert.equal(expanded.snapshot, false);
        assert.ok(expanded.selection.includes('86px') || expanded.selection.includes('min(100%'), expanded.selection);
        for (const collapsed of [true, false]) {
          await ui.evaluate(() => { window.__placeholderFrames = []; const start = performance.now(); const sample = () => { const row = document.querySelector('#tabs .tab.active'), glyph = row.querySelector('.tab-icon').getBoundingClientRect(), rect = row.getBoundingClientRect(); window.__placeholderFrames.push({ x: glyph.x + glyph.width / 2, y: rect.y, height: rect.height, opacity: getComputedStyle(row.querySelector('.tab-icon')).opacity }); if (performance.now() - start < 300) requestAnimationFrame(sample); }; sample(); });
          await command('collapse'); await wait(340);
          const value = await geometry(), samples = await ui.evaluate(() => window.__placeholderFrames);
          assert.ok(samples.some(sample => sample.x > 34 && sample.x < 43), JSON.stringify(samples));
          assert.ok(samples.every(sample => Math.abs(sample.y - expanded.rowY) < .1 && sample.height === 43 && sample.opacity === '1'), JSON.stringify({ expanded, collapsed, theme, privateMode, samples }));
          assert.ok(Math.abs(value.width - (collapsed ? 68 : 86)) < .1, JSON.stringify(value)); assert.equal(value.iconX, collapsed ? 34 : 43);
          assert.equal(value.src, null); assert.equal(value.fill, expanded.fill); assert.equal(value.ink, expanded.ink);
          await ui.screenshot({ path: path.join(output, 'placeholder-' + (privateMode ? 'private' : 'new') + '-' + theme + (collapsed ? '-collapsed' : '') + '.png') });
        }
        await command('tab-snapshot', { id: (await state()).activeId });
      }
      if (privateMode) await command('close-tab', { id: (await state()).activeId });
    }
    assert.equal(await app.evaluate(() => global.__homeCaptures), 0);
    pass('New Tab and Flashcognito show screenshot-free 2:1 tiles; white or black glyphs slide continuously between collapsed and expanded centres without vertical shifts or fades');

    await command('navigate', { value: base + '/alpha' }); const alpha = (await state()).activeId; await capture();
    await app.evaluate(() => global.__flashborn.activeTab().view.webContents.executeJavaScript('document.documentElement.style.background="#693290"'));
    await wait(800); const latest = await capture();
    await command('new-tab'); await command('navigate', { value: base + '/bravo' }); const bravo = (await state()).activeId; await capture();
    await command('new-tab');
    await command('close-tab', { id: alpha }); await command('close-tab', { id: bravo });
    for (const name of ['bookmarks', 'history']) {
      await command('panel', { name });
      await poll(() => ui.locator('.collection-thumbnail.has-snapshot img').count(), count => count >= 1);
      const rows = await ui.locator('.collection-row').evaluateAll(rows => rows.map(row => { const r = row.getBoundingClientRect(), tile = row.querySelector('.collection-thumbnail').getBoundingClientRect(); return { height: r.height, width: tile.width, tileHeight: tile.height, radius: getComputedStyle(row).borderRadius, title: row.querySelector('.item-title').textContent, image: row.querySelector('img')?.getAttribute('src'), url: row.querySelector('.collection-thumbnail').dataset.siteUrl }; }));
      assert.ok(rows.every(row => row.height === 48 && row.width === 96 && row.tileHeight === 48 && row.radius === '0px'), JSON.stringify(rows));
      assert.equal(rows.find(row => row.url === base + '/alpha').image, latest.data);
      await ui.screenshot({ path: path.join(output, 'collection-' + name + '.png') });
    }
    assert.ok(!requests.includes('/never-load-for-a-thumbnail'));
    pass('Bookmarks and History use the last captured picture after tabs close, in square-edged two-line rows with flush 2:1 pictures; missing pictures never trigger page loads');

    await command('panel', { name: 'downloads' });
    assert.deepEqual(await ui.locator('.collection-thumbnail use').evaluateAll(icons => icons.map(icon => icon.getAttribute('href'))), ['#i-archive', '#i-image', '#i-globe']);
    assert.equal(await ui.locator('.collection-thumbnail img').count(), 0);
    for (const theme of ['current', 'light']) {
      if ((await state()).settings.theme !== theme) await command('theme');
      const colors = await ui.locator('.collection-thumbnail').evaluateAll(tiles => tiles.map(tile => ({ fill: getComputedStyle(tile).backgroundColor, ink: getComputedStyle(tile).color, width: tile.clientWidth, height: tile.clientHeight })));
      assert.ok(colors.every(color => color.fill === (theme === 'light' ? 'rgb(210, 210, 210)' : 'rgb(48, 48, 48)') && color.width === 96 && color.height === 48), JSON.stringify(colors));
      await ui.screenshot({ path: path.join(output, 'collection-downloads-' + theme + '.png') });
    }
    pass('Downloads have two-line rows and grey 2:1 tiles with archive, picture or globe icons in both themes');

    await command('panel', { name: 'bookmarks' });
    await ui.locator('[data-reorder-id="' + bookmarks[0].id + '"] .item-title').focus(); await ui.keyboard.press('Alt+ArrowDown');
    await poll(state, value => value.bookmarks[1].id === bookmarks[0].id);
    await poll(() => ui.locator('.collection-thumbnail.has-snapshot img').count(), count => count === 1);
    await ui.locator('[data-reorder-id="' + bookmarks[0].id + '"] .collection-thumbnail').click();
    await poll(state, value => !value.panel && value.tabs.some(tab => tab.url === base + '/alpha'));
    await capture(); await command('new-tab');
    const opened = (await state()).tabs.find(tab => tab.url === base + '/alpha'); await command('close-tab', { id: opened.id });
    await command('new-flashcognito'); await command('navigate', { value: base + '/private-secret' });
    await poll(state, value => !value.tabs.find(tab => tab.id === value.activeId).loading);
    await command('tab-snapshot', { id: (await state()).activeId });
    assert.equal(await app.evaluate(() => global.__flashborn.tabSnapshots.get(global.__flashborn.activeTab())), null);
    await command('close-tab', { id: (await state()).activeId });
    await shutdown();
    const cache = JSON.parse(fs.readFileSync(path.join(profile, 'tab-thumbnails.json')));
    assert.ok(cache.pages.some(([url]) => url === base + '/alpha')); assert.ok(cache.pages.some(([url]) => url === base + '/bravo'));
    assert.ok(!JSON.stringify(cache).includes('/private-secret'));
    requests.length = 0; await launch();
    await command('panel', { name: 'history' });
    await poll(() => ui.locator('.collection-thumbnail.has-snapshot img').count(), count => count === 2);
    assert.ok(!requests.includes('/alpha') && !requests.includes('/bravo'));
    await command('panel', { name: 'bookmarks' }); await ui.locator('[data-remove-bookmark="' + bookmarks[0].id + '"]').click();
    await poll(state, value => value.bookmarks.length === 1 && value.panel === 'bookmarks');
    await command('clear-history');
    const remaining = await command('collection-thumbnails', { urls: [base + '/alpha', base + '/bravo'] });
    assert.ok(remaining.thumbnails.every(frame => !frame.data));
    pass('Thumbnail navigation and bookmark reordering work; pictures restore without loading sites, private pixels stay absent, and removing saved references prunes cached pictures');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-collection-thumbnails-results.json' : 'collection-thumbnails-results.json'), JSON.stringify({ passed, profile }, null, 2));
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
