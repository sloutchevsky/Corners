'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { supportedLocalFile, contentType, urlSuggestions } = require('../src/files');
test('local browser formats have useful MIME types and reject executable files', () => {
  for (const file of ['page.HTML','paper.pdf','photo.JPEG','icon.svg','movie.mp4','movie.webm']) assert.equal(supportedLocalFile(file), true);
  assert.equal(supportedLocalFile('application.exe'), false);
  assert.equal(supportedLocalFile('movie.swf'), false);
  assert.equal(contentType('movie.swf'), 'application/x-shockwave-flash'); // Embedded HTML assets still work.
  assert.equal(contentType('movie.webm'), 'video/webm'); assert.equal(contentType('paper.pdf'), 'application/pdf');
});
test('URL autocomplete prioritizes prefixes, deduplicates and excludes unsafe schemes', () => {
  const entries = [{url:'https://other.test/',title:'Example'}, {url:'https://example.com/docs',title:'Documentation'}, {url:'https://example.com/docs',title:'Duplicate'}, {url:'javascript:alert(1)',title:'Example'}, {url:'https://user:secret@example.com',title:'Example'}];
  const suggestions = urlSuggestions('exa', entries);
  assert.deepEqual(suggestions.map(item=>item.url), ['https://example.com/docs','https://other.test/']);
  assert.equal(urlSuggestions('', entries).length, 0);
  assert.equal(urlSuggestions('https://example.com/d', entries)[0].title, 'Documentation');
});
