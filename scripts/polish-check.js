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
  const ready = () => poll(() => script('document.getElementById("flash-movie")?.GetVariable("$version")'), value => value === 'WIN 34,0,0,376', 60000);
  const quality = () => script('document.getElementById("flash-movie").TGetProperty("/",19)');
  try {
    let ui = await launch();
    assert.equal(await ui.locator('.home-mark').count(), 0);
    assert.ok(!(await ui.locator('.home').innerText()).includes('Your corner of the web'));
    await ui.locator('#home-bolt').click(); await poll(state, s => s.panel === 'library');
    await command('panel', { name: null });
    await ui.locator('.flash-card-description').click(); await poll(state, s => s.panel === 'library');
    await command('panel', { name: null });
    assert.equal(await ui.locator('#home-bolt').getAttribute('data-angle'), '0.0000');
    assert.ok(await ui.locator('#home-bolt').evaluate(el => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = el.width; const bolt = new GoldLightning(canvas); const same = canvas.toDataURL() === el.toDataURL(); bolt.dispose(); return same; }));
    const appIcon = await app.evaluate(({ app }) => process.getBuiltinModule('fs').readFileSync(process.getBuiltinModule('path').join(app.getAppPath(), 'assets', 'icon.png')).toString('base64'));
    assert.deepEqual(Buffer.from(appIcon, 'base64'), fs.readFileSync(path.join(root, 'assets', 'icon.png')));
    const ico = fs.readFileSync(path.join(root, 'assets', 'icon.ico'));
    assert.deepEqual(fs.readFileSync(path.join(root, 'src', 'ui', 'brand', 'bolt.png')), fs.readFileSync(path.join(root, 'assets', 'icon.png')));
    assert.equal(ico.readUInt16LE(4), 7);
    const sizes = [];
    for (let n = 0; n < ico.readUInt16LE(4); n++) {
      const entry = 6 + n * 16, size = ico[entry] || 256; sizes.push(size);
      const frame = await ui.evaluate(size => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; const bolt = new GoldLightning(canvas); const png = canvas.toDataURL().split(',')[1]; bolt.dispose(); return png; }, size);
      assert.deepEqual(ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8)), Buffer.from(frame, 'base64'));
    }
    assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
    fs.writeFileSync(path.join(output, 'new-tab-1.5.1.png'), await ui.screenshot());
    pass('New Tab bolt tile and caption both open the library; the obsolete top label is removed and the tile matches the Windows icon frame');
    await command('panel', { name: 'about' });
    // Layout measured before these changes, with the same 1280×820 window bounds.
    const baseline = {
      logo: { x: 356.8000183105469, y: 347, width: 258, height: 34 },
      bolt: { x: 335.8000183105469, y: 145, width: 112, height: 112 },
      motto: { x: 575.4874877929688, y: 10.800000190734863, width: 129.02500915527344, height: 14.40000057220459 },
      controls: { x: 1142, y: 0, width: 138, height: 36 }
    };
    const rect = selector => ui.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    assert.equal(await ui.locator('.title-brand').innerText(), '');
    assert.equal(await ui.locator('.title-note').innerText(), 'A quieter kind of browsing');
    const sameRect = (actual, expected) => { for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - expected[key]) < .1, `${key}: ${actual[key]} versus ${expected[key]}`); };
    sameRect(await rect('.title-note'), baseline.motto); sameRect(await rect('.window-controls'), baseline.controls);
    assert.ok(await ui.evaluate(() => { const canvas = document.createElement('canvas'), title = document.getElementById('title-bolt'); canvas.width = canvas.height = title.width; const bolt = new GoldLightning(canvas); const same = canvas.toDataURL() === title.toDataURL(); bolt.dispose(); return same; }));
    const titlePixels = await ui.locator('#title-bolt').evaluate(el => el.toDataURL());
    pass('Title bar has only the exact first-frame gold bolt; motto and window controls retain their positions');
    sameRect(await rect('.about-bolt'), { ...baseline.bolt, width: baseline.bolt.width * .7, height: baseline.bolt.height * .7 });
    sameRect(await rect('.about-wordmark'), { ...baseline.logo, width: baseline.logo.width * .7, height: baseline.logo.height * .7 });
    assert.ok(Math.abs((await rect('.about-motto')).y - 444.20001220703125) < .1);
    assert.equal(await ui.locator('.about-text p').first().getAttribute('class'), 'about-motto');
    assert.equal(await ui.locator('.about-text > p').nth(1).getAttribute('class'), 'about-dedication');
    assert.equal(await ui.locator('.about-email').getAttribute('aria-label'), 'Copy email address');
    const dedication = await ui.locator('.about-dedication').innerText(); assert.ok(dedication.startsWith('This browser is dedicated to the team at Firstborn')); assert.ok(dedication.includes('sloutchevsky@gmail.com'));
    const angle = await ui.locator('#about-bolt').getAttribute('data-angle'); await poll(() => ui.locator('#about-bolt').getAttribute('data-angle'), value => value !== angle);
    const expectedOrder = ['about-motto', 'about-dedication', 'about-detail', 'about-note', 'about-copyright', 'about-license'];
    assert.deepEqual(await ui.locator('.about-text').evaluate(el => Array.from(el.children).map(child => child.className)), expectedOrder);
    for (const theme of ['current', 'light']) {
      if ((await state()).settings.theme !== theme) await command('theme');
      await poll(() => ui.locator('body').getAttribute('data-theme'), value => value === theme);
      const colors = await ui.evaluate(() => ({ primary: [...document.querySelectorAll('.about-motto,.about-dedication,.about-email')].map(el => getComputedStyle(el).color), secondary: [...document.querySelectorAll('.about-detail dt,.about-detail dd,.about-note,.about-copyright,.about-license,.about-license summary')].map(el => getComputedStyle(el).color) }));
      assert.ok(colors.primary.every(color => color === (theme === 'current' ? 'rgb(255, 255, 255)' : 'rgb(51, 51, 51)')), JSON.stringify(colors));
      assert.ok(colors.secondary.every(color => color === 'rgb(128, 128, 128)'), JSON.stringify(colors));
      fs.writeFileSync(path.join(output, `about-${theme}-1.5.1.png`), await ui.screenshot());
    }
    await command('theme');
    await ui.locator('.about-email').click();
    await poll(() => app.evaluate(({ clipboard }) => clipboard.readText()), value => value === 'sloutchevsky@gmail.com');
    await ui.locator('.email-copied').waitFor({ state: 'visible' }); assert.equal((await state()).panel, 'about');
    pass('About branding is 30% smaller, body starts 40px lower, paragraphs follow the requested order and both themes use 50% grey metadata');
    pass('About email copies the exact address and shows Copied! while keeping the About panel open');
    await command('navigate', { value: `http://127.0.0.1:${server.address().port}/slow` });
    await poll(() => ui.locator('#loading-bolt').getAttribute('data-angle'), value => Number(value) > .2);
    assert.equal(await ui.locator('#title-bolt').evaluate(el => el.toDataURL()), titlePixels); assert.equal(await ui.locator('#title-bolt').getAttribute('data-motion'), 'idle');
    await poll(state, s => !s.tabs.find(t => t.id === s.activeId).loading);
    pass('Title bolt stays on frame one while the toolbar bolt spins during actual page loading');

    await command('add-library-source',{kind:'html',value:require('./html-fixture')(path.join(profile,'flash-page'))}); await ready();
    await ui.locator('#menu-button').click();
    const menu = await poll(() => app.windows().find(page => page.url() === 'flashborn://ui/menu.html'), Boolean);
    assert.deepEqual(await menu.locator('[data-quality]').evaluateAll(buttons => buttons.map(b => b.textContent)), ['Low', 'Medium', 'High']);
    for (const value of ['low', 'medium', 'high', 'medium']) {
      await menu.locator(`[data-quality="${value}"]`).click(); await poll(quality, actual => actual === value.toUpperCase());
      await poll(state, s => s.settings.flashQuality === value); assert.equal(await menu.locator(`[data-quality="${value}"]`).getAttribute('aria-pressed'), 'true');
    }
    assert.ok(await menu.locator('[data-quality="medium"]').evaluate(el => { const r = el.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight; }));
    fs.writeFileSync(path.join(output, 'medium-quality-1.5.1.png'), await menu.screenshot()); await command('menu-close');
    pass('Low, Medium and High buttons change genuine Adobe rendering quality, with the selected state shown in the menu');

    await app.close(); app = null; ui = await launch(); assert.equal((await state()).settings.flashQuality, 'medium');
    await command('panel', { name: 'library' });
    const entry = (await state()).library.find(e => e.kind === 'html'); assert.ok(entry);
    await command('play-library', { id: entry.id }); await ready();
    await poll(quality, actual => actual === 'MEDIUM');
    pass('Explicit Medium quality persists across restart and initializes an embedded HTML movie');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-polish-results.json' : 'polish-results.json'), JSON.stringify({ count: results.length, passed: results }, null, 2));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
