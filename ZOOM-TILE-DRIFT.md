# Zoom rungs the tile span can't hold

**Status: RESOLVED 2026-08-09 by [TILE-GRID-PLAN.md](./TILE-GRID-PLAN.md)**
(implemented, with the measured revision its status header records: kit art
as one whole-surface raster, consumer pattern tokens as the placed tile
grid). The analysis in the top half of this document stands and is what the
fix answers; the canvas plan in the bottom half is superseded (kept as the
decision record). Observed 2026-08-08 in Safari: as the page zooms,
the desktop dither smears at some zoom levels where nothing else on screen
changed — including levels where the device-px-per-system-px target is the
same count as at 100%. This document is the analysis of why, the measurement
that would confirm it, and the plan for the fix. Companion to
[docs/THREE-X-DISPLAYS.md](./docs/THREE-X-DISPLAYS.md), which covers the same
limit at base densities.

## The observation

On a 2× display in Safari, stepping through ⌘+/⌘−, the tiled fills (the
desktop dither most visibly) intermittently degrade at certain rungs and
recover at others. At those rungs no border, glyph or stepped corner moves —
`devicePxPerSystemPx` returns the same target — so the change is isolated to
repeating fills.

## Why the span lattice doesn't cover zoom

`TILE_LATTICE = 15` (`src/styles/recipes/tile.ts`) rests on this claim: a
scale `p/q` is holdable when `q`'s odd part divides the span, and *every
derived scale's odd part is 1, 3 or 5*. That quantifier ranges over the
**density** ladder — dpr 1, 1.25, 1.5, 2, 2.5, 3, 4 → scales 1, 8/5, 4/3, 3/2,
6/5, 4/3, 5/4. It does not range over zoom. `trueDpr = dpr × zoom` walks
`ZOOM_LADDER` (`src/zoom.ts`), and the scales that fall out have denominators
the lattice has never heard of. On a 2× display:

| zoom | trueDpr | target | `--vf-scale` | odd part of q | 30-px span holdable |
| --- | --- | --- | --- | --- | --- |
| 75% | 1.5 | 2 | 4/3 | 3 | ✓ |
| 80% | 1.6 | 2 | 5/4 | 1 | ✓ |
| **85%** | 1.7 | 2 | 20/17 | **17** | ✗ |
| **90%** | 1.8 | 2 | 10/9 | **9** | ✗ |
| 100% | 2.0 | 3 | 3/2 | 1 | ✓ |
| **110%** | 2.2 | 3 | 15/11 | **11** | ✗ |
| **115%** | 2.3 | 3 | 30/23 | **23** | ✗ |
| 125% | 2.5 | 3 | 6/5 | 5 | ✓ |
| 150% | 3.0 | 4 | 4/3 | 3 | ✓ |
| **175%** | 3.5 | 5 | 10/7 | **7** | ✗ |
| 200% | 4.0 | 5 | 5/4 | 1 | ✓ |
| 250% | 5.0 | 7 | 7/5 | 5 | ✓ |
| 300% | 6.0 | 8 | 4/3 | 3 | ✓ |

Two things to notice:

- **At 110% and 115% the target is still 3** — the same count as 100%. Every
  solid edge paint-snaps to an identical raster, and only the tiled fills
  drift. That is the "nothing else changed" in the observation, exactly.
- **Safari's first zoom step in each direction is 115% and 85%** — both broken
  rungs. The very first ⌘+ lands on the worst case.

A 1× display has its own set (10/11 at 110%, 40/23 at 115%, 8/7 at 175%); the
pattern is the same.

**No bigger constant fixes this.** The zoom-derived denominators contain
arbitrary primes — 7, 11, 17, 23, and on Firefox's off-ladder steps whatever
the width ratio reduces to. A fixed lattice can only ever hold a fixed set of
odd factors. The span construction is correct for the density ladder and
*cannot* be extended to zoom by enlarging the constant.

## Why Chromium escapes and Safari apparently doesn't

THREE-X-DISPLAYS.md ("Why a 1× or 2× display escapes at every zoom") gives the
cancellation argument: engines multiply computed lengths by the zoom factor at
style time, *before* layout quantization, so the stored length is
`N × scale × zoom = N × target/baseDpr` — whole or half on a 1×/2× display,
holdable regardless of the table above.

That argument has a hidden premise: **the kit's scale and the engine's zoom
must cancel exactly.** In Chromium they do — zoom moves `devicePixelRatio`, the
kit derives `--vf-scale` from that same number, and the engine multiplies by
the same factor it reported. In Safari the engine never reports its zoom. The
kit *infers* it from integer-rounded `innerWidth` and snaps to the ladder
within 2% (`quantizeZoom`). The cancellation is then only as exact as the
inference, and three regimes are possible:

1. **Exact cancellation** — engine zoom is bit-identical to the assumed rung.
   Stored length is `N × target/baseDpr`, tile exact. (Chromium's regime.)
2. **No effective cancellation** — quantization lands on the pre-zoom value,
   or the engine's background-size path quantizes differently than assumed.
   The operative fraction is the raw `target/trueDpr` and the rung table above
   governs directly: drift of ~1/64 CSS px per span, half a device pixel by
   the far edge of a wide desktop.
3. **Zoom mismatch** — the engine's factor differs from the assumed rung by
   some δ (integer `innerWidth`, the 2% snap, float ulp against a floored
   1/64 grid). Error is `δ × span` per span — much larger, visible within a
   few tiles.

The tiled fills are the *only* surfaces sensitive to this channel — everything
else survives any of the three regimes because paint snaps each box
independently. That is the sense in which the tiling really is parameterized on
something nothing else depends on: not a different property, but a different
*sensitivity* — it alone requires the stored post-zoom length to be exact,
and on Safari that exactness rests on an inferred number.

## Confirming the analysis

The plan below is robust across all three regimes, so it does not *depend* on
which one measurement reveals — but the fingerprint is still worth taking, to
confirm the diagnosis and to leave a before-raster for the verify work:

1. **The rung fingerprint.** In Safari on a 2× display: drift at 85%, 115%,
   175%; clean at 75%, 100%, 125%, 150%, 200%. Drift at a "clean" rung means
   regime 3 (mismatch), not regime 2.
2. **The cross-browser control.** Chrome at 110% (dpr 2.2 — same 15/11 scale)
   should stay clean if the cancellation story is right.
3. **The direct measurement.** Safari at 115%: computed `background-size` vs
   `span × scale` — off by a clean fraction → regime 2; off by dust →
   regime 3; dead-on while pixels smear → quantization past computed-value
   time.
4. **Severity as a diagnostic.** Gradual far-edge graying → regime 2; heavy
   smear within a few tiles → regime 3.

**CI proxy:** real ⌘+ zoom can't be driven by Playwright, but emulated
`deviceScaleFactor: 1.7` / `2.3` produces exactly the regime-2 arithmetic.
Those two densities in `scripts/verify-tile.mjs` reproduce the broken-rung
math headlessly today, and become the regression gate for the plan.

---

# The plan: canvas-backed tiles

The decision is to stop leaning on CSS `background-repeat` for the kit's
repeating fills. Every one of this document's regimes — and both of
THREE-X-DISPLAYS.md's tile residuals — comes from asking the engine to place
`N` repeats at `k × tileSize` using a length the kit can only *request*. A
`<canvas>` inverts the relationship: the kit states the backing store in
whole device pixels and puts every motif pixel where it belongs with integer
arithmetic. There is no stored CSS length in the loop, so there is nothing to
quantize and nothing to accumulate.

## Why this closes the whole class

- **Zoom rungs (this document):** the canvas draws in device-pixel integers;
  the scale's denominator never enters. Exact at 30/23 as at 3/2.
- **Unholdable densities (THREE-X-DISPLAYS):** same arithmetic — Windows
  125%/150%, 2.5×, native 3× all become exact, with no span construction
  needed on the converted surfaces.
- **The border-floor residual:** the windoid dots, swatch checker and barber
  stripes still smear today because their *background layer* starts inside a
  floored border, on a half device pixel. A canvas is a **box**, and boxes are
  paint-snapped individually — so converting these three surfaces also
  retires the residual `verify:tile` currently prints instead of failing.
  (The hairline borders themselves stay thin — that is the separate
  `border-width` problem and its `box-shadow` remedy.)
- **Regime 3 degrades instead of compounding:** if Safari's true zoom differs
  from the inferred rung by δ, the engine maps the canvas box to
  `(1+δ)×` its backing store — a bounded, uniform resample of the whole
  surface (at most a glitch line or two), not per-repeat drift. Strictly
  better in the worst case, identical (exact) in every other.

## Scope — what converts and what stays

| Surface | Today | Converts | Notes |
| --- | --- | --- | --- |
| `vf-desktop` dither (`.screen`) | `url()` tile + `vfTileSize` | **yes — first** | Declared `width`/`height` in system px; no animation; forced-colors already drops the tile |
| `vf-window` windoid dots (`.vf-dots`) | tile layer inset in the bar | **yes** | Interior width derivable from the declared window width; retires its inset residual |
| `vf-swatch` checker | tile behind the color | **yes** | Declared size; retires its inset residual |
| `vf-progress-bar` barber stripes | tile + `background-position` keyframes | **yes** | Needs the animator (below); retires its inset residual |
| Scroll trough dither | `::-webkit-scrollbar-track` | **no — cannot** | A pseudo-element can't host an element. Keeps the span approach and this doc's zoom caveat; Firefox already approximates via `scrollbar-color` |
| Title-bar racing stripes (`vfStripes`) | 12-unit SVG (Blink) / placed rows (Gecko, WebKit) | **no — needn't** (drift); the gradient retired 2026-08-10 for rasterization failures, not drift | ≤6 repeats in an 11-system-px band; accumulation can't reach half a device pixel. The Gecko report (one stripe soft at default zoom) was GPU WebRender's gradient-texture sampling — placed solid rows fixed it 2026-08-09, and WebKit joined the rows 2026-08-10 when its gradient measured a device row thin at dpr 3 and the zoom-minted scales. Blink now draws a 12-unit SVG: 12·scale is a whole CSS length at every integer display's scale, so the box Blink CSS-px-rounds never rounds — whole-rhythm and zero-gray where the gradient smeared (see verify-tile.mjs) |

`tile.ts` is not deleted. The span construction remains load-bearing for the
trough, for the CSS underlay layer (below), and for the forced-colors mask
branches.

## Architecture

**One motif source.** Each motif today is URL-encoded SVG rects baked into a
data URI. Re-author each as *data* — a list of 1-bit rects in system px
(`{x, y, w, h}` over a 2×2, 12×12, … cell) — and generate both artifacts from
it: the SVG tile (for the CSS underlay, the forced-colors masks, and the
pattern tokens' default) and the canvas draw. The artwork stays two or three
rects written once.

**A shared `TileCanvasController`** (ReactiveController, in the
`GridSnapController` / `TrackWidthController` mold). The host supplies:

- the `<canvas>` in its shadow root (absolutely positioned to fill the layer
  the tile paints today, `aria-hidden`, pointer-events none);
- the motif (rect data + cell size) or the resolved pattern token;
- a sizing source: **declared** system px where the component has them
  (desktop, swatch, windoid via window width), else **measured**
  (`ResizeObserver`, rounded to the nearest whole system px; on Chromium
  `devicePixelContentBoxSize` is exact ground truth);
- optionally a phase, for the animator.

The controller owns backing-store sizing, drawing, and resubscription
(`onScaleChange` — in the consumer-reader tier, after the scale writers —
plus resize and connect/disconnect).

**Drawing.** Render the motif once into an offscreen cell of
`motifSys × n` device px (`n` = `devicePxPerSystemPx(trueDpr)`) with integer
`fillRect`s, then `createPattern` + one fill of the full backing store. Canvas
pattern space repeats at integer device-pixel periods, so a 5K desktop costs
one pattern fill, not millions of rects. Animation phase is
`ctx.translate(phaseSys × n, 0)` — integers throughout.

**The CSS tile stays as underlay.** The existing `background-image` +
`vfTileSize` declaration remains beneath the canvas: it paints before
`firstUpdated`, covers JS-disabled and canvas-failure paths, and is what
forced-colors mode sees. The canvas is an exactness overlay, not a
replacement — a page is never blank-filled while scripts load.

## Why the backing store is provably right

The trap a naive conversion would hit: if the backing store disagrees with the
canvas box's device-pixel size, the engine resamples the bitmap and the cure
becomes the disease. The kit can avoid the disagreement *by construction*:

- Backing store = `sizeSys × n` — both whole integers, no measurement, no
  rounding, for every declared-size surface.
- The canvas box's CSS length is stored at most 1/64 CSS px off the ideal
  (the LayoutUnit bound). Paint snapping rounds the box to the nearest device
  pixel, and `(1/64) × dpr < 0.5` for every dpr below 32 — so the snapped box
  is *exactly* `sizeSys × n` device px, always, including at every unholdable
  scale. The 1:1 blit is guaranteed; `imageSmoothing` never engages.

Measured-size surfaces (the progress fill) inherit the same guarantee whenever
their box sits in whole-system-px geometry, which the kit's own containers
produce by construction; a page that puts one on fractional geometry degrades
to a one-device-pixel edge artifact, still strictly better than today.

## The animator (barber stripes)

Today: `@keyframes vf-barber` advances `background-position` one 12-px cell
per 0.4s in `steps(4)`. Canvas version: a 100ms timer redraws with the phase
advanced 3 system px — four integer redraws per cycle, wrapping seamlessly at
the cell like the keyframes do. Cheap (one pattern fill of a small bar, 10Hz),
and fully under the kit's control end-to-end — no CSS length is ever asked to
carry the phase. It holds still under `prefers-reduced-motion` (existing
convention), pauses on `visibilitychange: hidden`, and runs only while
`indeterminate` and connected.

## Forced-colors mode

Canvas pixels are exempt from forced-colors remapping, which is wrong for
surfaces whose tile carries meaning. Keep the existing branches: in
`forced-colors: active` the canvas hides and the current CSS does what it does
today — the desktop goes flat `Canvas` (already tile-less there), the dots and
stripes re-ink through their `mask-image` branches. Those masks keep the span
approach and therefore this doc's zoom caveat; forced-colors plus Safari zoom
is accepted as a residual rather than plumbing system-color repaints through
canvas.

## The theming contract

`--vf-desktop-pattern`, `--vf-dots-pattern`, `--vf-progress-stripes` (and the
swatch's) currently override the whole tile. The contract survives: at draw
time the controller resolves the token; when a consumer has overridden it, the
controller loads that image and `createPattern`s it at `n` device px per
image px with smoothing off — consumer art gets the same exactness as kit art.
(Draw-only, no readback, so cross-origin art can't taint anything the kit
needs — the `vf-icon` open-ghost precedent.) Conservative first step while
that path is unproven: an overridden token simply hides the canvas and falls
back to today's CSS tiling. Token changes are re-checked on scale and resize
events, not observed live; a runtime token swap wants a `requestGridSnap`-style
nudge, documented.

## Testing

- `verify:tile` gains densities **1.7 and 2.3** (the regime-2 proxy) and
  flips its expectations: the four converted surfaces are asserted to
  **zero gray at every density**, including the two proxies and including the
  three surfaces whose inset residual is currently printed-not-failed.
  The trough keeps its arithmetic-only checks (headless still paints no
  `::-webkit-scrollbar` skin).
- The stripes animator gets a phase assertion: two screenshots a step apart
  differ by exactly `3 × n` device px of translation, no gray.
- `verify:grid` / `verify:snap` interplay: the canvas lives inside the
  component's snap-corrected paint root (`.vf-snap`), so grid snapping moves
  it as a box — assert the backing-match holds after a snap correction.
- The Safari zoom walk (85 → 300%) stays in the manual matrix — it is the one
  case no harness can produce, and it is the case that motivated all of this.

## Order of work

1. **Infrastructure + `vf-desktop`.** Motif-as-data refactor,
   `TileCanvasController`, desktop converted (declared size, no animation,
   trivial forced-colors). Add the 1.7/2.3 densities and the raster-zero
   assertion for the desktop.
2. **`vf-swatch`, windoid dots.** Small surfaces, adds the inset-residual win;
   update the THREE-X-DISPLAYS residual table.
3. **`vf-progress-bar`.** Adds the animator and its verify.
4. **Cleanups** that stand regardless: delete the dangling
   `{@link SCALE_GRID}` in `src/zoom.ts`; scope the README /
   THREE-X-DISPLAYS claims ("holdable at every scale", "✓ at every zoom") to
   what is actually guaranteed; note the trough as the one surface still on
   CSS tiling.

## Open questions

- **Canvas size ceilings.** iOS Safari historically caps canvas area around
  16.7M px; a full-screen 5K desktop backing store is ~14.7M px — inside the
  cap but close. Decide whether the controller needs a split-into-bands
  fallback or just a documented bound. Memory is the honest cost either way:
  a full-screen 2× desktop holds a ~59 MB backing store where the SVG tile
  held kilobytes.
- **Whether consumer pattern tokens get the canvas path or the CSS fallback**
  in phase 1 (contract above allows either; fallback is safer, canvas is more
  honest).
- **Whether the trough ever escapes** `::-webkit-scrollbar` — it can't be
  canvas-backed while it lives in a pseudo-element; moving the rails to
  kit-drawn overlay elements would be its own project with its own
  interaction costs.

## Alternatives considered

- **Zoom-aware regenerated span** (a display-derived tile rewritten when the
  scale leaves the lattice): works only in regime 2 — if measurement shows a
  δ mismatch there is no clean fraction to hold — and reintroduces the
  keep-in-sync property the span design existed to avoid. Superseded.
- **Whole-box SVG pattern** (the pattern rect grown to the surface's declared
  size): removes repeat accumulation for the desktop, but keeps the engine's
  SVG-image rasterizer in the loop, does nothing for the inset-origin
  residual, and per-surface it converges on the canvas plan with less
  control. Superseded.
- **A bigger lattice constant** — impossible; the denominators contain
  unbounded primes (above).
- **Stepping the target to a holdable count** — implemented and reverted
  (THREE-X-DISPLAYS.md): non-monotonic under zoom, and the odd part comes
  from `trueDpr`'s own denominator, which no integer target removes.
- **Accept under zoom** — was the fallback; rejected as the plan because
  Safari's first zoom step in each direction lands on a broken rung and the
  desktop dither is the kit's most visible surface.
