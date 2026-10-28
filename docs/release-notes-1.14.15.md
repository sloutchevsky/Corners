# Flashborn 1.14.15

The lightning button beside the address bar has a transparent resting background in both themes, including Flash and Flashcognito pages. Hover uses the same grey square as the other toolbar buttons. The bolt itself still indicates whether Flash is present.

The browser menu slides down from beneath the top frame and rolls back up when dismissed. A transparent native popup keeps the menu above Flash; the popup viewport clips the sliding content below the toolbar. Opening and dismissing it do not change Flash's layer, process or cutout. Repeated clicks can reverse a running slide, and reduced-motion preferences skip the animation.

Caption drags keep the open menu aligned below the frame and flush with the right edge. Minimize, resize and shutdown remove the popup immediately. It retains the square corners, no outline or shadow, and the existing sliding row highlight.

Validation: 102 unit tests passed. Desktop checks verified masked opening/closing, reversal, caption movement, grey hover and a transparent resting bolt in both themes over new tabs and live native Flash. The existing menu selection, keyboard, click-out, repeated-toggle, short-window and sidebar geometry checks also passed.

The packaged build passed the same menu-motion checks. Package verification matched all 71 source files and confirmed the native runtime's Flashborn branding and unchanged Adobe Flash bytes. The live packaged browser was visually checked with its menu open and rolling up over native Flash. Installer: `Flashborn-Setup-1.14.15-x64.exe`.
