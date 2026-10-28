'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { version } = require('../package.json');
const publisher = process.env.FLASHBORN_SIGNING_PUBLISHER?.trim();
if (!publisher) throw new Error('FLASHBORN_SIGNING_PUBLISHER must match the verified certificate name.');
const root = path.resolve(__dirname, '..');
const files = [
  'release/win-unpacked/Corners.exe',
  'release/win-unpacked/resources/native-runtime/CornersNative.exe',
  `release/Corners-Setup-${version}-x64.exe`,
].map(file => path.join(root, file));
// Pass values as environment data; never interpolate them into PowerShell code.
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
  $ErrorActionPreference = 'Stop'
  foreach ($file in (ConvertFrom-Json $env:FLASHBORN_SIGNATURE_FILES)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    if ($signature.Status -ne 'Valid') { throw "Invalid or missing signature: $file ($($signature.Status))" }
    $name = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    if ($name -cne $env:FLASHBORN_SIGNING_PUBLISHER) { throw "Unexpected signing publisher: $file" }
    if ($null -eq $signature.TimeStamperCertificate) { throw "Missing signature timestamp: $file" }
    Write-Output "Valid timestamped signature: $file"
  }
`], {
  stdio: 'inherit', windowsHide: true,
  env: {
    ...process.env,
    PSModulePath: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
    FLASHBORN_SIGNING_PUBLISHER: publisher,
    FLASHBORN_SIGNATURE_FILES: JSON.stringify(files),
  },
});
