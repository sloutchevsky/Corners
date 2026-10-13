'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { resolveInput, isWebURL, containedPath, isSWF, isPDFURL, reorderItems } = require('../src/core');
const { Store } = require('../src/store');

test('address bar distinguishes searches, websites, ports and Flash files', () => {
  assert.deepEqual(resolveInput(''), { type: 'home' });
  assert.equal(resolveInput('example.com').url, 'https://example.com/');
  assert.equal(resolveInput('localhost:4000').url, 'http://localhost:4000/');
  assert.equal(resolveInput('127.0.0.1:8080/test').url, 'http://127.0.0.1:8080/test');
  assert.equal(resolveInput('flash games').url, 'https://duckduckgo.com/?q=flash%20games');
  assert.equal(resolveInput('a & b', 'google').url, 'https://www.google.com/search?q=a%20%26%20b');
  assert.equal(resolveInput('https://example.com/game.SWF?version=2').type, 'flash');
  assert.equal(resolveInput('C:\\Games\\movie.swf').type, 'file');
});
test('navigation rejects executable schemes and URL credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script/>', 'https://user:secret@example.com/', 'shell:AppsFolder', 'flashborn://movie/anything']) assert.throws(() => resolveInput(url));
  for (const url of ['file:///C:/secret.txt', 'javascript:alert(1)', 'ftp://example.com/', 'https://user:secret@example.com/']) assert.equal(isWebURL(url), false);
  assert.equal(isWebURL('https://example.com/'), true);
});
test('asset routes reject traversal and sibling directories', () => {
  const root = path.resolve('fixtures', 'assets');
  assert.equal(containedPath(root, 'image.png'), path.join(root, 'image.png'));
  assert.throws(() => containedPath(root, '../secret.txt'));
  assert.throws(() => containedPath(root, '../assets-other/secret.txt'));
  assert.throws(() => containedPath(root, path.resolve('elsewhere')));
});
test('Flash header validation rejects non-SWF content', () => {
  for (const signature of ['FWS', 'CWS', 'ZWS']) assert.equal(isSWF(Buffer.from(signature + '\x09\x10\x00\x00\x00')), true);
  assert.equal(isSWF(Buffer.from('<html>not flash</html>')), false);
  assert.equal(isSWF(Buffer.from('FWS')), false);
});
test('profile persists preferences and marks unfinished downloads interrupted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flashborn-test-'));
  try {
    const store = new Store(dir); store.data.settings.searchEngine = 'bing'; store.data.bookmarks.push({ title: 'Saved', url: 'https://example.com' }); store.data.downloads.push({ state: 'progressing' }); store.save();
    const restored = new Store(dir);
    assert.equal(restored.data.settings.searchEngine, 'bing');
    assert.equal(restored.data.bookmarks[0].title, 'Saved');
    assert.equal(restored.data.downloads[0].state, 'interrupted');
    fs.writeFileSync(path.join(dir, 'browser.json'), '{corrupt');
    assert.equal(new Store(dir).data.settings.searchEngine, 'duckduckgo');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reordering retains records, object identities and active references; invalid moves leave order intact', () => {
  const active = { id: 'b', view: { live: true } }, entries = [{ id: 'a' }, active, { id: 'c' }];
  reorderItems(entries, 'b', 'a', 'before');
  assert.deepEqual(entries.map(item => item.id), ['b', 'a', 'c']); assert.equal(entries[0], active);
  reorderItems(entries, 'b', 'c', 'after');
  assert.deepEqual(entries.map(item => item.id), ['a', 'c', 'b']); assert.equal(entries[2].view.live, true);
  reorderItems(entries, 'b', 'b', 'before');
  assert.throws(() => reorderItems(entries, 'b', 'missing')); assert.throws(() => reorderItems(entries, 'b', 'a', 'invalid'));
  assert.deepEqual(entries.map(item => item.id), ['a', 'c', 'b']);
});

test('PDF links and local paths retain navigation restrictions', () => {
  assert.equal(isPDFURL('https://example.com/paper.PDF?download=false'), true);
  assert.equal(isPDFURL('javascript:paper.pdf'), false);
  assert.equal(isPDFURL('https://user:pass@example.com/paper.pdf'), false);
  assert.equal(resolveInput('https://example.com/paper.pdf').type, 'web');
  assert.equal(resolveInput('C:\\Documents\\paper.pdf').type, 'file');
});
