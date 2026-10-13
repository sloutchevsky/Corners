'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

async function main() {
  const root = path.join(__dirname, '..');
  const extension = path.join(root, 'vendor', 'flash-extension');
  if (!fs.existsSync(path.join(extension, 'dist', 'ruffle.js'))) {
    const cache = path.join(root, '.cache');
    await fsp.mkdir(cache, { recursive: true });
    const zip = path.join(cache, 'ruffle-extension.zip');
    const response = await fetch('https://github.com/ruffle-rs/ruffle/releases/download/v0.7.1/ruffle-0.7.1-web-extension.zip');
    if (!response.ok) throw new Error(`Ruffle download: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== 'a1b6fe8007fe7bc4537bacdadcdd5bc4a98c6a271309bb19103ad41cc2f168d9') throw new Error('Ruffle release checksum mismatch');
    await fsp.writeFile(zip, bytes);
    // Paths passed as environment values; never interpolated into PowerShell code.
    execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:FLASHBORN_ZIP -DestinationPath $env:FLASHBORN_EXT -Force'], {
      windowsHide: true, env: { ...process.env, FLASHBORN_ZIP: zip, FLASHBORN_EXT: extension }
    });
  }
  const manifestFile = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestFile, 'utf8'));
  const original = manifest.content_scripts.find(s => s.js.includes('dist/content.js'));
  // Electron supports local storage and content scripts, but not sync storage or
  // Ruffle's service worker / declarative SWF takeover. The browser handles SWFs.
  manifest.content_scripts = [
    { ...original, world: 'MAIN', js: ['dist/pluginPolyfill.js', 'dist/ruffle.js'] },
    { ...original, world: 'ISOLATED' }
  ];
  manifest.permissions = ['storage', 'scripting'];
  delete manifest.background;
  delete manifest.declarative_net_request;
  delete manifest.action;
  delete manifest.options_ui;
  await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  const contentFile = path.join(extension, 'dist', 'content.js');
  let content = await fsp.readFile(contentFile, 'utf8');
  content = content.replaceAll('browser.storage.sync', 'browser.storage.local');
  await fsp.writeFile(contentFile, content);
  console.log('Ruffle 0.7.1 ready (verified release + Electron content-script adapter).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
