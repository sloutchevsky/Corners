# Flashborn 1.14.7

The browser frame exclusively owns resize input. The native Flash surface is fixed against interactive resizing but follows the browser's viewport programmatically. Chromium's constraints are refreshed when that viewport changes, including fractional DPI scaling, without changing Flash ownership or layering.

The three-dot menu morphs into lines matching the collapse icon's width and stroke. Their center spacing is halved and remains equal. The existing rotation, rollout reversal, clicked-open state and outside dismissal remain intact.

Lower sidebar selections and New Tab hover backgrounds span the pane edge to edge with square corners. Browser buttons, popup controls, cards and settings groups now have square corners, including Flash Library content when displayed in Flashborn. Search fields remain pills. The library's local HTML source has the same shapes for future publishing; this release does not overwrite the hosted page.

The installer is provided as a download. At the user's updated request, 1.14.7 was installed for Vas in `C:\Users\Vas\AppData\Local\Programs\Flashborn` without administrator elevation. Vas's Desktop and Start Menu shortcuts point to this copy. The older all-users installation in Program Files remains in place. Saved browser configuration, support links and thumbnails matched the profile backup before first launch.

Validation: 88 unit tests passed. Native checks passed for inert Flash edge hit tests, exact viewport geometry across several sizes at 125% display scaling, collapse/expand, menu and tab layering, the removed outer frame in both themes, live Flash through window transitions, and held mouse/drag input across address edits, fullscreen and resizing. Hosted Library editing, filtering, live Flash playback and square controls passed. The menu glyph matches the collapse icon's width and stroke, retains equal spacing and reverses to circles on rollout. Full-width sidebar highlights passed in both themes and both sidebar states.

The installer built successfully. All 68 packaged source files, native helper contents and pinned Adobe player bytes matched the source, both in the packaged build and the per-user installation. Additional packaged-app integration checks were blocked earlier by an automatic approval review usage limit; source-build integration checks completed before packaging. The installed application was launched normally for Vas.
