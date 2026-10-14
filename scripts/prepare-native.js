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
    const cache = path.join(ROOT, '.cache', 'flash-update');
    const archive = path.join(cache, path.basename(new URL(player.archiveURL).pathname));
    await fs.mkdir(cache, { recursive: true });
    let archiveBytes;
    try { archiveBytes = await fs.readFile(archive); } catch {
      const response = await fetch(player.archiveURL, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error('Could not download the pinned Flash distribution: HTTP ' + response.status);
      archiveBytes = Buffer.from(await response.arrayBuffer());
      if (archiveBytes.length > 64 * 1024 * 1024) throw new Error('Unexpected Flash archive size.');
      if (digest(archiveBytes) !== player.archiveSHA256) throw new Error('Flash distribution archive checksum mismatch.');
      await fs.writeFile(archive, archiveBytes);
    }
    if (digest(archiveBytes) !== player.archiveSHA256) throw new Error('Flash distribution archive checksum mismatch.');
    execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archive, '-C', cache, player.archivePath, 'README.txt'], { windowsHide: true });
    bytes = await fs.readFile(path.join(cache, player.archivePath));
    if (digest(bytes) !== player.sha256) throw new Error('Extracted Flash player checksum mismatch.');
    await fs.mkdir(flash, { recursive: true }); await fs.writeFile(bundled, bytes);
  }
  await fs.cp(path.join(ROOT, 'src', 'legacy'), path.join(runtime, 'resources', 'app'), { recursive: true, force: true });
  if (digest(bytes) !== player.sha256) throw new Error('Bundled player does not match the pinned ' + player.version + ' distribution.');
  try { await fs.access(path.join(runtime, 'FlashRuntime.exe')); } catch {
    await fs.mkdir(runtime, { recursive: true });
    for (const entry of await fs.readdir(SOURCE, { withFileTypes: true })) {
      if (entry.name === 'resources' || /^unins/i.test(entry.name)) continue;
      await fs.cp(path.join(SOURCE, entry.name), path.join(runtime, entry.name === 'FlashBrowser.exe' ? 'FlashRuntime.exe' : entry.name), { recursive: true });
    }
    await fs.mkdir(path.join(runtime, 'resources'), { recursive: true });
  }
  await fs.writeFile(path.join(flash, 'provenance.json'), JSON.stringify({ ...player, runtime: (await fs.readFile(path.join(runtime, 'version'), 'utf8')).trim(), copiedAt: new Date().toISOString(), use: 'Native Adobe player from the Clean Flash distribution. Upstream patches change the Adobe signature; the archive and DLL are pinned by SHA-256. Adobe binaries retain their proprietary license.' }, null, 2));
  console.log('Native Adobe Flash ' + player.version + ' (' + player.distribution + ') and compatible runtime are bundled.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
