# Corners 1.14.25

The 15 px perimeter is part of the browser window. A native window region removes the unused portions from painting and mouse input, leaving the corner controls and any active scroll tracks. Both 40 x 40 corner controls and both scrollbars are WebContentsView children of the host, with no separate top-level edge windows. Their complete hit targets stay within the host bounds. Each corner has its own independent hover and press state.

Browser chrome, the Gallery frame, modern tabs and native Flash viewports share the inset content rectangle. Flash cutouts retain the two corner controls and scrollbar tracks. Maximized geometry excludes Windows' hidden off-screen border, keeping controls on the visible work area. Native minimize/maximize/fullscreen and browser menu ordering are preserved.

The existing app icons are unchanged. This installer is built for review and is not installed automatically.

Validation: all 133 unit tests passed. The packaged app passed native mask/hit-region checks, both corner drags, drag and double-click undocking from maximized/fullscreen states, both modern/native scrollbars, and menu containment. Gallery loading, persistent objects, search, resize, and all four themes passed regression checks. Real Windows mouse drags for both restored corners and track paging passed in the development build. All 91 packaged source files matched. ICO/PNG app icon hashes are unchanged.

Installer: 245857829 bytes; SHA-256 0de4c03d7f526b4729c8138509d553ef6f6c7feba81c6e8440d3d34d06c26129.
