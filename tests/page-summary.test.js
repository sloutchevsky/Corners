'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { searchPage, sourceURL, makeSummary } = require('../src/page-summary');
test('Summary detection accepts the built-in result pages and rejects impersonators and other page types', () => {
  for (const url of ['https://www.google.com/search?q=solar+energy', 'https://www.google.co.uk/search?q=solar', 'https://duckduckgo.com/?q=solar', 'https://www.bing.com/search?q=solar']) assert.ok(searchPage(url));
  for (const url of ['https://google.com.evil.test/search?q=solar', 'https://example.com/search?q=solar', 'https://www.google.com/maps?q=solar', 'https://www.google.com/search?q=', 'javascript:search?q=solar', 'https://user:pass@bing.com/search?q=solar']) assert.equal(searchPage(url), null);
});
test('Summary source links unwrap engine redirects while rejecting executable and credential URLs', () => {
  const target = 'https://example.com/solar';
  assert.equal(sourceURL('https://duckduckgo.com/l/?uddg=' + encodeURIComponent(target)), target);
  assert.equal(sourceURL('https://www.google.com/url?q=' + encodeURIComponent(target)), target);
  assert.equal(sourceURL('https://www.bing.com/ck/a?u=a1' + Buffer.from(target).toString('base64')), target);
  assert.equal(sourceURL('https://www.google.com/url?q=javascript%3Aalert(1)'), null);
  assert.equal(sourceURL('https://user:password@example.com/'), null);
});
test('Extractive summaries stay bounded, deduplicate passages, cite valid sources, and invent no facts', () => {
  const text = 'Solar energy converts sunlight into useful heat and electricity for homes and businesses.';
  const data = { title: 'Solar energy', results: [{ url: 'https://one.example/', title: 'One', text }, { url: 'https://two.example/', title: 'Duplicate', text }, { url: 'javascript:alert(1)', text: 'Malicious content ignored by the source link validation.' }, { url: 'https://three.example/', title: 'Storage', text: 'Battery storage can retain electricity generated during daylight for use after the sun goes down.' }] };
  const result = makeSummary(data, 'https://www.bing.com/search?q=solar+energy');
  assert.equal(result.passages.length, 2); assert.equal(result.sources.length, 2);
  assert.ok(result.passages.every(p => data.results.some(d => d.text.includes(p.text))));
  assert.ok(result.passages.map(p => p.text).join(' ').length <= 510);
  assert.equal(makeSummary(data, 'https://ordinary.example/'), null);
  assert.equal(makeSummary({ results: [] }, 'https://www.google.com/search?q=solar'), null);
});
test('Search summaries reject launch notices and cover distinct relevant sources beyond the first result', () => {
  const data = { results: [
    { url: 'https://promo.example/', title: 'Hello', text: 'We are pausing hello while we get ready to launch something even better.' },
    { url: 'https://dictionary.example/hello', title: 'Hello meaning', text: 'Hello is a greeting in the English language, often used to begin a conversation.' },
    { url: 'https://history.example/hello', title: 'History of hello', text: 'Hello became a common telephone greeting during the nineteenth century.' },
    { url: 'https://dictionary.example/duplicate', title: 'Hello dictionary', text: 'Hello is a greeting in the English language, often used to begin a conversation.' }
  ] };
  const result = makeSummary(data, 'https://www.google.com/search?q=hello');
  assert.equal(result.sources.length, 2);
  assert.ok(result.sources.every(source => source.domain !== 'promo.example'));
  assert.ok(result.passages.some(passage => passage.text.includes('nineteenth century')));
});
