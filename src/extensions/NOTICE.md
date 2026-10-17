# Official AdBlock extension

AdBlock 6.49.0, copyright Adblock, Inc. and its contributors, is distributed as
a separate browser extension under GNU GPL version 3. Flashborn's MIT license
does not replace AdBlock's license. The original CRX3 package is bundled in
`adblock.crx`; its publisher proof is verified against the Chrome Web Store ID
`gighmmpiobklfepjocnamgkkbiglidom` before unpacking. The full GPL text is included
in the extension's `COPYING`, and dependency licenses in `LICENSE-THIRD-PARTY`.

Official distribution:
https://chromewebstore.google.com/detail/adblock/gighmmpiobklfepjocnamgkkbiglidom

Corresponding source project and build instructions (official upstream tag
`adblock-6.49.0`, commit `d839d263f824ba327161920b3dd3d8973a4a51df`):
https://gitlab.com/eyeo/browser-extensions-and-premium/extensions/extensions/-/tree/adblock-6.49.0

Direct source archive:
https://gitlab.com/eyeo/browser-extensions-and-premium/extensions/extensions/-/archive/adblock-6.49.0/extensions-adblock-6.49.0.zip

An identical upstream source archive is also provided alongside the local
Flashborn installer as `AdBlock-Source-6.49.0.zip`.

On extraction, `manifest.key` is restored from the signed publisher proof so
the unpacked extension retains its official Chrome extension ID. Flashborn adds
one blank `.flashborn-filter-host.html` helper page. No AdBlock script, filter
list, icon or other upstream payload file is edited.

Flashborn supplies browser integration in its own MIT-licensed files. Chromium's
native DNR matcher evaluates AdBlock's enabled static rules and its current
dynamic/session rules; the integration enforces the resulting request decisions
and document allowlists on Electron's request path. The extension's own popup,
options and site-pause controls remain in use. Filtering is limited to regular
modern tabs. Cloud extension sync and arbitrary Chrome Web Store extensions
are not supported. Chromium/DNR features outside the tested blocking, allowing,
site-pause and direct URL/HTTPS redirection paths may behave differently from
Chrome, including request counters and specialized response/header rules.

Flashborn is not affiliated with or endorsed by Adblock, Inc.
