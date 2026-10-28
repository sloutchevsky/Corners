'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = process.env.FLASHBORN_TEST_OUTPUT || path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 20000) {
  const end = Date.now() + timeout; let value;
  do { value = await read(); if (check(value)) return value; await wait(30); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = process.env.FLASHBORN_MENU_PROFILE || path.join(process.env.FLASHBORN_TEST_PROFILES || output, 'menu-toggle-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  if (process.env.FLASHBORN_MENU_TRACE) app.process().stderr.on('data', bytes => process.stdout.write(bytes));
  const passed = [], pass = message => { passed.push(message); console.log('PASS ' + message); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    if (process.env.FLASHBORN_MENU_TRACE) await app.evaluate(() => {
      global.__flashborn.win.webContents.on('before-input-event', (_event, input) => console.error('MENU_KEY', JSON.stringify(input)));
    });
    const ui = await app.firstWindow(), button = ui.locator('#menu-button');
    await app.evaluate(() => { const win = global.__flashborn.win; win.setBounds({ x: 70, y: 70, width: 1250, height: 900 }); win.show(); win.focus(); });
    const shown = () => poll(() => app.evaluate(() => !!global.__flashborn.menuWindow?.isVisible() && global.__flashborn.menuMotion?.progress === 1), Boolean);
    const hidden = () => poll(() => app.evaluate(() => !global.__flashborn.menuWindow && !global.__flashborn.getState().menuOpen), Boolean);
    const command = (action, args = {}) => app.evaluate(({}, value) => global.__flashborn.command(value.action, value.args), { action, args });
    await button.hover(); await wait(340);
    const glyph = await button.evaluate(el => {
      const frame = document.querySelector('.sidebar-toggle rect').getBoundingClientRect();
      const paths = [...el.querySelectorAll('.menu-dot path')];
      return { targetWidth:frame.width, lines:paths.map(path => { const r=path.getBoundingClientRect(), s=getComputedStyle(path); return { width:r.width, y:r.y, stroke:s.strokeWidth, cap:s.strokeLinecap }; }), circles:[...el.querySelectorAll('circle')].map(c=>getComputedStyle(c).opacity) };
    });
    assert.ok(glyph.lines.every(line => Math.abs(line.width-glyph.targetWidth)<.01 && line.stroke==='1.65px' && line.cap==='round'), JSON.stringify(glyph));
    assert.ok(Math.abs(glyph.lines[1].y-glyph.lines[0].y-5.5875*20/24)<.01, JSON.stringify(glyph));
    assert.ok(Math.abs(glyph.lines[2].y-glyph.lines[1].y-(glyph.lines[1].y-glyph.lines[0].y))<.01);
    assert.ok(glyph.circles.every(opacity=>opacity==='0'));
    await ui.locator('#address').hover(); await wait(340);
    assert.ok((await button.locator('circle').evaluateAll(circles=>circles.map(c=>getComputedStyle(c).opacity))).every(opacity=>opacity==='1'));
    pass('Menu lines match the collapse icon width and stroke, have half the previous spacing, and return to round dots on rollout');
    if (['start', 'only'].includes(process.env.FLASHBORN_MANUAL_MENU)) {
      for (let i = 0; i < 3; i++) await command('new-tab');
      await app.evaluate(() => { const win = global.__flashborn.win; win.setTitle('Flashborn menu QA'); win.focus(); });
      await app.evaluate(({}, rect) => { global.__menuTraceRect = rect; }, await button.boundingBox());
      console.log('READY_NATIVE_MENU');
      const until = Date.now() + 180000;
      while (Date.now() < until && (!fs.existsSync(path.join(output, 'menu-physical-done')) || fs.readFileSync(path.join(output, 'menu-physical-done'), 'utf8') !== 'complete')) {
        if (process.env.FLASHBORN_MENU_TRACE) await app.evaluate(({ screen }) => {
          const api = global.__flashborn, menu = api.menuWindow;
          if (menu && !menu.isDestroyed() && !menu.qaTraced) {
            menu.qaTraced = true;
            for (const event of ['blur', 'close']) menu.on(event, () => console.error('NATIVE_MENU_' + event, JSON.stringify({cursor:screen.getCursorScreenPoint(),bounds:api.win.getContentBounds(),rect:global.__menuTraceRect,focused:api.win.isFocused(),stack:new Error().stack})));
          }
        });
        await wait(200);
      }
      assert.equal(await app.evaluate(() => !!global.__flashborn.menuWindow), false, 'Physical second click must leave the actual popup closed');
      pass('Physical second click leaves no live popup window');
      if (process.env.FLASHBORN_MANUAL_MENU === 'only') return;
    }
    for (const mode of ['new-tab', 'flash']) {
      if (mode === 'flash') {
        await app.evaluate(({}, file) => global.__flashborn.openLocal(file, global.__flashborn.activeTab()), require('./html-fixture')(path.join(profile, 'movie'), require('./playback-fixture')));
        await poll(() => app.evaluate(() => global.__flashborn.activeTab().native?.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))').catch(() => 0)), n => n > 2);
        await poll(() => app.evaluate(() => !global.__flashborn.presentation), Boolean);
      }
      for (let i = 0; i < 3; i++) {
        await button.click(); await shown();
        await button.click(); await hidden();
        await button.click(); await shown();
        await ui.locator('#address').click(); await hidden();
      }
      pass(mode + ': repeated button toggles, outside dismissal and immediate reopening');
      await button.click(); await shown();
      assert.equal(await app.evaluate(() => global.__flashborn.menuWindow.isFocusable()), false);
      await app.evaluate(() => global.__flashborn.win.focus());
      await wait(80); await shown();
      await button.click(); await hidden();
      pass(mode + ': nonactivating menu survives frame activation and closes exactly once');
      await button.focus(); await button.press('Enter'); await shown();
      const popup = app.windows().find(window => window.url().endsWith('/menu.html'));
      assert.ok(popup);
      await ui.keyboard.press('ArrowDown');
      assert.equal(await popup.locator('button.keyboard-active').count(), 1);
      await ui.keyboard.press('Escape'); await hidden();
      pass(mode + ': keyboard open, arrow navigation and Escape dismissal through the focused browser');
      await button.click(); await shown();
      const clickable = app.windows().find(window => window.url().endsWith('/menu.html'));
      await clickable.locator('[data-panel="bookmarks"]').click(); await hidden();
      assert.equal(await app.evaluate(() => global.__flashborn.getState().panel), 'bookmarks');
      await command('panel', { name: null });
      await poll(() => app.evaluate(() => !global.__flashborn.presentation), Boolean);
      pass(mode + ': menu commands remain clickable without activating the overlay');
    }
    const flash = await app.evaluate(() => global.__flashborn.activeTab().id);
    for (let i = 0; i < 3; i++) await command('new-tab');
    await command('select-tab', { id: flash });
    await poll(() => app.evaluate(() => !global.__flashborn.presentation), Boolean);
    for (const theme of ['current', 'light']) {
      if (await app.evaluate(() => global.__flashborn.getState().settings.theme) !== theme) await command('theme');
      for (let i = 0; i < 2; i++) {
        const rows = await ui.locator('#tabs').evaluate(el => [...el.children].map(row => row.getBoundingClientRect().toJSON()));
        assert.ok(rows.length >= 4);
        for (const [index, row] of rows.entries()) {
          assert.ok(Math.abs(row.height - 43) < .001);
          if (index) assert.ok(Math.abs(row.top - rows[index - 1].bottom) < .001, 'Tab rows must touch with no vertical gap');
        }
        if (!i) {
          await poll(() => ui.locator('.tab.active .tab-thumbnail').evaluate(el => el.getBoundingClientRect().width), width => Math.abs(width - 86) < .001);
          const thumbnail = await ui.locator('.tab.active .tab-thumbnail').boundingBox();
          assert.ok(Math.abs(thumbnail.height - 43) < .001);
          assert.ok(rows.some(row => Math.abs(row.y - thumbnail.y) < .001));
          assert.ok(Math.abs(thumbnail.width / thumbnail.height - 2) < .001);
        }
        await command('collapse'); await wait(250);
      }
    }
    pass('43px rows touch in both themes and sidebar states; 2:1 thumbnails fill the full row height');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-menu-toggle-results.json' : 'menu-toggle-results.json'), JSON.stringify({ passed, completedAt: new Date().toISOString() }, null, 2));
    if (process.env.FLASHBORN_MANUAL_MENU === '1') {
      await app.evaluate(() => { const w = global.__flashborn.win; w.setTitle('Flashborn menu QA'); w.focus(); });
      console.log('READY_NATIVE_MENU');
      const until = Date.now() + 180000;
      while (Date.now() < until && !fs.existsSync(path.join(output, 'menu-physical-done'))) await wait(200);
    }
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
