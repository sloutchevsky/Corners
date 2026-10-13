# Flashborn 1.2.0

A minimal dark Windows browser with current Chromium for ordinary pages and
the original Adobe Flash Player 32.0.0.363 for Flash content. Ruffle is removed.

## Install

Run `release/Flashborn-Setup-1.2.0-x64.exe` on Windows 10 or 11 x64. The installer
contains both browser engines and the Adobe player. No separate Flash install
is needed. Close the previous Flashborn version before updating. Settings,
bookmarks, history and the Flash library are retained.

This personal local build is unsigned; Windows can show an unknown publisher
or SmartScreen prompt. Uninstall through Windows Settings → Apps.

## Use

- Enter an address or search in the top bar. Press **Enter** or click **Go**.
- Open local SWFs with **Ctrl+O**, **Open a SWF**, or the three-dot menu.
- Direct SWF URLs and Flash MIME responses open in the native player.
- Pages with embedded Flash, including framesets, are detected and opened in native mode.
- Click the **lightning button** for pages that hide Flash behind detection scripts,
  or to switch a website between modern and native mode.
- The gold lightning button spins once every two seconds while loading, then
  finishes its current turn. The About screen uses a larger continuous animation.
- The half-filled circle switches between dark grey and light grey, rotating
  180 degrees each time. Theme choice is saved.
- The three-dot menu uses a separate popup window above Flash content, with
  inline Chrome-style zoom controls, fullscreen, and Adobe High/Low Flash quality.
- High/Low quality is saved and applies to open native movies and future loads.
- The sidebar provides tabs, bookmarks, history, downloads, settings and a SWF library.
- The dedicated player provides timeline pause/resume, restart, mute and fullscreen.

The original demo `assets/Flashborn-Demo.swf` displays a moving cream square.
The library references your files; keep their companion assets in the same folder.
Pause controls the movie timeline; games may continue running script or timers.
Missing game servers, external assets and site dependencies can still prevent playback.

## Compatibility and security

The bundled DLL was copied from your installed Flash Browser 0.8.1. Its Adobe
signature is valid and its SHA-256 is:

`4acafedca8bb62529527029aeb485318866e4fd71bf298e73f735bc75f6d720d`

Adobe Flash support was removed from Electron 12. Flashborn therefore embeds a
separate Electron 9.4.4 / Chromium 83 process for each native Flash tab, while
ordinary browsing and the application UI use Electron 44.7.0. This is the real
PPAPI player, without binary patches or a substituted emulator.

**Adobe Flash and its legacy browser engine no longer receive security updates.**
Use native mode for trusted legacy content. Process separation is not a VM or a
guarantee against vulnerabilities in the old engine. Ordinary addresses entered
in the address bar return to modern Chromium; links within a native page remain
in native mode.

Both engines use isolated renderers without Node.js access. Certificate checks,
same-origin protections and website CSP stay enabled. The local player can serve
companion assets only inside its selected folder. Its JavaScript bridge exposes
only audio muting. Each native tab has separate cookies/storage; these are not
shared with modern pages or other native tabs, and are discarded when that native
tab closes. The modern engine prompts for
site permissions; native pages are allowed fullscreen only.

History, bookmarks, settings and library entries stay under
`%APPDATA%/flashborn-browser`. Uninstall keeps user data.
There is no analytics service or automatic updater. This custom browser does
not provide Chrome account sync, general extension installation or DRM video.

The application source is MIT licensed, copyright © 2026 Vas Sloutchevsky.
The spaced logo and round “f” use outlines from the user-installed
HelveticaNeueLT Com 53 Extended font, so the installer does not require or
redistribute that font. Regenerate those outlines with `scripts/create-brand.ps1`
when the original font is installed.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+L | Address bar |
| Ctrl+T / Ctrl+W | New / close tab |
| Ctrl+Shift+T | Reopen closed website tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+1…9 | Select tab |
| Alt+Left / Alt+Right | Back / forward |
| Ctrl+R / F5 | Reload |
| Ctrl+O | Open SWF |
| Ctrl+D | Bookmark |
| Ctrl+F | Find in page |
| Ctrl+H / Ctrl+J | History / downloads |
| Ctrl+P | Print |
| Ctrl+Plus / Minus / 0 | Zoom |
| F11 / Esc | Fullscreen / leave fullscreen |
| F12 | Modern page developer tools |

## Build and validate

Requirements: Windows x64, Node.js 22.12+ (24 recommended), npm and the existing
Flash Browser installation at `C:\Program Files (x86)\FlashBrowser`. Override
its directory with `FLASHBORN_FLASH_BROWSER` if necessary. The preparation script
checks the pinned player checksum, copies the compatible runtime and replaces
its application code with Flashborn's helper. It leaves the installed browser
untouched. Native binaries are excluded from the source archive.

```powershell
npm ci
npm run prepare:assets
npm test
npm run test:smoke
npm run dist
```

The build produces `release/Flashborn-Setup-1.1.1-x64.exe`. Run `npm start` for
development. `npm run dist:portable` produces a portable Windows executable.
Third-party binaries retain their respective licenses; the Adobe binary is not MIT.

Unit tests cover URL parsing, forbidden schemes, path containment, SWF headers
and profile persistence. Runtime tests launch the actual application with a
disposable profile and fixture server. They cover Enter/Go, navigation, tabs,
bookmarks, history, find, downloads, genuine Adobe version detection and frame
execution, player controls, remote and MIME SWFs, embedded objects, native mode,
menus and renderer isolation. It also verifies actual on-screen Flash pixels,
visibility after tab switching, framesets, and classic plugin detection scripts.
Results and screenshots are in `test-output`.

Version 1.1.1 fixes native windows that were rendering while Electron considered
them hidden. Visibility is now synchronized with the legacy BrowserWindow itself.
Old Flash 2–9 detectors can misread version 32 as version 2; their declared Flash
page is recovered only for the recognized detector shape and the same website.

To test an unpacked or extracted installer payload:

```powershell
$env:FLASHBORN_EXE = (Resolve-Path 'release/win-unpacked/Flashborn.exe').Path
npm run test:smoke
```

References: [Electron's Flash removal](https://www.electronjs.org/blog/electron-12-0)
and [Flash Browser](https://github.com/radubirsan/FlashBrowser).
