'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 20000) {
  const end = Date.now() + timeout; let value;
  do { value = await read(); if (check(value)) return value; await wait(60); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(out, 'special-pages-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false, flashEnabled: false } }));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Address context fixture</title><h1>Original tab</h1>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/original';
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app, ui; const passed = [], pass = text => { passed.push(text); console.log('PASS ' + text); };
  const command = (action, args = {}) => app.evaluate(({}, request) => global.__flashborn.command(request.action, request.args), { action, args });
  const state = () => app.evaluate(() => global.__flashborn.getState());
  try {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); ui = await app.firstWindow();
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 70, y: 70, width: 1360, height: 940 }); w.show(); w.focus(); });
    const placeholder = await ui.locator('#address').getAttribute('placeholder');
    await command('navigate', { value: url });
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.url === url);
    await poll(() => ui.locator('#address').inputValue(), value => value === url);
    const tabId = (await state()).activeId;
    for (const name of ['library', 'bookmarks', 'history', 'downloads', 'settings', 'about', 'extensions']) {
      await ui.locator('#address').focus();
      if (name === 'extensions') await command('panel', { name });
      else await ui.locator('.sidebar [data-panel="' + name + '"]').click();
      await poll(state, s => s.panel === name);
      await poll(() => ui.locator('#address').inputValue(), value => value === '');
      assert.equal(await ui.locator('#address').getAttribute('placeholder'), placeholder);
      assert.equal(await ui.locator('#address-icon use').getAttribute('href'), '#i-search');
      assert.equal(await ui.locator('#bookmark').isDisabled(), true);
      assert.equal((await state()).tabs.find(t => t.id === tabId).url, url);
      if (name !== 'about') assert.equal(await ui.locator('.panel > h1').evaluate(el => getComputedStyle(el).fontSize), '39px');
      else {
        const dimensions = await ui.locator('.about-wordmark').evaluate(el => ({ width: parseFloat(getComputedStyle(el).width), height: parseFloat(getComputedStyle(el).height) }));
        assert.ok(Math.abs(dimensions.width - 234.78) < .02 && Math.abs(dimensions.height - 30.94) < .02);
      }
    }
    pass('Every special page has an empty address field and search icon, preserves its tab URL, and uses titles enlarged by 30%');
    await ui.locator('#address').fill('unfinished search');
    await command('state');
    assert.equal(await ui.locator('#address').inputValue(), 'unfinished search');
    await command('panel', { name: 'settings' });
    await poll(() => ui.locator('#address').inputValue(), value => value === '');
    await command('select-tab', { id: tabId });
    await poll(() => ui.locator('#address').inputValue(), value => value === url);
    assert.equal(await ui.locator('#address-icon use').getAttribute('href'), '#i-globe');
    pass('Switching pages clears a focused draft; ordinary state updates preserve typing, and returning to the tab restores its address');
    await command('panel', { name: 'library' });
    assert.equal(await ui.locator('.sidebar [data-panel="library"] span').innerText(), 'Flash Library');
    assert.equal(await ui.locator('.panel > h1').innerText(), 'Flash Library');
    assert.equal(await ui.locator('[data-action="library-folder"]').count(), 0);
    assert.equal(await ui.locator('.library-collection-heading h2').count(), 0);
    await command('add-library-source', { kind: 'html', value: url });
    await ui.locator('.library-thumbnail').waitFor();
    await ui.locator('.library-collection-heading [data-edit-collection]').click();
    assert.equal(await ui.locator('[name="collectionTitle"]').count(), 0);
    const oldTitle = (await state()).libraryHeading.title;
    await ui.locator('[name="collectionSubtitle"]').fill('Selected Flash websites');
    await ui.locator('#library-heading-form').getByRole('button', { name: 'Save', exact: true }).click();
    await poll(state, s => s.libraryHeading.subtitle === 'Selected Flash websites');
    assert.equal((await state()).libraryHeading.title, oldTitle);
    for (const theme of ['current', 'light']) {
      if ((await state()).settings.theme !== theme) await command('theme');
      await poll(() => ui.locator('body').getAttribute('data-theme'), value => value === theme);
      for (const width of [1360, 800]) {
        await app.evaluate(({}, width) => global.__flashborn.win.setSize(width, 940), width); await wait(120);
        const layout = await ui.evaluate(() => {
          const content = document.querySelector('#content'), filter = document.querySelector('#filter').getBoundingClientRect(), button = document.querySelector('.library-open-buttons').getBoundingClientRect();
          return { overflow: content.scrollWidth > content.clientWidth, separated: filter.right <= button.left || filter.bottom <= button.top };
        });
        assert.equal(layout.overflow, false); assert.equal(layout.separated, true);
      }
      await app.evaluate(() => global.__flashborn.win.setSize(1360, 940));
      await ui.screenshot({ path: path.join(out, 'special-pages-library-' + theme + '.png') });
    }
    pass('Flash Library labels, removed folder/title controls, editable subtitle and narrow layouts work in both themes');
    await command('new-flashcognito');
    await command('navigate', { value: url + '?private=1' });
    await poll(() => ui.locator('#address').inputValue(), value => value === url + '?private=1');
    for (const name of ['library', 'bookmarks', 'history', 'downloads', 'settings']) {
      await ui.locator('.sidebar [data-panel="' + name + '"]').click();
      await poll(() => ui.locator('#address').inputValue(), value => value === '');
    }
    pass('Flashcognito special pages also clear the previous website address');
    fs.writeFileSync(path.join(out, 'special-pages-results.json'), JSON.stringify({ passed, profile }, null, 2));
  } finally {
    if (app) { try { await app.evaluate(({ app }) => app.exit(0)); } catch {} }
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
