'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 90000) {
  const end = Date.now() + timeout; let value;
  do { value = await read(); if (check(value)) return value; await wait(100); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'pointer-reorder-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  const names = ['Alpha', 'Bravo', 'Charlie'];
  const bookmarks = names.map((title, i) => ({ id: 'bookmark' + i, title, url: 'https://example.com/' + title }));
  const library = names.map(title => ({ id: require('node:crypto').randomUUID(), title, description: 'Drag this card by its title, image or background.', url: 'https://example.com/' + title, kind: 'html' }));
  const downloads = names.map((filename, i) => ({ id: 'download' + i, filename, path: path.join(profile, filename), state: 'completed', total: 1024, received: 1024 }));
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false }, bookmarks, library, downloads }));
  const movie = require('./html-fixture')(path.join(profile, 'movie'), require('./playback-fixture'));
  fs.writeFileSync(movie, fs.readFileSync(movie, 'utf8').replace('Flash website fixture', 'Charlie'));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [];
  const state = () => app.evaluate(() => global.__flashborn.getState());
  const command = (action, args = {}) => app.evaluate(({}, v) => global.__flashborn.command(v.action, v.args), { action, args });
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); const ui = await app.firstWindow();
    await command('new-tab'); await command('new-tab');
    const ids = await app.evaluate(() => { const api = global.__flashborn; api.tabs.forEach((tab, i) => { tab.title = ['Alpha', 'Bravo', 'Charlie'][i]; }); return api.tabs.map(tab => tab.id); });
    await command('select-tab', { id: ids[2] });
    await app.evaluate(({}, file) => global.__flashborn.openLocal(file, global.__flashborn.activeTab()), movie);
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))')).catch(() => null), ticks => ticks > 2);
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 60, y: 60, width: 1360, height: 900 }); w.show(); w.focus(); });
    const stages = [
      { name: 'tabs', id: ids[2], read: s => s.tabs },
      { name: 'bookmarks', id: bookmarks[2].id, read: s => s.bookmarks },
      { name: 'library', id: library[2].id, read: s => s.library },
      { name: 'downloads', id: downloads[2].id, read: s => s.downloads }
    ];
    for (const stage of stages) {
      if (stage.name !== 'tabs') await command('panel', { name: stage.name });
      await ui.locator(`[data-reorder-id="${stage.id}"]`).waitFor();
      console.log('READY_FOR_REAL_MOUSE ' + stage.name + ': drag Charlie before Alpha');
      await poll(state, s => stage.read(s)[0].id === stage.id);
      assert.equal(await ui.locator('#reorder-line').isVisible(), false);
      assert.equal(await ui.locator('body').getAttribute('data-reordering'), null);
      assert.equal((await state()).activeId, ids[2]);
      passed.push(stage.name); console.log('PASS real Windows pointer drag: ' + stage.name);
    }
    fs.writeFileSync(path.join(output, 'pointer-reorder-results.json'), JSON.stringify({ passed, profile }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
