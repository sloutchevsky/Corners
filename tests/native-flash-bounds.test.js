'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { parkedBounds } = require('../src/native-flash-bounds');
const displays = [{ bounds:{x:0,y:0,width:3840,height:2160}, scaleFactor:1.25 }];
test('parking preserves the inactive window size and reserves room for an outstanding larger resize', () => {
  const [x,y,width,height] = parkedBounds(displays,[-1500,-1000,1000,700],[2000,1400]);
  assert.deepEqual([width,height],[1000,700]);
  assert.ok(x + 2500 < 0 && y + 1750 < 0,'Queued larger dimensions cannot cross onto the desktop');
});
test('parking accounts for negative monitor origins, mixed DPI and already enlarged helper windows', () => {
  const screens = [...displays,{bounds:{x:-2560,y:-1440,width:2560,height:1440},scaleFactor:2}];
  const [x,y,width,height] = parkedBounds(screens,[-1000,-800,3200,1800],[1900,1500]);
  assert.deepEqual([width,height],[3200,1800]);
  assert.ok(x+3800 < -2560 && y+3000 < -1440);
});
