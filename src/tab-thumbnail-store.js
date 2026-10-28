'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const validThumbnailId = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const thumbnailPage = entry => JSON.stringify([entry.url, entry.kind, !!entry.native]);
function pageURL(frame) {
  try {
    const [url, kind] = JSON.parse(frame.page), parsed = new URL(url);
    return kind !== 'home' && url.length <= 8192 && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : null;
  } catch { return null; }
}
function validFrame(frame) {
  return frame && typeof frame.page === 'string' && frame.page.length < 32768 &&
    Number.isInteger(frame.width) && frame.width > 0 && frame.width <= 512 &&
    Number.isInteger(frame.height) && frame.height > 0 && frame.height <= 320 &&
    Number.isFinite(frame.capturedAt) && frame.capturedAt > 0 &&
    typeof frame.data === 'string' && frame.data.length <= 700000 &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(frame.data);
}

// A bounded cache, separate from browser.json. Writes are coalesced and run
// asynchronously so saving movie frames cannot interrupt playback or dragging.
class TabThumbnailStore {
  constructor(directory, { maxBytes = 8 * 1024 * 1024, delay = 5000 } = {}) {
    this.file = path.join(directory, 'tab-thumbnails.json');
    this.maxBytes = maxBytes; this.delay = delay; this.frames = new Map(); this.pages = new Map();
    this.allowed = new Map(); this.allowedPages = new Set(); this.revision = 0; this.written = 0; this.pending = null;
    try {
      if (fs.statSync(this.file).size > maxBytes) return;
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.frames)) return;
      for (const [id, frame] of saved.frames.slice(0, 100)) if (validThumbnailId(id) && validFrame(frame)) this.frames.set(id, frame);
      if (Array.isArray(saved.pages)) for (const [url, frame] of saved.pages.slice(0, 1000)) if (validFrame(frame) && pageURL(frame) === url) this.pages.set(url, frame);
    } catch { /* A missing or damaged cache never prevents startup. */ }
  }
  retain(entries, urls = []) {
    this.allowedPages = new Set(urls.filter(url => typeof url === 'string').slice(0, 1000));
    let migrated = false;
    // Migrate earlier saved tab pictures into the visited-page cache before
    // pruning closed tabs. No page is loaded to fill a missing picture.
    for (const frame of this.frames.values()) {
      const url = pageURL(frame);
      if (url && this.allowedPages.has(url) && (!this.pages.has(url) || this.pages.get(url).capturedAt < frame.capturedAt)) {
        this.pages.set(url, frame); this.changed(); migrated = true;
      }
    }
    this.allowed = new Map(entries.filter(entry => !entry.private && entry.kind !== 'home' && validThumbnailId(entry.thumbnailId)).slice(0, 100).map(entry => [entry.thumbnailId, thumbnailPage(entry)]));
    for (const [id, frame] of this.frames) if (this.allowed.get(id) !== frame.page) { this.frames.delete(id); this.changed(); }
    for (const url of this.pages.keys()) if (!this.allowedPages.has(url)) { this.pages.delete(url); this.changed(); }
    if (migrated) this.trim();
  }
  get(entry) {
    if (!entry || entry.private || entry.kind === 'home' || !validThumbnailId(entry.thumbnailId)) return null;
    const frame = this.frames.get(entry.thumbnailId);
    return frame?.page === thumbnailPage(entry) ? frame : null;
  }
  put(entry, frame) {
    if (!entry || entry.private || entry.kind === 'home' || frame?.page !== thumbnailPage(entry) || !validFrame(frame)) return;
    // Do not serialize transient tab IDs or anything from a private session.
    const { data, page, width, height, capturedAt } = frame;
    const saved = { data, page, width, height, capturedAt }, url = pageURL(frame);
    let changed = false;
    if (this.allowed.get(entry.thumbnailId) === page && this.frames.get(entry.thumbnailId)?.data !== data) {
      this.frames.delete(entry.thumbnailId); this.frames.set(entry.thumbnailId, saved); changed = true;
    }
    if (url && this.allowedPages.has(url) && this.pages.get(url)?.data !== data) {
      this.pages.delete(url); this.pages.set(url, saved); changed = true;
    }
    if (changed) { this.trim(); this.changed(); }
  }
  getPage(url) { return this.allowedPages.has(url) ? this.pages.get(url) || null : null; }
  trim() {
    let bytes = 96;
    const entries = [...[...this.frames].reverse().map(([id, frame]) => ({ map: this.frames, id, frame })), ...[...this.pages].reverse().map(([id, frame]) => ({ map: this.pages, id, frame }))].sort((a, b) => b.frame.capturedAt - a.frame.capturedAt);
    for (const { map, id, frame } of entries) {
      const length = Buffer.byteLength(JSON.stringify([id, frame]), 'utf8') + 1;
      if (bytes + length > this.maxBytes) { map.delete(id); this.changed(); }
      else bytes += length;
    }
  }
  changed() {
    this.revision++;
    if (!this.timer && !this.closed) { this.timer = setTimeout(() => { this.timer = null; this.flush().catch(() => {}); }, this.delay); this.timer.unref(); }
  }
  async flush() {
    if (this.pending) { await this.pending; return this.flush(); }
    if (this.written === this.revision) return;
    const revision = this.revision, json = JSON.stringify({ version: 1, frames: [...this.frames], pages: [...this.pages] });
    this.pending = (async () => {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      await fsp.writeFile(this.file + '.tmp', json, 'utf8');
      await fsp.rename(this.file + '.tmp', this.file);
      this.written = revision;
    })();
    try { await this.pending; } finally { this.pending = null; }
    if (this.written !== this.revision) await this.flush();
  }
  async close() {
    this.closed = true; clearTimeout(this.timer); this.timer = null;
    await this.flush();
  }
}
module.exports = { TabThumbnailStore, validThumbnailId };
