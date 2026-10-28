# Flashborn 1.14.11

The Go button on ordinary and private new tabs is circular again. Its arrow rotates 90 degrees clockwise on hover and returns on rollout. Reduced-motion preferences disable the rotation transition.

Flash no longer repeatedly resizes its independent native window during sidebar animation. The browser's existing live DWM backing follows the viewport while the input surface is parked. At completion, the helper receives the final size and paints before input returns. Explicit source rectangles and a safe source crop prevent one-frame gaps when the source shrinks. Native caption moves retain their existing arrangement; resize loops use the same live backing.

The browser retains its own right-edge resize zone. That strip is painted by the live compositor, rather than a separate frame object or an exposed background margin. The main window keeps sharp corners and its native capability flags, with frame decoration and shadow disabled. Physical endpoint rounding keeps the right edge anchored across fractional display scales.

The three-dot menu also has no outer outline or shadow. Its button shows a background highlight instead of an outline when keyboard focus returns after Escape. The square, edge-to-edge selection highlight still slides between rows and supports keyboard navigation.

Validation includes Go-button geometry and reversible rotation in both new-tab modes and themes, native edge hit tests, repeated and interrupted sidebar transitions, native resize loops, and screen-pixel samples inside and outside the right edge over an owned uniform backdrop. The final source check recorded 1,020 samples and the packaged check recorded 966, both with no overshoot or incorrect edge/shadow pixels. Flash/menu layering, window borders and menu selection checks passed in both themes. All 92 unit tests passed.

Installed and launched for Vas. Installed package verification matched all 69 source files, native helper branding/icon and pinned Adobe player bytes. Browser and collection files were unchanged by installation; the three saved browser, collection and thumbnail files were backed up and verified before launch.
