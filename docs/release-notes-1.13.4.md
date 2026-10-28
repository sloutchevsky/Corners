# Flashborn 1.13.4

Flash tab changes now reuse opaque, already-mapped Windows surfaces. Background movies remain at their existing size outside the virtual desktop, with their timers throttled. The incoming movie prepares behind the outgoing page, then the old surface moves away to reveal it. Per-switch fades, transparency, ignore-mouse style changes and native hide/show calls have been removed.

The outgoing page stays in place until frame preparation succeeds. A slow or failed capture no longer counts as a prepared replacement just because a short timeout elapsed.

The Flash surface accepts the exact physical viewport dimensions on scaled displays, without its own resize frame or shadow. Minimizing during a handoff cancels the wait cleanly and restores the selected page without a false renderer error.

The three-dot menu closes when its button is pressed again or when clicking outside. Its native activation and blur events are treated as one gesture, preventing accidental reopening. Keyboard activation, Escape and immediate deliberate reopening remain available.

Regression checks now measure final desktop pixels during menu and Flash-tab operations, including blank frames and the previous movie briefly reappearing. Existing cached thumbnails, fixed sidebar anchors, page colors, separate Flash input process and original Adobe binary are preserved. The installer configuration is unchanged.

Validation: 67 unit tests passed. The packaged browser passed 24 Flash tab switches and repeated menu operations in both themes, with zero blank frames across 496 desktop video frames and 939 independent physical pixel samples. Viewport geometry and exactly-once old-to-new image transitions passed. Source checks also covered normal/new-tab handoffs, rapid switching, minimize/restore, fullscreen and keyboard menu controls. All 63 packaged source files and the native helper matched the workspace; the Adobe player checksum is unchanged.
