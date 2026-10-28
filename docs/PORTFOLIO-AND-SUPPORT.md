# Flash Gallery and support links

Flashborn 1.14.17 opens `https://flashborn.sloutchevsky.com/flash.gallery.html` in its special-page pane using the native Flash engine. Older installed versions still open the compatibility copy at `flash.library.html`. It does not add a regular browser tab. Its featured area currently shows the supplied Pearl Jam Ten Game image, embedded in the HTML, with the image and caption linking to that site. The browser's URL field displays the HTML page address. Only the visible pane is selected in the sidebar. Websites opened from cards use regular tabs.

Flashborn keeps the editable collection in `Flash Library/` inside its profile folder. Existing collections and thumbnails remain local. Add, edit, image and reorder controls save to that folder through a bridge limited to the exact Library page. The public HTML does not contain profile data.

`src/ui/fields.css` supplies the shared input styling for browser chrome, special pages and the hosted HTML build. Fields have no borders, outlines or focus shadows. Light fields brighten from 80% grey to white on focus; dark fields brighten from 20% to 30% grey. Inputs inside a search or amount wrapper stay transparent so the whole control changes together.

The Gallery page and cards match the browser frame: `#171717` in dark mode and `#dedede` in light mode. Search sits below the featured preview and caption, above the introduction. A superscript bolt beside Gallery makes one 2.4-second turn on page load, fading from neutral grey to metallic gold and back to grey. It reuses the browser's lightning renderer, embedded in the HTML; theme changes and hover do not replay it. Reduced motion keeps the color fade and omits the turn.

The editable website sources are in `site/flash-library/`. Run `node scripts/build-library-page.cjs C:\_projects\flashborn\flash.gallery.html` to build the single HTML file, including its styles, scripts, font and configured featured image. Upload that file to the subdomain's document root and retain an identical `flash.library.html` compatibility copy for installed browsers. The Add a Flash page button has white text in dark mode and black text in light mode, a transparent resting background, and a faint rectangle on hover. Existing SWFs and supporting assets stay at their site locations. In an ordinary browser the same editing controls save to that browser's local storage; they do not update the shared server copy. The visible Gallery name does not change the existing `Flash Library/` profile directory or its data.

- `manifest.json` stores the ordered entries, page addresses, edited titles, years, descriptions and persistent placeholder colors.
- `images/` contains the thumbnail PNG files. The manifest references those filenames.
- Browser upgrades keep the folder. Old profile entries and thumbnails migrate automatically; the old files are retained.
- To prepackage a portfolio later, copy the manifest and its images into `src/portfolio/manifest.json` and `src/portfolio/images/` before building. New installations import the seed. Existing user collections are preserved.
- Local website files are referenced by absolute path; use web URLs or distribute those website files separately when sharing the collection.

## Payment placeholders

`support-links.json` in the profile folder contains empty checkout links for PayPal, Venmo and Stripe Link. The defaults for new installations live in `src/support-links.json`.

Add the **actual generated HTTPS checkout URLs** under each provider's `one-time`, `monthly` and `yearly` keys. No passwords or secret keys belong in this file. Blank or invalid links stay disabled. Venmo is offered only for one-time support.

Monthly/yearly links must be recurring checkouts configured with the payment provider. Stripe and recurring links own the amount and billing interval: the visitor confirms those at the provider's checkout. A PayPal one-time donation/profile link can receive the chosen amount directly. Do not substitute a fixed-price Stripe link and assume the app changes its price.

Checkout opens directly in the default browser. Flashborn does not collect card information, simulate successful payments or automatically start subscriptions. Provider pages control their own appearance. The Support Flashborn page uses tan controls in dark mode and sidebar brown in light mode, with circular preset amounts and a pill-shaped custom amount field.

Support Flashborn replaces Settings in the lower sidebar; Settings remains in the browser menu. A gold outline dollar coin spins once on hover and once every minute while the sidebar entry is present. Reduced motion and window visibility are respected. The Support page is also the last browser-menu item, below About, and the bottom of About links to it.

The **I’ve donated** button is a local user confirmation, not payment verification. It stores only a boolean supporter preference in `browser.json`, hides the sidebar Support entry and stops reminders on this device. Opening checkout alone never marks a donation as complete. Support remains accessible through About and the browser menu for returning supporters. The paragraph below the Support heading explains this behavior.

For a new release, fill in `src/support-links.json` with verified public links; do not ship your profile data, browsing history or account credentials.
