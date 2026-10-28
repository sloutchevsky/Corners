# Corners 1.14.26

The 15 px perimeter now uses a transparent host surface. Only the inner browser surface, corner controls and active scrollbar thumbs paint. The unused perimeter shows the actual application underneath rather than an opaque grey band. Both corners and both scrollbars remain child views within the same native window.

Window-region fingerprints detect and repair compositor resets for ordinary HTML pages as well as Flash cutouts. Corner undocking releases capture before using Electron's restore state, preserving maximize/fullscreen behavior on the transparent host.

Special pages scroll behind a 15 px transparent mask at both the top and bottom, continuing behind the floating reload, theme and menu controls. The mask covers the stage as well as the sidebar perimeter. Their initial content still starts 60 px down. System window glyphs stay below the top mask. The Gallery retains its menu layering without the old post-load 66 px crop.

Composed screen pixels and input ownership are checked against a bright owned backdrop in all four themes. App icons are unchanged.

Both scrollbar grooves are visually transparent and remain native input targets. Minimal neutral coverage keeps Windows input ownership without a visible black track. Clicking either side of the thumb still advances the page in that direction.

Preview comp update: corner strokes remain fully opaque (white in dark mode, black in light mode), as do scrollbar thumbs. Theme is beside the window controls; special-page navigation aligns with the drawer toggle and the vertical menu sits on the title row. The stage viewport stays inside the clear 15 px perimeter. No installer is rebuilt for this preview.

Animated-corner preview: each opaque L retracts diagonally 10 px underneath the browser, leaving 5 px visible against its edge. A fixed L-shaped mask prevents overlap into the stage and keeps the corner joined to the browser throughout motion. Hover reveals its full 15 px stroke over 190 ms; dragging latches the expanded position. Mouse-up inside keeps it extended until hover leaves. The 40 px hit targets remain fixed. No packaging.

Retractable-scrollbar preview: right and bottom thumbs show 5 px at rest and slide outward by 10 px on hover. The tab scrollbar follows the same motion on the left drawer edge. Fixed 15 px tracks preserve track clicks, wheel input and drag geometry; the thumb stays extended while dragging and after mouse-up inside. Clear grooves and opaque theme colors are retained. No packaging.

Compact drawer preview: collapsing narrows the panel from 320 px to 160 px. Tab thumbnails keep the same dimensions and hover behavior, while labels truncate with an ellipsis. Toggle, back, forward and reload share one evenly spaced row in both states and on special pages. No packaging.
