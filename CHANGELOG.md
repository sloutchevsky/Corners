# 1.14.27

160 px drawer, stable navigation on new tabs, controls beside the URL field, and retractable corners and scrollbars. First release in the Corners repository.

# 1.14.26

Clear the unused 15 px perimeter with a transparent host, repair reset input masks, and mask special-page scrolling 15 px inside both vertical window edges.

# 1.14.25

Use a single masked browser window for the 15 px frame, both resize corners and scrollbars. Keep functional hit targets inside the host and visible when maximized; give each corner independent hover feedback.

# Corners / Flashborn Browser version history

This history covers releases from 1.0.0 to 1.14.24. Historical updates through 1.7.3 are assigned
to versions by comparing the archived source ZIPs, their READMEs and the recorded
development requests. Dates are the retained installer build dates in New York
time. Historical Git commits are imports of these snapshots, not a recovered
record of the original individual edits. Import timestamps are not backdated.

Only delivered changes are listed as releases. The experimental serif bolt was
deferred; the production application still uses the simple lightning bolt.

## Release index

| Version | Build date | Main changes |
| --- | --- | --- |
| [1.14.24](#11424-2026-10-27) | 2026-10-27 | Working corner drags and undocking, exterior scrollbars, flat drawer icons and neutral UI branding |
| [1.14.23](#11423-2026-10-27) | 2026-10-27 | Corners branding, two external translucent resize corners, edge scrollbars, special-page Refresh and retained Gallery searches |
| [1.14.22](#11422-2026-10-27) | 2026-10-27 | Compact special pages, transparent shared Gallery stage, single falling objects and opaque theme-tinted thumbnails |
| [1.14.21](#11421-2026-10-26) | 2026-10-26 | Live Gallery maximize/fullscreen rendering, animated XLG release, repeat-selection prevention and bottom-weighted blocks |
| [1.14.20](#11420-2026-10-26) | 2026-10-26 | Four-position quarter-turn theme switch, transparent inline icon controls and live high-contrast Gallery updates |
| [1.14.19](#11419-2026-10-26) | 2026-10-26 | Repaint the Gallery live during window resizing and sidebar changes instead of enlarging a frozen preview |
| [1.14.18](#11418-2026-10-25) | 2026-10-25 | Cropped thumbnails, persistent collapsed previews, theme and contrast switches, and a clear top bar |
| [1.14.17](#11417-2026-10-23) | 2026-10-23 | Connect the new Gallery address and use consistent borderless fields that brighten on focus |
| [1.14.16](#11416-2026-10-23) | 2026-10-23 | Fade-free menu slide with normal window grouping, Flash Gallery branding, larger title and shared field focus style |
| [1.14.15](#11415-2026-10-23) | 2026-10-23 | Clear bolt-button background and a masked sliding menu that follows caption drags |
| [1.14.14](#11414-2026-10-23) | 2026-10-23 | Dedicated Support page, spinning gold dollar coin, round amount controls and persistent supporter confirmation |
| [1.14.13](#11413-2026-10-23) | 2026-10-23 | Taller sidebar fade, configurable tab cleanup, proportional Flash resize previews and flush menu placement |
| [1.14.12](#11412-2026-10-23) | 2026-10-23 | Borderless search fields and one continuous top/left/bottom frame in both themes |
| [1.14.11](#11411-2026-10-23) | 2026-10-23 | Round animated Go button, solid shadow-free edges and stable Flash sidebar/resize transitions |
| [1.14.10](#11410-2026-10-23) | 2026-10-23 | Distinct Flashborn native executable identity to replace cached FlashBrowser names and red icons |
| [1.14.9](#1149-2026-10-23) | 2026-10-23 | Square menu with one sliding edge-to-edge highlight; Flashborn native process name and icon |
| [1.14.8](#1148-2026-10-22) | 2026-10-22 | Keep inactive Flash windows fully offscreen during collapse and resizing |
| [1.14.7](#1147-2026-10-22) | 2026-10-22 | Remove Flash surface resize handles, tighten the menu icon, and use square controls with full-width sidebar highlights |
| [1.14.6](#1146-2026-10-22) | 2026-10-22 | Remove the native thick frame and its visibility toggling; carry live Flash through browser window transitions |
| [1.14.5](#1145-2026-10-22) | 2026-10-22 | Remove the extra side and bottom frame when selecting Flash tabs while retaining edge resizing |
| [1.14.4](#1144-2026-10-22) | 2026-10-22 | Stable Flash frame activation, matching native window theme and complete Alt+Tab previews |
| [1.14.3](#1143-2026-10-22) | 2026-10-22 | Compact collection rows with saved site pictures, file-type download tiles and sliding globe/lock placeholders |
| [1.14.2](#1142-2026-10-21) | 2026-10-21 | One sliding lower-sidebar selection and a theme-aware fade above the buttons |
| [1.14.1](#1141-2026-10-21) | 2026-10-21 | Load hosted Flash Library inside its special pane and keep a single page selection |
| [1.14.0](#1140-2026-10-21) | 2026-10-21 | Hosted editable Flash Library with live Freedom + Partners banner and 50% transparent drag previews |
| [1.13.8](#1138-2026-10-21) | 2026-10-21 | Clear special-page addresses, enlarge page titles and simplify Flash Library controls |
| [1.13.7](#1137-2026-10-21) | 2026-10-21 | Pills for all browser search fields, private-tab grey lock placeholders, and a 20px menu with matching thin strokes |
| [1.13.6](#1136-2026-10-20) | 2026-10-20 | Animated dots-to-lines menu, shared remembered file-dialog folder and pill-shaped new-tab searches |
| [1.13.5](#1135-2026-10-20) | 2026-10-20 | Native second-click menu dismissal and taller, gapless tab rows with flush thumbnails |
| [1.13.4](#1134-2026-10-19) | 2026-10-19 | Keep opaque Flash surfaces ready across tab changes; fix second-click menu dismissal |
| [1.13.3](#1133-2026-10-19) | 2026-10-19 | Prevent the browser frame covering Flash during tab and menu activation |
| [1.13.2](#1132-2026-10-19) | 2026-10-19 | Restore cached tab thumbnails across sessions; keep tab rows and glyphs fixed during sidebar collapse |
| [1.13.1](#1131-2026-10-19) | 2026-10-19 | Remove floating previews, soften light hover and repair tab/card dragging with pointer capture |
| [1.13.0](#1130-2026-10-19) | 2026-10-19 | Firstborn-inspired tabs, wider sidebar, live thumbnails, hover snapshots and insertion-line reordering |
| [1.12.2](#1122-2026-10-18) | 2026-10-18 | Repair Flash being covered by the browser frame after menu or address-bar activation |
| [1.12.1](#1121-2026-10-18) | 2026-10-18 | Stable Flash/menu stacking, prepared hidden handoffs, more library spacing and aligned coffee controls |
| [1.12.0](#1120-2026-10-18) | 2026-10-18 | Whole-browser Flash activation, prepared tab handoffs, editable portfolio headings and creator credits, fixed thumbnails and collapsible coffee support |
| [1.11.0](#1110-2026-10-18) | 2026-10-18 | Quieter navigation, standalone SWF playback, browser-bound Flash windows, richer library cards and saved per-page quality |
| [1.10.1](#1101-2026-10-18) | 2026-10-18 | Reliable local Flash reload/restore, an always-available detection bolt, light About color and remembered Add-page folder |
| [1.10.0](#1100-2026-10-17) | 2026-10-17 | Inline About support, editable portable Flash library, saturated thumbnail placeholders and a menu without scrolling |
| [1.9.0](#190-2026-10-17) | 2026-10-17 | Bundled headline font, quieter clipboard copying, built-in Flash card and selective browsing-data deletion |
| [1.8.12](#1812-2026-10-16) | 2026-10-16 | Theme hover preview and simpler empty History/Downloads pages |
| [1.8.11](#1811-2026-10-16) | 2026-10-16 | Hovering sidebar divider and Helvetica Neue Bold page headlines |
| [1.8.10](#1810-2026-10-16) | 2026-10-16 | Visible background Flash, adjacent linked tabs and no close-button flash during expansion |
| [1.8.9](#189-2026-10-16) | 2026-10-16 | Subtle light-mode scrollbars, explicit new private-tab label and outlined Flash-off bolt |
| [1.8.8](#188-2026-10-16) | 2026-10-16 | Remember site permissions, protect title-bar dragging, smooth sidebar expansion and subdue private History/Downloads |
| [1.8.7](#187-2026-10-16) | 2026-10-16 | Website attachment drops, extension management, official AdBlock and silver private-session icons |
| [1.8.6](#186-2026-10-16) | 2026-10-16 | Preserve website backgrounds independently of browser themes |
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

## 1.14.24 (2026-10-27)

Moved development to C:\Corners. Fixed corner drag input, double-click/drag restoration from maximized and fullscreen states, and hover exit. Moved primary scrollbars into owned exterior strips with track paging and thumb dragging. Removed the requested UI bolts and wordmarks, flattened drawer icons and neutralized beige colors while preserving app-icon assets. See [release notes](docs/release-notes-1.14.24.md).

## 1.14.23 (2026-10-27)

Renamed the browser Corners while retaining its upgrade identity and saved profile. Added permanent top-left and bottom-right resize corners outside restored windows and inside maximized/fullscreen windows. Both are half-transparent at rest and fully opaque on hover or drag. Removed the lower frame and added square edge scrollbars, lighter hover and pressed colors, page-track scrolling and special-page Refresh. Stage clicks dismiss the menu. The Gallery initially features Square ’99 and retains matching objects and the featured preview while searching. See [release notes](docs/release-notes-1.14.23.md).

## 1.14.22 (2026-10-27)

Compacted special-page controls and moved the Gallery into the shared HTML stack below browser controls and the menu. Falling tiles remain the same objects from the window top through their previews. The Gallery uses a transparent stage, compact title/count/search/year layout, and opaque theme-tinted resting artwork. See [release notes](docs/release-notes-1.14.22.md).

## 1.14.21 (2026-10-26)

The Gallery remains live and pixel-exact through maximize, restore and fullscreen transitions instead of enlarging a frozen preview. Its heading no longer retains a forced GPU layer. Year changes animate enlarged tiles back to their normal dimensions during free fall, selected year controls ignore repeat activation, and bottom-corner mass differences give released blocks varied turns. Loose tiles share one size throughout resizing, briefly hold the same bottom-right anchor, then settle at the new pile mark. Stationary boundaries and supported contact islands sleep without continuous jitter.

## 1.14.20 (2026-10-26)

The original theme glyph advances clockwise by 90 degrees through black, dark grey, white and light grey, with a reversible hover preview. Its unfilled half remains transparent and its fill and outline use white in dark modes and black in light modes. Inline icon hover backgrounds are removed. The browser now publishes contrast-only changes to every Gallery surface, so both high-contrast modes update without reloading the collection.

## 1.14.19 (2026-10-26)

The Flash Gallery stays live during Windows edge resizing and sidebar expansion or collapse. Its renderer receives the changing viewport continuously, letting tiles wrap while the window moves. It no longer stretches a frozen page and jumps to the final layout after release. The Gallery's hover geometry and two-column preview sizes are retained. Flash movie composition, layering and minimize/restore behavior keep their existing path.

## 1.14.18 (2026-10-25)

Tab thumbnails crop the rightmost 10% before downsizing, for both modern websites and native Flash. The selected thumbnail remains visible in the collapsed sidebar, and hovering other tabs slides their thumbnails in and out. Full window previews remain uncropped.

Settings has an Appearance group with Dark theme and High contrast switches. Contrast defaults to off and retains the existing greys. Turning it on uses black backgrounds in dark mode and white in light mode. Both preferences persist, and the toolbar theme button stays synchronized with Settings. The top bar tagline is removed.

## 1.14.17 (2026-10-23)

- Connect the Flash Gallery pane and its local editing bridge to `flash.gallery.html`. Migrate saved tabs at the former address into the Gallery pane.
- Share one field style across the top address bar, find bar, special pages and hosted Gallery, including editor fields and custom support amounts.
- Remove field borders, outlines and focus shadows. On focus, brighten light fields from 80% grey to white and dark fields from 20% to 30% grey, without moving or resizing controls.

## 1.14.16 (2026-10-23)

- Use a compositor slide with the sidebar's 190 ms timing, without fading the menu. Prepare and reuse the transparent popup outside the desktop, avoiding Windows' show transition on every open.
- Keep the menu owned by Flashborn in the normal window order, so other windows cover the menu and browser together. Keep it aligned through caption movement.
- Rename Flash Library to Flash Gallery throughout the interface and double the Gallery page heading from 39 px to 78 px.
- Temporarily replace the featured SWF with the supplied Pearl Jam Ten Game image. Embed it in the hosted HTML and link its image and caption to the existing site.
- Give Gallery and other page fields a clear resting border and one thin border on focus, without the previous outer focus ring. Preserve pill-shaped search and amount fields.

## 1.14.15 (2026-10-23)

- Remove the persistent beige/brown background from the Flash toggle beside the address bar. Only the standard grey hover background remains in both themes.
- Slide the menu down from beneath the top frame and back up on click-out, Escape or a second button click. Clip the content inside its transparent native popup so it stays above live Flash without covering the top frame.
- Keep the menu flush with the browser's right edge throughout caption drags. Reverse a running animation when toggled again; honor reduced-motion preferences and dispose the popup on minimize, resize or shutdown.

## 1.14.14 (2026-10-23)

- Replace the bottom-left Settings option with Support Flashborn and an outlined gold dollar coin that turns once on hover and once every minute. Settings remains available in the browser menu.
- Move the donation controls out of About to a dedicated Support page. Add a Support link at the bottom of About and the last menu item below About.
- Make preset amount buttons circular and the custom amount field pill-shaped.
- Explain below the heading that confirming the first donation with “I’ve donated” hides the sidebar Support entry and stops its reminders on this device. The choice survives restart, while About and menu links remain available. Opening checkout alone does not record a donation.

## 1.14.13 (2026-10-23)

- Increase the gradient above the lower sidebar from 24 px to 72 px.
- Add automatic closure of inactive tabs from the bottom, enabled by default with a 20–100 slider set to 50. Keep the current tab, audible tabs and active downloads. Closing disposes native Flash processes; regular closed tabs can be reopened with Ctrl+Shift+T.
- Support saving and restoring up to 100 tabs, including their thumbnails.
- Preserve proportions in the live Flash resize preview with a centered source crop that fills the viewport, rather than stretching width and height independently.
- Place the menu directly below the top frame and flush with the right edge. Short windows scroll the menu rather than shifting it over the toolbar.

## 1.14.12 (2026-10-23)

- Remove search focus rectangles, new-tab search shadows and borders, and the borders around the home-page bolt tiles in regular and Flashcognito pages.
- The top URL field has no border, outline or shadow, including when focused, in both themes.
- Match the title, navigation and status bars to the sidebar background with no seams or separator lines, preserving the open right edge.

## 1.14.11 (2026-10-23)

- The Go button is round again. Its arrow turns 90° clockwise on hover and reverses on rollout; reduced-motion preferences are respected.
- Sidebar animation and native resizing use the existing live compositor while the independent Flash input surface stays parked. The final viewport is resized and painted before input returns, preventing stale sizes from sticking out of the right edge.
- Preserve the browser's own right-edge resize input and paint that strip with the live Flash backing. Native window decoration and shadow are disabled, retaining one solid, square window without an outline appearing on transitions.
- Remove the menu's outer outline and shadow while retaining its square, sliding edge-to-edge selection.

## 1.14.10 (2026-10-23)

- The native Flash host is now `FlashbornNative.exe`, with matching Windows filename metadata. This gives the correctly branded helper a distinct path instead of reusing the legacy runtime path whose old name/icon can remain visible in Task Manager.
- Runtime preparation removes obsolete generated host executable names. Package verification rejects any remaining legacy hosts and verifies Flashborn's process names and gold icon resources.

## 1.14.9 (2026-10-23)

- The three-dot popup uses square native corners and a single edge-to-edge highlight with the lower sidebar's vertical animation. Hover previews, click selection, rollout, keyboard navigation and reduced motion share the same highlight.
- The bundled native Flash host now carries Flashborn's Windows process display name, product name and gold icon. The previous FlashBrowser label came from the inherited executable resources. The original Adobe player and third-party notices are preserved.

## 1.14.8 (2026-10-22)

- Inactive Flash windows stop following viewport size changes. Their parking position accounts for both the actual window size and any already queued resize, across mixed-DPI and negative-origin monitors.
- Parked windows retain their size and stack position; unexpected native movement is repaired. This removes the white desktop rectangle during sidebar collapse and large browser resizes while preserving visible Flash/menu layering.
- Register the hosted Library's shape stylesheet once per helper, rather than adding a load listener on every state publication.

## 1.14.7 (2026-10-22)

- The Flash surface no longer exposes independent resize handles. The browser controls its size, including during sidebar collapse and display scaling changes, with the existing Flash layering preserved.
- The menu's three horizontal lines match the sidebar collapse icon's width and stroke, with half their previous spacing. Hover, click, outside dismissal and reverse animation are retained.
- Lower sidebar selections and New Tab hover highlights are square and span the entire pane. Buttons and cards, including the hosted Flash Library inside Flashborn, have sharp corners; search fields retain their pill shape.
- Delivered as a downloadable installer and installed for Vas without administrator elevation. The older all-users installation remains in place; Vas's shortcuts launch the new version.

## 1.14.6 (2026-10-22)

- Create the browser without the native thick resize frame and prevent Windows from reintroducing that style during window state changes.
- Delete the nonclient frame composition toggling that caused the border to fight between visible and invisible while dragging or collapsing the sidebar.
- Retain the existing viewport cutout during a caption move instead of rebuilding it against lagging cross-process geometry.
- Carry a live compositor representation of Flash with the browser through minimize, maximize and restore while parking the independent input surface until the transition finishes.
- Preserve the movie runtime, Flash/menu ordering, private-page cleanup, Alt+Tab previews and borderless fullscreen.

## 1.14.5 (2026-10-22)

- Keep Windows' normally invisible side and bottom resize margins transparent after applying the Flash viewport cutout or selecting a Flash tab.
- Recover native frame composition outside Windows callbacks, coalesce repeated notifications and ignore notifications caused by the recovery itself.
- Preserve resize input, browser geometry, the Flash cutout and existing movie/menu stacking rules.

## 1.14.4 (2026-10-22)

- Avoid duplicate frame focus transfers and prevent Windows temporarily raising an already correctly arranged browser frame over Flash during internal activation.
- Synchronize the Windows frame theme with the selected browser skin at startup and after theme changes, removing the dark frame left in light mode.
- Supply Windows with a complete browser-and-Flash bitmap for Alt+Tab, taskbar thumbnails and Peek. Retain the completed preview while minimized and discard old content when changing pages.
- Keep the existing Flash viewport cutout, tab handoffs, menu placement and movie stacking rules.

## 1.14.3 (2026-10-22)

- Give Bookmarks, History and Downloads compact two-line rows with flush 2:1 thumbnails.
- Keep the last captured site picture for Bookmarks and History after closing tabs or restarting; use a globe when no picture exists.
- Show grey download tiles with archive, picture or globe icons.
- Stop capturing New Tab pages. Use a single globe or lock that slides between collapsed and expanded centres, with selection-grey tiles in dark mode and white tiles with black icons in light mode.
- Keep visited-site pictures within the existing bounded thumbnail cache, exclude private captures, and prune pictures when their last saved reference is removed.

## 1.14.2 (2026-10-21)

- Remove the divider between Downloads and Settings.
- Slide one shared highlight between lower sidebar buttons on hover; clicking selects the page and rolling out restores its highlight.
- Add a subtle grey-to-transparent fade above the lower buttons in light and dark modes.
- Preserve highlight alignment in the collapsed sidebar and respect reduced-motion preferences.

## 1.14.1 (2026-10-21)

- Load hosted Flash Library in its own special-page pane without adding a browser tab or replacing the previous website.
- Select only the visible special page, or the active regular tab when no special page is open.
- Reuse the Library pane across page switches, preserve its edits and native Flash playback, and isolate its Flashcognito instance.
- Migrate restored Library tabs from the previous version into the special pane; omit the pane from saved tab sessions.

## 1.14.0 (2026-10-21)

- Open Flash Library at `https://flashborn.sloutchevsky.com/flash.library.html`, with that HTML address in the URL field.
- Show the existing live Freedom + Partners SWF in a rounded banner, followed by its caption, portfolio introduction and editable cards.
- Preserve saved collections, thumbnails and native file dialogs. Save card edits and ordering locally in Flashborn; the standalone HTML also supports editing in ordinary browsers.
- Show a card following the pointer at 50% opacity while reordering cards and tabs, and remove it on drop or cancellation.

## 1.13.8 (2026-10-21)

- Show an empty address field with the New Tab search placeholder on special pages. Reset stale address suggestions when switching pages, preserve an active search draft during ordinary updates, and restore the website address when returning to its tab.
- Enlarge special-page headings by 30%, including the About wordmark.
- Capitalize Flash Library in the sidebar, browser menu and page title.
- Remove the Library folder button and the portfolio title above the cards. Retain the editable subtitle and existing saved collection metadata.

## 1.13.7 (2026-10-21)

- Use pill-shaped address, new-tab, find-in-page, collection-filter and library URL fields.
- Remove the New Tab button's resting fill and border; use the lower sidebar navigation buttons' hover treatment in both themes.
- Replace every Flashcognito thumbnail with a centered lock on a solid 50% grey, 2:1 rectangle. Keep private tabs out of thumbnail capture and reject seeded or late-arriving private frames.
- Make the menu's expanded symbol exactly 20×20 pixels, with evenly spaced lines matching the collapse icon's stroke. Transition the bolder dots into thin round-ended lines while retaining reversible hover and open-menu behavior.

## 1.13.6 (2026-10-20)

- Rotate the menu dots 90 degrees and extend them into three round-ended horizontal lines on hover. Keep the lines while the menu is open and reverse the animation on rollout or outside dismissal.
- Share the last selected folder across Open file, HTML source, library image, extension-folder and download Save As dialogs. Preserve it across restarts and fall back when a folder no longer exists.
- Give normal and Flashcognito new-tab search fields semicircular ends concentric with the Go button. Align the footnote lock with the first text line.

## 1.13.5 (2026-10-20)

- Show the three-dot menu as a nonactivating overlay so its second click closes it without a native focus/blur race.
- Preserve outside-click and app-switch dismissal; route keyboard navigation and Escape through the focused browser, with no click debounce or native activation latch.
- Fill the vertical gaps with 43px tab rows and matching 86×43 thumbnails. Retain their 2:1 proportions and the previous row-center spacing in expanded and collapsed states.
- Align reordering insertion lines with the touching row edges. Installer configuration and Flash rendering are unchanged.

## 1.13.4 (2026-10-19)

- Keep native Flash compositors opaque and mapped across tab changes. Background movies are parked outside the virtual desktop at their existing size and retain timer throttling.
- Prepare the incoming movie behind the outgoing page, then reveal it by moving the old surface away. Remove per-switch transparency, ignore-mouse style changes and native show/hide calls.
- Keep the outgoing page until actual frame preparation succeeds, instead of treating a short timeout or a failed capture as a ready frame.
- Honor actual scaled Windows viewport bounds without a separate resize frame or shadow; cancel preparation cleanly when minimizing.
- Close the three-dot menu on a second press or an outside click, including activation from Flash, while permitting immediate reopening and keyboard use.
- Add final-desktop pixel regression checks for blank frames and an outgoing movie reappearing during a switch.
- Preserve installer configuration, tab thumbnails, sidebar styling, Adobe player bytes and process input isolation.

## 1.13.3 (2026-10-19)

- Prevent the opaque browser frame from briefly covering the independent Flash window during tab selection, address-bar focus or three-dot menu activation. Exclude only the already-painted Flash viewport from the frame's drawing and mouse-input region.
- Keep the outgoing movie visible until its replacement is presented. Restore the complete browser region for ordinary pages, new tabs, private new tabs, panels and errors. Preserve existing runtime, timeline and input isolation.
- Calculate the region from actual Windows pixel bounds, including invisible resize borders and display scaling. Clip to the overlap of the intended viewport and painted movie during movement and resizing. Apply changes after native window messages return, and repair a region reset by Windows.
- Verify actual OS regions, window order, real Adobe-rendered pixels and Windows mouse hit-testing through repeated tab/menu operations, sidebar animation, theme changes, resizing and fullscreen. Preserve the installer configuration, website colors, cached thumbnails and tab styling.

## 1.13.2 (2026-10-19)

- Save regular open tabs' last captured thumbnails in a bounded local cache and restore them on the next launch, including Flash thumbnails before their background pages load. Keep duplicate tabs' images separate.
- Keep Flashcognito thumbnails in memory only. Remove disk images when their tab closes, its page changes, or session restoration is disabled. Coalesce background disk writes and finish pending saves on exit without waiting for a renderer.
- Preserve a page's last picture while its renderer starts or is recreated; reject outdated captures and avoid replacing it with a loading frame. Capture completed pages even when the sidebar is collapsed.
- Keep tab rows at 40 px in both sidebar states and anchor their letters/icons at the same position throughout collapse and expansion. Preserve scroll position, clip horizontal overflow and match the short-window header spacing in both states.
- Make the selected tab's letter bold in both themes while preserving its color. Retain animated inline thumbnails, standard tab-title fonts, pointer reordering and the existing installer configuration.

## 1.13.1 (2026-10-19)

- Remove the floating tab-preview window and its UI assets. Keep animated thumbnails within the sidebar, including real Flash snapshots.
- Use the selected light grey at 50% opacity for hovered, unselected tabs in light mode. Preserve dark-mode hover styling.
- Replace internal HTML drag-and-drop with captured pointer dragging for tabs, Flash library entries, bookmarks and downloads. Support dragging by labels, thumbnails and card backgrounds, with an insertion line and edge scrolling.
- Keep ordinary clicks intact, suppress clicks after a drag, and cancel cleanly on Escape, pointer cancellation, focus loss or an invalid drop. Preserve edited fields and external file dropping.
- Avoid redundant chrome focus handoffs during a card/tab pointer gesture. Preserve saved order, the active tab and keyboard reordering.
- Verify reordering with actual Windows mouse input in all four collections, including a tab drag while Adobe Flash is playing. Preserve installer configuration and player binaries.

## 1.13.0 (2026-10-19)

- Widen the expanded sidebar to 320 px; retain the 68 px collapsed pane.
- Give the selected tab an 80 × 40 px, 2:1 live page thumbnail flush with the left window edge. Its square selection band matches the thumbnail height and reaches the page boundary, with a near-white band in light mode.
- Use one line in the standard tab font, with the selected title in bold and long titles truncated with an ellipsis. Keep titles anchored while hover memory usage appears to the left of Close.
- Slide thumbnails in from the left edge on hover, smoothly pushing the title right. Selection keeps the thumbnail open; rollout or deselection reverses the movement. Preserve each tab's DOM elements across state updates so the animation continues smoothly.
- Show page snapshots on hover without selecting the tab; dismiss immediately on rollout. Capture real Adobe Flash pixels directly from its renderer. Background Flash uses its last visible frame without showing or reloading the movie.
- Coalesce preview captures, discard stale navigation results, and keep previews in memory only. Discard a closed tab's images, including Flashcognito previews.
- Restore dragging for tabs, Flash library entries, bookmarks and downloads, with a straight insertion line, edge scrolling and saved order. Preserve keyboard reordering.
- Leave the separate About animation preview deferred. Preserve the installer configuration, Adobe player, website colors and Flash input isolation.

## 1.12.2 (2026-10-18)

- Fix the remaining menu disappearance when Windows activates the modern browser process. Windows can accept the asynchronous cross-process positioning request while leaving the Flash window behind the opaque browser frame. Repair the frame's position behind its live movie for activation of either browser process, including the three-dot menu and address bar.
- Retain the same player, movie state, keyboard focus and mouse capture. Do not hide or reload Flash to display a menu, attach legacy input queues, or make the movie globally topmost.
- Keep the repair out of unfinished tab handoffs and background applications. Add regression coverage for menu-process activation, native activation and those exclusions.
- Preserve the installer configuration, bundled player, website colors and the 1.12.1 library/About refinements.

## 1.12.1 (2026-10-18)

- Fix the outgoing Flash viewport being briefly raised back over the incoming movie at the end of a tab switch. Treat other movies and hidden windows as part of the browser's layer group, rather than requiring strict HWND adjacency.
- Show the incoming compositor transparently behind the outgoing surface, prepare a frame, repair its position and reveal it before releasing the previous movie. Chromium owns logical window visibility; the host can still hide an unresponsive surface without waiting for its message pump.
- Open the three-dot menu independently of the main frame's Windows ownership group. Opening the menu no longer raises the opaque browser frame over Flash. Apply the same independence to address suggestions and the zoom bubble; close transient controls explicitly when appropriate.
- Synchronize the Flash stack on frame activation and keep the movie in the ordinary Windows stack. Preserve separate input queues and stalled-runtime recovery.
- Triple the space between the Flash library toolbar and editable collection heading, from 32 to 96 pixels, moving the heading and cards down.
- Align the top Buy me a coffee link's right edge with the payment methods at wide and narrow window sizes.
- Select a custom donation amount on Enter with the same fill and inset border as preset choices. Keep the draft separate from the committed amount, and align currency symbols and numbers vertically within all circles and the custom pill.
- Add regression checks of actual native window order and real Adobe-rendered pixels during menu opening and tab switches. Preserve the installer configuration and website colors.

## 1.12.0 (2026-10-18)

- Bring the browser shell forward behind its Flash surface when Windows activates Flash, even when PPAPI consumes the click before page mouse events can report it. Keep both windows in the ordinary application stack, below other apps until activated. Preserve the separate input queues that protect browser controls from stalled Flash.
- Prepare the incoming tab's compositor frame while retaining the outgoing surface, then release the old surface after the replacement is shown. Cover Flash-to-Flash, Flash-to-modern and Flash-to-new-tab switches, cancel stale handoffs on rapid switches, and bound the wait so a stalled runtime cannot delay the shell.
- Prevent the retiring surface from accepting real page input during the brief handoff. Retain address editing, Flash dragging, reload and freeze recovery behavior.
- Add an editable Created by field beside Year. Cards show the year followed by the italic creator, such as `2006, Firstborn`.
- Keep thumbnails at 128 by 64 pixels across window sizes. Show descriptions on one line with an ellipsis, retaining the full saved text for editing.
- Narrow the library search to Find in library, prevent overlap with the action buttons, and add space above the cards.
- Add editable collection title and subtitle, initially Vas Sloutchevsky and Flash design portfolio. Save them with creator credits and the existing card fields in the local Flash Library manifest; older collections retain their entries and images.
- Turn Buy me a coffee into a small disclosure below the MIT license. It starts closed; its twistie and the coffee link at the top open it. Existing checkout placeholders remain unchanged.
- Preserve the installer configuration, Adobe player bytes and website-authored colors.

## 1.11.0 (2026-10-18)

- Keep Flash immediately above its own browser shell in the ordinary Windows stack, without globally marking its window always on top. Other applications can cover the browser normally, while browser menus remain above Flash. Preserve separate Windows input queues so a stalled movie cannot block browser controls.
- Restore standalone SWF playback inside normal browser tabs through file opening, dragging and dropping, file-launch arguments and direct SWF URLs. Register Flashborn as an available SWF application per user on first installed launch, without changing the installer or overwriting an existing default application.
- Extract the movie's background from FWS, CWS and ZWS SWF metadata when available; use light grey otherwise. Preserve movie bytes, timelines and relative companion-file loading. No standalone Flash toolbar or eyedropper is reintroduced.
- Open newly created tabs, linked tabs and duplicate tabs at the top of the sidebar. Preserve existing order on restart and keep manual drag reordering.
- Remove drag-dot handles from library, bookmark and download cards while retaining row dragging and Alt+Up/Down reordering.
- Increase Flash library titles by 20%, add an editable year, and let the longer description wrap across two visible lines. Align the text block with the thumbnail top and save all fields in the local manifest.
- Remember quality separately for each open Flash tab and save regular-page choices after closing a tab. Restore them when reopening or restarting; private choices remain temporary and do not change other tabs.
- Turn search summary generation off by default for new profiles. Preserve an existing user's explicit setting and keep website backgrounds independent of browser themes.
- Include the 1.10.0 About support/library improvements and 1.10.1 reload fixes in this public release. Payment methods remain disabled until real provider links are configured.

## 1.10.1 (2026-10-18)

- Fixed local HTML Flash reload, session restore and duplication calling the library's add-only function. Each now opens the original HTML in a working player in the intended tab, without adding library records or extra tabs.
- Enabled the Flash bolt on every tab, including new tabs and Flashcognito. A click completes a spin; pages without detected Flash stay hollow, while detected Flash stays filled and can restart its player. Presence checks inspect document elements without calling into the Flash movie.
- Matched secondary About text and support controls to the sidebar's brown in light mode, retaining tan in dark mode.
- Remembered the Add a Flash page file browser's last selected folder across cancellations and app restarts.
- Retained the existing installer configuration and website background behavior.

## 1.10.0 (2026-10-17)

- Added the About support section with circular amount choices, a capsule-shaped custom amount field and One-time, Monthly and Yearly radio buttons. The coffee link at the top scrolls smoothly to the divider and support heading.
- Aligned the support heading and subheading with the body; removed the lower cup icon. Support controls and secondary About information use the same tan in both themes. The logo, motto and dedication retain their light/dark ink.
- Added configurable PayPal, Venmo and Stripe Link checkout destinations. As requested, payment links remain blank and unconfigured methods are disabled. Checkout opens directly at the provider when a verified link is supplied; the app does not collect credentials or simulate payment success. Recurring support requires provider-configured recurring links.
- New Flash library entries appear immediately in the collection without opening a tab. Titles come from the HTML page when available.
- Added persistent thumbnail placeholders with random hues and matching perceptual lightness/chroma. Thumbnails have straight corners; a plus appears on hover/focus to choose an image.
- Added inline editing for the title, small line and page address. Custom titles are protected from later automatic title updates.
- Saved the collection in a separate local `Flash Library` folder containing `manifest.json` and `images/`, with migration from older profiles and an optional prepackaged portfolio seed.
- Applied the larger Flashborn-font item headings and matching supporting-line rules across Flash library, Bookmarks, History and Downloads.
- Fitted the complete three-dot menu to its contents without a vertical scrollbar.
- Kept the installer target, NSIS options, elevation behavior and installer include unchanged.

## 1.9.0 (2026-10-17)

- Publish the accumulated 1.8.6–1.8.12 changes, including extension architecture,
  the official bundled AdBlock extension, improved private sessions, attachment
  drops, sidebar animations and Flash visibility. Retain native Adobe playback
  and explicit sRGB defaults in both engines.
- Replace fixed SVG headline artwork with bundled Flashborn 75 Bold text across
  all former title-artwork pages, preserving -20 tracking, original glyphs,
  hinting and 1,247 kerning pairs.
- Allow ordinary clipboard writes from the active page without repeated modal
  permission prompts. Keep clipboard reading separately permissioned and honor
  explicit write blocks and inactive/cross-origin boundaries.
- Add a built-in Adobe Flash Player card to Extensions with a checked, disabled
  grey switch. Website Flash mode remains controlled by the toolbar bolt.
- Add Delete browsing data... to the three-dot menu. Combine Privacy into three
  independently selectable categories and one Delete data button, with matching
  behavior in both engines and private-session isolation.
- Inset the search-engine dropdown arrow. Preserve the installer configuration,
  NSIS include, packaging workflow and website-authored page colors.

## 1.8.12 (2026-10-16)

- Remove the "A clean slate" and "All caught up" empty-state headings and their
  title artwork from History and Downloads in regular and Flashcognito sessions.
- Preview the theme icon's half turn on hover without changing the theme.
  Leaving reverses the preview; clicking changes the theme and retains the
  selected orientation, matching the sidebar toggle's interaction. Keep the
  icon fixed in place and honor reduced-motion preferences.
- Preserve the installer configuration and website styling.

## 1.8.11 (2026-10-16)

- Keep the sidebar control to the left of the wordmark with its outer icon and
  button fixed in place. Animate only the inner divider between mirrored right
  and left positions on hover; clicking retains the selected sidebar state.
- Bundle fixed title artwork from Helvetica Neue LT Com 75 Bold with -20 tracking
  for new-tab, Flashcognito and built-in page headlines, so installed fonts cannot
  change their appearance on other machines. Match the reference's
  42.15-pixel headline size on larger new-tab pages and retain smaller panel
  headings. The brand wordmark keeps its original extended face.
- Preserve the installer configuration and website styling.

## 1.8.10 (2026-10-16)

- Hide tab close buttons throughout sidebar animation, without briefly exposing
  every tab's X during expansion. Restore normal hover/active visibility when
  the transition finishes.
- Keep the active Flash page visible and playing when another application takes
  focus. Demote its independent surface into the ordinary window stack directly
  above the browser shell, allowing other applications to overlap it normally.
  Minimize, tab changes and internal panels still hide the viewport when needed.
- Clicking a background Flash surface raises the browser without transferring
  focus or capture away from the plugin's mouse-down.
- Place new tabs opened by modern or native Flash links immediately below the
  actual source tab. Include scripted popups, context-menu links and private
  sessions, preserving other tab order and session isolation.
- Preserve the installer configuration and website-authored page colors.

## 1.8.9 (2026-10-16)

- Use subtle grey thin scrollbars for the tab stack and scrollable browser UI
  text boxes in light mode.
- Rename the three-dot menu command to **New Flashcognito tab**.
- Show the toolbar's spinning bolt filled in native Flash mode and outlined in
  modern mode. Keep the same fixed lighting, two-second loading animation,
  complete-turn stop and silver private-session material. Identify the button
  explicitly as the Flash toggle in its tooltip, with its current on/off state.
- Hide horizontal overflow in the tab stack throughout sidebar expansion,
  preserving vertical scrolling and fixed icon alignment.
- Preserve the installer configuration and website-authored page colors.

## 1.8.8 (2026-10-16)

- Suppress cross-origin embedded notification prompts such as Meet in Gmail;
  remember regular site choices across restarts and coalesce duplicate requests.
  Private choices remain temporary, and clearing site data resets permissions.
- Prevent new permission dialogs and delayed Flash focus transfers during
  native title-bar dragging. Close transient browser popups before dragging and
  avoid resetting embedded page bounds/visibility on each window move.
- Smooth sidebar expansion with stable text geometry and gradual label reveal.
- Subdue Flashcognito History and Downloads labels and pages in both themes.
- Measure the 1.8.7 installer increase: 76.43 MB from bundled AdBlock and about
  0.35 MB from extension support plus other small code changes. See the
  [size audit](docs/release-notes-1.8.8.md).
- Preserve the working installer configuration and website-authored page colors.

## 1.8.7 (2026-10-16)

- Let websites handle file drops before the browser's local-file fallback, including document and window drop handlers. Preserve native file-input and editable-field drops. Gmail can receive the attachment and finish its drag-overlay cleanup instead of losing the drop to a new browser tab.
- Add Extensions to the three-dot menu and support compatible unpacked Chrome extensions with persistent installation, enable/disable, reload, options, popup and removal controls. Keep extensions out of Flashcognito and the separate legacy runtime.
- Bundle the official AdBlock 6.49.0 Chrome Web Store package. Verify its publisher proof and pinned digest; restore its publisher key when unpacking. Leave its scripts and filter data unchanged. Supply browser tab/navigation/menu APIs and connect Chromium's native DNR matching to Electron's requests, including document allowlists for the official pause/resume controls. Chrome extension support remains partial; specialized rules, counters and cloud sync are not advertised as Chrome-equivalent.
- Turn History and Downloads silver in Flashcognito while retaining the shared gold icons and their fixed-light animations elsewhere.
- Preserve the complete 1.8.6 installer build configuration and NSIS include. Retain the website-background fix and sRGB behavior.
- Add real file-drop, upload-overlay, ad blocking, allowlisting, extension restart/removal and private-isolation regression checks.

## 1.8.6 (2026-10-16)

- Restore the normal white backing for transparent website canvases. A hard-coded dark backing made pages with transparent HTML/body backgrounds appear dark even when the site was designed for a white canvas.
- Apply the neutral backing to both the modern browser view and the legacy Flash host. Keep browser-theme changes confined to Flashborn's interface; preserve author backgrounds, site-declared color schemes, and page state without injecting website CSS or reloading pages.
- Add a pixel-based regression check covering transparent, explicitly colored, dark, and site-declared dark-scheme pages in modern, legacy, and private tabs across both themes. The transparent-page case fails against the previous modern backing and passes with the fix.
- Reaudit the unsigned installer warning. The retained v1.7.3 installer has the exact SHA-256 published by GitHub, and the NSIS configuration did not change between v1.7.3 and v1.8.0. Older local copies lack Internet-origin metadata; the inspected v1.8.0 GitHub download has ZoneId=3. This release does not claim to eliminate SmartScreen's reputation warning. No signing, Windows protection changes, or download-marker changes are used.

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
