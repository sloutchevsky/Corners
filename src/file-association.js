'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');
const run = args => new Promise((resolve, reject) => execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'), args, { windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout)));
function associationEntries(executable) {
  return [
    ['HKCU\\Software\\Classes\\Flashborn.SWF', '/ve', 'Flash movie'],
    ['HKCU\\Software\\Classes\\Flashborn.SWF\\DefaultIcon', '/ve', '"' + executable + '",0'],
    ['HKCU\\Software\\Classes\\Flashborn.SWF\\shell\\open\\command', '/ve', '"' + executable + '" "%1"'],
    ['HKCU\\Software\\Classes\\.swf\\OpenWithProgids', '/v', 'Flashborn.SWF', ''],
  ];
}
async function registerSWF(executable) {
  for (const [key, option, ...values] of associationEntries(executable)) {
    const [name, data] = option === '/v' ? values : [null, values[0]];
    await run(['add', key, option, ...(name ? [name] : []), '/t', 'REG_SZ', '/d', data, '/f']);
  }
  // Never overwrite an existing Windows default or its protected UserChoice.
  const key = 'HKCU\\Software\\Classes\\.swf';
  let hasDefault = true;
  try { await run(['query', 'HKCR\\.swf', '/ve']); } catch { hasDefault = false; }
  if (!hasDefault) await run(['add', key, '/ve', '/t', 'REG_SZ', '/d', 'Flashborn.SWF', '/f']);
}
module.exports = { registerSWF, associationEntries };
