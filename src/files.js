'use strict';
const path = require('node:path');
const { isWebURL } = require('./core');
const types = { '.pdf':'application/pdf', '.html':'text/html', '.htm':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.txt':'text/plain',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml', '.avif':'image/avif', '.bmp':'image/bmp', '.ico':'image/x-icon',
  '.mp4':'video/mp4', '.m4v':'video/mp4', '.webm':'video/webm', '.ogv':'video/ogg', '.mov':'video/quicktime', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.swf':'application/x-shockwave-flash' };
function contentType(file) { return types[path.extname(file).toLowerCase()] || 'application/octet-stream'; }
function supportedLocalFile(file) { return /\.(swf|html?|pdf|png|jpe?g|gif|webp|svg|avif|bmp|ico|mp4|m4v|webm|ogv|mov)$/i.test(file); }
function urlSuggestions(query, entries) {
  if (typeof query !== 'string') return [];
  const term = query.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (!term || term.length > 8192) return [];
  const seen = new Set(), matches = [];
  for (const entry of entries) {
    if (!isWebURL(entry.url) || seen.has(entry.url)) continue;
    seen.add(entry.url);
    const url = entry.url.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
    const score = url.startsWith(term) ? 0 : url.includes(term) ? 1 : String(entry.title || '').toLowerCase().includes(term) ? 2 : 3;
    if (score < 3) matches.push({ url: entry.url, title: String(entry.title || new URL(entry.url).hostname).slice(0, 200), score });
  }
  return matches.sort((a, b) => a.score - b.score).slice(0, 6).map(({ score, ...entry }) => entry);
}
module.exports = { contentType, supportedLocalFile, urlSuggestions };
