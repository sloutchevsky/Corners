const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

let browser;
(async () => {
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 780, height: 500 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(__dirname, 'gold-lightning-preview.html')).href);
  const frame = page.frames().find(frame => frame.parentFrame());
  await frame.waitForSelector('.fb-bolt-large');
  const pixels = () => frame.evaluate(() => document.querySelector('.fb-bolt-large').toDataURL());
  const first = await pixels();
  await page.waitForTimeout(220);
  if (first === await pixels()) throw new Error('The loading icon is not spinning.');
  await page.screenshot({ path: path.join(__dirname, 'gold-lightning-loading.png') });
  await frame.evaluate(() => {
    window.__events = [];
    document.addEventListener('click', event => window.__events.push(['click', event.target.outerHTML?.slice(0, 100)]), true);
    window.addEventListener('openai:set_globals', event => window.__events.push(['state', event.detail?.globals?.widgetState]));
  });
  await frame.locator('.fb-state-button').click();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(300);
    console.log(await frame.evaluate(() => ({ loading: document.querySelector('#flashborn-gold-preview').dataset.loading, angle: document.querySelector('.fb-bolt-large').dataset.angle, status: document.querySelector('.fb-status').textContent })));
  }
  console.log('Runtime errors:', errors);
  console.log('Events:', await frame.evaluate(() => window.__events));
  await frame.waitForFunction(() => document.querySelector('.fb-bolt-large').dataset.angle === '0.0000', null, { timeout: 4000 });
  const idle = await pixels();
  await page.waitForTimeout(150);
  if (idle !== await pixels()) throw new Error('The idle icon did not stop.');
  if (await frame.locator('.fb-status').innerText() !== 'Ready') throw new Error('The state label is incorrect.');
  await page.screenshot({ path: path.join(__dirname, 'gold-lightning-ready.png') });
  await page.setViewportSize({ width: 360, height: 500 });
  await page.waitForTimeout(100);
  if (await frame.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('The narrow preview overflows.');
  await page.screenshot({ path: path.join(__dirname, 'gold-lightning-mobile.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await frame.locator('.fb-state-button').click();
  await page.waitForTimeout(150);
  const reduced = await pixels();
  await page.waitForTimeout(150);
  if (reduced !== await pixels()) throw new Error('Reduced-motion mode still rotates.');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Verified: loading spins, ready stops, reduced motion stays still, 360px layout fits, no script errors.');
  await browser.close();
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
