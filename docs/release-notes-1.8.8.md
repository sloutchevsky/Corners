# Flashborn 1.8.8

- Stop embedded services such as Meet in Gmail from opening notification dialogs
  over another website. Regular site permission choices survive restart, and
  simultaneous requests share one prompt. Background tabs and active window
  drags cannot launch a new permission dialog. Flashcognito choices remain
  temporary, and Clear site data resets permission choices for that session.
- Protect the native title-bar move/resize loop from delayed Flash focus
  transfers. Close transient browser popups before caption dragging begins,
  and move only the independent Flash surface during window movement instead
  of repeatedly updating every embedded page's bounds and visibility.
- Keep sidebar text geometry stable during expansion and reveal labels with
  the pane, retaining the existing 190 ms animation and fixed icon positions.
- Use cool grey History and Downloads labels in Flashcognito, with subdued
  pages matching the private new-tab page in both themes.
- Keep the installer configuration, NSIS include, publisher metadata and build
  workflow from 1.8.6 unchanged. No website background overrides were added.

## Installer size audit of the extension update

All sizes below are bytes (MB in the final column means 1,000,000 bytes).
An isolated copy of the packaged 1.8.7 app was rebuilt with the same installer
settings, omitting only `src/extensions/adblock.crx`. This audit copy is not
a distributable app. Original 1.8.6 and 1.8.7 installers were retained.

| Measurement | Bytes | MB |
| --- | ---: | ---: |
| 1.8.6 installer | 168,876,840 | 168.88 |
| 1.8.7 installer with AdBlock | 245,660,485 | 245.66 |
| 1.8.7 audit copy without AdBlock | 169,230,726 | 169.23 |
| AdBlock bundle contribution | 76,429,759 | 76.43 |
| Extension support and other 1.8.7 code changes | 353,886 | 0.35 |
| Total increase | 76,783,645 | 76.78 |

AdBlock accounts for approximately 99.54% of that increase. The remaining
0.46% includes extension integration, its ZIP reader dependency and the small
upload/private-icon changes in 1.8.7; it is not exclusively extension code.
This measures installer size, not AdBlock's extracted files on disk.
