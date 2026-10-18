'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), zlib = require('node:zlib');
const { swfInfo, DEFAULT_BACKGROUND } = require('../src/swf-info');
const { initializeQuality, qualityKey } = require('../src/flash-quality');
const { sessionEntry, savedEntry } = require('../src/tab-session');
const path = require('node:path');
function movie(color) {
  const rectAndFrames = Buffer.from([8, 0, 0, 30, 1, 0]); // RECT with 1-bit zero coordinates, 30 FPS, 1 frame.
  const tags = color ? Buffer.from([0x43, 2, ...color, 0x40, 0, 0, 0]) : Buffer.from([0x40, 0, 0, 0]);
  const body = Buffer.concat([rectAndFrames, tags]), header = Buffer.from('4657530d00000000', 'hex'); header.writeUInt32LE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}
test('SWF background is extracted without changing timelines for FWS, CWS and ZWS; no tag uses light grey', async () => {
  const swf = movie([21, 133, 204]); assert.equal((await swfInfo(swf)).background, '#1585cc');
  const cws = Buffer.concat([swf.subarray(0, 8), zlib.deflateSync(swf.subarray(8))]); cws[0] = 67;
  assert.equal((await swfInfo(cws)).background, '#1585cc');
  const compressed = Buffer.from(require('lzma').compress(swf.subarray(8), 1));
  const zws = Buffer.concat([swf.subarray(0, 8), Buffer.alloc(4), compressed.subarray(0, 5), compressed.subarray(13)]); zws[0] = 90; zws.writeUInt32LE(compressed.length - 13, 8);
  assert.equal((await swfInfo(zws)).background, '#1585cc');
  assert.equal((await swfInfo(movie())).background, DEFAULT_BACKGROUND);
  await assert.rejects(swfInfo(Buffer.from('<html>Not a Flash file</html>')));
});
test('Quality stays per tab, closed-page preferences restore, and private tabs do not inherit saved regular preferences', () => {
  const a = { kind: 'web', url: 'https://example.com/movie#first' }, preferences = { 'https://example.com/movie': 'low' };
  initializeQuality(a, preferences); assert.equal(a.flashQuality, 'low');
  const b = { kind: 'web', url: a.url, flashQuality: 'medium' }; initializeQuality(b, preferences); assert.equal(b.flashQuality, 'medium');
  assert.equal(a.flashQuality, 'low'); a.url = 'https://other.test/'; initializeQuality(a, preferences); assert.equal(a.flashQuality, null);
  const privateTab = { kind: 'web', url: b.url, private: true }; initializeQuality(privateTab, preferences); assert.equal(privateTab.flashQuality, null);
  const flash = { kind: 'flash', localPath: path.resolve('movie.swf'), flashQuality: 'medium', native: { state: {} } };
  const restored = savedEntry(sessionEntry(flash)); assert.equal(restored.kind, 'flash'); assert.equal(restored.quality, 'medium');
  assert.ok(qualityKey(flash).endsWith('movie.swf'));
});
