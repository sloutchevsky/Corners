'use strict';
const path=require('node:path');
const {WebContentsView,ipcMain,screen}=require('electron');
const {cornerFrame,dragBounds,restoreAtCorner}=require('./legacy/resize-corner');
const edgeWindow=require('./window-edge');
class WindowCorner{
 constructor(window,beforeResize,inside=()=>window.isMaximized()||window.isFullScreen(),edge='bottom-right',restore=()=>window.setFullScreen(false)){
  Object.assign(this,{window,beforeResize,inside,edge,restore,url:'flashborn://ui/corner.html#'+edge});
  this.view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'corner-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,spellcheck:false,backgroundThrottling:false}});
  this.view.setBackgroundColor('#00000000');window.contentView.addChildView(this.view);
  const wc=this.view.webContents;wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',e=>e.preventDefault());
  this.listener=(event,data)=>{
   if(event.sender!==wc||event.senderFrame!==wc.mainFrame||event.senderFrame.url!==this.url)return;
   const action=typeof data==='string'?data:data?.action;let point=data?.point;
   if(point?.x===0&&point?.y===0&&Number.isFinite(data?.client?.x)&&Number.isFinite(data?.client?.y)){const origin=window.getContentBounds();point={x:origin.x+this.rect.x+data.client.x,y:origin.y+this.rect.y+data.client.y};}
   if(point&&(!Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.abs(point.x)>100000||Math.abs(point.y)>100000))return;
   if(process.env.FLASHBORN_TEST==='1'){this.testInputs||=[];this.testInputs.push({action,point});if(this.testInputs.length>40)this.testInputs.shift();}
   if(action==='restore'){this.finish();if(this.inside())this.undock(point||screen.getCursorScreenPoint());}
   else if(action==='down')this.begin(point);
   else if(action==='move'&&this.drag){this.drag.lastEvent=Date.now();this.step(point,true);}
   else if(action==='up'&&this.drag){this.step(point,true);this.finish();}
   else if((action==='released'||action==='cancel')&&this.drag)this.drag.captureReleased=true;
   else if(action==='leave')this.setHover(false);
  };
  ipcMain.on('browser:resize-corner',this.listener);
  wc.on('did-finish-load',()=>{this.ready=true;this.setTheme(this.light);this.layout();});
  this.onGeometry=()=>this.layout();this.events=['show','resize','restore','maximize','unmaximize','enter-full-screen','leave-full-screen'];for(const event of this.events)window.on(event,this.onGeometry);
  this.watch=setInterval(()=>{if(!this.ready||this.disposed||window.isDestroyed())return;try{
   if(this.pendingRestore&&window.isMaximized()&&!window.isFullScreen()&&Date.now()-(this.restoreSent||0)>150){this.restoreSent=Date.now();window.unmaximize();}
   if(this.pendingRestore&&!this.inside()){const target=this.pendingRestore.bounds;this.pendingRestore=null;window.setBounds(target);this.layout();}
   if(this.drag){const down=!!(edgeWindow.api().button(1)&0x8000);if(down||this.drag.captureReleased||Date.now()-this.drag.lastEvent>1500)this.step(screen.getCursorScreenPoint(),down);}
   this.setHover(edgeWindow.hoveredView(window,this.rect));
  }catch(error){if(process.env.FLASHBORN_TEST==='1')console.error('CORNER WATCH',error.stack);this.finish();}},12);this.watch.unref();wc.loadURL(this.url);
 }
 begin(point=screen.getCursorScreenPoint()){if(this.drag||this.window.isDestroyed())return;this.beforeResize();this.setResizing(true);point={x:Math.round(point.x),y:Math.round(point.y)};const origin=this.window.getBounds(),frame={x:origin.x+this.rect.x,y:origin.y+this.rect.y};this.drag={point,lastEvent:Date.now(),bounds:this.window.getBounds(),docked:this.inside(),offset:{x:point.x-frame.x,y:point.y-frame.y},started:false};}
 undock(point,offset={x:20,y:20}){
  point={x:Math.round(point.x),y:Math.round(point.y)};const normal=this.lastNormal||this.window.getNormalBounds(),work=screen.getDisplayNearestPoint(point).workArea;
  this.view.webContents.send('browser:corner-release');edgeWindow.api().release();this.restore();if(this.window.isMaximized())setImmediate(()=>{if(!this.window.isDestroyed())this.window.unmaximize();});
  const bounds=restoreAtCorner(normal,point,offset,this.edge,work,this.window.getMinimumSize());this.pendingRestore={bounds};this.layout();return bounds;
 }
 step(point,down){
  const drag=this.drag;if(!drag||this.window.isDestroyed())return;if(!down){this.finish();return;}
  if(!drag.started){if(Math.hypot(point.x-drag.point.x,point.y-drag.point.y)<3)return;drag.started=true;if(drag.docked){drag.bounds=this.undock(point,drag.offset);drag.point=point;}this.setResizing(true);}
  const bounds=dragBounds(drag.bounds,{x:point.x-drag.point.x,y:point.y-drag.point.y},this.edge,this.window.getMinimumSize());
  if(this.pendingRestore)this.pendingRestore.bounds=bounds;else {const b=this.window.getBounds();if(['x','y','width','height'].some(k=>bounds[k]!==b[k]))this.window.setBounds(bounds);}
 }
 finish(){
  this.drag=null;
  // Resolve hover before releasing the drag latch so mouse-up inside the hit
  // target never starts a one-frame retraction before the next hover poll.
  let hover=false;
  if(!this.disposed&&!this.window.isDestroyed())try{hover=edgeWindow.hoveredView(this.window,this.rect);}catch{}
  this.setHover(hover);this.setResizing(false);
 }
 setHover(value){if(this.hover===value)return;this.hover=value;if(!this.view.webContents.isDestroyed())this.view.webContents.send('browser:corner-hover',!!value);}
 raise(){if(this.window.isDestroyed())return;const views=this.window.contentView.children;if(views.at(-1)!==this.view)this.window.contentView.addChildView(this.view);}
 layout(){if(this.disposed||this.window.isDestroyed())return;this.rect=cornerFrame(edgeWindow.frame(this.window),true,this.edge);this.view.setBounds(this.rect);this.view.setVisible(!!this.ready);this.raise();if(!this.inside()&&!this.pendingRestore)this.lastNormal=this.window.getBounds();}
 setTheme(light){this.light=!!light;if(!this.view.webContents.isDestroyed())this.view.webContents.send('browser:corner-theme',this.light);}
 stackAbove(){}
 setResizing(value){if(!this.view.webContents.isDestroyed())this.view.webContents.send('browser:resize-state',!!value);}
 dispose(){this.disposed=true;clearInterval(this.watch);this.finish();ipcMain.removeListener('browser:resize-corner',this.listener);for(const event of this.events)this.window.removeListener(event,this.onGeometry);if(!this.window.isDestroyed())this.window.contentView.removeChildView(this.view);if(!this.view.webContents.isDestroyed())this.view.webContents.close();}
}
module.exports={WindowCorner};
