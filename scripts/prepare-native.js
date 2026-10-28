'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const player = require('../src/legacy/runtime.json');
const SOURCE = process.env.FLASHBORN_FLASH_BROWSER || 'C:\\Program Files (x86)\\FlashBrowser';
const ROOT = path.resolve(__dirname, '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const runtime = path.join(ROOT, 'vendor', 'native-runtime');
  const flash = path.join(ROOT, 'vendor', 'native-flash');
  const bundled = path.join(flash, 'pepflashplayer64.dll');
  let bytes;
  try { bytes = await fs.readFile(bundled); } catch {}
  if (!bytes || digest(bytes) !== player.sha256) {
    bytes = await fs.readFile(path.join(SOURCE, 'resources', 'app', 'flashver', 'pepflashplayer64.dll'));
    if (digest(bytes) !== player.sha256) throw new Error('Original Adobe Flash player checksum mismatch.');
    await fs.mkdir(flash, { recursive: true }); await fs.writeFile(bundled, bytes);
  }
  // Reject patched or damaged players; preserve Adobe's timestamped signature.
  const signature = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$s=Get-AuthenticodeSignature -LiteralPath $env:FLASHBORN_VERIFY_PLAYER; @{status=$s.Status.ToString();signer=$s.SignerCertificate.Subject} | ConvertTo-Json -Compress"],
    { windowsHide: true, encoding: 'utf8', env: { ...process.env, PSModulePath: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'), FLASHBORN_VERIFY_PLAYER: bundled } }));
  if (signature.status !== 'Valid' || !/O=Adobe Inc\./.test(signature.signer)) throw new Error('The bundled Flash player must have a valid Adobe signature.');
  const helper = path.join(runtime, 'resources', 'app');
  // Explicitly remove obsolete generated assets so upgrades cannot package the old player.
  for (const name of ['player.html', 'player.js', 'player.css', 'bolt.png']) await fs.rm(path.join(helper, name), { force: true });
  await fs.cp(path.join(ROOT, 'src', 'legacy'), helper, { recursive: true, force: true });
  if (digest(bytes) !== player.sha256) throw new Error('Bundled player does not match the pinned ' + player.version + ' distribution.');
  const executable = path.join(runtime, 'CornersNative.exe');
  try { await fs.access(executable); } catch {
    await fs.mkdir(runtime, { recursive: true });
    for (const entry of await fs.readdir(SOURCE, { withFileTypes: true })) {
      if (entry.name === 'resources' || /^unins/i.test(entry.name)) continue;
      await fs.cp(path.join(SOURCE, entry.name), path.join(runtime, entry.name === 'FlashBrowser.exe' ? 'CornersNative.exe' : entry.name), { recursive: true });
    }
    await fs.mkdir(path.join(runtime, 'resources'), { recursive: true });
  }
  // This is Corners's host executable. Replace the inherited process label
  // and icon; preserve runtime code, third-party notices and the Adobe DLL.
  execFileSync(path.join(ROOT, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe'), [
    executable,
    '--set-version-string', 'FileDescription', 'Corners',
    '--set-version-string', 'ProductName', 'Corners',
    '--set-version-string', 'InternalName', 'CornersNative',
    '--set-version-string', 'OriginalFilename', 'CornersNative.exe',
    '--set-icon', path.join(ROOT, 'assets', 'icon.ico'),
  ], { windowsHide: true });
  // Remove obsolete generated host files only after the branded replacement
  // exists. A distinct filename avoids Windows reusing the old path's label.
  for (const name of ['FlashRuntime.exe', 'FlashBrowser.exe','FlashbornNative.exe']) await fs.rm(path.join(runtime, name), { force: true });
  await fs.writeFile(path.join(flash, 'provenance.json'), JSON.stringify({ ...player, runtime: (await fs.readFile(path.join(runtime, 'version'), 'utf8')).trim(), copiedAt: new Date().toISOString(), verifiedSignature: signature, use: 'Unmodified native Adobe player from the installed Flash Browser. Its original Adobe signature and timestamp are preserved. Adobe binaries retain their proprietary license.' }, null, 2));
  console.log('Native Adobe Flash ' + player.version + ' (' + player.distribution + ') and compatible runtime are bundled.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
