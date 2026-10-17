'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const yauzl = require('yauzl');
function protobuf(buffer) {
  const fields = new Map(); let offset = 0;
  const int = () => { let n = 0, shift = 0; for (;;) { if (offset >= buffer.length || shift > 28) throw new Error('Invalid CRX header.'); const byte = buffer[offset++]; n += (byte & 127) * 2 ** shift; if (!(byte & 128)) return n; shift += 7; } };
  while (offset < buffer.length) {
    const tag = int(), number = tag >>> 3, type = tag & 7; let value;
    if (type === 2) { const length = int(); if (offset + length > buffer.length) throw new Error('Invalid CRX field.'); value = buffer.subarray(offset, offset + length); offset += length; }
    else if (type === 0) value = int();
    else throw new Error('Unsupported CRX field.');
    const values = fields.get(number) || []; values.push(value); fields.set(number, values);
  }
  return fields;
}
function verifyCRX(buffer, expectedId) {
  if (buffer.toString('ascii', 0, 4) !== 'Cr24' || buffer.readUInt32LE(4) !== 3) throw new Error('Expected a CRX3 extension package.');
  const end = 12 + buffer.readUInt32LE(8);
  if (end > buffer.length || end > 1024 * 1024) throw new Error('Invalid CRX3 header size.');
  const fields = protobuf(buffer.subarray(12, end)), header = fields.get(10000)?.[0];
  if (!header) throw new Error('Missing CRX signature header.');
  const id = protobuf(header).get(1)?.[0];
  const asId = bytes => [...bytes.toString('hex')].map(n => String.fromCharCode(97 + parseInt(n, 16))).join('');
  if (!id || asId(id) !== expectedId) throw new Error('The extension package is not the expected AdBlock publisher.');
  const length = Buffer.alloc(4); length.writeUInt32LE(header.length);
  const signed = Buffer.concat([Buffer.from('CRX3 SignedData\0'), length, header, buffer.subarray(end)]);
  for (const proof of [...(fields.get(2) || []), ...(fields.get(3) || [])]) {
    const data = protobuf(proof), key = data.get(1)?.[0], signature = data.get(2)?.[0];
    if (!key || !signature || !crypto.createHash('sha256').update(key).digest().subarray(0, 16).equals(id)) continue;
    if (crypto.verify('sha256', signed, crypto.createPublicKey({ key, format: 'der', type: 'spki' }), signature)) return { zip: buffer.subarray(end), key: key.toString('base64') };
  }
  throw new Error('The AdBlock publisher signature did not verify.');
}
async function extractCRX(buffer, directory, expectedId) {
  const { zip: bytes, key } = verifyCRX(buffer, expectedId), root = path.resolve(directory);
  await fs.mkdir(root, { recursive: true });
  await new Promise((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
    if (error) { reject(error); return; }
    let files = 0, total = 0, failed = false;
    const fail = error => { if (!failed) { failed = true; zip.close(); reject(error); } };
    zip.on('error', fail); zip.on('end', () => { if (!failed) resolve(); });
    zip.on('entry', entry => { (async () => {
      const target = path.resolve(root, entry.fileName);
      if (!target.startsWith(root + path.sep) || entry.fileName.includes('\\') || (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000) throw new Error('Unsafe extension archive path.');
      files++; total += entry.uncompressedSize;
      if (files > 15000 || total > 512 * 1024 * 1024) throw new Error('Extension package exceeds its limits.');
      if (entry.fileName.endsWith('/')) await fs.mkdir(target, { recursive: true });
      else {
        await fs.mkdir(path.dirname(target), { recursive: true });
        const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)));
        await pipeline(stream, createWriteStream(target));
      }
      if (!failed) zip.readEntry();
    })().catch(fail); });
    zip.readEntry();
  }));
  // Unpacked Chromium extensions need the publisher key to retain their official
  // extension ID. This is the only adaptation to the upstream package files.
  const manifestPath = path.join(root, 'manifest.json'), manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.key = key; await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}
module.exports = { verifyCRX, extractCRX };
