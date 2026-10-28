'use strict';
const {ipcRenderer}=require('electron');
let state,drag;
function paint(){if(!state)return;const horizontal=location.hash==='#horizontal',length=horizontal?innerWidth:innerHeight,viewport=horizontal?state.clientWidth:state.clientHeight,total=horizontal?state.scrollWidth:state.scrollHeight,position=horizontal?state.scrollLeft:state.scrollTop,size=Math.min(length,Math.max(40,length*viewport/Math.max(1,total))),offset=Math.max(0,Math.min(total-viewport,position))/Math.max(1,total-viewport)*(length-size);const thumb=document.getElementById('thumb');thumb.style[horizontal?'width':'height']=size+'px';thumb.style.transform=horizontal?'translateX('+offset+'px)':'translateY('+offset+'px)';document.documentElement.dataset.theme=state.light?'light':'current';}
ipcRenderer.on('browser:scrollbar-state',(_event,value)=>{state=value;paint();});
ipcRenderer.on('browser:scrollbar-hover',(_event,value)=>document.documentElement.dataset.hover=String(value));
ipcRenderer.on('browser:scrollbar-active',(_event,value)=>document.documentElement.dataset.active=String(value));
window.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.axis=location.hash==='#horizontal'?'horizontal':'vertical';document.documentElement.dataset.side=location.hash==='#tabs'?'left':location.hash==='#horizontal'?'bottom':'right';paint();});
window.addEventListener('resize',paint);
const axisPosition=event=>location.hash==='#horizontal'?event.clientX:event.clientY;
window.addEventListener('pointerdown',event=>{if(event.isTrusted&&event.button===0){event.preventDefault();drag=event.pointerId;event.target.setPointerCapture(event.pointerId);ipcRenderer.send('browser:edge-scroll',{type:'down',position:axisPosition(event)});}},true);
window.addEventListener('pointermove',event=>{if(event.isTrusted&&event.pointerId===drag)ipcRenderer.send('browser:edge-scroll',{type:'move',position:axisPosition(event)});},true);
window.addEventListener('pointerup',event=>{if(event.isTrusted&&event.pointerId===drag){ipcRenderer.send('browser:edge-scroll',{type:'up',position:axisPosition(event)});drag=null;}},true);
window.addEventListener('pointercancel',()=>{drag=null;ipcRenderer.send('browser:edge-scroll',{type:'up',position:0});},true);
window.addEventListener('wheel',event=>{if(event.isTrusted){event.preventDefault();ipcRenderer.send('browser:edge-scroll',{type:'wheel',delta:location.hash==='#horizontal'?(event.deltaX||event.deltaY):event.deltaY});}},{passive:false});
