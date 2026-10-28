'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, check) {
  const until = Date.now() + 20000; let value;
  do { value = await read(); if (check(value)) return value; await wait(40); } while (Date.now() < until);
  throw Error(JSON.stringify(value));
}
(async () => {
  const profile = path.join(out, 'menu-selection-' + Date.now()); fs.mkdirSync(profile, { recursive:true });
  fs.writeFileSync(path.join(profile, 'browser.json'), JSON.stringify({settings:{adBlockEnabled:false}}));
  const env = {...process.env, FLASHBORN_TEST:'1', FLASHBORN_PROFILE:profile}; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({executablePath:process.env.FLASHBORN_EXE || require('electron'), args:process.env.FLASHBORN_EXE ? [] : [root], env});
  const passed = [], pass = text => {passed.push(text); console.log('PASS ' + text);};let lastPlacement;
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    await app.evaluate(() => {const w=global.__flashborn.win;w.setBounds({x:70,y:70,width:1250,height:900});w.show();w.focus();});
    const command = (action,args={}) => app.evaluate(({},data) => global.__flashborn.command(data.action,data.args),{action,args});
    const open = async () => {
      await ui.locator('#menu-button').click();
      await poll(() => app.evaluate(() => !!global.__flashborn.menuWindow?.isVisible() && global.__flashborn.menuMotion?.progress === 1), Boolean);
      const placement=await app.evaluate(()=>({host:global.__flashborn.win.getContentBounds(),menu:global.__flashborn.menuWindow.getBounds()}));
      const physical=await app.evaluate(({},module)=>{
        const f=global.__flashborn,k=process.mainModule.require(module),u=k.load('user32.dll'),rect=u.func('int __stdcall GetWindowRect(intptr_t,_Out_ int32_t*)'),client=u.func('int __stdcall GetClientRect(intptr_t,_Out_ int32_t*)'),origin=u.func('int __stdcall ClientToScreen(intptr_t,_Inout_ int32_t*)');
        const host=Number(f.win.getNativeWindowHandle().readBigUInt64LE()),menu=Number(f.menuWindow.getNativeWindowHandle().readBigUInt64LE()),p=[0,0],area=[0,0,0,0],r=[0,0,0,0];origin(host,p);client(host,area);rect(menu,r);
        const scale=process.mainModule.require('electron').screen.getDisplayMatching(f.win.getBounds()).scaleFactor;
        return {right:p[0]+area[2],top:p[1]+Math.round(100*scale),bottom:p[1]+area[3]-Math.round(24*scale),menu:r};
      },require.resolve('koffi'));
      assert.equal(physical.menu[1],physical.top,JSON.stringify({placement,physical}));
      assert.equal(physical.menu[2],physical.right,JSON.stringify({placement,physical}));
      lastPlacement=physical;
      const page=app.windows().find(window => window.url().endsWith('/menu.html'));
      await page.emulateMedia({reducedMotion:'no-preference'});
      return page;
    };
    const inspect = popup => popup.evaluate(() => {
      const nav=document.querySelector('.browser-menu'),r=nav.getBoundingClientRect(),s=getComputedStyle(nav,'::before');
      return {x:r.x+parseFloat(s.left),width:parseFloat(s.width),y:r.y+new DOMMatrix(s.transform).m42,height:parseFloat(s.height),opacity:+s.opacity,radius:s.borderRadius,transition:s.transitionProperty,windowWidth:innerWidth,
        selection:{hovered:hoveredRow?.dataset,selected:selectedRow?.dataset,clicked:clickedRow?.dataset,keyboard:keyboardButton?.dataset},
        buttons:[...nav.querySelectorAll('button')].map(button => ({radius:getComputedStyle(button).borderRadius,background:getComputedStyle(button).backgroundColor}))};
    });
    const aligned = async (popup,selector) => {
      await wait(240);const value=await inspect(popup),target=await popup.locator(selector).boundingBox();
      assert.equal(value.opacity,1);assert.equal(value.x,0);assert.equal(value.width,value.windowWidth);assert.equal(value.radius,'0px');
      assert.ok(Math.abs(value.y-target.y)<.5,JSON.stringify({selector,value,target}));assert.ok(Math.abs(value.height-target.height)<.5);assert.ok(value.buttons.every(b=>b.radius==='0px'));
      return value;
    };
    for(const theme of ['current','light']) {
      if(await app.evaluate(()=>global.__flashborn.getState().settings.theme)!==theme)await command('theme');
      const popup=await open();
      const decoration=await popup.evaluate(()=>{const s=getComputedStyle(document.body);return {shadow:s.boxShadow,border:s.borderWidth,outline:s.outlineStyle};});
      assert.deepEqual(decoration,{shadow:'none',border:'0px',outline:'none'});
      assert.equal(await app.evaluate(()=>global.__flashborn.menuWindow.hasShadow()),false);
      const corner = await app.evaluate(({},module)=>{
        const k=process.mainModule.require(module),dwm=k.load('dwmapi.dll'),get=dwm.func('int __stdcall DwmGetWindowAttribute(intptr_t,uint32_t,_Out_ int32_t*,uint32_t)'),value=[0];
        const h=Number(global.__flashborn.menuWindow.getNativeWindowHandle().readBigUInt64LE());return {result:get(h,33,value,4),preference:value[0]};
      },require.resolve('koffi'));
      assert.equal(corner.result,0);assert.equal(corner.preference,1,'Windows must not round popup corners');
      await popup.locator('[data-action="new-tab"]').hover();const from=(await aligned(popup,'[data-action="new-tab"]')).y;
      const target=await popup.locator('[data-panel="settings"]:not([data-section])').boundingBox();
      await popup.mouse.move(target.x+30,target.y+15);await wait(35);const during=await inspect(popup);
      assert.ok(during.y>from && during.y<target.y,JSON.stringify({from,target,during}));
      await aligned(popup,'[data-panel="settings"]:not([data-section])');
      await popup.mouse.move(4,1);await wait(140);assert.equal((await inspect(popup)).opacity,0);
      await popup.locator('[data-quality="medium"]').click();
      await popup.mouse.move(4,1);await aligned(popup,'.menu-control-row:has(.quality-buttons)');
      await popup.locator('[data-panel="history"]').hover();await aligned(popup,'[data-panel="history"]');
      await popup.mouse.move(4,1);await aligned(popup,'.menu-control-row:has(.quality-buttons)');
      await ui.keyboard.press('ArrowDown');await aligned(popup,'[data-action="new-tab"]');
      await popup.screenshot({path:path.join(out,'menu-selection-'+theme+'.png')});
      await popup.emulateMedia({reducedMotion:'reduce'});
      await popup.locator('[data-panel="about"]').hover();assert.equal((await aligned(popup,'[data-panel="about"]')).transition,'none');
      await ui.keyboard.press('Escape');
      await poll(()=>app.evaluate(()=>!global.__flashborn.menuWindow),Boolean);
      assert.equal(await ui.locator('#menu-button').evaluate(el=>getComputedStyle(el).outlineStyle),'none','Returning keyboard focus must not outline the menu button');
      pass(theme+': no popup outline or shadow, square native corners, edge-to-edge animated hover, click/rollout selection, keyboard and reduced motion');
    }
    await command('panel',{name:'bookmarks'});const popup=await open();
    // The cached popup keeps Playwright's last synthetic pointer position.
    // Move off the rows before checking the selected page's resting highlight.
    await popup.mouse.move(4,1);await aligned(popup,'[data-panel="bookmarks"]');
    await popup.locator('[data-panel="about"]').hover();await aligned(popup,'[data-panel="about"]');
    await popup.mouse.move(4,1);await aligned(popup,'[data-panel="bookmarks"]');
    pass('Opening from a special page selects that row and restores it after hovering another option');
    await ui.keyboard.press('Escape');await poll(()=>app.evaluate(()=>!global.__flashborn.menuWindow),Boolean);
    await app.evaluate(()=>global.__flashborn.win.setSize(1000,560));
    const compact=await open();
    const bounds=await app.evaluate(()=>({host:global.__flashborn.win.getContentBounds(),menu:global.__flashborn.menuWindow.getBounds()}));
    assert.ok(lastPlacement.menu[3]<=lastPlacement.bottom,JSON.stringify(lastPlacement));
    assert.equal(await compact.locator('.browser-menu > button:last-child').getAttribute('data-panel'),'support');
    await compact.locator('[data-panel="support"]').scrollIntoViewIfNeeded();
    const support=await compact.locator('[data-panel="support"]').boundingBox();
    assert.ok(support.y>=0 && support.y+support.height<=bounds.menu.height);
    pass('Short windows keep the popup below the frame, flush right and within the content area, with the last Support item reachable by scrolling');
    fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-menu-selection-results.json':'menu-selection-results.json'),JSON.stringify({passed,profile},null,2));
  } finally {await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
