# Flashborn 1.14.19

Fix Gallery resizing in the browser's Windows compositor. A real edge drag previously parked the HTML renderer and scaled its old frame until the gesture ended. The search field, years and tiles grew together, then jumped to their final layout. Changing the Gallery's grid coordinates could not repair that displayed preview.

The hosted Gallery now keeps its native renderer live during edge resizing and sidebar expansion or collapse. Its compositor backing uses one source pixel per destination pixel, so a pending renderer frame cannot briefly stretch the page either. Tiles receive the current viewport and wrap during the gesture. The Gallery page, hover calculations and two-column preview dimensions are unchanged by this browser release.

The change is limited to the configured Gallery document, including its private pane and regular tabs. Other Flash pages retain their existing proportional compositor previews and window ordering. Minimize/restore preparation remains in place.

Validation: all 117 unit tests passed. The actual WM_SIZING regression sent nine resize messages from a separate process. Disabling the live-layout policy reproduced the old frozen renderer, with a 699px viewport mismatch and no column changes during the drag. With the fix, no sizing message parked the Gallery, all four column counts appeared, and the search field stayed 200 CSS pixels wide with 13px text. The compositor used one-to-one pixel mapping throughout. Sidebar movement was also checked. The Flash window-motion regression passed real playback pixels, caption dragging, collapse/expand, maximize/unmaximize, minimize/restore and fullscreen transitions.

The packaged 1.14.19 app passed the same Windows sizing-message, field-size and compositor checks. Package verification matched all 73 shipped source files, the release version, helper contents, Flashborn branding and the pinned Adobe player bytes.
