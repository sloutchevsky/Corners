# Flashborn 1.13.7

All browser search fields are pills, including the address bar, new-tab search, find-in-page bar, library/bookmark/history filters and library URL field.

The New Tab button has no resting fill or border and shares the lower sidebar navigation buttons' hover treatment in both themes.

Flashcognito tab thumbnails always show a centered lock on a solid 50% grey rectangle in the existing 2:1 footprint. Private tabs no longer capture thumbnail pixels, and the renderer rejects private or stale private frames.

The menu animation expands into an exact 20×20 symbol. Its evenly spaced, round-ended lines match the collapse icon's stroke width, while the resting dots use bolder, true SVG circles. Hover reversal, outside dismissal and the open-menu state are preserved.

Validation: all 65 unit tests passed. The packaged application passed the control geometry, both-theme New Tab hover, zero private-preview capture, late private-frame rejection and normal/Adobe Flash menu regressions. Regular and Flash thumbnail persistence, restore and sidebar-collapse checks passed. All 62 packaged source files, native helper contents and pinned Adobe player bytes were verified.
