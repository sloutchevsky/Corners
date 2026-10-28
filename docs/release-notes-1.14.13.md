# Flashborn 1.14.13

The gradient above the lower sidebar is 72 px tall, three times its previous height.

Settings now includes **Auto-close bottom tabs**, enabled by default, and a **Maximum open tabs** slider from 20 to 100, defaulting to 50. Exceeding the chosen limit closes inactive tabs from the bottom of the current list. The selected tab, audible tabs and tabs with active downloads are protected. Closing releases the tab's native Flash runtime and modern view. Ctrl+Shift+T can reopen regular closed tabs, including local Flash pages; private closed tabs are not retained. Disabling automatic closure allows up to 100 tabs, and saved sessions and thumbnail caches now support all 100.

The live compositor preview uses proportional scaling during resize and sidebar transitions. A centered source crop fills the viewport without squeezing the image horizontally or vertically; ordinary Flash placement, input and the final page layout retain their existing arrangement.

The menu starts at the bottom of the top frame and aligns exactly with the right edge. Its height fits the content area and its options scroll in short windows. The popup remains square, borderless and shadowless.

Validation: 97 unit tests passed. The native integration check verified bottom eviction, audible/current-tab protection, actual Flash process exit, reopening a local Flash page, 100-tab session restoration, and slider persistence. Screen captures measured the original Flash square at 143×144 px and resize previews at 151×153, 173×175 and 132×133 px, confirming proportional rendering within antialiased edge rounding while retaining the same runtime process. Menu checks verified physical top/right alignment at 125% display scale in both themes, along with scrolling in a 560 px tall window.

The packaged build passed the same tab-memory, native resize and menu checks. Package verification matched all 70 source files and the native runtime branding and Adobe player bytes. The Flash layering regression also passed.

Installed and launched for Vas. Browser, collection and thumbnail files were backed up and verified unchanged during installation.
