# Flashborn 1.14.0

Flash Library now opens its editable hosted HTML page at `https://flashborn.sloutchevsky.com/flash.library.html`. The URL field shows that page address. The rounded featured area plays the existing Freedom + Partners SWF live, with its caption and portfolio introduction underneath.

Existing saved cards, thumbnails, native file pickers, edits and ordering are preserved. Edits made in Flashborn stay in its local collection. The standalone HTML also allows local editing in an ordinary browser.

Dragging a card or tab shows a copy following the pointer at 50% opacity. The preview disappears on drop, cancellation or loss of focus.

Validation: all 67 unit tests passed. The packaged application passed checks against the published HTTPS page for live Flash frames, the exact URL, existing collection preservation, editing, filtering, adding pages, reordering, both drag previews, theme changes, Escape and persistence after a full restart. Embedded frames and unrelated pages could neither read nor mutate the local collection. All 65 packaged source files, native helper contents and pinned Adobe player bytes were verified. The deployed HTML matches the local file byte for byte.
