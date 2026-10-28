'use strict';
// Diagnostic for the exact desktop corner shown in the user's artifact images.
// Reads pixel colors and the owning HWND only; captures no desktop image.
const k=require('koffi'),fs=require('node:fs'),path=require('node:path'),u=k.load('user32.dll'),g=k.load('gdi32.dll');
const dc=u.func('intptr_t __stdcall GetDC(intptr_t)'),release=u.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'),pixel=g.func('uint32_t __stdcall GetPixel(intptr_t,int,int)');
const at=u.func('intptr_t __stdcall WindowFromPoint(uint64_t)'),ancestor=u.func('intptr_t __stdcall GetAncestor(intptr_t,uint32_t)'),owner=u.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t,_Out_ uint32_t*)'),rect=u.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'),className=u.func('int __stdcall GetClassNameW(intptr_t,_Out_ uint16_t*,int)');
const context=dc(0),points=[[15,15],[70,55],[180,120],[340,240]],bad=[];let frames=0;
const timer=setInterval(()=>{frames++;for(const[x,y]of points){const v=pixel(context,x,y),rgb=[v&255,v>>>8&255,v>>>16&255];if(!rgb.every(c=>c>235))continue;const h=ancestor(at(BigInt(y)*0x100000000n+BigInt(x)),2),pid=[0],bounds=[0,0,0,0],name=Buffer.alloc(256);owner(h,pid);rect(h,bounds);className(h,name,128);bad.push({at:Date.now(),x,y,rgb,hwnd:h,pid:pid[0],bounds,class:name.toString('utf16le').split('\0')[0]});}},6);
setTimeout(()=>{clearInterval(timer);release(0,context);fs.writeFileSync(path.join(__dirname,'..','test-output','desktop-corner-sample.json'),JSON.stringify({frames,bad},null,2));console.log(JSON.stringify({frames,bad:bad.length,first:bad.slice(0,12)},null,2));},30000);
