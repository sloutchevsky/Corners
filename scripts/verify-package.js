'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), asar = require('@electron/asar');
const root = path.resolve(__dirname, '..'), payload = process.env.FLASHBORN_EXE ? path.dirname(process.env.FLASHBORN_EXE) : path.join(root, 'release', 'win-unpacked');
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
for (const file of ['ui/tab-preview.html', 'ui/tab-preview.js', 'ui/tab-preview.css', 'ui/tab-tooltip.html', 'ui/tab-tooltip.js', 'ui/tab-tooltip.css', 'screen-color-picker.js', 'ui/color.html', 'ui/color.js', 'ui/color.css', 'ui/screen-color.html', 'ui/screen-color.js', 'ui/screen-color.css', 'legacy/player.html', 'legacy/player.js', 'legacy/player.css', 'legacy/bolt.png']) {
  assert.ok(!packaged.has('/src/' + file), 'Obsolete asset in app.asar: ' + file);
}
const helper = path.join(payload, 'resources', 'native-runtime', 'resources', 'app');
const source = path.join(root, 'src', 'legacy');
assert.deepEqual(fs.readdirSync(helper).sort(), fs.readdirSync(source).sort(), 'No obsolete helper files may survive preparation');
for (const name of fs.readdirSync(source)) assert.deepEqual(fs.readFileSync(path.join(helper, name)), fs.readFileSync(path.join(source, name)), name);
const manifest = require('../src/legacy/runtime.json');
const player = fs.readFileSync(path.join(payload, 'resources', 'native-flash', 'pepflashplayer64.dll'));
assert.equal(crypto.createHash('sha256').update(player).digest('hex'), manifest.sha256);
const { NtExecutable, NtExecutableResource, Resource, Data } = require('resedit');
const nativeExe = NtExecutable.from(fs.readFileSync(path.join(payload, 'resources', 'native-runtime', 'CornersNative.exe')), { ignoreCert: true });
for (const oldName of ['FlashRuntime.exe','FlashBrowser.exe','FlashbornNative.exe']) assert.equal(fs.existsSync(path.join(payload,'resources','native-runtime',oldName)),false,'No obsolete native executable may remain');
const nativeResources = NtExecutableResource.from(nativeExe).entries;
for (const info of Resource.VersionInfo.fromEntries(nativeResources)) {
  for (const language of info.getAllLanguagesForStringValues()) {
    const strings = info.getStringValues(language);
    assert.equal(strings.FileDescription, 'Corners', 'Native process display name');
    assert.equal(strings.ProductName, 'Corners', 'Native product name');
    assert.equal(strings.OriginalFilename, 'CornersNative.exe');
  }
}
assert.ok(Resource.VersionInfo.fromEntries(nativeResources).length, 'Native executable has Windows branding');
const mainResources=NtExecutableResource.from(NtExecutable.from(fs.readFileSync(path.join(payload,'Corners.exe')),{ignoreCert:true})).entries;
const mainVersions=Resource.VersionInfo.fromEntries(mainResources);
assert.ok(mainVersions.length,'Main executable has Windows branding');
for(const info of mainVersions)for(const language of info.getAllLanguagesForStringValues()){
  const strings=info.getStringValues(language);
  assert.equal(strings.FileDescription,'Corners','Main process display name');
  assert.equal(strings.ProductName,'Corners','Main product name');
}
const expectedIcons = Data.IconFile.from(fs.readFileSync(path.join(root, 'assets', 'icon.ico'))).icons.map(item => Buffer.from(item.data.isRaw() ? item.data.bin : item.data.generate()).toString('hex')).sort();
assert.deepEqual(nativeResources.filter(entry => entry.type === 3).map(entry => Buffer.from(entry.bin).toString('hex')).sort(), expectedIcons, 'Native executable uses the Corners icon');
assert.equal(fs.existsSync(path.join(payload, 'resources', 'elevate.exe')), false, 'Unused updater elevation helper must not ship');
assert.equal(require('../package.json').build.fileAssociations, undefined);
assert.ok(packaged.has('/src/legacy/standalone.js'));
console.log('Verified ' + count + ' source files, version ' + version + ', native helper contents and Corners process branding/icon, pinned Flash bytes, restored inline SWF wrapper and absence of obsolete picker/elevation helper.');
