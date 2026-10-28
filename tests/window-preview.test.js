'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { WindowPreview, compositePreview } = require('../src/window-preview');
const tick = () => new Promise(resolve => setImmediate(resolve));
const pixels = (width, height, value) => ({ width, height, data: Buffer.alloc(width * height * 4, value) });
function fixture(capture) {
  const hooks = new Map(), calls = []; let minimized = false, time = 10000;
  const window = { isDestroyed: () => false, isVisible: () => true, isMinimized: () => minimized, hookWindowMessage: (message, callback) => hooks.set(message, callback), unhookWindowMessage: message => hooks.delete(message) };
  const api = { enable: value => calls.push(['enabled', value]), invalidate: () => calls.push(['invalidated']), thumbnail: (image, width, height) => { calls.push(['thumbnail', image.data[0], width, height]); return true; }, live: image => { calls.push(['live', image.data[0]]); return true; } };
  const preview = new WindowPreview(window, capture, { api, now: () => time });
  const thumbnail = () => { const size = Buffer.alloc(8); size.writeUInt32LE((480 << 16) | 300); hooks.get(0x0323)(null, size); };
  return { preview, calls, hooks, thumbnail, minimize: value => { minimized = value; }, advance: () => { time += 2000; } };
}
test('Windows preview combines shell and Flash pixels without modifying either live surface', () => {
  const shell = pixels(8, 6, 10), movie = pixels(4, 3, 200), image = compositePreview(shell, movie, { x: 3, y: 2 });
  for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) assert.equal(image.data[(y * 8 + x) * 4], x >= 3 && x < 7 && y >= 2 && y < 5 ? 200 : 10);
  assert.ok(shell.data.every(value => value === 10)); assert.ok(movie.data.every(value => value === 200));
  const clipped = compositePreview(shell, movie, { x: -2, y: -1 }); assert.equal(clipped.data[0], 200); assert.equal(clipped.data[2 * 4], 10);
  assert.deepEqual(compositePreview(shell, movie, { x: 100, y: 0 }), shell);
});
test('Switcher and Peek requests share one coalesced capture and respect requested thumbnail bounds', async () => {
  let resolve, captures = 0; const f = fixture(() => { captures++; return new Promise(r => { resolve = r; }); });
  f.preview.update('regular'); f.preview.update('regular'); f.thumbnail(); f.hooks.get(0x0326)(); await tick();
  assert.equal(captures, 1); resolve(pixels(800, 600, 70)); await tick(); await tick();
  assert.ok(f.calls.some(call => call[0] === 'thumbnail' && call[1] === 70 && call[2] === 480 && call[3] === 300));
  assert.ok(f.calls.some(call => call[0] === 'live' && call[1] === 70));
  f.thumbnail(); await tick(); assert.equal(captures, 1); f.preview.dispose();
});
test('Changing or closing tabs discards stale preview captures, including private content', async () => {
  let resolve; const f = fixture(() => new Promise(r => { resolve = r; }));
  f.preview.update('private-runtime'); await tick(); f.preview.update('ordinary-page'); resolve(pixels(8, 6, 99)); await tick();
  assert.equal(f.preview.image, null);
  f.preview.update(null); await tick(); assert.equal(f.preview.image, null); assert.deepEqual(f.calls.at(-1), ['enabled', false]);
  f.preview.dispose(); assert.equal(f.hooks.size, 0);
});
test('Minimized Flash retains a complete cached switcher image without capturing or activating windows', async () => {
  let captures = 0; const f = fixture(async () => { captures++; return pixels(8, 6, 45); });
  f.preview.update('flash'); await tick(); await tick(); f.minimize(true); f.advance(); f.preview.update('flash'); f.thumbnail(); await tick();
  assert.equal(captures, 1); assert.ok(f.calls.some(call => call[0] === 'thumbnail' && call[1] === 45));
  f.preview.update(null); await tick(); assert.equal(f.preview.image, null); f.preview.dispose();
});
