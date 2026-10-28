# Flashborn 1.14.1

Flash Library loads its hosted HTML inside the Library special-page pane. Opening it does not create a browser tab or replace the previous website. The address field still shows `https://flashborn.sloutchevsky.com/flash.library.html`.

Only the visible special page is highlighted. Returning to a regular website clears the special-page selection and highlights that tab. Library tabs restored from the previous version move into the special pane.

The Library keeps its editable collection, live native Flash content, reload and theme controls. Its Flashcognito pane is separate and closes with the last private tab. Opening a website from a card still creates a regular browser tab.

Validation: all 67 unit tests passed. The packaged application passed checks for unchanged tab counts and previous URLs, selection across every special page, native Flash handoffs, pane reuse and hiding, editing, reload, theme changes, card navigation, private-pane disposal and previous-version session migration. Hosted Library checks against the published HTTPS page also passed, including live Flash playback, card dragging, editing persistence and isolation from unrelated pages. All 65 packaged source files, native helper contents and pinned Adobe player bytes were verified.
