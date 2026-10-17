'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {SitePermissions} = require('../src/site-permissions'), {Store} = require('../src/store');
const page = url => ({getURL:()=>url, isDestroyed:()=>false});

test('active-page clipboard writes never prompt; reads remain a separate permission', async()=>{
  let prompts=0,active=true;
  const permissions=new SitePermissions({canPrompt:()=>active,prompt:async()=>{prompts++;return false;}}),wc=page('https://mail.google.com/mail/u/0');
  for(let i=0;i<12;i++) {
    assert.equal(permissions.check(wc,'clipboard-sanitized-write','https://mail.google.com'),true);
    assert.equal(await permissions.request(wc,'clipboard-sanitized-write'),true);
  }
  assert.equal(prompts,0);assert.deepEqual(permissions.entries(),[]);
  assert.equal(await permissions.request(wc,'clipboard-sanitized-write',{requestingUrl:'https://other.example/frame'}),false);
  active=false;assert.equal(await permissions.request(wc,'clipboard-sanitized-write'),false);
  active=true;assert.equal(await permissions.request(wc,'clipboard-read'),false);assert.equal(prompts,1);
  const blocked=new SitePermissions({saved:[{origin:'https://mail.google.com',permission:'clipboard-sanitized-write',allowed:false}],prompt:()=>assert.fail('No write prompt')});
  assert.equal(await blocked.request(wc,'clipboard-sanitized-write'),false);
});
test('embedded notification requests never prompt or change the top-level site decision', async()=>{
  let prompts=0; const permissions=new SitePermissions({prompt:async()=>{prompts++;return true;}}), wc=page('https://mail.google.com/mail/u/0');
  for(let i=0;i<10;i++)assert.equal(await permissions.request(wc,'notifications',{requestingUrl:'https://meet.google.com/frame',isMainFrame:false}),false);
  assert.equal(prompts,0);assert.deepEqual(permissions.entries(),[]);
  assert.equal(await permissions.request(page('https://meet.google.com/'),'notifications',{}),true);
  assert.equal(permissions.check(wc,'notifications','https://meet.google.com'),false);
  assert.equal(permissions.check(null,'notifications','https://meet.google.com/path'),true);
});
test('concurrent requests share one prompt; allow and block choices survive a profile restart',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flashborn-permissions-'));
  try {
    const store=new Store(directory);let prompts=0,finish;
    const permissions=new SitePermissions({saved:store.data.sitePermissions, save:entries=>{store.data.sitePermissions=entries;store.save();}, prompt:()=>{prompts++;return new Promise(r=>finish=r);}}),wc=page('https://example.com/page');
    const requests=Array.from({length:6},()=>permissions.request(wc,'notifications',{requestingUrl:'https://example.com/frame'}));
    await new Promise(r=>setImmediate(r));assert.equal(prompts,1);finish(false);assert.deepEqual(await Promise.all(requests),Array(6).fill(false));
    const allowed=permissions.request(wc,'geolocation');await new Promise(r=>setImmediate(r));finish(true);assert.equal(await allowed,true);
    const restarted=new SitePermissions({saved:new Store(directory).data.sitePermissions,prompt:()=>assert.fail('Repeated prompt')});
    assert.equal(await restarted.request(wc,'notifications'),false);assert.equal(await restarted.request(wc,'geolocation'),true);
    assert.equal(restarted.check(wc,'geolocation','https://EXAMPLE.com:443/path'),true);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('background requests, unknown permissions and invalid origins do not open dialogs',async()=>{
  let prompts=0;const permissions=new SitePermissions({canPrompt:()=>false,prompt:()=>{prompts++;return true;}});
  assert.equal(await permissions.request(page('https://example.com'),'notifications'),false);
  assert.equal(await permissions.request(page('https://example.com'),'unknown'),false);
  assert.equal(await permissions.request(page('data:text/html,test'),'notifications'),false);assert.equal(prompts,0);
  const malformed=new SitePermissions({saved:[null,{}, {origin:'https://example.com',permission:'notifications',allowed:'true'}],prompt:()=>assert.fail('Unexpected prompt')});
  assert.deepEqual(malformed.entries(),[]);
});
test('clearing data invalidates an outstanding choice, and private decisions never enter the regular profile',async()=>{
  let finish,saved=[];const permissions=new SitePermissions({save:entries=>saved=entries,prompt:()=>new Promise(r=>finish=r)}),wc=page('https://example.com');
  const requested=permissions.request(wc,'notifications');await new Promise(r=>setImmediate(r));permissions.clear();finish(true);assert.equal(await requested,false);assert.deepEqual(saved,[]);
  const privatePermissions=new SitePermissions({prompt:async()=>true});assert.equal(await privatePermissions.request(wc,'notifications'),true);assert.deepEqual(saved,[]);
  const nextPrivate=new SitePermissions({prompt:async()=>false});assert.equal(await nextPrivate.request(wc,'notifications'),false);
});
