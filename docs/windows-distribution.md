# Windows distribution and SmartScreen

Flashborn 1.8.3 remains unsigned. The screenshot reported by the user is the
SmartScreen **unrecognized app** warning. It does not name a malware detection.
Removing the standalone player cannot guarantee that this warning disappears.

## Signature audit

Checked with Windows `Get-AuthenticodeSignature` on October 15, 2026:

| Component | Result |
| --- | --- |
| Flashborn installer | NotSigned |
| Flashborn.exe | NotSigned |
| FlashRuntime.exe (Electron 9.4.4 host) | NotSigned |
| Clean Flash 34.0.0.376 PPAPI DLL | HashMismatch |

The community Flash build applies upstream compatibility patches, invalidating
the original Adobe signature. Flashborn does not strip, repair or claim that
signature. Its archive and player bytes are pinned by SHA-256. Hash verification
establishes the selected upstream bytes; it is not a malware scan.

The obsolete player/picker files and unused updater `elevate.exe` are excluded
from this release. Flashborn has no analytics or automatic updater. Installer
publisher text and executable company metadata identify Vas Sloutchevsky, but
neither is a cryptographic signature.

## What can resolve the warning

Microsoft documents two reputation signals: the signing publisher and the file
hash. Every new unsigned release starts with no inherited publisher reputation.
Use a validated code-signing certificate or signing service under a consistent
publisher identity to sign releases. A newly signed release may still warn while
reputation accumulates; EV certificates no longer guarantee an immediate bypass.
Microsoft Store distribution is a separate route with Microsoft signing and
Store certification requirements.

There is no signing certificate or signing-service account configured for this
project. `npm run dist:signed` requires signing and fails when it is unavailable.
Configure legitimate credentials outside the repository, then verify the final
installer and installed executable signatures. Do not alter signed files after
signing. Third-party binaries require their own provenance/licensing review.

Flashborn does not disable SmartScreen, change Defender policy, remove download
origin markers, install a self-signed trusted root, or disguise its payload.
For an actual named antivirus detection, use Microsoft's software-developer
submission process; that differs from ordinary SmartScreen reputation.

Sources: [SmartScreen reputation for Windows developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation),
[code-signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options),
[Microsoft software developer FAQ](https://learn.microsoft.com/en-us/defender-xdr/developer-faq).
