# Flashborn 1.14.5

Selecting a Flash tab no longer exposes a thick frame along the browser's left, right and bottom edges. Native frame composition is refreshed after Chromium applies the Flash cutout, so those edges retain the same appearance as ordinary HTML tabs.

The invisible margins remain available for edge resizing. This change leaves the browser geometry, Flash viewport cutout, movie runtime and existing Flash/menu window ordering intact. Composition recovery coalesces repeated Windows notifications and ignores its own notifications to avoid a repaint loop.

Validation: all 84 unit tests passed. Source and packaged desktop-pixel checks passed for HTML and Flash edges after repeated tab clicks in both themes, including unchanged geometry, resize hit targets, input regions, runtime and window order. Existing Flash layering checks passed for menus, forced shell overlap, tab handoffs, sidebar resizing, both themes, fullscreen and special pages. Source and packaged frame activation pixel checks and the source Windows thumbnail/Peek checks also passed. All 67 source files, native helper contents and pinned Adobe player bytes matched the packaged application.
