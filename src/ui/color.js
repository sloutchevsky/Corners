'use strict';
const wheel = document.getElementById('color-wheel'), ctx = wheel.getContext('2d');
const brightness = document.getElementById('brightness'), hex = document.getElementById('color-hex');
let hue = 0, saturation = 0, value = 1, applied, painting = false;
let picking = false, pickAbort;
function rgb(h, s, v) {
  const channel = n => { const k = (n + h / 60) % 6; return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)))); };
  return [channel(5), channel(3), channel(1)];
}
function color() { return '#' + rgb(hue, saturation, value).map(n => n.toString(16).padStart(2, '0')).join(''); }
function setColor(color) {
  const [r, g, b] = color.slice(1).match(/../g).map(n => parseInt(n, 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  hue = !d ? hue : ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
  saturation = max ? d / max : 0; value = max;
  brightness.value = Math.round(value * 100); draw();
}
function draw() {
  const image = ctx.createImageData(240, 240), radius = 116;
  for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) {
    const dx = x - 120, dy = y - 120, distance = Math.hypot(dx, dy), i = (y * 240 + x) * 4;
    if (distance > radius) continue;
    const channels = rgb((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, distance / radius, value);
    image.data[i] = channels[0]; image.data[i + 1] = channels[1]; image.data[i + 2] = channels[2]; image.data[i + 3] = Math.min(255, (radius - distance) * 255);
  }
  ctx.putImageData(image, 0, 0);
  const angle = hue * Math.PI / 180, x = 120 + Math.cos(angle) * saturation * radius, y = 120 + Math.sin(angle) * saturation * radius;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#222'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
  const selected = color(); hex.value = selected; document.getElementById('color-preview').style.backgroundColor = selected;
}
async function apply() {
  const selected = color();
  if (selected === applied) return;
  const result = await window.browser.call('flash-background', { color: selected });
  if (result.ok) { applied = selected; document.getElementById('color-status').textContent = 'Changing color reloads Flash.'; }
  else document.getElementById('color-status').textContent = result.error;
}
function pick(event) {
  const rect = wheel.getBoundingClientRect(), dx = (event.clientX - rect.x) / rect.width * 240 - 120, dy = (event.clientY - rect.y) / rect.height * 240 - 120;
  hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; saturation = Math.min(1, Math.hypot(dx, dy) / 116); draw();
}
wheel.addEventListener('pointerdown', event => { painting = true; wheel.setPointerCapture(event.pointerId); pick(event); });
wheel.addEventListener('pointermove', event => { if (painting) pick(event); });
wheel.addEventListener('pointerup', event => { if (!painting) return; painting = false; pick(event); apply(); });
wheel.addEventListener('pointercancel', () => { painting = false; });
wheel.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  if (event.key.startsWith('ArrowL') || event.key.startsWith('ArrowR')) hue = (hue + (event.key === 'ArrowLeft' ? -5 : 5) + 360) % 360;
  else saturation = Math.max(0, Math.min(1, saturation + (event.key === 'ArrowUp' ? .05 : -.05)));
  draw(); apply();
});
brightness.addEventListener('input', () => { value = Number(brightness.value) / 100; draw(); });
brightness.addEventListener('change', apply);
hex.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { setColor(hex.value); apply(); } else { document.getElementById('color-status').textContent = 'Use a six-digit hex color, such as #ffffff.'; } });
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => { setColor(button.dataset.color); apply(); }));
document.getElementById('color-pick').addEventListener('click', async () => {
  if (picking) return;
  const button = document.getElementById('color-pick'), status = document.getElementById('color-status');
  if (typeof EyeDropper !== 'function') { status.textContent = 'Screen color picking is unavailable on this system.'; return; }
  picking = true; button.disabled = true;
  try {
    const result = await window.browser.call('color-picking', { value: true });
    if (!result.ok) throw new Error(result.error);
    // Let the host paint the Flash snapshot before Chromium starts screen picking.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    status.textContent = 'Click a color on your screen. Esc cancels.';
    pickAbort = new AbortController();
    const selected = await new EyeDropper().open({ signal: pickAbort.signal });
    setColor(selected.sRGBHex); await apply();
  } catch (error) {
    status.textContent = error.name === 'AbortError' ? 'Color picking canceled.' : error.message;
  } finally {
    pickAbort = null; picking = false; button.disabled = false;
    await window.browser.call('color-picking', { value: false });
  }
});
document.getElementById('close').addEventListener('click', () => window.browser.call('color-close'));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !picking) window.browser.call('color-close'); });
function render(state) {
  document.body.dataset.theme = state.settings.theme || 'current';
  if (!painting && state.flashBackground !== applied) { applied = state.flashBackground; setColor(applied); }
}
window.browser.onState(render);
window.browser.call('state').then(result => { if (result.ok) render(result.state); });
