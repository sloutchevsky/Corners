'use strict';
const { _electron: electron } = require('playwright');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: path.join(root, 'test-output', 'quality-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: [root], env });
  try {
    await app.firstWindow();
    for (let i=0;i<100;i++) { if(await app.evaluate(()=>!!global.__flashborn)) break; await new Promise(resolve=>setTimeout(resolve,100)); }
    await app.evaluate(async ({}, filename) => global.__flashborn.openLocal(filename), path.join(root, 'assets', 'Flashborn-Demo.swf'));
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await app.evaluate(() => global.__flashborn.activeTab().native.evaluate(`(() => {
      const movie = document.getElementById('flash-movie');
      const read = () => { const r = {}; for (const key of ['_quality','_root._quality','_level0._quality','foo','$version']) { try { r[key] = movie.GetVariable(key); } catch(e) {r[key] = e.message;} } for (const k of [16,19]) {try{r['property'+k]=movie.TGetProperty('/',k);}catch(e){r['property'+k]=e.message;}} return r; };
      const result = { initial:read(), methods:['SetVariable','TSetProperty','TGetProperty','ToggleHighQuality'].map(key=>[key,typeof movie[key]]) };
      movie.SetVariable('foo','bar'); movie.SetVariable('_root._quality','LOW'); result.root=read();
      try { movie.TSetProperty('/',19,'LOW'); } catch(e) {result.error=e.message;} result.property=read();
      try { movie.TSetProperty('/',16,'0'); } catch(e) {result.error2=e.message;} result.legacyProperty=read();
      return result;
    })()`));
    console.log(JSON.stringify(result,null,2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
