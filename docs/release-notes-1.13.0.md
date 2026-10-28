# Flashborn 1.13.0

The expanded sidebar is now 320 px wide, with a Firstborn-inspired selected tab: an 80 × 40 px live thumbnail at the window's left edge, a square selection band matching its height, and one title line. Tab titles use the standard UI font, with the selected title in bold. Long titles truncate with an ellipsis. Hovering shows memory usage without shifting the title.

Thumbnails slide in from the left edge on hover, pushing the label right. Clicking keeps the selected thumbnail open. Rolling out of an unselected tab or selecting another tab reverses the animation. Memory usage causes no additional shift.

Hover a tab to see its page snapshot without switching to it. Adobe Flash previews capture the real movie directly. Hidden Flash tabs retain their last visible image, so previews do not wake, reload or change movie settings. Images stay in memory and are discarded when the tab closes.

Drag tabs, Flash library entries, bookmarks or downloads to reorder them. A straight insertion line shows the drop position, and lists scroll near their edges. Order is saved without changing the selected tab.

The collapsed sidebar remains 68 px wide. The About animation experiment remains a separate preview. Installer configuration, the bundled Adobe player, website colors and independent Flash input queues are preserved.

Validation: 53 unit tests and the packaged sidebar/preview/reordering checks pass, including real Adobe Flash images and playback continuity. A separate high-frequency Windows stacking check still detects intermittent exposure of the browser frame when switching between Flash tabs. That activation issue remains under investigation and is not claimed fixed in this release.
