# Flashborn 1.8.9

- Subtle grey thin scrollbars in the tab stack and scrollable browser UI text
  boxes in light mode.
- **New Flashcognito tab** in the three-dot menu.
- A filled toolbar bolt for native Flash mode and a hollow outline for modern
  mode, including the existing spinning loading animation and fixed lighting.
  Flashcognito keeps its silver material. Other static and animated bolts retain
  their filled form.
- The bolt tooltip explicitly identifies the Flash toggle and its on/off state.
- No horizontal scrollbar during sidebar expansion; the tab stack retains its
  vertical scrolling.

The installer configuration, NSIS include and build workflow are unchanged.
These scrollbar styles apply to browser UI, without injecting styles into
websites.

Validation covers actual toolbar mode switches and loading animations, the menu
command, light-mode scrolling and repeated expansion/collapse with an overflowing
tab stack. The filled application icon remains identical to the existing render.
