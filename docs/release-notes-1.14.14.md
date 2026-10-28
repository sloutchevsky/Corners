# Flashborn 1.14.14

Support Flashborn replaces Settings at the bottom of the left pane. Its outlined gold coin carries a dollar sign and makes one complete turn on hover and one reminder turn every minute. Hidden windows and reduced-motion preferences do not trigger animations. Settings remains in the browser menu.

The payment interface now has its own Support Flashborn page. About no longer contains the coffee link or donation section; a Support Flashborn link appears at the bottom instead. The final browser-menu item, below About, also opens Support. The preset amount controls are circular and the custom amount control is pill-shaped.

The paragraph below the heading explains the local **I’ve donated** confirmation. Confirming hides the sidebar entry and stops its reminder timer, with only a boolean preference saved on this device. Opening checkout does not infer a completed payment. About and menu access remain available after confirmation, including after restart and in private tabs.

Validation: 98 unit tests passed. The Support UI check verified one-turn hover, the 60-second reminder with a controlled clock, reduced motion, round amount controls, custom amounts and frequency rules, mocked checkout without automatic donor status, menu Settings access, final Support menu placement, and persisted confirmation. The shared sidebar highlight and menu geometry checks passed in light/dark themes, expanded/collapsed sidebars and short windows.
