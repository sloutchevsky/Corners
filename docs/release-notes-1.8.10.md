# Flashborn 1.8.10

- No brief flash of tab close X buttons during sidebar expansion. Close buttons
  remain hidden throughout the transition, then regain their usual hover and
  active-tab behavior.
- Flash stays visible and continues playing when the browser loses focus.
  Its independent window moves directly above the browser shell in the ordinary
  window stack, so other applications can cover it normally. The foreground
  browser retains its existing Flash/menu layering. No cross-process window
  parenting or joined input queues were introduced.
- Clicking background Flash raises the browser without stealing the plugin's
  mouse capture. Minimizing and restoring still preserve movie state.
- Linked tabs open immediately below their actual source tab in both browser
  engines, including private sessions, scripted popups and context-menu links.
  Ordinary navigation within the same tab retains its existing behavior.

Validation exercises an overlapping window in a separate process, actual Adobe
playback and input after backgrounding, minimize/restore, modern and native link
opening, private-session isolation and repeated sidebar animation.

The installer configuration, NSIS include and build workflow remain unchanged.
