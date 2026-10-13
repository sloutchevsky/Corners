'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, check, timeout = 15000) {
  const end = Date.now() + timeout; let value;
  do { value = await fn(); if (check(value)) return value; await wait(80); } while (Date.now() < end);
  throw Error('Timeout: ' + JSON.stringify(value));
}
(async () => {
  const env = {...process.env, FLASHBORN_TEST:'1', FLASHBORN_PROFILE:path.join(output,'predictions-profile-' + Date.now())};
  delete env.ELECTRON_RUN_AS_NODE; fs.mkdirSync(env.FLASHBORN_PROFILE,{recursive:true});
  const app = await electron.launch({executablePath:process.env.FLASHBORN_EXE || require('electron'), args:process.env.FLASHBORN_EXE ? [] : [root], env});
  const passed = [], pass = text => {passed.push(text); console.log('PASS ' + text);};
  try {
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow(), errors = []; ui.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({net}) => {
      const original = net.fetch;
      global.__predictionTest = {original, mode:'live', requests:[], pending:new Map()};
      net.fetch = (url, options) => {
        const test = global.__predictionTest;
        if (!['duckduckgo.com','suggestqueries.google.com','www.bing.com'].includes(new URL(url).hostname)) return original(url,options);
        const query = new URL(url).searchParams.get('q') || new URL(url).searchParams.get('query');
        test.requests.push({url, credentials:options.credentials, referrer:options.referrerPolicy, cache:options.cache, aborted:false});
        const record = test.requests.at(-1);
        options.signal.addEventListener('abort', () => {record.aborted=true;}, {once:true});
        if (test.mode === 'offline') return Promise.resolve({ok:false});
        if (test.mode === 'delay') return new Promise(resolve => test.pending.set(query, resolve));
        return original(url,options);
      };
      const w=global.__flashborn.win; w.setBounds({x:80,y:80,width:1280,height:820}); w.show(); w.focus();
    });
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const command = (action,args={}) => app.evaluate(({},data) => global.__flashborn.command(data.action,data.args),{action,args});
    const ready = (field,query) => poll(state,s => s.suggestions?.field === field && s.suggestions.query === query && s.suggestions.items.filter(i=>i.source==='prediction').length >= 2);
    const escape = async field => {await ui.locator('#'+field).press('Escape'); await poll(state,s=>!s.suggestions);};
    for (const engine of ['google','bing','duckduckgo']) {
      await command('settings',{searchEngine:engine});
      for (const [field,query] of [['address','flash gam'],['home-input','flash games']]) {
        await ui.locator('#'+field).fill(query); const s = await ready(field,query);
        assert.ok(s.suggestions.items.filter(i=>i.type==='search').every(i=>new URL(i.url).hostname.includes(engine==='google'?'google':engine==='bing'?'bing':'duckduckgo')));
        const popup = await poll(()=>app.windows().find(w=>w.url()==='flashborn://ui/suggestions.html'),Boolean);
        await poll(()=>popup.locator('.suggestion-search').count(),count=>count>=3);
        assert.equal(await popup.locator('.suggestion-search small').count(),0);
        await escape(field);
      }
      pass(engine + ' returns live minimal predictions in the address and new-tab fields');
    }
    await ui.locator('#home-input').fill('flash gam');
    const selection = await ready('home-input','flash gam');
    const expected = selection.suggestions.items[1];
    await poll(()=>ui.locator('#home-input').getAttribute('aria-expanded'),value=>value==='true');
    await ui.locator('#home-input').press('ArrowDown'); await ui.locator('#home-input').press('ArrowDown');
    await poll(()=>ui.locator('#home-input').inputValue(),value=>value===expected.inputText);
    await ui.locator('#home-input').press('Enter');
    await poll(state,s=>!s.suggestions && s.tabs.find(t=>t.id===s.activeId)?.url === expected.url);
    pass('Arrow selection and Enter execute a live prediction through the selected search engine');
    await command('new-tab'); await ui.locator('#home-input').waitFor();
    await app.evaluate(() => {global.__predictionTest.mode='delay';});
    await ui.locator('#address').fill('older delayed query');
    await poll(()=>app.evaluate(()=>global.__predictionTest.pending.has('older delayed query')),Boolean);
    await ui.locator('#address').fill('newer delayed query');
    await poll(()=>app.evaluate(()=>global.__predictionTest.pending.has('newer delayed query')),Boolean);
    await app.evaluate(() => global.__predictionTest.pending.get('newer delayed query')({ok:true,text:async()=>JSON.stringify(['newer', ['newer live result']])}));
    await poll(state,s=>s.suggestions?.items.some(i=>i.title==='newer live result'));
    await app.evaluate(() => global.__predictionTest.pending.get('older delayed query')({ok:true,text:async()=>JSON.stringify(['older', ['obsolete live result']])}));
    await wait(160); assert.equal((await state()).suggestions.items.some(i=>i.title==='obsolete live result'),false);
    await ui.locator('#address').fill('dismissed delayed query');
    await poll(()=>app.evaluate(()=>global.__predictionTest.pending.has('dismissed delayed query')),Boolean);
    await escape('address');
    await app.evaluate(() => global.__predictionTest.pending.get('dismissed delayed query')({ok:true,text:async()=>JSON.stringify(['dismissed', ['should stay closed']])}));
    await wait(160); assert.equal((await state()).suggestions,null);
    const records = await app.evaluate(() => global.__predictionTest.requests);
    assert.ok(records.find(r=>r.url.includes('older%20delayed')).aborted);
    assert.ok(records.find(r=>r.url.includes('dismissed%20delayed')).aborted);
    assert.ok(records.every(r=>r.credentials==='omit'&&r.cache==='no-store'&&r.referrer==='no-referrer'));
    pass('Superseded and dismissed requests are canceled; even delayed responses cannot replace current results or reopen the popup');
    await app.evaluate(() => {global.__predictionTest.mode='offline';});
    await ui.locator('#home-input').fill('offline test phrase');
    await poll(state,s=>s.suggestions?.items[0]?.title === 'offline test phrase'); await wait(100);
    assert.equal((await state()).suggestions.items.length,1); await escape('home-input');
    const count = await app.evaluate(() => global.__predictionTest.requests.length);
    for (const value of ['https://example.com/private?q=secret','C:\\Private\\movie.swf','user@example.com']) {
      await ui.locator('#address').fill(value); await wait(250); await escape('address');
    }
    assert.equal(await app.evaluate(()=>global.__predictionTest.requests.length),count);
    pass('Offline search remains usable; URLs, local paths and email addresses are never sent for predictions');
    await command('new-flashcognito'); await ui.locator('#home-input').waitFor();
    await ui.locator('#home-input').fill('flash gam');
    await poll(()=>app.evaluate(()=>global.__predictionTest.requests.length),n=>n===count+1);
    assert.equal((await state()).suggestions.items.some(i=>i.source==='prediction'),false);
    await escape('home-input');
    pass('Flashcognito makes a fresh credential-free request instead of reading ordinary prediction cache');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,process.env.FLASHBORN_EXE?'packaged-predictions-results.json':'predictions-results.json'),JSON.stringify({passed,completedAt:new Date().toISOString()},null,2));
  } finally {
    await app.evaluate(({net}) => {if(global.__predictionTest)net.fetch=global.__predictionTest.original;}).catch(()=>{});
    await app.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
