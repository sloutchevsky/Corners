(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MagneticGrid=api;
})(typeof window==='object'?window:this,function(){
  'use strict';
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function contains(rect,point,pad){
    pad=pad||0;
    return point.x>=rect.x-rect.width/2+pad&&point.x<=rect.x+rect.width/2-pad&&point.y>=rect.y-rect.height/2+pad&&point.y<=rect.y+rect.height/2-pad;
  }
  function contain(rect,point,pad){
    // This projection is applied to the rendered rectangle, on every frame.
    // A target-only constraint cannot protect an interrupted animation.
    pad=Math.min(pad===undefined ? .75 : pad,rect.width/4,rect.height/4);
    rect.x=clamp(rect.x,point.x-rect.width/2+pad,point.x+rect.width/2-pad);
    rect.y=clamp(rect.y,point.y-rect.height/2+pad,point.y+rect.height/2-pad);
    return rect;
  }
  function hold(rect,acquired,target,point){
    // If the final preview can preserve the acquired footprint, preserve it
    // on every intermediate frame too, including an interrupted shrink.
    if(acquired&&target.x-target.width/2<=acquired.left+.01&&target.x+target.width/2>=acquired.left+acquired.width-.01&&target.y-target.height/2<=acquired.top+.01&&target.y+target.height/2>=acquired.top+acquired.height-.01){
      // Native DOM measurements can round an acquired edge a few thousandths
      // past its destination. Trim only that tolerance, or hold() would stop
      // the spring just short of docking forever.
      var left=Math.max(acquired.left,target.x-target.width/2),right=Math.min(acquired.left+acquired.width,target.x+target.width/2);
      var top=Math.max(acquired.top,target.y-target.height/2),bottom=Math.min(acquired.top+acquired.height,target.y+target.height/2);
      rect.width=Math.max(rect.width,right-left);rect.height=Math.max(rect.height,bottom-top);
      rect.x=clamp(rect.x,right-rect.width/2,left+rect.width/2);
      rect.y=clamp(rect.y,bottom-rect.height/2,top+rect.height/2);
    }
    if(point){
      var inset=acquired?Math.min(point.x-acquired.left,acquired.left+acquired.width-point.x,point.y-acquired.top,acquired.top+acquired.height-point.y):-1;
      contain(rect,point,inset>=0?Math.min(.75,inset/2):.75);
    }
    return rect;
  }
  function frame(availableWidth,center,maximumTileWidth){
    // Choose capacity from a reference size, then justify the complete row
    // to the line. Target sizes can change when a tile wraps; rendered poses
    // interpolate independently and are fitted as one group during motion.
    var maximum=maximumTileWidth===undefined?(900-4*24)/5:maximumTileWidth;
    var gap=Math.min(24,availableWidth*.08);
    var columns=clamp(Math.floor((availableWidth+gap+1e-7)/(maximum+gap)),3,8);
    var tileWidth=(availableWidth-(columns-1)*gap)/columns;
    var rowWidth=columns*tileWidth+(columns-1)*gap;
    return {left:center-availableWidth/2,width:rowWidth,railWidth:availableWidth,availableWidth:availableWidth,columns:columns,cellWidth:tileWidth,cellHeight:tileWidth/2,gap:gap,maximumTileWidth:maximum};
  }
  function fit(rectangles,left,width){
    var lo=Infinity,hi=-Infinity;
    rectangles.forEach(function(r){lo=Math.min(lo,r.x-r.width/2);hi=Math.max(hi,r.x+r.width/2);});
    var scale=hi>lo?width/(hi-lo):1;
    // This is a render projection, not feedback into the spring state.
    // Both outer edges therefore stay on the line during interrupted wraps.
    return rectangles.map(function(r){return Object.assign({},r,{x:left+(r.x-lo)*scale,width:r.width*scale,velocity:Object.assign({},r.velocity)});});
  }
  function approach(rect,target,seconds,rate){
    // The exact critically damped solution preserves velocity when a live
    // resize or a neighboring hover changes the destination. No duration
    // restarts, coordinate rounding, or final position snap are involved.
    if(!seconds)return rect;
    var decay=Math.exp(-rate*seconds),velocity=rect.velocity||(rect.velocity={});
    ['x','y','width','height','angle'].forEach(function(key){
      var goal=target[key]===undefined?0:target[key],delta=rect[key]-goal,v=velocity[key]||0;
      var change=(v+rate*delta)*seconds;
      rect[key]=goal+(delta+change)*decay;
      velocity[key]=(v-rate*change)*decay;
    });
    return rect;
  }
  function plan(options){
    var f=options.frame,items=options.items,active=options.active,anchor=options.anchor;
    var cols=f.columns,w=f.cellWidth,h=f.cellHeight,g=f.gap,top=options.top;
    var featured=items.find(function(item){return item.id===options.featured;});
    if(featured){
      // A separate full-width band leaves this tile independent of all
      // lower-grid hover packing. Keep the 2x preview's aspect ratio.
      var fullHeight=f.width*(2*h+g)/(2*w+g),gridTop=top+fullHeight+g;
      var lower=plan({frame:f,items:items.filter(function(item){return item.id!==featured.id;}),active:active===featured.id?null:active,anchor:anchor,top:gridTop});
      lower.targets[featured.id]={x:f.left+f.width/2,y:top+fullHeight/2,width:f.width,height:fullHeight,row:-1,column:0,span:cols,rowSpan:0,featured:true};
      lower.bottom=lower.rows?lower.bottom:top+fullHeight;
      lower.gridTop=gridTop;lower.featured=featured.id;
      return lower;
    }
    if(!items.some(function(item){return item.id===active;}))active=null;
    var span=active===null||active===undefined?0:2;
    // A preview fills two complete tracks, including their internal gutter.
    // Every other tile retains the same width, height, and grid pitch.
    var bigW=2*w+g,bigH=2*h+g,column=0,row=0,rows=0,occupied=[],targets=Object.create(null);
    var tracks=Array.from({length:cols},function(){return w;});
    function slot(start,size,bigSize,position,extent,point,limit,pad){
      var best=null;
      for(var index=0;index<=limit;index++){
        var edge=start+index*(size+g);
        var miss=Math.max(0,edge+pad-point,point-edge-bigSize+pad);
        var crop=Math.max(0,edge-position)+Math.max(0,position+extent-edge-bigSize);
        var distance=Math.abs(edge-position);
        // Pointer containment is an absolute priority. Pixel-rounded hit
        // testing can acquire just outside a reported DOM rectangle; no
        // amount of footprint preservation may outweigh keeping that point.
        if(!best||miss<best.miss-1e-9||Math.abs(miss-best.miss)<=1e-9&&(crop<best.crop-1e-9||Math.abs(crop-best.crop)<=1e-9&&distance<best.distance))best={index:index,miss:miss,crop:crop,distance:distance};
      }
      return best.index;
    }
    if(span){
      anchor=anchor||{x:f.left+w/2,y:top+h/2,left:f.left,top:top,width:w,height:h};
      var hasFootprint=Number.isFinite(anchor.width)&&Number.isFinite(anchor.height);
      anchor={x:anchor.x,y:anchor.y,left:Number.isFinite(anchor.left)?anchor.left:anchor.x-w/2,top:Number.isFinite(anchor.top)?anchor.top:anchor.y-h/2,width:anchor.width||w,height:anchor.height||h};
      var padX=hasFootprint?Math.max(.000001,Math.min(.75,(anchor.x-anchor.left)/2,(anchor.left+anchor.width-anchor.x)/2)):.75;
      var padY=hasFootprint?Math.max(.000001,Math.min(.75,(anchor.y-anchor.top)/2,(anchor.top+anchor.height-anchor.y)/2)):.75;
      column=slot(f.left,w,bigW,anchor.left,anchor.width,anchor.x,cols-span,padX);
      var lastRow=Math.max(0,Math.ceil((Math.max(anchor.top,anchor.y)-top)/(h+g))+1);
      row=slot(top,h,bigH,anchor.top,anchor.height,anchor.y,lastRow,padY);
    }
    function reserve(r,c,cspan,rspan){
      for(var y=0;y<rspan;y++)for(var x=0;x<cspan;x++)occupied[(r+y)*cols+c+x]=true;
      rows=Math.max(rows,r+rspan);
    }
    if(span)reserve(row,column,2,2);
    items.forEach(function(item){
      var selected=span&&item.id===active,r=selected?row:0,c=selected?column:0,found=!!selected;
      while(!found){
        for(c=0;c<cols;c++)if(!occupied[r*cols+c]){found=true;break;}
        if(!found)r++;
      }
      if(!selected)reserve(r,c,1,1);
      var tw=selected?bigW:w,th=selected?bigH:h;
      targets[item.id]={x:f.left+c*(w+g)+tw/2,y:top+r*(h+g)+th/2,width:tw,height:th,row:r,column:c,span:selected?2:1,rowSpan:selected?2:1};
    });
    return {targets:targets,rows:rows,bottom:rows?top+rows*(h+g)-g:top,gap:g,tracks:tracks,activeColumn:column,activeRow:row,gridTop:top,featured:null};
  }
  return {frame:frame,plan:plan,fit:fit,approach:approach,hold:hold,contain:contain,contains:contains};
});
