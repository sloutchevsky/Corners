'use strict';
const escape = text => String(text).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]));
function standalonePage(source) {
  const background = /^#[0-9a-f]{6}$/i.test(source.background || '') ? source.background : '#e6e6e6';
  const movie = source.url || encodeURIComponent(require('path').basename(source.path));
  return '<!doctype html><meta charset="utf-8"><title>Flash movie</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:' + background + '}embed{display:block;width:100%;height:100%}</style><embed id="flash-movie" type="application/x-shockwave-flash" src="' + escape(movie) + '" bgcolor="' + background + '" quality="high" scale="showall" allowfullscreen="true" allowscriptaccess="sameDomain">';
}
module.exports = { standalonePage };
