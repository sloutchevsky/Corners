'use strict';
const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
function nextZoom(percent, direction) {
  if (!direction) return 100;
  if (direction > 0) return ZOOM_STEPS.find(step => step > percent + 0.5) || 500;
  return ZOOM_STEPS.filter(step => step < percent - 0.5).pop() || 25;
}
module.exports = { ZOOM_STEPS, nextZoom };
