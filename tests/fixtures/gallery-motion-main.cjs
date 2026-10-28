'use strict';
const {app,BrowserWindow}=require('electron'),net=require('net'),fs=require('fs');
app.setPath('userData',process.env.GALLERY_QA_PROFILE);app.commandLine.appendSwitch('force-color-profile','srgb');app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.whenReady().then(function(){
 const win=new BrowserWindow({width:+process.env.GALLERY_QA_WIDTH||1440,height:+process.env.GALLERY_QA_HEIGHT||960,frame:false,show:false,webPreferences:{offscreen:process.env.GALLERY_QA_HIDDEN==='1',backgroundThrottling:false,nodeIntegration:false,contextIsolation:true}});
 win.webContents.on('console-message',function(event,level,message){process.stderr.write('RENDERER '+message+'\n');});
 const socket=net.connect(process.env.GALLERY_QA_CHANNEL);let buffer='';
 socket.on('data',function(chunk){buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const msg=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);handle(msg);}});
 async function handle(msg){try{let value;switch(msg.action){case 'evaluate':value=await win.webContents.executeJavaScript('(function(){try{return (0,eval)('+JSON.stringify(msg.code)+')}catch(e){return {__qaFailure:e.stack}}})()',true);if(value&&value.__qaFailure)throw Error(value.__qaFailure);break;case 'input':win.webContents.sendInputEvent(msg.input);break;case 'resize':win.setContentSize(msg.width,msg.height);break;case 'capture':fs.writeFileSync(msg.path,(await win.webContents.capturePage()).toPNG());break;case 'pixels':{
 const info=await win.webContents.executeJavaScript('(function(){return {width:innerWidth,height:innerHeight,cards:Array.from(document.querySelectorAll(".block[data-selected=true]")).map(function(e){var r=e.getBoundingClientRect();return {id:+e.dataset.id,x:r.left+r.width/2,y:r.top+r.height/2,color:getComputedStyle(e).backgroundColor.match(/\\d+/g).map(Number)};}).filter(function(c){return c.x>0&&c.x<innerWidth&&c.y>0&&c.y<innerHeight;})};})()');
 const image=(await win.webContents.capturePage()).resize({width:info.width,height:info.height}),bytes=image.toBitmap({scaleFactor:1}),scale=Math.sqrt(bytes.length/(info.width*info.height*4)),stride=Math.round(info.width*scale);
 value={cards:info.cards.map(function(c){var k=(Math.floor(c.y*scale)*stride+Math.floor(c.x*scale))*4,rgb=[bytes[k+2],bytes[k+1],bytes[k]];return {id:c.id,rgb:rgb,expected:c.color,error:Math.max.apply(Math,rgb.map(function(v,i){return Math.abs(v-c.color[i]);}))};})};break;
 }case 'exit':socket.write(JSON.stringify({id:msg.id,value:true})+'\n');app.exit(0);return;}socket.write(JSON.stringify({id:msg.id,value:value})+'\n');}catch(e){socket.write(JSON.stringify({id:msg.id,error:e.stack})+'\n');}}
 win.webContents.on('did-finish-load',function(){if(process.env.GALLERY_QA_HIDDEN!=='1')win.showInactive();socket.write(JSON.stringify({ready:true,versions:process.versions})+'\n');});
 win.loadFile(process.env.GALLERY_QA_HTML);
});
