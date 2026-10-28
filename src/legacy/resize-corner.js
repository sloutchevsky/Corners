'use strict';
const CORNER_SIZE=40,CORNER_STROKE=15;
function cornerFrame(bounds,inside,edge='bottom-right'){return {x:edge==='top-left'?bounds.x:bounds.x+bounds.width-CORNER_SIZE,y:edge==='top-left'?bounds.y:bounds.y+bounds.height-CORNER_SIZE,width:CORNER_SIZE,height:CORNER_SIZE};}
function dragBounds(bounds,delta,edge,minimum=[800,560]){const left=edge==='top-left',width=Math.max(minimum[0],Math.round(bounds.width+(left?-delta.x:delta.x))),height=Math.max(minimum[1],Math.round(bounds.height+(left?-delta.y:delta.y)));return {x:left?bounds.x+bounds.width-width:bounds.x,y:left?bounds.y+bounds.height-height:bounds.y,width,height};}
function restoreAtCorner(normal,point,offset,edge,work,minimum=[800,560]){const width=Math.max(minimum[0],Math.min(normal.width,work.width*.85)),height=Math.max(minimum[1],Math.min(normal.height,work.height*.85));return {x:Math.round(point.x+(edge==='top-left'?-offset.x:CORNER_SIZE-offset.x-width)),y:Math.round(point.y+(edge==='top-left'?-offset.y:CORNER_SIZE-offset.y-height)),width:Math.round(width),height:Math.round(height)};}
module.exports={CORNER_SIZE,CORNER_STROKE,cornerFrame,dragBounds,restoreAtCorner};
