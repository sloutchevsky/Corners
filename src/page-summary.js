'use strict';
const { isWebURL } = require('./core');
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const googleHost = /^google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/;
const stopWords = new Set('the and for with from that this are was were have has had into their they them your you our its can will may how what when where why which who about more most some also not but all one use used using'.split(' '));
const wordsOf = text => new Set((clean(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(word => !stopWords.has(word)));
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
  const result = [], seen = new Set(); let layout;
  const containers = document.querySelectorAll('[data-testid="result"],.result,.b_algo,.MjjYud,.g');
  for (const node of containers) {
    if (!visible(node) || node.closest('[data-testid*="ad"],.b_ad,.result--ad,[aria-label="Ads"]')) continue;
    const anchor = node.querySelector('[data-testid="result-title-a"],.result__a,h2 a,a:has(h3)');
    const snippet = node.querySelector('[data-result="snippet"],[data-testid="result-snippet"],.result__snippet,.b_caption p,.VwiC3b,[data-sncf]');
    if (!anchor || !visible(anchor) || !snippet || !visible(snippet)) continue;
    const text = clean(snippet.innerText), title = clean(anchor.innerText), url = anchor.href;
    if (text.length < 45 || url.length > 8192 || seen.has(url)) continue;
    if (!layout) {
      const heading = anchor.getBoundingClientRect(), copy = snippet.getBoundingClientRect();
      layout = { left: heading.left, width: Math.max(650, copy.width), viewportWidth: innerWidth };
    }
    seen.add(url); result.push({ title: title.slice(0, 200), text: text.slice(0, 2000), url });
    if (result.length >= 12) break;
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
    description: clean(document.querySelector('meta[name="description"]')?.content).slice(0, 600), layout };
}
const readPageScript = '(' + readPageText.toString() + ')()';
function makeSummary(data, value, mode = 'search') {
  const search = searchPage(value);
  if (!isWebURL(value) || mode === 'search' && !search || !data || typeof data !== 'object') return null;
  const terms = wordsOf(search?.query || data.title);
  const documents = search ? (Array.isArray(data.results) ? data.results : []).slice(0, 12).flatMap(item => {
    if (!item || !sourceURL(item.url) || !clean(item.text)) return [];
    const url = new URL(sourceURL(item.url));
    if (/^(?:www\.)?(?:google|bing|duckduckgo)\./.test(url.hostname) && /\/(?:search|url)/.test(url.pathname)) return [];
    return [{ title: clean(item.title).slice(0, 160), url: url.href, text: clean(item.text).slice(0, 2000) }];
  }) : [{ title: clean(data.title).slice(0, 160), url: value, text: (Array.isArray(data.paragraphs) && data.paragraphs.length ? data.paragraphs.slice(0, 45) : [data.description]).map(clean).join(' ').slice(0, 24000) }];
  const candidates = [], frequency = new Map();
  for (const doc of documents) for (const word of wordsOf(doc.text)) frequency.set(word, (frequency.get(word) || 0) + 1);
  documents.forEach((doc, source) => {
    doc.text = doc.text.replace(/^(?:[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d+\s+(?:hours?|days?|weeks?|months?|years?)\s+ago)\s*[—·:,-]?\s*/i, '');
    const sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(doc.text)].map(s => s.segment);
    for (const [order, raw] of sentences.entries()) {
      let text = clean(raw).replace(/^\d{1,2} [A-Za-z]+ \d{4}\s*[—·-]?\s*/, '');
      if (text.length < 45 || /^(?:read more|learn (?:more|how|about)|click here|sign in|subscribe|discover how|explore how|shop\b|buy\b|we (?:are pausing|are launching|will launch)|coming soon)/i.test(text)) continue;
      if (/(?:…|\.{2,})$/.test(text)) {
        text = text.replace(/\s*(?:…|\.{2,})$/, '');
        if (/\b(?:and|or|of|to|with|from|including|generating|producing|creating|using|can|will|may|the|a|an)$/i.test(text)) {
          const comma = text.lastIndexOf(',');
          if (comma < 65) continue;
          text = text.slice(0, comma);
        }
        text += '.';
      }
      if (text.length > 420) text = text.slice(0, 417).replace(/\s+\S*$/, '') + '…';
      const words = wordsOf(text);
      const overlap = [...words].filter(word => terms.has(word)).length;
      const titleOverlap = [...wordsOf(doc.title)].filter(word => terms.has(word)).length;
      const shared = [...words].filter(word => (frequency.get(word) || 0) > 1).length / Math.max(1, words.size);
      // Prefer answers that address the query and corroborate other results,
      // rather than awarding the first result an overwhelming rank bonus.
      const score = overlap * 2.5 + titleOverlap * .8 + shared * 4 + .4 / (order + 1) + .05 / (source + 1);
      candidates.push({ text, words, source, order, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  for (const item of candidates) {
    if (selected.some(other => search && other.source === item.source || [...item.words].filter(word => other.words.has(word)).length / Math.max(1, Math.min(item.words.size, other.words.size)) > .72)) continue;
    const domain = new URL(documents[item.source].url).hostname.replace(/^www\./, '');
    if (search && selected.some(other => new URL(documents[other.source].url).hostname.replace(/^www\./, '') === domain)) continue;
    if (selected.length && selected.reduce((n, s) => n + s.text.length, 0) + item.text.length > 1200) continue;
    selected.push(item); if (selected.length >= 4) break;
  }
  if (!selected.length) return null;
  const layout = data.layout && Number.isFinite(data.layout.left) && Number.isFinite(data.layout.width)
    ? { left: Math.max(16, data.layout.left), width: Math.max(320, Math.min(900, data.layout.width)) } : { left: 40, width: 760 };
  return { url: value, query: search?.query || '', provider: search?.provider || '', title: clean(data.title).slice(0, 200),
    layout,
    passages: selected.map(item => ({ text: item.text, source: item.source })),
    sources: [...new Set(selected.map(item => item.source))].map(index => ({ index, title: documents[index].title, url: documents[index].url, domain: new URL(documents[index].url).hostname.replace(/^www\./, '') })) };
}
module.exports = { searchPage, sourceURL, readPageScript, makeSummary };
