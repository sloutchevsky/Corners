'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const captureVisible = require('./capture-visible');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 25000) { const end = Date.now() + timeout; let value; do { value = await fn(); if (check(value)) return value; await wait(80); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
const content = '<!doctype html><style>body{font:16px Arial;margin:40px;background:white;color:#222}.result,.b_algo,.MjjYud{margin:28px 0;max-width:650px}</style><title>Solar energy results</title><h1>Solar energy</h1>';
const descriptions = ['Solar energy converts sunlight into useful heat and electricity for homes and businesses.', 'Solar panels use photovoltaic cells to convert incoming sunlight into electrical power.', 'Battery storage can retain electricity generated during daylight for use after the sun goes down.'];
const html = provider => content + descriptions.map((text, i) => provider === 'Google' ? `<div class="MjjYud"><a href="https://source${i}.example/solar"><h3>Solar energy ${i}</h3></a><div class="VwiC3b">${text}</div></div>` : provider === 'Bing' ? `<li class="b_algo"><h2><a href="https://source${i}.example/solar">Solar energy ${i}</a></h2><div class="b_caption"><p>${text}</p></div></li>` : `<article data-testid="result"><a data-testid="result-title-a" href="https://source${i}.example/solar">Solar energy ${i}</a><div data-result="snippet">${text}</div></article>`).join('');
(async () => {
  const profile = path.join(output, 'summary-profile-' + Date.now()), env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { restoreTabs: false } }));
  let app, ui; const passed = [], pass = text => { passed.push(text); console.log('PASS ' + text); };
  const launch = async () => {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); ui = await app.firstWindow();
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.show(); w.focus(); });
    if (process.env.FLASHBORN_LIVE !== '1') await app.evaluate(({}, fixtures) => {
      global.__summaryRequests = [];
      global.__flashborn.browsingSession.protocol.handle('https', request => {
        global.__summaryRequests.push(request.url); const url = new URL(request.url);
        const provider = url.hostname.includes('google') ? 'Google' : url.hostname.includes('bing') ? 'Bing' : 'DuckDuckGo';
        return new Response(url.hostname.endsWith('.example') ? '<!doctype html><title>Opened source</title><p>Source page</p>' : fixtures[provider], { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } });
      });
    }, { Google: html('Google'), Bing: html('Bing'), DuckDuckGo: html('DuckDuckGo') });
  };
  const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
  const state = () => app.evaluate(() => global.__flashborn.getState());
  const capture = async name => { const screen = await captureVisible(app); fs.writeFileSync(path.join(output, name), Buffer.from(screen.png, 'base64')); };
  try {
    await launch(); assert.equal((await state()).settings.pageSummaries, true);
    for (const [provider, url] of [['Google', 'https://www.google.com/search?q=solar+energy'], ['Bing', 'https://www.bing.com/search?q=solar+energy'], ['DuckDuckGo', 'https://duckduckgo.com/?q=solar+energy']]) {
      if (process.env.FLASHBORN_LIVE_PROVIDER && process.env.FLASHBORN_LIVE_PROVIDER !== provider) continue;
      await command('navigate', { value: url });
      if (process.env.FLASHBORN_LIVE === '1') await poll(state, s => !!s.pageSummary || !s.tabs.find(t => t.id === s.activeId).loading);
      await poll(state, s => s.pageSummary?.provider === provider);
      await ui.locator('#page-summary').waitFor({ state: 'visible' });
      const text = await ui.locator('.summary-text').innerText(); assert.ok(text.length >= 45);
      const pane = await ui.locator('#page-summary').boundingBox();
      await poll(() => app.evaluate(() => global.__flashborn.activeTab().view.getBounds().y), y => Math.abs(y - (pane.y + pane.height)) <= 1);
      assert.equal(await app.evaluate(() => global.__flashborn.activeTab().view.webContents.executeJavaScript('typeof window.browser')), 'undefined');
      console.log('SUMMARY ' + provider + ' ' + text.length + ' characters'); pass(provider + ' results receive a real local summary with sources and the entire web viewport below the summary pane');
    }
    for (const theme of ['current', 'light']) {
      if ((await state()).settings.theme !== theme) await command('theme');
      await poll(() => ui.locator('body').getAttribute('data-theme'), v => v === theme);
      assert.equal(await ui.locator('#page-summary').evaluate(el => getComputedStyle(el).backgroundColor), theme === 'current' ? 'rgb(33, 33, 33)' : 'rgb(233, 233, 233)');
      await capture('summary-' + theme + '.png');
    }
    pass('Summary background follows both themes immediately without a page reload');
    if (process.env.FLASHBORN_LIVE === '1') {
      fs.writeFileSync(path.join(output, 'live-summary-' + (process.env.FLASHBORN_LIVE_PROVIDER || 'all') + '-results.json'), JSON.stringify({ passed, completedAt: new Date().toISOString() }, null, 2));
      return;
    }
    await command('collapse');
    await poll(() => ui.locator('#page-summary').evaluate(el => el.getBoundingClientRect().x), x => x === 68);
    await command('fullscreen', { value: true }); await ui.locator('#page-summary').waitFor({ state: 'hidden' });
    assert.equal(await app.evaluate(() => global.__flashborn.activeTab().view.getBounds().y), 0);
    await command('fullscreen', { value: false }); await ui.locator('#page-summary').waitFor({ state: 'visible' });
    await command('collapse');
    await command('panel', { name: 'settings' }); await ui.locator('#pageSummaries').waitFor({ state: 'attached' }); assert.equal(await ui.locator('#pageSummaries').isChecked(), true);
    await ui.locator('#pageSummaries').uncheck(); await poll(state, s => !s.settings.pageSummaries && !s.pageSummary);
    await command('panel', { name: null }); await ui.locator('#page-summary').waitFor({ state: 'hidden' });
    assert.equal(await app.evaluate(() => global.__flashborn.activeTab().view.getBounds().y), 100);
    await app.close(); app = null; await launch(); assert.equal((await state()).settings.pageSummaries, false);
    await command('navigate', { value: 'https://www.google.com/search?q=solar+energy' }); await wait(800); assert.equal((await state()).pageSummary, null);
    await command('settings', { pageSummaries: true }); await poll(state, s => !!s.pageSummary);
    pass('Collapse/fullscreen keep the viewport aligned; Settings disables summaries immediately, persists across restart, and reenabling summarizes the existing page');
    if (process.env.FLASHBORN_LIVE !== '1') {
      const requests = await app.evaluate(() => global.__summaryRequests);
      assert.ok(requests.every(url => /google\.com\/search\?/.test(url)), 'Summary must not issue additional requests');
      await ui.locator('.summary-sources a').first().click(); await poll(state, s => s.tabs.find(t => t.id === s.activeId).url.startsWith('https://source') && !s.pageSummary);
      await ui.locator('#page-summary').waitFor({ state: 'hidden' });
      pass('Summary generation makes no extra network requests; source links navigate and ordinary pages have no stale summary');
      await command('new-flashcognito');
      const local = path.join(profile, 'initialize-private.html'); fs.writeFileSync(local, '<!doctype html><title>Private view</title><p>Initialize the private content renderer.</p>');
      await app.evaluate(({}, file) => global.__flashborn.openLocal(file, global.__flashborn.activeTab()), local);
      await app.evaluate(({}, fixture) => global.__flashborn.privateSession.protocol.handle('https', () => new Response(fixture, { headers: { 'Content-Type': 'text/html' } })), html('Google'));
      const secret = 'private-summary-query-' + Date.now();
      await command('navigate', { value: 'https://www.google.com/search?q=' + secret }); await poll(state, s => s.pageSummary?.query === secret);
      const updated = 'Solar collectors can provide useful heat for domestic hot water and space heating in buildings.';
      await app.evaluate(({}, text) => global.__flashborn.activeTab().view.webContents.executeJavaScript('document.querySelector(".VwiC3b").textContent = ' + JSON.stringify(text)), updated);
      await poll(state, s => s.pageSummary?.passages.some(p => p.text === updated));
      const saved = fs.readFileSync(path.join(profile, 'browser.json'), 'utf8'); assert.ok(!saved.includes(secret)); assert.ok(!saved.includes(updated));
      await command('navigate', { value: 'https://source0.example/ordinary' }); await wait(1000); assert.equal((await state()).pageSummary, null);
      pass('Late result changes update the summary; private queries and summary text never enter the saved profile, and navigation cancels stale summaries');
    }
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_LIVE === '1' ? 'live-summary-results.json' : process.env.FLASHBORN_EXE ? 'packaged-summary-results.json' : 'summary-results.json'), JSON.stringify({ passed, completedAt: new Date().toISOString() }, null, 2));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
