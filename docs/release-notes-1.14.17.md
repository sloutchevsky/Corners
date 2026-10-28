# Flashborn 1.14.17

Flash Gallery opens `https://flashborn.sloutchevsky.com/flash.gallery.html` inside its existing special-page pane. Its local collection bridge accepts the new document. Saved tabs at the former address migrate to the pane without granting the old document collection access in this release.

The address bar, find bar, new-tab and Flashcognito searches, collection filters, editor inputs and textareas, Settings selects and custom support amount share one stylesheet. Fields have no borders, outlines or focus shadows. Focus changes only the fill: 80% grey to white in light mode, and 20% to 30% grey in dark mode. Search and amount controls retain their existing round shapes; the Go button remains round.

The hosted Gallery embeds the same stylesheet. The text-only Add a Flash page button and its faint hover rectangle are retained.

Validation: 105 unit tests passed. Browser field checks passed in both themes, including private-page visibility, the URL and Find bars, preserved shapes and unchanged focus geometry. Gallery pane checks verified switching, reload, private isolation and migration from the former address. The final packaged application passed both field checks and editing/filtering/reordering/persistence checks against the live new Gallery URL. Package verification matched all 72 source files and confirmed native Flashborn branding and the pinned Adobe player bytes.

The Gallery and compatibility HTML were uploaded through FileZilla. The live `flash.gallery.html` matches the tested local file byte for byte: SHA-256 `7CA1B04370B7F43158C82D6985D5BF361D2FA4D72AD17734CDA86B39336F6483`.
