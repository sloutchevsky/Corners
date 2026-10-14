'use strict';
// Original AVM1 fixture. Mouse callbacks and the Flash frame clock are observable
// through the real plugin, so regression tests do not substitute DOM mouse events.
const demo = require('./create-demo');
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const tag = (code,data=Buffer.alloc(0)) => { const head=u16((code<<6)|Math.min(63,data.length)); if(data.length<63)return Buffer.concat([head,data]);const size=Buffer.alloc(4);size.writeUInt32LE(data.length);return Buffer.concat([head,size,data]); };
const action = (code,data=Buffer.alloc(0)) => Buffer.concat([Buffer.from([code]),...(code>=128?[u16(data.length),data]:[])]);
const push = (...values) => action(0x96,Buffer.concat(values.map(value=>typeof value==='string'?Buffer.concat([Buffer.from([0]),Buffer.from(value+'\0')]):typeof value==='boolean'?Buffer.from([5,+value]):(()=>{const b=Buffer.alloc(5);b[0]=7;b.writeInt32LE(value,1);return b;})())));
const variable = name => Buffer.concat([push(name),action(0x1c)]);
const set = (name,value) => Buffer.concat([push(name,value),action(0x1d)]);
const increment = name => Buffer.concat([push(name),variable(name),push(1),action(0x0a),action(0x1d)]);
const fn = (name,body) => { const code=Buffer.concat([body,Buffer.from([0])]);return Buffer.concat([action(0x9b,Buffer.concat([Buffer.from(name+'\0'),u16(0),u16(code.length)])),code]); };
const dragging = increment('drags');
const onMove = Buffer.concat([variable('down'),action(0x12),action(0x9d,u16(dragging.length)),dragging]);
const maxUpdate = Buffer.concat([push('maxGap'),variable('gap'),action(0x1d)]);
const clock = Buffer.concat([increment('ticks'),push('gap'),action(0x34),variable('lastTime'),action(0x0b),action(0x1d),variable('gap'),variable('maxGap'),action(0x67),action(0x12),action(0x9d,u16(maxUpdate.length)),maxUpdate,push('lastTime'),action(0x34),action(0x1d)]);
const actions = Buffer.concat([set('presses',0),set('drags',0),set('ticks',0),set('maxGap',0),set('lastTime',0),set('down',false),fn('onMouseDown',Buffer.concat([increment('presses'),set('down',true)])),fn('onMouseMove',onMove),fn('onMouseUp',set('down',false)),fn('onEnterFrame',clock),action(7),Buffer.from([0])]);
const bits=demo[8]>>3, rectBytes=Math.ceil((5+bits*4)/8), headerEnd=8+rectBytes+4;
let offset=headerEnd;const tags=[];
while(offset<demo.length){const header=demo.readUInt16LE(offset),code=header>>6;let size=header&63,head=2;if(size===63){size=demo.readUInt32LE(offset+2);head=6;}const chunk=demo.subarray(offset,offset+head+size);offset+=head+size;if(code===1)break;tags.push(chunk);}
const body=Buffer.concat([demo.subarray(8,8+rectBytes+2),u16(1),...tags,tag(12,actions),tag(1),tag(0)]);
const length=Buffer.alloc(4);length.writeUInt32LE(body.length+8);
module.exports=Buffer.concat([Buffer.from('FWS\x08'),length,body]);
