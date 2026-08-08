# Native 3× displays

**Short version:** a native 3× display renders 1-bit, like every other display.
It is the one density where the kit cannot hold every layout edge *exactly* on
the device-pixel grid — the scale it needs, `4/3`, is not a number a browser's
layout engine can store — but nothing visibly degrades: solid edges are snapped
back by paint, and the tiled fills, which are not, round their cell to a size
the grid can express (`vfTileSize`, added 2026-08-08).

Measured on the showcase at dpr 3: the desktop dither went from **36% mid-gray
to zero**, the windoid dot bar from 11% to zero, and everything else was already
zero.

This document is the why: what the platform limit is, what it costs, and what
it does *not* reach.

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

## What it costs, and what paints anyway

Measured at dpr 3, scale 4/3, counting pixels that are neither pure black nor
pure white:

| | before | now |
| --- | --- | --- |
| Buttons, windows, dialogs, checkboxes, radios, sliders, menu bars, fields | 0% | 0% |
| Bitmap type, both faces | 0% | 0% |
| `vf-img` / `vf-icon` magnified art | 0% | 0% |
| Barber stripes, racing stripes, scroll rails | 0% | 0% |
| `--vf-desktop-pattern`, the desktop's 50% dither | **36%** | **0%** |
| `--vf-dots-pattern`, the windoid bar | **11%** | **0%** |

The split was never arbitrary. A solid edge is **pixel-snapped at paint time** —
Skia rounds the border box to whole device pixels before rasterizing, which
absorbs a 1/32-px layout error completely. A **tiled** background is not: each
repeat is placed at `k × tileSize`, so an unrepresentable tile size drifts a
little further with every repeat, and by the thirtieth tile the phase is half a
pixel out. The two dithers are the kit's only 2-system-pixel tiles, which is
why they were the only casualties: at 4/3 a 2-px tile is `2.6666… CSS px`, while
the 12-px barber stripe is `16` exactly and the 9-px sunburst `12` exactly.

**The fix is `vfTileSize` (`src/styles/recipes/tile.ts`).** A tiled fill rounds
its *cell* — not its tile — to `--vf-tile-quantum`, the smallest CSS length that
is both whole in device pixels and holdable by the layout grid (`tileQuantum()`,
`src/scale.ts`, written by `ScaleController`). The cell is the unit that has to
land whole: rounding the tile instead was tried and is worse, because a 1.5×
display's smallest holdable tile is three device pixels, which a two-cell dither
cannot divide evenly — the dot bar went from 19% mid-gray to 40%.

It costs pitch, and only ever on a texture. At dpr 3 the dither's cell paints at
1 CSS px rather than 1.333, so the tile is 6 device pixels where the art asks
for 8 — a 25% finer dither, still a dither. The four callers are the desktop
dither, the windoid dots, `vf-swatch`'s transparency checker and the scroll
rails' trough; measured art is never rounded this way and does not need to be.

Text keeps one narrow residual: at 4/3 the font size and the ascent override it
is a fraction of both quantize, so a run can sit one device pixel (¼ system
pixel) off its canonical position. The glyphs stay crisp; the whole run shifts.
`verify:baseline` asserts that bound explicitly rather than pretending it is
exact.

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

## What this does not reach

The same cell rounding runs at every density, and it helps wherever a holdable
step exists within twice the cell (`tileQuantum` gives up past that, resolving
to the scale itself so `round()` is an exact no-op and nothing changes). Desktop
dither, measured:

| display | before | now |
| --- | --- | --- |
| 1×, 2× | 0% | 0% — nothing to fix, nothing changed |
| 1.25× (Windows 125%) | 65% | 65% — finest holdable step is five device px, too coarse to take |
| 1.5× (Windows 150%) | 66% | **0.9%** |
| 2.5× | 49% | **0%** |
| 3× | 36% | **0%** |

So 1.25× — and other densities whose finest holdable step is far from the art's
own — keeps a smeared dither. Its cell wants 1.6 CSS px and the nearest holdable
length is 4, two and a half times too coarse; taking it would trade a smeared
dither for a visibly wrong one. Nothing in the platform offers a third option.

The windoid dots keep a smaller residual (16–19%) at those same densities for a
different reason: its layer is inset `calc(var(--vf-scale) * 2px)` from the bar,
so at an unholdable scale the whole tiled fill starts at a fractional origin,
which no tile sizing corrects.

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
