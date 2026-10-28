'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,check){let value;const until=Date.now()+20000;do{value=await read();if(check(value))return value;await wait(40);}while(Date.now()<until);throw Error(JSON.stringify(value));}
(async()=>{
 const profile=path.join(out,'support-page-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
 const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app,ui;const passed=[],pass=s=>{passed.push(s);console.log('PASS '+s);};
 const launch=async()=>{app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env});await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);ui=await app.firstWindow();await app.evaluate(({shell})=>{const w=global.__flashborn.win;w.setBounds({x:60,y:60,width:1360,height:940});w.show();w.focus();global.supportOpened=[];shell.openExternal=async url=>global.supportOpened.push(url);});};
 const state=()=>app.evaluate(()=>global.__flashborn.getState());
 const command=(action,args={})=>app.evaluate(({},v)=>global.__flashborn.command(v.action,v.args),{action,args});
 const menu=async()=>{await ui.locator('#menu-button').click();await poll(()=>app.evaluate(()=>global.__flashborn.menuWindow?.isVisible()),Boolean);return app.windows().find(w=>w.url().endsWith('/menu.html'));};
 try{
  await launch();const button=ui.locator('.sidebar-bottom [data-panel="support"]'),coin=button.locator('canvas');
  assert.equal(await ui.locator('.sidebar-bottom [data-panel="settings"]').count(),0);assert.equal(await button.innerText(),'Support Flashborn');
  await command('panel',{name:'about'});assert.equal(await ui.getByText('Buy me a coffee',{exact:true}).count(),0);assert.equal(await ui.locator('.support-section').count(),0);
  assert.equal(await ui.locator('.about-text > :last-child').getAttribute('data-panel'),'support');
  await ui.locator('.about-support-link').click();await ui.locator('#support-payment').waitFor();assert.equal((await state()).panel,'support');
  assert.match(await ui.locator('#support-intro').innerText(),/first donation.*I’ve donated.*sidebar Support tab/s);
  assert.equal(await ui.locator('.support-methods button:disabled').count(),3);
  assert.equal(await ui.locator('[data-support-amount="5"]').evaluate(el=>getComputedStyle(el).borderRadius),'50%');
  assert.equal(await ui.locator('.support-other-pill').evaluate(el=>getComputedStyle(el).borderRadius),'999px');
  await ui.locator('.title-note').hover();await wait(1800);await button.hover();await wait(150);
  assert.equal(await coin.getAttribute('data-motion'),'spinning');const during=Number(await coin.getAttribute('data-progress'));assert.ok(during>0&&during<1);
  await wait(1800);assert.equal(await coin.getAttribute('data-motion'),'idle');assert.equal(await coin.getAttribute('data-rotation'),'360.00');
  const still=await coin.evaluate(el=>el.toDataURL());await wait(200);assert.equal(await coin.evaluate(el=>el.toDataURL()),still);
  const ink=await coin.evaluate(el=>{const p=el.getContext('2d').getImageData(0,0,el.width,el.height).data;let n=0;for(let i=3;i<p.length;i+=4)if(p[i])n++;return n/(el.width*el.height);});assert.ok(ink>.1&&ink<.6,'Coin must be an outline: '+ink);
  pass('Sidebar Settings is replaced, About has only a bottom Support link, and the gold outline coin makes exactly one full turn while hovered');
  await ui.locator('.title-note').hover();
  await ui.evaluate(()=>navigationIcons.find(i=>i.kind==='support').setReminderEnabled(false));await ui.clock.install();
  await ui.evaluate(()=>navigationIcons.find(i=>i.kind==='support').setReminderEnabled(true));
  await ui.clock.fastForward(59900);assert.equal(await coin.getAttribute('data-motion'),'idle');
  await ui.clock.runFor(200);assert.equal(await coin.getAttribute('data-motion'),'spinning');
  await ui.clock.runFor(1800);assert.equal(await coin.getAttribute('data-motion'),'idle');
  await ui.emulateMedia({reducedMotion:'reduce'});await ui.clock.runFor(64);await ui.clock.fastForward(60000);assert.notEqual(await coin.getAttribute('data-motion'),'spinning');
  await ui.emulateMedia({reducedMotion:'no-preference'});pass('A minute starts one reminder turn, which finishes and respects reduced motion');
  for(const theme of ['current','light']){
   if((await state()).settings.theme!==theme)await command('theme');
   for(const width of [1360,800]){await app.evaluate(({},w)=>global.__flashborn.win.setSize(w,940),width);await wait(100);assert.equal(await ui.locator('.support-panel').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
   await app.evaluate(()=>global.__flashborn.win.setSize(1360,940));await ui.screenshot({path:path.join(out,'support-page-'+theme+'.png')});
  }
  const custom=ui.locator('.support-other input');await custom.fill('12.50');await custom.press('Enter');assert.equal(await ui.locator('.support-other-pill').getAttribute('data-selected'),'true');
  fs.writeFileSync(path.join(profile,'support-links.json'),JSON.stringify({paypal:{'one-time':'https://paypal.me/example'},venmo:{'one-time':'https://venmo.com/example'}}));
  await command('panel',{name:'support'});await poll(()=>ui.locator('[data-support-provider="paypal"]').isEnabled(),Boolean);await ui.locator('[data-support-provider="paypal"]').click();
  await poll(()=>app.evaluate(()=>global.supportOpened.length),n=>n===1);assert.equal((await app.evaluate(()=>global.supportOpened))[0],'https://paypal.me/example/12.50USD');assert.equal((await state()).supporter,false);assert.equal(await button.isVisible(),true);
  await ui.locator('[name="support-frequency"][value="monthly"]').check();assert.equal(await ui.locator('[data-support-provider="venmo"]').isDisabled(),true);
  pass('Payment controls retain custom amounts and frequency checks in both themes; opening checkout does not mark a donation complete');
  let popup=await menu();assert.equal(await popup.locator('.browser-menu > button:last-child').getAttribute('data-panel'),'support');
  await popup.locator('[data-panel="settings"]:not([data-section])').click();await ui.locator('#tab-limit').waitFor();assert.equal((await state()).panel,'settings');
  popup=await menu();await popup.locator('[data-panel="support"]').click();await ui.locator('#support-payment').waitFor();
  await ui.locator('[data-support-confirm]').click();await poll(state,s=>s.supporter);assert.equal(await button.isHidden(),true);assert.equal(await coin.getAttribute('data-reminder'),'stopped');
  await ui.clock.fastForward(120000);assert.equal(await coin.getAttribute('data-motion'),'idle');assert.equal(await ui.locator('.support-thanks').isVisible(),true);
  await command('panel',{name:'about'});await ui.locator('.about-support-link').click();await ui.locator('#support-payment').waitFor();assert.equal(await ui.locator('[data-support-confirm]').isHidden(),true);
  await command('new-flashcognito');assert.equal(await button.isHidden(),true);await command('panel',{name:'support'});assert.match(await ui.locator('#support-intro').innerText(),/Thank you/);
  pass('Settings remains in the menu; Support is last below About; confirmation hides only the sidebar tab, stops reminders and retains About/menu access in regular/private tabs');
  await app.close();app=null;await launch();assert.equal((await state()).supporter,true);assert.equal(await ui.locator('.sidebar-bottom [data-panel="support"]').isHidden(),true);
  popup=await menu();await popup.locator('[data-panel="support"]').click();await ui.locator('#support-payment').waitFor();assert.equal(await ui.locator('.support-thanks').isVisible(),true);
  pass('Supporter confirmation and the hidden sidebar tab survive restart');
  fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-support-page-results.json':'support-page-results.json'),JSON.stringify({passed,profile},null,2));
 }finally{if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
