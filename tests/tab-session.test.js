'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { sessionEntry, savedEntry } = require('../src/tab-session');
const path = require('node:path');
test('website-only sessions keep HTML sources and reject obsolete SWFs, private and ephemeral URLs', () => {
  const file = path.resolve('assets/Flashborn-Demo.swf');
  assert.equal(sessionEntry({ kind: 'flash', flashSource: { path: file }, native: { state: {} } }), null);
  assert.equal(savedEntry({ kind: 'web', url: 'https://example.com/movie.swf', native: true }), null);
  const html = savedEntry(sessionEntry({ kind: 'local', localPath: path.resolve('test-output/index.html'), native: { state: {} } }));
  assert.equal(html.native, true); assert.equal(html.kind, 'local');
  assert.equal(savedEntry({url:'https://example.com/',native:true}).native, true);
  for(const value of [{kind:'web',url:'javascript:alert(1)'},{kind:'web',url:'flashnative://player/index.html'},{kind:'flash',source:{path:'relative.swf'}},{kind:'local',path:path.resolve('program.exe')},{kind:'web',url:'https://example.com/',private:true}]) assert.equal(savedEntry(value), null);
  assert.equal(sessionEntry({kind:'web',url:'https://example.com/',private:true}),null);
  assert.equal(savedEntry({kind:'local',path:42}),null);
  assert.equal(savedEntry({kind:'web',url:'javascript:alert(1)',restoreEntry:{kind:'web',url:'https://example.com/'}}),null);
  assert.deepEqual(sessionEntry({restoreEntry:html}),html);
  assert.equal(sessionEntry({restoreEntry:{kind:"flash",source:{path:file}}}),null);
});

test('thumbnail identities survive regular session restore but never enter private sessions', () => {
  const thumbnailId = require('node:crypto').randomUUID();
  const tab = { kind: 'web', url: 'https://example.com/', thumbnailId };
  const saved = savedEntry(sessionEntry(tab));
  assert.equal(saved.thumbnailId, thumbnailId);
  assert.equal(sessionEntry({ restoreEntry: saved }).thumbnailId, thumbnailId);
  assert.equal(sessionEntry({ ...tab, private: true }), null);
  assert.equal(savedEntry({ ...tab, thumbnailId: '../../elsewhere' }).thumbnailId, undefined);
});
