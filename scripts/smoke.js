'use strict';
const { _electron: electron } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const demo = require('./create-demo');
const root = path.join(__dirname, '..');
const output = path.join(root, 'test-output');
fs.mkdirSync(output, { recursive: true });

async function poll(fn, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let value;
  do { value = await fn(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 150)); } while (Date.now() < deadline);
  throw new Error('Timed out waiting for ' + JSON.stringify(value));
}

async function run() {
  const server = http.createServer((req, res) => {
    if (req.url === '/movie.swf' || req.url === '/mime-flash') { res.writeHead(200, { 'Content-Type': 'application/x-shockwave-flash' }); res.end(demo); return; }
    if (req.url === '/download') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="browser-test.txt"' }); res.end('Flashborn download verified.'); return; }
    if (req.url === '/broken') { res.writeHead(404); res.end('Missing'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; object-src 'self'" });
    if (req.url === '/embed') res.end('<!doctype html><html><head><title>Embedded Flash test</title></head><body style="background:#eee"><h1>Embedded Flash</h1><object type="application/x-shockwave-flash" data="/movie.swf" width="640" height="400"><param name="movie" value="/movie.swf"></object></body></html>');
    else res.end(`<!doctype html><html><head><title>${req.url === '/two' ? 'Second page' : 'First page'}</title></head><body><h1>${req.url === '/two' ? 'Second page' : 'First page'}</h1><p>Needle find test. Needle.</p><a href="/two" id="next">Next page</a><a href="/one" target="_blank" id="popup">New tab</a><a href="/download" id="download">Download file</a></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: path.join(output, 'profile-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const results = [];
  try {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env, timeout: 45000 });
    app.process().stderr.on('data', data => fs.appendFileSync(path.join(output, 'electron.log'), data));
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    const saveUI = async filename => { await new Promise(resolve => setTimeout(resolve, 300)); const bytes = await app.evaluate(async () => (await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64')); fs.writeFileSync(path.join(output, filename), Buffer.from(bytes, 'base64')); };
    const command = (action, args = {}) => app.evaluate(({ }, { action, args }) => global.__flashborn.command(action, args), { action, args });
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const pageScript = code => app.evaluate(({ }, code) => global.__flashborn.activeTab().view.webContents.executeJavaScript(code, true), code);
    const saveView = async filename => { await app.evaluate(async () => { await global.__flashborn.activeTab().view.webContents.capturePage(); }); await new Promise(resolve => setTimeout(resolve, 500)); const bytes = await app.evaluate(async () => (await global.__flashborn.activeTab().view.webContents.capturePage()).toPNG().toString('base64')); fs.writeFileSync(path.join(output, filename), Buffer.from(bytes, 'base64')); };

    await ui.locator('.home h1').waitFor();
    await saveUI('home.png');
    assert.equal((await state()).tabs.length, 1);
    assert.equal((await state()).flashReady, true);
    results.push('Desktop shell, home screen and bundled Ruffle extension load');

    await ui.locator('#address').fill(base + '/one');
    await ui.locator('#address-form').evaluate(form => form.requestSubmit());
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.title === 'First page');
    assert.equal(await pageScript('typeof require'), 'undefined');
    assert.equal(await pageScript('typeof process'), 'undefined');
    assert.equal(await pageScript('typeof window.browser'), 'undefined');
    results.push('Address bar navigates; web pages have no Node or browser IPC access');

    await pageScript('document.getElementById("next").click()');
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.title === 'Second page');
    await command('back');
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.title === 'First page');
    await command('forward');
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.title === 'Second page');
    await command('reload');
    await poll(state, s => !s.tabs.find(t => t.id === s.activeId)?.loading);
    results.push('Links, back, forward and reload work');

    await command('bookmark');
    assert.equal((await state()).bookmarks.length, 1);
    await command('panel', { name: 'bookmarks' });
    await ui.locator('.item-title').filter({ hasText: 'Second page' }).waitFor();
    await command('panel', { name: 'history' });
    assert.ok((await state()).history.length >= 2);
    await command('panel', { name: null });
    await command('zoom', { direction: 1 });
    assert.ok((await state()).tabs[0].zoom >= 110);
    await command('zoom', { direction: 0 });
    results.push('Bookmarks, history, panels and page zoom work');

    await pageScript('document.getElementById("popup").click()');
    await poll(state, s => s.tabs.length === 2 && s.tabs.find(t => t.id === s.activeId)?.title === 'First page');
    await command('close-tab', { id: (await state()).activeId });
    assert.equal((await state()).tabs.length, 1);
    results.push('Popup links become tabs; tabs switch and close');

    const found = await app.evaluate(async () => {
      const wc = global.__flashborn.activeTab().view.webContents;
      const result = new Promise(resolve => wc.once('found-in-page', (_event, result) => resolve(result)));
      wc.findInPage('Needle'); return result;
    });
    assert.equal(found.matches, 2);
    results.push('Find in page reports the correct matches');

    const downloadPath = path.join(output, 'browser-test.txt');
    await app.evaluate(({ }, filename) => { global.__flashborn.browsingSession.once('will-download', (_event, item) => item.setSavePath(filename)); }, downloadPath);
    await pageScript('document.getElementById("download").click()');
    await poll(state, s => s.downloads.some(d => d.state === 'completed'));
    assert.equal(fs.readFileSync(downloadPath, 'utf8'), 'Flashborn download verified.');
    results.push('Download saves the exact file and records completion');

    await command('navigate', { value: 'javascript:alert(1)' }).then(() => assert.fail('Scheme should be rejected'), () => {});
    results.push('Executable navigation schemes are rejected');

    await app.evaluate(async ({ }, filename) => global.__flashborn.openLocal(filename), path.join(root, 'assets', 'Flashborn-Demo.swf'));
    await poll(() => pageScript('({ready:document.body.dataset.ready,error:document.querySelector(".error")?.textContent})'), s => { if (s.error) throw new Error(s.error); return s.ready === 'true'; }, 60000);
    const metadata = await pageScript('document.querySelector("ruffle-player").ruffle().metadata');
    assert.equal(metadata.width, 640); assert.equal(metadata.height, 400);
    await pageScript('document.getElementById("pause").click()');
    assert.equal(await pageScript('document.getElementById("pause").textContent'), 'Resume');
    assert.equal(await pageScript('document.querySelector("ruffle-player").ruffle().suspended'), true);
    await pageScript('document.getElementById("mute").click()');
    assert.equal(await pageScript('document.getElementById("mute").textContent'), 'Unmute');
    await pageScript('document.getElementById("restart").click()');
    await poll(() => pageScript('document.getElementById("player-status").textContent'), s => s === 'Restarted');
    assert.equal(await pageScript('document.querySelector("ruffle-player").ruffle().volume'), 0);
    await saveView('flash-player.png');
    assert.equal((await state()).library.length, 1);
    results.push('Local SWF decodes in bundled WASM player; pause, mute, restart and library work');

    await command('navigate', { value: base + '/movie.swf' });
    await poll(() => pageScript('({ready:document.body.dataset.ready,error:document.querySelector(".error")?.textContent})'), s => { if (s.error) throw new Error(s.error); return s.ready === 'true'; }, 60000);
    results.push('Remote SWF URL plays in the dedicated player');

    await command('navigate', { value: base + '/mime-flash' });
    await poll(state, s => s.tabs.find(t => t.id === s.activeId)?.kind === 'flash');
    await poll(() => pageScript('document.body.dataset.ready'), s => s === 'true', 60000);
    results.push('Flash MIME responses without .swf extension open in the player');

    await command('navigate', { value: base + '/embed' });
    await poll(() => pageScript('({player:!!document.querySelector("ruffle-object,ruffle-embed,ruffle-player"),title:document.title})'), s => s.player);
    await poll(() => pageScript('document.querySelector("ruffle-object,ruffle-embed,ruffle-player").ruffle().metadata'), s => s?.width === 640, 60000);
    await saveView('embedded-flash.png');
    results.push('Legacy object embed is replaced by Ruffle and plays under a website CSP');

    await command('panel', { name: 'library' });
    await saveUI('library.png');
    await command('panel', { name: 'settings' });
    await saveUI('settings.png');
    await command('collapse');
    assert.ok(await ui.locator('body').evaluate(el => el.classList.contains('collapsed')));
    const denied = await ui.evaluate(async () => await window.browser.call('not-a-command'));
    assert.equal(denied.ok, false);
    results.push('Sidebar and settings render; invalid IPC actions are rejected');

    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-results.json' : 'smoke-results.json'), JSON.stringify({ passed: results, completedAt: new Date().toISOString() }, null, 2));
    console.log(results.map(r => 'PASS ' + r).join('\n'));
  } catch (e) {
    console.error('Smoke test failed:', e);
    console.log(results.map(r => 'PASS ' + r).join('\n'));
    throw e;
  } finally { if (app) await app.close(); server.close(); }
}
run().catch(() => { process.exitCode = 1; });
