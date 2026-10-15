'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 30000) {
  let value; const end = Date.now() + timeout;
  do { try { value = await fn(); } catch { value = null; } if (check(value)) return value; await wait(80); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'website-only-' + Date.now());
  const html = require('./html-fixture')(path.join(profile, 'site'));
  const swf = path.join(path.dirname(html), 'movie.swf');
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({
    tabs: [{ kind: 'flash', source: { path: swf } }, { kind: 'home' }, { kind: 'local', path: html, title: 'Restored HTML page', native: true }, { kind: 'web', url: 'https://example.com/movie.swf', native: true }],
    activeTabIndex: 2,
    library: [{ id: 'old-swf', path: swf, title: 'Old movie' }, { id: 'html', path: html, kind: 'html', title: 'Website' }, { id: 'mislabelled', kind: 'html', url: 'https://example.com/movie.swf' }],
    settings: { restoreTabs: true, theme: 'light' }
  }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = text => { passed.push(text); console.log('PASS ' + text); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const native = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.activeTab().native.call(data.action, data.args), { action, args });
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.show(); w.focus(); });
    await poll(() => native('evaluate', { code: 'document.querySelector("embed")?.GetVariable("$version")' }), value => value === ('WIN ' + require('../src/legacy/runtime.json').version.replaceAll('.', ',')));
    const initial = await state(), htmlId = initial.activeId;
    assert.equal(initial.tabs.length, 2);
    assert.equal(initial.tabs.find(tab => tab.id === htmlId).kind, 'local');
    assert.deepEqual(initial.library.map(entry => entry.id), ['html']);
    assert.ok(fs.existsSync(swf));
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'browser.json'))).library.length, 3);
    pass('Upgrade skips obsolete SWF tabs, retains the selected HTML tab, hides raw SWF library records and preserves original files/data');

    for (const [action, args] of [['navigate', { value: swf }], ['navigate', { value: 'https://example.com/movie.swf?x=1' }], ['add-library-source', { kind: 'swf', value: swf }], ['add-library-source', { kind: 'html', value: 'https://example.com/movie.swf' }], ['play-library', { id: 'old-swf' }], ['flash-background', { color: '#ff0000' }], ['color-pick-screen', {}]]) {
      await assert.rejects(command(action, args));
    }
    await assert.rejects(native('movie', { path: swf }), /Unsupported native Flash command/);
    const obsoleteRoute = await native('evaluate', { code: 'fetch("flashnative://player/config.json").then(r=>r.status).catch(()=>0)' });
    assert.notEqual(obsoleteRoute, 200);
    assert.equal((await state()).tabs.length, 2);
    pass('Direct file/URL/library SWFs, removed player IPC and old player protocol routes cannot launch the standalone player');

    const filters = await app.evaluate(async ({ dialog }) => {
      const original = dialog.showOpenDialog; let options;
      dialog.showOpenDialog = async (_window, value) => { options = value; return { canceled: true, filePaths: [] }; };
      try { await global.__flashborn.command('open-file'); return options.filters; } finally { dialog.showOpenDialog = original; }
    });
    assert.ok(filters.every(filter => !filter.extensions.includes('swf')));
    await command('panel', { name: 'library' });
    assert.equal(await ui.locator('[data-open-library="swf"]').count(), 0);
    assert.equal(await ui.locator('.sidebar .pill').count(), 0);
    await command('new-tab'); await ui.locator('.home').waitFor();
    assert.ok(!(await ui.locator('.home').innerText()).includes('Open a SWF'));
    assert.equal(await ui.locator('#color-pick-preview').count(), 0);
    pass('New tabs, library, sidebar and file chooser expose no standalone SWF or color-picker controls');

    await command('select-tab', { id: htmlId });
    const before = await native('test-playback');
    assert.equal(before.settingsRuns, 0); assert.equal(before.normalRendererPriority, true);
    for (let i = 0; i < 3; i++) { await command('theme'); await command('panel', { name: 'bookmarks' }); await command('panel', { name: null }); }
    await wait(1500);
    assert.equal((await native('test-playback')).settingsRuns, 0);
    const input = await app.evaluate(async () => {
      const n = global.__flashborn.activeTab().native, original = n.call.bind(n);
      n.focus(); await new Promise(resolve => setTimeout(resolve, 120));
      const before = n.inputState(); let calls = 0;
      n.call = (action, args) => { if (action === 'focus') calls++; return original(action, args); };
      for (let i = 0; i < 8; i++) n.focus();
      n.call = original; return { before, after: n.inputState(), calls };
    });
    assert.ok(input.before.focus > 0); assert.equal(input.after.focus, input.before.focus); assert.equal(input.calls, 0);
    pass('Theme, panel visibility and repeated focus restoration perform no automatic Flash API calls or focus transfers into an already-focused movie');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-website-results.json' : 'website-results.json'), JSON.stringify({ passed, input, completedAt: new Date().toISOString() }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
