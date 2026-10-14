# Flashborn Browser 1.8.0

Search summaries now reveal smoothly above results, and native Flash playback
uses a newer player with automatic recovery of legacy version-check redirects.

## What's new

- **Search summary** animates down in 190 ms after loading, moving the HTML
  viewport with it. Reduced-motion preferences are respected.
- A close button dismisses the panel for the current page visit. Reloading resets
  dismissal; delayed result updates do not reopen a dismissed panel.
- Summary text aligns with organic search results, including zoom and resizing.
  A taller panel presents up to four distinct cited points, prioritizing query
  relevance and shared topics while removing duplication and promotional notices.
- Google, Bing and DuckDuckGo results backgrounds follow the current dark grey or
  light grey theme immediately. Summaries remain local and make no extra requests.
- About grammar is corrected, including "its work". Its dedication uses a comma
  instead of a double hyphen, with no em dash added.
- **Clean Flash 34.0.0.376 PPAPI** replaces Adobe Flash 32.0.0.363. Archive and
  player checksums are pinned, and runtime metadata reports the actual version.
- Embody's Flash version-check redirect now automatically returns to its native
  entry page instead of leaving an upgrade notice in the modern browser.

See the [complete changelog](https://github.com/sloutchevsky/Flashborn-Browser/blob/main/CHANGELOG.md)
for updates from 1.0.0 through 1.8.0.

## Downloads

- **Flashborn-Setup-1.8.0-x64.exe**: Windows 10/11 x64 installer with both browser
  engines and the native PPAPI player. No separate Flash installation is needed.
- **Flashborn-Source-1.8.0-GitHub.zip**: application source, assets, build scripts,
  tests and documentation. Native third-party binaries are excluded.
- **Flashborn-Repository-1.8.0.bundle**: complete Git history for offline cloning.
- **SHA256SUMS-1.8.0-GitHub.txt**: file integrity checksums.

Close Flashborn before updating. Settings, bookmarks, history and library entries
are retained. Publisher metadata is Vas Sloutchevsky; the installer is unsigned.

## Player provenance

This release uses the latest published portable Windows
[Clean Flash build checked for this release, v1.54](https://github.com/darktohka/clean-flash-builds/releases/tag/v1.54).
It is a community-patched Adobe binary, not an unmodified Adobe-signed player.
Newer regional Adobe/HM installers are not included. Only the PPAPI DLL is bundled;
no system Flash installation or regional services are added. The legacy browser
host remains Electron 9.4.4. Use native mode with trusted legacy content.
Flashborn's MIT license covers its own application source, not Adobe binaries.

## Validation

Validation covers summary animation and actual viewport movement, alignment,
theme changes, dismissal and reload, all three search providers, private-session
isolation, native playback, browser navigation and About presentation.
The packaged application passes 33 browser checks and 8 summary checks. The unit
suite passes 22 tests; source polish and privacy suites pass 9 and 8 checks.
Automatic native playback is checked on Embody, KPF, Firstborn 5 and Björk.
The packaged Embody site reaches its interactive home scene with real player
version WIN 34,0,0,376 and all Flash bytes loaded. Google returned a verification
page during the live check; its result adapter is verified with fixtures.
Live Bing summaries, alignment and both result-page themes also pass.
