'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check) {
  const end = Date.now() + 20000;
  let value;
  do { value = await read(); if (check(value)) return value; await wait(50); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'sidebar-navigation-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({
    tabs: Array.from({ length: 24 }, () => ({ kind: 'home', title: 'New tab', url: '' })),
    activeTabIndex: 0, settings: { theme: 'current', adBlockEnabled: false }
  }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = text => { passed.push(text); console.log('PASS ' + text); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    await app.evaluate(() => { const win = global.__flashborn.win; win.setBounds({ x: 60, y: 60, width: 1280, height: 900 }); win.show(); win.focus(); });
    const command = (action, args = {}) => app.evaluate(({}, value) => global.__flashborn.command(value.action, value.args), { action, args });
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const button = name => ui.locator('.sidebar-bottom [data-panel="' + name + '"]');
    const inspect = () => ui.evaluate(() => {
      const nav = document.querySelector('.sidebar-bottom'), selection = nav.querySelector('.sidebar-selection');
      const style = getComputedStyle(selection), rect = selection.getBoundingClientRect();
      return {
        visible: +style.opacity, count: nav.querySelectorAll('.sidebar-selection').length,
        y: rect.y, x: rect.x, width: rect.width, height: rect.height, radius: style.borderRadius, fill: style.backgroundColor,
        sidebarWidth: document.querySelector('.sidebar').getBoundingClientRect().width,
        newTab: (() => { const el = document.querySelector('.new-tab'), r = el.getBoundingClientRect(); return { x:r.x, width:r.width, radius:getComputedStyle(el).borderRadius }; })(),
        transition: style.transitionProperty,
        buttons: [...nav.querySelectorAll('[data-panel]')].map(el => ({ name: el.dataset.panel, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, background: getComputedStyle(el).backgroundColor, active: el.classList.contains('active') })),
        divider: nav.querySelectorAll('.sidebar-rule').length,
        gradient: getComputedStyle(nav, '::before').backgroundImage,
        gradientHit: getComputedStyle(nav, '::before').pointerEvents,
        gradientHeight: getComputedStyle(nav, '::before').height,
        sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor
      };
    });
    const aligned = async name => {
      await wait(240);
      const value = await inspect(), target = value.buttons.find(item => item.name === name);
      assert.equal(value.count, 1); assert.equal(value.visible, 1);
      assert.ok(Math.abs(value.y - target.y) < .5, JSON.stringify(value));
      assert.equal(value.width, target.width); assert.equal(value.height, 40);
      assert.equal(value.x, 0); assert.equal(value.width, value.sidebarWidth); assert.equal(value.radius, '0px');
      assert.equal(value.newTab.x, 0); assert.equal(value.newTab.width, value.sidebarWidth); assert.equal(value.newTab.radius, '0px');
      assert.ok(value.buttons.every(item => item.background === 'rgba(0, 0, 0, 0)'), JSON.stringify(value));
      return value;
    };
    await ui.locator('.title-note').hover(); await wait(140);
    assert.equal((await inspect()).visible, 0);
    await button('library').hover(); const from = (await aligned('library')).y;
    const target = await button('support').boundingBox();
    await ui.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await wait(40); const during = await inspect();
    assert.ok(during.y > from && during.y < target.y, JSON.stringify({ from, target, during }));
    await aligned('support');
    await ui.locator('.title-note').hover(); await wait(150);
    assert.equal((await inspect()).visible, 0);
    pass('One shared highlight moves through intermediate vertical positions on hover and hides on rollout when no special page is selected');

    await button('bookmarks').click(); await poll(state, value => value.panel === 'bookmarks');
    await ui.locator('.title-note').hover(); await aligned('bookmarks');
    await button('downloads').hover(); await aligned('downloads');
    await command('theme'); await aligned('downloads');
    assert.deepEqual((await inspect()).buttons.filter(item => item.active).map(item => item.name), ['bookmarks']);
    await ui.locator('.title-note').hover(); await aligned('bookmarks');
    await button('support').click(); await poll(state, value => value.panel === 'support');
    await ui.locator('.title-note').hover(); await aligned('support');
    await command('panel', { name: 'history' }); await aligned('history');
    pass('Hover shows one rectangle while preserving the selected page; rollout and click settle on the correct selection, including after state updates');

    for (const theme of ['light', 'current']) {
      if ((await state()).settings.theme !== theme) await command('theme');
      for (const collapsed of [false, true]) {
        if ((await state()).collapsed !== collapsed) await command('collapse');
        await wait(250); await button('downloads').hover(); await aligned('downloads');
        await ui.locator('.title-note').hover(); const value = await aligned('history');
        assert.equal(value.divider, 0); assert.equal(value.gradientHit, 'none'); assert.equal(value.gradientHeight, '72px');
        assert.ok(value.gradient.includes('to top') && value.gradient.includes(value.sidebar), JSON.stringify(value));
        assert.equal(value.fill, theme === 'light' ? 'rgb(201, 201, 201)' : 'rgb(38, 38, 38)');
        await ui.screenshot({ path: path.join(output, 'sidebar-navigation-' + theme + (collapsed ? '-collapsed' : '') + '.png') });
      }
    }
    pass('Expanded and collapsed sidebars keep the shared highlight aligned in both themes; the divider is absent and the grey-to-transparent fade passes pointer input through');

    await ui.emulateMedia({ reducedMotion: 'reduce' });
    await button('bookmarks').hover();
    const reduced = await aligned('bookmarks'); assert.equal(reduced.transition, 'none');
    await ui.locator('.title-note').hover(); await aligned('history');
    await app.evaluate(() => global.__flashborn.win.setSize(1100, 740));
    await aligned('history');
    await command('select-tab', { id: (await state()).activeId }); await wait(140);
    assert.equal((await inspect()).visible, 0);
    pass('Reduced motion, resizing and returning to an ordinary tab preserve correct placement and visibility');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-sidebar-navigation-results.json' : 'sidebar-navigation-results.json'), JSON.stringify({ passed, profile }, null, 2));
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
