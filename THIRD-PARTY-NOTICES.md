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

## Headline font and brand artwork

Page headings use the bundled Flashborn 75 Bold font, a locally renamed copy
derived from Helvetica Neue LT Com 75 Bold by Linotype Design Studio / Linotype
GmbH, with original outline data also credited to Adobe Systems Incorporated.
The original glyphs, hinting, spacing and kerning are preserved. The font is
proprietary and excluded from the application's MIT license. Renaming and
removing descriptive font metadata do not change its underlying licensing.
Original font license reference: http://www.linotype.com/license

The extended brand wordmark remains fixed artwork typeset from HelveticaNeueLT
Com 53 Extended. That original typeface software is not bundled.

## Koffi

Native Windows window positioning uses Koffi 3.3.2, Copyright (C) 2026 Niels
Martignène, MIT licensed. Its full license ships in the packaged dependency.
Source: https://github.com/Koromix/koffi

## AdBlock

The official AdBlock 6.49.0 Chrome extension is bundled as a separate extension,
copyright Adblock, Inc. and contributors, GNU GPL version 3. Its full `COPYING`
and `LICENSE-THIRD-PARTY` notices are retained inside the original CRX3 package
and in the extracted extension. Source and build instructions:
https://gitlab.com/eyeo/browser-extensions-and-premium/extensions/extensions/-/tree/adblock-6.49.0
Corresponding source archive (also supplied as `AdBlock-Source-6.49.0.zip`
alongside the local installer):
https://gitlab.com/eyeo/browser-extensions-and-premium/extensions/extensions/-/archive/adblock-6.49.0/extensions-adblock-6.49.0.zip
Official distribution: https://chromewebstore.google.com/detail/adblock/gighmmpiobklfepjocnamgkkbiglidom
Package provenance, adaptations and compatibility limits: `src/extensions/NOTICE.md`.

## yauzl and pend

Extension package extraction uses yauzl 3.4.0 and its pend dependency under the
MIT License. Their complete licenses ship in the packaged dependencies.
Source: https://github.com/thejoshwolfe/yauzl

Flashborn is not affiliated with Adobe, Flash Browser, OpenAI, Google or Electron.
