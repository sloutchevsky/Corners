'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { SupportLinks, validatedLink } = require('../src/support');
test('Payment destinations require the right HTTPS provider host and reject spoofed domains and credentials', () => {
  for (const url of ['http://paypal.com/donate','https://paypal.com.evil.test/pay','javascript:alert(1)','https://user:pass@paypal.com/donate','https://venmo.com/pay']) assert.equal(validatedLink('paypal', url), null);
  assert.ok(validatedLink('paypal','https://www.paypal.com/donate/?hosted_button_id=EXAMPLE'));
  assert.ok(validatedLink('link','https://buy.stripe.com/example'));
});
test('Unconfigured support never launches a fake payment and recurring checkouts use configured provider URLs', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'flashborn-support-')); t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const links = new SupportLinks(directory);
  assert.equal(links.state().paypal['one-time'],false);
  fs.writeFileSync(links.file,'null'); assert.equal(links.state().paypal['one-time'],false);
  assert.throws(()=>links.checkout('paypal','one-time',5),/not been connected/);
  fs.writeFileSync(links.file,JSON.stringify({paypal:{'one-time':'https://paypal.me/example','monthly':'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=EXAMPLE'},link:{yearly:'https://buy.stripe.com/yearly'}}));
  assert.equal(links.checkout('paypal','one-time',3.5),'https://paypal.me/example/3.50USD');
  assert.match(links.checkout('paypal','monthly',5),/plan_id=EXAMPLE/);
  assert.equal(links.checkout('link','yearly',10),'https://buy.stripe.com/yearly');
  assert.throws(()=>links.checkout('venmo','monthly',5),/one-time/);
  assert.throws(()=>links.checkout('paypal','one-time',0),/amount/);
});
