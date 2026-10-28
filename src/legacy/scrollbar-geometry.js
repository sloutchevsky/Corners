'use strict';
const BAR=15,MIN_THUMB=40;
function thumbMetrics(length,viewport,total,position){const max=Math.max(0,total-viewport),size=Math.min(length,Math.max(MIN_THUMB,length*viewport/Math.max(1,total))),travel=Math.max(0,length-size);return {size,offset:max?Math.max(0,Math.min(max,position))/max*travel:0,travel,max};}
function scrollbarFrames(bounds,top,left,inside){const end=40;return {vertical:{x:bounds.x+bounds.width-BAR,y:bounds.y+top,width:BAR,height:Math.max(1,bounds.height-top-end)},horizontal:{x:bounds.x+left,y:bounds.y+bounds.height-BAR,width:Math.max(1,bounds.width-left-end),height:BAR}};}
module.exports={BAR,MIN_THUMB,thumbMetrics,scrollbarFrames};
