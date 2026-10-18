'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), profile = path.join(root, 'test-output', 'preview-1.11-' + Date.now()), output = path.join(root, 'previews', 'screenshots', 'v1.11.0');
(async () => {
  fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  const library = [
    ['Firstborn', '2001', 'The early portfolio of a digital design group that helped shape a new visual language for the web.', 'firstborn5/flashLarge.htm'],
    ['Club John Frieda', '2001', 'An original interactive brand experience, preserved with its Flash animation and navigation.', 'club_john_frieda/index.html'],
    ['Kohn Pedersen Fox', '2004', 'Architecture, motion and a portfolio designed to be explored. The original KPF Flash website.', 'kpf/main.htm?fullscreen=no'],
  ].map(([title, year, description, file]) => ({ id: crypto.randomUUID(), kind: 'html', title, year, description, url: 'https://www.sloutchevsky.com/demos/' + file }));
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ library, tabs: [{ kind: 'home', title: 'New tab', url: '' }, ...library.map(item => ({ kind: 'web', title: item.title, url: item.url, native: true }))], activeTabIndex: 0, settings: { adBlockEnabled: false, pageSummaries: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  try {
    const ui = await app.firstWindow(); for (let i = 0; i < 100 && !await app.evaluate(() => !!global.__flashborn); i++) await new Promise(resolve => setTimeout(resolve, 60));
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 50, y: 50, width: 1360, height: 900 }); w.show(); w.focus(); });
    await ui.evaluate(() => document.fonts.ready); await ui.waitForTimeout(350); await ui.screenshot({ path: path.join(output, 'new-tab-dark.png') });
    await app.evaluate(() => global.__flashborn.command('panel', { name: 'library' })); await ui.waitForTimeout(200); await ui.screenshot({ path: path.join(output, 'library-dark.png') });
    await app.evaluate(() => global.__flashborn.command('theme')); await ui.waitForTimeout(200); await ui.screenshot({ path: path.join(output, 'library-light.png') });
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
