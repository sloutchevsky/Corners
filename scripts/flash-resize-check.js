'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output'), wait = ms => new Promise(r => setTimeout(r, ms));
async function poll(read, check) {
  const end = Date.now() + 20000; let value;
  do { value = await read(); if (check(value)) return value; await wait(80); } while (Date.now() < end);
  throw Error(JSON.stringify(value));
}
(async () => {
  const profile = path.join(output, 'flash-resize-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env }), samples = [];
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1250, height: 850 }); w.show(); w.focus(); });
    await app.evaluate(({}, file) => global.__flashborn.openLocal(file, global.__flashborn.activeTab()), require('./html-fixture')(path.join(profile, 'movie'), require('./playback-fixture')));
    const read = () => app.evaluate(async () => {
      const n = global.__flashborn.activeTab().native; if (!n?.hwnd) return null;
      return { expected: n.lastBounds, actual: n.inspect().rect, hwnd: n.hwnd, presented: n.isPresented(), helper: await n.call('test-playback'), ticks: await n.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))') };
    });
    const hit = require('koffi').load('user32.dll').func('intptr_t __stdcall SendMessageW(intptr_t,uint32_t,intptr_t,intptr_t)');
    const settled = async label => {
      const value = await poll(read, v => v?.ticks > 3 && v.presented && v.expected.every((p, i) => p === (i < 2 ? v.actual[i] : v.actual[i] - v.actual[i - 2])));
      assert.equal(value.helper.resizable, false);
      const [l, t, r, b] = value.actual;
      const points = [[l+1,t+1],[r-2,t+1],[l+1,b-2],[r-2,b-2],[l+1,(t+b)>>1],[r-2,(t+b)>>1],[(l+r)>>1,t+1],[(l+r)>>1,b-2]];
      value.hits = points.map(([x,y]) => Number(hit(value.hwnd, 0x84, 0, (y << 16) | (x & 65535))));
      assert.ok(value.hits.every(h => h === 1 || h === 18), 'Movie edges must be client input or an inert border, never a resize handle: ' + JSON.stringify(value));
      samples.push({ label, ...value }); console.log('PASS ' + label); return value;
    };
    const first = await settled('initial');
    for (const [width, height] of [[1100,740],[1111,743],[1112,744],[1113,745],[1250,900],[1450,980]]) {
      await app.evaluate(({}, bounds) => global.__flashborn.win.setSize(...bounds), [width,height]); await settled(width + 'x' + height);
    }
    for (let i = 0; i < 2; i++) {
      await app.evaluate(() => global.__flashborn.command('collapse', {})); await wait(300); await settled(i ? 'expanded' : 'collapsed');
    }
    assert.ok(samples.at(-1).ticks > first.ticks, 'The same movie must keep running through viewport changes');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-flash-resize-results.json' : 'flash-resize-results.json'), JSON.stringify({ samples, profile }, null, 2));
  } finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
