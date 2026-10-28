# Flashborn 1.14.10

Task Manager continued to show FlashBrowser's name and red icon for the native host after the 1.14.9 update. The installed host matched the verified build byte-for-byte, and all six running helper processes reported the corrected Flashborn version-resource name. Refreshing Task Manager did not replace its displayed entry.

The native host now uses the distinct `FlashbornNative.exe` filename and corresponding original/internal filename metadata. Application launch and signature/package verification use that path. Preparation removes the obsolete generated `FlashRuntime.exe` and `FlashBrowser.exe` files; package verification rejects either old file and checks the new executable's name and exact gold icon resources. The original Adobe DLL and Flash rendering arrangement are preserved.

Validation: five focused native stacking tests and the menu/Flash playback checks passed. Unpacked and installed package verification passed. Installed for Vas, with browser, collection and thumbnail files preserved byte-for-byte before launch. The obsolete installed executable was absent afterward. All six running native processes use the new path. A direct inspection of the same open Task Manager confirmed ten background rows labeled Flashborn with gold lightning bolts and no remaining red FlashBrowser rows.
