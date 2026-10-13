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

This personal local build bundles the unmodified Adobe PPAPI x64 player 32.0.0.363
from the user's existing Flash Browser installation. The DLL retains its valid
Adobe Inc. signature. Adobe Flash is proprietary and remains subject to Adobe's
license terms; it is excluded from Flashborn's MIT source license and source archive.

SHA-256: `4acafedca8bb62529527029aeb485318866e4fd71bf298e73f735bc75f6d720d`.
Build provenance is saved in `resources/native-flash/provenance.json`.

Flash Browser reference: https://github.com/radubirsan/FlashBrowser

## Koffi

Native Windows window embedding uses Koffi 3.3.2, Copyright (C) 2026 Niels
Martignène, MIT licensed. Its full license ships in the packaged dependency.
Source: https://github.com/Koromix/koffi

Flashborn is not affiliated with Adobe, Flash Browser, OpenAI, Google or Electron.
