'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { canPredict, predictionTerms, suggestions, SearchPredictions } = require('../src/search-suggestions');
test('predictive searches exclude file paths, addresses, credentials and URL queries', () => {
  for (const value of ['https://example.com/private?q=secret', 'example.com/private', 'C:\\My Files\\movie.swf', '\\\\server\\share', 'user@example.com', 'localhost:8000', '127.0.0.1', 'file:///C:/Private.pdf']) assert.equal(canPredict(value), false, value);
  for (const value of ['flash games', 'weather', 'cats']) assert.equal(canPredict(value), true, value);
});
test('provider responses are normalized, bounded and deduplicated', () => {
  assert.deepEqual(predictionTerms(['flash', ['flash games', 'Flash Games', 'flash movies', {}, null]]), ['flash games', 'flash movies']);
  assert.deepEqual(predictionTerms([{phrase:'flash games'}, {phrase:'flash movies'}]), ['flash games', 'flash movies']);
  assert.deepEqual(predictionTerms({html:'not suggestions'}), []);
});
test('local URLs stay first; searched history and predictions use the chosen engine', () => {
  const entries = [{url:'https://flash.pm/',title:'Flash Browser'}, {url:'https://duckduckgo.com/?q=flash%20games', title:'Results'}];
  const items = suggestions('flash', entries, 'bing', ['flash games', 'flash movies']);
  assert.equal(items[0].url, 'https://flash.pm/');
  const games = items.filter(item => item.type === 'search' && item.title === 'flash games');
  assert.equal(games.length, 1); assert.equal(games[0].source, 'history');
  assert.equal(games[0].url, 'https://www.bing.com/search?q=flash%20games');
  assert.ok(items.some(item => item.title === 'flash movies' && item.type === 'search'));
  assert.deepEqual(suggestions('https://flash.pm/', entries, 'bing').map(item => item.type), ['url']);
});
test('library addresses suggest local sources without interpreting them as searches', () => {
  const items = suggestions('movie', [], 'google', [], { allowSearch:false, library:[{title:'Movie',path:'C:\\Flash\\movie.swf'}] });
  assert.equal(items[0].type, 'file'); assert.equal(items[0].inputText, 'C:\\Flash\\movie.swf');
  assert.equal(items.some(item => item.type === 'search'), false);
});

test('live predictions use the selected provider without credentials or URL disclosures', async () => {
  const requests = [];
  const client = new SearchPredictions(async (url, options) => {
    requests.push({url, options});
    return {ok:true, text:async () => JSON.stringify(['flash', ['flash games', 'flash movies']])};
  });
  assert.deepEqual(await client.get('flash', 'google'), ['flash games', 'flash movies']);
  await client.get('flash', 'bing');
  await client.get('flash', 'duckduckgo');
  assert.deepEqual(requests.map(request => new URL(request.url).hostname), ['suggestqueries.google.com','www.bing.com','duckduckgo.com']);
  for (const {options} of requests) {
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); assert.equal(options.referrerPolicy, 'no-referrer');
  }
  await client.get('C:\\Private\\movie.swf', 'google');
  await client.get('https://example.com/secret', 'google');
  assert.equal(requests.length, 3);
});

test('private predictions bypass ordinary memory cache and leave no private cache entries', async () => {
  let calls = 0;
  const client = new SearchPredictions(async () => ({ok:true, text:async () => JSON.stringify(['flash', ['flash games ' + ++calls]])}));
  assert.deepEqual(await client.get('flash', 'google'), ['flash games 1']);
  assert.deepEqual(await client.get('flash', 'google'), ['flash games 1']);
  assert.deepEqual(await client.get('flash', 'google', {privateMode:true}), ['flash games 2']);
  assert.deepEqual(await client.get('flash', 'google', {privateMode:true}), ['flash games 3']);
  assert.deepEqual(await client.get('flash', 'google'), ['flash games 1']);
  await client.get('private phrase', 'google', {privateMode:true});
  assert.equal(client.cache.size, 1);
});

test('failed, malformed, oversized and canceled prediction responses are not cached', async () => {
  for (const response of [{ok:false}, {ok:true,text:async () => 'invalid JSON'}, {ok:true,text:async () => ' '.repeat(128*1024+1)}]) {
    const client = new SearchPredictions(async () => response);
    await assert.rejects(client.get('flash', 'bing')); assert.equal(client.cache.size, 0);
  }
  const controller = new AbortController();
  const client = new SearchPredictions((_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once:true});
  }));
  const pending = client.get('flash', 'bing', {signal:controller.signal});
  controller.abort(); await assert.rejects(pending); assert.equal(client.cache.size, 0);
});
