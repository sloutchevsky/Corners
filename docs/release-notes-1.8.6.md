# Flashborn Browser 1.8.6

Fix website canvases that appeared dark under otherwise light website layouts.
Both browser engines now use the standard white backing for transparent pages.
The site's own backgrounds and color scheme remain authoritative, and switching
Flashborn's theme preserves page colors and state.

Validation covers transparent, explicitly colored, dark, and site-declared
dark-scheme pages in modern, legacy, and private tabs across both browser themes.
Reuters restricted the automated test session, so its complete article layout
was not verified. No website restrictions were bypassed.

The Windows x64 installer remains unsigned. SmartScreen's unrecognized-app
warning can still appear on Internet downloads. The installer audit found no
NSIS configuration change at the reported v1.8.0 cutoff; the older retained
v1.7.3 installer is byte-identical to the GitHub release. Windows protections and
download-origin metadata are unchanged. This is a website-background fix, not
a claim that unsigned downloads are exempt from SmartScreen.
