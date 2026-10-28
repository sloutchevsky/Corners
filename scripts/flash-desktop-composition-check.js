'use strict';
// Read final screen-composited pixels, rather than inferring display readiness
// from IsWindowVisible, a requested opacity, or the helper's capturePage buffer.
// Only this test application's viewport crop is read or exported.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check, timeout = 30000) {
  const until = Date.now() + timeout; let value;
  do { value = await read(); if (check(value)) return value; await wait(30); } while (Date.now() < until);
  throw Error('Timeout: ' + JSON.stringify(value));
}
function recolorMovie(rgb) {
  const bytes = Buffer.from(require('./playback-fixture'));
  let offset = 8 + Math.ceil((5 + (bytes[8] >> 3) * 4) / 8) + 4;
  while (offset < bytes.length) {
    const header = bytes.readUInt16LE(offset), code = header >> 6;
    const length = (header & 63) === 63 ? bytes.readUInt32LE(offset + 2) : header & 63;
    const body = offset + ((header & 63) === 63 ? 6 : 2);
    if (code === 9) { Buffer.from(rgb).copy(bytes, body); return bytes; }
    offset = body + length;
  }
  throw Error('Fixture has no SetBackgroundColor tag');
}
(async () => {
  const profile = path.join(process.env.FLASHBORN_TEST_PROFILES || output, 'flash-desktop-' + Date.now());
  fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings: { adBlockEnabled: false } }));
  // Both colors are far from either browser theme, desktop black and white.
  // A neutral dark fixture would mistakenly accept the dark shell as Flash.
  const colors = [[27, 91, 67], [70, 42, 113]];
  const movies = colors.map((rgb, i) => require('./html-fixture')(path.join(profile, 'movie-' + i), recolorMovie(rgb)));
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
  const passed = [], phases = [], actions = [], report = path.join(output, process.env.FLASHBORN_EXE ? 'packaged-flash-desktop-composition-results.json' : 'flash-desktop-composition-results.json');
  const command = (action, args = {}) => app.evaluate(({}, value) => global.__flashborn.command(value.action, value.args), { action, args });
  const settled = () => poll(() => app.evaluate(() => global.__flashborn.getState().tabPresentation), serial => !serial);
  let ui;
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean); ui = await app.firstWindow();
    await app.evaluate(({ screen }) => {
      const display = screen.getPrimaryDisplay(), w = global.__flashborn.win;
      w.setBounds({ x: display.workArea.x + 40, y: display.workArea.y + 40, width: Math.min(1250, display.workArea.width - 80), height: Math.min(850, display.workArea.height - 80) });
      w.show(); w.focus();
    });
    const ids = [];
    for (let i = 0; i < movies.length; i++) {
      if (i) await command('new-tab');
      await command('navigate', { value: movies[i] });
      await poll(async () => {
        try {
          return await app.evaluate(async () => {
            const tab = global.__flashborn.activeTab(), native = tab.native;
            if (!native) return { native: false, tab: global.__flashborn.getState().tabs.find(item => item.id === tab.id) };
            try {
              const value = await native.evaluate('Number(document.querySelector("embed").GetVariable("ticks"))');
              if (Number.isFinite(value)) return value;
              return { value: String(value), tab: global.__flashborn.getState().tabs.find(item => item.id === tab.id), runtime: { state: native.state, wanted: native.wantedVisible, ready: native.readyVisible, presented: native.isPresented(), cloaked: native.cloaked, bounds: native.lastBounds } };
            }
            catch (error) { return { error: error.message, tab: global.__flashborn.getState().tabs.find(item => item.id === tab.id), runtime: { stopped: native.stopped, log: native.lastLog, hwnd: native.hwnd, wanted: native.wantedVisible, ready: native.readyVisible, presented: native.isPresented(), cloaked: native.cloaked } }; }
          });
        } catch (error) { return { error: error.message }; }
      }, ticks => Number.isFinite(ticks) && ticks > 2);
      await settled(); ids.push(await app.evaluate(() => global.__flashborn.activeTab().id));
    }
    const capture = await app.evaluate(async ({ desktopCapturer, screen, session }, module) => {
      const w = global.__flashborn.win, display = screen.getDisplayMatching(w.getBounds());
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const source = sources.find(item => item.display_id === String(display.id));
      if (!source) throw Error('No desktop source for the owned test window');
      // This handler is scoped to the test-only shell session and grants only
      // the display identified above. It is removed when the owned app closes.
      session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => callback({ video: source }));
      const physical = global.__flashborn.activeTab().native.lastBounds;
      const point = screen.screenToDipPoint({ x: physical[0], y: physical[1] });
      const { Worker } = process.mainModule.require('node:worker_threads');
      const phase = new SharedArrayBuffer(4); Atomics.store(new Int32Array(phase), 0, -1);
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const koffi = require(workerData.module), user = koffi.load('user32.dll'), gdi = koffi.load('gdi32.dll');
        const getDC = user.func('intptr_t __stdcall GetDC(intptr_t)'), release = user.func('int __stdcall ReleaseDC(intptr_t,intptr_t)');
        const pixel = gdi.func('uint32_t __stdcall GetPixel(intptr_t,int,int)');
        const dc = getDC(0), phase = new Int32Array(workerData.phase); let frames = [];
        const sample = setInterval(() => { const before = performance.now(), value = pixel(dc, workerData.x, workerData.y); frames.push({ at: Date.now(), cost: performance.now()-before, phase: Atomics.load(phase,0), rgb: [value & 255, value >>> 8 & 255, value >>> 16 & 255] }); }, 2);
        const send = setInterval(() => { parentPort.postMessage(frames); frames = []; }, 50);
        parentPort.on('message', () => { clearInterval(sample); clearInterval(send); release(0,dc); parentPort.postMessage(frames); parentPort.close(); });
      `, { eval: true, workerData: { module, phase, x: physical[0] + 45, y: physical[1] + 45 } });
      global.__desktopPixels = { worker, phase: new Int32Array(phase), frames: [], surfaces: [] };
      worker.on('message', frames => global.__desktopPixels.frames.push(...frames));
      worker.on('error', error => { global.__desktopPixels.error = error.message; });
      global.__desktopPixels.timer = setInterval(() => {
        const api = global.__flashborn, p = api.presentation;
        global.__desktopPixels.surfaces.push({ at: Date.now(), phase: Atomics.load(global.__desktopPixels.phase, 0), active: api.activeTab().id, presentation: p && { host: p.hostReady, surface: p.surfaceReady, swapping: p.swapping }, region: api.windowRegion?.key, movies: api.tabs.filter(tab => tab.native?.hwnd).map(tab => ({ id: tab.id, expected: tab.native.lastBounds, actual: tab.native.inspect().rect, wanted: tab.native.wantedVisible, visible: tab.native.lastVisible, ready: tab.native.readyVisible, preparing: tab.native.preparing, retiring: tab.native.retiring, presented: tab.native.isPresented() })) });
      }, 20);
      return { display: display.bounds, crop: { x: point.x - display.bounds.x, y: point.y - display.bounds.y, width: physical[2] / display.scaleFactor, height: physical[3] / display.scaleFactor } };
    }, path.join(root, 'node_modules', 'koffi'));
    await ui.evaluate(async ({ capture, colors }) => {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 120, max: 120 } } });
      await stream.getVideoTracks()[0].applyConstraints({ width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { min: 60, ideal: 120, max: 120 } });
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
      // Read a strip on the left of the Flash viewport. It avoids the menu on
      // the right and the cream fixture square, making dark/blank frames exact.
      canvas.width = 96; canvas.height = 96;
      const state = window.__desktopComposition = { frames: [], phase: 'calibration', running: true, stream, video, firstBad: null, track: stream.getVideoTracks()[0].getSettings() };
      // Screen capture may otherwise emit damage frames only for a mostly
      // static fixture. A single test pixel in the toolbar requests continuous
      // composition without altering any sampled viewport pixel.
      const pulse = document.createElement('i'); pulse.style.cssText = 'position:fixed;top:10px;left:100px;width:1px;height:1px;z-index:2147483647;pointer-events:none'; document.body.append(pulse);
      state.pulse = pulse; let pulseIndex = 0;
      const repaint = () => { if (!state.running) return; pulse.style.backgroundColor = pulseIndex++ % 2 ? '#000' : '#fff'; state.repaint = requestAnimationFrame(repaint); };
      state.repaint = requestAnimationFrame(repaint);
      const near = (bytes, offset, color) => color.every((value, channel) => Math.abs(bytes[offset + channel] - value) <= 8);
      const sample = (now, metadata) => {
        if (!state.running) return;
        const sx = video.videoWidth / capture.display.width, sy = video.videoHeight / capture.display.height;
        const crop = { x: (capture.crop.x + 20) * sx, y: (capture.crop.y + 25) * sy, width: Math.min(120, capture.crop.width * .15) * sx, height: Math.max(10, capture.crop.height - 50) * sy };
        context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
        const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data, counts = colors.map(() => 0);
        for (let offset = 0; offset < bytes.length; offset += 4) for (let index = 0; index < colors.length; index++) if (near(bytes, offset, colors[index])) counts[index]++;
        const pixels = bytes.length / 4, share = counts.map(count => count / pixels), winner = share.indexOf(Math.max(...share));
        const frame = { now, mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames, phase: state.phase, share, winner, valid: share[winner] > .95 };
        state.frames.push(frame);
        if (!frame.valid && state.phase !== 'calibration' && !state.firstBad) state.firstBad = { frame, png: canvas.toDataURL('image/png') };
        state.request = video.requestVideoFrameCallback(sample);
      };
      state.request = video.requestVideoFrameCallback(sample);
    }, { capture, colors });
    await poll(() => ui.evaluate(() => window.__desktopComposition.frames.filter(frame => frame.valid).length), count => count >= 5);
    const readAction = name => app.evaluate(({}, phase) => ({ phase, at: Date.now(), active: global.__flashborn.activeTab().id, menu: global.__flashborn.getState().menuOpen, presentation: global.__flashborn.getState().tabPresentation, movies: global.__flashborn.tabs.filter(tab => tab.native).map(tab => ({ id: tab.id, hwnd: tab.native.hwnd, visible: tab.native.lastVisible, presented: tab.native.isPresented(), preparing: tab.native.preparing, retiring: tab.native.retiring, ready: tab.native.readyVisible, bounds: tab.native.lastBounds })) }), name);
    const begin = async name => {
      phases.push(name); actions.push(await readAction(name));
      await app.evaluate(({}, phase) => { Atomics.store(global.__desktopPixels.phase, 0, phase); }, phases.length - 1);
      await ui.evaluate(name => { window.__desktopComposition.phase = name; }, name);
    };
    for (const theme of ['current', 'light']) {
      const current = await app.evaluate(() => global.__flashborn.getState().settings.theme);
      if (current !== theme) await command('theme');
      await wait(100);
      for (let i = 0; i < (process.env.FLASHBORN_DESKTOP_TABS_ONLY === '1' ? 0 : 5); i++) {
        await begin(theme + ':menu-open-' + i);
        await ui.locator('#menu-button').click();
        await poll(() => app.evaluate(() => global.__flashborn.menuWindow?.isVisible()), Boolean);
        await wait(120);
        await begin(theme + ':menu-button-close-' + i);
        await ui.locator('#menu-button').click();
        await poll(() => app.evaluate(() => !global.__flashborn.menuWindow), Boolean);
        await wait(100);
        await begin(theme + ':menu-outside-close-' + i);
        await ui.locator('#menu-button').click();
        await poll(() => app.evaluate(() => global.__flashborn.menuWindow?.isVisible()), Boolean);
        await ui.locator('#address').click();
        await poll(() => app.evaluate(() => !global.__flashborn.menuWindow), Boolean);
        await wait(100);
      }
      for (let i = 0; i < 12; i++) {
        const id = ids[i % 2];
        await begin(theme + ':tab-switch-' + i);
        // Actual chrome controls execute all focus/preload/IPC handlers.
        // Explicit native activation also exercises shell-above-movie races
        // which a CDP pointer event alone does not perform on Windows.
        await app.evaluate(() => global.__flashborn.win.focus());
        await ui.locator(`[data-reorder-id="${id}"]`).click();
        await settled();
        const selected = await app.evaluate(() => { const api = global.__flashborn, tab = api.activeTab(); return { id: tab.id, error: tab.error, presented: tab.native?.isPresented() }; });
        assert.equal(selected.error, null, 'Selecting an existing Flash tab must not turn it into an error page: ' + JSON.stringify(selected));
        assert.ok(selected.presented, 'The selected Flash tab must actually be presented: ' + JSON.stringify(selected));
        await poll(() => ui.evaluate(({ phase, expected }) => {
          const frames = window.__desktopComposition.frames.filter(frame => frame.phase === phase);
          return frames.length >= 3 && frames.slice(-3).every(frame => frame.valid && frame.winner === expected);
        }, { phase: theme + ':tab-switch-' + i, expected: i % 2 }), Boolean, 4000);
        actions.push(await readAction(theme + ':tab-settled-' + i));
        await wait(80);
      }
    }
    await begin('finished'); await wait(160);
    const result = await ui.evaluate(() => {
      const state = window.__desktopComposition; state.running = false;
      state.video.cancelVideoFrameCallback(state.request); cancelAnimationFrame(state.repaint); state.pulse.remove(); state.stream.getTracks().forEach(track => track.stop());
      return { frames: state.frames, firstBad: state.firstBad, track: state.track, video: { width: state.video.videoWidth, height: state.video.videoHeight } };
    });
    const pixels = await app.evaluate(async () => {
      const state = global.__desktopPixels;
      clearInterval(state.timer);
      if (state.worker.threadId !== -1) await new Promise(resolve => { state.worker.once('exit', resolve); state.worker.postMessage('stop'); });
      return { frames: state.frames, surfaces: state.surfaces, error: state.error };
    });
    assert.ok(!pixels.error, pixels.error);
    const pixelFrames = pixels.frames.filter(frame => frame.phase >= 0 && phases[frame.phase] !== 'finished').map(frame => {
      const winner = colors.findIndex(color => color.every((value, i) => Math.abs(frame.rgb[i] - value) <= 8));
      return { ...frame, phase: phases[frame.phase], winner, valid: winner >= 0 };
    });
    const pixelBad = pixelFrames.filter(frame => !frame.valid), pixelGaps = pixelFrames.slice(1).map((frame, i) => frame.at - pixelFrames[i].at);
    const pixelMedianGap = [...pixelGaps].sort((a, b) => a - b)[Math.floor(pixelGaps.length / 2)] || null;
    const sequences = Object.fromEntries(phases.filter(phase => phase.includes(':tab-switch-')).map(phase => {
      const frames = pixelFrames.filter(frame => frame.phase === phase), sequence = [];
      for (const frame of frames) if (sequence.at(-1) !== frame.winner) sequence.push(frame.winner);
      return [phase, sequence];
    }));
    const geometryMismatches = pixels.surfaces.flatMap(frame => frame.movies.filter(movie => movie.presented && movie.expected.some((value, index) => value !== [movie.actual[0], movie.actual[1], movie.actual[2] - movie.actual[0], movie.actual[3] - movie.actual[1]][index])).map(movie => ({ at: frame.at, phase: phases[frame.phase], movie })));
    const measured = result.frames.filter(frame => frame.phase !== 'calibration' && frame.phase !== 'finished');
    const bad = measured.filter(frame => !frame.valid), cadence = measured.slice(1).map((frame, i) => frame.now - measured[i].now);
    const maxGap = Math.max(0, ...cadence), medianGap = [...cadence].sort((a, b) => a - b)[Math.floor(cadence.length / 2)] || null;
    const phaseCoverage = Object.fromEntries(phases.map(phase => [phase, measured.filter(frame => frame.phase === phase).length]));
    if (result.firstBad) fs.writeFileSync(path.join(output, 'flash-desktop-composition-first-bad.png'), Buffer.from(result.firstBad.png.split(',')[1], 'base64'));
    const summary = { passed, profile, capture, video: result.video, track: result.track, actions, surfaces: pixels.surfaces, geometryMismatches, frames: result.frames, badFrames: bad, medianGap, maxGap, phaseCoverage, pixelFrames, pixelBad, pixelMedianGap, pixelMaxGap: Math.max(0, ...pixelGaps), sequences };
    fs.writeFileSync(report, JSON.stringify(summary, null, 2));
    assert.ok(measured.length >= 100, 'Must measure a continuous desktop stream, not occasional helper screenshots');
    assert.ok(pixelMedianGap !== null && pixelMedianGap <= 25, 'Independent final-desktop pixel sampling is too sparse to assess short compositor flashes: ' + pixelMedianGap);
    assert.equal(bad.length, 0, 'Final desktop Flash pixels blanked or changed to a shell/desktop color: ' + JSON.stringify(bad.slice(0, 8)));
    assert.equal(pixelBad.length, 0, 'Independent final desktop pixel read detected a blank/shell/desktop frame: ' + JSON.stringify(pixelBad.slice(0, 8)));
    assert.equal(geometryMismatches.length, 0, 'Presented Flash HWND must match its actual physical viewport after a display-scale transition: ' + JSON.stringify(geometryMismatches.slice(0, 3)));
    for (const [phase, sequence] of Object.entries(sequences)) {
      const destination = Number(phase.match(/tab-switch-(\d+)/)[1]) % 2;
      assert.equal(sequence.at(-1), destination, 'Final desktop must show selected movie: ' + phase + ' ' + sequence);
      assert.ok(sequence.length <= 2, 'Movie must switch only once, without outgoing content reappearing: ' + phase + ' ' + sequence);
      if (sequence.length === 2) assert.notEqual(sequence[0], destination, 'Destination must not flash prematurely and then disappear: ' + phase + ' ' + sequence);
    }
    passed.push('Continuous final desktop pixels remain painted during repeated menu opening, second-click/outside dismissal and Flash tab switches in both themes');
    console.log('PASS ' + passed.at(-1));
    console.log(JSON.stringify({ measured: measured.length, medianGap, maxGap, pixelSamples: pixelFrames.length, pixelMedianGap, report }));
    fs.writeFileSync(report, JSON.stringify(summary, null, 2));
  } catch (error) {
    const partial = { profile, error: error.message, actions };
    if (ui) partial.desktop = await ui.evaluate(() => {
      const capture = window.__desktopComposition;
      return capture ? { frames: capture.frames, track: capture.track, firstBad: capture.firstBad } : null;
    }).catch(() => null);
    partial.runtime = await app.evaluate(() => {
      const api = global.__flashborn;
      return api ? { state: api.getState(), pixels: global.__desktopPixels?.frames, surfaces: global.__desktopPixels?.surfaces, pixelError: global.__desktopPixels?.error, movies: api.tabs.filter(tab => tab.native).map(tab => ({ id: tab.id, hwnd: tab.native.hwnd, log: tab.native.lastLog, stopped: tab.native.stopped, presented: tab.native.isPresented(), ready: tab.native.readyVisible, cloaked: tab.native.cloaked })) } : null;
    }).catch(() => null);
    fs.writeFileSync(path.join(output, 'flash-desktop-composition-failure.json'), JSON.stringify(partial, null, 2));
    throw error;
  } finally {
    if (ui) await ui.evaluate(() => { const state = window.__desktopComposition; if (state) { state.running = false; cancelAnimationFrame(state.repaint); state.pulse.remove(); state.stream.getTracks().forEach(track => track.stop()); } }).catch(() => {});
    await app.evaluate(() => { clearInterval(global.__desktopPixels?.timer); const worker = global.__desktopPixels?.worker; if (worker && worker.threadId !== -1) worker.postMessage('stop'); }).catch(() => {});
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
