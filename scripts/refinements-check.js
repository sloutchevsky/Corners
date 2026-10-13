'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const demo = require('./create-demo'), captureVisible = require('./capture-visible');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, predicate, timeout = 30000) { const end = Date.now() + timeout; let value; do { value = await fn(); if (predicate(value)) return value; await wait(120); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
async function run() {
  const fixture = path.join(output, 'refinement-fixtures'); fs.mkdirSync(fixture, { recursive: true });
  const html = '<!doctype html><title>Local Flash HTML</title><link rel="stylesheet" href="style.css"><h1>Flash HTML</h1><embed id="embedded" type="application/x-shockwave-flash" src="movie.swf" width="640" height="400">';
  fs.writeFileSync(path.join(fixture, 'Flash.html'), html); fs.writeFileSync(path.join(fixture, 'movie.swf'), demo); fs.writeFileSync(path.join(fixture, 'style.css'), 'h1{color:rgb(30,120,210)}');
  fs.writeFileSync(path.join(output, 'outside.html'), 'outside selected HTML folder');
  const server = http.createServer((req, res) => {
    if (req.url === '/movie.swf') { res.writeHead(200, { 'Content-Type': 'application/x-shockwave-flash' }); res.end(demo); }
    else if (req.url === '/Flash.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); }
    else if (req.url === '/style.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end('h1{color:rgb(30,120,210)}'); }
    else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Visual zoom fixture</title><div style="width:100px;height:50px;background:#ff0000"></div><p>Zoom proof</p>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, profile = path.join(output, 'refinements-profile-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ bookmarks: [1, 2, 3].map(n => ({ id: 'bookmark-' + n, title: 'Bookmark ' + n, url: base + '/' + n })), history: Array.from({ length: 50 }, (_, n) => ({ id: 'history-' + n, title: 'History ' + n, url: base + '/history-' + n, visitedAt: new Date().toISOString() })), settings: { restoreTabs: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app; const results = [], pass = text => { results.push(text); console.log('PASS ' + text); };
  const launch = async () => { app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env, timeout: 45000 }); app.process().stderr.on('data', b => fs.appendFileSync(path.join(output, 'refinements-electron.log'), b)); await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.show(); w.focus(); }); return app.firstWindow(); };
  const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
  const state = () => app.evaluate(() => global.__flashborn.getState());
  const script = code => app.evaluate(({}, code) => { const t = global.__flashborn.activeTab(); return t.native ? t.native.evaluate(code) : t.view.webContents.executeJavaScript(code, true); }, code);
  const wheel = direction => app.evaluate(async ({}, direction) => { const t = global.__flashborn.activeTab(); if (t.native) await t.native.call('test-wheel', { deltaY: 120 * direction, x: 150, y: 170 }); else { const wc = t.view.webContents; if (!wc.debugger.isAttached()) wc.debugger.attach('1.3'); await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 450, y: 300, deltaX: 0, deltaY: -120 * direction, modifiers: 2 }); } }, direction);
  const key = keyCode => app.evaluate(({}, keyCode) => { const wc = global.__flashborn.activeTab().view.webContents; wc.focus(); wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['control'] }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers: ['control'] }); }, keyCode);
  // Windows' display ICC profile changes captured RGB values; classify colors by dominance.
  const pixels = async () => app.evaluate(async () => { const image = await global.__flashborn.activeTab().view.webContents.capturePage(), data = image.toBitmap(); let red = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] > 150) red++; return red; });
  const swfReady = () => poll(() => script('document.body.dataset.ready'), value => value === 'true', 60000);
  const htmlReady = () => poll(() => script('({percent:document.getElementById("embedded")?.PercentLoaded?.(),version:document.getElementById("embedded")?.GetVariable?.("$version"),css:getComputedStyle(document.querySelector("h1")).color})'), value => value.percent === 100 && value.version === 'WIN 32,0,0,363' && value.css === 'rgb(30, 120, 210)', 60000);
  try {
    let ui = await launch();
    await command('navigate', { value: base + '/zoom' }); await poll(state, s => !s.tabs.find(t => t.id === s.activeId).loading);
    await poll(pixels, n => n > 4000); const baseline = await pixels(), viewport = await script('innerWidth');
    await key('='); await poll(state, s => s.tabs.find(t => t.id === s.activeId).zoom === 110);
    await poll(pixels, n => n > baseline * 1.15 && n < baseline * 1.28);
    assert.ok(Math.abs((await script('innerWidth')) - viewport / 1.1) < 2);
    await key('-'); await poll(state, s => s.tabs.find(t => t.id === s.activeId).zoom === 100); await poll(pixels, n => Math.abs(n - baseline) < baseline * .02);
    await wheel(1); await poll(state, s => s.tabs.find(t => t.id === s.activeId).zoom === 110); await poll(pixels, n => n > baseline * 1.15);
    await wheel(-1); await poll(state, s => s.tabs.find(t => t.id === s.activeId).zoom === 100); await poll(pixels, n => Math.abs(n - baseline) < baseline * .02);
    await ui.locator('#address').click(); await ui.locator('#address').press('Control+='); await poll(pixels, n => n > baseline * 1.15);
    await ui.locator('#address').press('Control+0'); await poll(pixels, n => Math.abs(n - baseline) < baseline * .02);
    pass('Ctrl+/−, Ctrl+wheel and address-field shortcuts visibly scale page pixels and CSS viewport; reset restores original size');

    const positions = [];
    for (const name of ['history', 'bookmarks', 'downloads', 'settings', 'library']) { await command('panel', { name }); positions.push(await ui.locator('.panel h1').evaluate(el => el.getBoundingClientRect().x)); }
    assert.ok(Math.max(...positions) - Math.min(...positions) < .1, JSON.stringify(positions));
    pass('History headings align with the other panels even when History needs a scrollbar');
    await command('panel', { name: 'bookmarks' });
    const first = ui.locator('[data-reorder-id="bookmark-1"]'), last = ui.locator('[data-reorder-id="bookmark-3"]');
    const height = await first.evaluate(el => el.getBoundingClientRect().height);
    await last.dragTo(first, { sourcePosition: { x: 24, y: height / 2 }, targetPosition: { x: 24, y: 3 } });
    await poll(state, s => s.bookmarks[0].id === 'bookmark-3');
    await ui.locator('[data-reorder-id="bookmark-3"] .reorder-handle').press('Alt+ArrowDown'); await poll(state, s => s.bookmarks[1].id === 'bookmark-3');
    const bookmarkOrder = (await state()).bookmarks.map(b => b.id);
    pass('Bookmarks reorder through dragging and Alt+arrow shortcuts');

    await command('panel', { name: 'library' }); await ui.locator('[data-open-library="swf"]').click();
    await ui.locator('#library-open-address').fill(path.join(fixture, 'movie.swf')); await ui.locator('#library-open-form button[type="submit"]').click(); await swfReady();
    const swfId = (await state()).activeId, entryId = (await state()).library[0].id;
    assert.equal(await script('document.getElementById("flash-movie").getAttribute("bgcolor")'), '#ffffff');
    assert.equal(await script('getComputedStyle(document.getElementById("stage")).backgroundColor'), 'rgb(255, 255, 255)');
    for (let n = 0; n < 3; n++) {
      await script('document.getElementById("fullscreen").click()'); await poll(state, s => s.fullscreen);
      await poll(() => script('document.getElementById("fullscreen").textContent'), text => text === 'Exit full screen');
      assert.ok(await script('document.querySelector("header").getBoundingClientRect().height > 50 && !document.fullscreenElement'));
      await script('document.getElementById("fullscreen").click()'); await poll(state, s => !s.fullscreen);
      await poll(() => script('document.getElementById("fullscreen").textContent'), text => text === 'Full screen');
      assert.ok(await script('document.elementFromPoint(20,20).closest("header") !== null'));
    }
    await script('document.getElementById("stage").requestFullscreen()'); await poll(state, s => s.fullscreen);
    await command('fullscreen', { value: false });
    await poll(state, s => !s.fullscreen); await poll(() => script('!!document.fullscreenElement'), value => !value);
    assert.ok(await script('document.elementFromPoint(20,20).closest("header") !== null'));
    pass('SWF bar survives repeated fullscreen toggles and exit from HTML fullscreen');

    await script('document.getElementById("pause").click()'); const frame = await script('document.getElementById("flash-movie").CurrentFrame()');
    await script('document.getElementById("background").click()');
    const color = await poll(() => app.windows().find(page => page.url() === 'flashborn://ui/color.html'), Boolean);
    assert.ok(await app.evaluate(() => global.__flashborn.colorWindow.isAlwaysOnTop()));
    await color.locator('#color-wheel').click({ position: { x: 35, y: 90 } });
    await poll(state, s => s.flashBackground !== '#ffffff'); await swfReady();
    await color.locator('#color-hex').fill('#00ff00'); await color.locator('#color-hex').press('Tab');
    await poll(state, s => s.flashBackground === '#00ff00'); await swfReady();
    assert.equal(await script('document.getElementById("flash-movie").CurrentFrame()'), frame);
    assert.equal(await script('document.getElementById("flash-movie").IsPlaying()'), false);
    assert.equal(await script('document.getElementById("flash-movie").getAttribute("bgcolor")'), '#00ff00');
    const popupPNG = await color.screenshot(); fs.writeFileSync(path.join(output, 'color-wheel.png'), popupPNG);
    await command('color-close'); await wait(500);
    const visible = await captureVisible(app); fs.writeFileSync(path.join(output, 'swf-background-green.png'), Buffer.from(visible.png, 'base64'));
    const green = await app.evaluate(({ nativeImage }, png) => { const p = nativeImage.createFromBuffer(Buffer.from(png, 'base64')).toBitmap(); let count = 0; for (let i = 0; i < p.length; i += 4) if (p[i + 1] > 130 && p[i + 1] > p[i] * 1.5 && p[i + 1] > p[i + 2] * 1.3) count++; return count; }, visible.png);
    assert.ok(green > 10000, 'Background must visibly change inside the real Flash player: ' + green);
    pass('Color wheel stays above native Flash, defaults white, changes rendered movie background, and retains paused timeline position');

    const imagePath = path.join(fixture, 'Library-art.png');
    const art = await app.evaluate(({ nativeImage }) => { const p = Buffer.alloc(320 * 160 * 4); for (let y = 0; y < 160; y++) for (let x = 0; x < 320; x++) { const i = (y * 320 + x) * 4; p[i] = 100 + Math.round(x / 3); p[i + 1] = 60 + y; p[i + 2] = 220; p[i + 3] = 255; } return nativeImage.createFromBitmap(p, { width: 320, height: 160 }).toPNG().toString('base64'); }); fs.writeFileSync(imagePath, Buffer.from(art, 'base64'));
    await command('panel', { name: 'library' });
    await app.evaluate(({ dialog }, file) => { global.__previousOpenDialog = dialog.showOpenDialog; dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, imagePath);
    await ui.locator(`[data-library-image="${entryId}"]`).click(); await poll(state, s => !!s.library.find(e => e.id === entryId).image);
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = global.__previousOpenDialog; });
    const img = ui.locator(`[data-library-image="${entryId}"] img`); await poll(() => img.evaluate(el => el.complete && el.naturalWidth === 320), Boolean);
    const ratio = await ui.locator(`[data-library-image="${entryId}"]`).evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; }); assert.equal(ratio, 2);
    const previousImage = (await state()).library.find(e => e.id === entryId).image;
    const targetRect = await ui.locator(`[data-library-image="${entryId}"]`).boundingBox();
    const cdp = await ui.context().newCDPSession(ui); await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: targetRect.x + 20, y: targetRect.y + 20, data: { items: [], files: [imagePath], dragOperationsMask: 1 } }); await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: targetRect.x + 20, y: targetRect.y + 20, data: { items: [], files: [imagePath], dragOperationsMask: 1 } }); await cdp.detach();
    await poll(state, s => s.library.find(e => e.id === entryId).image !== previousImage);
    await ui.locator(`[data-remove-library-image="${entryId}"]`).focus(); await ui.locator(`[data-remove-library-image="${entryId}"]`).click(); await poll(state, s => !s.library.find(e => e.id === entryId).image);
    await app.evaluate(({ dialog }, file) => { global.__previousOpenDialog = dialog.showOpenDialog; dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, imagePath); await ui.locator(`[data-library-image="${entryId}"]`).click(); await poll(state, s => !!s.library.find(e => e.id === entryId).image); await app.evaluate(({ dialog }) => { dialog.showOpenDialog = global.__previousOpenDialog; });
    fs.writeFileSync(path.join(output, 'library-thumbnails.png'), await ui.screenshot());
    pass('2:1 library thumbnails support choose, image drop, change and removal without modifying source images');

    await ui.locator('[data-open-library="html"]').click(); await ui.locator('#library-open-address').fill(path.join(fixture, 'Flash.html')); await ui.locator('#library-open-form button[type="submit"]').click(); await htmlReady();
    const htmlEntry = (await state()).library.find(e => e.kind === 'html' && e.path), htmlTab = (await state()).activeId;
    assert.ok(htmlEntry); assert.equal(await script('typeof require'), 'undefined');
    const outside = await script('fetch("../outside.html").then(r=>r.status).catch(()=>0)'); assert.notEqual(outside, 200);
    pass('HTML library opens local Flash pages with real Adobe execution and scoped CSS/SWF companion files');
    await command('panel', { name: 'library' }); await ui.locator('[data-open-library="html"]').click(); await ui.locator('#library-open-address').fill(base + '/Flash.html'); await ui.locator('#library-open-form button[type="submit"]').click(); await htmlReady();
    assert.ok((await state()).library.some(e => e.kind === 'html' && e.url === base + '/Flash.html'));
    await command('panel', { name: 'library' }); await ui.locator('[data-open-library="swf"]').click(); await ui.locator('#library-open-address').fill(base + '/movie.swf'); await ui.locator('#library-open-form button[type="submit"]').click(); await swfReady();
    assert.ok((await state()).library.some(e => e.url === base + '/movie.swf' && e.kind === 'swf'));
    await command('panel', { name: 'library' }); await ui.locator(`[data-library="${htmlEntry.id}"]`).first().click(); await htmlReady();
    await command('navigate', { value: path.join(fixture, 'Flash.html') }); await poll(state, s => s.tabs.find(t => t.id === s.activeId).native); await htmlReady();
    pass('Both library Open buttons accept URLs and local paths; saved HTML entries replay and local HTML address navigation detects Flash');

    await app.close(); app = null; ui = await launch();
    assert.deepEqual((await state()).bookmarks.map(b => b.id), bookmarkOrder);
    await command('panel', { name: 'library' });
    await poll(() => ui.locator(`[data-library-image="${entryId}"] img`).evaluate(el => el.complete && el.naturalWidth === 320), Boolean);
    await command('play-library', { id: entryId }); await swfReady(); assert.equal(await script('document.getElementById("flash-movie").getAttribute("bgcolor")'), '#00ff00');
    pass('Bookmark order, thumbnails, SWF/HTML entries and per-movie background persist across application restart');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-refinements-results.json' : 'refinements-results.json'), JSON.stringify({ passed: results, count: results.length }, null, 2));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
