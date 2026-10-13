const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fragmentPath = 'C:\\Users\\Vas\\.codex\\visualizations\\2026\\10\\08\\01a11d2d-d13a-7c71-9825-93a600496e0f\\gold-f-lightning.html';
const outline = fs.readFileSync(path.join(__dirname, 'serif-lightning-outline.js'), 'utf8');
const lighting = fs.readFileSync(path.join(__dirname, 'serif-lightning-lights.js'), 'utf8');
const original = fs.readFileSync(path.join(root, 'src', 'ui', 'lightning.js'), 'utf8');
const renderer = original
  .replace('const OUTLINE = [[9, 50], [-32, -5], [-3, -5], [-11, -50], [33, 11], [5, 11]];', 'const OUTLINE = window.SerifLightningOutline;')
  .replace('const length = distance / Math.max(0.15, dot(bisector, n1));', `// Narrow the bevel smoothly near the fine beak so its tip stays crisp.
      const headBlend = Math.max(0, Math.min(1, (point[1] - 35) / 10));
      const width = distance * (1 - 0.65 * headBlend);
      const miter = width / Math.max(0.15, dot(bisector, n1));
      const length = headBlend > 0 ? Math.min(miter, width * 2.5) : miter;`)
  .replace(/  const light = normalize\([^\n]+\);\r?\n  const halfVector = normalize\([^\n]+\);/, '  const lights = window.SerifLightningLights;')
  .replace(/        const illumination = [\s\S]*?(?=        const gradient =)/, `        const illumination = lights.reduce((sum, light) => sum + light.intensity * Math.max(0, dot(face.normal, light.direction)), 0);
        const specular = lights.reduce((sum, light) => sum + light.intensity * Math.pow(Math.max(0, dot(face.normal, light.halfVector)), light.gloss), 0);
        const brightness = 0.56 + 0.39 * Math.min(1, illumination) + 0.34 * specular;
        // The reflected view direction samples a stationary studio highlight.
        // No animation time or spin angle moves the lights or their reflections.
        const reflectedView = [2 * face.normal[0] * face.normal[2], 2 * face.normal[1] * face.normal[2], 2 * face.normal[2] ** 2 - 1];
        const reflection = 0.48 + 0.2 * dot(reflectedView, lights[0].direction);
`);
if (renderer === original) throw new Error('The base bolt outline was not found.');
if (renderer.includes('Math.sin(angle * 2') || renderer.includes('const light = normalize')) throw new Error('Animated lighting remains in the draft.');
const draft = outline + '\n' + lighting + '\n' + renderer;
fs.writeFileSync(path.join(__dirname, 'serif-lightning.js'), draft);
let fragment = fs.readFileSync(fragmentPath, 'utf8');
fragment = fragment.replace(/\/\* SERIF_MODEL \*\/[\s\S]*?(?=\n\(\(\) => \{\n  const root = document.getElementById)/, '/* SERIF_MODEL */\n' + draft);
fs.writeFileSync(fragmentPath, fragment);
console.log('Updated curved-serif bolt model and inline preview.');
