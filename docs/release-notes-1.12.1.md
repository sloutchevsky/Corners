# Flashborn 1.12.1

This update corrects two Flash layering paths that remained in 1.12.0. The outgoing movie could briefly jump above its replacement when the transition ended. Opening an owned popup could also raise the browser frame over the independent Flash viewport.

Flash handoffs now prepare the incoming compositor transparently behind the current content, repair its stack position, and reveal it before releasing the previous movie. New-tab content also stays visible until a returning Flash surface is ready. The three-dot menu, zoom bubble and address suggestions no longer raise the main frame through Windows popup ownership. Actual window-order and Adobe-pixel checks cover repeated menu opening, outside dismissal and Flash tab switching. Separate legacy input queues and hung-runtime reload recovery are retained.

The library has three times the previous gap between the Find in library toolbar and the portfolio title, moving the title and cards down together.

In About, the top coffee link aligns with the right edge of the payment methods. Enter a custom amount and press Enter to select it with the same styling as the preset circles. All currency symbols and amounts use matching line heights and vertical alignment. Payment destinations remain placeholders until real provider links are configured.

The installer configuration, bundled Adobe player and website-authored colors are unchanged.
