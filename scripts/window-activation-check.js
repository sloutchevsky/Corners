'use strict';
// Sample the actual desktop from an independent worker while focus moves from
// the native Adobe window into browser controls. Helper screenshots alone
// cannot detect Windows briefly painting the frame over the movie.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 25000) {
  const until = Date.now() + timeout; let value;
  do { value = await read(); if (check(value)) return value; await wait(50); } while (Date.now() < until);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'window-activation-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], phases = [];
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); const ui = await app.firstWindow();
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1250, height: 850 }); w.show(); w.focus(); });
    await app.evaluate(({}, file) => global.__flashborn.openLocal(file, global.__flashborn.activeTab()), require('./html-fixture')(path.join(profile, 'movie'), require('./playback-fixture')));
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native?.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))').catch(() => 0)), ticks => ticks > 3);
    const pid = await app.evaluate(() => global.__flashborn.activeTab().native.child.pid);
    if (process.env.FLASHBORN_MANUAL_ACTIVATION === '1') {
      console.log('ACTIVATE_TEST_WINDOW ' + profile);
      await poll(() => Promise.resolve(fs.existsSync(path.join(profile, 'continue'))), Boolean, 120000);
    }
    await app.evaluate(({}, module) => {
      const f = global.__flashborn, native = f.activeTab().native, { Worker } = process.mainModule.require('node:worker_threads');
      global.__activationPixels = [];
      const [x, y] = native.lastBounds;
      const worker = global.__activationWorker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const koffi = require(workerData.module), user = koffi.load('user32.dll'), gdi = koffi.load('gdi32.dll');
        const get = user.func('intptr_t __stdcall GetDC(intptr_t)'), release = user.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'), pixel = gdi.func('uint32_t __stdcall GetPixel(intptr_t,int,int)'), dc = get(0);
        let frames = [];
        const sample = setInterval(() => { const value = pixel(dc, workerData.x, workerData.y); frames.push({ at: Date.now(), rgb: [value & 255, value >>> 8 & 255, value >>> 16 & 255] }); }, 2);
        const send = setInterval(() => { parentPort.postMessage(frames); frames = []; }, 80);
        parentPort.on('message', () => { clearInterval(sample); clearInterval(send); release(0, dc); parentPort.postMessage(frames); parentPort.close(); });
      `, { eval: true, workerData: { module, x: x + 50, y: y + 50 } });
      worker.on('message', frames => global.__activationPixels.push(...frames));
    }, path.join(root, 'node_modules', 'koffi'));
    for (const theme of ['current', 'light']) {
      if (await ui.locator('body').getAttribute('data-theme') !== theme) await app.evaluate(() => global.__flashborn.command('theme'));
      await poll(() => ui.locator('body').getAttribute('data-theme'), value => value === theme); await wait(250);
      const start = Date.now();
      for (let i = 0; i < 12; i++) {
        await app.evaluate(async ({}, module) => {
          const native = global.__flashborn.activeTab().native;
          process.mainModule.require(module).load('user32.dll').func('int __stdcall AllowSetForegroundWindow(uint32_t)')(native.child.pid);
          await native.call('focus');
        }, path.join(root, 'node_modules', 'koffi'));
        await wait(100); await ui.locator('#address').click(); await ui.locator('#address').fill('frame input ' + i); await wait(150);
      }
      phases.push({ theme, start, end: Date.now() });
    }
    const state = await app.evaluate(async () => {
      await new Promise(resolve => { global.__activationWorker.once('exit', resolve); global.__activationWorker.postMessage('stop'); });
      const f = global.__flashborn, native = f.activeTab().native;
      return { pixels: global.__activationPixels, prevented: f.windowActivation.prevented, pid: native.child.pid, orderCorrect: native.nextLayer(native.hwnd, 2, native.hostHandle()) === native.hostHandle() };
    });
    const measured = state.pixels.filter(frame => phases.some(phase => frame.at >= phase.start && frame.at <= phase.end));
    const blank = measured.filter(frame => !frame.rgb.every((value, i) => Math.abs(value - [30, 32, 37][i]) <= 2));
    const report = { ...state, measured: measured.length, blank, phases, profile };
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-window-activation-results.json' : 'window-activation-results.json'), JSON.stringify(report, null, 2));
    assert.ok(measured.length > 150, 'Must continuously sample actual desktop pixels');
    assert.equal(blank.length, 0, 'Flash pixels were covered during frame activation: ' + JSON.stringify(blank.slice(0, 8)));
    // Windows can avoid an implicit raise itself. The regression requirement
    // is uninterrupted pixels and the same final pair, not a minimum repair count.
    assert.equal(state.pid, pid); assert.ok(state.orderCorrect);
    passed.push('Repeated native Flash-to-address activation keeps real desktop pixels painted in both themes, with the same runtime and window order');
    console.log('PASS ' + passed[0] + ' (' + measured.length + ' samples)');
  } finally {
    await app.evaluate(({ app }) => { global.__activationWorker?.postMessage('stop'); app.exit(0); }).catch(() => {});
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
