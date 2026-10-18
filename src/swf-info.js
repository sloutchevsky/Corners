'use strict';
const zlib = require('node:zlib');
const MAX_SIZE = 64 * 1024 * 1024, DEFAULT_BACKGROUND = '#e6e6e6';
function bodyInfo(body) {
  const bits = body[0] >> 3, header = Math.ceil((5 + bits * 4) / 8) + 4;
  if (!bits || header > body.length) return { background: DEFAULT_BACKGROUND };
  let offset = header;
  while (offset + 2 <= body.length) {
    const tag = body.readUInt16LE(offset); offset += 2;
    let size = tag & 63; const code = tag >> 6;
    if (size === 63) { if (offset + 4 > body.length) break; size = body.readUInt32LE(offset); offset += 4; }
    if (size > body.length - offset) break;
    if (code === 9 && size === 3) return { background: '#' + body.subarray(offset, offset + 3).toString('hex') };
    if (code === 0 || code === 1) break;
    offset += size;
  }
  return { background: DEFAULT_BACKGROUND };
}
async function swfInfo(bytes) {
  if (bytes.length < 12 || !['FWS', 'CWS', 'ZWS'].includes(bytes.toString('ascii', 0, 3))) throw new Error('This file does not contain a valid SWF header.');
  const length = bytes.readUInt32LE(4);
  if (length < 12) throw new Error('Invalid SWF length.');
  // Metadata is optional. Large movies still play in Adobe without allocating
  // their entire decompressed body just to inspect a background color.
  if (length > MAX_SIZE) return { background: DEFAULT_BACKGROUND };
  try {
    const signature = bytes.toString('ascii', 0, 3); let body;
    if (signature === 'FWS') body = bytes.subarray(8);
    else if (signature === 'CWS') body = await new Promise((resolve, reject) => zlib.inflate(bytes.subarray(8), { maxOutputLength: MAX_SIZE }, (error, value) => error ? reject(error) : resolve(value)));
    else {
      if (bytes.length < 18 || bytes.readUInt32LE(13) > MAX_SIZE) return { background: DEFAULT_BACKGROUND };
      const size = Buffer.alloc(8); size.writeUInt32LE(length - 8);
      // SWF ZWS uses an extra compressed-length field; .lzma uses an 8-byte
      // uncompressed-size field between its properties and compressed data.
      const lzma = Buffer.concat([bytes.subarray(12, 17), size, bytes.subarray(17)]);
      body = Buffer.from(await new Promise((resolve, reject) => require('lzma/src/lzma-d.js').LZMA.decompress(lzma, (value, error) => error ? reject(error) : resolve(value))));
    }
    return bodyInfo(body);
  } catch { return { background: DEFAULT_BACKGROUND }; }
}
module.exports = { swfInfo, DEFAULT_BACKGROUND };
