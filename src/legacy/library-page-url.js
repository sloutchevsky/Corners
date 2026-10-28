'use strict';
const LIBRARY_PAGE_URL = 'https://flashborn.sloutchevsky.com/flash.gallery.html';
const LEGACY_LIBRARY_PAGE_URL = 'https://flashborn.sloutchevsky.com/flash.library.html';
function isLibraryPage(value, expected = LIBRARY_PAGE_URL) {
  try {
    const url = new URL(value), target = new URL(expected);
    return !url.username && !url.password && url.origin === target.origin && url.pathname === target.pathname;
  } catch { return false; }
}
function isSavedLibraryPage(value, expected = LIBRARY_PAGE_URL) {
  return isLibraryPage(value, expected) || isLibraryPage(value, LEGACY_LIBRARY_PAGE_URL);
}
module.exports = { LIBRARY_PAGE_URL, isLibraryPage, isSavedLibraryPage };
