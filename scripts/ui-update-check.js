'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 15000) {
  const end = Date.now() + timeout; let value;
  do { value = await fn(); if (check(value)) return value; await wait(80); } while (Date.now() < end);
  throw new Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const env = { ...process.env, FLASHBORN_TEST:'1', FLASHBORN_PROFILE:path.join(output, 'ui-update-profile-' + Date.now()) }; delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync(env.FLASHBORN_PROFILE,{recursive:true});
  fs.writeFileSync(path.join(env.FLASHBORN_PROFILE,'browser.json'),JSON.stringify({history:[{id:'previous-search',url:'https://duckduckgo.com/?q=weather%20in%20new%20york',title:'Previous search',visitedAt:new Date().toISOString()}]}));
  const app = await electron.launch({ executablePath:process.env.FLASHBORN_EXE || require('electron'), args:process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = []; const pass = text => { passed.push(text); console.log('PASS ' + text); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow(), errors = [];
    ui.on('pageerror', error => errors.push(error.message));
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({x:80,y:80,width:1280,height:820}); w.show(); w.focus(); });
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), {action,args});
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const capture = async name => {
      const png = await app.evaluate(async () => (await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64'));
      fs.writeFileSync(path.join(output,name),Buffer.from(png,'base64'));
    };
    await ui.locator('.home').waitFor();
    const metrics = () => ui.evaluate(() => Object.fromEntries(['.home', '.home h1', '.home-description', '#home-search', '#quick-links', '.home-divider', '.home-bottom', '#home-bolt', '.home-footnote'].map(selector => {
      const el = document.querySelector(selector), rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      return [selector, {x:rect.x,y:rect.y,width:rect.width,height:rect.height,font:style.font,fontWeight:style.fontWeight,lineHeight:style.lineHeight}];
    })));
    const normal = await metrics();
    const normalId = (await state()).activeId;
    await capture('new-tab-1.7.0.png');
    assert.equal(await ui.locator('.sidebar-bottom [data-panel="about"]').count(), 0);
    await ui.locator('.sidebar-wordmark').click(); await ui.locator('.about-panel').waitFor();
    pass('The bottom About button is removed and the wordmark still opens About');
    for (const name of ['library','bookmarks','history','downloads','settings']) {
      await command('panel',{name}); await ui.locator('.panel h1').waitFor();
      assert.equal(await ui.locator('.panel-eyebrow').count(), 0);
    }
    pass('Library, Bookmarks, History, Downloads and Settings omit their top eyebrow labels');
    await command('new-flashcognito'); await ui.locator('.flashcognito-home').waitFor();
    const privateState = await state();
    assert.equal(privateState.tabs.find(t => t.id === privateState.activeId)?.title, 'Flashcognito tab');
    const privateMetrics = await metrics();
    for (const [selector, original] of Object.entries(normal)) assert.deepEqual(privateMetrics[selector], original, selector);
    assert.equal(await ui.locator('.flashcognito-home').evaluate(el => getComputedStyle(el).opacity), '0.5');
    assert.equal(await ui.locator('#home-bolt').getAttribute('data-metal'), 'silver');
    assert.equal(await ui.locator('.home h1').innerText(), 'A little more private.');
    assert.equal(await ui.locator('.home-description').innerText(), 'A fresh session. No saved browsing trail.');
    await capture('flashcognito-1.7.0-dark.png');
    await command('theme'); await capture('flashcognito-1.7.0-light.png');
    pass('Flashcognito tab shares exact new-tab geometry and fonts, with a silver bolt and 50% opacity in both themes');
    await command('select-tab',{id:normalId});
    await ui.locator('#home-input').fill('weather in');
    await poll(state, s => s.suggestions?.field === 'home-input');
    const popup = await poll(() => app.windows().find(w => w.url() === 'flashborn://ui/suggestions.html'), Boolean);
    assert.equal(await popup.locator('.suggestion-search small').count(), 0);
    await ui.locator('#home-input').press('ArrowDown');
    assert.equal(await ui.locator('#home-input').inputValue(), 'weather in');
    await ui.locator('#home-input').press('ArrowDown');
    assert.equal(await ui.locator('#home-input').inputValue(), 'weather in new york');
    await ui.locator('#home-input').press('Escape'); await poll(state, s => !s.suggestions);
    assert.equal(await ui.locator('#home-input').inputValue(), 'weather in');
    pass('New-tab search suggests previous search phrases with the same minimal popup, arrow keys, and Escape restoration as the top address field');
    await ui.emulateMedia({reducedMotion:'reduce'});
    const snapshots = await ui.evaluate(() => {
      const gear = navigationIcons.find(icon => icon.kind === 'settings');
      gear.draw(.25); const first = gear.canvas.toDataURL(); gear.draw(.25); const second = gear.canvas.toDataURL();
      const history = navigationIcons.find(icon => icon.kind === 'history'); history.draw(1);
      const downloads = navigationIcons.find(icon => icon.kind === 'downloads'); downloads.draw(.4); const impact = downloads.canvas.dataset.arrowOffset; downloads.draw(1);
      const bolt = navigationIcons.find(icon => icon.kind === 'library');
      return { first, second, minute:history.canvas.dataset.minuteRotation, hour:history.canvas.dataset.hourRotation, impact, rest:downloads.canvas.dataset.arrowOffset, vertices:bolt.bolt.mesh[0].length, libraryWidth:bolt.canvas.getBoundingClientRect().width };
    });
    assert.equal(snapshots.first, snapshots.second); assert.equal(snapshots.minute,'-4320'); assert.equal(snapshots.hour,'-360');
    assert.equal(snapshots.impact,'6.000'); assert.equal(snapshots.rest,'0.000'); assert.equal(snapshots.vertices,6);
    assert.ok(Math.abs(snapshots.libraryWidth - 20.7) < .1);
    pass('The simple six-point bolt is retained and enlarged 15%; clock hands complete 12 hours counterclockwise; download arrow contacts its tray and returns');
    await ui.emulateMedia({reducedMotion:'no-preference'});
    const libraryButton = ui.locator('.sidebar [data-panel="library"]');
    await libraryButton.click();
    await poll(() => libraryButton.locator('canvas').getAttribute('data-motion'), value => value === 'idle');
    await ui.locator('.title-note').hover(); await libraryButton.hover();
    await poll(() => libraryButton.locator('canvas').getAttribute('data-motion'), value => value === 'spinning');
    await poll(() => libraryButton.locator('canvas').getAttribute('data-motion'), value => value === 'idle');
    pass('Re-entering a selected sidebar button starts another single hover spin');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,'ui-update-results.json'), JSON.stringify({passed,completedAt:new Date().toISOString()},null,2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
