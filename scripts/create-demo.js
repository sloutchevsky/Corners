'use strict';
// Original SWF fixture: a cream square glides across a dark stage.
// No downloaded games, runtime compiler, or copyrighted demo assets.
const fs = require('node:fs');
const path = require('node:path');
class Bits {
  constructor() { this.bits = []; }
  add(value, count) { if (value < 0) value += 2 ** count; for (let i = count - 1; i >= 0; i--) this.bits.push(Math.floor(value / 2 ** i) & 1); return this; }
  buffer() { const bytes = Buffer.alloc(Math.ceil(this.bits.length / 8)); this.bits.forEach((b, i) => bytes[i >> 3] |= b << (7 - i % 8)); return bytes; }
}
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
function rect(w, h) { return new Bits().add(16, 5).add(0, 16).add(w * 20, 16).add(0, 16).add(h * 20, 16).buffer(); }
function tag(code, data = Buffer.alloc(0)) { return Buffer.concat([u16((code << 6) | Math.min(data.length, 63)), ...(data.length >= 63 ? [u32(data.length)] : []), data]); }
function edge(bits, delta, vertical) { const count = Math.ceil(Math.log2(Math.abs(delta) + 1)) + 1; bits.add(1, 1).add(1, 1).add(count - 2, 4).add(0, 1).add(vertical ? 1 : 0, 1).add(delta, count); }
const shapeBits = new Bits().add(1, 4).add(0, 4).add(0, 1).add(5, 5).add(1, 5).add(0, 1).add(0, 1).add(1, 1);
edge(shapeBits, 1600, false); edge(shapeBits, 1600, true); edge(shapeBits, -1600, false); edge(shapeBits, -1600, true); shapeBits.add(0, 6);
const shape = Buffer.concat([u16(1), rect(80, 80), Buffer.from([1, 0, 233, 214, 186, 255, 0]), shapeBits.buffer()]);
function matrix(x, y) { return new Bits().add(0, 1).add(0, 1).add(16, 5).add(x * 20, 16).add(y * 20, 16).buffer(); }
const tags = [tag(9, Buffer.from([30, 32, 37])), tag(32, shape)];
for (let frame = 0; frame < 96; frame++) {
  const x = Math.round(280 + 210 * Math.sin(frame / 96 * Math.PI * 2));
  const y = Math.round(160 + 70 * Math.cos(frame / 96 * Math.PI * 2));
  tags.push(tag(26, Buffer.concat([Buffer.from([frame === 0 ? 6 : 5]), u16(1), ...(frame === 0 ? [u16(1)] : []), matrix(x, y)])), tag(1));
}
tags.push(tag(0));
const body = Buffer.concat([rect(640, 400), u16(24 * 256), u16(96), ...tags]);
const swf = Buffer.concat([Buffer.from('FWS\x08'), u32(body.length + 8), body]);
const directory = path.join(__dirname, '..', 'assets'); fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'Flashborn-Demo.swf'), swf);
module.exports = swf;
