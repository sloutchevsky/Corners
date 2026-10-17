# Flashborn 1.9.0

A minimal, quiet Windows browser with current Chromium for everyday pages and
original Adobe Flash playback for trusted legacy websites.

## Extensions, AdBlock, Flash and sRGB

- Extension architecture with an Extensions manager, unpacked Chrome extension
  loading, extension options and popup windows. Electron supports a subset of
  Chrome extension APIs; Chrome Web Store installation and full Chrome API
  compatibility are not provided.
- Official AdBlock 6.49.0 bundled and enabled by default, including its original
  publisher identity, rules, options and site controls. Extensions run in regular
  modern tabs; they are isolated from Flashcognito and the legacy Flash engine.
- Original Adobe Flash Player 32.0.0.363 bundled with its separate compatible
  runtime. Extensions now includes a built-in Flash card with a fixed-on grey
  switch; the toolbar bolt still controls Flash mode for each website.
- Explicit sRGB startup in both browser engines, out of the box. Flashborn needs
  no user changes to browser flags to select this color profile. Website-authored
  colors and backgrounds remain unchanged when the browser theme changes.

## New in this build

- Replace fixed SVG page headlines with the bundled Flashborn 75 Bold font on
  new-tab, Flashcognito, library, bookmarks, history, downloads, extensions,
  settings, empty-state and error pages. Preserve -20 tracking, glyph outlines,
  hinting and all 1,247 kerning pairs.
- Fix repeated Gmail clipboard-write permission dialogs. The active page can
  perform ordinary Copy operations without a modal. Clipboard reading remains
  separately permissioned; explicit write blocks and inactive/cross-origin
  requests are respected.
- Add **Delete browsing data...** to the three-dot menu, opening Settings at
  Privacy. One **Delete data** button handles the checked history, cookies/site
  data and cached images/files categories. Keep unselected categories, bookmarks,
  the Flash library and downloaded files. Apply the selected categories in both
  browser engines and scope private deletion to the Flashcognito session.
- Move the search-engine dropdown arrow inward for more balanced spacing.

This release also publishes the accumulated 1.8.6–1.8.12 refinements, including
website attachment drops, extension support, persistent site permission choices,
smoother sidebar transitions, private-session styling and icons, adjacent linked
tabs, background Flash visibility and hover previews. The complete version
history is in [CHANGELOG.md](../CHANGELOG.md).

## Validation and distribution

Unit coverage checks permission boundaries and independent deletion categories.
Browser integration checks actual clipboard writes, font loading, both themes,
the Extensions card and privacy UI, HTTP cache invalidation, modern and native
Flash storage deletion, and private-session scope. Extension checks exercise
official AdBlock filtering, site pause/resume and unpacked extension loading.

The installer configuration, NSIS include and existing packaging workflow are
unchanged. Flashborn and its installer remain unsigned. Third-party components,
including the Adobe player and the derived headline font, retain their own
licensing terms and are excluded from the application's MIT license.
