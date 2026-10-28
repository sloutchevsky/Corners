'use strict';
class FlashbornTabPreviews {
  constructor() {
    this.frames = new Map(); this.state = null; this.hover = null;
    this.container = document.getElementById('tabs');
    window.browser.onTabSnapshot(frame => {
      const tab = this.state?.tabs.find(tab => tab.id === frame.id);
      if (!tab || tab.private || tab.kind === 'home') return;
      this.frames.set(frame.id, frame); this.updateThumbnail();
    });
    this.container.addEventListener('pointerover', event => this.enter(event));
    this.container.addEventListener('pointerout', event => { if (this.hover && !this.hover.row.contains(event.relatedTarget)) this.close(); });
    this.container.addEventListener('pointerleave', () => this.close());
    this.container.addEventListener('scroll', () => { this.close(); this.selection(); });
    window.addEventListener('blur', () => this.close());
    new ResizeObserver(() => this.selection()).observe(this.container);
  }
  page(tab = {}) { return JSON.stringify([tab.url, tab.kind, !!tab.native]); }
  render(state) {
    this.state = state;
    for (const [id, frame] of this.frames) {
      const tab = state.tabs.find(tab => tab.id === id);
      if (!tab || tab.private || tab.kind === 'home' || frame.page !== this.page(tab)) this.frames.delete(id);
    }
    if (this.hover && (!this.hover.row.isConnected || state.menuOpen || state.fullscreen)) this.close();
    this.updateThumbnail(); this.selection();
  }
  updateThumbnail() {
    if (!this.state) return;
    for (const row of this.container.children) {
      const tab = this.state.tabs.find(t => t.id === row.dataset.reorderId), frame = tab && this.frames.get(tab.id);
      const art = row.querySelector('.tab-thumbnail'), image = art?.querySelector('img');
      if (!image) continue;
      const valid = !!tab && !tab.private && tab.kind !== 'home' && frame?.page === this.page(tab);
      art.classList.toggle('has-snapshot', !!valid); image.hidden = !valid;
      if (valid) { if (image.src !== frame.data) image.src = frame.data; image.dataset.capturedAt = frame.capturedAt; }
      else { image.removeAttribute('src'); delete image.dataset.capturedAt; }
    }
  }
  selection() {
    const row = this.container.querySelector('.tab.active');
    const top = row ? row.getBoundingClientRect().top - this.container.getBoundingClientRect().top + this.container.scrollTop : 0;
    this.container.style.setProperty('--selected-tab-y', top + 'px');
    this.container.style.setProperty('--selected-tab-height', (row?.getBoundingClientRect().height || 0) + 'px');
    this.container.style.setProperty('--selected-tab-width', row?.classList.contains('placeholder-tab') ? 'min(100%,var(--tab-thumb-width))' : '100%');
  }
  enter(event) {
    const row = event.target.closest('.tab');
    if (!row || row.contains(event.relatedTarget) || document.body.dataset.reordering || this.state?.menuOpen || this.hover?.row === row) return;
    this.close();
    this.hover = { row, id: row.dataset.reorderId };
    row.classList.add('previewing');
    const tab = this.state?.tabs.find(tab => tab.id === this.hover.id);
    if (tab && !tab.private && tab.kind !== 'home') window.browser.call('tab-snapshot', { id: this.hover.id }).catch(() => {});
  }
  close() {
    const hover = this.hover; this.hover = null;
    hover?.row.classList.remove('previewing');
  }
}
