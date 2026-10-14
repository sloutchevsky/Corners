'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const koffi = require('koffi'), user32 = koffi.load('user32.dll'), Point = koffi.struct({ x: 'int32_t', y: 'int32_t' });
const windowAt = user32.func('WindowFromPoint', 'intptr_t', [Point]);
const ancestor = user32.func('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t flags)');
const windowRect = user32.func('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ int32_t *rect)');
function assertOnTop(point) {
  const rect = [0, 0, 0, 0]; windowRect(point.handle, rect);
  const hit = windowAt({ x: rect[0] + Math.floor(point.x * (rect[2] - rect[0]) / point.bounds.width), y: rect[1] + Math.floor(point.y * (rect[3] - rect[1]) / point.bounds.height) });
  assert.equal(ancestor(hit, 2), point.handle, 'Windows must route clicks over Flash to the picker');
}
async function poll(fn, check, timeout = 30000) { const end = Date.now() + timeout; let value; do { value = await fn(); if (check(value)) return value; await wait(80); } while (Date.now() < end); throw Error('Timeout: ' + JSON.stringify(value)); }
(async () => {
  const profile = path.join(output, 'eyedropper-profile-' + Date.now());
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  fs.mkdirSync(profile, { recursive: true });
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], pass = text => { passed.push(text); console.log('PASS ' + text); };
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    await app.evaluate(() => { const w = global.__flashborn.win; w.setBounds({ x: 80, y: 80, width: 1280, height: 820 }); w.setAlwaysOnTop(true, 'pop-up-menu'); w.show(); w.focus(); });
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const script = code => app.evaluate(({}, code) => global.__flashborn.activeTab().native.evaluate(code), code);
    const ready = () => poll(() => script('document.body.dataset.ready'), v => v === 'true');
    await app.evaluate(({}, file) => global.__flashborn.openLocal(file), path.join(root, 'assets', 'Flashborn-Demo.swf')); await ready();
    assert.equal(await script('document.getElementById("flash-movie").GetVariable("$version")'), 'WIN 34,0,0,376');
    await script('document.getElementById("pause").click()');
    const open = async () => {
      await script('document.getElementById("background").click()');
      const color = await poll(() => app.windows().find(w => !w.isClosed() && w.url() === 'flashborn://ui/color.html'), Boolean);
      await color.locator('#color-pick').click();
      await poll(() => app.evaluate(() => global.__flashborn.screenColorPicker?.entries.length && global.__flashborn.screenColorPicker.entries.every(e => e.window.isVisible())), Boolean);
      await poll(state, s => s.colorPicking && !!s.colorPreview);
      return { color, picker: await poll(() => app.windows().find(w => !w.isClosed() && w.url() === 'flashborn://ui/screen-color.html'), Boolean) };
    };
    const pointInFlash = () => app.evaluate(() => {
      const picker = global.__flashborn.screenColorPicker, host = global.__flashborn.win.getContentBounds(), s = global.__flashborn.getState();
      const entry = picker.entries.find(e => host.x >= e.bounds.x && host.x < e.bounds.x + e.bounds.width);
      if (!entry) throw Error('Test app display is missing');
      const sx = entry.size.width / entry.bounds.width, sy = entry.size.height / entry.bounds.height;
      const left = host.x + (s.fullscreen ? 0 : s.collapsed ? 68 : 248), top = host.y + (s.fullscreen ? 0 : 100);
      // Inspect only our test application's Flash rectangle, never other desktop content.
      for (let y = Math.ceil((top - entry.bounds.y + 60) * sy); y < (host.y + host.height - entry.bounds.y - 50) * sy; y++) {
        for (let x = Math.ceil((left - entry.bounds.x + 30) * sx); x < (host.x + host.width - entry.bounds.x - 30) * sx; x++) {
          const offset = (y * entry.size.width + x) * 4, [b, g, r] = entry.bitmap.subarray(offset, offset + 3);
          if (r > 225 && g > 180 && g < 235 && b > 140 && b < 215) {
            // Pick inside a solid patch: Windows rounds pointer positions at
            // fractional display scales, so an antialiased edge is ambiguous.
            if ([-4, 4].some(dy => [-4, 4].some(dx => {
              const adjacent = ((y + dy) * entry.size.width + x + dx) * 4;
              return entry.bitmap[adjacent] !== b || entry.bitmap[adjacent + 1] !== g || entry.bitmap[adjacent + 2] !== r;
            }))) continue;
            const point = { x: (x + .5) / sx, y: (y + .5) / sy }, handle = Number(entry.window.getNativeWindowHandle().readBigUInt64LE());
            return { ...point, bounds: entry.bounds, expected: picker.sample(entry, point.x, point.y), handle, parent: entry.window.getParentWindow()?.id || null, topmost: entry.window.isAlwaysOnTop() };
          }
        }
      }
      throw Error('Real cream Flash pixels were not captured');
    });
    let { color, picker } = await open();
    const point = await pointInFlash(); assertOnTop(point); assert.equal(point.parent, null); assert.equal(point.topmost, true);
    await picker.mouse.move(point.x, point.y); await poll(() => picker.locator('#hex').innerText(), v => v === point.expected);
    // Export only the magnifier. Full desktop snapshots are never saved.
    fs.writeFileSync(path.join(output, 'eyedropper-lens-1.7.1.png'), await picker.locator('#lens').screenshot());
    await picker.mouse.click(point.x, point.y);
    await poll(state, s => !s.colorPicking && !s.colorPreview && s.flashBackground === point.expected); await ready();
    await poll(() => color.locator('#color-hex').inputValue(), v => v === point.expected);
    assert.equal(await script('document.getElementById("flash-movie").getAttribute("bgcolor")'), point.expected);
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.inspect().visible), Boolean);
    const dialog = await app.evaluate(() => {
      const w = global.__flashborn.colorWindow, bounds = w.getBounds();
      return { handle: Number(w.getNativeWindowHandle().readBigUInt64LE()), bounds, x: bounds.width / 2, y: bounds.height / 2 };
    });
    assertOnTop(dialog);
    assert.equal(await app.evaluate(() => global.__flashborn.screenColorPicker), null);
    assert.equal(await color.locator('#color-pick').isEnabled(), true);
    pass('Topmost eyedropper owns the Windows click target over genuine Adobe Flash; clicking a real cream pixel updates the actual Flash background and hex field');
    await color.locator('#color-pick').click();
    await poll(() => app.evaluate(() => global.__flashborn.screenColorPicker?.entries.some(e => e.window.isVisible())), Boolean);
    picker = await poll(() => app.windows().find(w => !w.isClosed() && w.url() === 'flashborn://ui/screen-color.html'), Boolean);
    await picker.keyboard.press('Escape').catch(error => { if (!error.message.includes('has been closed')) throw error; });
    await poll(state, s => !s.colorPicking && !s.colorPreview);
    await poll(() => color.locator('#color-status').innerText(), v => v === 'Color picking canceled.');
    assert.equal((await state()).flashBackground, point.expected);
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.inspect().visible), Boolean);
    await script('document.getElementById("flash-movie").Play()');
    const frame = await script('document.getElementById("flash-movie").CurrentFrame()');
    await poll(() => script('document.getElementById("flash-movie").CurrentFrame()'), v => v !== frame);
    await command('color-close');
    pass('Escape removes picker windows and screen buffers, preserves the background, restores the color dialog and live Flash playback');
    for (const mode of ['collapsed', 'fullscreen']) {
      await command(mode === 'collapsed' ? 'collapse' : 'fullscreen', { value: true }); await wait(400);
      ({ color, picker } = await open());
      const position = await pointInFlash(); assertOnTop(position);
      await picker.mouse.click(position.x, position.y);
      await poll(state, s => !s.colorPicking && s.flashBackground === position.expected); await ready();
      await command('color-close'); await command(mode === 'collapsed' ? 'collapse' : 'fullscreen', { value: false }); await wait(400);
    }
    pass('Actual screen pixel selection works with the sidebar collapsed and the Flash player fullscreen');
    ({ color, picker } = await open()); await command('color-close');
    await poll(state, s => !s.colorPicking && !s.colorPreview);
    assert.equal(await app.evaluate(() => global.__flashborn.screenColorPicker), null);
    assert.equal(app.windows().filter(w => !w.isClosed() && w.url() === 'flashborn://ui/screen-color.html').length, 0);
    await poll(() => app.evaluate(() => global.__flashborn.activeTab().native.inspect().visible), Boolean);
    pass('Closing the color dialog while picking removes overlays and restores the native Flash window');
    await command('panel', { name: 'about' });
    const before = await ui.locator('.about-detail').boundingBox();
    await ui.locator('[data-contact-email]').click(); await ui.locator('.email-copied').waitFor({ state: 'visible' });
    assert.equal(await ui.locator('.email-copied').innerText(), 'Copied!');
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'sloutchevsky@gmail.com');
    assert.deepEqual(await ui.locator('.about-detail').boundingBox(), before);
    await ui.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const about = await app.evaluate(async () => (await global.__flashborn.win.webContents.capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(path.join(output, 'about-copied-1.7.1.png'), Buffer.from(about, 'base64'));
    await wait(500); await ui.locator('[data-contact-email]').press('Enter');
    await wait(1200); assert.equal(await ui.locator('.email-copied').isVisible(), true);
    await ui.locator('.email-copied').waitFor({ state: 'hidden' });
    pass('Email click and keyboard activation copy the address, show Copied! without shifting About text, and dismiss the bubble after the last click');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-eyedropper-results.json' : 'eyedropper-results.json'), JSON.stringify({ passed, completedAt: new Date().toISOString() }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
