'use strict';
(() => {
  const TAU = Math.PI * 2;
  const durations = { library: 2000, bookmarks: 1200, history: 2000, downloads: 1000, settings: 3000 };
  const gear = new Path2D('M9.5 3h5l.6 2.6 2.1 1.2 2.6-.8 2.5 4.3-2 1.8v2.4l2 1.8-2.5 4.3-2.6-.8-2.1 1.2-.6 2.6h-5l-.6-2.6-2.1-1.2-2.6.8L1.8 16l2-1.8v-2.4l-2-1.8L4.3 5.7l2.6.8L9 5.3z');
  const gearHub = new Path2D(); gearHub.arc(12, 12, 3, 0, TAU);
  const clockArrow = new Path2D('M3 4v5h5M3.8 9a8.5 8.5 0 1 1 .5 7');
  const downloadArrow = new Path2D('M12 3v12m-5-5 5 5 5-5');
  const downloadTray = new Path2D('M4 16v5h16v-5');
  const star = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 3.3 : 7.7;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  function rotated(path, angle) {
    const c = Math.cos(angle), s = Math.sin(angle), result = new Path2D();
    result.addPath(path, { a: c, b: s, c: -s, d: c, e: 12 - 12 * c + 12 * s, f: 12 - 12 * s - 12 * c });
    return result;
  }
  function hand(angle, length) {
    const path = new Path2D(); path.moveTo(12, 12); path.lineTo(12 + Math.cos(angle) * length, 12 + Math.sin(angle) * length); return path;
  }
  function arrowTravel(progress) {
    if (progress <= 0 || progress >= 1) return 0;
    if (progress < .4) return 6 * (progress / .4) ** 2;
    if (progress < .8) { const t = (progress - .4) / .4; return 6 - 7 * (1 - (1 - t) ** 3); }
    return -1 + ((progress - .8) / .2) ** 2;
  }
  class GoldNavigation {
    constructor(canvas) {
      this.canvas = canvas; this.kind = canvas.dataset.navIcon;
      this.button = canvas.closest('button'); this.frame = 0; this.start = 0; this.progress = 0;
      this.hovered = false; this.focused = false;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
      this.bolt = this.kind === 'library' ? new GoldLightning(canvas) : null;
      this.tick = this.tick.bind(this);
      this.enter = () => { this.hovered = true; this.play(); };
      this.focus = () => { this.focused = this.button.matches(':focus-visible'); if (this.focused && !this.hovered) this.play(); };
      this.leave = () => { this.hovered = false; this.stopGear(); };
      this.blur = () => { this.focused = false; this.stopGear(); };
      this.motion = () => { if (this.reduced.matches) this.stop(); else if (this.kind === 'settings' && (this.hovered || this.focused)) this.play(); };
      this.visibility = () => { if (document.hidden) this.stop(); else if (this.kind === 'settings' && (this.hovered || this.focused)) this.play(); };
      this.button.addEventListener('pointerenter', this.enter); this.button.addEventListener('pointerleave', this.leave);
      this.button.addEventListener('focus', this.focus); this.button.addEventListener('blur', this.blur);
      this.reduced.addEventListener('change', this.motion); document.addEventListener('visibilitychange', this.visibility);
      this.draw(0);
    }
    play() {
      if (this.reduced.matches || document.hidden || this.frame) return;
      this.start = 0; this.canvas.dataset.motion = 'spinning';
      this.frame = requestAnimationFrame(this.tick);
    }
    stopGear() { if (this.kind === 'settings' && !this.hovered && !this.focused) this.stop(); }
    stop() { cancelAnimationFrame(this.frame); this.frame = 0; this.start = 0; this.draw(0); }
    tick(now) {
      this.frame = 0;
      if (this.reduced.matches) { this.stop(); return; }
      if (!this.canvas.isConnected) { this.dispose(); return; }
      if (!this.start) this.start = now;
      const elapsed = (now - this.start) / durations[this.kind];
      const looping = this.kind === 'settings' && (this.hovered || this.focused);
      this.draw(looping ? elapsed % 1 : Math.min(1, elapsed));
      this.canvas.dataset.motion = looping || elapsed < 1 ? 'spinning' : 'idle';
      if (looping || elapsed < 1) this.frame = requestAnimationFrame(this.tick);
    }
    draw(progress) {
      this.progress = progress;
      const canvas = this.canvas;
      if (this.bolt) this.bolt.draw(progress * TAU);
      else {
        const ctx = canvas.getContext('2d'), scale = canvas.width / 24;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        // This studio gradient is in screen/world coordinates. Paths move through it;
        // the gradient never rotates, translates, or changes with animation time.
        const light = ctx.createLinearGradient(1, 1, 24, 25);
        light.addColorStop(0, '#94621b'); light.addColorStop(.38, '#d6aa4e');
        light.addColorStop(.53, '#f5e1a2'); light.addColorStop(.7, '#c29435'); light.addColorStop(1, '#916020');
        const stroke = path => {
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.strokeStyle = '#79551e'; ctx.lineWidth = 2.25; ctx.stroke(path);
          ctx.strokeStyle = light; ctx.lineWidth = 1.65; ctx.stroke(path);
        };
        if (this.kind === 'bookmarks') {
          const phase = (3 * progress ** 2 - 2 * progress ** 3) * TAU;
          const c = Math.cos(phase), s = Math.sin(phase);
          const face = z => star.map(([x, y]) => { const worldX = x * c + z * s, worldZ = -x * s + z * c, perspective = 48 / (48 - worldZ); return [12 + worldX * perspective, 12 + y * perspective]; });
          const front = face(.65), back = face(-.65);
          const path = points => { const p = new Path2D(); points.forEach((point, i) => i ? p.lineTo(...point) : p.moveTo(...point)); p.closePath(); return p; };
          ctx.globalAlpha = .55; stroke(path(c >= 0 ? back : front));
          const edges = new Path2D(); front.forEach((point, i) => { edges.moveTo(...point); edges.lineTo(...back[i]); }); stroke(edges);
          ctx.globalAlpha = 1; stroke(path(c >= 0 ? front : back));
          canvas.dataset.rotation = (phase * 180 / Math.PI).toFixed(2);
        } else if (this.kind === 'history') {
          stroke(rotated(clockArrow, -progress * TAU));
          stroke(hand(-Math.PI / 2 - progress * TAU * 12, 5));
          stroke(hand(-Math.PI / 2 - progress * TAU, 3.3));
          canvas.dataset.rotation = String(-360 * progress);
          canvas.dataset.minuteRotation = String(-4320 * progress); canvas.dataset.hourRotation = String(-360 * progress);
        } else if (this.kind === 'downloads') {
          const offset = arrowTravel(progress), arrow = new Path2D();
          arrow.addPath(downloadArrow, { e: 0, f: offset }); stroke(downloadTray); stroke(arrow);
          canvas.dataset.arrowOffset = offset.toFixed(3);
        } else if (this.kind === 'settings') { stroke(rotated(gear, progress * TAU)); stroke(gearHub); }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      canvas.dataset.progress = progress.toFixed(4);
      canvas.dataset.lights = 'fixed';
      if (!this.frame) canvas.dataset.motion = this.reduced.matches ? 'reduced' : 'idle';
    }
    dispose() {
      this.stop(); this.bolt?.dispose();
      this.button.removeEventListener('pointerenter', this.enter); this.button.removeEventListener('pointerleave', this.leave);
      this.button.removeEventListener('focus', this.focus); this.button.removeEventListener('blur', this.blur);
      this.reduced.removeEventListener('change', this.motion); document.removeEventListener('visibilitychange', this.visibility);
    }
  }
  window.GoldNavigation = GoldNavigation;
})();
