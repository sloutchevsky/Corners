# Flashborn 1.14.18

Modern and native Flash thumbnails remove the rightmost 10% before resizing to keep possible scrollbar edges out of previews. Window, task switcher and resize previews retain their complete image.

The selected thumbnail stays visible in the collapsed sidebar. Hovering another tab slides in its thumbnail using the same animation as the expanded sidebar, while the selection remains visible. Flashcognito and new tabs retain their lock and globe placeholders.

Settings now includes an Appearance group: Dark theme and High contrast. High contrast defaults to off, preserving the existing grey themes. With contrast on, the dark surfaces become black and light surfaces become white. The preferences persist across restarts, and the toolbar theme button keeps Settings synchronized. The top bar tagline is removed.

Validation: 105 unit tests passed. Browser checks verified both themes and contrast states, menu appearance, persisted preferences, collapsed thumbnail animation and selection, privacy placeholders, real cropped modern/native captures, and uncropped full window previews.
