'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-output');
async function poll(fn, predicate, timeout = 20000) {
  const end = Date.now() + timeout; let value;
  do { value = await fn(); if (predicate(value)) return value; await new Promise(r => setTimeout(r, 100)); } while (Date.now() < end);
  throw new Error('Timed out: ' + JSON.stringify(value));
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  const file = path.join(output, 'upload-fixture.html'); fs.writeFileSync(file, '<!doctype html><title>Dropped document</title><p>Local file</p>');
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><title>Attachment drop fixture</title><style>#compose {width:600px;height:350px;border:1px solid} #overlay {display:none} .dragging #overlay{display:block}</style><div id="compose"><div id="overlay">Drop files here</div><input type="file" id="file"><div id="editor" contenteditable="true">Message</div></div><script>
      window.received=[];window.seen=[];
      document.addEventListener('dragenter', e=>{document.body.classList.add('dragging');});
      document.addEventListener('dragover', e=>{if(new URL(location).searchParams.has('document'))e.preventDefault();});
      document.addEventListener('drop',e=>{document.body.classList.remove('dragging');seen.push('document');if(new URL(location).searchParams.has('document')){e.preventDefault();received.push(...Array.from(e.dataTransfer.files,f=>f.name));}});
      window.addEventListener('drop',e=>{seen.push('window');if(new URL(location).searchParams.has('window')){e.preventDefault();received.push(...Array.from(e.dataTransfer.files,f=>f.name));}});
      document.getElementById('file').addEventListener('change',e=>{received.push(...Array.from(e.target.files,f=>f.name));});
    </script>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, FLASHBORN_TEST: '1', FLASHBORN_PROFILE: path.join(output, 'upload-profile-' + Date.now()) }; delete env.ELECTRON_RUN_AS_NODE;
  // Keep AdBlock's independent first-install welcome tab out of tab-count
  // assertions. The extensions integration check covers uploads with it on.
  fs.mkdirSync(env.FLASHBORN_PROFILE,{recursive:true});
  fs.writeFileSync(path.join(env.FLASHBORN_PROFILE,'browser.json'),JSON.stringify({settings:{adBlockEnabled:false}}));
  let app; const results = [], pass = text => { results.push(text); console.log('PASS ' + text); };
  try {
    app = await electron.launch({ executablePath: process.env.FLASHBORN_EXE || require('electron'), args: process.env.FLASHBORN_EXE ? [] : [root], env });
    await poll(() => app.evaluate(() => !!global.__flashborn), Boolean);
    const ui = await app.firstWindow();
    const command = (action, args = {}) => app.evaluate(({}, data) => global.__flashborn.command(data.action, data.args), { action, args });
    const state = () => app.evaluate(() => global.__flashborn.getState());
    const script = code => app.evaluate(({}, code) => global.__flashborn.activeTab().view.webContents.executeJavaScript(code), code);
    await app.evaluate(() => { const w = global.__flashborn.win; w.show(); w.focus(); });
    const drop = (x = 100, y = 100) => app.evaluate(async ({}, data) => {
      const wc = global.__flashborn.activeTab().view.webContents;
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      for (const type of ['dragEnter', 'dragOver', 'drop']) await wc.debugger.sendCommand('Input.dispatchDragEvent', { type, x:data.x, y:data.y, data: { items: [], files: [data.file], dragOperationsMask: 1 } });
    }, { file, x, y });
    for (const mode of ['document', 'window']) {
      await command('navigate', { value: base + '/?' + mode });
      const before = (await state()).tabs.length;
      await drop();
      await poll(() => script('({received,seen,overlay:getComputedStyle(document.getElementById("overlay")).display})'), s => s.received.length === 1 && s.overlay === 'none');
      await new Promise(r => setTimeout(r, 200));
      assert.equal((await state()).tabs.length, before);
      pass(mode + ' upload handlers receive the real file and clear their drag overlay without opening a tab');
    }
    await command('navigate', { value: base + '/?document' });
    await script(`document.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();},{capture:true});`);
    const beforeStopped = (await state()).tabs.length; await drop(); await new Promise(r => setTimeout(r, 200));
    assert.equal((await state()).tabs.length, beforeStopped);
    pass('A page that stops propagation keeps ownership of its file drop');
    await command('navigate', { value: base + '/' });
    const beforeEditor = (await state()).tabs.length;
    await script(`document.getElementById('editor').style.cssText='position:absolute;left:0;top:0;width:400px;height:300px';`);
    await drop(); await new Promise(r => setTimeout(r, 200));
    assert.equal((await state()).tabs.length, beforeEditor);
    pass('File drops into editable message fields do not spawn browser tabs');
    await command('navigate', {value:base+'/'});
    await script(`document.getElementById('file').style.cssText='position:absolute;left:20px;top:230px;width:220px;height:40px';`);
    const beforeInput = (await state()).tabs.length;
    await drop(90,245);
    await poll(()=>script('received'),files=>files.includes('upload-fixture.html'));
    assert.equal((await state()).tabs.length,beforeInput);
    pass('Native file-input drops attach the file without opening a browser tab');
    await command('navigate', { value: base + '/' });
    const beforeFallback = (await state()).tabs.length; await drop(650, 380);
    await poll(state, s => s.tabs.length === beforeFallback + 1 && s.tabs.find(t => t.id === s.activeId)?.kind === 'local');
    pass('An unhandled drop on an ordinary page still opens a local document');
    await command('new-flashcognito');
    await poll(() => ui.locator('[data-nav-icon="history"]').getAttribute('data-metal'), x => x === 'silver');
    assert.equal(await ui.locator('[data-nav-icon="downloads"]').getAttribute('data-metal'), 'silver');
    assert.equal(await ui.locator('[data-nav-icon="bookmarks"]').getAttribute('data-metal'), 'gold');
    await ui.locator('[data-panel="history"]').hover(); await ui.waitForTimeout(300);
    assert.equal(await ui.locator('[data-nav-icon="history"]').getAttribute('data-metal'), 'silver');
    await ui.screenshot({path:path.join(output,'flashcognito-navigation.png')});
    await command('select-tab', { id: (await state()).tabs.find(t => !t.private).id });
    await poll(() => ui.locator('[data-nav-icon="history"]').getAttribute('data-metal'), x => x === 'gold');
    pass('Flashcognito History and Downloads use silver while shared Bookmarks stay gold; regular tabs restore gold');
    fs.writeFileSync(path.join(output, process.env.FLASHBORN_EXE ? 'packaged-upload-drop-results.json' : 'upload-drop-results.json'), JSON.stringify({ passed: results }, null, 2));
  } finally { if (app) await app.close(); server.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
