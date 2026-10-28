'use strict';
const FRAME=15,CORNER=40;
function surface(bounds){return {x:(bounds.x||0)+FRAME,y:(bounds.y||0)+FRAME,width:Math.max(1,bounds.width-2*FRAME),height:Math.max(1,bounds.height-2*FRAME)};}
function frameRectangles(bounds,bars=[]){
 const x=bounds.x||0,y=bounds.y||0,rects=[surface(bounds)];
 // The page scrolls behind this 15 px mask in every mode. Only functional
 // corner and scrollbar surfaces may occupy the otherwise transparent band.
 rects.push({x,y,width:CORNER,height:CORNER,overlay:true},{x:x+bounds.width-CORNER,y:y+bounds.height-CORNER,width:CORNER,height:CORNER,overlay:true});
 for(const bar of bars)if(bar.visible&&bar.rect)rects.push({...bar.rect,overlay:true});
 return rects;
}
function intersectRegions(a,b){return a.flatMap(x=>b.map(y=>{const left=Math.max(x.x,y.x),top=Math.max(x.y,y.y),right=Math.min(x.x+x.width,y.x+y.width),bottom=Math.min(x.y+x.height,y.y+y.height);return {x:left,y:top,width:right-left,height:bottom-top};}).filter(r=>r.width>0&&r.height>0));}
module.exports={FRAME,CORNER,surface,frameRectangles,intersectRegions};
