# Reusable magnetic grid

`magnetic-grid.js` is a dependency-free geometry module. It exports `MagneticGrid` in a browser, or can be loaded with `require()`. It does not read the DOM, change styles, manage projects or depend on the physics engine.

Use page coordinates in CSS pixels for rectangles, anchors and pointer positions. Convert the pointer's vertical coordinate with `clientY + scrollY` each frame.

```js
const frame = MagneticGrid.frame(containerWidth, containerCenterX, maximumTileWidth);
const layout = MagneticGrid.plan({
  frame,
  top: lineBottom + frame.gap,
  viewportWidth,
  items: projects,                 // Stable, unique .id values
  active: hoveredId,               // null when there is no preview
  featured: fullWidthId,           // null when there is no XLG tile
  anchor: {
    x: pointerX,
    y: pointerY + scrollY,
    left: currentTileLeft,
    top: currentTileTop,
    width: currentTileWidth,
    height: currentTileHeight
  }
});

// Keep this rectangle object, including its .velocity, across retargets.
MagneticGrid.approach(renderedRectangle, layout.targets[id], deltaSeconds, 18);
// On the active tile, preserve the footprint acquired at pointer entry.
MagneticGrid.hold(renderedRectangle, acquiredRectangle, layout.targets[id], {
  x: pointerX,
  y: pointerY + scrollY
});
```

Rectangles use `{x, y, width, height}`, with `x` and `y` at the center. Initialize `angle: 0` on rendered rectangles before using `approach()`; falling rectangles can start with their current angle instead. The planner reserves the active tile before placing other items, returns one target per ID, and reports the bottom of the resulting layout.

## Full-width selection

Passing a valid `featured` ID reserves a separate band at `top`, spanning exactly `frame.width`. For normal dimensions `w` by `h`, gutter `g` and line width `L`, its height is `L * (2h + g) / (2w + g)`. This preserves the hover preview's aspect ratio.

The featured target has `featured: true`, `row: -1`, `column: 0`, `span: columns` and `rowSpan: 0`. The normal lower grid starts at the returned `gridTop`, one gutter below the full-width band. All remaining IDs use the same normal cell dimensions, source order and hover packing as before. Changing `active` cannot alter any coordinate or dimension of the full-width target. Changing `featured` returns the previous full-width ID to ordinary lower-grid packing. A missing featured ID behaves like no featured selection.

Keep the featured rectangle outside `fit()`'s normal-grid projection and ignore hover on that rectangle. Animate promotion and replacement from their current visible poses with `approach()`. When promoting a lower card, scroll the final full-width target into view if needed. Year/search changes clear the featured ID before releasing the selected bodies. Promotion changes layout only; it does not open the project's URL.

## Artwork and captions

Treat the planned rectangle as the entire card footprint. Put the thumbnail and caption inside it; never add caption height to its grid row or gutter. The Gallery keeps the image at the full rectangle height behind an overflow mask. A separate critically damped caption height moves that mask upward from the bottom. Normal cards have zero caption height. A two-by-two preview reveals only its grey title; the full-width band reserves enough internal height for the title, creator, description and Launch arrow. Image dimensions follow the current animated rectangle, while the mask clips its lower edge rather than squeezing the image into a smaller height.

All artwork and caption children ignore pointer events. Only the full-width Launch button accepts them, and its activation stops propagation before the card handler. Keyboard activation on that button must bypass the card's Enter/Space handler too. Thus acquisition still uses the complete outer card, including its caption, and only an explicit Launch action opens the saved destination. The separate white paper layer preserves a solid falling block during image reveal; a selected card's underlying fill matches the page to prevent a white seam beneath its caption.

`scripts/gallery-thumbnail-check.cjs` verifies every image and every small/hover/full-width state across three through eight columns, the exact supplied first image, paired mask/caption heights, uncompressed images, metadata and arrow clipping, all four themes, and explicit-launch-only behavior. Its screenshots include the normal grid, Square hover and Square full-width band.

## The hover invariant

For pointer coordinate `p`, rectangle center `c`, dimension `s` and a subpixel inset `e`, the pointer remains inside the rectangle when:

```
p - s/2 + e <= c <= p + s/2 - e
```

`contain()` projects the rendered center into that interval on both axes. `hold()` additionally preserves the acquired visible rectangle whenever it fits inside the destination. The destination planner chooses a complete grid slot containing the pointer and prefers the acquired footprint whenever possible. For a normal tile of width `w`, a two-column preview of width `2w + g` covers an acquired left edge anywhere in `[slotLeft, slotLeft + w + g]`. Those intervals meet at the next column's start, so a normal tile can enter anywhere without needing compressed tracks. The same proof holds vertically. An interrupted larger acquisition can fall back to pointer containment when its whole footprint cannot fit one slot. A subpixel corner entry uses an inset smaller than its original edge distance; an arbitrary fixed padding must not push the tile away from the very edge it is meant to protect.

The active tile must also render above other tiles. Use the current visible hit target to transfer hover ownership. Do not select from destination rectangles or let animation-generated events at an unchanged pointer position transfer ownership. A real pointer move inside the same tile refreshes its acquired footprint, too: during interrupted motion, its current edges can differ from those at the original entry. The Gallery retains the preview for 110 ms while crossing a gutter, so an intermediate empty frame cannot collapse and rebuild the grid. Entering another visible tile transfers ownership immediately. A deliberate wheel scroll clears the preview.

## Fixed frame and equal gutters

The frame depends only on the container width. Its width and position never change because of hover, filtering or falling objects. Keep typography and controls outside the animated tile layer.

For normal dimensions `w` by `h` and gutter `g`, the preview is `2w + g` by `2h + g`: two complete columns and rows including their internal gutters. All other rectangles remain exactly `w` by `h`. Every position uses the same pitches, `w + g` and `h + g`. The planner reserves an integer two-by-two slot before placing other cards, so adjacent rectangles retain gutter `g`, and rectangles occupying the final column meet the line's right edge. Hover never changes column widths, row heights, or the frame width.

The Gallery uses three through eight columns. The same slot geometry applies at every width; there is no special track compression or unused edge allowance. A phone keeps three columns and the ultrawide container allows eight.

The container grows to 1454.4 CSS pixels: eight reference-size tiles plus seven gutters. A reference tile width of 160.8 CSS pixels determines when another column fits; it is not a maximum displayed size. For line width `L`, column count `C` and gutter `g`, the target tile width is `(L - (C - 1) * g) / C`. Thus every configuration fills the line exactly. The target gets larger when a column wraps, while its rendered size eases into that new value. Gutters scale down continuously on very narrow viewports.

The container has equal outer margins and scales continuously with the viewport. `frame.width` and `frame.railWidth` both equal its full width. The line, title and year controls follow that width directly. The tile tracks fill it from left to right. An incomplete final row remains left aligned, with empty logical tracks after its last tile. Hover and falling objects cannot resize the container.

When five columns stop fitting, the fifth flies to the leftmost slot of the second row, pushing the following tiles one slot to the right and carrying later overflowing tiles onto subsequent rows. The first four keep their order and grow to fill the new row. The same source-order packing applies between every adjacent column count from eight down to three, and reverses when the window grows. Column changes never change the line width independently of the viewport.

## Continuous resizing and interrupted motion

`approach()` uses the exact critically damped spring solution. Position and velocity are retained when a destination changes, including while crossing a column threshold. Replacing the destination does not restart an easing curve or assign the new rectangle. There is no final coordinate snap on docking.

During a live viewport resize, map visible rectangles relative to the **left edge** using the **line-width ratio**. Never assign the new column-count-dependent tile size directly to a visible rectangle: that would recreate the grow-and-snap problem in the page. Replan positions in source order and continue `approach()` from the current poses and velocities. The line follows the container width directly. Resize notifications are coalesced into the next paint, and physics boundaries advance during ordinary fixed simulation ticks.

For a normal grid containing at least a full row, keep spring poses separate from displayed poses. Call `MagneticGrid.fit(motionRectangles, frame.left, frame.width)` after advancing the springs. It maps the group's current horizontal envelope exactly onto the line and returns new display rectangles. It does not mutate the springs or feed its projection back into their motion. Both edges therefore remain aligned during interrupted wraps, without shrinking the visible group away from the line or assigning the new tile size in one frame. Vertical trajectories remain unchanged. Card labels use an independently eased cell size. On hover, continue from the actual displayed rectangles and use the existing acquisition/hold constraints; group fitting does not move a preview away from the pointer. Loose white bodies are excluded from fitting. The Gallery physics adapter scales their dimensions and collision boxes uniformly from the same eased normal cell size, anchored to the bottom right. Newly dropped tiles use that current size. Enlarged releases shrink toward it while falling.

## Verification

The Gallery adapter reserves the complete chronological plan before sequential capture begins. Its queue preserves that order across 40 ms launches and equal 260 ms flights, while only launched tiles receive rendered targets. This avoids repacking previously captured tiles every time another item enters the grid. Disable normal-group fitting until assembly finishes; a partial first row must not be stretched across the full line. On a new selection, cancel the old queue before releasing bodies. On resize, transform each in-flight starting pose using the same line-width ratio as its visible pose.

`scripts/gallery-sequence-check.cjs` checks the complete pile/interface/dot/All sequence, chronological launch and arrival order, interrupted year changes, resize during capture, and bottom/right/corner resize kicks. It also checks that the pile returns to rest after each kick. Run it in the native renderer or with `GALLERY_PROBE_ENGINE=modern`; private saved collections are embedded only into local test fixtures.

`tests/magnetic-grid.test.js` checks full-width target rows, group fitting on every animated frame, no projection feedback or oversized transition tiles, the three-to-eight-column limit, source-order wrapping, packing, gutters, stable IDs, 61,600 disturbed frames, interrupted acquisition footprints, odd-column middle entries, subpixel corners and velocity continuity. It also checks every featured candidate against every lower hover across three through eight columns, replacement, and the lone-tile case. Renderer checks exercise near-edge neighbor entries, immediate reversals, gutter crossings, every year, and continuous resizing in both directions. Live resize frames verify both group edges against the line. `scripts/gallery-live-resize-check.cjs` verifies those same edges and wrap order inside Flashborn with its normal animation clock. `scripts/gallery-featured-check.cjs` and `scripts/gallery-featured-browser-check.cjs` cover XLG promotion, independent lower hover and replacement without project launches.

Run `node --test tests/magnetic-grid.test.js` for the portable geometry tests. In the Flashborn repository, `node scripts/gallery-grid-motion-check.cjs` runs the isolated renderer regression. Set `GALLERY_PROBE_ENGINE=modern` for the current browser engine, or leave it unset for the native engine. `GALLERY_PROJECTS_FIXTURE` optionally selects a local JSON collection; without it the public Gallery projects are used. The fixture is embedded only in a local test page. Result files record the tested HTML hash.
