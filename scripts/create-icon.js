'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const size = 256;
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc(buffer) { let c = 0xffffffff; for (const b of buffer) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const head = Buffer.alloc(4); head.writeUInt32BE(data.length); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([head, name, data, tail]); }
const polygon = [[144, 43], [70, 139], [125, 139], [111, 213], [188, 107], [138, 107]];
function inside(x, y) { let yes = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const [xi, yi] = polygon[i], [xj, yj] = polygon[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) yes = !yes; } return yes; }
const pixels = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  let rgb = [0, 0, 0, 0];
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const px = x + (sx + .5) / 4, py = y + (sy + .5) / 4;
    const dx = Math.max(48 - px, 0, px - 208), dy = Math.max(48 - py, 0, py - 208);
    if (dx * dx + dy * dy <= 40 * 40 && px >= 8 && px <= 248 && py >= 8 && py <= 248) {
      const color = inside(px, py) ? [233, 214, 186] : [35 + Math.round((256 - py) / 40), 34 + Math.round((256 - py) / 50), 31];
      for (let k = 0; k < 3; k++) rgb[k] += color[k]; rgb[3] += 255;
    }
  }
  const offset = y * (size * 4 + 1) + 1 + x * 4;
  for (let k = 0; k < 4; k++) pixels[offset + k] = Math.round(rgb[k] / 16);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
const directory = path.join(__dirname, '..', 'assets'); fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'icon.png'), png); fs.writeFileSync(path.join(directory, 'icon.ico'), Buffer.concat([ico, png]));
console.log('Flashborn icon created.');
