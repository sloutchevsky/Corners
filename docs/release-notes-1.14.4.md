# Flashborn 1.14.4

Clicking the browser frame avoids redundant activation and Windows' temporary raise of the shell over an already correctly arranged Flash movie. The existing Flash viewport cutout, menu placement, tab handoffs and stacking rules remain in place.

The native Windows frame follows the selected browser skin at startup and when changing themes, removing the black frame left after switching to light mode.

Alt+Tab and taskbar thumbnails include the browser chrome and native Adobe Flash content. Windows Peek receives the complete client image as well. These composites exist only in memory, retain a completed image while minimized, and clear the previous page when switching to a different page or runtime.

Validation: all 82 unit tests passed. Source and packaged native preview checks passed for both themes, Windows accepting the thumbnail and Peek bitmaps, minimize/restore without reloading Flash, and discarding the previous page's image. Input checks passed for repeated address edits, held Flash mouse/drag callbacks, fullscreen and resize. Existing native layering checks passed for menus, tab handoffs, moves, resizing, themes and special pages. Independent desktop-pixel checks recorded no blank samples during frame activation in either theme in source and packaged builds. Physical keyboard and Windows switcher checks verified real input and visible Flash in Alt+Tab. All 67 source files, the native helper contents and pinned Adobe player bytes matched the packaged application.
