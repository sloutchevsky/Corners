# Flashborn 1.13.5

The three-dot menu stays above the page without taking focus from the browser. Clicking its button again closes the existing menu without a native activation race. Outside clicks, switching apps, keyboard activation, arrow navigation and Escape remain available, with no delay before reopening.

Tabs now fill the gaps between rows. Their 43px height matches the full-height 86×43 thumbnail, preserving the 2:1 picture and the previous vertical center spacing. Expanded and collapsed rows use identical geometry, and drag insertion lines sit on the shared row edge.

The installer configuration and native Flash rendering are unchanged.

Validation: all 63 unit tests passed. The packaged application passed native Windows first/second-click dismissal, repeated toggles on new and Flash tabs, outside-click dismissal, keyboard navigation, menu commands, and tab/thumbnail geometry in both themes and sidebar states. Packaged source and native Flash files match the verified inputs.
