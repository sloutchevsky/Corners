'use strict';
const canvas = document.getElementById('screen'), ctx = canvas.getContext('2d', { willReadFrequently: true });
const lens = document.getElementById('lens'), pixels = document.getElementById('pixels'), magnifier = pixels.getContext('2d');
let selected = false, loaded = false;
function preview(x, y) {
  if (!loaded) return;
  const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(x * canvas.width / innerWidth)));
  const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(y * canvas.height / innerHeight)));
  const channels = ctx.getImageData(px, py, 1, 1).data;
  document.getElementById('hex').textContent = '#' + [...channels].slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('');
  magnifier.imageSmoothingEnabled = false;
  magnifier.clearRect(0, 0, 121, 121);
  magnifier.drawImage(canvas, px - 5, py - 5, 11, 11, 0, 0, 121, 121);
  magnifier.strokeStyle = '#fff'; magnifier.lineWidth = 3; magnifier.strokeRect(55, 55, 11, 11);
  magnifier.strokeStyle = '#222'; magnifier.lineWidth = 1; magnifier.strokeRect(55, 55, 11, 11);
  lens.style.left = Math.max(0, Math.min(innerWidth - 177, x + 24)) + 'px';
  lens.style.top = Math.max(0, Math.min(innerHeight - 182, y + 24)) + 'px';
}
window.screenColorReady = (async () => {
  const capture = await window.screenColor.image(), image = new Image();
  image.src = capture.image; await image.decode();
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  ctx.drawImage(image, 0, 0); loaded = true;
  preview(20, 20);
})();
document.addEventListener('pointermove', event => preview(event.clientX, event.clientY));
document.addEventListener('pointerdown', event => {
  if (!loaded || selected || event.button !== 0) return;
  selected = true; window.screenColor.select(event.clientX, event.clientY).catch(() => {});
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') window.screenColor.cancel().catch(() => {});
});
document.addEventListener('contextmenu', event => event.preventDefault());
