'use strict';

// Small live previews. A stalled capture remains coalesced, so hovering
// cannot enqueue more work in an unresponsive renderer or legacy Flash host.
class TabSnapshots {
  constructor(capture, identity, { maxAge = 650, timeout = 900, retryDelay = 4000, page = identity, onFrame = () => {} } = {}) {
    this.capture = capture; this.identity = identity; this.maxAge = maxAge;
    this.timeout = timeout; this.retryDelay = retryDelay; this.page = page; this.onFrame = onFrame; this.entries = new Map();
  }
  entry(tab) {
    const identity = this.identity(tab), page = this.page(tab);
    let entry = this.entries.get(tab.id);
    if (!entry || entry.identity !== identity) {
      // Recreating a renderer must not erase the last picture of the same page.
      // The old request still belongs to its old entry and cannot overwrite it.
      entry = { identity, page, frame: entry?.page === page ? entry.frame : null, pending: null, failedAt: 0 };
      this.entries.set(tab.id, entry);
    }
    return entry;
  }
  get(tab) {
    if (tab.private || tab.kind === 'home') { this.forget(tab.id); return null; }
    return this.entry(tab).frame;
  }
  seed(tab, frame) {
    if (tab.private || tab.kind === 'home' || frame?.page !== this.page(tab)) return;
    this.entry(tab).frame = { ...frame, id: tab.id };
  }
  async request(tab) {
    if (tab.private || tab.kind === 'home') { this.forget(tab.id); return null; }
    const entry = this.entry(tab), now = Date.now();
    if (entry.frame && now - entry.frame.capturedAt < this.maxAge || entry.failedAt && now - entry.failedAt < this.retryDelay) return entry.frame;
    if (!entry.pending) {
      let capture;
      try { capture = this.capture(tab); } catch (error) { capture = Promise.reject(error); }
      entry.pending = Promise.resolve(capture).then(frame => {
        if (tab.private || tab.kind === 'home' || this.entries.get(tab.id) !== entry || this.identity(tab) !== entry.identity) return null;
        if (frame && /^data:image\/jpeg;base64,/.test(frame.data) && frame.data.length <= 700000) {
          entry.frame = { ...frame, id: tab.id, capturedAt: Date.now() }; entry.failedAt = 0;
          this.onFrame(tab, entry.frame);
        }
        return entry.frame;
      }).catch(() => { entry.failedAt = Date.now(); return entry.frame; }).finally(() => { entry.pending = null; });
    }
    let timer;
    try { return await Promise.race([entry.pending, new Promise(resolve => { timer = setTimeout(() => resolve(entry.frame), this.timeout); })]); }
    finally { clearTimeout(timer); }
  }
  forget(id) { this.entries.delete(id); }
  clear() { this.entries.clear(); }
}
module.exports = { TabSnapshots };
