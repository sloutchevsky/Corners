'use strict';
const fs = require('node:fs'), path = require('node:path');
module.exports = function htmlFixture(directory, bytes = require('./create-demo')) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'movie.swf'), bytes);
  const html = path.join(directory, 'movie.html');
  fs.writeFileSync(html, '<!doctype html><title>Flash website fixture</title><style>html,body{margin:0;height:100%}embed{width:100%;height:100%}</style><embed id="flash-movie" src="movie.swf" type="application/x-shockwave-flash" allowScriptAccess="always">');
  return html;
};
