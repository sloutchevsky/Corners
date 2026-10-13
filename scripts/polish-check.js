'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, predicate, timeout = 30000) { const end = Date.now() + timeout; let value; do { value = await fn(); if (predicate(value)) return value; await wait(100); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
async function run() {
  fs.mkdirSync(output, { recursive: true });
  const profile = path.join(output, 'polish-profile-' + Date.now());
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.write('<!doctype html><title>Loading test</title><p>Loading test</p>'); setTimeout(() => res.end(), 1600); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let app; const results = [], pass = text => { results.push(text); console.log('PASS ' + text); };
  const launch = async () => { app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env, timeout: 45000 }); app.process().stderr.on('data', b => fs.appendFileSync(path.join(output, 'polish-electron.log'), b)); await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.show(); w.focus(); }); return app.firstWindow(); };
  const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
  const state = () => app.evaluate(() => global.__flashborn.getState());
  const script = code => app.evaluate(({}, code) => global.__flashborn.activeTab().native.evaluate(code), code);
  const ready = () => poll(() => script('document.body.dataset.ready'), value => value === 'true', 60000);
  const quality = () => script('document.getElementById("flash-movie").TGetProperty("/",19)');
  try {
    let ui = await launch();
    await command('panel', { name: 'about' });
    // Layout measured before these changes, with the same 1280×820 window bounds.
    const baseline = {
      logo: { x: 356.8000183105469, y: 277, width: 258, height: 34 },
      bolt: { x: 335.8000183105469, y: 145, width: 112, height: 112 },
      motto: { x: 575.4874877929688, y: 10.800000190734863, width: 129.02500915527344, height: 14.40000057220459 },
      controls: { x: 1142, y: 0, width: 138, height: 36 }
    };
    const rect = selector => ui.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    assert.equal(await ui.locator('.title-brand').innerText(), '');
    assert.equal(await ui.locator('.title-note').innerText(), 'A quieter kind of browsing');
    const sameRect = (actual, expected) => { for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - expected[key]) < .1, `${key}: ${actual[key]} versus ${expected[key]}`); };
    sameRect(await rect('.title-note'), baseline.motto); sameRect(await rect('.window-controls'), baseline.controls);
    assert.ok(await ui.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96; const bolt = new GoldLightning(canvas); const same = canvas.toDataURL() === document.getElementById('title-bolt').toDataURL(); bolt.dispose(); return same; }));
    const titlePixels = await ui.locator('#title-bolt').evaluate(el => el.toDataURL());
    pass('Title bar has only the exact first-frame gold bolt; motto and window controls retain their positions');
    sameRect(await rect('.about-bolt'), baseline.bolt); sameRect(await rect('.about-wordmark'), { ...baseline.logo, y: baseline.logo.y + 70 });
    assert.equal(await ui.locator('.about-copy p').first().getAttribute('class'), 'about-dedication');
    const dedication = await ui.locator('.about-dedication').innerText(); assert.ok(dedication.startsWith('This browser is dedicated to the team at Firstborn')); assert.ok(dedication.includes('sloutchevsky@gmail.com'));
    const angle = await ui.locator('#about-bolt').getAttribute('data-angle'); await poll(() => ui.locator('#about-bolt').getAttribute('data-angle'), value => value !== angle);
    fs.writeFileSync(path.join(output, 'about-1.5.0.png'), await ui.screenshot());
    pass('About wordmark moves down exactly 70px, its bolt keeps spinning in place, and the dedication is the first paragraph');
    await command('navigate', { value: `http://127.0.0.1:${server.address().port}/slow` });
    await poll(() => ui.locator('#loading-bolt').getAttribute('data-angle'), value => Number(value) > .2);
    assert.equal(await ui.locator('#title-bolt').evaluate(el => el.toDataURL()), titlePixels); assert.equal(await ui.locator('#title-bolt').getAttribute('data-motion'), 'idle');
    await poll(state, s => !s.tabs.find(t => t.id === s.activeId).loading);
    pass('Title bolt stays on frame one while the toolbar bolt spins during actual page loading');

    await app.evaluate(({}, file) => global.__flashborn.openLocal(file), path.join(root, 'assets', 'Flashborn-Demo.swf')); await ready();
    await ui.locator('#menu-button').click();
    const menu = await poll(() => app.windows().find(page => page.url() === 'flashborn://ui/menu.html'), Boolean);
    assert.deepEqual(await menu.locator('[data-quality]').evaluateAll(buttons => buttons.map(b => b.textContent)), ['Low', 'Medium', 'High']);
    for (const value of ['low', 'medium', 'high', 'medium']) {
      await menu.locator(`[data-quality="${value}"]`).click(); await poll(quality, actual => actual === value.toUpperCase());
      await poll(state, s => s.settings.flashQuality === value); assert.equal(await menu.locator(`[data-quality="${value}"]`).getAttribute('aria-pressed'), 'true');
    }
    assert.ok(await menu.locator('[data-quality="medium"]').evaluate(el => { const r = el.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight; }));
    fs.writeFileSync(path.join(output, 'medium-quality-1.5.0.png'), await menu.screenshot()); await command('menu-close');
    pass('Low, Medium and High buttons change genuine Adobe rendering quality, with the selected state shown in the menu');

    await script('document.getElementById("background").click()');
    const color = await poll(() => app.windows().find(page => page.url() === 'flashborn://ui/color.html'), Boolean);
    await color.evaluate(() => {
      const NativeEyeDropper = window.EyeDropper;
      window.EyeDropper = class extends NativeEyeDropper { open(options) { window.__nativePickStarted = true; const result = super.open(options); result.catch(error => { window.__nativePickError = error.name; }); return result; } };
    });
    const originalColor = (await state()).flashBackground;
    await color.locator('#color-pick').click();
    await poll(() => color.evaluate(() => ({ started: window.__nativePickStarted, error: window.__nativePickError, picking, abort: !!pickAbort })), v => v.started && v.picking && v.abort);
    await wait(500); assert.equal(await color.evaluate(() => window.__nativePickError), undefined); assert.equal((await state()).colorPicking, true);
    await color.evaluate(() => pickAbort.abort());
    await poll(state, s => !s.colorPicking); assert.equal(await color.locator('#color-status').innerText(), 'Color picking canceled.');
    assert.equal(await color.evaluate(() => window.__nativePickError), 'AbortError'); assert.equal((await state()).flashBackground, originalColor); assert.ok(await color.locator('#color-pick').isEnabled());
    pass('Native screen eyedropper opens from a trusted click and cancels without closing the color dialog or changing the background');

    // Resolve a controlled selection to verify all downstream paths without sampling another app's pixels.
    await color.evaluate(() => { window.EyeDropper = class { open() { return new Promise(resolve => { window.__selectColor = resolve; }); } }; });
    await color.locator('#color-pick').click(); await poll(state, s => s.colorPicking);
    await app.evaluate(() => global.__flashborn.colorWindow.emit('blur'));
    assert.ok(await app.evaluate(() => !!global.__flashborn.colorWindow && !global.__flashborn.colorWindow.isDestroyed()));
    await color.evaluate(() => window.__selectColor({ sRGBHex: '#336699' })); await poll(state, s => !s.colorPicking && s.flashBackground === '#336699'); await ready();
    assert.equal(await script('document.getElementById("flash-movie").getAttribute("bgcolor")'), '#336699');
    assert.equal(await color.locator('#color-hex').inputValue(), '#336699'); assert.ok(await color.locator('#color-pick').isEnabled());
    assert.ok(await color.locator('.color-value').evaluate(el => Array.from(el.children).every(child => { const r = child.getBoundingClientRect(); return r.right <= innerWidth - 10 && r.bottom <= innerHeight; })));
    fs.writeFileSync(path.join(output, 'eyedropper-1.5.0.png'), await color.screenshot()); await command('color-close');
    pass('Eyedropper selection reaches the real Flash background and hex field; focus changes during picking keep the dialog open');

    await app.close(); app = null; ui = await launch(); assert.equal((await state()).settings.flashQuality, 'medium');
    await command('panel', { name: 'library' });
    const entry = (await state()).library.find(e => e.background === '#336699'); assert.ok(entry); await command('play-library', { id: entry.id }); await ready();
    await poll(quality, actual => actual === 'MEDIUM'); assert.equal(await script('document.getElementById("flash-movie").getAttribute("bgcolor")'), '#336699');
    pass('Medium quality and picked background persist across restart and initialize a fresh Adobe Flash process');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-polish-results.json' : 'polish-results.json'), JSON.stringify({ count: results.length, passed: results }, null, 2));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
