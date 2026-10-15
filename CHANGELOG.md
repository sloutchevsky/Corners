# Flashborn Browser version history

This history covers releases from 1.0.0 to 1.8.5. Historical updates through 1.7.3 are assigned
to versions by comparing the archived source ZIPs, their READMEs and the recorded
development requests. Dates are the retained installer build dates in New York
time. Historical Git commits are imports of these snapshots, not a recovered
record of the original individual edits. Import timestamps are not backdated.

Only delivered changes are listed as releases. The experimental serif bolt was
deferred; the production application still uses the simple lightning bolt.

## Release index

| Version | Build date | Main changes |
| --- | --- | --- |
| [1.8.5](#185-2026-10-15) | 2026-10-15 | Visible Flash through theme/toolbar clicks, sRGB startup for both engines, and download-origin audit |
| [1.8.4](#184-2026-10-15) | 2026-10-15 | Independent Flash input queues, immediate runtime recovery, restored Adobe-signed player and inline tab memory |
| [1.8.3](#183-2026-10-15) | 2026-10-15 | Website-only Flash, removal of the standalone SWF player, fewer plugin/focus interventions and installer trust audit |
| [1.8.2](#182-2026-10-15) | 2026-10-15 | Stable Flash mouse capture through fullscreen and resize, smoother light-mode icons |
| [1.8.1](#181-2026-10-14) | 2026-10-14 | Smoother Flash, reliable address editing and restored tabs, compact hover bubbles and sidebar animation |
| [1.8.0](#180-2026-10-14) | 2026-10-14 | Animated search summaries, About corrections, updated native Flash and Embody compatibility |
| [1.7.3](#173--2026-10-13) | 2026-10-13 | Search result summaries |
| [1.7.2](#172--2026-10-13) | 2026-10-13 | Flash movement stability and tab memory |
| [1.7.1](#171--2026-10-12) | 2026-10-12 | Working screen eyedropper, sidebar polish, download badges |
| [1.7.0](#170--2026-10-12) | 2026-10-12 | Live predictions and refined navigation animations |
| [1.6.0](#160--2026-10-11) | 2026-10-11 | Flashcognito, duplicate tabs and gold navigation icons |
| [1.5.1](#151--2026-10-11) | 2026-10-11 | Unified app icon, new-tab links, About and publisher branding |
| [1.5.0](#150--2026-10-11) | 2026-10-11 | Medium quality, title bolt, About dedication and color picker |
| [1.4.0](#140--2026-10-10) | 2026-10-10 | Visible zoom, Flash backgrounds and expanded library |
| [1.3.0](#130--2026-10-10) | 2026-10-10 | PDFs, file drops, URL completion and reordering |
| [1.2.0](#120--2026-10-10) | 2026-10-10 | Animated lightning, Firstborn-inspired branding and themes |
| [1.1.1](#111--2026-10-09) | 2026-10-09 | Blank Flash surface and legacy detection fixes |
| [1.1.0](#110--2026-10-09) | 2026-10-09 | Original Adobe Flash and separate legacy runtime |
| [1.0.0](#100--2026-10-08) | 2026-10-08 | Initial Windows browser with Ruffle |

## 1.8.5 (2026-10-15)

- Fix the blank native Flash viewport after clicking the theme button or another toolbar control. The movie kept running while its separate normal window was left behind the foreground shell. Keep the active viewport topmost while the browser group is active, and sort it below browser popup windows.
- Demote and hide the viewport when switching away, minimizing, selecting another tab or opening a panel. If a hidden host has stopped processing Windows messages, terminate it so an unprocessed hide request cannot leave it floating over other applications. Reload restores its source.
- Start both modern Chromium and the native Flash engine with force-color-profile=srgb, matching Chrome's sRGB profile option. This is an application startup setting and does not change Windows or monitor configuration.
- Add a theme/color regression check using real theme-button clicks, on-screen Flash pixel captures without raising the browser for screenshots, movie/process continuity, sRGB flags in both engines, minimize/restore and hung hidden-host recovery.
- Recheck the Windows warning against actual installers: v1.7.3 and v1.8.4 are both unsigned. The inspected v1.7.3 copy has no Internet-zone marker; downloaded v1.8.0 and v1.8.3 copies have ZoneId=3. This supports download-origin and reputation checks as the reason for the reported version boundary. Restoring Adobe's valid player signature did not remove SmartScreen. Public installers remain unsigned and may still warn; no protection settings or download markers are changed.

## 1.8.4 (2026-10-15)

- Replace cross-process SetParent hosting with an unowned Flash viewport. Parent/owner relationships implicitly share Windows input queues, allowing a blocked legacy thread to stall the modern address bar, Reload and menus. Neither a parent nor owner is assigned in this release.
- Align the viewport with physical client coordinates using asynchronous Windows positioning. Track browser movement, sidebar animation, resize, fullscreen, minimize, application switching and popup visibility without forcing Flash frame invalidations.
- Handle browser and Flash focus inside their respective processes. Expire delayed focus requests so a recovered helper cannot execute an old request to take toolbar focus.
- Make native Reload replace the full per-tab runtime immediately, including when its UI thread cannot process IPC. Restore the original website or HTML source, zoom and mute state.
- Retain native edit and tab menu objects while Windows finishes their asynchronous close, avoiding a premature garbage-collection crash.
- Remove all tab tooltip windows and their assets/IPC. Show a compact memory size before X only while hovering an expanded tab; truncate the title as needed. Hide it on rollout, collapse, drag, context menu and blur. Late measurements cannot redisplay it.
- Restore the unmodified Adobe Flash 32.0.0.363 player used by Flash Browser and Flashborn 1.7.3. Remove the patched Clean Flash 34 DLL introduced in 1.8.0, which reported HashMismatch. Require both the pinned checksum and a Valid Adobe Inc. signature during packaging; retain provenance and the original timestamp.
- The app and installer remain unsigned. Removing the invalidly signed component fixes that distribution regression, but cannot guarantee removal of SmartScreen's unrecognized-app warning. Windows protection settings are unchanged.
- Add a deliberate 30-second legacy-host hang regression: Windows confirms the host is hung while address editing, edit menus and tab switching work; the real Reload button recreates the runtime and resumes frame callbacks. Update hover, movement, restart, drag and package checks for the new behavior.

## 1.8.3 (2026-10-15)

- Remove the standalone SWF player page, its timeline controls, background color wheel, screen picker, capture overlays and player-specific IPC/protocol routes.
- Remove direct SWF opening from New Tab, the Flash library, file chooser, drag and drop, command-line arguments, and the Windows file association. Remove the SWF sidebar pill and standalone tab icon.
- Keep native Flash embedded in websites and local HTML. The library's single Add a Flash page action accepts website URLs and local HTML paths; thumbnails and reordering remain.
- Skip obsolete standalone SWF tabs on restart while retaining the selected surviving tab. Hide old standalone library entries without deleting their records, thumbnails or source files.
- Reject direct SWF URLs and top-level Flash MIME responses, including in the legacy engine, while preserving embedded SWF asset requests.
- Remove plugin loading polls and automatic quality overrides at the default setting. Stop rewriting embed/param attributes and stop calling into Flash on visibility or theme changes. Explicit non-default quality overrides run once per movie instance.
- Make focus restoration idempotent when a descendant of the native Flash window already owns focus. Keep the legacy renderer at normal process priority, matching the installed Flash Browser, while preserving hidden-tab timer throttling.
- Update tab accessibility descriptions when memory measurements finish, even after rollout, without reopening a dismissed bubble.
- Remove the unused electron-updater elevation helper from the installer payload. Keep legitimate installer elevation available for existing all-user installations.
- Audit Windows signatures: the app, installer and legacy host are unsigned; the community-patched Flash DLL does not retain a valid Adobe signature. Correct stale README signature claims and document the signing/reputation requirements. No Windows protection settings are changed.
- Adapt browser, playback, toolbar, local-file, quality, private browsing and library checks to HTML-embedded Flash. Add upgrade and website-only regression checks. Intermittent Freedom freezes still require real-world confirmation; this release makes no claim that SmartScreen warnings are eliminated.

## 1.8.2 (2026-10-15)

- Preserve the pointer event that already reached Flash instead of assigning focus again after mouse-down. Cancel a pending toolbar handoff without disturbing the movie's mouse capture.
- Remove repeated AttachThreadInput calls from the parent/child focus bridge. Windows already connects these input queues through SetParent; attaching and detaching them again resets button/key state.
- Avoid explicit page focus changes while a window owns mouse capture or is in a native move/size operation. Return focus after fullscreen, resize, maximize and restore only when page input is still intended.
- Track the time of genuine toolbar and page input. Ignore stale notifications and stop treating programmatic legacy focus events as a user click.
- Keep address and Find fields editable and preserve menu/eyedropper focus.
- Replace heavy CSS darkening of light-mode gold icons with a softer, muted gold palette that lifts the darkest pixels and limits glare.
- Render navigation icons and lightning at four times the final resolution, then downsample with high-quality canvas filtering to the actual display density. Keep the existing geometry, motion and stationary lights.
- Regenerate all seven Windows icon sizes and static bolt assets from the same antialiased first frame.
- Add regressions for repeated light-mode drag input through fullscreen/resize and toolbar editing, plus actual-density edge coverage and shadow colors. Check the native Windows capture behavior separately with physical computer input.

## 1.8.1 (2026-10-14)

- Apply Flash rendering quality once to each ready plugin, or when the user changes quality. Stop the repeated calls into settled movies and the repeated writes to HTML quality parameters, allowing sites to retain their own playback adjustments.
- Watch for newly inserted Flash embeds and loaded frames. Poll only while a movie is still loading, with a bounded timeout; stop this work in hidden tabs.
- Keep the active legacy renderer unthrottled and allow hidden renderers to throttle. Minimize and restore update the Flash viewport's visibility.
- Restore the Flash web contents' focus when switching tabs or returning to the browser. Preserve live movie state when revisiting a tab.
- Save and reopen local SWFs, remote SWFs, local HTML, PDFs, images and videos alongside ordinary websites. Preserve tab order, the selected tab, zoom, mute and Flash source/background settings. Private tabs remain excluded.
- Start restored tabs when selected, so restart does not launch every legacy runtime and movie simultaneously. Reopen native pages directly in native mode using their original URL or file path.
- Detect terminated native helpers by both exit code and signal. Reload starts a fresh player for stopped helpers, crashed renderers and crashed plugins, including local HTML pages.
- Ignore state/error messages from replaced or closed players. Avoid rewriting history and the profile on every unchanged native state notification.
- Keep native snapshots unthrottled while the eyedropper acquires its image, then restore the tab's normal visibility policy. Open menus and pickers retain focus.
- Display the bundled player's current version in the standalone SWF bar; restricted version access no longer prevents a loaded movie from showing Ready.
- Add a real AVM1 mouse/drag and frame-clock fixture, with regression checks for playback, old-tab activation, restart and crash recovery.
- Transfer Windows input focus back to the browser toolbar when editing an address or find field. Queued Flash focus requests and reload completion cannot interrupt editing; Ctrl+L and Ctrl+F work from the legacy renderer.
- Replace large native tab tooltips with a small, single-line title and memory bubble above Flash. Hide it immediately on rollout, scroll, drag or a panel change; delayed memory measurements cannot reopen it.
- Animate sidebar collapse and restore over the same 190 ms as Search summary reveal. Keep the real modern and Flash viewports aligned throughout the motion, including rapid reversals and reduced-motion preferences.
- Leave search engines' result-page colors and preferred color scheme unchanged by the browser theme. Only the Search summary and browser interface follow the selected skin.
- Add focused regressions for address/Find editing during Flash reloads, compact bubble dismissal and sidebar viewport motion.

## 1.8.0 (2026-10-14)

- Rename the panel to Search summary and its setting to Generate search summaries.
- Reveal completed summaries with a quick downward animation that moves the actual HTML viewport in sync. Respect reduced-motion preferences.
- Add an accessible close button. Dismissal lasts for the current page visit, survives late result updates, and resets on reload or a new navigation.
- Align summary text with the first visible organic result, including page zoom and responsive layouts.
- Show up to four distinct, cited points from different result domains in a taller panel. Rank query relevance and shared topics, remove duplicate passages, and skip promotional launch notices.
- Apply the browser's dark grey or light grey background to Google, Bing and DuckDuckGo result pages and update it immediately on a theme switch. Summary extraction remains local and makes no additional network requests.
- Correct About grammar, including "its work", and replace the dedication's double hyphen with a comma. No em dash is added to About.
- Upgrade the native PPAPI player from Adobe Flash 32.0.0.363 to Clean Flash 34.0.0.376, the latest published Windows Clean Flash build checked for this release. Pin both archive and player checksums and record upstream patch provenance.
- Recover Flash version-check redirects such as Embody's update.html?required=9.0.0&installed=0.0.0 before they discard the original entry page. Recovery remains within the same origin and respects manual modern mode.
- Keep current Chromium for ordinary pages and the separate legacy process for native Flash. Existing settings, bookmarks, history and library entries remain compatible.

## 1.7.3 — 2026-10-13

### Search summaries

- Add a compact Page summary above direct Google, DuckDuckGo and Bing result pages.
- Extract useful text locally from the visible organic result snippets. Use up to
  three distinct excerpts, with a bounded length and numbered source links.
- Push the original result page down instead of covering its content.
- Match the current dark grey or light grey background and update immediately
  when the theme changes.
- Add Settings → Generate page summaries, enabled by default. Disabling it removes
  current summaries and prevents future ones; the preference survives restart.
- Regenerate after navigation and delayed result updates, including changes to
  supported search result pages without a full reload.
- Reject stale extraction results when the tab or URL changes.
- Keep summary text and private queries in memory. Do not use an AI service or
  make additional summary requests.
- Skip verification pages, empty results, advertising entries and unsupported
  layouts; leave those pages usable without a summary.
- Normalize source links, escape extracted text and remove duplicate or unsuitable
  snippets. Clicking a citation opens its source.
- Adapt the summary height to available space, keep it aligned with the collapsed
  sidebar, and hide and restore it appropriately around fullscreen.

### Validation

- Add summary unit and application checks for all three engine layouts, source
  links, delayed DOM updates, settings persistence, theme changes, viewport
  displacement, private sessions and absence of additional network requests.
- Verify live Bing and DuckDuckGo results, including the packaged application.
  Live Google returned a verification page; its result adapter was checked with
  fixtures, and verification-page handling was checked separately.
- The final packaged regression run passed 33 browser checks; summary integration
  checks passed 7 cases and the unit suite passed 21 tests.

## 1.7.2 — 2026-10-13

### Flash window stability

- Fix the Flash surface blinking while the browser window is moved.
- Apply native child-window frame styles once, rather than recalculating them on
  every layout update.
- Cache native bounds and update geometry, visibility and stacking only when
  needed. Avoid repeated show operations during movement.
- Preserve real resizing and sidebar collapse behavior. Recalculate the viewport
  when the window crosses to a monitor with a different display scale.
- Avoid unnecessary native relayout when closing an already-closed color picker.

### Tab memory

- Add Memory: XX MB to tab hover tooltips without selecting the hovered tab.
- Measure renderer private memory for modern tabs and the dedicated runtime and
  player processes for Flash tabs.
- Identify shared renderers instead of presenting shared memory as exclusive to
  one tab.
- Cache estimates briefly, deduplicate simultaneous measurements and invalidate
  estimates when the tab's page or rendering mode changes. Do not persist metrics.

### Validation

- Add physical Windows movement checks, native frame/resize message counts, real
  viewport resizing and normal, inactive, shared and native tab memory checks.
- Verify the memory estimate responds to a touched 64 MB allocation.
- Verify the live KPF Flash website and confirm the Adobe binary remains unchanged.

## 1.7.1 — 2026-10-12

### Screen eyedropper

- Replace the unreliable Chromium eyedropper over embedded Flash with independent
  topmost screen-picking windows.
- Capture the visible screen into memory, temporarily hide the live native Flash
  surface and show a magnifier with a hexadecimal color preview above the snapshot.
- Apply the actual selected pixel to the Flash background. Restore live playback
  after selection, Escape or closing the color dialog.
- Keep both the color dialog and picker above Flash in expanded, collapsed and
  fullscreen layouts. Discard snapshots after picking finishes.

### Sidebar, downloads and menu

- Center the settings gear and its hub on the same rotation axis. Finish the
  current cycle when hover ends and handle re-entry without a jump.
- Show only the tab count when the sidebar collapses, hiding Your tabs.
- Match lower sidebar labels to the beige SWF label beside Flash Library.
- Make gold navigation icons darker and less shiny in light mode.
- Show NEW beside Downloads after completion, including in the collapsed sidebar.
  Retain ordinary download badges across restart and clear them when Downloads
  is viewed. Keep private badges temporary; canceled downloads do not trigger NEW.
- Arrange the three-dot menu into five groups: new tabs/files; library, bookmarks,
  history and downloads; Print/Find; zoom/Flash controls; Settings/About.
- Remove excess dividers and the divider between Settings and About.

### About

- Copy sloutchevsky@gmail.com when clicked and show a small Copied! bubble.
- Support keyboard activation of the email copy action.
- Use the supplied dedication wording, including italic Firstborn, bold Flashborn,
  the early-2000s reference and the requested 2021 date.

### Validation

- Verify actual pixel picking over Adobe Flash, native Windows click targets,
  collapsed/fullscreen layouts, cancellation, cleanup and restored playback.
- Check gear centering at multiple angles, hover-out completion, both themes,
  menu groups and download completion, acknowledgment, restart and private behavior.

## 1.7.0 — 2026-10-12

### Predictive search

- Add live text predictions from the selected DuckDuckGo, Google or Bing engine
  to the address bar and new-tab search field, following the user's opt-in.
- Keep predictions minimal and combine them with visited URLs, bookmarks, open
  tabs and earlier search phrases. Add saved-source suggestions to library inputs.
- Support keyboard and mouse selection and preserve original HTTP/HTTPS schemes
  when opening local URL completions.
- Exclude full URLs, local paths, email addresses and credential-bearing input
  from live prediction requests.
- Cancel obsolete requests and retain local suggestions when the network is
  unavailable. Private prediction requests use no cookies or persistent cache.
- Do not introduce an AI search mode.

### Navigation and Flashcognito

- Retain the original simple bolt after the serif experiment was deferred.
- Make the Flash Library bolt 15% larger and spin it once around the vertical axis
  on hover. Make the bookmark star smaller and give it one spin on hover.
- Animate the History arrow counterclockwise and complete a counterclockwise
  12-hour cycle with the clock hands.
- Make the Downloads arrow hit its tray and bounce back.
- Keep light sources fixed while objects move; preserve reduced-motion support.
- Remove the bottom About button while retaining the About screen through the
  wordmark and browser menu.
- Remove Your space headings from Library, Bookmarks, History and Downloads, and
  Make it yours from Settings.
- Rename New Flashcognito tab to Flashcognito tab.
- Match the Flashcognito new-tab layout and fonts to the normal page, with silver
  lightning, cooler greys and 50% opacity. Use A little more private. / A fresh
  session. No saved browsing trail.
- Refine the temporary Flash snapshot used during eyedropper opening and canceling.
  Reliable pixel selection is delivered in 1.7.1.

### Signing and validation

- Add a dist:signed packaging target that fails if signing is unavailable.
- Document that installer/company metadata does not establish a verified Windows
  publisher; a trusted Authenticode signing certificate is required. The build
  remains unsigned because no certificate was supplied.
- Add live prediction and UI checks for all three engines, navigation, offline
  fallback, request cancellation, privacy, static lighting and refined layouts.

## 1.6.0 — 2026-10-11

### Tabs and private browsing

- Add Duplicate Tab and Close Tab to the tab right-click menu.
- Place a duplicate next to its source and preserve the page, zoom, rendering mode
  and normal/private state.
- Add Flashcognito tabs through the menu and Ctrl+Shift+N, with silver lightning
  and a subdued new-tab page.
- Use separate in-memory modern and native sessions for private browsing.
- Exclude private browsing history, automatic library additions, download records
  and tab restoration from saved profile data.
- Remove temporary native profiles when their process exits and clear temporary
  site data when the last private tab closes.
- Preserve bookmarks and downloaded files the user explicitly chooses to keep.

### Interface and player

- Add small gold animated icons for Bookmarks, History, Downloads and Settings.
- Honor the system's reduced-motion setting.
- Space Flash controls evenly and remove selection outlines from the quality
  options. Center the background swatch vertically and separate it from its label.
- Add a temporary Flash snapshot while opening the screen picker, restoring
  playback on selection or cancellation. Further picker fixes follow in 1.7.1.
- Retain the earlier simple-bolt animation previews as development artifacts.

### Validation

- Add checks for tab duplication and context menus, cookie and local-storage
  isolation, native Flash playback in private tabs, profile cleanup, download
  persistence, normal-only restoration and navigation/player layout.

## 1.5.1 — 2026-10-11

### App identity and new tab

- Make the new-tab rounded bolt tile and Some things never get old. / Your Flash
  games and movies, ready to play again. open the Flash Library.
- Use the first animation frame inside the rounded tile and remove the redundant
  bolt and Your corner of the web heading above the new-tab content.
- Darken the gold bolt so it remains visible on light grey. Apply that appearance
  to static and animated instances.
- Generate Windows app/installer icons from the same first frame, including the
  required multiple ICO sizes. Update the static player bolt.

### About and publisher

- Make the About animation and wordmark 30% smaller and lower the text by 40 px.
- Put the motto and dedication first, then version, modern engine, Flash player,
  legacy runtime, platform, native readiness, component notice, copyright and MIT
  license, in the requested order.
- Use dark grey/white for primary prose and 50% grey for the remaining information
  in both themes.
- Make the email a mail link; 1.7.1 changes its click action to copy with a bubble.
- Set Vas Sloutchevsky as the Windows company/publisher metadata and show that
  name in the installer welcome screen. This does not add a signing certificate.
- Extend visual checks for branding, offsets, component details and metadata.

## 1.5.0 — 2026-10-11

- Remove flashborn from the custom title bar, keeping the first-frame lightning
  bolt, motto and existing window controls.
- Add Medium Flash quality between Low and High and persist the selection.
- Add an initial screen color picker alongside the Flash background color wheel.
  Opening, cancellation and color application are checked; the overlay issue is
  resolved by the replacement picker in 1.7.1.
- Lower the About wordmark and following content by 70 px.
- Add the first Firstborn dedication paragraph, describing its design legacy,
  Flash work, preservation purpose and contact address.
- Add checks for the title bolt, About position, real Adobe quality changes and
  background/quality persistence after restart.

## 1.4.0 — 2026-10-10

### Zoom and layout fixes

- Fix Ctrl+wheel and Ctrl+/− so the page visibly zooms, rather than only changing
  the displayed percentage. Apply the zoom behavior to the appropriate renderer,
  including PDF and native Flash views.
- Align History with the other panels.
- Make bookmarks reorderable by drag-and-drop and Alt+Up/Down; save their order.
- Keep the dedicated SWF control bar stable after entering and leaving fullscreen.

### Flash library and backgrounds

- Add a Background button with a color wheel, using white by default.
- Save a background per library item and apply it to actual Adobe playback.
- Recreate the Flash instance when changing its background and restore the timeline
  position; interactive game or script state can restart.
- Add landscape 2:1 image thumbnails to library entries, correcting the original
  requested portrait ratio.
- Support adding or replacing an image through a file picker or by dropping it on
  the thumbnail, and remove it with the thumbnail's close control.
- Keep the original image unchanged and save a resized PNG in the browser profile.
- Add Open HTML with SWF to the left of Open a SWF.
- Let both actions accept web URLs or absolute local file paths and offer Browse.
- Open HTML library entries in native mode with their companion assets scoped to
  the selected folder; detect Flash in local HTML opened from the address bar.
- Extend the local legacy detector recovery for recognized HTML Flash pages.
- Add refinement checks for real zoom, fullscreen controls, backgrounds, bookmarks,
  thumbnails and local/remote HTML and SWF sources.

## 1.3.0 — 2026-10-10

### Files and addresses

- Display local PDFs, PDF links and PDF MIME responses with Chromium's PDF viewer.
- Add drag-and-drop opening for Flash, HTML, PDF, image and video files in new tabs.
- Serve companion assets for local HTML from within the selected folder.
- Support PNG, JPEG, GIF, WebP, SVG, AVIF, BMP and ICO images, and MP4/M4V, WebM,
  OGV and MOV videos subject to available Chromium codecs.
- Expand Ctrl+O and menu file opening beyond SWFs to the supported file types.
- Add URL autocomplete from history, bookmarks and open tabs, with inline
  completion, minimal suggestions, arrow-key selection, Enter and Escape.
- Add Select all, Cut, Copy and Paste menus to address/search and find fields.

### Navigation and About

- Add drag reordering for tabs, downloads and Flash Library items, with Alt+Up/Down
  as a keyboard alternative. Save library and download order.
- Add the Chrome-style zoom percentage popup, Reset and Ctrl+wheel handling.
  The actual page-zoom correction follows in 1.4.0.
- Replace the bottom profile/About content with a simple info icon and About label.
- Make the top-left wordmark open About.
- Make the copyright line open https://www.sloutchevsky.com/ without a hover style.
- Add file/UI checks for dropped documents and media, PDF display, companion
  assets, URL suggestion selection and copyright navigation.

## 1.2.0 — 2026-10-10

### Animation and branding

- Add a gold 3D lightning bolt with thickness 14 and a two-second rotation period.
- Center the bolt horizontally in the button beside the address bar.
- Spin continuously while loading and complete the current full turn after loading
  finishes. Use a larger continuous animation in About.
- Use stationary lighting for the rendered metal and respect reduced motion.
- Replace the top-left wordmark and lower round f with HelveticaNeueLT Com 53
  Extended outlines, inspired by the Firstborn logo, with sparse letter spacing.
- Remove periods from both branding instances and reduce the top-left logo size.
- Keep the round f and selected-item left edges aligned when collapsing the sidebar.
- Use the system font for the app name in the title bar.

### Themes, menu and About

- Replace the top folder button with a half-filled circle theme button.
- Switch between the current dark grey and light grey themes, save the preference
  and rotate the theme icon 180 degrees per toggle.
- Add inline Chrome-style zoom controls and fullscreen to the separate menu popup.
- Add real Adobe High/Low quality controls, save the choice and apply it to open
  and future native movies.
- Add © 2026 Vas Sloutchevsky and the MIT application license to About.
- Generate branding outlines from the locally installed font without bundling
  the font file.
- Add checks for quality, themes, animation and UI behavior.

## 1.1.1 — 2026-10-09

- Fix an entirely blank native Flash area caused by Windows rendering the child
  surface while Electron considered its BrowserWindow hidden.
- Synchronize visibility with the legacy BrowserWindow and restore visible
  playback correctly when switching tabs.
- Detect embedded Flash within framesets.
- Recover recognized old Flash 2–9 version-detection scripts that mistake player
  version 32 for version 2. Follow only the declared Flash page on the same site,
  rather than broadly overriding website behavior.
- Standardize persisted browser data under %APPDATA%/flashborn-browser.
- Add real-site and visible-pixel checks, frameset fixtures and compatibility
  tests for classic detection scripts.

## 1.1.0 — 2026-10-09

### Native Adobe playback

- Replace Ruffle with the genuine unmodified Adobe Flash Player 32.0.0.363 PPAPI
  x64 DLL from the installed Flash Browser 0.8.1.
- Run Flash in a separate Electron 9.4.4 / Chromium 83 process per native tab;
  keep modern sites and the interface on the current Electron/Chromium engine.
- Verify the pinned player SHA-256 and preserve its Adobe signature and provenance.
- Add Windows native child-window embedding and validated process communication.
- Detect direct SWF URLs, Flash MIME responses and embedded Flash pages.
- Add the lightning button to switch sites between modern and native modes.
- Use Flashborn's dedicated native player for local and remote movies, with
  timeline pause/resume, restart, mute and fullscreen.
- Scope companion file access to the selected local folder and isolate native
  sessions from modern browsing.

### Browser and packaging

- Fix URL execution from the top address bar, supporting Enter and the Go button.
- Put the three-dot menu in a separate popup above native Flash content.
- Bundle both runtimes and the player in the Windows installer; retain settings,
  bookmarks, history and library entries when updating.
- Replace Ruffle preparation with native-runtime preparation and remove its
  dedicated renderer assets from the app.
- Document the unsupported legacy engine, separate-process limits and third-party
  licensing. Keep certificate checks, origin protections, CSP and renderer isolation.
- Update smoke checks to verify real Adobe version detection, Flash frame execution,
  native mode, controls, MIME playback, menus and address navigation.

## 1.0.0 — 2026-10-08

- Deliver the initial Windows x64 browser with a minimal dark interface, custom
  title bar, collapsible sidebar, address bar and new-tab search.
- Add Chromium browsing, multiple tabs, back/forward/reload, closed-tab recovery,
  bookmarks, history, downloads, find, print, zoom and settings.
- Add a Flash Library and a dedicated local/remote SWF player with pause, restart,
  mute and fullscreen.
- Bundle Ruffle 0.7.1 for Flash emulation and replace supported embedded Flash
  objects with its renderer. Genuine Adobe playback replaces it in 1.1.0.
- Create an original moving-square demo SWF for offline playback checks.
- Persist browser preferences and collections locally, without application
  analytics or background telemetry.
- Keep website renderers sandboxed without Node.js access, validate control IPC,
  retain certificate/CSP protections and contain local companion-file access.
- Provide keyboard shortcuts and a configurable NSIS installer with desktop and
  Start menu shortcuts, SWF association, uninstall support and retained user data.
- Provide npm development/build commands, a portable build target, MIT source
  licensing, third-party notices, unit tests and real-app smoke checks.
- Verify URL parsing, forbidden schemes, traversal protection, SWF headers, saved
  data, browsing, tabs, bookmarks, history, find, downloads and Flash fixtures.

## Archive provenance

All original installers and source snapshots were retained locally. Their file
names, versions, build timestamps, sizes and SHA-256 digests are recorded in
[docs/version-manifest.json](docs/version-manifest.json). The Adobe DLL is not in
the Git source tree or source ZIPs and is not covered by the application MIT license.

Public repository documentation and the import manifest were added during release
preparation. They do not change the delivered 1.7.3 application or installer.
