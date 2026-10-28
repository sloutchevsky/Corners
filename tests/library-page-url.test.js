'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { LIBRARY_PAGE_URL, isLibraryPage, isSavedLibraryPage } = require('../src/legacy/library-page-url');
test('Only the exact hosted Library document can use the Library bridge', () => {
  assert.equal(LIBRARY_PAGE_URL, 'https://flashborn.sloutchevsky.com/flash.gallery.html');
  assert.equal(isLibraryPage(LIBRARY_PAGE_URL), true);
  assert.equal(isLibraryPage(LIBRARY_PAGE_URL + '?theme=light#cards'), true);
  for (const value of [undefined, 'https://flashborn.sloutchevsky.com/', 'https://flashborn.sloutchevsky.com/flash.library.html', 'http://flashborn.sloutchevsky.com/flash.gallery.html', 'https://flashborn.sloutchevsky.com.evil.test/flash.gallery.html', 'https://evil.test/flash.gallery.html', 'https://flashborn.sloutchevsky.com:444/flash.gallery.html', 'https://user:password@flashborn.sloutchevsky.com/flash.gallery.html', 'https://flashborn.sloutchevsky.com/another.html', 'file:///flash.gallery.html', 'javascript:alert(1)']) assert.equal(isLibraryPage(value), false, String(value));
});
test('A specific local test URL never grants access to another port, host or path', () => {
  const local = 'http://127.0.0.1:59211/flash.gallery.html';
  assert.equal(isLibraryPage(local,local),true);
  for (const value of ['http://127.0.0.1:59212/flash.gallery.html','http://localhost:59211/flash.gallery.html','http://127.0.0.1:59211/other.html']) assert.equal(isLibraryPage(value,local),false);
});

test('Saved pages at the former address migrate without granting the old page bridge access', () => {
  const previous = 'https://flashborn.sloutchevsky.com/flash.library.html?theme=light';
  assert.equal(isSavedLibraryPage(previous), true);
  assert.equal(isSavedLibraryPage(LIBRARY_PAGE_URL), true);
  assert.equal(isSavedLibraryPage('https://evil.test/flash.library.html'), false);
  assert.equal(isLibraryPage(previous), false);
});
