# Flash library and support links

Flashborn keeps the editable collection in `Flash Library/` inside its profile folder. Use **Flash library → Library folder** to open it.

- `manifest.json` stores the ordered entries, page addresses, edited titles, years, descriptions and persistent placeholder colors.
- `images/` contains the thumbnail PNG files. The manifest references those filenames.
- Browser upgrades keep the folder. Old profile entries and thumbnails migrate automatically; the old files are retained.
- To prepackage a portfolio later, copy the manifest and its images into `src/portfolio/manifest.json` and `src/portfolio/images/` before building. New installations import the seed. Existing user collections are preserved.
- Local website files are referenced by absolute path; use web URLs or distribute those website files separately when sharing the collection.

## Payment placeholders

`support-links.json` in the profile folder contains empty checkout links for PayPal, Venmo and Stripe Link. The defaults for new installations live in `src/support-links.json`.

Add the **actual generated HTTPS checkout URLs** under each provider's `one-time`, `monthly` and `yearly` keys. No passwords or secret keys belong in this file. Blank or invalid links stay disabled. Venmo is offered only for one-time support.

Monthly/yearly links must be recurring checkouts configured with the payment provider. Stripe and recurring links own the amount and billing interval: the visitor confirms those at the provider's checkout. A PayPal one-time donation/profile link can receive the chosen amount directly. Do not substitute a fixed-price Stripe link and assume the app changes its price.

Checkout opens directly in the default browser. Flashborn does not collect card information, simulate successful payments or automatically start subscriptions. Provider pages control their own appearance. The app's About support controls use tan in dark mode and the sidebar brown in light mode.

For a new release, fill in `src/support-links.json` with verified public links; do not ship your profile data, browsing history or account credentials.
