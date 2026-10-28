'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const sourceRequire = require('node:module').createRequire(path.join(__dirname, '../src/native-flash.js'));

function fixture(foregroundPID) {
  const shell = 10, movie = 20, menu = 30, otherApp = 40;
  const order = [menu, shell, movie, otherApp], positions = [];
  const functions = {
    GetForegroundWindow: () => foregroundPID === 4000 ? menu : foregroundPID === 5000 ? movie : otherApp,
    GetWindowThreadProcessId: (_h, pid) => { pid[0] = foregroundPID; return 1; },
    IsWindowVisible: () => 1,
    GetWindow: (h, direction) => order[order.indexOf(h) + (direction === 2 ? 1 : -1)] || 0,
    SetWindowPos: (h, after, x, y, w, height, flags) => {
      positions.push({ h, after, flags });
      order.splice(order.indexOf(h), 1); order.splice(order.indexOf(after) + 1, 0, h);
      return 1;
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/native-flash.js'), 'utf8'), {
    module, process: { pid: 4000 }, __dirname: path.join(__dirname, '../src'),
    require: id => id === 'electron' ? {} : id === 'koffi' ? { load: () => ({ func: signature => functions[signature.match(/__stdcall (\w+)/)[1]] || (() => 0) }) } : sourceRequire(id)
  });
  const view = Object.assign(Object.create(module.exports.NativeFlash.prototype), {
    hwnd: movie, child: { pid: 5000 }, host: { isDestroyed: () => false },
    hostHandle: () => shell, wantedVisible: true, readyVisible: true
  });
  return { view, order, positions, shell, movie, menu, functions };
}

test('menu activation repairs the shell covering its running movie without activating or hiding either window', () => {
  const f = fixture(4000);
  assert.equal(f.view.raiseHostBehindFlash(), true);
  assert.deepEqual(f.order, [f.menu, f.movie, f.shell, 40]);
  assert.deepEqual(f.positions, [{ h: f.shell, after: f.movie, flags: 0x4213 }]);
  assert.equal(f.view.raiseHostBehindFlash(), false, 'An already repaired stack requires no repeated positioning');
});

test('native activation still brings its shell immediately behind the movie', () => {
  const f = fixture(5000);
  assert.equal(f.view.raiseHostBehindFlash(), true);
  assert.deepEqual(f.order, [f.menu, f.movie, f.shell, 40]);
});

test('frame activation preserves its current stack slot when another app had covered the movie', () => {
  const f = fixture(4000);
  f.order.splice(2, 0, 50);
  assert.equal(f.view.raiseHostBehindFlash(), true);
  assert.deepEqual(f.order, [f.menu, f.shell, f.movie, 50, 40]);
  assert.equal(f.view.raiseHostBehindFlash(), true);
  assert.deepEqual(f.order, [f.menu, f.movie, f.shell, 50, 40]);
  assert.deepEqual(f.positions, [
    { h: f.movie, after: f.shell, flags: 0x4213 },
    { h: f.shell, after: f.movie, flags: 0x4213 }
  ]);
});

test('frame focus transfers avoid reactivating an already focused Chromium window', () => {
  const { view } = fixture(4000); let focused = true, contentsFocused = true, windows = 0, contents = 0;
  Object.assign(view.host, { isFocused: () => focused, focus: () => { windows++; focused = true; }, webContents: { isFocused: () => contentsFocused, focus: () => { contents++; contentsFocused = true; } } });
  view.focusHost(); assert.equal(windows, 0); assert.equal(contents, 0);
  focused = false; contentsFocused = false; view.focusHost(); view.focusHost();
  assert.equal(windows, 1); assert.equal(contents, 1);
});

test('another application, hidden movie and unfinished tab transitions never pull the shell through the stack', () => {
  assert.equal(fixture(6000).view.raiseHostBehindFlash(), false);
  for (const state of [{ preparing: true }, { retiring: true }, { handoff: true }, { above: 50 }, { readyVisible: false }, { wantedVisible: false }]) {
    const f = fixture(4000); Object.assign(f.view, state);
    assert.equal(f.view.raiseHostBehindFlash(), false);
    assert.equal(f.positions.length, 0);
  }
  const f = fixture(4000); f.functions.IsWindowVisible = () => 0;
  assert.equal(f.view.raiseHostBehindFlash(), false);
});
