# Native 3× displays

**Short version:** the kit renders on a native 3× display, and almost all of it
is exactly as crisp as anywhere else. What it cannot do there is hold every
layout edge *exactly* on the device-pixel grid, because the scale that display
needs — `4/3` — is not a number a browser's layout engine can store. The
visible consequence is confined to the two dither tiles. Everything else —
borders, stepped corners, bitmap type, magnified art, stripes, scroll rails —
still rasterizes 1-bit, because painting snaps even when layout cannot.

This is a platform limit, not a tuning problem. Below is why, what exactly
degrades, and what would fix it.

## What a "native 3× display" means here

`devicePixelRatio` 3 **at 100% zoom** — the display's own density, not a zoomed
2× display. In practice:

| Reads as 3× | Does not |
| --- | --- |
| Every iPhone since the X (Safari and Chrome) | macOS Retina, which is 2× at every zoom level |
| Windows at 300% display scaling | iPad, which is 2× |
| Chrome DevTools device emulation with DPR 3 | Android flagships, which mostly report fractional values (2.625, 2.75) |

A 2× Mac at 150% zoom reports `devicePixelRatio` 2.2 → 3.0 and reaches the same
*trueDpr* as a 3× display — but it does **not** hit this problem, for the reason
in "Why zoom escapes it" below. You cannot reproduce this on a Mac without
DevTools emulation.

## The chain

**1. The kit derives its target from the display.** A system pixel is 1/72
inch, CSS's reference pixel is 1/96 inch, so the whole number of device pixels
nearest true size is `round(96/72 × trueDpr)` (`src/zoom.ts`,
`devicePxPerSystemPx`). On a 3× display that is `round(4.0)` = **4**.

**2. Which makes the scale 4/3.** `--vf-scale` is the target divided back into
CSS px: `4 / 3 = 1.3333…`. Every metric in the kit is
`calc(var(--vf-scale) * Npx)`, so a 32-system-pixel icon cell is
`42.6666… CSS px`.

**3. Which the engine cannot store.** Chromium lays out in `LayoutUnit`, a
fixed-point type of **1/64 CSS px** (Gecko uses 1/60 app units — same story,
different denominator). `42.6666…× 64 = 2730.67`, not an integer, so the used
value becomes `2730/64 = 42.65625` — one-thirty-second of a CSS pixel short of
where the art wants to be.

**4. Which lands the edge off the device grid.** `42.65625 × 3 = 127.96875`
device px, where the art wants 128. The error per length is small — about
1/32 of a device pixel — but it is *there*, and every box nested inside another
adds its own.

No CSS can avoid step 3. The exact value is a repeating fraction in binary and
in sixty-fourths alike; there is no length literal, `calc()`, or rounding
function that names it.

## Why zoom escapes it

Page zoom is applied to computed lengths **at style time**, before layout
quantization. On a 2× display at 150% zoom the scale is also 4/3, and the same
32-cell computes as `42.6666… × 1.5 = 64 layout px` — a whole number — so
nothing is lost. Generally the layout length is

```
systemPx × target / baseDpr
```

which is whole (or a half) whenever `baseDpr` is 1 or 2. **So a 1× or 2×
display is exact at every zoom level the browser offers.** Only a display whose
*base* density divides into thirds is not, and it is not at any zoom.

## What actually degrades

Measured on the showcase and a component sweep at dpr 3, scale 4/3, counting
pixels that are neither pure black nor pure white:

| | gray |
| --- | --- |
| Buttons, windows, dialogs, checkboxes, radios, sliders, menu bars, fields | **0%** |
| Bitmap type, both faces | **0%** |
| `vf-img` / `vf-icon` magnified art | **0%** |
| Barber stripes, racing stripes, scroll rails | **0%** |
| `--vf-desktop-pattern`, the desktop's 50% dither | **38%** |
| `--vf-dots-pattern`, the windoid bar | **1.7%** |

The split is not arbitrary. A solid edge is **pixel-snapped at paint time** —
Skia rounds the border box to whole device pixels before rasterizing, which
absorbs a 1/32-px layout error completely. A **tiled** background is not: each
repeat is placed at `k × tileSize`, so an unrepresentable tile size drifts a
little further with every repeat, and by the thirtieth tile the phase is half a
pixel out. The two dithers are the kit's only 2-system-pixel tiles, which is
why they are the only casualties: at 4/3 a 2-px tile is `2.6666… CSS px`, while
the 12-px barber stripe is `16` exactly and the 9-px sunburst `12` exactly.

Text is affected in one narrow way: at 4/3 the font size and the ascent
override it is a fraction of both quantize, so a run can sit one device pixel
(¼ system pixel) off its canonical position. The glyphs stay crisp; the whole
run shifts. `verify:baseline` asserts this bound explicitly rather than
pretending it is exact.

## Why the kit does not simply pick a different target

It could take **3** device pixels per system pixel instead of 4 — the scale
would be exactly 1, and everything above would be exact. That was implemented
and reverted, because the holdable targets are not a monotonic function of
density. Preferring them produced, on a 2× display:

| zoom | trueDpr | target |
| --- | --- | --- |
| 100% | 2.0 | 3 |
| 125% | 2.5 | **5** |
| 150% | 3.0 | **3** |

Zooming in made the art smaller. The set of holdable targets at a given
`trueDpr` depends on its *denominator*, which jumps around as the user zooms,
so any policy that prefers them inherits that jumping. And it cannot even be
applied consistently: at 110% zoom on a 2× display (`trueDpr` 2.2) the smallest
holdable target is **11** — four times the art's size — so at some densities
there is no holdable answer to prefer.

Rounding to the nearest whole count is monotonic by construction, which is the
property a zoom response must have. It is what ships.

## What would fix it properly

The layout error is not fixable — but the *visible* symptom is entirely in two
tiles, and those are fixable:

1. **Paint the dithers as one element-sized image** instead of a repeating
   tile. A single image is scaled once, so there is nothing to accumulate.
   `vf-desktop` already knows its raster size in system pixels, which is what
   such an image needs.
2. **Or author the tiles at a system-pixel size whose CSS length stays whole.**
   At 4/3, tiles that are a multiple of 3 system px are exact (a 6-px tile is
   8 CSS px). This trades one unrepresentable density for another, so it is the
   weaker fix.

Neither is done. `--vf-desktop-pattern` and `--vf-dots-pattern` are public
tokens, so changing how they are consumed is a deliberate API decision rather
than a bug fix.

## How the test suite treats it

Assertions compare against **what the engine can represent** rather than
against the mathematical ideal, which keeps them exact rather than loosened:

```js
cssPxFor(systemPx, scale)   // scripts/harness.mjs — the ideal, snapped to 1/64
holdableScale(scale)        // whether the engine can store it at all
```

`verify:grid` and `verify:snap` keep their strict "on the device grid" check
wherever the scale is holdable — which is every scale a 1× or 2× display
derives, at every zoom — and on a 3× device fall back to asserting nothing is
off by half a device pixel, the error that actually smears 1-bit art. Their
raster checks print the residual instead of failing, because the fringe is the
platform's, not the kit's, and no amount of grid snapping corrects it: the
offsets are already right.
