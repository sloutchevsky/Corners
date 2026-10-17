'use strict';

// Public account/profile details only. Azure credentials stay in the environment.
const base = require('./package.json').build;
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} after Microsoft approves the Public Trust signing profile. See docs/microsoft-signing.md.`);
  return value;
}
const endpoint = required('FLASHBORN_SIGNING_ENDPOINT');
if (!/^https:\/\/[a-z0-9]+\.codesigning\.azure\.net\/?$/i.test(endpoint)) {
  throw new Error('FLASHBORN_SIGNING_ENDPOINT must be the HTTPS endpoint shown by Microsoft Artifact Signing.');
}
module.exports = {
  ...base,
  forceCodeSigning: true,
  win: {
    ...base.win,
    azureSignOptions: {
      endpoint,
      codeSigningAccountName: required('FLASHBORN_SIGNING_ACCOUNT'),
      certificateProfileName: required('FLASHBORN_SIGNING_PROFILE'),
      publisherName: required('FLASHBORN_SIGNING_PUBLISHER'),
      fileDigest: 'SHA256',
      timestampDigest: 'SHA256',
      timestampRfc3161: 'http://timestamp.acs.microsoft.com',
    },
  },
};
