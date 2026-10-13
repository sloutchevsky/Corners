'use strict';
const path = require('node:path');

const SEARCH_ENGINES = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q='
};

function resolveInput(value, engine = 'duckduckgo') {
  const text = String(value || '').trim().slice(0, 8192);
  if (!text) return { type: 'home' };
  if (/^flashborn:\/\/(home|newtab)\/?$/i.test(text)) return { type: 'home' };
  if (/^[a-z]:[\\/]/i.test(text) || /^\\\\/.test(text)) return { type: 'file', path: text };
  if (/^file:/i.test(text)) {
    try { return { type: 'file', path: require('node:url').fileURLToPath(text) }; }
    catch { throw new Error('That local file address is invalid.'); }
  }
  if (/^[a-z][\w+.-]*:/i.test(text) && !/^(localhost|[\w.-]+\.\w+):\d/i.test(text)) {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Enter an http or https address, or open a local SWF file.');
    if (url.username || url.password) throw new Error('Addresses containing passwords are not supported.');
    return { type: /\.swf$/i.test(url.pathname) ? 'flash' : 'web', url: url.href };
  }
  if (!/\s/.test(text) && /^(localhost(?::\d+)?|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|(?:[\w-]+\.)+[\w-]{2,}(?::\d+)?)([/?#].*)?$/i.test(text)) {
    const url = new URL((/^(localhost|127\.)/i.test(text) ? 'http://' : 'https://') + text);
    return { type: /\.swf$/i.test(url.pathname) ? 'flash' : 'web', url: url.href };
  }
  return { type: 'web', url: (SEARCH_ENGINES[engine] || SEARCH_ENGINES.duckduckgo) + encodeURIComponent(text) };
}

function isWebURL(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
}

function containedPath(root, relative) {
  const resolved = path.resolve(root, relative);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) throw new Error('Path outside allowed directory.');
  return resolved;
}

function isSWF(buffer) {
  return buffer.length >= 8 && ['FWS', 'CWS', 'ZWS'].includes(buffer.subarray(0, 3).toString('ascii'));
}

module.exports = { resolveInput, isWebURL, containedPath, isSWF, SEARCH_ENGINES };
