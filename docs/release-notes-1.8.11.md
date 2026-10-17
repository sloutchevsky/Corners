# Flashborn 1.8.11

- The sidebar icon stays to the left of the Flashborn wordmark. Only its inner
  divider slides on hover: right in the expanded state and left in the collapsed
  state. Clicking keeps that position when the pointer leaves. The button and
  outer icon do not move, and reduced-motion preferences are respected.
- New-tab, Flashcognito, error-page and empty-state headlines use bundled vector
  title artwork made from Helvetica Neue LT Com 75 Bold with -20 tracking
  (-0.02em), including the original kerning. Large new-tab headlines match the
  reference at 42.15 pixels; panel headings retain their existing size. The
  wordmark keeps its original extended lettering.

The headline artwork renders identically with or without the typeface installed.
Only fixed text artwork is distributed, not a font or a reusable glyph set.
Accessible HTML headings retain the original text for assistive technology and
copying. The optional development exporter accepts a local font path; ordinary
builds use the committed artwork and need no font installation or Python tools.

Validation checks actual pointer hover/click/exit behavior in both sidebar
states, unchanged icon geometry, reduced motion and unchanged headline pixels
with local fonts disabled and an unrelated fallback selected. Existing checks cover
scrollbars, text geometry and close-button visibility throughout expansion.

The installer configuration, NSIS include and build workflow remain unchanged.
