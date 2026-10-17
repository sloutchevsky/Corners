# Flashborn 1.8.7

- Fixed file drops on upload websites such as Gmail. Page handlers now receive
  the drop and can attach the file and remove their drag overlay; Flashborn
  opens a local file only when the page leaves the drop unhandled. Editable
  fields keep ownership of dropped files.
- Added **Extensions** to the three-dot menu, with loading, enabling, disabling,
  reloading, options, popup access and removal for compatible unpacked Chrome
  extensions. Enabled extensions and their settings survive restart.
- Prepackaged the official **AdBlock 6.49.0** Chrome extension, with CRX3 publisher
  proof and package SHA-256 verification. No replacement blocking engine is used.
  Browser integration connects its original filters, popup and site-pause controls
  to Electron. Some Chrome-specific features and counters remain limited; this
  does not claim compatibility with every Chrome extension. See
  `src/extensions/NOTICE.md` for provenance, licenses and integration limits.
- History and Downloads icons turn silver in Flashcognito. Bookmarks, the Flash
  library and Settings keep their shared gold icons and fixed-light animations.
- Retained the 1.8.6 website color fix. No page theme/background overrides added.
- Retained the complete 1.8.6 installer configuration, NSIS include, elevation
  behavior, publisher metadata and unsigned build workflow.

Extensions, including AdBlock, run in regular modern tabs. They are not loaded
in temporary Flashcognito sessions or in the independent legacy Flash engine.

Validation includes attachment-drop fixtures, real blocked/allowed requests,
AdBlock pause/resume, extension persistence/removal, private-session isolation,
page color checks, Flash theme stability and packaged-source verification.
