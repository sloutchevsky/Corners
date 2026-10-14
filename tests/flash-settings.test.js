'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { settingsScript } = require('../src/legacy/flash-settings');
test('Flash settings apply once per ready instance and retry on a real quality change', () => {
  const attributes = new Map([['quality', 'high']]); let loaded = 50, quality = 'HIGH', reads = 0, writes = 0;
  const param = { name: 'quality', value: 'high' };
  const movie = { type: 'application/x-shockwave-flash', getAttribute: key => attributes.get(key), setAttribute: (key, value) => attributes.set(key, value), querySelectorAll: () => [param], PercentLoaded: () => { reads++; return loaded; }, TGetProperty: () => quality, TSetProperty: (_path, _property, value) => { writes++; quality = value; } };
  const frame = { document: { documentElement: { dataset: {} }, querySelectorAll: () => [movie] }, location: { protocol: 'https:' }, frames: [] };
  const context = vm.createContext({ window: frame }); const run = value => vm.runInContext(settingsScript(value, 'current'), context);
  assert.equal(run('high').loading, true); loaded = 100; assert.equal(run('high').loading, false);
  const settledReads = reads; for (let i = 0; i < 12; i++) run('high'); assert.equal(reads, settledReads); assert.equal(writes, 0);
  run('medium'); assert.equal(quality, 'MEDIUM'); assert.equal(writes, 1); assert.equal(param.value, 'medium');
  run('medium'); assert.equal(writes, 1);
});
