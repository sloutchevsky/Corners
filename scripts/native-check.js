'use strict';
const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
require('./create-demo');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-output');
fs.mkdirSync(output, { recursive: true });
async function run() {
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: path.join(output, 'native-profile-' + Date.now()) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: [root], env, timeout: 45000 });
  app.process().stderr.on('data', data => process.stderr.write(data));
  try {
    await app.firstWindow();
    for (let n = 0; n < 100; n++) { if (await app.evaluate(() => !!global.__flashborn)) break; await new Promise(r => setTimeout(r, 100)); }
    await app.evaluate(async ({ }, filename) => global.__flashborn.openLocal(filename), path.join(root, 'assets', 'Flashborn-Demo.swf'));
    let result;
    for (let n = 0; n < 100; n++) {
      result = await app.evaluate(async () => global.__flashborn.activeTab().native.evaluate('({ready:document.body.dataset.ready,error:document.body.dataset.error,version:document.body.dataset.flashVersion,plugins:[...navigator.plugins].map(p=>p.name),status:document.getElementById("player-status")?.textContent})'));
      if (result.ready || result.error) break;
      await new Promise(r => setTimeout(r, 300));
    }
    console.log('NATIVE', result);
    const capture = await app.evaluate(async () => global.__flashborn.activeTab().native.screenshot());
    fs.writeFileSync(path.join(output, 'native-flash.png'), Buffer.from(capture, 'base64'));
    if (!result.ready) throw new Error('Native player did not load');
  } finally { await app.close(); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
