# Tile repeat plan

**Status (2026-09-29):** investigated in real browsers, iPhone included
(the iOS Simulator, below): the tile is a pre-scaled 120-system-px square,
not the motif. The probe page `tile-repeat-probe.html` is new and
uncommitted. Delete this doc when the work ships, as with the earlier plans.

## The problem

The desktop pattern is a PNG data URL the size of the whole screen, and it
changes every time the page resizes the desktop. `PatternFillController`
(`src/pattern-fill.ts`) draws the pattern over the box at one image px per
system px, rounds up to whole 8-px cells, encodes it with `toDataURL`
(`tileRaster`, `src/styles/recipes/tile.ts`), and writes it to an inline
custom property. Every 8 system px of resize means a canvas encode, a new
string in the style, a PNG decode and a new full-size bitmap. In the probe,
one Safari session showed 15 encodes of a 4.2 KB data URL.

The same whole-surface raster (through `TileRasterCache`) paints four more
surfaces, and each re-encodes when it resizes:

| Surface | Where | Resizes with |
| --- | --- | --- |
| Desktop and `vf-container` pattern | `src/pattern-fill.ts` | the box |
| Utility window dots | `src/components/vf-window.ts` (`#dotsRaster`) | window width |
| Swatch checker | `src/components/vf-swatch.ts` | declared size |
| Progress bar stripes | `src/components/vf-progress-bar.ts` | bar width |
| Scrollbar tracks | `src/scroll-rail.ts` | scrollbar length |

## Why it was built this way

- A CSS repeat places each copy at `k × tileSize`. When the engine can't
  store the tile length exactly, the error adds up across the surface and
  the dither smears. A tile span of `lcm(motif, 15)` fixed normal densities,
  but Safari's zoom levels produce scales like 20/17 and 30/23 that no span
  holds (old `ZOOM-TILE-DRIFT.md`, in git history).
- A canvas element was planned, then replaced by a grid of placed tile
  boxes. Those measured a gray line at every seam in Chromium.
- So the art became one image, magnified nearest-neighbor
  (`TILE-GRID-PLAN.md` in git history, commit 9bd9bde).

Two things reopened it:

1. The repeat that failed used an SVG tile, and Chromium blurs SVG tiles for
   its own reasons. A raster tile under `pixelated` was never measured.
2. All of those measurements ran under Playwright's `deviceScaleFactor`,
   which lays Chromium out as if at 1×. We learned on 2026-09-13 that real
   displays don't behave that way.

## What real browsers do

Tested on a 2× Mac with `tile-repeat-probe.html`. "Browser-scaled" means
the tile image has one px per system px and the browser magnifies it.
"Pre-scaled" means the canvas draws each system px as an n×n block (n =
device px per system px), so the browser copies the tile 1:1.

| Browser | Tile | Result |
| --- | --- | --- |
| Chrome, Firefox | browser-scaled, motif (2 sys px for gray-50) | Looked perfect (Adam, by eye) |
| Safari | browser-scaled, 120 sys px, `pixelated`, 100% | 88.5% gray. A column reads `0 85 170 255 170 85 0`: bilinear filtering. Safari ignores `image-rendering` on repeated backgrounds |
| Safari | browser-scaled, a diamond pattern | Same smoothing, plus a band of doubled rows |
| Safari | pre-scaled, 120 sys px, 100% | 0 gray px, every run exactly 3 device px |
| Safari | pre-scaled, motif, 100% | 0 gray px, every run exactly 3 device px |
| Safari | shipped raster, 100% (control) | 0 gray px, every run exactly 3 device px |
| Chrome, Firefox, Safari | pre-scaled, motif, all zoom levels | Clean, by eye (Adam) |
| Playwright WebKit on macOS | every setting, including browser-scaled | 0% gray. It does not reproduce Safari's smoothing |

The 100% Safari rows were checked pixel by pixel. The zoom-level row was
checked by eye.

## Pre-scaled is still system-pixel art

Each pattern bit is still one system pixel. Pre-scaling only moves the
system-px-to-device-px scaling out of the browser's image filter and into
whole-pixel `fillRect` calls in the canvas. The output matches the shipped
raster pixel for pixel. The tile depends on n, which the kit already
computes (`--vf-scale × trueDpr` is whole by contract). So it's redrawn
when zoom or density changes n, and never on resize.

## WebKit at 3× (iPhone): a 120-system-px tile

Tested in the iOS 27 Simulator (iPhone 18 Pro, devicePixelRatio 3, so
n = 4 and `--vf-scale` 4/3), 2026-09-29. Screenshots came from
`xcrun simctl io booted screenshot`, which exports the device framebuffer
at native resolution. The Simulator window is scaled, so nothing was read
off it. Each capture was checked run by run, as the analyzer does. All
tiles were pre-scaled, and each desktop was 301 system px wide
(`fitWithin`'s answer), so its box had fractional CSS edges.

| Tile (sys px) | CSS px | Result |
| --- | --- | --- |
| shipped raster | | clean |
| motif (2) | 2⅔ | drift: one 50% pixel and a 3-px run every 255 device px, both axes. WebKit truncates the length to 170/64 CSS px |
| 6, 12, 24 | 8, 16, 32 | exact lengths (the engine computes `8px`), yet some positions show a band where one tile is drawn 1 device px narrow and resampled: a ramp about 0.8 tile wide. Which positions varied with the tile and the box's offset |
| 6 on a box with whole-CSS-px edges | 8 | clean |
| 48, 60 | 64, 80 | clean at 4 positions each |
| 120 | 160 | clean at 11 positions; identical to the shipped raster (diff mode) for 6 patterns |

The squeezed tile looks like Core Graphics' constant-spacing pattern
tiling, which is documented to distort a cell by up to one device pixel.
That's an inference from the shape, not verified in WebKit's source. What
was measured: small tiles fail on iOS even at exact lengths, and tiles of
192 device px and up never did.

So the tile is 120 system px square, whatever the pattern:

- A whole number of every pattern's motif (120 = 8 × 15).
- A whole number of WebKit layout px at every density and page zoom:
  120n/dpr, which is 40n at 3×, 60n at 2× and 120n at 1×. Chrome lays out
  in device px and Firefox's 1/60 px grid holds its answer, so the length
  is exact everywhere.
- Big enough to stay clear of the iOS failures: 480 device px at 3×, and
  240 at iOS's smallest page zoom (50%, n = 2).
- The image is 120n px square: 360 px at 2× and 480 px at 3×, about 1 MB
  decoded at most at normal zoom levels.

The bare motif is still clean in Chrome, Firefox and Mac Safari at 2×.
One tile everywhere is simpler than a per-engine choice.

## Plan

1. ~~**Settle the iPhone question**~~ (above): 120 system px.
2. ~~**Pattern fill**~~ — BUILT and committed 2026-09-29. `src/pattern-fill.ts`:
   a module cache of pre-scaled 120-px tiles keyed by (pattern hex, n), n =
   `round(effectiveScale(box) × truePixelRatio())`, redrawn on
   `onScaleChange` and each host update. The recipe states
   `background-size: calc(var(--vf-scale, 1) * 120px)` and `repeat`;
   only `--_vf-pattern-image` is written inline. `tileRaster` took an
   optional `density` (additive). Gone: `getSize`, the `size` getter and the
   `TrackWidthController` measuring, which is breaking, so it's a minor
   version bump. `verify:pattern` asserts the tile geometry (image 120n px,
   repeat), a shared tile, a `--vf-scale` override's own n, and no
   re-encode on resize; 59/59, and the full suite 40/40. The iOS Simulator
   shows the shipped fill clean and diff-identical to the raster. SPEC,
   PATTERNS, SIZING (the one pattern sentence) and TOOLKIT are updated, and
   the manifest regenerated. Adam checked Chrome, Firefox and Safari on
   the Mac: good.
3. **The other four surfaces** in one follow-up: utility window dots,
   swatch, progress bar stripes (animated; check how the stripe animation
   moves), scrollbar tracks. Then remove `TileRasterCache` and the
   `.vf-tile-raster` rules, and decide whether `tileRaster` stays exported.
   Also look at whether the consumer-token placed tile grids
   (`--vf-desktop-pattern` etc.) can become repeats; consumer art may be
   SVG, which can't be pre-scaled.
4. **Headless tests**, adapted to match what real browsers showed:
   - Check that every run of black and white is exactly n device px, not
     just that there's no gray. A doubled column is pure black and white,
     so `impureIn` can't see it.
   - Run Chromium and Firefox at display density (`browserAt` /
     `real: true`), and WebKit.
   - Headless can't reproduce Safari's smoothing, so no test would have
     caught it and none will catch a regression to it. Commit the probe
     page as the manual Safari check and add a line for it in
     `docs/DEVELOPING.md`.
   - `verify:pattern` and `verify:tile` currently assert zero gray at
     emulated densities, 1.7 and 2.3 included. Rework them rather than
     adding a third script.
5. **Docs and release:** SIZING (the tile grid section), PATTERNS, TOOLKIT
   rows for the tile exports, the comments in `src/tile-grid.ts`,
   `src/pattern-fill.ts`, `src/styles/recipes/tile.ts` and `vf-desktop.ts`.
   Run `npm run analyze` and commit the regenerated manifest and editor
   files. Publishing is Adam's.

## Decided

- Real browsers are the ground truth. Headless tests are adapted to match
  them afterwards (Adam, 2026-09-29).
- Pre-scaled over browser-scaled: it doesn't depend on any browser's image
  filter, so one path works everywhere.
- No canvas element. It would be a child box (stacking problems the
  background form avoids), canvas pixels skip forced-colors remapping, and
  iOS limits canvas memory and can lose the context. Painting a canvas as a
  background is single-engine only (`paint()` is Chromium, `-moz-element()`
  is Firefox).
- Fallback if repeat ever fails somewhere: keep the single raster but size
  it in coarse steps, cache it for the page, and encode with `toBlob`
  instead of base64.

## Tools

**`tile-repeat-probe.html`** (`npm run dev`, then `/tile-repeat-probe.html`).
A full-window `vf-desktop` sized with `fitWithin`. Modes: raster (the old
whole-surface raster, recreated in the page as the reference), shipped (the
component as it is), repeat (a candidate, applied through
`::part(desktop)`), and a diff switch that lays the chosen mode over the
raster with `mix-blend-mode: difference` (black means both paint the same
pixel). Menus for tile (motif / 8 / 120 sys px), tile image
(browser-scaled / pre-scaled), `image-rendering`, and pattern. The readout
shows the density, n, the tile length asked for and what the engine
computed, and for the raster its size, data URL size and encode count.
Load at 100%, because Safari's zoom is measured from load.

Every menu can also be set from the query string
(`?mode=repeat&tile=120&texels=device&pattern=gray-50`; `tile` takes any
whole number of system px, or `whole` for the smallest whole-CSS-px run of
motifs). Three more parameters exist for diagnosis: `readout=wrap` shows
the whole readout on a phone, `fit=lattice` rounds the screen down to
whole CSS px, and `nudge=x,y` puts the desktop at the stage's corner plus
x, y system px. The readout shows the box's position and size in device
px.

**The iOS Simulator** needs no one at the keyboard:
`xcrun simctl openurl booted '<url>'` loads a configuration and
`xcrun simctl io booted screenshot <file>.png` exports the framebuffer.
The analysis below reads those files.

The page has a screenshot analyzer: paste (⌘V, in Safari after clicking
the paste box), drop or choose a screenshot of a region inside the gray-50
dither. It counts gray pixels and every row and column where a run isn't n
device px, draws a map, and keeps a table you can copy as markdown. A
nearly all-black screenshot is read as a diff. It only understands gray-50.

**Screenshot files.** A saved screenshot can also be checked from Node with
a PNG decoder like `decodePng` in `scripts/harness.mjs`: classify pixels as
black (≤ 24), white (≥ 231) or gray, then count run lengths along rows and
columns. macOS names screenshots with a narrow no-break space (U+202F)
before AM/PM, so match file names with that in mind. Window screenshots
include the page chrome, so crop to the dither first.
