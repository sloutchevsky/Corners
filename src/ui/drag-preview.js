'use strict';
class FlashbornDragPreview {
  constructor(source, x, y) {
    const rect = source.getBoundingClientRect();
    this.offsetX = x - rect.left; this.offsetY = y - rect.top;
    this.element = source.cloneNode(true);
    const originals = [source, ...source.querySelectorAll('*')];
    const copies = [this.element, ...this.element.querySelectorAll('*')];
    originals.forEach((original, index) => {
      const copy = copies[index], style = getComputedStyle(original);
      for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property));
      copy.removeAttribute('id'); copy.removeAttribute('data-reorder-id'); copy.removeAttribute('data-collection');
      copy.removeAttribute('tabindex'); copy.style.pointerEvents = 'none';
      copy.style.animation = 'none'; copy.style.transition = 'none';
      if ('disabled' in copy) copy.disabled = true;
      if (original instanceof HTMLCanvasElement) { copy.width = original.width; copy.height = original.height; copy.getContext('2d').drawImage(original, 0, 0); }
    });
    Object.assign(this.element.style, { position: 'fixed', top: '0', left: '0', right: 'auto', bottom: 'auto', width: rect.width + 'px', height: rect.height + 'px', margin: '0', opacity: '.5', zIndex: '1000', pointerEvents: 'none', transformOrigin: 'top left', boxSizing: 'border-box' });
    this.element.setAttribute('aria-hidden', 'true'); this.element.setAttribute('data-drag-preview', '');
    document.body.appendChild(this.element); this.move(x, y);
  }
  move(x, y) { this.element.style.transform = `translate3d(${x - this.offsetX}px,${y - this.offsetY}px,0)`; }
  remove() { this.element.remove(); }
}
