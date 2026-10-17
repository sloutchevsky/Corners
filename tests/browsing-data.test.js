'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {deletionChoices,clearSessionData}=require('../src/legacy/browsing-data');
function fixture(modern) {
  const calls=[],session={};
  for(const name of ['clearStorageData','clearAuthCache','clearCache','clearCodeCaches',...(modern?['clearData']:[])]) session[name]=async args=>{calls.push([name,args]);};
  return {session,calls};
}
test('history selection does not touch cookies or cache; values require explicit booleans',async()=>{
  const {session,calls}=fixture(true);await clearSessionData(session,{history:true});assert.deepEqual(calls,[]);
  assert.deepEqual(deletionChoices({history:'true',cookies:1,cache:true}),{history:false,cookies:false,cache:true});
});
test('modern cookies/site data excludes extension origins and leaves HTTP/code caches intact',async()=>{
  const {session,calls}=fixture(true),origins=['chrome-extension://example'];
  await clearSessionData(session,{cookies:true},origins);
  assert.deepEqual(calls.map(c=>c[0]),['clearData','clearAuthCache']);
  assert.deepEqual(calls[0][1].excludeOrigins,origins);assert.ok(calls[0][1].dataTypes.includes('localStorage'));
  assert.ok(!calls[0][1].dataTypes.includes('cache'));assert.ok(!calls[0][1].dataTypes.includes('downloads'));
});
test('cache selection clears HTTP and code cache without touching stored site data or authentication',async()=>{
  for(const modern of [false,true]) {
    const {session,calls}=fixture(modern);await clearSessionData(session,{cache:true});
    assert.deepEqual(calls.map(c=>c[0]),['clearCache','clearCodeCaches']);
  }
});
test('legacy Flash supports the same selected deletion without using unavailable modern APIs',async()=>{
  const {session,calls}=fixture(false);await clearSessionData(session,{cookies:true,cache:true});
  assert.deepEqual(calls.map(c=>c[0]),['clearStorageData','clearAuthCache','clearCache','clearCodeCaches']);
  assert.ok(calls[0][1].storages.includes('cookies'));assert.ok(calls[0][1].storages.includes('cachestorage'));
});
