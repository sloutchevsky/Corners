# Flashborn 1.12.0

Clicking exposed Flash now brings the browser shell forward with the movie. Activation is handled at the native window level, including clicks consumed by the Adobe plugin. Flash remains in the ordinary Windows stack, so other applications can cover the browser normally. Its separate input queue continues to protect the address bar and menus from a stalled legacy runtime.

Tab switches prepare the next compositor frame while keeping the outgoing surface visible. The old surface is released after the replacement is presented. Rapid changes cancel obsolete handoffs, and a short deadline keeps an unresponsive Flash tab from holding up the shell. The handoff does not poll Flash movie APIs or rewrite movie settings.

## A more useful portfolio

- Edit the collection title and subtitle above the cards. The defaults are **Vas Sloutchevsky** and **Flash design portfolio**.
- Add **Created by** beside Year. A saved card can read **Herman Miller Embody Chair**, then **2006, _Firstborn_**.
- Thumbnails stay 128 by 64 pixels when resizing the window. Descriptions stay on one line and truncate with an ellipsis.
- The narrower **Find in library** field stays clear of the folder and Add a Flash page buttons. More spacing separates the toolbar and collection heading from the cards.

All these fields are saved in the existing local `Flash Library/manifest.json`, alongside card data and image references. Older manifests receive the default heading without losing their collection.

## About

**Buy me a coffee** is now a small disclosure like the MIT license. It starts closed. Click its twistie or the coffee link at the top to open it. Payment destinations remain unconfigured until real provider links are supplied.

The Windows installer configuration, bundled Adobe player and website colors are unchanged.
