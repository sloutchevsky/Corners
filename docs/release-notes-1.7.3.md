# Flashborn Browser 1.7.3

Flashborn combines a minimal Windows interface and current Chromium browsing
with original Adobe Flash playback in a separate legacy process.

## What's new

- Compact summaries above Google, DuckDuckGo and Bing search results, generated
  locally from visible result snippets with numbered source links.
- Summaries follow the current theme and push the original page down.
- Generate page summaries is on by default and can be disabled in Settings.
- Delayed result updates, fullscreen, collapsed-sidebar layouts and private tabs
  are handled without saving summary text or making extra summary requests.

For all changes from **1.0.0 through 1.7.3**, see the
[complete changelog](https://github.com/sloutchevsky/Flashborn-Browser/blob/main/CHANGELOG.md).
Historical release notes are available in the
[release history](https://github.com/sloutchevsky/Flashborn-Browser/releases),
and source versions through their Git tags. Those commits
are reconstructed from the retained archives and are labeled as imports.

## Downloads

- **Flashborn-Setup-1.7.3-x64.exe**: Windows 10/11 x64 installer; contains both
  browser engines and Adobe Flash 32.0.0.363 PPAPI.
- **Flashborn-Source-1.7.3-GitHub.zip**: application source, build scripts, tests,
  assets, documentation and complete changelog; native third-party binaries are
  excluded.
- **SHA256SUMS-1.7.3-GitHub.txt**: file integrity checksums.

Close Flashborn before updating. Saved settings, bookmarks, history and the Flash
library are retained. No separate Flash installation is needed to run the installer.

The installer is unsigned. Publisher/company metadata is Vas Sloutchevsky;
Windows verified-publisher prompts still require a trusted signing certificate.

Adobe Flash and its legacy Chromium runtime no longer receive security updates.
Use native mode with trusted legacy content. Ordinary pages use the modern engine.
The MIT license covers Flashborn's application source; Adobe and other third-party
components retain their own licenses.

## Validation

The final packaged regression run passed 33 browser checks. Summary integration
checks passed 7 cases and the unit suite passed 21 tests. Live Bing and DuckDuckGo
results were verified. Google returned a verification page, so its search results
adapter was verified with fixtures.

Publication documentation was added without changing the existing 1.7.3 installer.
