'use strict';
const { SEARCH_ENGINES, isWebURL } = require('./core');
const { urlSuggestions } = require('./files');
const PROVIDERS = {
  duckduckgo: 'https://duckduckgo.com/ac/?type=list&q=',
  google: 'https://suggestqueries.google.com/complete/search?client=firefox&q=',
  bing: 'https://www.bing.com/osjson.aspx?query='
};

const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 200) : '';
function canPredict(query) {
  const text = clean(query);
  return text.length >= 2 && !/^(?:[a-z][\w+.-]*:|\\\\|[a-z]:[\\/]|\/)/i.test(text)
    && !/[@\\]/.test(text) && !/^(?:localhost|(?:\d{1,3}\.){1,3}\d*)(?::\d*)?(?:\/|$)/i.test(text)
    && !(!/\s/.test(text) && /[./?#]/.test(text));
}
function searchItem(query, engine, source = 'history') {
  return { type: 'search', title: query, inputText: query, url: (SEARCH_ENGINES[engine] || SEARCH_ENGINES.duckduckgo) + encodeURIComponent(query), source };
}
function predictionTerms(payload) {
  const entries = Array.isArray(payload?.[1]) ? payload[1] : Array.isArray(payload) ? payload : [];
  const seen = new Set();
  return entries.flatMap(entry => {
    const term = clean(typeof entry === 'string' ? entry : entry?.phrase);
    const key = term.toLowerCase();
    if (!term || seen.has(key) || /[\u0000-\u001f]/.test(term)) return [];
    seen.add(key); return [term];
  }).slice(0, 8);
}
function suggestions(query, entries, engine, predictions = [], { allowSearch = true, library = [] } = {}) {
  const text = String(query || '').trim().slice(0, 8192);
  if (!text) return [];
  const urls = urlSuggestions(text, entries).map(item => ({ ...item, type: 'url', inputText: item.url }));
  if (!allowSearch) {
    const term = text.toLowerCase();
    const files = library.filter(item => item.path && (item.path.toLowerCase().includes(term) || String(item.title || '').toLowerCase().includes(term)))
      .map(item => ({ type: 'file', title: item.title || item.path, url: item.path, inputText: item.path }));
    return [...files, ...urls].slice(0, 8);
  }
  if (!canPredict(text) && !/\s/.test(text)) return urls;
  const searches = [], seen = new Set();
  const add = (value, source) => {
    const term = clean(value), key = term.toLowerCase();
    if (!term || seen.has(key)) return;
    seen.add(key); searches.push(searchItem(term, engine, source));
  };
  add(text, 'typed');
  for (const entry of entries) {
    if (!isWebURL(entry.url)) continue;
    const url = new URL(entry.url);
    if (!/(^|\.)(?:google\.com|bing\.com|duckduckgo\.com)$/.test(url.hostname)) continue;
    const previous = clean(url.searchParams.get('q'));
    if (previous.toLowerCase().startsWith(text.toLowerCase())) add(previous, 'history');
  }
  for (const prediction of predictions) add(prediction, 'prediction');
  return [...urls.slice(0, 4), ...searches].slice(0, 8);
}
class SearchPredictions {
  constructor(fetch) { this.fetch = fetch; this.cache = new Map(); }
  async get(query, engine, { signal, privateMode = false } = {}) {
    if (!canPredict(query)) return [];
    const text = clean(query), provider = PROVIDERS[engine] ? engine : 'duckduckgo';
    const key = provider + ':' + text.toLowerCase(), cached = !privateMode && this.cache.get(key);
    if (cached && Date.now() - cached.time < 60000) return cached.terms;
    const timeout = AbortSignal.timeout(1800);
    const response = await this.fetch(PROVIDERS[provider] + encodeURIComponent(text), {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Search predictions unavailable.');
    const body = await response.text();
    if (body.length > 128 * 1024) throw new Error('Search predictions response too large.');
    const terms = predictionTerms(JSON.parse(body));
    if (!privateMode && !signal?.aborted) {
      this.cache.set(key, { terms, time: Date.now() });
      if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value);
    }
    return terms;
  }
}
module.exports = { PROVIDERS, canPredict, predictionTerms, suggestions, SearchPredictions };
