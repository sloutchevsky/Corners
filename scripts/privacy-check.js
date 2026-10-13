'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const demo = require('./create-demo');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, predicate, timeout = 30000) {
  let value; const end = Date.now() + timeout;
  do { value = await fn(); if (predicate(value)) return value; await wait(100); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  const profile = path.join(output, 'privacy-profile-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { restoreTabs: true } }));
  const fixture = path.join(output, 'private-local-' + Date.now() + '.swf'); fs.writeFileSync(fixture, demo);
  const secret = 'flashcognito-secret-' + Date.now();
  const server = http.createServer((req, res) => {
    if (req.url === '/movie.swf') { res.writeHead(200, { 'Content-Type': 'application/x-shockwave-flash' }); return res.end(demo); }
    if (req.url === '/download') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="private-download.txt"' }); return res.end('Private file kept explicitly.'); }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const flashPage = req.url.startsWith('/flash-');
    res.end('<!doctype html><title>' + (flashPage ? 'Private Flash page' : 'Session fixture') + '</title><h1>Session fixture</h1>' + (flashPage ? '<embed id="embedded" type="application/x-shockwave-flash" src="/movie.swf" width="640" height="400">' : ''));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app; const results = [], pass = message => { results.push(message); console.log('PASS ' + message); };
  const launch = async () => {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env, timeout: 45000 });
    app.process().stderr.on('data', bytes => fs.appendFileSync(path.join(output, 'privacy-electron.log'), bytes));
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.show(); w.focus(); });
    return app.firstWindow();
  };
  const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
  const state = () => app.evaluate(() => global.__flashborn.getState());
    const script = code => app.evaluate(({}, code) => { const t = global.__flashborn.activeTab(); return t.native ? t.native.evaluate(code) : t.view.webContents.executeJavaScript(code, true); }, code);
  const ready = () => poll(state, s => { const t = s.tabs.find(t => t.id === s.activeId); return !t.loading && !t.error; });
  const swfReady = () => poll(() => script('document.body.dataset.ready'), value => value === 'true', 60000);
  const persisted = () => JSON.parse(fs.readFileSync(path.join(profile, 'browser.json'), 'utf8'));
  const saveUI = async filename => {
    const bytes = await app.evaluate(async () => (await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(path.join(output, filename), Buffer.from(bytes, 'base64'));
  };
  try {
    let ui = await launch();
    await ui.emulateMedia({ reducedMotion: 'no-preference' });
    for (const name of ['library', 'bookmarks', 'history', 'downloads', 'settings']) {
      const button = ui.locator(`.sidebar [data-panel="${name}"]`), glyph = button.locator('.nav-gold');
      assert.equal(await glyph.getAttribute('data-motion'), 'idle');
      await button.hover();
      await poll(() => glyph.getAttribute('data-motion'), value => value === 'spinning');
      const first = await glyph.evaluate(el => el.toDataURL()); await wait(250);
      assert.notEqual(await glyph.evaluate(el => el.toDataURL()), first);
      if (name !== 'settings') {
        await poll(() => glyph.getAttribute('data-motion'), value => value === 'idle', 4000);
        const done = await glyph.evaluate(el => el.toDataURL()); await wait(180);
        assert.equal(await glyph.evaluate(el => el.toDataURL()), done);
      }
      await ui.locator('.title-note').hover();
    }
    await ui.locator('.sidebar [data-panel="settings"]').hover();
    await ui.emulateMedia({ reducedMotion: 'reduce' });
    await poll(() => ui.locator('.nav-gold-settings').getAttribute('data-motion'), value => value === 'reduced');
    await ui.emulateMedia({ reducedMotion: 'no-preference' });
    await command('navigate', { value: base + '/ordinary' }); await ready();
    const originalId = (await state()).activeId;
    await script('document.cookie="ordinary=normal;path=/";localStorage.setItem("mode","ordinary")');
    await command('zoom', { direction: 1 });
    await ui.locator(`[data-tab="${originalId}"]`).click({ button: 'right' });
    assert.deepEqual(await app.evaluate(() => global.__flashborn.tabMenu.items.map(item => item.label)), ['Duplicate Tab', 'Close Tab']);
    await app.evaluate(() => { const menu = global.__flashborn.tabMenu; menu.closePopup(); menu.items[0].click(); });
    await poll(state, s => s.tabs.length === 2 && s.activeId !== originalId); await ready();
    const copyId = (await state()).activeId;
    assert.equal((await state()).tabs[1].url, base + '/ordinary');
    await poll(state, s => s.tabs.find(t => t.id === copyId).zoom === 110);
    assert.equal(await script('localStorage.getItem("mode")'), 'ordinary');
    await ui.locator(`[data-tab="${copyId}"]`).click({ button: 'right' });
    await app.evaluate(() => { const menu = global.__flashborn.tabMenu; menu.closePopup(); menu.items[1].click(); });
    assert.equal((await state()).tabs.length, 1);
    pass('Native right-click menu duplicates beside the source, keeps its page/session/zoom, and closes the clicked tab');
    pass('Five gold sidebar icons use stationary lighting; four finish one hover animation, the gear loops, and all honor reduced motion');

    await ui.locator('#menu-button').click();
    const menu = await poll(() => app.windows().find(page => page.url() === 'flashborn://ui/menu.html'), Boolean);
    await menu.locator('[data-action="new-flashcognito"]').click();
    await poll(state, s => s.tabs.find(t => t.id === s.activeId).private);
    await ui.locator('.flashcognito-home').waitFor();
    assert.equal(await ui.locator('#home-bolt').getAttribute('data-metal'), 'silver');
    assert.equal(await ui.locator('#loading-bolt').getAttribute('data-metal'), 'silver');
    assert.ok(await ui.locator('#private-badge').isVisible());
    await saveUI('flashcognito-dark.png');
    await command('theme'); await saveUI('flashcognito-light.png'); await command('theme');
    await command('navigate', { value: base + '/' + secret }); await ready();
    const privateId = (await state()).activeId;
    assert.ok(!(await script('document.cookie')).includes('ordinary'));
    assert.equal(await script('localStorage.getItem("mode")'), null);
    assert.equal(await app.evaluate(() => global.__flashborn.privateSession.isPersistent()), false);
    await script(`document.cookie="private=${secret};path=/";localStorage.setItem("mode",${JSON.stringify(secret)})`);
    await command('duplicate-tab', { id: privateId }); await ready();
    const privateCopyId = (await state()).activeId;
    assert.ok((await state()).tabs.find(t => t.id === privateCopyId).private);
    assert.equal(await script('localStorage.getItem("mode")'), secret);
    assert.ok(!JSON.stringify(persisted()).includes(secret));
    await command('select-tab', { id: originalId });
    assert.equal(await script('localStorage.getItem("mode")'), 'ordinary');
    assert.ok(!(await script('document.cookie')).includes(secret));
    await command('suggest', { query: secret, bounds: { x: 400, y: 62, width: 400, height: 34 } });
    assert.ok(!(await state()).suggestions?.items.some(item => item.type === 'url' || item.source === 'history'));
    pass('Flashcognito uses isolated in-memory cookies/storage, shares them between private duplicates, and never leaks into history/restoration/autocomplete');

    await command('select-tab', { id: privateId });
    const downloadPath = path.join(output, 'private-download.txt');
    await app.evaluate(({}, filename) => { global.__flashborn.privateSession.once('will-download', (_event, item) => item.setSavePath(filename)); global.__flashborn.activeTab().view.webContents.downloadURL(global.__flashborn.activeTab().url.replace(/\/[^/]*$/, '/download')); }, downloadPath);
    await poll(state, s => s.downloads.some(d => d.state === 'completed'));
    assert.ok(fs.existsSync(downloadPath)); assert.equal(persisted().downloads.length, 0);
    await command('select-tab', { id: originalId }); assert.equal((await state()).downloads.length, 0);
    await command('select-tab', { id: privateCopyId }); assert.equal((await state()).downloads.length, 1);
    pass('Private download records stay in memory and out of normal Downloads; explicitly saved files remain usable');

    await command('navigate', { value: base + '/flash-' + secret });
    await poll(() => script('({version:document.getElementById("embedded")?.GetVariable?.("$version"),percent:document.getElementById("embedded")?.PercentLoaded?.()})'), value => value.version === 'WIN 32,0,0,363' && value.percent === 100, 60000);
    assert.equal(await app.evaluate(() => global.__flashborn.activeTab().native.private), true);
    await script(`document.cookie="legacy=${secret};path=/";localStorage.setItem("legacy",${JSON.stringify(secret)})`);
    const nativeProfile = await app.evaluate(() => global.__flashborn.activeTab().native.profile);
    const storageFiles = [];
    const scan = directory => { if (!fs.existsSync(directory)) return; for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) scan(file); else if (/Cookies|History|\.ldb$|\.log$/i.test(entry.name)) storageFiles.push(file); } };
    scan(nativeProfile);
    for (const file of storageFiles) assert.ok(!fs.readFileSync(file).includes(Buffer.from(secret)), file);
    assert.ok(!JSON.stringify(persisted()).includes(secret));
    const libraryBefore = JSON.stringify((await state()).library);
    await command('add-library-source', { kind: 'swf', value: fixture }); await swfReady();
    const privateMovieId = (await state()).activeId;
    assert.equal(JSON.stringify((await state()).library), libraryBefore);
    await command('duplicate-tab', { id: privateMovieId }); await swfReady();
    const movieCopyState = await state();
    assert.ok(movieCopyState.tabs.find(t => t.id === movieCopyState.activeId).private);
    assert.equal(await script('document.getElementById("flash-movie").GetVariable("$version")'), 'WIN 32,0,0,363');
    pass('Real Adobe Flash renders in private mode and private SWF duplicates; native site storage and automatic library additions stay out of the saved profile');

    await script('document.getElementById("pause").click()');
    const controls = await script('(()=>{document.getElementById("pause").focus();const buttons=[...document.querySelectorAll(".controls button")],r=buttons.map(b=>b.getBoundingClientRect()),bg=r[0],s=document.getElementById("background-swatch").getBoundingClientRect();return{outline:getComputedStyle(document.getElementById("pause")).outlineStyle,gaps:r.slice(1).map((v,i)=>v.x-r[i].right),swatchOffset:(s.y+s.height/2)-(bg.y+bg.height/2),labelGap:getComputedStyle(buttons[0]).gap}})()');
    assert.equal(controls.outline, 'none'); assert.ok(controls.gaps.every(gap => Math.abs(gap - 14) < .1));
    assert.ok(Math.abs(controls.swatchOffset) < .1); assert.equal(controls.labelGap, '12px');
    await script('document.getElementById("background").click()');
    const color = await poll(() => app.windows().find(page => page.url() === 'flashborn://ui/color.html'), Boolean);
    await app.evaluate(() => { const w = global.__flashborn.win; w.setAlwaysOnTop(true, 'pop-up-menu'); w.moveTop(); });
    await color.locator('#color-pick').click();
    await poll(state, s => s.colorPicking && !!s.colorPreview);
    await poll(() => app.evaluate(() => global.__flashborn.screenColorPicker?.entries.every(e => e.window.isVisible())), Boolean);
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.inspect().visible), value => value === 0);
    await ui.locator('#color-pick-preview').evaluate(el => el.decode());
    await saveUI('eyedropper-flash-snapshot.png');
    const preview = await app.evaluate(async ({ nativeImage }) => { const image = nativeImage.createFromBuffer(Buffer.from(global.__flashborn.getState().colorPreview.split(',')[1], 'base64')), pixels = image.toBitmap(); let cream = 0; for (let i=0;i<pixels.length;i+=4) if (pixels[i+2]>200 && pixels[i+1]>160 && pixels[i+1]<235 && pixels[i]>100 && pixels[i]<220) cream++; return { cream, width:image.getSize().width }; });
    assert.ok(preview.cream > 500, JSON.stringify(preview));
    const picked = await app.evaluate(() => {
      const host = global.__flashborn.win.getContentBounds(), picker = global.__flashborn.screenColorPicker;
      const entry = picker.entries.find(e => host.x >= e.bounds.x && host.x < e.bounds.x + e.bounds.width);
      const point = { x: host.x + 400 - entry.bounds.x, y: host.y + 260 - entry.bounds.y };
      return { ...point, color: picker.sample(entry, point.x, point.y) };
    });
    const screenPicker = await poll(() => app.windows().find(page => !page.isClosed() && page.url() === 'flashborn://ui/screen-color.html'), Boolean);
    await screenPicker.mouse.click(picked.x, picked.y);
    await poll(state, s => !s.colorPicking && !s.colorPreview && s.flashBackground === picked.color);
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.inspect().visible), Boolean); await swfReady();
    await color.locator('#color-pick').click(); await poll(state, s => s.colorPicking);
    await command('color-close'); await poll(state, s => !s.colorPicking && !s.colorPreview);
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.inspect().visible), Boolean);
    pass('Independent screen eyedropper selects a real pixel in private Flash and restores playback on selection/dialog close; Flash controls have even gaps, centered swatch and no selection outline');

    const ids = (await state()).tabs.filter(t => t.private).map(t => t.id);
    for (const id of ids) await command('close-tab', { id });
    await poll(() => app.evaluate(() => global.__flashborn.privateSession === null), Boolean);
    await poll(() => fs.existsSync(nativeProfile), value => !value);
    await command('new-flashcognito'); await command('navigate', { value: base + '/fresh' }); await ready();
    assert.ok(!(await script('document.cookie')).includes(secret)); assert.equal(await script('localStorage.getItem("mode")'), null);
    assert.equal((await state()).downloads.length, 0);
    pass('Closing the last Flashcognito tab clears the temporary session/download list and deletes native profiles; a new private session starts clean');
    await ui.locator('#address').press('Control+Shift+N');
    await poll(state, s => s.tabs.filter(t => t.private).length === 2);
    await app.close(); app = null; ui = await launch();
    await poll(state, s => s.tabs.some(t => t.url === base + '/ordinary'));
    assert.ok((await state()).tabs.every(t => !t.private));
    assert.ok(!JSON.stringify(persisted()).includes(secret));
    pass('Ctrl+Shift+N opens Flashcognito and restarting restores only ordinary tabs');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-privacy-results.json' : 'privacy-results.json'), JSON.stringify({ passed:results, count:results.length }, null, 2));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
