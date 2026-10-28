# Corners

A Windows browser built around a fluid interface: a readable vertical drawer, a transparent frame, animated corner resize controls, and scrollbars that slide out when needed.

**Version 1.14.27 · Windows 10/11 · x64 · MIT application source**

[Download Corners for Windows](https://github.com/sloutchevsky/Corners/releases/download/v1.14.27/Corners-Setup-1.14.27-x64.exe) · [Releases](https://github.com/sloutchevsky/Corners/releases) · [Release notes](docs/release-notes-1.14.27.md)

## Interface

- The drawer collapses from 320 px to 160 px. Tab images keep their size; long labels end with an ellipsis.
- Back, forward and reload sit beside the URL field and follow the drawer as it animates. Opening a new tab keeps the navigation row steady.
- Both corner handles reveal a 15 px stroke from a 5 px resting state, slide out from beneath the browser, and stay extended while dragging.
- Page scrollbars extend right and down. The drawer scrollbar extends left. Clear tracks support page clicks, and all thumbs remain opaque.
- Four theme states combine light/dark with standard/high contrast. Flash Gallery follows the browser theme.
- The Gallery uses a responsive animated grid, thumbnail previews, full-width project details, search, and year selection.

## Install

Download `Corners-Setup-1.14.27-x64.exe` from the release page and run it on Windows x64. Existing application icons are retained in this release.

## Develop

```powershell
npm ci
npm start
npm test
```

The development workspace used for this release is `C:\Corners`.

To build an installer, use the existing icons and prepare the compatible native runtime first:

```powershell
npm run prepare:assets
npx electron-builder --win nsis --x64 --publish never
npm run test:package
```

The native runtime preparation script accepts `FLASHBORN_FLASH_BROWSER` pointing to an installed Flash Browser distribution. It verifies the pinned Adobe player bytes and signature; vendor binaries are excluded from Git. See [third-party notices](THIRD-PARTY-NOTICES.md).

## Playback and compatibility

Ordinary websites use the current Chromium engine. Trusted legacy Flash content uses the original Adobe player in a separate compatible runtime. That legacy engine no longer receives security updates. Application source is MIT; third-party binaries retain their own licenses.

Corners continues the Flashborn Browser codebase. Internal profile and protocol identifiers are retained for compatibility. [Earlier release history](CHANGELOG.md) and [the original repository](https://github.com/sloutchevsky/Flashborn-Browser) remain available.
