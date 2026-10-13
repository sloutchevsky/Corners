'use strict';
module.exports = app => app.evaluate(async ({desktopCapturer, screen}) => {
  const w=global.__flashborn.win;
  if(!global.__flashborn.getState().menuOpen)w.focus();
  const b=w.getBounds(), d=screen.getDisplayMatching(b), factor=d.scaleFactor;
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(d.size.width*factor),height:Math.round(d.size.height*factor)}});
  const target=sources.find(s=>s.display_id===String(d.id));
  if(!target)throw Error('Diagnostic display capture unavailable');
  // Export only the test application's region, never the rest of the desktop.
  const image=target.thumbnail.crop({x:Math.round((b.x-d.bounds.x)*factor),y:Math.round((b.y-d.bounds.y)*factor),width:Math.round(b.width*factor),height:Math.round(b.height*factor)});
  const bitmap=image.toBitmap(), size=image.getSize();let creamPixels=0;
  for(let y=Math.round(170*factor);y<size.height-40*factor;y+=2)for(let x=Math.round(280*factor);x<size.width-25*factor;x+=2){const p=(y*size.width+x)*4,b=bitmap[p],g=bitmap[p+1],r=bitmap[p+2];if(r>225&&g>180&&g<235&&b>140&&b<215)creamPixels++;}
  return {png:image.toPNG().toString('base64'),creamPixels};
});
