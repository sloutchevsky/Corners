'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {isFlashFallbackURL,legacyFlashTarget}=require('../src/legacy/compat');
test('legacy Flash fallback recovery stays within the original site',()=>{
 const base='https://example.com/archive/index.htm';
 const values={flashPage:'main.htm',maxVersion:9,requiredVersion:7};
 assert.equal(legacyFlashTarget(base,values),'https://example.com/archive/main.htm');
 for(const flashPage of ['https://other.example/main.htm','javascript:alert(1)','https://user:password@example.com/','index.htm'])assert.equal(legacyFlashTarget(base,{...values,flashPage}),null);
 assert.equal(legacyFlashTarget(base,{...values,maxVersion:32}),null);
 assert.equal(legacyFlashTarget(base,{...values,requiredVersion:99}),null);
 assert.equal(isFlashFallbackURL('https://example.com/noflash.htm'),true);
 assert.equal(isFlashFallbackURL('https://example.com/no-flash.html'),true);
 assert.equal(isFlashFallbackURL('https://example.com/noflash-game.swf'),false);
});
test('local HTML Flash detector recovery is limited to the selected document folder',()=>{
 const base='flashnative://document/test-token/index.html',values={flashPage:'main.html',maxVersion:9,requiredVersion:7};
 assert.equal(legacyFlashTarget(base,values),'flashnative://document/test-token/main.html');
 for(const flashPage of ['../outside.html','flashnative://player/index.html','flashnative://document/other-token/main.html','javascript:alert(1)'])assert.equal(legacyFlashTarget(base,{...values,flashPage}),null);
});
