'use strict';

// Draft: a tiny sharp beak and a gently inward-curved upper-left slope.
(() => {
  const points = [[-11, -50], [33, 11], [5, 11], [10, 41]];
  function curve(controlA, controlB, end, steps = 12) {
    const start = points[points.length - 1];
    for (let step = 1; step <= steps; step++) {
      const t = step / steps, u = 1 - t;
      points.push([0, 1].map(axis => u ** 3 * start[axis] + 3 * u ** 2 * t * controlA[axis] + 3 * u * t ** 2 * controlB[axis] + t ** 3 * end[axis]));
    }
  }
  curve([10, 46.5], [10.3, 49], [11.5, 48.7]);
  points.push([14, 48]);
  curve([12.7, 50.7], [10.6, 52.1], [8.7, 50.3]);
  curve([5, 47], [-1, 22], [-32, -5], 20);
  points.push([-3, -5]);
  window.SerifLightningOutline = points;
})();
