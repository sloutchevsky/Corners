'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), asar = require('@electron/asar');
const root = path.resolve(__dirname, '..'), payload = path.join(root, 'release', 'win-unpacked');
const archive = path.join(payload, 'resources', 'app.asar'), version = require('../package.json').version;
let count = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(relative);
    else { assert.deepEqual(asar.extractFile(archive, relative), fs.readFileSync(path.join(root, relative)), relative); count++; }
  }
}
visit('src');
assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, version);
const packaged = new Set(asar.listPackage(archive).map(name => name.replaceAll('\\', '/')));
for (const file of ['screen-color-picker.js', 'ui/color.html', 'ui/color.js', 'ui/color.css', 'ui/screen-color.html', 'ui/screen-color.js', 'ui/screen-color.css', 'legacy/player.html', 'legacy/player.js', 'legacy/player.css', 'legacy/bolt.png']) {
  assert.ok(!packaged.has('/src/' + file), 'Obsolete asset in app.asar: ' + file);
}
const helper = path.join(payload, 'resources', 'native-runtime', 'resources', 'app');
const source = path.join(root, 'src', 'legacy');
assert.deepEqual(fs.readdirSync(helper).sort(), fs.readdirSync(source).sort(), 'No obsolete helper files may survive preparation');
for (const name of fs.readdirSync(source)) assert.deepEqual(fs.readFileSync(path.join(helper, name)), fs.readFileSync(path.join(source, name)), name);
const manifest = require('../src/legacy/runtime.json');
const player = fs.readFileSync(path.join(payload, 'resources', 'native-flash', 'pepflashplayer64.dll'));
assert.equal(crypto.createHash('sha256').update(player).digest('hex'), manifest.sha256);
assert.equal(fs.existsSync(path.join(payload, 'resources', 'elevate.exe')), false, 'Unused updater elevation helper must not ship');
assert.equal(require('../package.json').build.fileAssociations, undefined);
console.log('Verified ' + count + ' source files, version ' + version + ', exact native helper contents, pinned Flash bytes, and absence of the standalone player/picker/elevation helper.');
