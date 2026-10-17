'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 20000) {
  const end = Date.now() + timeout; let value;
  do { try { value = await fn(); } catch { value = null; } if (check(value)) return value; await wait(80); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
const fixtures = {
  plain: { css: '', color: [255, 255, 255] },
  authored: { css: 'html{background:#f5efdc}', color: [245, 239, 220] },
  dark: { css: 'html,body{background:#162032;color:#eee}', color: [22, 32, 50] },
  scheme: { css: 'html{color-scheme:dark}', color: [18, 18, 18] }
};
const server = http.createServer((request, response) => {
  const name = request.url.slice(1), fixture = fixtures[name];
  if (!fixture) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  response.end('<!doctype html><title>Page colors: ' + name + '</title><style>' + fixture.css +
    'body{margin:24px;font:18px Arial}article{width:300px;padding:20px;background:white;color:#222}input{display:block}</style>' +
    '<article><h1>Original website colors</h1><p>A white card on the page canvas.</p><input value="Original value"></article>');
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const profile = path.join(output, 'page-colors-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { restoreTabs: false, theme: 'current', adBlockEnabled: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const passed = [];
  try {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.show(); w.focus(); });
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const script = code => app.evaluate(({}, code) => { const t = global.__flashborn.activeTab(); return t.native ? t.native.evaluate(code) : t.view.webContents.executeJavaScript(code); }, code);
    const pixels = () => app.evaluate(async ({ nativeImage }) => {
      const t = global.__flashborn.activeTab();
      const image = t.native ? nativeImage.createFromBuffer(Buffer.from(await t.native.screenshot(), 'base64')) : await t.view.webContents.capturePage();
      const pixel = image.crop({ x: 600, y: 350, width: 1, height: 1 }).toBitmap();
      return [pixel[2], pixel[1], pixel[0]];
    });
    for (const engine of ['modern', 'legacy', 'private']) {
      if (engine === 'private') await command('new-flashcognito');
      await command('navigate', { value: origin + '/plain' });
      if (engine === 'legacy') await command('native-mode');
      for (const [name, fixture] of Object.entries(fixtures)) {
        await command('navigate', { value: origin + '/' + name });
        await poll(() => script('document.title'), title => title === 'Page colors: ' + name);
        await script('document.querySelector("input").value="Preserved through theme changes"');
        const original = await script('({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,card:getComputedStyle(document.querySelector("article")).backgroundColor,scheme:matchMedia("(prefers-color-scheme:dark)").matches,styles:document.querySelectorAll("style").length})');
        for (const theme of ['current', 'light']) {
          if ((await app.evaluate(() => global.__flashborn.getState().settings.theme)) !== theme) await ui.locator('#theme-button').click();
          await poll(() => ui.locator('body').getAttribute('data-theme'), value => value === theme);
          assert.deepEqual(await pixels(), fixture.color, engine + '/' + name + '/' + theme + ': actual canvas pixels');
          assert.deepEqual(await script('({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,card:getComputedStyle(document.querySelector("article")).backgroundColor,scheme:matchMedia("(prefers-color-scheme:dark)").matches,styles:document.querySelectorAll("style").length})'), original);
          assert.equal(await script('document.querySelector("input").value'), 'Preserved through theme changes');
        }
        passed.push(engine + '/' + name); console.log('PASS ' + engine + '/' + name + ': canvas, author CSS, preferred scheme and form state preserved across both themes');
      }
    }
    if (process.env.FLASHBORN_REUTERS === '1') {
      await command('new-tab'); await command('navigate', { value: 'https://www.reuters.com/world/us/donald-trump/' });
      await wait(10000);
      const page = await script('({url:location.href,title:document.title,html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,text:document.body.innerText.slice(0,450)})');
      console.log('REUTERS ' + JSON.stringify(page));
      const image = await app.evaluate(async () => (await global.__flashborn.activeTab().view.webContents.capturePage()).toPNG().toString('base64'));
      fs.writeFileSync(path.join(output, 'reuters-page.png'), Buffer.from(image, 'base64'));
    }
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-page-colors-results.json' : 'page-colors-results.json'), JSON.stringify({ passed, completedAt: new Date().toISOString() }, null, 2));
  } finally { if (app) await app.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
