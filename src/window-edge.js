'use strict';
const {screen}=require('electron');
let bindings;
const handle=w=>Number(w.getNativeWindowHandle().readBigUInt64LE());
function api(){
 if(bindings)return bindings;
 const k=require('koffi'),u=k.load('user32.dll'),d=k.load('dwmapi.dll');
 return bindings={release:u.func('int __stdcall ReleaseCapture()'),restoreAsync:u.func('int __stdcall ShowWindowAsync(intptr_t,int)'),origin:u.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)'),client:u.func('int __stdcall GetClientRect(intptr_t,_Out_ int32_t*)'),position:u.func('int __stdcall SetWindowPos(intptr_t,intptr_t,int,int,int,int,uint32_t)'),sibling:u.func('intptr_t __stdcall GetWindow(intptr_t,uint32_t)'),attribute:d.func('int __stdcall DwmSetWindowAttribute(intptr_t,uint32_t,_In_ uint32_t*,uint32_t)'),cursor:u.func('int __stdcall GetCursorPos(_Out_ int32_t*)'),button:u.func('int16_t __stdcall GetAsyncKeyState(int)'),at:u.func('intptr_t __stdcall WindowFromPoint(uint64_t)'),ancestor:u.func('intptr_t __stdcall GetAncestor(intptr_t,uint32_t)')};
}
function client(window){const origin=[0,0],rect=[0,0,0,0];api().origin(handle(window),origin);api().client(handle(window),rect);return {x:origin[0],y:origin[1],width:rect[2],height:rect[3],scale:screen.getDisplayMatching(window.getBounds()).scaleFactor};}
function place(popup,rect,scale=1){
 api().position(handle(popup),0,Math.round(rect.x),Math.round(rect.y),Math.round(rect.width),Math.round(rect.height),0x414);
 const shape={x:0,y:0,width:Math.max(1,Math.round(rect.width/scale)),height:Math.max(1,Math.round(rect.height/scale))};
 const key=JSON.stringify(shape);if(key!==popup.edgeShape){popup.edgeShape=key;popup.setShape([shape]);}
 if(!popup.isVisible())popup.showInactive();
}
function hovered(popup){if(popup.isDestroyed()||!popup.isVisible())return false;const hwnd=handle(popup),p=[0,0];api().cursor(p);const packed=(BigInt(p[1]>>>0)<<32n)|BigInt(p[0]>>>0);return Number(api().ancestor(api().at(packed),2))===hwnd;}
function stackAbove(popup,movie){
 if(!movie||popup.isDestroyed()||!popup.isVisible())return;
 const hwnd=handle(popup);for(let next=api().sibling(hwnd,2),i=0;next&&i<2048;next=api().sibling(next,2),i++)if(Number(next)===movie)return;
 api().position(hwnd,api().sibling(movie,3),0,0,0,0,0x213);
}
function unframe(popup){for(const id of [2,3,33])api().attribute(handle(popup),id,[1],4);popup.browserCorner=true;}
function hoveredView(window,rect){if(!rect||window.isDestroyed()||!window.isVisible()||window.isMinimized())return false;const p=[0,0],b=client(window);api().cursor(p);const x=(p[0]-b.x)/b.scale,y=(p[1]-b.y)/b.scale;if(x<rect.x||y<rect.y||x>=rect.x+rect.width||y>=rect.y+rect.height)return false;const packed=(BigInt(p[1]>>>0)<<32n)|BigInt(p[0]>>>0);return Number(api().ancestor(api().at(packed),2))===handle(window);}
function frame(window){const [width,height]=window.getContentSize();if(window.isFullScreen()||!window.isMaximized())return {x:0,y:0,width,height};const b=window.getBounds(),area=screen.getDisplayMatching(b).workArea,x=Math.max(0,Math.round(area.x-b.x)),y=Math.max(0,Math.round(area.y-b.y));return {x,y,width:Math.max(1,Math.min(width-x,Math.round(area.width))),height:Math.max(1,Math.min(height-y,Math.round(area.height)))};}
module.exports={api,handle,client,frame,place,hovered,hoveredView,stackAbove,unframe};
