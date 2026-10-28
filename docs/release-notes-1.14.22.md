# Flashborn 1.14.22

Special pages use a compact frame: content begins 60 pixels below the window top, with the theme and menu controls retained. The address field and website navigation controls are hidden on special pages; Ctrl+L temporarily reveals the address field for navigation. Ordinary website and Flash surfaces retain their existing layout.

History, Bookmarks and Downloads retain their 48-pixel thumbnail rows and use a 150-pixel vertical pitch, three times the previous spacing.

Flash Gallery places the project count beside the title, and search beside the years. The loading label disappears after the final project arrives. The shorter header lifts the grid and leaves additional space beneath it. Inactive artwork uses opaque images baked halfway toward the current page background. Hover and full-width previews use the original artwork, and all four theme states update without restarting the Gallery.

All special pages share the browser's HTML layer below its controls and menu. Gallery tiles enter at the actual window top as the same DOM objects throughout their motion. There are no duplicate tiles or separate native Gallery windows. Its sandboxed frame accepts only the configured Gallery document and uses a narrow request bridge for the saved collection. Existing Adobe Flash project playback remains separate.

The embedded page, stage and scrollbar track are transparent. The browser paints their shared background in the same theme update, avoiding a second background repaint. Search now reads “Find” in a shorter field. Gallery frames retain their objects and selection when switching pages; Flashcognito frames use ephemeral credentialless storage and are removed when the private session ends.

After the falling animation finishes, the stage's top mask slides down to 66 pixels, just above the title's visible lettering and clear of the theme control. Hidden frames preserve their nonzero coordinate system so reopening a page cannot collapse its tiles to zero size.
