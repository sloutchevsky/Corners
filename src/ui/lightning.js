'use strict';
(() => {
  const TAU = Math.PI * 2;
  const OUTLINE = [[9, 50], [-32, -5], [-3, -5], [-11, -50], [33, 11], [5, 11]];
  const normalize = vector => { const length = Math.hypot(...vector) || 1; return vector.map(x => x / length); };
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const subtract = (a, b) => a.map((x, i) => x - b[i]);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const pointAt = (point, z) => [point[0], point[1], z];
  const rotate = (point, angle) => [point[0]*Math.cos(angle)+point[2]*Math.sin(angle), point[1], -point[0]*Math.sin(angle)+point[2]*Math.cos(angle)];
  const light = normalize([-0.45, 0.65, 1]);
  const halfVector = normalize([light[0], light[1], light[2] + 1]);
  // Keep the same darker gold on light and dark backgrounds, including exported app icons.
  const metalColor = (rgb, brightness) => `rgb(${rgb.map(c => Math.round(Math.min(255, c * brightness) * 0.84)).join(',')})`;
  function insetPolygon(points, distance) {
    return points.map((point, i) => {
      const previous = points[(i + points.length - 1) % points.length];
      const next = points[(i + 1) % points.length];
      const a = normalize(subtract(point, previous)), b = normalize(subtract(next, point));
      const n1 = [-a[1], a[0]], n2 = [-b[1], b[0]];
      const bisector = normalize([n1[0] + n2[0], n1[1] + n2[1]]);
      const length = distance / Math.max(0.15, dot(bisector, n1));
      return [point[0] + bisector[0] * length, point[1] + bisector[1] * length];
    });
  }
  function buildMesh(depth) {
    const half = depth / 2, bevel = 1.8, shoulder = half - bevel;
    const inner = insetPolygon(OUTLINE, bevel);
    const mesh = [inner.map(p => pointAt(p, half)), inner.map(p => pointAt(p, -half)).reverse()];
    OUTLINE.forEach((p, i) => {
      const j = (i + 1) % OUTLINE.length, next = OUTLINE[j];
      mesh.push([pointAt(p, shoulder), pointAt(next, shoulder), pointAt(inner[j], half), pointAt(inner[i], half)]);
      mesh.push([pointAt(p, -shoulder), pointAt(next, -shoulder), pointAt(next, shoulder), pointAt(p, shoulder)]);
      mesh.push([pointAt(next, -shoulder), pointAt(p, -shoulder), pointAt(inner[i], -half), pointAt(inner[j], -half)]);
    });
    return mesh;
  }
  class GoldLightning {
    constructor(canvas, { continuous = false, thickness = 14, period = 2000, metal = 'gold' } = {}) {
      this.canvas = canvas;
      this.metal = metal;
      this.mesh = buildMesh(thickness);
      this.period = period;
      this.continuous = continuous;
      this.loading = continuous;
      this.angle = 0;
      this.frameId = 0;
      this.lastTime = 0;
      this.target = null;
      this.key = null;
      this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
      this.animate = this.animate.bind(this);
      this.visibility = () => {
        if (document.hidden) { cancelAnimationFrame(this.frameId); this.frameId = 0; this.lastTime = 0; }
        else this.schedule();
      };
      this.motionChanged = () => { this.draw(this.reducedMotion.matches ? 0 : this.angle); this.schedule(); };
      this.reducedMotion.addEventListener('change', this.motionChanged);
      document.addEventListener('visibilitychange', this.visibility);
      this.draw(0);
      this.schedule();
    }
    setMetal(metal) {
      if (this.metal === metal) return;
      this.metal = metal === 'silver' ? 'silver' : 'gold';
      this.draw(this.reducedMotion.matches ? 0 : this.angle);
    }
    setLoading(loading, key) {
      if (key !== this.key) {
        this.key = key; this.angle = 0; this.loading = false; this.target = null; this.lastTime = 0;
      }
      if (loading && !this.loading) { this.angle = 0; this.target = null; }
      else if (!loading && this.loading) {
        // Keep the same speed and finish the current full turn, including very short loads.
        this.target = Math.max(TAU, Math.ceil((this.angle - 0.000001) / TAU) * TAU);
      }
      this.loading = loading;
      this.draw(this.reducedMotion.matches ? 0 : this.angle);
      this.schedule();
    }
    schedule() {
      if (!this.frameId && !document.hidden && !this.reducedMotion.matches && (this.loading || this.target !== null)) {
        this.frameId = requestAnimationFrame(this.animate);
      }
    }
    animate(now) {
      this.frameId = 0;
      if (!this.canvas.isConnected) { this.dispose(); return; }
      const elapsed = this.lastTime ? Math.max(0, now - this.lastTime) : 0;
      this.lastTime = now;
      this.angle += elapsed * TAU / this.period;
      if (!this.loading && this.target !== null && this.angle >= this.target) { this.angle = 0; this.target = null; this.lastTime = 0; }
      this.draw(this.angle);
      this.schedule();
    }
    draw(angle) {
      const canvas = this.canvas, ctx = canvas.getContext('2d');
      const size = canvas.width, scale = size * 0.00665;
      const faces = this.mesh.map(points => {
        points = points.map(point => rotate(point, angle));
        const normal = normalize(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
        return { points, normal, z: points.reduce((sum, point) => sum + point[2], 0) / points.length };
      }).filter(face => face.normal[2] > 0.001).sort((a, b) => a.z - b.z);
      ctx.clearRect(0, 0, size, size);
      const projectedX = faces.flatMap(face => face.points.map(point => point[0] * 400 / (400 - point[2])));
      const centerX = (Math.min(...projectedX) + Math.max(...projectedX)) / 2;
      ctx.save(); ctx.translate(size / 2 - centerX * scale, size / 2); ctx.scale(scale, -scale);
      faces.forEach(face => {
        const points = face.points.map(point => { const perspective = 400 / (400 - point[2]); return [point[0] * perspective, point[1] * perspective]; });
        const illumination = Math.max(0, dot(face.normal, light));
        const specular = Math.pow(Math.max(0, dot(face.normal, halfVector)), 22);
        const brightness = 0.63 + 0.36 * illumination + 0.22 * specular;
        const reflection = 0.48 + 0.25 * Math.sin(angle * 2 + face.normal[0] * 1.5);
        const gradient = ctx.createLinearGradient(-53, 60, 53, -60);
        const palette = this.metal === 'silver' ? [[85,91,104], [173,182,194], [248,250,255], [191,201,214], [105,112,126]] : [[171,94,9], [241,175,37], [255,237,168], [241,185,49], [174,102,12]];
        gradient.addColorStop(0, metalColor(palette[0], brightness));
        gradient.addColorStop(reflection - 0.19, metalColor(palette[1], brightness));
        gradient.addColorStop(reflection, metalColor(palette[2], brightness + 0.08));
        gradient.addColorStop(reflection + 0.085, metalColor(palette[3], brightness));
        gradient.addColorStop(1, metalColor(palette[4], brightness));
        ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(...point) : ctx.moveTo(...point)); ctx.closePath();
        ctx.fillStyle = gradient; ctx.fill(); ctx.lineWidth = 0.38; ctx.strokeStyle = gradient; ctx.stroke();
      });
      ctx.restore();
      canvas.dataset.angle = angle.toFixed(4);
      canvas.dataset.metal = this.metal;
      canvas.dataset.motion = this.reducedMotion.matches ? 'reduced' : this.loading ? 'spinning' : this.target !== null ? 'finishing' : 'idle';
    }
    dispose() {
      cancelAnimationFrame(this.frameId); this.frameId = 0;
      this.reducedMotion.removeEventListener('change', this.motionChanged);
      document.removeEventListener('visibilitychange', this.visibility);
    }
  }
  window.GoldLightning = GoldLightning;
})();
