# Windows distribution and SmartScreen

Flashborn 1.8.5 remains unsigned. The screenshot reported by the user is the
SmartScreen **unrecognized app** warning. It does not name a malware detection.
Removing the standalone player cannot guarantee that this warning disappears.

Version 1.8.6 also remains unsigned. The October 16 recheck confirms that the
retained v1.7.3 installer has SHA-256
`8da216476ce1fd3fadf94b4767e4081686a29630f423afe29f83da7f78a64420`,
exactly matching the digest returned by GitHub for its v1.7.3 release asset.
Publishing did not alter that installer's bytes. The NSIS configuration and
welcome-page include are unchanged between tags v1.7.3 and v1.8.0.

For an unsigned public download, the supported path is for the exact file hash
to acquire positive reputation over time. Microsoft documents no manual
consumer SmartScreen reputation-review mechanism. A malware false-positive
submission is a different process and is not a guaranteed reputation reset.
No new installer is described as warning-free based only on a local launch.

## Signature audit

Checked with Windows `Get-AuthenticodeSignature` on October 15, 2026:

| Component | Result |
| --- | --- |
| Flashborn installer | NotSigned |
| Flashborn.exe | NotSigned |
| FlashRuntime.exe (Electron 9.4.4 host) | NotSigned |
| Original Adobe Flash 32.0.0.363 PPAPI DLL | Valid (Adobe Inc., timestamped) |

Version 1.8.0 introduced the patched Clean Flash 34 player. Its original Adobe
signature was invalidated (HashMismatch), unlike the valid original player in
1.7.3. This coincides with the reported start of the warning, but does not prove
that this component caused SmartScreen's installer reputation decision.

Version 1.8.4 removes that patched DLL and restores the unmodified, Adobe-signed
32.0.0.363 player from Flash Browser. Packaging checks its pinned SHA-256 and
requires a Valid Adobe signature. The verified Adobe signature applies only to
the player; it does not sign Flashborn or guarantee installer reputation.

The obsolete player/picker files and unused updater `elevate.exe` are excluded
from this release. Flashborn has no analytics or automatic updater. Installer
publisher text and executable company metadata identify Vas Sloutchevsky, but
neither is a cryptographic signature.

## Why the reported cutoff was v1.8.0

The actual local installer copies were compared on October 15, 2026:

| Installer copy | Authenticode | Internet-origin metadata |
| --- | --- | --- |
| v1.7.3 | NotSigned | No Zone.Identifier stream |
| v1.8.0 downloaded copy | NotSigned | ZoneId=3 (Internet) |
| v1.8.3 downloaded copy | NotSigned | ZoneId=3 (Internet) |
| v1.8.4 locally built copy | NotSigned | No Zone.Identifier stream |

The v1.7.3 and current installer configuration use the same NSIS installation
flow. Differences remove a file association and unused elevation helper; they do
not add a signing identity. The observed marker difference supports the browser
download path, rather than the player signature alone, as the reason SmartScreen
started appearing at that version. File and publisher reputation also matter.

The restored Adobe signature in v1.8.4 did **not** resolve the reported warning.
No source-code edit can give an unsigned installer a verified publisher or
inherited signing-certificate reputation. A new release must not be described
as SmartScreen-free on the strength of a successful local build or launch.

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
The Microsoft registration and Azure build route are prepared in
[microsoft-signing.md](microsoft-signing.md); `npm run dist:azure` also verifies
the app, Flash runtime executable, and installer signatures after building.
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
