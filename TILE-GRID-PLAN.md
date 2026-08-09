# The tile grid: placed tiles replace CSS `background-repeat`

**Status: IMPLEMENTED 2026-08-09, with one measured revision.** The plan below
is the document the implementation started from; what shipped
(`src/tile-grid.ts`, `scripts/verify-tile.mjs`) keeps its scope, its flat
placed-tile machinery, its testing program and its decisions — with the fill's
*default* path revised, because implementation-time measurement refuted two of
the plan's assumptions:

- **Chromium rasterizes an SVG image at the box's *stored* (fractional) layout
  size and ignores `image-rendering` for SVG entirely** — so SVG tile art
  smears inside a perfectly placed box at a zoom-minted scale (inline
  `crispEdges` patterns smear the same way; measured). Tile art must be
  raster under `image-rendering: pixelated`: the motifs are stated once as
  rect data and encoded at one image px per system px at runtime
  (`tileRects` / `tileRaster`, src/styles/recipes/tile.ts).
- **Chromium paints an image background to the box's *unsnapped* rect with an
  antialiased edge** — so at a zoom-minted scale every *interior* tile
  boundary blends a one-device-px line no matter how exactly the boxes are
  placed. The seam theorem below holds for geometry (asserted, it passes at
  every density) but not for paint: no per-tile scheme reaches zero gray at a
  broken rung.

So the kit's own art renders as **one whole-surface raster** — no interior
seams to blend, and nearest-neighbor sampling can only emit source colors;
this is "one big pixelated tile", where Adam's amendment had already pushed
the canvas plan — and this plan's placed tile grid is the **consumer-token
path**, where the documented 30/60-px tile geometry requires per-tile boxes
(`patternOverride` picks the path at update time; a runtime token swap wants a
`requestUpdate()`). Forced colors keeps the span-mask layer branches — no
mask pipeline rasterizes exactly at a zoom-minted scale, `image-rendering`
does not reach masks — so forced-colors-plus-zoom stays the accepted residual
after all, unchanged from before this work. Consumer grids inside a
floored border keep a printed per-seam hairline at 1.25×/1.5×/2.5× (the old
inset residual, reduced from surface-wide smear). Everything else shipped as
written: kit art is asserted **zero gray on all four surfaces at all eight
densities**, the barber steps in whole pixels and wraps byte-identically, and
the grid recovers under `applyGridSnap()`.

This document is the implementation plan for retiring CSS-repeated fills on
the kit's four convertible tiled surfaces and replacing them with
absolutely-placed tile elements. It supersedes the canvas-backed plan in
[ZOOM-TILE-DRIFT.md](./ZOOM-TILE-DRIFT.md) (whose *analysis* — the zoom-rung
table, the three Safari regimes, the confirmation experiments — remains valid
and is not repeated here). Companion:
[docs/THREE-X-DISPLAYS.md](./docs/THREE-X-DISPLAYS.md), the same limit at base
densities.

**Picking this up cold:** read this document, then the analysis half of
ZOOM-TILE-DRIFT.md (everything above "The plan: canvas-backed tiles"). The
working commands are `npm run dev` (port 5173), `npm run verify:tile` (against
that server), and `npm test` (full suite, starts its own server). The file
inventory at the bottom lists every file this work touches.

## The problem, in one paragraph

A CSS repeating fill is ONE paint-snapped box holding N *unsnapped* repeats,
each placed at `k × tileSize` where `tileSize` is a single stored length the
engine quantizes to its layout grid (Chromium `LayoutUnit` 1/64 CSS px, Gecko
1/60). The quantization error compounds linearly with `k` until a motif
boundary has walked a whole device pixel and the 1-bit art smears to gray. The
span construction in `src/styles/recipes/tile.ts` (`tileSpan`: tiles span
`lcm(motif, 15)` system px) makes the stored length exact for every scale the
*density* ladder derives — but zoom mints scales with arbitrary prime
denominators (20/17 at 85%, 15/11 at 110%, 30/23 at 115%, 10/7 at 175% on a 2×
display), no finite lattice can hold them, and Safari's inferred zoom adds a
third failure regime where the error is a δ-mismatch rather than a clean
fraction. Full derivation: ZOOM-TILE-DRIFT.md.

## The fix, in one paragraph

Stop asking the engine to repeat. Render the fill as a flat set of absolutely
positioned tile elements — each at `left: calc(var(--vf-scale,1) * (k × T)px)`,
each `T × T` system px, each carrying one pre-composited tile of art. Each
tile's position is computed independently in double precision and quantized
**once** (error ≤ 1/128 CSS px *regardless of k* — nothing accumulates), and
paint snapping then rounds each tile's box to the device grid on its own. "Each
box paint-snaps independently" is exactly the property that already makes every
border, stepped corner and magnified icon in the kit rasterize exactly at
unholdable scales; this makes the tiled fills ride it too. No lattice, no span
arithmetic, no zoom sensitivity: 30/23 is as exact as 3/2.

## Why it is exact (the argument, for the reviewer)

- **Position.** Ideal device position of tile k is `k·T·s·dpr = k·T·n` (a whole
  number, where `n = devicePxPerSystemPx(trueDpr)` and `s·dpr = n`). The stored
  CSS length errs ≤ 1/128 CSS px (half a LayoutUnit; Gecko ≤ 1/120), so the
  painted edge errs ≤ `dpr/128` device px — under half a device pixel for every
  dpr below 32 — and snaps to exactly `k·T·n`. Independent of k.
- **Seams.** Tile k's far edge is `quant(kTs) + quant(Ts)`; tile k+1's origin is
  `quant((k+1)Ts)`. Both are within `dpr/64 < 0.5` device px of the same
  integer, so both snap to the same device row/column: no gap, no overlap,
  guaranteed by the same bound.
- **Interior.** After snapping, the tile box is exactly `T×n` device px (far
  edge minus origin, both exact), so the SVG tile rasterizes at a whole factor:
  every `crispEdges` rect on integer user coordinates lands on integer device
  pixels. Same argument `tileImage`'s doc comment already makes for the span.
- **The floored-border case** (windoid dots, swatch checker, barber stripes —
  the "inset residual" verify:tile prints instead of failing). The layer these
  tiles sit in starts inside a border Chromium floors, so the *layer* origin
  can sit off the device grid at dpr 1.25/1.5/2.5. Every tile then carries the
  same fractional part and snaps the same direction: the whole grid nudges
  uniformly by < 0.5 device px, tile boxes stay exactly `T×n`, no gray anywhere.
  Cost: the pattern's phase can shift one device px relative to the frame ink —
  invisible in a dither, and the border floor itself remains the separate open
  `border-width` finding (see THREE-X-DISPLAYS.md).
- **Safari regime 3** (engine zoom ≠ inferred rung by δ). Tile positions drift
  `kTn·δ`; snapping makes occasional tiles one device px wider or narrower,
  each a localized single-tile artifact instead of surface-wide smear. Bounded,
  strictly better than today, comparable to what the canvas plan promised.
- **Grid snapping.** Tiles live inside the component's snap-corrected paint
  root (`.vf-snap`), whose correction is a uniform sub-pixel translation — all
  tiles shift together and per-tile deltas stay exact multiples of `n`.

**The trap that must not be reintroduced:** do NOT lay tiles out with CSS grid,
flexbox, inline-block flow, or nested row containers "for cleanliness." Track
and flow layouts accumulate quantized track/box sizes — position of column k is
a *sum* of k quantized lengths, error `k/64` CSS px, and the disease returns
(29 columns ≈ 0.45 CSS px ≈ a device pixel at dpr 2). It must be a **flat** set
of absolutely positioned children, each with its own single-multiplication
`calc()`. Also do not resurrect cell-rounding / target-stepping — implemented
and reverted, see THREE-X-DISPLAYS.md "Why the kit does not simply pick a
different target."

## Why not the canvas plan (decision record)

The canvas plan (ZOOM-TILE-DRIFT.md bottom half) closes the same class via a
device-integer backing store. Superseded because the tile grid gets the
identical guarantee while: needing no canvas API at all (no backing-store
memory, no iOS canvas-area caps, no **context loss** — a real iOS failure mode
the canvas plan never addressed — no `createPattern`, no smoothing flags);
staying in the kit's own idiom (`sysLength` + absolute placement + paint snap —
machinery `verify:grid` already interrogates); keeping the browser the owner of
all repaints; and closing the forced-colors residual the canvas plan explicitly
accepted (canvas pixels are exempt from forced-colors; DOM tiles can carry the
existing mask-image branches with exact placement — see below). The canvas's
remaining advantages were O(1) DOM and nothing else that survived scrutiny.
Adam's amendment (system-scale backing store + `image-rendering: pixelated`)
had already collapsed that plan into "one big pixelated tile"; many small tiles
on the existing placement machinery is the same idea with less machinery.

## Scope

| Surface | Layer (shadow) | Motif | Tile `T` | Converts | Sizing source |
| --- | --- | --- | --- | --- | --- |
| `vf-desktop` dither | `.screen` | 2×2 | **30** | yes — first | declared `width`/`height` (screen box; bezel already excluded by `.screen`'s inset) |
| `vf-window` windoid dots | `.vf-dots` | 2×2 | **30** | yes | declared window `width` minus frame borders; bar geometry constants (utility bar 12px, dots layer inset 2px top/bottom, flush sides → ~`(width−2) × 8`; confirm exact interior at implementation — overdraw + clip absorbs slack) |
| `vf-swatch` checker | `.fill` | 4×4 | **60** | yes | declared `width`/`height` (default 24×18) minus 1px border + 1px inset per side |
| `vf-progress-bar` barber stripes | `.fill.stripes` | 12×12 | **60** | yes | height fixed 12 sys (14 − borders); width measured — `TrackWidthController` already exists on the component for the determinate fill, reuse it via `toSys` |
| Scroll trough dither | `::-webkit-scrollbar-track` | 4×2 | — | **no — cannot** | a pseudo-element can host no children. Keeps span tiling and the zoom caveat; Firefox already approximates via `scrollbar-color` |
| Title-bar racing stripes (`vfStripes`) | `.vf-stripes` | gradient | — | **no — needn't** | ≤6 repeats in an 11px band; accumulation can't reach half a device pixel |

**Tile size decision: `T` = each surface's currently *documented* tile span**
(30 for dither/dots — their tokens are documented as 30-system-px tiles; 60 for
checker/barber). This keeps the theming contract *verbatim*: a consumer's
`--vf-desktop-pattern` authored for a 30-px tile renders at exactly today's
geometry, now exactly placed — consumer art gets the exactness for free, no
override-detection, no CSS-tiling fallback path, no doc churn. The cost is
element count on the desktop (below). If profiling ever objects, moving a
surface to a larger tile (60/120, re-emitting the kit art at that span and
re-documenting its token) is a contained follow-up — noted, not planned.

Element-count bounds (worst realistic case, full-screen desktop on a 5K 2×
display, scale 3/2 → ~1707×960 sys): 57×32 = **1824** desktop tiles; a typical
512×342 showcase desktop is 18×12 = **216**. All other surfaces are a handful.
Tiles are static, share one decoded image, and change count only when the
*declared system-px size* changes — counts are scale-independent, so density
and zoom changes re-render **nothing** (the `calc()`s are live against
`--vf-scale`). No new subscriptions, no ResizeObserver beyond the one the
progress bar already has, and **no new controller** — the grid is a pure
function of declared props rendered in `render()`.

## Architecture

### Art (`src/styles/recipes/tile.ts` — stays, gains one parameter)

`tileImage(motifW, motifH, motif)` already emits exactly the right artifact: a
data-URI SVG of `tileSpan` px per side whose internal `<pattern>` lays the
motif — the subdivision rasterizes exactly at any whole device factor. Add an
optional explicit span (`tileImage(motifW, motifH, motif, spanW?, spanH?)`) so
tile size decouples from `TILE_LATTICE`; existing call sites are unchanged
(current spans are the chosen `T`s, so the four `*_TILE` constants in
`vf-desktop.ts`, `pattern.ts`, `vf-swatch.ts`, `vf-progress-bar.ts` are reused
as-is). `TILE_LATTICE`, `tileSpan`, `vfTileSize`, `vfTileMaskSize` all remain
load-bearing for the trough and the underlay.

### The grid (`src/tile-grid.ts`, new)

Two exports (naming to taste; follow `glyphSvg`'s helper-plus-constants mold):

- **`vfTileGrid`** — a `CSSResult` with the shared rules:

  ```css
  .vf-tile-grid {            /* the container — the existing layer itself,
                                or a child filling it */
    overflow: hidden;        /* clip the overdraw */
    pointer-events: none;
  }
  .vf-tile {
    position: absolute;
    background-size: 100% 100%;      /* NOT the default — intrinsic size must
                                        never leak in; the box is the size */
    background-repeat: no-repeat;
    image-rendering: pixelated;      /* consumer raster art magnifies
                                        nearest-neighbor, the kit idiom */
  }
  ```

- **`tileGrid({ cols, rows, tile, image })`** — a template helper returning the
  flat keyed repeat of `.vf-tile` divs, each with inline
  `left/top: ${sysLength(k * tile)}; width/height: ${sysLength(tile)}` and the
  `background-image` (a token `var()` with the kit tile as fallback — same
  expression the layer carries today). `cols = ceil(wSys / tile)`,
  `rows = ceil(hSys / tile)` computed by the caller from declared props; the
  clipped last row/column is fine by construction. (Optimization if inline
  styles feel heavy: shared `width/height` via a `--_tile` custom property on
  the container; positions stay per-tile inline `calc()` — that part is the
  correctness.)

Export both from the package root and add a README toolkit-table row;
`npm run analyze` regenerates the manifest.

### Per-surface wiring

- **`vf-desktop`** — tiles render as the first child of `.screen` (which
  already has `overflow: hidden`), before the `<slot>`; slotted windows stack
  above (they're positioned; no z-index games needed, but confirm against the
  utility-tier band). Counts from `width`/`height` props — already reactive.
  The `.screen` background declarations **stay as underlay** (pre-upgrade and
  belt-and-braces paint; identical art, fully occluded when the grid covers).
- **`vf-window` dots** — tiles inside the `.vf-dots` layer (add
  `overflow: hidden` to it). One row of 30-px tiles, cols from declared
  `width`. Rendered only for `variant="utility"`; the inactive-window rule
  (`:host(:not([active])) .vf-dots { display: none }`) hides tiles with the
  layer for free.
- **`vf-swatch`** — tiles inside `.fill` (add `overflow: hidden`). The
  translucent-color layering moves from a second background layer on `.fill`
  to a `.tint` child painted *above* the tiles (solid or translucent color).
  With an opaque `color` the tiles are invisible — rendering them anyway is
  simplest; skipping them is a permissible micro-optimization.
- **`vf-progress-bar` barber** — a `.vf-tile-strip` child inside
  `.fill.stripes` (add `overflow: hidden`), holding one row of 60-px tiles
  covering `fillWidthSys + 12`, resting at `left: −12` sys px. The white
  ground stays the `.fill`'s own `background-color` (the barber tile art is
  black rects on transparent). Animation: keep it **pure CSS** —

  ```css
  @keyframes vf-barber-grid {
    from { left: calc(var(--vf-scale, 1) * -12px); }
    to   { left: 0; }
  }
  /* 0.4s steps(4, end) infinite — one 12px cell per cycle, seamless wrap */
  ```

  The animated value is a layout property, so every step re-runs
  layout+paint-snap, and each stepped value is one quantized length — the
  interpolation error between quantized endpoints is far under the half-pixel
  bound. This preserves today's `steps(4)` cadence and direction
  (`background-position 0 → 12px` ≡ strip `−12 → 0`), keeps
  `prefers-reduced-motion: reduce → animation: none` (strip rests at −12,
  fully covering), gets offscreen throttling free, and — decisive for testing —
  is steppable via `document.getAnimations()` / `currentTime`. Fallback if a
  Safari probe shows keyframed calc-`left` misbehaving: a 100ms timer writing
  `left` in whole sys px, with `visibilitychange` pause; run only while
  `indeterminate` and connected. The determinate fill is untouched.

### Forced colors

Per surface, porting today's branches onto the tiles:

- **desktop** — hide the tiles (`display: none` on the grid in
  `forced-colors: active`); the layer already goes flat `Canvas` today.
  Unchanged posture: a backdrop is decoration.
- **dots, barber** — the meaning-carrying dithers: each `.vf-tile` swaps to
  `background-image: none; background-color: var(--vf-black, #000)` (remapped
  ink token) with `mask-image:` the same tile art, `mask-size: 100% 100%`.
  Same art, same token, now exactly placed — **this closes the
  forced-colors-plus-zoom residual the canvas plan accepted.** The barber
  needs no separate mask-position animation: the strip moves the tiles, masks
  ride along.
- **swatch** — keep `forced-color-adjust: none` (the fill is content; the
  spec's own color-picker exemption), now on the tiles and tint.

### Theming contract

Unchanged, verbatim: each tile's `background-image` is
`var(--vf-desktop-pattern, DITHER_TILE)` (etc.), stretched `100% 100%` over a
box of exactly the span the token has always documented. Consumer art —
SVG or raster — gets grid-exact placement; raster art additionally gets
`pixelated` magnification (matching `vf-img`; note in the token docs). Token
reads are live `var()` in CSS, so runtime token swaps repaint without any
nudge — better than the canvas plan's re-check-on-resize contract. The
`@cssprop` comments trade "the span a repeating fill has to span" wording for
"the placed tile grid"; spans themselves don't change.

## Testing

`scripts/verify-tile.mjs` is rewritten around the new claim:

1. **Densities.** Add `1.7` and `2.3` (scales 20/17 and 30/23 — the emulated
   regime-2 proxy for Safari's broken rungs; real ⌘± cannot be driven
   headlessly) to the existing `[1, 1.25, 1.5, 2, 2.5, 3]`.
2. **Raster.** All four converted surfaces assert **zero impure pixels at
   every density** — including the two proxies, and including the three
   surfaces whose inset residual is today printed-not-failed (the uniform
   grid-nudge argument above is why zero is now reachable). Keep the
   interior-crop (host box edges are legitimately partial at unholdable
   sizes). Pure set: `#000`, `#fff`, `#c0c0c0`.
3. **Abutment.** For adjacent tiles in each surface:
   `round(right_k × dpr) === round(left_{k+1} × dpr)`, and each tile's device
   width `=== T × n` — the seam theorem, asserted directly.
4. **Phase.** Pause the barber animation via `getAnimations()`, screenshot at
   `currentTime` 0 and 100ms, assert the raster is translated by exactly
   `3 × n` device px with zero gray at both.
5. **Arithmetic.** The trough keeps its span checks (headless paints no
   `::-webkit-scrollbar` skin) — they are all that guards it now.
6. **Snap interplay.** One `verify:snap`-style case: knock a tiled host
   off-grid, apply `applyGridSnap()`, assert zero gray after correction.
7. **Manual matrix** (the motivating case no harness reaches): Safari on a 2×
   display, ⌘± walk 85% → 300%. Expected: clean at *every* rung, 85/115/175
   included; regime-3 worst case is an isolated one-device-px line at a tile
   boundary, never smear. Chrome 110% control stays clean.

`npm test` must stay green throughout — `verify:grid`, `verify:snap`,
`verify:forced-colors`, `verify:manifest` (regenerate after the doc-comment
edits) all touch these components.

## Order of work

1. **Infrastructure + `vf-desktop`.** `tileImage` span parameter;
   `src/tile-grid.ts` (`vfTileGrid` + `tileGrid()`); exports; desktop
   converted (declared size, no animation, trivial forced-colors). Rewrite
   `verify-tile.mjs`: new densities, desktop zero-gray + abutment. *Accept:*
   desktop shows zero gray at all 8 densities; suite green.
2. **`vf-swatch` + windoid dots.** Small declared surfaces; the `.tint`
   restructure; dots' forced-colors mask tiles. Flip both raster residuals to
   hard assertions. *Accept:* their zero-gray + abutment assertions pass;
   forced-colors verify still passes.
3. **`vf-progress-bar`.** Strip + keyframed `left` (after a quick Safari
   probe of keyframed calc-`left`; else the timer fallback), forced-colors
   mask tiles, phase assertion. *Accept:* phase test passes; reduced-motion
   holds still.
4. **Docs + cleanup.** README ("repeating fills span a size the grid can
   express" → the placed-grid story; toolkit table row; zoom-section caveat
   now scoped to the trough only). THREE-X-DISPLAYS.md: residuals table and
   "How the test suite treats it" updated — the inset residual is retired on
   the three converted surfaces, the trough keeps both caveats.
   ZOOM-TILE-DRIFT.md: status → resolved-by pointer at this document.
   Token `@cssprop` wording; `npm run analyze`; delete the dangling
   `{@link SCALE_GRID}` in `src/zoom.ts` (pre-existing cleanup item). Consider
   a MAKING-OF chapter stub ("the tile that walked off the grid").
   *Accept:* `verify:manifest` green; Safari manual walk recorded.

## Decisions taken (do not relitigate without new evidence)

- Tile grid over canvas (rationale above; ZOOM-TILE-DRIFT.md preserves the
  canvas plan as the record of the road not taken).
- `T` = documented span per surface (30/30/60/60), contract verbatim.
- Flat absolute positioning with per-tile single-multiplication `calc()` —
  never track/flow layout, never nested row offsets, never intra-tile CSS
  repeat (a consumer tile smaller than its box would re-import accumulation;
  `background-size: 100% 100%` forbids it by construction).
- The CSS-repeat declarations stay on the layers as underlay.
- Trough and racing stripes stay as they are.

## Open questions for the implementing session

- Keyframed calc-`left` exactness in Safari (quick probe before phase 3; the
  timer fallback is specified and equivalent).
- Whether `vf-swatch` skips tile rendering under an opaque `color` (harmless
  either way).
- Desktop element count in anger: eyeball resize-drag responsiveness of a
  full-screen desktop on a 5K display during phase 1; the contained escape
  (bigger desktop tile + token re-doc) only if it actually stutters.

## File inventory

| File | Role in this work |
| --- | --- |
| `src/styles/recipes/tile.ts` | `tileImage` gains span param; everything else stays |
| `src/tile-grid.ts` (new) | `vfTileGrid` styles + `tileGrid()` helper |
| `src/components/vf-desktop.ts` | `.screen` grid; `DITHER_MOTIF=2`, `DITHER_TILE` at top of file |
| `src/styles/recipes/pattern.ts` | `vfDots` (layer def, forced-colors mask branch); `DOT_MOTIF=2`, `DOT_TILE` |
| `src/components/vf-window.ts` | renders `.vf-dots` (utility variant, ~line 589); bar constants ~lines 165–190 |
| `src/components/vf-swatch.ts` | `.fill` grid + `.tint`; `CHECKER_MOTIF=4`, `CHECKER_TILE`; defaults 24×18 |
| `src/components/vf-progress-bar.ts` | strip + animation; `BARBER_MOTIF=12`, `BARBER_TILE`, `vf-barber` keyframes; `TrackWidthController` already present |
| `src/styles/recipes/scrollbars.ts` | trough — untouched, keeps span tiling |
| `src/scale.ts` | `sysLength` (the per-tile `calc()` emitter), `toSys`, `onScaleChange` |
| `src/zoom.ts` | `devicePxPerSystemPx`, `truePixelRatio`; delete dangling `{@link SCALE_GRID}` |
| `scripts/verify-tile.mjs` | rewritten as above; harness in `scripts/harness.mjs` |
| `README.md`, `docs/THREE-X-DISPLAYS.md`, `ZOOM-TILE-DRIFT.md`, `SPEC.md` | phase-4 doc updates |
