# Third-party software

Flashborn's application source is MIT licensed. This license does not apply
to third-party software or proprietary Adobe Flash binaries.

## Electron and Chromium

The modern browser uses Electron 44.7.0. The native Flash helper uses the Electron
9.4.4 runtime from the user's installed Flash Browser 0.8.1, with Flashborn's own
helper application replacing its application code. The installed app includes
Electron and Chromium notices at `LICENSE.electron.txt`, `LICENSES.chromium.html`,
and `resources/native-runtime/LICENSE` / `LICENSES.chromium.html`.

Source: https://github.com/electron/electron

## Adobe Flash Player

Flashborn 1.8.0 bundles the native Adobe PPAPI x64 player 34.0.0.376 from the
community Clean Flash distribution, release v1.54. This distribution applies
upstream FlashPatch compatibility patches. The binary is not the unmodified,
Adobe-signed 32.0.0.363 player bundled in earlier Flashborn versions. Its original
Authenticode signature is invalidated by the upstream patches; provenance is
verified through pinned SHA-256 checksums, not a claim of a valid Adobe signature.

The Adobe player remains proprietary, subject to its original license terms,
and excluded from Flashborn's MIT source license and source archive. Flashborn
application code does not modify the upstream player during packaging.

Distribution: https://github.com/darktohka/clean-flash-builds/releases/tag/v1.54
Upstream patch project: https://github.com/darktohka/FlashPatch
Archive SHA-256: `19a8d1036110af024dc877ca96a9184835c3e944fb14ca8d509662f00bf1bd31`.
Player SHA-256: `cb91e4589f0a854dd0f23a21d6feee623a857a1dee112b8cb5e5a7c9be0af6f2`.
Build provenance is saved in `resources/native-flash/provenance.json`.

The Flash browser host uses Electron 9.4.4 and Chromium 83, which no longer
receive security updates. Native mode is intended for trusted legacy content.

Flash Browser runtime reference: https://github.com/radubirsan/FlashBrowser

## Koffi

Native Windows window embedding uses Koffi 3.3.2, Copyright (C) 2026 Niels
Martignène, MIT licensed. Its full license ships in the packaged dependency.
Source: https://github.com/Koromix/koffi

Flashborn is not affiliated with Adobe, Flash Browser, OpenAI, Google or Electron.
