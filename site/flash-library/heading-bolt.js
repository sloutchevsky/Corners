(function () {
  'use strict';
  var canvas=document.getElementById('gallery-bolt'),source=document.createElement('canvas');
  source.width=source.height=144;
  var bolt=new GoldLightning(source),progress=0,frame=0,started=false;
  var motion=matchMedia('(prefers-reduced-motion: reduce)');
  function paint(value) {
    progress=value;
    var size=Math.max(32,Math.round(canvas.getBoundingClientRect().width*devicePixelRatio*2));
    if(canvas.width!==size)canvas.width=canvas.height=source.width=source.height=size;
    bolt.setTheme(document.documentElement.dataset.theme==='light'?'light':'current');
    bolt.draw(motion.matches?0:Math.PI*2*value);
    var phase=Math.max(0,Math.min(1,(value-.08)/.84)),gold=Math.pow(Math.sin(Math.PI*phase),2);
    var ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,size,size);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.drawImage(source,0,0,size,size);ctx.globalCompositeOperation='source-in';
    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--bolt-grey').trim();
    ctx.fillRect(0,0,size,size);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=gold;
    ctx.drawImage(source,0,0,size,size);ctx.globalAlpha=1;
    canvas.dataset.progress=value.toFixed(4);canvas.dataset.gold=gold.toFixed(4);
  }
  function start() {
    if(started)return;started=true;canvas.dataset.plays='1';canvas.dataset.state='playing';
    var began=performance.now();
    function tick(now) {
      var value=Math.min(1,(now-began)/2400);paint(value);
      if(value<1)frame=requestAnimationFrame(tick);
      else{frame=0;canvas.dataset.state='idle';}
    }
    frame=requestAnimationFrame(tick);
  }
  paint(0);
  new MutationObserver(function(){paint(progress);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  new ResizeObserver(function(){paint(progress);}).observe(canvas);
  window.addEventListener('pagehide',function(){cancelAnimationFrame(frame);frame=0;paint(1);canvas.dataset.state='idle';});
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
})();
