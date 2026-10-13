'use strict';
const { isWebURL } = require('./core');
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const googleHost = /^google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/;
function sourceURL(value) {
  if (!isWebURL(value)) return null;
  const url = new URL(value), host = url.hostname.replace(/^www\./, '');
  let target;
  if (host === 'duckduckgo.com' && url.pathname === '/l/') target = url.searchParams.get('uddg');
  if (googleHost.test(host) && url.pathname === '/url') target = url.searchParams.get('q') || url.searchParams.get('url');
  if (host === 'bing.com' && url.pathname === '/ck/a') {
    const encoded = url.searchParams.get('u');
    if (encoded?.startsWith('a1') && encoded.length < 12000) target = Buffer.from(encoded.slice(2), 'base64').toString('utf8');
  }
  return isWebURL(target || value) ? new URL(target || value).href : null;
}
function searchPage(value) {
  if (!isWebURL(value)) return null;
  const url = new URL(value), host = url.hostname.toLowerCase().replace(/^www\./, '');
  let provider;
  if ((host === 'duckduckgo.com' || host === 'html.duckduckgo.com' || host === 'lite.duckduckgo.com') && ['/', '/html/', '/html', '/lite/', '/lite'].includes(url.pathname)) provider = 'DuckDuckGo';
  if (host === 'bing.com' && url.pathname === '/search') provider = 'Bing';
  if (googleHost.test(host) && url.pathname === '/search') provider = 'Google';
  const query = clean(url.searchParams.get('q')).slice(0, 200);
  if (!provider || !query || ['isch', 'vid', 'nws', 'shop'].includes(url.searchParams.get('tbm')) || ['images', 'videos', 'news', 'shop'].includes(url.searchParams.get('udm'))) return null;
  return { provider, query };
}
// Executed in the page's main frame. Text is untrusted data, never markup.
function readPageText() {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = el => !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  const result = [], seen = new Set();
  const containers = document.querySelectorAll('[data-testid="result"],.result,.b_algo,.MjjYud,.g');
  for (const node of containers) {
    if (!visible(node) || node.closest('[data-testid*="ad"],.b_ad,.result--ad,[aria-label="Ads"]')) continue;
    const anchor = node.querySelector('[data-testid="result-title-a"],.result__a,h2 a,a:has(h3)');
    const snippet = node.querySelector('[data-result="snippet"],[data-testid="result-snippet"],.result__snippet,.b_caption p,.VwiC3b,[data-sncf]');
    if (!anchor || !visible(anchor) || !snippet || !visible(snippet)) continue;
    const text = clean(snippet.innerText), title = clean(anchor.innerText), url = anchor.href;
    if (text.length < 45 || url.length > 8192 || seen.has(url)) continue;
    seen.add(url); result.push({ title: title.slice(0, 200), text: text.slice(0, 1500), url });
    if (result.length >= 10) break;
  }
  const main = document.querySelector('article,[role="main"],main') || document.body;
  const paragraphs = [];
  if (main) for (const node of main.querySelectorAll('p')) {
    if (!visible(node) || node.closest('nav,header,footer,aside,form,[role="navigation"],[aria-hidden="true"]')) continue;
    const text = clean(node.innerText);
    if (text.length >= 70 && text.length <= 2000 && !/^(accept (?:all )?cookies|we use cookies|sign (?:in|up)|subscribe to|advertisement)/i.test(text)) paragraphs.push(text);
    if (paragraphs.length >= 45) break;
  }
  return { title: clean(document.title).slice(0, 200), results: result, paragraphs,
    description: clean(document.querySelector('meta[name="description"]')?.content).slice(0, 600) };
}
const readPageScript = '(' + readPageText.toString() + ')()';
function makeSummary(data, value, mode = 'search') {
  const search = searchPage(value);
  if (!isWebURL(value) || mode === 'search' && !search || !data || typeof data !== 'object') return null;
  const terms = new Set(clean(search?.query || data.title).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const documents = search ? (Array.isArray(data.results) ? data.results : []).slice(0, 10).flatMap(item => {
    if (!item || !sourceURL(item.url) || !clean(item.text)) return [];
    const url = new URL(sourceURL(item.url));
    if (/^(?:www\.)?(?:google|bing|duckduckgo)\./.test(url.hostname) && /\/(?:search|url)/.test(url.pathname)) return [];
    return [{ title: clean(item.title).slice(0, 160), url: url.href, text: clean(item.text).slice(0, 1500) }];
  }) : [{ title: clean(data.title).slice(0, 160), url: value, text: (Array.isArray(data.paragraphs) && data.paragraphs.length ? data.paragraphs.slice(0, 45) : [data.description]).map(clean).join(' ').slice(0, 24000) }];
  const candidates = [];
  documents.forEach((doc, source) => {
    doc.text = doc.text.replace(/^(?:[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d+\s+(?:hours?|days?|weeks?|months?|years?)\s+ago)\s*[—·:,-]?\s*/i, '');
    const sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(doc.text)].map(s => s.segment);
    for (const [order, raw] of sentences.entries()) {
      let text = clean(raw).replace(/^\d{1,2} [A-Za-z]+ \d{4}\s*[—·-]?\s*/, '');
      if (text.length < 45 || /^(?:read more|learn (?:more|how|about)|click here|sign in|subscribe|discover how|explore how)/i.test(text)) continue;
      if (/(?:…|\.{2,})$/.test(text)) {
        text = text.replace(/\s*(?:…|\.{2,})$/, '');
        if (/\b(?:and|or|of|to|with|from|including|generating|producing|creating|using|can|will|may|the|a|an)$/i.test(text)) {
          const comma = text.lastIndexOf(',');
          if (comma < 65) continue;
          text = text.slice(0, comma);
        }
        text += '.';
      }
      if (text.length > 240) text = text.slice(0, 237).replace(/\s+\S*$/, '') + '…';
      const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
      const score = [...words].filter(word => terms.has(word)).length * 2 + 3 / (source + 1) + 1 / (order + 1);
      candidates.push({ text, words, source, order, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  for (const item of candidates) {
    if (selected.some(other => search && other.source === item.source || [...item.words].filter(word => other.words.has(word)).length / Math.max(1, Math.min(item.words.size, other.words.size)) > .8)) continue;
    if (selected.length && selected.reduce((n, s) => n + s.text.length, 0) + item.text.length > 510) continue;
    selected.push(item); if (selected.length >= 3) break;
  }
  selected.sort((a, b) => a.source - b.source || a.order - b.order);
  if (!selected.length) return null;
  return { url: value, query: search?.query || '', provider: search?.provider || '', title: clean(data.title).slice(0, 200),
    passages: selected.map(item => ({ text: item.text, source: item.source })),
    sources: [...new Set(selected.map(item => item.source))].map(index => ({ index, title: documents[index].title, url: documents[index].url, domain: new URL(documents[index].url).hostname.replace(/^www\./, '') })) };
}
module.exports = { searchPage, sourceURL, readPageScript, makeSummary };
