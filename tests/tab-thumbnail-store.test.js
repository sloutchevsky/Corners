'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { TabThumbnailStore } = require('../src/tab-thumbnail-store');
const entry = () => ({ thumbnailId: crypto.randomUUID(), url: 'https://example.com/', kind: 'web', native: false });
const frame = (tab, n = 1) => ({ page: JSON.stringify([tab.url, tab.kind, tab.native]), width: 400, height: 200, capturedAt: Date.now(), data: 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 224, n]).toString('base64') });
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flashborn-thumbnails-'));
  t.after(() => { for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name)); fs.rmdirSync(dir); });
  return dir;
}

test('regular tab images restore across sessions and duplicate URLs retain distinct images', async t => {
  const dir = directory(t), a = entry(), b = entry();
  const cache = new TabThumbnailStore(dir); cache.retain([a, b]);
  cache.put(a, frame(a)); cache.put(b, frame(b, 2)); await cache.close();
  const restored = new TabThumbnailStore(dir); restored.retain([a, b]);
  assert.equal(restored.get(a).data, frame(a).data);
  assert.equal(restored.get(b).data, frame(b, 2).data);
  assert.notEqual(restored.get(a).data, restored.get(b).data);
  await restored.close();
});

test('private and shared-shell captures, wrong pages and invalid identities are never written', async t => {
  const dir = directory(t), regular = entry(), privateTab = { ...entry(), private: true }, invalid = { ...entry(), thumbnailId: '../escape' }, home = { ...entry(), kind: 'home', url: '' };
  const cache = new TabThumbnailStore(dir); cache.retain([regular, privateTab, invalid, home]);
  cache.put(privateTab, frame(privateTab, 99)); cache.put(invalid, frame(invalid, 98));
  cache.put(home, frame(home, 97)); assert.equal(cache.get(home), null);
  cache.put(regular, { ...frame(regular), page: 'wrong page' });
  assert.equal(cache.frames.size, 0); assert.equal(cache.get(privateTab), null);
  cache.put(regular, frame(regular)); await cache.close();
  const text = fs.readFileSync(cache.file, 'utf8');
  assert.ok(!text.includes(privateTab.thumbnailId)); assert.ok(!text.includes(frame(privateTab, 99).data));
  assert.ok(!text.includes('../escape'));
});

test('closed tabs, navigation and disabled session restore prune disk images', async t => {
  const dir = directory(t), a = entry(), b = entry();
  const cache = new TabThumbnailStore(dir); cache.retain([a, b]); cache.put(a, frame(a)); cache.put(b, frame(b)); await cache.flush();
  cache.retain([{ ...a, url: a.url + 'new' }]); await cache.flush();
  assert.equal(cache.get(a), null); assert.equal(cache.get(b), null);
  assert.deepEqual(JSON.parse(fs.readFileSync(cache.file)).frames, []);
  cache.retain([a]); cache.put(a, frame(a)); cache.retain([]); await cache.close();
  assert.deepEqual(JSON.parse(fs.readFileSync(cache.file)).frames, []);
});

test('cache is bounded, updates during a write are saved, and corrupt input is ignored', async t => {
  const dir = directory(t), entries = Array.from({ length: 60 }, entry);
  const cache = new TabThumbnailStore(dir, { maxBytes: 1200 }); cache.retain(entries);
  for (const tab of entries) cache.put(tab, frame(tab));
  const writing = cache.flush(); const changed = entries[49]; cache.put(changed, frame(changed, 30)); await writing; await cache.close();
  assert.ok(fs.statSync(cache.file).size <= 1200); assert.ok(cache.frames.size < 50);
  const restored = new TabThumbnailStore(dir, { maxBytes: 1200 }); assert.equal(restored.get(changed).data, frame(changed, 30).data); await restored.close();
  fs.writeFileSync(cache.file, '{broken'); assert.equal(new TabThumbnailStore(dir).frames.size, 0);
  fs.writeFileSync(cache.file, 'x'.repeat(1300)); assert.equal(new TabThumbnailStore(dir, { maxBytes: 1200 }).frames.size, 0);
});

test('latest visited-page picture survives closing its tab, disabling tab restore and restarting', async t => {
  const dir = directory(t), a = entry(), cache = new TabThumbnailStore(dir);
  cache.retain([a], [a.url]); cache.put(a, frame(a)); cache.put(a, frame(a, 2));
  cache.retain([], [a.url]); assert.equal(cache.get(a), null);
  assert.equal(cache.getPage(a.url).data, frame(a, 2).data); await cache.close();
  const restarted = new TabThumbnailStore(dir); restarted.retain([], [a.url]);
  assert.equal(restarted.getPage(a.url).data, frame(a, 2).data);
  restarted.put(a, frame(a, 3)); assert.equal(restarted.get(a), null);
  assert.equal(restarted.getPage(a.url).data, frame(a, 3).data); await restarted.close();
});

test('earlier tab cache migrates for saved sites; removing the last history or bookmark reference prunes it', async t => {
  const dir = directory(t), a = entry(), old = new TabThumbnailStore(dir);
  old.retain([a]); old.put(a, frame(a)); await old.close();
  const migrated = new TabThumbnailStore(dir); migrated.retain([], [a.url]);
  assert.equal(migrated.getPage(a.url).data, frame(a).data);
  migrated.retain([], []); assert.equal(migrated.getPage(a.url), null); await migrated.close();
  assert.deepEqual(JSON.parse(fs.readFileSync(migrated.file)).pages, []);
});

test('private and home captures cannot overwrite visited-site pictures; both caches share the size limit', async t => {
  const dir = directory(t), a = entry(), cache = new TabThumbnailStore(dir, { maxBytes: 1600 });
  cache.retain([a], [a.url]); cache.put(a, frame(a));
  cache.put({ ...a, private: true }, frame(a, 99));
  const home = { ...a, kind: 'home' }; cache.put(home, frame(home, 98));
  assert.equal(cache.getPage(a.url).data, frame(a).data);
  const entries = Array.from({ length: 20 }, (_, i) => ({ ...entry(), url: 'https://example.com/' + i }));
  cache.retain(entries, entries.map(item => item.url));
  for (const entry of entries) cache.put(entry, frame(entry));
  await cache.close(); assert.ok(fs.statSync(cache.file).size <= 1600);
  const text = fs.readFileSync(cache.file, 'utf8');
  assert.ok(!text.includes(frame(a, 99).data)); assert.ok(!text.includes(frame(home, 98).data));
});
