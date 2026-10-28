# Corners 1.14.23

The browser is now named Corners. Its visible wordmark, About/Support pages, process descriptions, executable names, shortcuts and installer use the new name. The existing application identity and profile location are retained for upgrades, so saved tabs, bookmarks and the Gallery collection remain available.

The menu dismisses when the stage is clicked, including inside the sandboxed Flash Gallery frame. The relay accepts only the visible, configured Gallery frame and does not expose browser APIs to the hosted document.

Special pages retain Refresh immediately before the theme control. Refresh rebuilds a local special page, or reloads the Gallery document and its opening animation. The address field remains hidden until requested with Ctrl+L.

The lower status strip is removed. HTML and native Flash stages reach the browser's bottom and right edges. Both engines use square 15-pixel scrollbars without arrow buttons; clicking a track pages in that direction. Dark scrollbars are dark grey at rest, lighter grey on hover and white while pressed. Light mode uses light grey, darker grey and black respectively.

Permanent browser-owned 40×40 corners at the top-left and bottom-right have 15-pixel L strokes, matching scrollbar colors. Their strokes sit outside restored windows, and move inside maximized/fullscreen windows to stay reachable. They remain half-transparent at rest and become fully opaque on hover or drag. The whole square accepts diagonal resize input, including its unpainted portion. Each starts the corresponding Windows resize loop rather than manually moving the window on animation frames. The owned controls follow the browser's place in the app stack above its native Flash surface, without creating frame strips or floating over unrelated apps.

After the initial sequential All grid fills, Square ’99 becomes the full-width preview. Searching retains matching selected tiles and the featured preview; only unmatched tiles are released, and newly matching tiles rise from the pile. Narrowing Square to S therefore preserves its object, visible position, size and capture time.

Validation reports are recorded under `test-output/browser-stage-edges/`, `test-output/gallery-shared-stage/` and `test-output/compact-special-pages/`. Tests cover page-track input in both browser engines, corner hit testing over native Flash, special-page refresh, Gallery click-out, search retention, all four themes, and three through eight grid columns. The release installer is built for review; it is not installed automatically.

All 127 unit tests passed. The packaged executable passed the corner/scrollbar suite, compact special-page suite and shared Gallery checks at 1400 and 880 pixels. The source Gallery sweep also passed at 1940, 1750, 1560, 1400, 1200, 1040 and 880 pixels; all 28 artwork hover/XLG transitions passed. Native Flash continued playing through resize and sidebar collapse/expand.

Delivered `release/Corners-Setup-1.14.23-x64.exe` (245,852,051 bytes), SHA-256 `927d0cb990f7ce442451eb597e35b23d22c4f9e0bc4b1a9d0761c51053193da7`.

Uploaded only `flash.gallery.html` through the connected FileZilla session to `/public_html/flashborn.sloutchevsky.com` on 2026-10-27. The HTTPS download matched the tested 601,552-byte artifact, SHA-256 `d8496fc789052302de01fc7982e8d7e8d84de676d2beb5029ad12f4097a2a33a`. A standalone copy is available as `Corners-Flash-Gallery.html` in this chat's visualization folder.
