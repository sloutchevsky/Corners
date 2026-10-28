'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { TabSnapshots } = require('../src/tab-snapshots');
const frame = n => ({ data: 'data:image/jpeg;base64,' + Buffer.from('frame-' + n).toString('base64'), width: 400, height: 200 });
const tab = () => ({ id: 'one', url: 'https://example.com', source: 1 });
const identity = t => t.url + '|' + t.source;

test('preview requests coalesce and reuse a recent frame without repeated renderer captures', async () => {
  let count = 0, resolve; const t = tab();
  const cache = new TabSnapshots(() => { count++; return new Promise(r => { resolve = r; }); }, identity);
  const a = cache.request(t), b = cache.request(t); assert.equal(count, 1);
  resolve(frame(1)); const [first, second] = await Promise.all([a, b]);
  assert.deepEqual(first, second); assert.equal((await cache.request(t)).data, first.data); assert.equal(count, 1);
});

test('navigation and replacing a Flash host reject stale in-flight images', async () => {
  const t = tab(); let resolve;
  const cache = new TabSnapshots(() => new Promise(r => { resolve = r; }), identity);
  const stale = cache.request(t); t.source = 2; assert.equal(cache.get(t), null);
  resolve(frame(1)); assert.equal(await stale, null); assert.equal(cache.get(t), null);
  const next = cache.request(t); resolve(frame(2)); await next;
  t.url = 'https://example.org'; assert.equal(cache.get(t), null);
});

test('a slow renderer times out promptly while remaining coalesced until its capture settles', async () => {
  let resolve, count = 0; const t = tab();
  const cache = new TabSnapshots(() => { count++; return new Promise(r => { resolve = r; }); }, identity, { timeout: 12 });
  assert.equal(await cache.request(t), null); assert.equal(await cache.request(t), null); assert.equal(count, 1);
  resolve(frame(1)); await new Promise(r => setImmediate(r)); assert.ok(cache.get(t));
});

test('closed/private tabs discard their images and cannot repopulate from a late capture', async () => {
  const t = tab(); let resolve;
  const cache = new TabSnapshots(() => new Promise(r => { resolve = r; }), identity);
  const pending = cache.request(t); cache.forget(t.id); resolve(frame(1));
  assert.equal(await pending, null); assert.equal(cache.entries.size, 0);
});

test('private tabs never capture, seed or retain thumbnail pixels', async () => {
  const t = { ...tab(), private: true }; let captures = 0, published = 0;
  const cache = new TabSnapshots(() => { captures++; return frame(1); }, identity, { onFrame: () => published++ });
  cache.seed(t, { ...frame(1), page: identity(t) });
  assert.equal(await cache.request(t), null);
  assert.equal(cache.get(t), null);
  assert.equal(captures, 0); assert.equal(published, 0); assert.equal(cache.entries.size, 0);
});

test('New Tab pages never capture, seed or retain shell screenshots', async () => {
  const t = { ...tab(), kind: 'home', url: '' }; let captures = 0, published = 0;
  const cache = new TabSnapshots(() => { captures++; return frame(1); }, identity, { onFrame: () => published++ });
  cache.seed(t, { ...frame(1), page: identity(t) });
  assert.equal(await cache.request(t), null); assert.equal(cache.get(t), null);
  assert.equal(captures, 0); assert.equal(published, 0); assert.equal(cache.entries.size, 0);
});

test('returning to New Tab rejects a pending page capture', async () => {
  const t = tab(); let resolve, published = 0;
  const cache = new TabSnapshots(() => new Promise(r => { resolve = r; }), identity, { onFrame: () => published++ });
  const pending = cache.request(t); t.kind = 'home'; resolve(frame(1));
  assert.equal(await pending, null); assert.equal(cache.get(t), null); assert.equal(published, 0);
});

test('a tab becoming private rejects an in-flight thumbnail without publishing its pixels', async () => {
  const t = tab(); let resolve, published = 0;
  const cache = new TabSnapshots(() => new Promise(r => { resolve = r; }), identity, { onFrame: () => published++ });
  const pending = cache.request(t); t.private = true; resolve(frame(1));
  assert.equal(await pending, null); assert.equal(cache.get(t), null);
  assert.equal(published, 0); assert.equal(cache.entries.size, 0);
});

test('capture failures back off, and oversized or non-image data is never retained', async () => {
  let calls = 0; const t = tab();
  const cache = new TabSnapshots(() => { calls++; throw Error('Hung runtime'); }, identity);
  assert.equal(await cache.request(t), null); assert.equal(await cache.request(t), null); assert.equal(calls, 1);
  const invalid = new TabSnapshots(() => ({ data: 'https://third-party.invalid/image' }), identity);
  assert.equal(await invalid.request(t), null);
  const large = new TabSnapshots(() => ({ data: 'data:image/jpeg;base64,' + 'x'.repeat(700001) }), identity);
  assert.equal(await large.request(t), null);
});

test('a restored picture survives renderer creation while old captures cannot replace it', async () => {
  const t = tab(); let resolve;
  const cache = new TabSnapshots(() => new Promise(r => { resolve = r; }), identity, { page: item => item.url });
  const saved = { ...frame(1), page: t.url, capturedAt: 1 };
  cache.seed(t, saved); assert.equal(cache.get(t).data, saved.data);
  const pending = cache.request(t); t.source++;
  assert.equal(cache.get(t).data, saved.data);
  resolve(frame(2)); assert.equal(await pending, null);
  assert.equal(cache.get(t).data, saved.data);
  t.url += '/elsewhere'; assert.equal(cache.get(t), null);
  cache.seed(t, saved); assert.equal(cache.get(t), null);
});
