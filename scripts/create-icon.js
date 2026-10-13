'use strict';
const fs = require('node:fs'), path = require('node:path');
const { _electron: electron } = require('playwright');
async function run() {
  const root = path.resolve(__dirname, '..'), assets = path.join(root, 'assets');
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: path.join(root, 'test-output', 'icon-profile-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: [root], env, timeout: 45000 });
  try {
    const ui = await app.firstWindow(); await ui.waitForFunction(() => typeof window.GoldLightning === 'function');
    const sizes = [16, 24, 32, 48, 64, 128, 256], frames = [];
    for (const size of sizes) {
      const encoded = await ui.evaluate(size => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const bolt = new GoldLightning(canvas); const png = canvas.toDataURL('image/png').split(',')[1]; bolt.dispose(); return png;
      }, size);
      frames.push(Buffer.from(encoded, 'base64'));
    }
    // Each Windows icon size is rendered directly from animation frame one.
    const header = Buffer.alloc(6 + sizes.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16; header[entry] = header[entry + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(frames[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += frames[index].length;
    });
    fs.mkdirSync(assets, { recursive: true }); fs.writeFileSync(path.join(assets, 'icon.png'), frames.at(-1));
    fs.writeFileSync(path.join(assets, 'icon.ico'), Buffer.concat([header, ...frames]));
    fs.writeFileSync(path.join(root, 'src', 'ui', 'brand', 'bolt.png'), frames.at(-1));
    fs.writeFileSync(path.join(root, 'src', 'legacy', 'bolt.png'), frames.at(-1));
    console.log('First-frame gold bolt PNG and seven Windows ICO sizes created from the shared animation renderer.');
  } finally { await app.close(); }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
