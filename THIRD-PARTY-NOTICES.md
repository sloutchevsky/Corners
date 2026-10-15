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

Flashborn 1.8.4 restores the original, unmodified Adobe PPAPI x64 player
32.0.0.363 from the installed Flash Browser 0.8.1. Windows verifies its original
timestamped Adobe Inc. Authenticode signature as Valid. Packaging verifies both
that signature and the pinned SHA-256 and fails for altered or unsigned players.

Flashborn 1.8.0 through 1.8.3 used community-patched Clean Flash 34.0.0.376,
whose Adobe signature reported HashMismatch. That binary is no longer bundled.
The signature of the restored player does not sign Flashborn itself or its installer.

The Adobe player remains proprietary, subject to its original license terms,
and excluded from Flashborn's MIT source license and source archive.
Player SHA-256: `4acafedca8bb62529527029aeb485318866e4fd71bf298e73f735bc75f6d720d`.
Build provenance and signature verification are saved in
`resources/native-flash/provenance.json`.

The Flash browser host uses Electron 9.4.4 and Chromium 83, which no longer
receive security updates. Native mode is intended for trusted legacy content.

Flash Browser runtime reference: https://github.com/radubirsan/FlashBrowser

## Koffi

Native Windows window positioning uses Koffi 3.3.2, Copyright (C) 2026 Niels
Martignène, MIT licensed. Its full license ships in the packaged dependency.
Source: https://github.com/Koromix/koffi

Flashborn is not affiliated with Adobe, Flash Browser, OpenAI, Google or Electron.
