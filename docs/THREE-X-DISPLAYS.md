# Displays the layout grid can't hold

**Short version:** on a native 3× display — and on Windows at 125% and 150%,
and at 2.5× — the scale the kit derives is a fraction the browser's layout
engine cannot store exactly. Solid art is unaffected, because paint snaps every
box to the device grid on its own. Repeating fills were affected, badly, until
they started spanning a size the grid can express; two residuals remain, and
this document is the whole account of what the limit reaches and what it
doesn't.

## What the limit is

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
different denominator). `42.6666… × 64 = 2730.67`, not an integer, so the used
value becomes `2730/64 = 42.65625` — one-thirty-second of a CSS pixel short of
where the art wants to be.

**4. Which lands the edge off the device grid.** `42.65625 × 3 = 127.96875`
device px, where the art wants 128.

No CSS can avoid step 3. The exact value is a repeating fraction in binary and
in sixty-fourths alike; there is no length literal, `calc()`, or rounding
function that names it. The `zoom` property is not a way out either: measured,
it quantizes identically, to the same 42.65625.

It is not only 3×. A scale `p/q` is holdable exactly when `q` divides
`64 × length`, and the 64 absorbs every power of two — so the densities that
hurt are the ones whose scale has an **odd** denominator:

| display | scale | holdable |
| --- | --- | --- |
| 1×, 2× | 1, 3/2 | ✓ at every zoom |
| 1.25× (Windows 125%) | 8/5 | ✗ |
| 1.5× (Windows 150%) | 4/3 | ✗ |
| 2.5× | 6/5 | ✗ |
| 3× (iPhone, Windows 300%) | 4/3 | ✗ |

**Why a 1× or 2× display escapes at every zoom.** Page zoom is applied to
computed lengths at style time, before layout quantization, so the layout length
is `systemPx × target / baseDpr` — whole, or a half, whenever `baseDpr` is 1 or
2. A 2× Mac at 150% zoom reaches the same *trueDpr* as a 3× display and has none
of this. You cannot reproduce it on a Mac without DevTools emulation.

## What paints anyway, and why

A solid edge is **pixel-snapped at paint time** — Skia rounds the border box to
whole device pixels before rasterizing, which absorbs a 1/32-px layout error
completely, and does it per box, so nothing accumulates. Measured at dpr 3, a
ladder of ten stacked hairlines and eight nested bordered boxes both rasterize
with zero intermediate gray.

A **tiled** background is the exception: it is *one* snapped box holding N
unsnapped repeats, each placed at `k × tileSize`, so an unrepresentable tile
size drifts a little further with every repeat and the phase is half a pixel out
by the thirtieth tile.

**The fix is the span** (`vfTileSize` / `tileImage`,
`src/styles/recipes/tile.ts`). A repeating fill is authored as its motif and
tiled at `lcm(motif, 15)` system px: a whole number of motifs, so the art is
unchanged, and holdable at every scale in the table above, so every repeat lands
exactly. 15 covers them all because every derived scale's denominator has an odd
part of 1, 3 or 5. The art carries the span through an SVG `<pattern>`, so the
source stays the two or three rects that are the artwork.

Nothing is traded away for it. The pitch is untouched — one system pixel of
texture is still the same count of device pixels as every other edge on the
screen — there is no rounding, no display-derived custom property to keep in
sync, no `round()`, and the behavior is identical in every engine. The cost is a
tile texture of at most 60 system px square, for art that repeats forever.

Desktop dither, measured over the fill's interior (`npm run verify:tile`):

| display | before | now |
| --- | --- | --- |
| 1×, 2× | 0% | 0% — nothing to fix |
| 1.25× | 75% | **0%** |
| 1.5× | 75% | **0%** |
| 2.5× | 55% | **0%** |
| 3× | 43% | **0%** |

## The two residuals

**Text.** At 4/3 the font size and the ascent override it is a fraction of both
quantize, so a run can sit one device pixel (¼ system pixel) off its canonical
position. The glyphs stay crisp; the whole run shifts. `verify:baseline` asserts
that bound explicitly rather than pretending it is exact.

**Borders, which is the bigger one.** Chromium *floors* `border-width` to a
whole CSS pixel: `border: calc(var(--vf-scale) * 1px)` computes to `1px` at
every fractional scale, and a 1-system-px border paints

| display | 1 system px is | the border paints |
| --- | --- | --- |
| 1× | 1 device px | 1 ✓ |
| 1.25×, 1.5× | 2 device px | **1** |
| 2×, 2.5× | 3 device px | **2** |
| 3× | 4 device px | **3** |

So the kit's hairlines are thin at every density above 1×, including plain
retina — and because a tiled layer inset by a frame's border inherits that
floored offset, a *correctly sized* tile inside one still starts on a half
device pixel at 1.25×/1.5×/2.5× and smears. That is why `verify:tile` prints the
windoid dots', swatch checker's and barber stripes' residual rather than failing
on it: their tiles are exact, their origins are not, and the cause is the
border. The desktop dither, whose layer fills its host from (0,0), is held to
zero.

Measured, `box-shadow: inset 0 0 0 calc(var(--vf-scale) * 1px)` over matching
padding paints the true thickness at every density — 1, 2, 2, 3, 3, 4 — so a fix
exists. It is not a drop-in: forced-colors mode deletes `box-shadow`, and the
kit's frames interact with `overflow` and with the stepped-corner clip paths, so
changing how every frame is painted is its own piece of work.

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
`trueDpr` depends on its *denominator*, which jumps around as the user zooms, so
any policy that prefers them inherits that jumping. And it cannot even be
applied consistently: at 110% zoom on a 2× display (`trueDpr` 2.2) the smallest
holdable target is **11** — four times the art's size — so at some densities
there is no holdable answer to prefer.

Rounding to the nearest whole count is monotonic by construction, which is the
property a zoom response must have. It is what ships.

## How the test suite treats it

Assertions compare against **what the engine can represent** rather than
against the mathematical ideal, which keeps them exact rather than loosened:

```js
cssPxFor(systemPx, scale)   // scripts/harness.mjs — the ideal, snapped to 1/64
holdableScale(scale)        // whether the engine can store it at all
```

`verify:grid` and `verify:snap` keep their strict "on the device grid" check
wherever the scale is holdable — which is every scale a 1× or 2× display
derives, at every zoom — and elsewhere fall back to asserting nothing is off by
half a device pixel, the error that actually smears 1-bit art. `verify:tile`
holds every tiled surface's span to the arithmetic at six densities, and the one
surface whose layer starts at its host's origin to a zero-gray raster.
