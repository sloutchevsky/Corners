'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-output'), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 30000) { const end = Date.now() + timeout; let value; do { value = await read(); if (check(value)) return value; await wait(75); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
(async () => {
  const profile = path.join(out, 'library-support-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const localHTML = path.join(profile, 'local-portfolio.html'); fs.writeFileSync(localHTML, '<title>Local Portfolio &amp; Team</title><h1>Local portfolio</h1>');
  const server = http.createServer((req, res) => {
    if (req.url === '/drag.swf') { res.setHeader('Content-Type', 'application/x-shockwave-flash'); res.end(require('./playback-fixture')); return; }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Firstborn &amp; Partners Portfolio</title><embed id="movie" src="drag.swf" type="application/x-shockwave-flash" width="500" height="400">');
  }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app, ui, command, state; const passed = [];
  const pass = text => { passed.push(text); console.log('PASS ' + text); };
  const launch = async () => {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); ui = await app.firstWindow();
    await app.evaluate(({ shell, dialog }, imageFile) => { const w = global.__flashborn.win; w.setBounds({ x: 70, y: 70, width: 1360, height: 920 }); w.show(); w.focus(); global.openedPayments = []; shell.openExternal = async url => { global.openedPayments.push(url); }; shell.openPath = async () => ''; dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [imageFile] }); }, path.join(root, 'assets', 'icon.png'));
    command = (action, args = {}) => app.evaluate(({}, request) => global.__flashborn.command(request.action, request.args), { action, args });
    state = () => app.evaluate(() => global.__flashborn.getState());
  };
  try {
    await launch();
    await command('panel', { name: 'library' }); const count = (await state()).tabs.length;
    await command('add-library-source', { value: base, kind: 'html' });
    await poll(state, s => s.library[0]?.title === 'Firstborn & Partners Portfolio');
    assert.equal((await state()).panel, 'library'); assert.equal((await state()).tabs.length, count);
    await command('add-library-source', { value: localHTML, kind: 'html' });
    const entries = (await state()).library; const local = entries.find(e => e.path), remote = entries.find(e => e.url);
    assert.equal(local.title, 'Local Portfolio & Team'); assert.ok(/^oklch\(68% 0\.16/.test(local.color));
    await ui.locator(`[data-library="${local.id}"]`).first().waitFor();
    const thumbnail = ui.locator(`[data-library-image="${local.id}"]`);
    assert.equal(await thumbnail.locator('span').innerText(), '');
    assert.equal(await thumbnail.evaluate(el => getComputedStyle(el).borderRadius), '0px');
    assert.equal(await thumbnail.locator('.thumbnail-plus').evaluate(el => getComputedStyle(el).opacity), '0');
    await thumbnail.hover(); await poll(() => thumbnail.locator('.thumbnail-plus').evaluate(el => Number(getComputedStyle(el).opacity)), n => n === 1);
    pass('Adding a page stays in the library, reads its HTML title, and creates a stable saturated square-corner thumbnail with a plus only on hover');
    const row = ui.locator(`[data-reorder-id="${remote.id}"]`);
    await row.locator('.item-actions [data-edit-library]').click();
    const form = ui.locator('.library-edit-form'); await form.locator('[name="title"]').fill('My Firstborn Portfolio'); await form.locator('[name="description"]').fill('A hand-curated small line');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await poll(state, s => s.library.find(e => e.id === remote.id)?.title === 'My Firstborn Portfolio');
    const title = ui.locator(`[data-reorder-id="${remote.id}"] .item-title`);
    assert.match(await title.evaluate(el => getComputedStyle(el).fontFamily), /Flashborn 75/); assert.equal(await title.evaluate(el => getComputedStyle(el).fontSize), '18.72px');
    await thumbnail.click(); await poll(state, s => !!s.library.find(e => e.id === local.id)?.image);
    const manifestPath = path.join(profile, 'Flash Library', 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestPath));
    assert.equal(manifest.items.find(e => e.id === remote.id).description, 'A hand-curated small line');
    const image = manifest.items.find(e => e.id === local.id).image; assert.ok(fs.existsSync(path.join(profile, 'Flash Library', 'images', image)));
    await command('reorder', { collection: 'library', id: remote.id, targetId: local.id, position: 'before' });
    await ui.screenshot({ path: path.join(out, 'release-1.10-library-dark.png') });
    pass('Inline title/small-line edits and chosen images are saved in the separate manifest/images folder');
    await command('panel', { name: 'about' }); await ui.locator('#about-support').waitFor();
    assert.equal(await ui.locator('.support-methods button:disabled').count(), 3);
    assert.equal(await ui.locator('.support-section .icon').count(), 0);
    const geometry = await ui.locator('[data-support-amount="5"]').evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight, radius: getComputedStyle(el).borderRadius }));
    assert.equal(geometry.width, 48); assert.equal(geometry.height, 48); assert.equal(geometry.radius, '0px');
    assert.equal(await ui.locator('.support-other > span:last-child').evaluate(el => getComputedStyle(el).borderRadius), '0px');
    const colors = [];
    for (let i = 0; i < 2; i++) {
      colors.push(await ui.locator('#support-heading').evaluate(el => getComputedStyle(el).color));
      await ui.evaluate(() => { document.getElementById('content').scrollTop = 0; });
      const before = await ui.locator('#about-support').evaluate(el => el.getBoundingClientRect().top);
      await ui.locator('[data-support-jump]').click(); await wait(430);
      assert.ok(await ui.locator('#about-support').evaluate(el => el.getBoundingClientRect().top) < before);
      assert.ok(await ui.locator('#about-support').evaluate(el => Math.abs(el.getBoundingClientRect().top - document.getElementById('content').getBoundingClientRect().top - 20)) < 3);
      await ui.screenshot({ path: path.join(out, 'release-1.10-support-' + (i ? 'light' : 'dark') + '.png') });
      await command('theme');
    }
    assert.equal(colors[0], 'rgb(182, 166, 140)'); assert.equal(colors[1], 'rgb(112, 91, 55)');
    await ui.locator('[name="support-frequency"][value="monthly"]').check(); assert.equal(await ui.locator('.support-methods button:disabled').count(), 3);
    assert.equal((await app.evaluate(() => global.openedPayments)).length, 0);
    fs.writeFileSync(path.join(profile, 'support-links.json'), JSON.stringify({ paypal: { 'one-time': 'https://paypal.me/example', monthly: 'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=EXAMPLE' } }));
    await command('panel', { name: 'settings' }); await command('panel', { name: 'about' });
    await ui.locator('[name="support-frequency"][value="one-time"]').check(); await ui.locator('[data-support-amount="10"]').click();
    await ui.locator('[data-support-provider="paypal"]').click();
    await poll(() => app.evaluate(() => global.openedPayments), values => values.length === 1);
    assert.equal((await app.evaluate(() => global.openedPayments))[0], 'https://paypal.me/example/10.00USD');
    pass('Support controls and smooth jump work in both themes, with tan in dark mode and sidebar brown in light mode; placeholders cannot charge and configured checkout routes to the provider');
    await ui.locator('#menu-button').click(); const menu = await poll(() => app.windows().find(w => w.url() === 'flashborn://ui/menu.html'), Boolean);
    assert.ok(await menu.evaluate(() => document.body.scrollHeight <= document.body.clientHeight));
    const menuBounds = await menu.locator('[data-panel="about"]').evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, height: innerHeight })); assert.ok(menuBounds.bottom <= menuBounds.height);
    await menu.locator('[data-panel="library"]').click();
    pass('The complete three-dot menu fits without a vertical scrollbar or clipped last command');
    await command('play-library', { id: remote.id });
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.native);
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.evaluate("document.getElementById('movie')?.GetVariable?.('$version')")), value => typeof value === 'string' && value.startsWith('WIN '));
    assert.equal((await state()).library.find(e => e.id === remote.id).title, 'My Firstborn Portfolio');
    await command('new-tab'); await app.close(); app = null;
    await launch(); const reloaded = (await state()).library;
    assert.equal(reloaded.find(e => e.id === local.id).image, image); assert.equal(reloaded.find(e => e.id === remote.id).title, 'My Firstborn Portfolio');
    await command('panel', { name: 'library' });
    await poll(() => ui.locator(`[data-library-image="${local.id}"] img`).evaluate(el => el.complete && el.naturalWidth > 0), Boolean);
    pass('Library playback still runs the real Adobe plugin; edited titles, placeholders, order and thumbnails survive restart');
    fs.writeFileSync(path.join(out, 'release-1.10-results.json'), JSON.stringify({ passed, profile, completedAt: new Date().toISOString() }, null, 2));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
