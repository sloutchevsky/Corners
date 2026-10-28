# Flashborn 1.13.3

Flash tab switching and three-dot menu activation no longer let the browser's opaque frame cover the playing movie. Flash's already-painted area is excluded from that frame's drawing and mouse-input region, so it stays visible and interactive even when Windows raises the browser frame above its independent player.

The change uses actual Windows pixel bounds, including invisible resize borders and display scaling. It follows resizing, sidebar animation, themes and fullscreen, and restores the complete browser region for ordinary pages, new tabs and internal panels. Tab switching retains the outgoing surface until the next surface is ready.

The player stays in its separate process with independent input queues. The Adobe binary, installer configuration, page colors, cached thumbnails and tab styling are unchanged. Checks cover real Flash pixels, native window order, OS window regions, mouse hit-testing and repeated menu/tab operations.

Validation note: the intentional host-stall harness terminates the test application in this session on both the unchanged 1.13.2 package and this source build, before its UI recovery checks. It is not counted as a passing check for this release.
