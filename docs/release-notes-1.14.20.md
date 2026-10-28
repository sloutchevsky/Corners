# Flashborn 1.14.20

The existing theme icon now cycles through four clockwise quarter-turn positions: black (high contrast), dark grey, white (high contrast), and light grey. Hover previews the next 90-degree turn and rolls back on exit; a click commits the next position. The original half-circle glyph is retained. Its empty half stays transparent, with white fill and outline in dark modes and black fill and outline in light modes.

Inline icon controls have transparent backgrounds at rest and on hover, including toolbar, sidebar collapse, tab close, collection actions, find controls and zoom icons. Their hit areas and existing glyph animations remain intact. Text-button, sidebar-row and menu-row selection treatments remain in place.

Flash Gallery now receives the browser's contrast preference as well as its theme. Contrast-only changes publish a new page state, covering native Gallery panes, Flashcognito panes and regular Gallery tabs. Theme changes update the page background immediately without restarting the falling projects or clearing the current selection. The standalone Gallery also follows the system's increased-contrast preference when it is outside Flashborn.

Validation: all 123 unit tests passed. The isolated browser regression checked all four theme positions, hover rollback and click retention, the original transparent-half glyph, transparent hover backgrounds, all 28 retained projects, native and modern Gallery surfaces, contrast-only Settings changes and persistence across a complete restart.

The packaged app passed the same regression. Package verification matched all 75 shipped source files, version 1.14.20, helper contents, Flashborn branding and the pinned Adobe player. The standalone Gallery passed all four combinations of system color scheme and increased contrast.
