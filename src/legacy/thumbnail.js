'use strict';

// Keep scrollbars and other edge chrome out of tab pictures. Crop before
// downsizing so the retained page pixels use the full thumbnail resolution.
function cropThumbnail(image) {
  const size = image.getSize();
  return image.crop({ x: 0, y: 0, width: Math.max(1, Math.floor(size.width * .9)), height: size.height });
}

module.exports = { cropThumbnail };
