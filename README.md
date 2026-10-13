# Flashborn Browser

A minimal dark Windows browser with current Chromium for ordinary pages and
the original Adobe Flash Player 32.0.0.363 for Flash content.

**Current version: 1.7.3 · Windows 10/11 · x64 · MIT application source**

[Download the Windows installer](https://github.com/sloutchevsky/Flashborn-Browser/releases/download/v1.7.3/Flashborn-Setup-1.7.3-x64.exe)
· [Releases and update notes](https://github.com/sloutchevsky/Flashborn-Browser/releases)
· [Current source](https://github.com/sloutchevsky/Flashborn-Browser/releases/download/v1.7.3/Flashborn-Source-1.7.3-GitHub.zip)

See [the complete version history](CHANGELOG.md) for all 13 releases, from the
initial Ruffle build to native Adobe playback and the current browser.

## Preview

| Dark theme · native Flash | Light theme · native Flash |
| --- | --- |
| ![KPF Flash website running in Flashborn's dark theme](previews/screenshots/screens_0009_Layer-2.png) | ![KPF Flash website running in Flashborn's light theme](previews/screenshots/screens_0008_Layer-3.png) |

[View all 10 screenshots](previews/screenshots/README.md), including New Tab,
Flashcognito, search summaries, bookmarks, settings, the Flash Library and About.

## Install

Download and run `Flashborn-Setup-1.7.3-x64.exe` on Windows 10 or 11 x64. When
building locally, the same file is produced in `release/`. The installer
contains both browser engines and the Adobe player. No separate Flash install
is needed. Close the previous Flashborn version before updating. Settings,
bookmarks, history and the Flash library are retained.

This build is unsigned; Windows can show an unknown publisher
or SmartScreen prompt. Uninstall through Windows Settings → Apps.

The Windows install/uninstall consent prompt takes its verified publisher from
an Authenticode signature, not the installer’s publisher text or EXE company
metadata. A trusted code-signing certificate issued for the publisher is required.
This build does not have one. When a certificate or signing service is available,
configure electron-builder signing and use `npm run dist:signed`; that target
fails if signing is unavailable instead of silently producing an unsigned build.
For a PFX certificate, provide its path with `WIN_CSC_LINK` and its password via
`WIN_CSC_KEY_PASSWORD` in the build environment, outside source control.
See [Microsoft’s code-signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options).

## Use

- Enter an address or search in the top bar. Press **Enter** or click **Go**.
- Right-click any tab for **Duplicate Tab** and **Close Tab**. Duplicates open
  immediately beside the original and keep its modern/native and private mode.
- Choose **Flashcognito tab** from the three-dot menu, or press **Ctrl+Shift+N**.
  Silver bolts and a quiet new-tab page identify private tabs. Browsing history,
  restored tabs, automatic library additions and download records are not saved.
  Modern sites use a separate in-memory session; the native Flash engine also
  uses an in-memory session and removes its temporary profile when it exits.
  Closing the last private tab clears its temporary site data and download list.
  Bookmarks and downloaded files you explicitly keep remain on disk. Websites
  and your network can still see your activity.
- Open local files with **Ctrl+O**, **Open a SWF**, or the three-dot menu.
- Drop Flash, HTML, PDF, image or video files onto the browser to open them in new tabs.
  Local HTML can load companion files within its folder.
- PDF links, PDF MIME responses and local PDF files display in Chromium’s PDF viewer.
- Image formats include PNG, JPEG, GIF, WebP, SVG, AVIF, BMP and ICO. Video formats
  include MP4/M4V, WebM, OGV and MOV; playback depends on Chromium codec support.
- The address bar and new-tab search complete known URLs from bookmarks, history
  and open tabs, and suggest previous search phrases. The Flash library address
  field also suggests saved local sources. Use Up/Down and Enter, click a
  suggestion, or press Escape to dismiss. URL completions retain the site's
  original HTTP/HTTPS scheme. Live text predictions come from your selected
  DuckDuckGo, Google or Bing search engine, with no AI mode. Only search phrases
  are sent; full URLs and local paths are excluded. Private predictions use no
  cookies or persistent prediction cache. Local results remain usable offline.
- Google, DuckDuckGo and Bing result pages receive a compact **Page summary**
  above the original page. It uses excerpts from the loaded result snippets,
  with numbered source links, and sends nothing to an external summary service.
  The summary matches the browser theme immediately and pushes the page down.
  **Settings → Generate page summaries** is on by default; turn it off to remove
  summaries from existing and future pages. Summary text stays in memory, including
  in Flashcognito. Empty results, verification pages and unsupported page layouts
  show the original page without a summary.
- Drag tabs, bookmarks, downloads and Flash library entries to reorder them. With an item
  focused, Alt+Up/Down also moves it. Bookmark, download and library order is saved.
- When the sidebar collapses, its tabs heading shows only the number of open tabs.
- Hover a tab for **Memory: XX MB**. Normal pages report their renderer's private
  memory; Flash tabs include their dedicated runtime and player processes. Shared
  renderers are identified in the tooltip. Estimates refresh on hover and stay
  local; measuring an inactive tab does not select it.
- A completed download shows **NEW** beside Downloads until that panel is opened.
  It remains visible when collapsed and across restart; private badges stay in
  their temporary session. Canceled downloads do not trigger it.
- Ctrl+mouse wheel and Ctrl+/− visibly zoom pages, with a Chrome-style percentage popup and Reset button.
- Right-click the address, home search or find field for Select all, Cut, Copy and Paste.
- Click the upper-left logo to open About. The copyright line opens sloutchevsky.com.
  The About email address copies on click and briefly shows a **Copied!** bubble.
- On New Tab, click the gold bolt tile or its caption to open the Flash library.
- App and installer icons use the first frame of the same darker gold animation.
  The Windows publisher/company metadata and installer welcome screen name Vas Sloutchevsky.
- Direct SWF URLs and Flash MIME responses open in the native player.
- Pages with embedded Flash, including framesets, are detected and opened in native mode.
- Click the **lightning button** for pages that hide Flash behind detection scripts,
  or to switch a website between modern and native mode.
- The title bar uses a static first frame of the same gold bolt, without the application name.
- The gold lightning button spins once every two seconds while loading, then
  finishes its current turn. The About screen uses a larger continuous animation.
- The half-filled circle switches between dark grey and light grey, rotating
  180 degrees each time. Theme choice is saved.
- The three-dot menu uses a separate popup window above Flash content, with
  inline Chrome-style zoom controls, fullscreen, and Adobe High/Medium/Low Flash quality.
  Its five groups contain new tabs/files; library, bookmarks, history and downloads;
  Print and Find; zoom/Flash controls; and Settings/About.
- High/Medium/Low quality is saved and applies to open native movies and future loads.
- The sidebar provides tabs, bookmarks, history, downloads, settings and a SWF library.
  The simple gold bolt is retained. The Flash library bolt and smaller bookmark
  star spin once on hover; the History arrow and hands complete a counterclockwise
  12-hour cycle; the Downloads arrow hits its tray and bounces back. The gear
  rotates around the same center as its hub and finishes its current turn when
  hover ends. The lights stay fixed, and reduced motion disables spins. Lower
  sidebar labels match the SWF pill; light-mode icons are darker with less shine.
  Flashcognito uses the normal new-tab layout and fonts, cooler greys, a silver
  bolt, and 50% page opacity. The top-left wordmark and browser menu open About.
- The dedicated player provides timeline pause/resume, restart, mute and fullscreen.
- Moving the window preserves the native Flash child surface. Frame styles are
  applied once, and geometry/visibility change only when needed; crossing to a
  monitor with a different display scale recalculates the viewport.
  Its controls stay visible in fullscreen. Background opens a color wheel with a screen eyedropper, defaulting to white.
  Screen picking uses independent topmost windows with a magnifier over a captured
  screen image, so native Flash cannot cover the eyedropper. Click to select a pixel;
  Escape cancels. Snapshots stay in memory and are discarded when picking ends.
  Live Flash playback returns on selection or cancellation.
  Each library movie saves its background. Color changes recreate the Flash instance and
  restore its timeline position; interactive game/script state is restarted.
- Flash library offers **Open HTML with SWF** and **Open a SWF**. Both reveal an
  address line for a web URL or an absolute local file path, plus **Browse**.
  HTML entries run in native Flash mode with companion assets scoped to their folder.
  Local HTML opened through the main address bar also detects embedded Flash.
- Click **Add image** on a library entry, or drop an image onto its thumbnail,
  to add a landscape **2:1** image. Click it to replace it; use its × to remove it.
  The original image stays untouched; the browser keeps a resized PNG copy in its profile.

The original demo `assets/Flashborn-Demo.swf` displays a moving cream square.
The library references your files; keep their companion assets in the same folder.
Pause controls the movie timeline; games may continue running script or timers.
Missing game servers, external assets and site dependencies can still prevent playback.

## Compatibility and security

The bundled DLL was copied without modification from an installed Flash Browser 0.8.1. Its Adobe
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
only audio muting, fullscreen, and the background color control. Each native tab has separate cookies/storage; these are not
shared with modern pages or other native tabs, and are discarded when that native
tab closes. The modern engine prompts for
site permissions; native pages are allowed fullscreen only.

History, bookmarks, settings and library entries stay under
`%APPDATA%/flashborn-browser`. Uninstall keeps user data.
There is no analytics service or automatic updater. This custom browser does
not provide Chrome account sync, general extension installation or DRM video.

The application source is MIT licensed, copyright © 2026 Vas Sloutchevsky.
The spaced logo uses outlines from the user-installed
HelveticaNeueLT Com 53 Extended font, so the installer does not require or
redistribute that font. Regenerate those outlines with `scripts/create-brand.ps1`
when the original font is installed.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+L | Address bar |
| Ctrl+T / Ctrl+W | New / close tab |
| Ctrl+Shift+N | New Flashcognito tab |
| Ctrl+Shift+T | Reopen closed website tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+1…9 | Select tab |
| Alt+Left / Alt+Right | Back / forward |
| Ctrl+R / F5 | Reload |
| Ctrl+O | Open Flash, HTML, PDF, image or video |
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
npm run prepare:icon
npm run prepare:assets
npm test
npm run test:smoke
npm run test:files
npm run test:refinements
npm run test:polish
npm run test:privacy
npm run test:ui-update
npm run test:predictions
npm run test:eyedropper
npm run test:sidebar
npm run test:window
npm run test:summaries
npm run dist
```

The build produces `release/Flashborn-Setup-1.7.3-x64.exe`. Run `npm start` for
development. `npm run dist:portable` produces a portable Windows executable.
Third-party binaries retain their respective licenses; the Adobe binary is not MIT.

## Languages and environment

| Component | Technology |
| --- | --- |
| Application, browser integration, tests and build scripts | JavaScript / Node.js |
| Interface and player pages | HTML and CSS |
| Gold and silver animations | JavaScript Canvas rendering, SVG assets |
| Logo outline generation | PowerShell and Windows font APIs |
| Windows installer customization | NSIS |
| Modern browser | Electron 44.7.0 / Chromium 152.0.7977.130 |
| Native Flash process | Electron 9.4.4 / Chromium 83 / Adobe Flash 32.0.0.363 PPAPI |
| Windows native integration | Koffi 3.3.2 / Win32 APIs |
| Packaging and browser checks | electron-builder 26.15.3 / Playwright 1.56.1 |

Experimental artwork in `previews/` is separate from the shipped UI. The
production app uses the simple lightning bolt, not the experimental serif shape.

## Release history and packaging

[CHANGELOG.md](CHANGELOG.md) lists the user-visible updates and relevant validation
for every archived release. [docs/version-manifest.json](docs/version-manifest.json)
records the original source archive and installer sizes and SHA-256 checksums.
The imported historical Git commits and tags are reconstructed from those source
archives; their commit dates record the import, not the original development dates.

The installer belongs in a GitHub Release, rather than the Git source tree.
`node_modules/`, generated release output, native third-party binaries and test
profiles are excluded from version control. See [third-party notices](THIRD-PARTY-NOTICES.md)
for the licenses and provenance of bundled components.

Unit tests cover URL parsing, forbidden schemes, path containment, SWF headers
and profile persistence, reordering, supported file formats and autocomplete. Runtime tests launch the actual application with a
disposable profile and fixture server. They cover Enter/Go, navigation, tabs,
bookmarks, history, find, downloads, genuine Adobe version detection and frame
execution, player controls, remote and MIME SWFs, embedded objects, native mode,
menus and renderer isolation. It also verifies actual on-screen Flash pixels,
visibility after tab switching, framesets, and classic plugin detection scripts.
The file/UI checks cover real HTML, image, video, PDF and SWF drops, relative assets,
URL suggestions, keyboard selection and the copyright link. Results and screenshots
are in `test-output`.

The prediction checks verify real DuckDuckGo, Google and Bing responses in both
search fields, selected-result navigation, offline fallback, cancellation of
outdated responses, exclusion of URLs and file paths, and private cache isolation.

The eyedropper check selects actual screen pixels over Adobe Flash, verifies the
Windows click target belongs to the topmost overlay, and checks collapsed and
fullscreen layouts, Escape and dialog-close cleanup, restored playback, and the
About email's copy bubble.

The sidebar checks measure gear centering across rotation angles, completion
after hover-out, collapsed counts, both themes, menu grouping, and real download
completion badges, including restart, acknowledgment, cancellation and privacy.

The window checks count native frame/resize messages during physical moves,
verify real viewport resizing, and exercise hover memory for normal, inactive,
shared and Flash tabs. A touched 64 MB renderer allocation verifies the estimate
responds to actual usage. Set `FLASHBORN_KPF=1` to include the live KPF website.

The summary checks cover all three result layouts, exact viewport displacement,
theme changes, source navigation, settings persistence, delayed DOM changes,
private-session isolation, and the absence of additional network requests.
Live Bing and DuckDuckGo were also verified; Google presented a verification
page during the live test, so its results adapter is verified with fixtures.

The polish checks verify the exact first-frame title bolt, the smaller About branding, 40px text offset, theme-independent grey metadata,
real Adobe Low/Medium/High quality, topmost eyedropper opening and cancellation,
selected-color application, and quality/background persistence after restart.

The privacy checks exercise the tab context menu and duplication, private cookie
and local-storage isolation, download records, real Adobe execution in private
tabs, temporary-profile deletion, clean sessions after the last private tab closes,
and ordinary-only restoration after restart. They also verify the gold hover
icons, reduced motion, real Flash pixels in the eyedropper snapshot, native-window
visibility during picking, and the Flash control spacing and swatch alignment.

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
