'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,check){const end=Date.now()+15000;let value;do{value=await read();if(check(value))return value;await wait(30);}while(Date.now()<end);throw Error(JSON.stringify(value));}
(async()=>{
  const profile=path.join(out,'page-fields-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
  const env={...process.env,FLASHBORN_TEST:'1',FLASHBORN_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:process.env.FLASHBORN_EXE||require('electron'),args:process.env.FLASHBORN_EXE?[]:[root],env}),passed=[];
  const command=(action,args={})=>app.evaluate(({},v)=>global.__flashborn.command(v.action,v.args),{action,args});
  try{
    await poll(()=>app.evaluate(()=>!!global.__flashborn),Boolean);const ui=await app.firstWindow();
    await app.evaluate(()=>{const w=global.__flashborn.win;w.setBounds({x:70,y:70,width:1360,height:1000});w.show();w.focus();});
    const check=async(selector,input=selector)=>{
      const field=ui.locator(selector);await field.waitFor();await ui.locator('#menu-button').focus();
      const theme=await app.evaluate(()=>global.__flashborn.getState().settings.theme);
      const background=theme==='light'?'rgb(204, 204, 204)':'rgb(51, 51, 51)',focusBackground=theme==='light'?'rgb(255, 255, 255)':'rgb(77, 77, 77)';
      const style=()=>field.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,width:s.borderWidth,outline:s.outlineStyle,shadow:s.boxShadow,radius:s.borderRadius,rect:el.getBoundingClientRect().toJSON()};});
      await poll(style,s=>s.background===background);const resting=await style();assert.equal(resting.width,'0px',selector);assert.equal(resting.outline,'none',selector);assert.equal(resting.shadow,'none',selector);
      assert.equal(await field.evaluate(el=>{let opacity=1;for(let node=el;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);return opacity;}),1,selector+' must not inherit dimming from a private page');
      await ui.locator(input).focus();await poll(style,s=>s.background===focusBackground);const focused=await style();assert.equal(focused.width,'0px',selector);assert.equal(focused.outline,'none',selector);assert.equal(focused.shadow,'none',selector);assert.equal(focused.radius,resting.radius);assert.deepEqual(focused.rect,resting.rect,selector+' must not move or resize on focus');
      if(input!==selector){const child=await ui.locator(input).evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,outline:s.outlineStyle,shadow:s.boxShadow};});assert.deepEqual(child,{background:'rgba(0, 0, 0, 0)',outline:'none',shadow:'none'},input);}
      await ui.locator('#menu-button').focus();await poll(style,s=>s.background===background);
    };
    for(const theme of ['current','light']){
      if(await app.evaluate(()=>global.__flashborn.getState().settings.theme)!==theme)await command('theme');
      await command('select-tab',{id:await app.evaluate(()=>global.__flashborn.tabs.find(tab=>!tab.private).id)});
      for(const name of ['bookmarks','history']){await command('panel',{name});await check('#filter');}
      await command('panel',{name:'settings'});await check('#search-engine');
      await command('panel',{name:'support'});await check('.support-other-pill','.support-other input');assert.equal(await ui.locator('.support-other-pill').evaluate(el=>getComputedStyle(el).borderRadius),'999px');
      await command('new-tab');await check('.search-box','#home-input');
      await command('new-flashcognito');await check('.search-box','#home-input');
      await check('.address','#address');
      await ui.locator('#find-form').evaluate(el=>el.classList.remove('hidden'));await check('.find','#find-input');await ui.locator('#find-close').click();
      await ui.screenshot({path:path.join(out,'fields-'+theme+'-1.14.17.png')});
      passed.push(theme+': URL, find, home, private home, bookmarks, history, Settings and Support fields brighten on focus without borders, outlines, shadows or layout changes');console.log('PASS '+passed.at(-1));
    }
    fs.writeFileSync(path.join(out,process.env.FLASHBORN_EXE?'packaged-page-fields-results.json':'page-fields-results.json'),JSON.stringify({passed,profile},null,2));
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
