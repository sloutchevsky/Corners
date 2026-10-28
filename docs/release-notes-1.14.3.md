# Flashborn 1.14.3

Bookmarks, History and Downloads use compact two-line rows with flush 2:1 thumbnails. Bookmarks and History show the most recent screenshot captured by Flashborn, including after the tab closes or the browser restarts. Sites without a saved picture use a globe placeholder. Downloads use grey tiles with archive, picture or globe icons.

New Tab pages no longer generate screenshots. New Tab and Flashcognito tiles use one globe or lock that stays visible while sliding between the collapsed sidebar centre and the expanded 2:1 tile centre. Their selection and tile are grey with white icons in dark mode, and white with black icons in light mode.

Visited-site pictures share the existing bounded thumbnail cache. Private page pixels remain excluded. Earlier saved tab pictures migrate for bookmarked and visited sites, and removing the last bookmark or history reference prunes the saved site picture.

Validation: all 72 unit tests passed. Source and packaged UI checks passed for screenshot persistence after tab closure and restart, missing-picture fallbacks without page loads, bookmark navigation and reordering, download icon types, both themes, animated globe/lock placement and private-image exclusion. Existing website and native Adobe Flash thumbnail persistence and sidebar geometry checks passed. The packaged sidebar selection regression checks passed, and all 65 source files, native helper contents and pinned Adobe player bytes were verified.
