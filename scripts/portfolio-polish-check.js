'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-output'), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 25000) { let value; const end = Date.now() + timeout; do { value = await read(); if (check(value)) return value; await wait(60); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
(async () => {
  const profile = path.join(out, 'portfolio-polish-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const html = require('./html-fixture')(profile, require('./playback-fixture'));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app, ui; const passed = [], pass = message => { passed.push(message); console.log('PASS ' + message); };
  const command = (action, args = {}) => app.evaluate(({}, d) => global.__flashborn.command(d.action, d.args), { action, args });
  const launch = async () => { app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env }); await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); ui = await app.firstWindow(); await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 70, y: 70, width: 1360, height: 940 }); w.show(); w.focus(); }); };
  try {
    await launch(); await command('panel', { name: 'library' });
    assert.equal(await ui.locator('.library-collection-heading h2').count(), 0);
    assert.equal(await ui.locator('.library-collection-heading p').innerText(), 'Flash design portfolio');
    await command('add-library-source', { value: html, kind: 'html' });
    await ui.locator('.item-actions [data-edit-library]').click();
    const form = ui.locator('.library-edit-form[data-library-edit]');
    await form.locator('[name="title"]').fill('Herman Miller Embody Chair'); await form.locator('[name="year"]').fill('2006'); await form.locator('[name="createdBy"]').fill('Firstborn');
    await form.locator('[name="description"]').fill('A long description should remain on one line and end with an ellipsis when there is not enough room to show it in the card. '.repeat(5));
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(await ui.locator('.library-year').innerText(), '2006, Firstborn');
    assert.equal(await ui.locator('.library-year em').evaluate(el => getComputedStyle(el).fontStyle), 'italic');
    const widths = [];
    for (const width of [1360, 1000, 800, 1360]) {
      await app.evaluate(({}, width) => global.__flashborn.win.setSize(width, 940), width); await wait(100);
      const geometry = await ui.evaluate(() => { const field = document.querySelector('#filter').getBoundingClientRect(), buttons = document.querySelector('.library-open-buttons').getBoundingClientRect(), art = document.querySelector('.library-thumbnail').getBoundingClientRect(), line = document.querySelector('.library-small-line'); return { width: art.width, height: art.height, fieldRight: field.right, fieldBottom: field.bottom, buttonsLeft: buttons.left, buttonsTop: buttons.top, scroll: document.querySelector('#content').scrollWidth, content: document.querySelector('#content').clientWidth, lineHeight: line.getBoundingClientRect().height, ellipsis: getComputedStyle(line).textOverflow, truncated: line.scrollWidth > line.clientWidth }; });
      widths.push(geometry.width); assert.equal(geometry.width, 128); assert.equal(geometry.height, 64); assert.equal(geometry.lineHeight, 17); assert.equal(geometry.ellipsis, 'ellipsis'); assert.equal(geometry.truncated, true);
      assert.ok(geometry.fieldRight <= geometry.buttonsLeft || geometry.fieldBottom <= geometry.buttonsTop); assert.ok(geometry.scroll <= geometry.content);
    }
    assert.equal(await ui.locator('#filter').getAttribute('placeholder'), 'Find in library');
    assert.equal(await ui.evaluate(() => Math.round(document.querySelector('.library-collection-heading').getBoundingClientRect().top - document.querySelector('.panel-actions').getBoundingClientRect().bottom)), 96);
    pass('Cards show year and italic creator, keep fixed thumbnails, truncate descriptions to one line, and retain non-overlapping controls at narrow widths');
    await ui.locator('.library-collection-heading p button').click();
    assert.equal(await ui.locator('[name="collectionTitle"]').count(), 0);
    await ui.locator('[name="collectionSubtitle"]').fill('A personal archive'); await ui.locator('#library-heading-form').getByRole('button', { name: 'Save', exact: true }).click();
    await command('panel', { name: 'about' }); assert.equal(await ui.locator('#about-support').evaluate(el => el.open), false);
    assert.equal(await ui.locator('#support-heading').evaluate(el => getComputedStyle(el).fontSize), '12px');
    await ui.locator('[data-support-jump]').click(); await wait(420); assert.equal(await ui.locator('#about-support').evaluate(el => el.open), true);
    const custom = ui.locator('.support-other input');
    await custom.fill('12.5'); assert.equal(await ui.locator('.support-other-pill').getAttribute('data-selected'), 'false');
    await custom.press('Enter'); assert.equal(await ui.locator('.support-other-pill').getAttribute('data-selected'), 'true');
    assert.equal(await ui.locator('[data-support-amount][aria-pressed="true"]').count(), 0);
    for (const width of [1360, 1000, 800, 1360]) {
      await app.evaluate(({}, width) => global.__flashborn.win.setSize(width, 940), width); await wait(80);
      const alignment = await ui.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect(), center = r => r.y + r.height / 2;
        const pill = rect('.support-other-pill'), button = rect('[data-support-amount]');
        return { topRight: rect('[data-support-jump]').right, linkRight: rect('[data-support-provider="link"]').right, centers: [center(button), center(rect('[data-support-amount] > span')), center(pill), center(rect('.support-other-pill > span')), center(rect('.support-other input'))] };
      });
      assert.ok(Math.abs(alignment.topRight - alignment.linkRight) < 1);
      assert.ok(alignment.centers.every(y => Math.abs(y - alignment.centers[0]) < 1), 'All amount text and currency symbols must be vertically centered');
    }
    await ui.locator('[data-support-amount="3"]').click(); assert.equal(await ui.locator('.support-other-pill').getAttribute('data-selected'), 'false');
    assert.equal(await ui.locator('[data-support-amount="3"]').getAttribute('aria-pressed'), 'true');
    await custom.fill('5'); await custom.press('Enter'); assert.equal(await ui.locator('[data-support-amount][aria-pressed="true"]').count(), 0);
    await ui.screenshot({ path: path.join(out, 'coffee-controls-dark.png') }); await command('theme');
    await ui.screenshot({ path: path.join(out, 'coffee-controls-light.png') }); await command('theme');
    pass('Library heading has triple spacing; custom support amounts commit on Enter, align vertically, and the coffee link shares the payment edge at narrow and wide widths');
    await ui.locator('#support-heading').click(); assert.equal(await ui.locator('#about-support').evaluate(el => el.open), false);
    await command('panel', { name: 'settings' }); await command('panel', { name: 'about' }); assert.equal(await ui.locator('#about-support').evaluate(el => el.open), false);
    pass('Coffee support is a small closed disclosure; the top coffee link opens it and scrolls into view');
    await app.close(); app = null; await launch(); await command('panel', { name: 'library' });
    assert.equal(await ui.locator('.library-collection-heading h2').count(), 0); assert.equal(await ui.locator('.library-collection-heading p').innerText(), 'A personal archive'); assert.equal(await ui.locator('.library-year').innerText(), '2006, Firstborn');
    await ui.screenshot({ path: path.join(out, 'portfolio-polish-dark.png') }); await command('theme'); await ui.screenshot({ path: path.join(out, 'portfolio-polish-light.png') });
    pass('The editable portfolio subtitle and creator credits persist across restart, with no portfolio title field');
    fs.writeFileSync(path.join(out, 'portfolio-polish-results.json'), JSON.stringify({ passed, profile }, null, 2));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
