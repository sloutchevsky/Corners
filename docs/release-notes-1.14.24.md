# Corners 1.14.24

Development now lives in C:\Corners. The previous workspace remains available as a backup.

Both owned 40×40 resize corners use captured pointer coordinates and a native cursor fallback. They resize the frameless host without relying on WS_THICKFRAME. The opposite corner remains anchored, minimum window dimensions are enforced, and noninteger display scale is handled. Dragging or double-clicking either corner restores maximized/fullscreen windows under the pointer. Capture is released before an asynchronous Windows restore; the requested bounds are applied after the docked state ends. The previous normal size is retained. Hover is derived from the actual native hit window and clears on exit; idle opacity remains 50%.

The primary vertical and horizontal scrollbars are browser-owned 15-pixel strips outside a restored window. They move inside maximized/fullscreen windows, stop at the resize corner, follow the browser in the window stack, and stay below unrelated applications. Native document-level tracks are hidden without changing nested scroll controls. The exterior controls support wheel, track paging and captured thumb dragging in modern pages, legacy/native pages and local special pages, including the trusted active Gallery frame. Grey idle/hover and white/black pressed colors follow the current theme.

Removed the top-left lightning mark, sidebar wordmark, About wordmark and emblem, and address-area Flash button. The About introduction now describes the interface. Drawer icons use a flat gold stroke/fill; beige UI text and icon colors are neutral grey. App icon PNG/ICO assets are unchanged.

Validation records are in test-output/exterior-ui/, test-output/gallery-shared-stage/ and test-output/unit-1.14.24.log. The installer is built for review and is not installed automatically.

All 131 unit tests passed. The packaged build passed the exterior-control suite, including native track/thumb input and both corner gestures across maximized, fullscreen and fullscreen-from-maximized states. Real pointer drags were also verified for both restored corners and maximized bottom-right undocking. The Gallery checks passed with its exterior-scrollbar bridge, all four themes, menu layering, persistent objects, initial Square preview and retained searches. Package verification matched all 89 source files and native runtime branding.

Installer: 245855997 bytes; SHA-256 `051a1db29306f7e6f5a4278f7e3bbf0560938cf5c228d240b2c2ab056827fde7`.

Uploaded only the Gallery HTML through FileZilla on 2026-10-27. The live HTTPS page matched 601798 bytes; SHA-256 `715043a0b02616947996bea4cfb6dcca9349ec8bb37cce3b033d0eaa95b14824`. Older hosts retain their own document scrollbars; the new named Gallery frame opts into exterior controls.
