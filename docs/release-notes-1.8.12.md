# Flashborn 1.8.12

- Remove the "A clean slate" and "All caught up" headings from empty History
  and Downloads pages, including Flashcognito. Their explanatory text and icons
  remain. Remove the unused title artwork as well.
- The theme icon previews a 180-degree turn on hover. Leaving the button returns
  it to its selected position. Clicking changes the theme and keeps that
  orientation, matching the sidebar toggle's behavior in both directions.
- The icon stays fixed in place. Keyboard activation and reduced-motion
  preferences continue to work.

Validation covers hover, hover-out, clicking in both theme directions, keyboard
activation, reduced motion and empty History/Downloads in both themes and both
session types.

The installer configuration, NSIS include and build workflow remain unchanged.
