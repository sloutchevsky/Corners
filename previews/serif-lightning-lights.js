'use strict';

// Directional studio lights stay fixed in world space. Only the model rotates.
(() => {
  const unit = vector => {
    const length = Math.hypot(...vector);
    return vector.map(component => component / length);
  };
  window.SerifLightningLights = Object.freeze([
    { name: 'key', direction: unit([-0.55, 0.8, 1]), intensity: 0.85, gloss: 32 },
    { name: 'fill', direction: unit([0.8, 0.25, 1]), intensity: 0.45, gloss: 20 },
    { name: 'rim', direction: unit([0.1, 0.55, -1]), intensity: 0.7, gloss: 36 },
  ].map(light => Object.freeze({
    ...light,
    direction: Object.freeze(light.direction),
    halfVector: Object.freeze(unit([light.direction[0], light.direction[1], light.direction[2] + 1])),
  })));
})();
