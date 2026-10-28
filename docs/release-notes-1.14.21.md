# Flashborn 1.14.21

The Flash Gallery keeps rendering at its live viewport size during maximize, restore and fullscreen transitions. These transitions use the same pixel-exact backing as ordinary resizing, avoiding the enlarged frozen page followed by a jump. Restoring from a minimized window still prepares the final viewport before revealing its input surface. Flash movie layering and proportional minimize previews retain their existing behavior.

The Gallery heading no longer keeps a separate forced GPU layer. A full-width preview scrolls only as far as needed to become visible, preserving more of the heading where space permits.

Changing years releases an XLG or hover preview at its current visible size, then animates it back to a normal tile while it falls. Its physical collision box follows the changing dimensions. The selected year, including All, is disabled, and repeated activation cannot restart the release.

Each loose block has a different mass distribution near its bottom corners. Releasing the magnetic grid gives the off-center load a corresponding turn from its existing angle, with no position jump. All normal loose blocks, including new arrivals, share the current cell size and scale uniformly during a resize. Collision fixtures follow that same scale.

Resizing briefly suspends the loose group for 160 ms, anchored to the same bottom-right corner, then lets it descend and settle at the new visible pile position. Stationary resize boundaries sleep, and stable supported contact islands settle together so subpixel collision corrections cannot keep the pile jiggling. Real impacts and subsequent resizes still wake it normally.

Validation: all 126 browser unit tests passed, and package verification matched all 75 shipped source files and version 1.14.21. The packaged browser passed six maximize/restore/fullscreen transitions and nine real Windows resize messages without parking the Gallery or magnifying a stale texture. Both Gallery renderers checked every tile replacement across three through eight columns, continuous XLG shrink during free fall, repeat-selection prevention, and weight-dependent turns. The uniform-resize checks sampled 450 changing-size frames per renderer during loading; all 28 projects loaded, all 23 loose tiles settled, and the resting pile showed zero position and angular drift. The pile-descent regression also passed short viewports, resizing during loading, and a 56-project collection.
