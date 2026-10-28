# Flashborn 1.14.8

The white desktop rectangle was an inactive native Flash window growing beyond its old offscreen parking position. Live desktop sampling identified the owning Flash runtime and its partially onscreen HWND. The regression was reproduced in an isolated application over a uniform backdrop during a large resize.

Inactive windows now defer viewport-size updates until they are needed again. Parking preserves their existing physical size, reserves room for an outstanding larger resize at any display scale, and repairs unexpected geometry changes. Ordinary parking does not change the window's stack position. Visible Flash, menus, sharp window corners, and the compositor used during native window transitions retain their existing arrangement.

The hosted Library's square-shape stylesheet listener is registered once when its helper starts, rather than repeatedly during state publication.

Network investigation found no Flashborn TCP listener. The modern Chromium network service had a UDP mDNS listener on port 5353. The attached Windows Firewall prompt concerns incoming network access; standard browsing and local Flash playback do not require an inbound exception. No firewall rules or Windows Security settings are changed by this release.

Validation: 90 unit tests passed. The original desktop regression produced 294 incorrect pixel samples; the corrected source build produced zero across 553 sampled frames while collapsing, expanding, and resizing with multiple modern and native Flash tabs.

Native viewport resize/hit-test checks and compositor transition checks passed. The transition test now waits for actual onscreen Flash pixels before parking its input window; the old installed version's stray windows were closed before running screen-pixel verification.

The packaged application also passed the desktop regression (469 sampled frames, zero incorrect pixels), Flash/menu ordering through sidebar animation, resize, both themes and fullscreen, and restoration of ordinary and private pages. Package verification confirmed all 69 source files, the native helper, version, and pinned Adobe Flash player bytes.

Installed successfully for Vas at `%LOCALAPPDATA%\Programs\Flashborn` and launched. The existing browser, collection, and thumbnail files matched their backup hashes before first launch, and both per-user shortcuts point to this copy. The older all-users installation was left unchanged. Installed-copy sidebar collapse testing recorded zero white desktop-corner pixels across 438 sampled frames; the previous tab and expanded sidebar were restored afterward.
