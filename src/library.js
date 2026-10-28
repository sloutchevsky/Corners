'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const imageName = value => /^[a-f\d-]{36}\.png$/i.test(value || '');
const validColor = value => /^oklch\(68% 0\.16 (?:[0-9]|[1-9][0-9]|[12][0-9]{2}|3[0-5][0-9])\)$/.test(value || '');
const placeholderColor = () => `oklch(68% 0.16 ${crypto.randomInt(360)})`;
const defaultHeading = { title: 'Vas Sloutchevsky', subtitle: 'Flash design portfolio' };
function collectionHeading(value) {
  return { title: typeof value?.title === 'string' ? value.title.trim().slice(0, 300) : defaultHeading.title, subtitle: typeof value?.subtitle === 'string' ? value.subtitle.trim().slice(0, 600) : defaultHeading.subtitle };
}
function pageTitle(html) {
  const match = String(html).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (!match) return '';
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', middot: '·', copy: '©' };
  return match[1].replace(/&#(x[\da-f]+|\d+);|&([a-z]+);/gi, (all, number, name) => {
    if (name) return entities[name.toLowerCase()] ?? all;
    const point = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  }).replace(/[\s\u0000-\u001f]+/g, ' ').trim().slice(0, 300);
}
function normalizedEntries(entries) {
  const ids = new Set();
  return entries.filter(entry => entry && typeof entry.id === 'string').map(entry => {
    const id = /^[a-f\d-]{36}$/i.test(entry.id) && !ids.has(entry.id) ? entry.id : crypto.randomUUID(); ids.add(id);
    return { ...entry, id, color: validColor(entry.color) ? entry.color : placeholderColor() };
  });
}
class LibraryFolder {
  constructor(profile, seedDirectory = path.join(__dirname, 'portfolio')) {
    this.directory = path.join(profile, 'Flash Library');
    this.images = path.join(this.directory, 'images');
    this.file = path.join(this.directory, 'manifest.json');
    this.legacyImages = path.join(profile, 'library-images');
    this.seedDirectory = seedDirectory;
    this.snapshot = '';
    this.heading = { ...defaultHeading };
  }
  load(previous = []) {
    fs.mkdirSync(this.images, { recursive: true });
    let entries = previous, seeded = false;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.items)) throw new Error('Invalid Flash library manifest.');
      entries = saved.items;
      this.heading = collectionHeading(saved.heading);
    } catch (error) {
      if (fs.existsSync(this.file)) {
        // Preserve a hand-edited/damaged manifest before recovering from browser.json.
        fs.copyFileSync(this.file, this.file + '.recovered-' + Date.now());
      }
      try {
        const seed = JSON.parse(fs.readFileSync(path.join(this.seedDirectory, 'manifest.json'), 'utf8'));
        if (seed.version === 1 && Array.isArray(seed.items)) {
          const sources = new Set(entries.map(item => item.url || item.path));
          entries = [...entries, ...seed.items.filter(item => item && !sources.has(item.url || item.path))];
          seeded = true;
          this.heading = collectionHeading(seed.heading);
        }
      } catch { /* A portfolio is optional. */ }
    }
    entries = normalizedEntries(entries);
    for (const entry of entries) if (imageName(entry.image)) {
      const destination = path.join(this.images, entry.image);
      if (!fs.existsSync(destination)) {
        const candidates = [path.join(this.legacyImages, entry.image)];
        if (seeded) candidates.push(path.join(this.seedDirectory, 'images', entry.image));
        const source = candidates.find(file => fs.existsSync(file));
        if (source) fs.copyFileSync(source, destination);
      }
    }
    this.save(entries);
    return entries;
  }
  save(entries) {
    const serialized = JSON.stringify({ version: 1, heading: this.heading, items: entries }, null, 2) + '\n';
    if (serialized === this.snapshot) return;
    fs.mkdirSync(this.images, { recursive: true });
    fs.writeFileSync(this.file + '.tmp', serialized, 'utf8');
    fs.renameSync(this.file + '.tmp', this.file);
    this.snapshot = serialized;
  }
}
module.exports = { LibraryFolder, placeholderColor, pageTitle, validColor };
