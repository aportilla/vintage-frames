# Sizing and the device-pixel grid

Every component is authored in *system pixels* — the 1-bit art grid, where a border is 1 and a push button 20 tall. On a Macintosh that pixel was 1/72 inch. Each component reads the display density and renders one system pixel as the **whole** number of device pixels nearest that size, `round(96/72 × devicePixelRatio)`, 96 being CSS's reference dpi — the only density anchor a browser exposes. On by default, no setup, and nested components never double-scale.

| Display | true 1/72″ wants | device px per system px | `--vf-scale` |
| --- | --- | --- | --- |
| 1× standard | 1.33 | 1 | 1 |
| 1.25× (Windows 125%) | 1.67 | 2 | 1.6 |
| 1.5× (Windows 150%) | 2.0 | 2 | 1.333 |
| 2× retina | 2.67 | 3 | 1.5 |
| 3× | 4.0 | 4 | 1.333 |

The count is whole because the art has to land on the device-pixel grid, and rounding to the nearest costs at most half a device pixel per system pixel: a 1× monitor renders 25% small, a 2× display 12% large, a 1.5× or 3× one exactly right. Some displays derive a scale the browser's layout engine cannot store exactly (1.25×, 1.5×, 2.5× and a native 3×) — paint snaps every box back onto the grid, and the tiled fills repeat a tile whose length every engine stores exactly (see *Tiled fills* below), so what is left is a hairline one device pixel thin. See [THREE-X-DISPLAYS.md](./THREE-X-DISPLAYS.md); it is a platform limit rather than a setting.

So the CSS size follows the display: the same push button is 20px tall on a 1× monitor and 30px on a 2× one, while the page's own 17px copy is 17px on both. That suits a full-screen faux desktop; next to ordinary page text you may want a fixed size. Pin it with the inherited `--vf-scale` custom property, declared in a stylesheet the page loads *before* the components upgrade:

```css
:root { --vf-scale: 1; }  /* fixed authored size: a 20px button, 16px label */
.dense { --vf-scale: 2; } /* any factor that keeps scale × trueDpr whole */
```

Every metric multiplies by `--vf-scale` in `calc()`. To put your own markup on the same grid, call `applyScale()` — it sets `--vf-scale` on the document root (or an element you pass) and keeps it synced:

```ts
import { applyScale } from 'vintage-frames'

applyScale() // → returns a cleanup function
```

## Zoom

Zoom needs no separate rule: zooming multiplies device pixels per CSS pixel, so it arrives as a denser display and follows the same table. Chrome, Firefox and Safari 27 report it through `devicePixelRatio` (Safari: 2.3 at 115% on a 2× display); older Safari pins its dpr to the hardware and moves `innerWidth` instead. The kit tracks both, and `truePixelRatio()` is the number that folds them together (`src/zoom.ts`).

A 2× display, through the ladder:

| zoom | trueDpr | true 1/72″ wants | device px / system px |
| --- | --- | --- | --- |
| 50% | 1.0 | 1.33 | 1 |
| 75% | 1.5 | 2.0 | 2 |
| 100% | 2.0 | 2.67 | 3 |
| 110% | 2.2 | 2.93 | 3 |
| 125% | 2.5 | 3.33 | 3 |
| 150% | 3.0 | 4.0 | 4 |
| 200% | 4.0 | 5.33 | 5 |
| 300% | 6.0 | 8.0 | 8 |

The target is a step function, so **zoom sometimes changes nothing** — 100%, 110% and 125% all round to 3, and the art holds still while the copy around it grows. Making it respond at every step would put the art off the grid. The rounding is monotonic by construction: a deeper zoom never renders the art smaller.

Resizing the window is never read as zoom; a viewport change counts only when both axes rescale together to a real zoom level. Page load is the baseline: a page that loads already-zoomed reads that as its 100%, and `resetZoomBaseline()` declares the current state to be 100% again. Pinch-to-zoom is not followed (it changes no rasterization density), and a pinned `--vf-scale` opts out entirely.

```sh
npm run verify:zoom
```

## The device-pixel grid

A component is built from whole system pixels, so every edge inside it sits on the grid — but only relative to its own origin. Land that origin or its size on a fractional device pixel and the 1-bit interior rasterizes wrong: stepped corners staircase asymmetrically, hairline borders and glyph stems smear across two device rows and go gray.

Three rules. One call covers the second:

**1. Keep `--vf-scale × trueDpr` a whole number.** `trueDpr` is device px per CSS px *including* zoom (`truePixelRatio()` reads it correctly in every engine). The derived scale is `devicePxPerSystemPx(trueDpr) / trueDpr`, whole by construction. A hand-picked scale is your responsibility:

| `--vf-scale` | 1× display | 2× retina | 3× hi-dpi |
| --- | --- | --- | --- |
| `1`, `2`, `3` … | ✓ | ✓ | ✓ |
| `1.5` | ✗ 1.5 | ✓ 3 | ✗ 4.5 |
| `1.25` | ✗ 1.25 | ✗ 2.5 | ✗ 3.75 |

**2. State every `line-height` in whole pixels, and keep `padding`, `margin` and `gap` on integers.** Line boxes are the biggest offender — `1.65 × 17px` is `28.05px`, and every line of prose nudges everything after it further off.

```css
/* ✗ */ p { font-size: 17px; line-height: 1.65; }  /* → 28.05px */
/* ✓ */ p { font-size: 17px; line-height: 28px; }
```

**3. Position a box that contains components from its start edge, or give it a whole-pixel size.** Anything right-aligned, centered or sharing `space-between` computes its origin as `edge − width`, so a width derived from a text run lands it off the grid.

```css
/* ✗ */ .toolbar__label { /* width from its text */ }
/* ✓ */ .toolbar__label { width: 84px; }
```

A 1px line of your own belongs in `vfStrokeDecls()`, not a `border` of `calc(var(--vf-scale, 1) * 1px)`. Safari rounds a border's width before page zoom, so it draws thin at most zoom levels and moves what's inside the box off the grid. The helper holds the line's space in padding and paints it with an inset shadow, which hold at every zoom ([SPEC.md](./SPEC.md) §4).

```ts
import { css } from 'lit'
import { vfStrokeDecls } from 'vintage-frames'

const styles = css`
  .card { ${vfStrokeDecls({ padding: [4, 8] })} }
`
```

`vf-paragraph`, `vf-label` and `vf-stack` state their line box and their size in whole system px themselves, so text and containers set in the kit's own components satisfy rules 2 and 3 by construction.

### Grid snapping

Every component measures its own position and cancels the fractional remainder itself, always — which covers rule 2 and the origin half of rule 3. `requestGridSnap()` re-runs the check after moving components in a way that resizes nothing:

```ts
import { requestGridSnap } from 'vintage-frames'

requestGridSnap()
```

The correction is applied inside each component's shadow root — the host's `position`, `left`/`top` and `margin` are never touched, so it cannot collide with your layout. Its whole footprint on your DOM is `--vf-snap-dx` / `--vf-snap-dy` on each corrected host, and a corrected component's painted box can sit up to half a device pixel outside its layout box. Corrections re-apply on resize, scroll, webfont load and density change. Opt one element out with `nosnap`.

```sh
npm run verify:grid   # every vf-* host, at display density 1 / 1.5 / 2 / 2.5 / 3 — reports ORIGIN or SIZE
npm run verify:snap   # …and that a page knocked off the grid recovers by itself
```

Point both at your own pages with `VF_GRID_PAGES` / `VF_SNAP_PAGES` (and `VF_ORIGIN` / `VF_SNAP_DPR`).

### Tiled fills

A repeating fill is the one surface paint snapping can't save: CSS `background-repeat` places every copy at `k × tileSize` from ONE stored length, and the engine quantizes that length to its layout grid (1/64 CSS px in Chromium). When the length isn't exact, the error compounds with `k` until the 1-bit art smears gray or a column doubles.

The kit's tiled surfaces — the desktop and container patterns ([PATTERNS.md](./PATTERNS.md)), windoid dots, swatch checker, barber stripes and scroll trough — repeat one tile 120 system pixels square, drawn at the display's resolution: each system pixel of the art is an n × n block of image pixels, n being the device pixels per system pixel, so the browser copies the tile 1:1 and never filters it. 120 is a whole number of every motif the kit draws, and 120n device pixels is a whole number of layout pixels in every engine at every density and zoom, so every copy lands exactly. The tile is drawn again when zoom or the display changes n, never on a resize. docs/SPEC.md *Tiled fills* has why this size and why pre-scaled.

A consumer pattern token (`--vf-desktop-pattern` and friends) can be any CSS image, SVG included, so it can't be drawn that way. It renders as a **flat grid of placed tiles** at the token's documented 30- or 60-px tile geometry, each tile positioned by a single `calc()` quantized once, so nothing accumulates; raster token art magnifies nearest-neighbor. A token swapped at runtime without touching the component needs a `requestUpdate()`.

`npm run verify:tile` asserts each surface's tile and zero gray pixels at eight densities — the ladder plus 1.7 and 2.3, the emulated stand-ins for Safari's zoom rungs — and `verify:pattern` and `verify:scrollbars` do the same for the patterns and the trough. No headless browser reproduces Safari's image smoothing, so `tile-repeat-probe.html` is the check in real browsers ([DEVELOPING.md](./DEVELOPING.md)).
