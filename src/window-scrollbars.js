'use strict';
const path=require('node:path');
const {WebContentsView,ipcMain}=require('electron');
const edgeWindow=require('./window-edge');
const {thumbMetrics,scrollbarFrames}=require('./legacy/scrollbar-geometry');
class WindowScrollbars{
 constructor(window,target,geometry,beforeInput=()=>{},shapeChanged=()=>{},tabsTarget=null){
  Object.assign(this,{window,target,geometry,beforeInput,shapeChanged,bars:[],pending:false});
  this.tabSource=tabsTarget?{target:tabsTarget}:null;
  for(const key of ['vertical','horizontal',...(this.tabSource?['tabs']:[])]){
   const axis=key==='horizontal'?'horizontal':'vertical',source=key==='tabs'?this.tabSource:this;
   const url='flashborn://ui/edge-scrollbar.html#'+key,view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'edge-scrollbar-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
   view.setBackgroundColor('#00000000');view.setVisible(false);window.contentView.addChildView(view);const bar={key,axis,url,view,source};this.bars.push(bar);
   view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-navigate',e=>e.preventDefault());view.webContents.on('did-finish-load',()=>{bar.ready=true;this.layout();});view.webContents.loadURL(url);
  }
  this.input=(event,data)=>{const bar=this.bars.find(b=>b.view.webContents===event.sender&&event.senderFrame===event.sender.mainFrame&&event.senderFrame.url===b.url);if(!bar||!data||!Number.isFinite(data.position??data.delta))return;this.beforeInput();if(data.type==='wheel')this.scroll(bar,'delta',Math.max(-2000,Math.min(2000,data.delta)));else if(data.type==='down'){this.setActive(bar,true);bar.pressedAt=Date.now();this.down(bar,data.position);}else if(data.type==='move'&&bar.drag){bar.drag.lastEvent=Date.now();this.dragTo(bar,data.position);}else if(data.type==='up'){if(bar.drag)this.dragTo(bar,data.position);this.finish(bar);}};ipcMain.on('browser:edge-scroll',this.input);
  this.change=()=>{this.layout();this.refresh();};this.events=['show','resize','restore','maximize','unmaximize','enter-full-screen','leave-full-screen'];for(const e of this.events)window.on(e,this.change);
  this.timer=setInterval(()=>{this.refresh();if(this.tabSource)this.refresh(this.tabSource);for(const bar of this.bars){if(!bar.ready)continue;this.setHover(bar,bar.visible&&edgeWindow.hoveredView(window,bar.rect));if(bar.drag)this.drag(bar);else if(bar.active&&Date.now()-bar.pressedAt>1500&&!(edgeWindow.api().button(1)&0x8000))this.finish(bar);}},20);this.timer.unref();
 }
 async refresh(source=this){
  if(this.disposed||source.pending||this.window.isDestroyed()||!this.window.isVisible()||this.window.isMinimized())return;
  if(!this.bars.some(b=>b.source===source&&b.drag)&&Date.now()-(source.lastRead||0)<100)return;
  const target=source.target();if(!target)return;source.pending=true;source.lastRead=Date.now();
  try{const state=await target.run(this.script(null,source));if(!state||!['clientWidth','clientHeight','scrollWidth','scrollHeight','scrollLeft','scrollTop'].every(k=>Number.isFinite(state[k])&&state[k]>=0))return;if(source.target()?.id!==target.id)return;source.state=state;source.active=target.id;this.layout();}catch{}finally{source.pending=false;}
 }
 script(action,source=this){const target=source.target(),selector=target?.selector;return '('+function(selector,action){const e=selector?document.querySelector(selector):(document.scrollingElement||document.documentElement);if(!e)return null;if(action){const key=action.axis==='vertical'?'scrollTop':'scrollLeft';e[key]=action.mode==='delta'?e[key]+action.value:action.value;}return {clientWidth:e.clientWidth,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,scrollLeft:e.scrollLeft,scrollTop:e.scrollTop,...(selector==='#tabs'?{bounds:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()}:{} )};}.toString()+')('+JSON.stringify(selector||null)+','+JSON.stringify(action||null)+')';}
 async scroll(bar,mode,value){
  const source=bar.source,target=source.target();if(!target||!Number.isFinite(value))return;if(target.id!==source.active){this.finish(bar);return;}
  bar.next={axis:bar.axis,mode,value};if(bar.writing)return;bar.writing=true;
  try{while(bar.next&&!this.disposed){const action=bar.next;bar.next=null;const state=await target.run(this.script(action,source));if(state&&source.target()?.id===target.id){source.state=state;this.layout();}}}catch{}finally{bar.writing=false;}
 }
 setHover(bar,value){value=!!value;if(bar.hover===value)return;bar.hover=value;if(!bar.view.webContents.isDestroyed())bar.view.webContents.send('browser:scrollbar-hover',value);}
 setActive(bar,value){value=!!value;if(bar.active===value)return;bar.active=value;if(!bar.view.webContents.isDestroyed())bar.view.webContents.send('browser:scrollbar-active',value);}
 finish(bar){bar.drag=null;this.setHover(bar,!this.disposed&&bar.visible&&edgeWindow.hoveredView(this.window,bar.rect));this.setActive(bar,false);}
 layout(){
  if(this.disposed||this.window.isDestroyed())return;const g=this.geometry(),frame=edgeWindow.frame(this.window),frames=scrollbarFrames(frame,g.top,g.left,true);
  for(const bar of this.bars){
   const state=bar.source.state,vertical=bar.axis==='vertical',tabs=bar.key==='tabs',bounds=state?.bounds;
   const top=tabs?Math.round(Math.max(frame.y+40,Math.min(frame.y+frame.height-1,bounds?.y||frame.y+40))):0;
   const rect=tabs?{x:frame.x,y:top,width:15,height:Math.max(1,Math.round(Math.min(frame.y+frame.height-15,(bounds?.y||top)+(bounds?.height||0)))-top)}:frames[bar.axis];
   const needed=!!state&&(vertical?state.scrollHeight>state.clientHeight+1:state.scrollWidth>state.clientWidth+1)&&(!tabs||bounds?.height>0);
   bar.visible=!!(needed&&bar.ready);bar.rect=rect;bar.length=vertical?rect.height:rect.width;bar.view.setBounds(rect);bar.view.setVisible(bar.visible);
   if(!bar.visible){bar.drag=null;this.setHover(bar,false);this.setActive(bar,false);continue;}
   bar.view.webContents.send('browser:scrollbar-state',{...state,light:!!g.light});
  }
  this.shapeChanged();
 }
 down(bar,position){
  const state=bar.source.state;if(!state||!bar.length)return;const vertical=bar.axis==='vertical',m=thumbMetrics(bar.length,state[vertical?'clientHeight':'clientWidth'],state[vertical?'scrollHeight':'scrollWidth'],state[vertical?'scrollTop':'scrollLeft']);
  if(position<m.offset||position>m.offset+m.size){this.scroll(bar,'delta',(position<m.offset?-1:1)*state[vertical?'clientHeight':'clientWidth']*.9);return;}
  bar.drag={offset:position-m.offset,lastEvent:Date.now()};this.setActive(bar,true);
 }
 drag(bar){
  if(!(edgeWindow.api().button(1)&0x8000)&&Date.now()-bar.drag.lastEvent<1500)return;
  if(!(edgeWindow.api().button(1)&0x8000)||bar.source.target()?.id!==bar.source.active){this.finish(bar);return;}
  const b=edgeWindow.client(this.window),p=[0,0];edgeWindow.api().cursor(p);const position=bar.axis==='vertical'?(p[1]-b.y)/b.scale-bar.rect.y:(p[0]-b.x)/b.scale-bar.rect.x;this.dragTo(bar,position);
 }
 dragTo(bar,position){const state=bar.source.state;const vertical=bar.axis==='vertical',m=thumbMetrics(bar.length,state[vertical?'clientHeight':'clientWidth'],state[vertical?'scrollHeight':'scrollWidth'],0);this.scroll(bar,'absolute',Math.max(0,Math.min(m.travel,position-bar.drag.offset))/Math.max(1,m.travel)*m.max);}
 stackAbove(){}
 dispose(){this.disposed=true;clearInterval(this.timer);ipcMain.removeListener('browser:edge-scroll',this.input);for(const e of this.events)this.window.removeListener(e,this.change);for(const bar of this.bars){if(!this.window.isDestroyed())this.window.contentView.removeChildView(bar.view);if(!bar.view.webContents.isDestroyed())bar.view.webContents.close();}}
}
module.exports={WindowScrollbars};
