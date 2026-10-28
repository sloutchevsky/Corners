'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-output'), wait = ms => new Promise(r => setTimeout(r, ms));
async function poll(read, check) {
  const end = Date.now() + 25000; let value;
  do { value = await read(); if (check(value)) return value; await wait(60); } while (Date.now() < end);
  throw Error(JSON.stringify(value));
}
(async () => {
  const profile = path.join(out, 'desktop-artifact-' + Date.now()); fs.mkdirSync(profile, { recursive:true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({ settings:{ adBlockEnabled:false } }));
  const env = { ...process.env, FLASHBORN_TEST:'1', FLASHBORN_PROFILE:profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath:process.env.FLASHBORN_EXE || require('electron'), args:process.env.FLASHBORN_EXE ? [] : [root], env });
  const k = require('koffi'), u = k.load('user32.dll'), g = k.load('gdi32.dll');
  const dc = u.func('intptr_t __stdcall GetDC(intptr_t)'), release = u.func('int __stdcall ReleaseDC(intptr_t,intptr_t)'), pixel = g.func('uint32_t __stdcall GetPixel(intptr_t,int,int)');
  const at = u.func('intptr_t __stdcall WindowFromPoint(uint64_t)'), ancestor = u.func('intptr_t __stdcall GetAncestor(intptr_t,uint32_t)'), owner = u.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t,_Out_ uint32_t*)');
  const rect = u.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'), className = u.func('int __stdcall GetClassNameW(intptr_t,_Out_ uint16_t*,int)');
  const frame = [], bad = [], samples = [], color = [19,73,97], context = dc(0); let timer, phase = 'calibration';
  const desktop = process.env.FLASHBORN_ARTIFACT_DESKTOP === '1';
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    await app.evaluate(async ({ BrowserWindow }, desktop) => {
      if (!desktop) {
        const b = global.__artifactBackdrop = new BrowserWindow({ x:0,y:0,width:600,height:600,frame:false,thickFrame:false,show:false,skipTaskbar:true,backgroundColor:'#134961',webPreferences:{sandbox:true} });
        await b.loadURL('data:text/html,<style>html{background:rgb(19,73,97)}</style><title>Owned artifact test backdrop</title>'); b.show();
      }
      const w = global.__flashborn.win; w.setBounds({x:650,y:100,width:1100,height:850}); w.show(); w.focus();
    },desktop);
    if (desktop) { const v=pixel(context,15,15); color.splice(0,3,v&255,v>>>8&255,v>>>16&255); }
    const capture = () => {
      for (const [x,y] of [[15,15],[70,55],[180,120],[340,240]]) {
        const v = pixel(context,x,y), rgb = [v&255,v>>>8&255,v>>>16&255];
        if (rgb.some((v,i) => Math.abs(v-color[i])>3)) {
          const target = at(BigInt(y)*0x100000000n+BigInt(x)), h = ancestor(target,2), pid=[0], bounds=[0,0,0,0], name=Buffer.alloc(256);
          owner(h,pid); rect(h,bounds); className(h,name,128);
          bad.push({at:Date.now(),phase,x,y,rgb,target,hwnd:h,pid:pid[0],bounds,class:name.toString('utf16le').split('\0')[0]});
        }
      }
      frame.push({at:Date.now(),phase});
    };
    await wait(350); capture(); assert.equal(bad.length,0,'Owned backdrop must be visible before starting');
    timer = setInterval(capture,8);
    for (let i=0;i<4;i++) {
      const file=path.join(profile,'modern-'+i+'.html'); fs.writeFileSync(file,'<!doctype html><title>Modern '+i+'</title><style>body{background:#fff}</style><h1>Modern page '+i+'</h1>');
      if(i)await app.evaluate(()=>global.__flashborn.command('new-tab',{}));
      await app.evaluate(({},file)=>global.__flashborn.openLocal(file,global.__flashborn.activeTab()),file);
    }
    for (let i=0;i<3;i++) {
      await app.evaluate(() => global.__flashborn.command('new-tab',{}));
      await app.evaluate(({},file) => global.__flashborn.openLocal(file,global.__flashborn.activeTab()),require('./html-fixture')(path.join(profile,'movie-'+i),require('./playback-fixture')));
      await poll(() => app.evaluate(() => global.__flashborn.activeTab().native?.isPresented()),Boolean);
    }
    for (let i=0;i<6;i++) {
      phase = 'collapse-'+i;
      await app.evaluate(() => global.__flashborn.command('collapse',{})); await wait(260);
      samples.push(await app.evaluate(() => global.__flashborn.tabs.filter(t=>t.native).map(t=>({pid:t.native.child.pid,viewport:t.native.viewport,expected:t.native.lastBounds,actual:t.native.inspect().rect,wanted:t.native.wantedVisible}))));
    }
    phase = 'resize';
    for (let i=0;i<28;i++) {
      await app.evaluate(({},i) => global.__flashborn.win.setSize(1100+i*33,850+i*17),i); await wait(12);
    }
    await wait(400);
    const report = { profile, frames:frame.length, bad, samples };
    fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-desktop-artifact-results.json':'desktop-artifact-results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({frames:frame.length,bad:bad.length,first:bad.slice(0,8)},null,2));
    assert.equal(bad.length,0,'No Flashborn surface may paint on the owned desktop backdrop during collapse or resize');
  } finally { clearInterval(timer); release(0,context); await app.evaluate(({app}) => app.exit(0)).catch(()=>{}); }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
