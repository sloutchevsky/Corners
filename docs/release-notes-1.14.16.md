# Flashborn 1.14.16

The menu uses a compositor slide with the sidebar's 190 ms cubic easing. Windows' visibility fade is avoided by preparing the transparent popup offscreen and reusing it. Its clipping viewport keeps the moving content under the top frame and above Flash. The menu belongs to Flashborn's normal window group, so other applications can cover the browser and menu together. Caption movement retains its alignment.

Flash Library is now Flash Gallery in the sidebar, menu, page and related interface text. The hosted page heading is twice its former size: 78 px on desktop and 68 px on narrow screens. The supplied Pearl Jam Ten Game image temporarily replaces the featured SWF, with the image and caption linking to the existing Pearl Jam site. Existing collection data remains in its original profile directory.

Gallery search and editor fields have transparent resting borders and one thin border on focus, without an outer ring or shadow. The same convention applies to new-tab search, Flashcognito search, bookmarks, history, Settings and the custom support amount field. Search and amount controls retain their round shapes.

Validation: 104 unit tests passed. The Gallery check verified the exact supplied PNG and its displayed dimensions, larger title, both theme/focus states, editing, filtering, card actions, drag previews, persistence and the collection bridge. The image layout uses explicit edge positions for compatibility with Flashborn's native rendering engine. The hosted file was uploaded through FileZilla and matches the local HTML byte for byte (SHA-256 `5B73964979CAB7089B71DD61788E358D442992D81E0E7924E629C9DE54F52060`).

The packaged menu check verified opening, dismissal, reversal, caption movement and native Flash layering in both themes. An ordinary window covered the menu, browser and Flash surface together; the menu is owned by Flashborn and is not globally topmost. The prepared popup is reused and parked outside every display between uses.

Menu selection and toggle checks passed, including hover movement, clicked selection, keyboard navigation and short windows. Page field checks verified both themes, including Flashcognito's resting and focused search borders.
