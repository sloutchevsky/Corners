# Flashborn 1.14.9

The three-dot popup has square Windows corners. Its highlight spans the full window width and slides vertically with the same 190 ms easing as the lower-left navigation. A single backplate follows hover or keyboard navigation, settles on a clicked control row, and returns to the selected row on rollout. Special pages are selected when their menu opens. Reduced-motion preferences disable animation.

The FlashBrowser name and red icon in Task Manager came from Windows resources in the bundled native host executable, inherited from its source distribution. Preparation now replaces its process/product display names and icon with Flashborn branding. The executable filename remains FlashRuntime.exe; its rendering code and the original Adobe player are preserved. The helper also declares Flashborn as its Electron product name and Windows application identity.

Validation: 90 unit tests passed. Isolated UI checks passed for square native corners, a full-width highlight, intermediate animation positions, click/rollout selection, keyboard navigation and reduced motion in both themes. Package verification checks the native executable's Windows names and exact icon resources, as well as source files, helper contents and the pinned Adobe DLL.

The packaged UI passed the same selection checks. Repeated menu toggles, outside dismissal, keyboard navigation and menu commands passed on new tabs and live Flash pages. Installed for Vas and launched; all three backed-up profile files matched their hashes before first launch. Installed package verification passed, and the History pane was restored after visually checking the square popup.
