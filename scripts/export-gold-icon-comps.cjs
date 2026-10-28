'use strict';
// Export the production canvas renderers without modifying geometry or materials.
// Usage: node scripts/export-gold-icon-comps.cjs --frames-dir <temporary directory>
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'previews', 'gold-icon-comps');
const frameFlag = process.argv.indexOf('--frames-dir');
const framesRoot = frameFlag < 0 ? fs.mkdtempSync(path.join(os.tmpdir(), 'Flashborn-gold-comps-')) : path.resolve(process.argv[frameFlag + 1]);
const onlyFlag = process.argv.indexOf('--only');
const only = onlyFlag < 0 ? null : process.argv[onlyFlag + 1];
const fps = 60, size = 1024;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc32 = zlib.crc32 || (data => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function chunks(png) {
  if (!png.subarray(0, 8).equals(signature)) throw new Error('Invalid PNG signature');
  const result = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    result.push({ type, data: png.subarray(offset + 8, offset + 8 + length) }); offset += length + 12;
  }
  return result;
}
function optimizePng(png) {
  const parts = chunks(png);
  const raw = zlib.inflateSync(Buffer.concat(parts.filter(item => item.type === 'IDAT').map(item => item.data)));
  const image = zlib.deflateSync(raw, { level: 9 });
  const result = [signature];
  let written = false;
  for (const item of parts) {
    if (item.type === 'IDAT') {
      if (!written) { result.push(chunk('IDAT', image)); written = true; }
    } else result.push(chunk(item.type, item.data));
  }
  return Buffer.concat(result);
}
function apng(frames) {
  const first = chunks(frames[0]), header = first.find(item => item.type === 'IHDR').data;
  const control = Buffer.alloc(8); control.writeUInt32BE(frames.length); // zero plays = infinite
  const result = [signature, chunk('IHDR', header)];
  for (const item of first) {
    if (item.type === 'IDAT') break;
    if (!['IHDR', 'IEND'].includes(item.type)) result.push(chunk(item.type, item.data));
  }
  result.push(chunk('acTL', control));
  let sequence = 0;
  frames.forEach((frame, index) => {
    const fc = Buffer.alloc(26);
    fc.writeUInt32BE(sequence++, 0); fc.writeUInt32BE(size, 4); fc.writeUInt32BE(size, 8);
    fc.writeUInt16BE(1, 20); fc.writeUInt16BE(fps, 22); // exact 1/60 second
    // Full-canvas SOURCE blend replaces transparent pixels, preventing trails.
    result.push(chunk('fcTL', fc));
    for (const { type, data } of chunks(frame)) if (type === 'IDAT') {
      if (index === 0) result.push(chunk('IDAT', data));
      else { const seq = Buffer.alloc(4); seq.writeUInt32BE(sequence++); result.push(chunk('fdAT', Buffer.concat([seq, data]))); }
    }
  });
  result.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(result);
}
(async () => {
  const sources = {};
  for (const name of ['lightning.js', 'navigation-icons.js']) {
    const bytes = fs.readFileSync(path.join(root, 'src', 'ui', name));
    const target = path.join(output, 'source', name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    sources[`src/ui/${name}`] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  for (const directory of ['animations', 'posters']) fs.mkdirSync(path.join(output, directory), { recursive: true });
  fs.mkdirSync(framesRoot, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1250 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(path.join(output, 'index.html')).href);
    const icons = await page.evaluate(() => GoldComps.icons);
    if (only && !icons.some(icon => icon.id === only)) throw new Error(`Unknown icon: ${only}`);
    const previous = only && fs.existsSync(path.join(output, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8')).icons : [];
    const manifest = { size: [size, size], fps, alpha: 'straight RGBA, transparent background', theme: 'current (original dark-theme gold)', frames: 'Zero-based; frame n is progress n/frameCount. No duplicate terminal frame.', apng: 'Infinite loop; exact 1/60-second frame delays; full-canvas SOURCE blend.', viewport: 'Original scale/padding except history: 2 original units of transparent overscan to contain the rotating arrow.', sources, icons: previous.filter(icon => icon.id !== only) };
    for (const spec of icons.filter(icon => !only || icon.id === only)) {
      const frameCount = Math.round(spec.duration * fps / 1000), frames = [];
      const folder = path.join(framesRoot, spec.id); fs.mkdirSync(folder, { recursive: true });
      await page.evaluate(id => { window.exportRenderer = GoldComps.createRenderer(id); }, spec.id);
      for (let index = 0; index < frameCount; index++) {
        const data = await page.evaluate(({ index, frameCount }) => exportRenderer.draw(index / frameCount).toDataURL('image/png').split(',')[1], { index, frameCount });
        const png = optimizePng(Buffer.from(data, 'base64')); frames.push(png);
        fs.writeFileSync(path.join(folder, `${spec.id}_${String(index).padStart(4, '0')}.png`), png);
      }
      await page.evaluate(() => { exportRenderer.dispose(); delete window.exportRenderer; });
      const loop = apng(frames), posterFrame = spec.id.startsWith('lightning') ? Math.round(frameCount / 12) : 0;
      fs.writeFileSync(path.join(output, 'animations', `${spec.id}.apng`), loop);
      fs.writeFileSync(path.join(output, 'posters', `${spec.id}.png`), frames[posterFrame]);
      manifest.icons.push({ id: spec.id, title: spec.title, seconds: spec.duration / 1000, frames: frameCount, posterFrame, sha256: crypto.createHash('sha256').update(loop).digest('hex') });
      console.log(`${spec.id}: ${frameCount} frames, ${(loop.length / 1048576).toFixed(1)} MiB APNG`);
    }
    manifest.icons.sort((a, b) => icons.findIndex(icon => icon.id === a.id) - icons.findIndex(icon => icon.id === b.id));
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Frames: ${framesRoot}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
