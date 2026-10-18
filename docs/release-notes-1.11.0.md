# Flashborn 1.11.0: A quieter way to browse

Flashborn keeps navigation simple. Tabs live on the left, where their titles have room to be read. New tabs appear at the top, and dragging puts them in your preferred order. The title bar stays clear of tabs and other distractions, leaving room to grab and move the window.

Web pages, local documents and Flash movies stay in one browser window, rather than scattering windows across the desktop. The compact interface uses a flat three-dot menu with inline controls and a settings page limited to the essentials. Official AdBlock is bundled and enabled in regular modern tabs. Address completion offers familiar pages and search predictions, with no AI mode. Both engines start in sRGB without extra setup.

## Playback and window fixes

- Flash stays with its browser window. It can no longer float above unrelated applications; browser menus remain above it.
- Standalone SWFs are back. Drop HTML or SWF files into the window, use Open File, or open a SWF with Flashborn from Windows. Movies play in tabs with their original Adobe player, without changing their timelines.
- Movie background colors are read from uncompressed, zlib-compressed and LZMA-compressed SWFs. Missing or unreadable optional metadata falls back to light grey.
- Flash quality is remembered per page, including after closing and reopening its tab. Existing open tabs keep their own choices. Private-tab choices stay temporary.
- Local Flash reload and restart recovery fixes from 1.10.1 are included.

## Library and everyday polish

- Larger library titles, an editable year and a description that wraps to two lines, all aligned with the thumbnail top.
- Editable titles, descriptions, addresses and images saved in a separate local Flash Library folder, ready for a curated portfolio.
- Cleaner draggable cards without dotted handles. Dragging and keyboard reordering still work.
- Search summaries start off on new installations. Existing preferences are retained.
- Add Page remembers the last folder. About uses matching brown in light mode and tan in dark mode, with inline support placeholders ready for future payment links.

The same installer format and configuration are retained. On the first installed launch, Flashborn registers in Windows' SWF Open With choices. If another app is already your default, choose **Open with → Flashborn → Always** once to use double-click playback. No administrator access or default-app takeover is needed for this registration.

## Downloads

- [Windows x64 installer](https://github.com/sloutchevsky/Flashborn-Browser/releases/download/v1.11.0/Flashborn-Setup-1.11.0-x64.exe)
- [Application source](https://github.com/sloutchevsky/Flashborn-Browser/releases/download/v1.11.0/Flashborn-Source-1.11.0-GitHub.zip)
- [Complete version history](../CHANGELOG.md)

The original Adobe player and its legacy runtime no longer receive security updates. Use native Flash for trusted legacy content. Modern pages use the current Chromium engine; bundled AdBlock applies to regular modern tabs, not Flash or private sessions. Extension support covers compatible unpacked extensions, not every Chrome extension API. The application is unsigned, and Windows may still show publisher or reputation prompts.
