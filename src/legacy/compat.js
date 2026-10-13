'use strict';
function isFlashFallbackURL(value) {
  try { return /\/(?:no[-_]?flash|flash[-_]?required)(?:\.html?)?\/?$/i.test(new URL(value).pathname); } catch { return false; }
}
function legacyFlashTarget(currentURL, values) {
  if (!values || typeof values.flashPage !== 'string' || !Number.isInteger(values.maxVersion) || values.maxVersion < 2 || values.maxVersion > 9 || !(values.requiredVersion >= 2 && values.requiredVersion <= 32)) return null;
  try { const current = new URL(currentURL); const target = new URL(values.flashPage, current); return ['http:','https:'].includes(target.protocol) && target.origin === current.origin && target.href !== current.href && !target.username && !target.password ? target.href : null; } catch { return null; }
}
const detectionScript = `(()=>[...document.querySelectorAll('object,embed')].some(e=>/shockwave-flash|adobe.flash.movie/i.test(e.type||'')||/d27cdb6e-ae6d-11cf-96b8-444553540000/i.test(e.getAttribute('classid')||'')||/\\.swf(?:[?#]|$)/i.test(e.getAttribute('data')||e.getAttribute('src')||'')||[...e.querySelectorAll('param')].some(p=>p.name.toLowerCase()==='movie'&&/\\.swf/i.test(p.value))))()`;
module.exports = { isFlashFallbackURL, legacyFlashTarget, detectionScript };
