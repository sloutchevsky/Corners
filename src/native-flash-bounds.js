'use strict';

// Keep an inactive HWND beyond every display, even if an already queued legacy
// resize completes after parking. Its current physical size is left untouched.
function parkedBounds(displays, actual, pendingSize = [0, 0]) {
  const scale = Math.max(1, ...displays.map(display => display.scaleFactor));
  const width = Math.max(1, actual[2]), height = Math.max(1, actual[3]);
  const extentX = Math.max(width, Math.ceil(pendingSize[0] * scale));
  const extentY = Math.max(height, Math.ceil(pendingSize[1] * scale));
  return [Math.min(...displays.map(display => display.bounds.x)) - extentX - 100,
    Math.min(...displays.map(display => display.bounds.y)) - extentY - 100, width, height];
}
module.exports = { parkedBounds };
