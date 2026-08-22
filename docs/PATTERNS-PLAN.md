# Pattern fills: the MacPaint library and a declarative `pattern` on containers

**Status: PLANNED 2026-08-22, nothing implemented.** This is the implementation
plan for (1) shipping the 38 standard MacPaint/System patterns as named 8×8
data, (2) a `pattern` attribute on `vf-container` that paints one of them as
the box's background, and (3) routing the kit's own dithers through the same
data so one system draws every tiled 1-bit surface. When it ships, the library
table below moves to `docs/PATTERNS.md` (the consumer reference) and this
document is deleted, the way TILE-GRID-PLAN.md was folded into SIZING/SPEC.

Companions: `docs/SIZING.md` § The tile grid (why tiled fills are rasters),
`src/tile-grid.ts` (the exact-fill machinery this builds on),
`src/styles/recipes/tile.ts` (`TileRect`, `tileRaster`).

**Picking this up cold:** read this document, then `src/tile-grid.ts`'s header
and `vf-container.ts`. Working commands: `npm run dev` (:5173),
`npm run verify:tile` and `npm run verify:scrollbars` (the regression guards
for phase 2), `npm test` (whole suite). The file inventory is at the bottom.

## What this adds, in one screen

```html
<!-- a patterned region, placed children on top -->
<vf-container width="200" height="120" pattern="bricks">
  <vf-button top="48" left="60">OK</vf-button>
</vf-container>

<!-- the box's fill-width form: the pattern covers whatever width it gets -->
<vf-container fill-width height="40" pattern="gray-25"></vf-container>

<!-- a custom 8×8 pattern, stated the way a PAT resource stated it -->
<vf-container width="64" height="64" pattern="DD 77 DD 77 DD 77 DD 77"></vf-container>

<!-- phase 3: the General Controls desktop pattern -->
<vf-desktop width="512" height="342" pattern="gray-75"></vf-desktop>
```

`pattern` takes a library name or sixteen hex digits (two per row, top row
first, bit 7 the leftmost pixel, 1 = ink — the QuickDraw `Pattern` layout).
The ink is `--vf-black`-literal black like every kit raster, the paper is
`var(--vf-white)`, and the fill is 1-bit at every density and zoom the way the
desktop dither is, because it is the same mechanism: one whole-surface raster
at one image pixel per system pixel, magnified nearest-neighbor.

## The library

### Provenance

Transcribed from `~/Desktop/macpaint-fills.png`, a clean 2× capture
(228×315, pure black and white) of the tear-off pattern palette: a windoid
title bar with its close box over a 5×8 grid of 19×16 cells on a 20×17 pitch.
The first two cells of the grid are one double-wide **current-pattern well**
(black, with a 1px white inset), so the grid holds the **38** standard
patterns — the count of the System file's `PAT#` 0 and of MacPaint's pattern
bar — in palette order, row-major from the cell after the well.

Native pixel `(x, y)` is image pixel `(2x+1, 2y+1)`. Cell `(c, r)` has its
top-left at native `(5 + 20c, 15 + 17r)`; every cell tiles with period 8 in
both axes (asserted over the full 19×16 cell during extraction).

**Phase.** QuickDraw aligned a pattern to its port's origin, so each cell
shows the pattern at a different phase — `(20c, 11 + 17r) mod 8` from the
palette window's port origin at `(5, 4)`, the title bar's interior corner.
Un-shifting by that offset reproduces the three toolbox constants
byte-for-byte (`gray` AA55, `ltGray` 8822, `dkGray` DD77), so the same
anchor is applied to all 38. Phase is a cyclic shift and changes nothing
about a fill; it matters only because three of these bytes have to equal the
kit's existing motifs (see *Unification*).

The capture itself is Apple artwork and stays on the Desktop — it does not
enter the repo (the `fonts/imported` rule). What ships is 38 × 8 bytes of
data, stated once in `src/patterns.ts` the way `fonts/VF-*.glyphs.txt` states
the strikes: the table **is** the manifest. Credit line for the docs: the
standard Macintosh pattern set, designed at Apple for MacPaint and the
System file; stated here as 8-byte bitmaps.

### The 38, with proposed names

Palette order. Bytes are the eight rows, top first. Names are the one part of
this table that is API — rename freely before phase 1 lands; after that a
rename is a breaking change.

| # | name | bytes | ink |
| --- | --- | --- | --- |
| 0 | `black` | `FF FF FF FF FF FF FF FF` | 64/64 |
| 1 | `gray-50` | `AA 55 AA 55 AA 55 AA 55` | 32/64 — QuickDraw `gray`; the desktop dither |
| 2 | `white` | `00 00 00 00 00 00 00 00` | 0/64 |
| 3 | `gray-88` | `77 FF DD FF 77 FF DD FF` | 56/64 |
| 4 | `gray-75` | `DD 77 DD 77 DD 77 DD 77` | 48/64 — QuickDraw `dkGray` |
| 5 | `gray-75-striped` | `55 FF 55 FF 55 FF 55 FF` | 48/64 — solid rows over 50% rows |
| 6 | `gray-75-diagonal` | `BB 77 EE DD BB 77 EE DD` | 48/64 — white dots marching diagonally |
| 7 | `dots` | `AA 00 AA 00 AA 00 AA 00` | 16/64 — a square dot grid; the windoid bar's dither |
| 8 | `pinpoint` | `00 00 80 00 00 00 00 00` | 1/64 |
| 9 | `dots-sparse` | `08 00 80 00 08 00 80 00` | 4/64 |
| 10 | `speckle` | `40 04 80 10 02 20 01 08` | 8/64 — one scattered dot per row |
| 11 | `gray-12` | `22 00 88 00 22 00 88 00` | 8/64 — the ordered dither below `gray-25` |
| 12 | `gray-25` | `88 22 88 22 88 22 88 22` | 16/64 — QuickDraw `ltGray`; the scroll trough |
| 13 | `stripes-vertical` | `AA AA AA AA AA AA AA AA` | 32/64 — 1 on, 1 off |
| 14 | `stripes-horizontal` | `FF 00 FF 00 FF 00 FF 00` | 32/64 |
| 15 | `diagonal` | `44 88 11 22 44 88 11 22` | 16/64 — `/` hairlines, 4px pitch |
| 16 | `grid` | `88 88 FF 88 88 88 FF 88` | 28/64 — 4px lattice |
| 17 | `weave` | `0C 8D B1 30 03 1B D8 C0` | 24/64 — interlocking 2×2 blocks |
| 18 | `lines-vertical` | `88 88 88 88 88 88 88 88` | 16/64 — hairlines, 4px pitch |
| 19 | `lines-horizontal` | `00 00 FF 00 00 00 FF 00` | 16/64 |
| 20 | `diagonal-wide` | `40 80 01 02 04 08 10 20` | 8/64 — `/` hairlines, 8px pitch |
| 21 | `grid-wide` | `80 80 FF 80 80 80 80 80` | 15/64 — 8px lattice |
| 22 | `zigzag` | `08 00 80 40 20 00 02 04` | 6/64 — a dotted zigzag |
| 23 | `arrows` | `05 02 20 50 88 88 88 88` | 14/64 — verticals capped with arrowheads |
| 24 | `chevrons` | `AA 00 88 14 22 41 88 00` | 14/64 — Λ shapes under dotted rules |
| 25 | `shingles` | `04 08 10 20 54 AA FF 02` | 20/64 — a rule, a dithered band, a diagonal |
| 26 | `dotted-grid` | `80 00 AA 00 80 00 88 00` | 8/64 |
| 27 | `birds` | `00 00 40 A0 00 00 04 0A` | 6/64 — three-dot carets |
| 28 | `waves` | `01 01 03 84 48 30 0C 02` | 13/64 |
| 29 | `bricks` | `08 08 FF 80 80 80 FF 08` | 22/64 — running bond, 8×4 courses |
| 30 | `scales` | `02 04 08 1C 22 C1 80 01` | 13/64 — arches with a diagonal tail |
| 31 | `basket-weave` | `B0 B0 BF 00 BF BF B0 B0` | 33/64 |
| 32 | `lattice` | `01 01 82 44 39 44 82 01` | 15/64 — solid diamonds with a bar |
| 33 | `twigs` | `10 10 55 82 01 01 55 28` | 16/64 — forks between dotted rules |
| 34 | `hexagons` | `14 E3 80 80 41 3E 08 08` | 18/64 — honeycomb |
| 35 | `pyramids` | `22 71 F8 74 22 47 8F 17` | 30/64 — filled triangles in a diamond net |
| 36 | `mesh` | `14 08 00 08 14 2A 55 2A` | 16/64 — dotted diamonds |
| 37 | `stones` | `F8 F8 77 89 8F 8F 77 98` | 38/64 — rounded blocks and rings |

Naming rule: the ordered-dither ramp is `gray-N` by ink percentage
(`gray-12`, `-25`, `-50`, `-75`, `-88`); everything else is named for what it
reads as. No aliases (`light-gray`, `ltGray`) — the QuickDraw names are noted
in the table, not exported.

The motifs, in the palette's own layout (the well is the blank first cell;
each block is one 8×8 motif, `#` = ink):

```
   (well)      (well)     ########   #.#.#.#.   ........
                          ########   .#.#.#.#   ........
                          ########   #.#.#.#.   ........
                          ########   .#.#.#.#   ........
                          ########   #.#.#.#.   ........
                          ########   .#.#.#.#   ........
                          ########   #.#.#.#.   ........
                          ########   .#.#.#.#   ........

.###.###   ##.###.#   .#.#.#.#   #.###.##   #.#.#.#.
########   .###.###   ########   .###.###   ........
##.###.#   ##.###.#   .#.#.#.#   ###.###.   #.#.#.#.
########   .###.###   ########   ##.###.#   ........
.###.###   ##.###.#   .#.#.#.#   #.###.##   #.#.#.#.
########   .###.###   ########   .###.###   ........
##.###.#   ##.###.#   .#.#.#.#   ###.###.   #.#.#.#.
########   .###.###   ########   ##.###.#   ........

........   ....#...   .#......   ..#...#.   #...#...
........   ........   .....#..   ........   ..#...#.
#.......   #.......   #.......   #...#...   #...#...
........   ........   ...#....   ........   ..#...#.
........   ....#...   ......#.   ..#...#.   #...#...
........   ........   ..#.....   ........   ..#...#.
........   #.......   .......#   #...#...   #...#...
........   ........   ....#...   ........   ..#...#.

#.#.#.#.   ########   .#...#..   #...#...   ....##..
#.#.#.#.   ........   #...#...   #...#...   #...##.#
#.#.#.#.   ########   ...#...#   ########   #.##...#
#.#.#.#.   ........   ..#...#.   #...#...   ..##....
#.#.#.#.   ########   .#...#..   #...#...   ......##
#.#.#.#.   ........   #...#...   #...#...   ...##.##
#.#.#.#.   ########   ...#...#   ########   ##.##...
#.#.#.#.   ........   ..#...#.   #...#...   ##......

#...#...   ........   .#......   #.......   ....#...
#...#...   ........   #.......   #.......   ........
#...#...   ########   .......#   ########   #.......
#...#...   ........   ......#.   #.......   .#......
#...#...   ........   .....#..   #.......   ..#.....
#...#...   ........   ....#...   #.......   ........
#...#...   ########   ...#....   #.......   ......#.
#...#...   ........   ..#.....   #.......   .....#..

.....#.#   #.#.#.#.   .....#..   #.......   ........
......#.   ........   ....#...   ........   ........
..#.....   #...#...   ...#....   #.#.#.#.   .#......
.#.#....   ...#.#..   ..#.....   ........   #.#.....
#...#...   ..#...#.   .#.#.#..   #.......   ........
#...#...   .#.....#   #.#.#.#.   ........   ........
#...#...   #...#...   ########   #...#...   .....#..
#...#...   ........   ......#.   ........   ....#.#.

.......#   ....#...   ......#.   #.##....   .......#
.......#   ....#...   .....#..   #.##....   .......#
......##   ########   ....#...   #.######   #.....#.
#....#..   #.......   ...###..   ........   .#...#..
.#..#...   #.......   ..#...#.   #.######   ..###..#
..##....   #.......   ##.....#   #.######   .#...#..
....##..   ########   #.......   #.##....   #.....#.
......#.   ....#...   .......#   #.##....   .......#

...#....   ...#.#..   ..#...#.   ...#.#..   #####...
...#....   ###...##   .###...#   ....#...   #####...
.#.#.#.#   #.......   #####...   ........   .###.###
#.....#.   #.......   .###.#..   ....#...   #...#..#
.......#   .#.....#   ..#...#.   ...#.#..   #...####
.......#   ..#####.   .#...###   ..#.#.#.   #...####
.#.#.#.#   ....#...   #...####   .#.#.#.#   .###.###
..#.#...   ....#...   ...#.###   ..#.#.#.   #..##...
```

## Architecture

### What exists, and what is missing

The kit already has the hard half. `src/styles/recipes/tile.ts` states a
motif as `TileRect[]` and encodes it as a whole-surface raster
(`tileRaster`, one image px per system px); `src/tile-grid.ts` paints that
raster into a box under `image-rendering: pixelated` (`.vf-tile-raster`) and
memoizes the encode (`TileRasterCache`). Five surfaces use it, each wiring
its own copy of the same steps: a motif constant, a size in system px ceiled
to whole motifs plus one motif of overdraw, a clip, a `patternOverride()`
read for the consumer token, a forced-colors branch.

What is missing is everything *above* the raster: a pattern as a named,
attribute-stated value; a way to paint one on a box whose size is declared
*or* measured; and one place that does the ceiling, caching and writing so a
new surface is a property and two lines, not a fourth copy of `vf-desktop`'s
`render()`. Three new things, bottom-up:

```
src/patterns.ts        Pattern (8 bytes) · PATTERNS (the 38) · parsePattern · patternHex · patternRects
src/pattern-fill.ts    PatternFillController (paints a Pattern as a box's background) · vfPatternFill (its rules)
vf-container.pattern   the property; the first surface on the controller
```

### Data model — `src/patterns.ts`

```ts
/** Eight rows, top first; bit 7 is the leftmost pixel; 1 is ink. The QuickDraw Pattern. */
export type Pattern = readonly [number, number, number, number, number, number, number, number]

export type PatternName = 'black' | 'gray-50' | … | 'stones'
/** The 38 standard patterns, in palette order (insertion order is the order). */
export const PATTERNS: Readonly<Record<PatternName, Pattern>>
export const PATTERN_NAMES: readonly PatternName[]

/** A library name or sixteen hex digits (whitespace between bytes allowed,
 *  case-insensitive). Anything else → null. */
export function parsePattern(value: string | null | undefined): Pattern | null
/** The attribute form back: sixteen uppercase hex digits, no spaces. */
export function patternHex(pattern: Pattern): string
/** The ink as horizontal-run rects on the 8×8 cell — what tileRaster /
 *  tileImage take. `paper` set → an opaque 8×8 paper rect first (the desktop's
 *  opaque dither); unset → transparent ground (the dots / trough idiom). */
export function patternRects(pattern: Pattern, ink = '#000000', paper?: string): TileRect[]
```

- 8×8 only. It is the QuickDraw type, it is what the library is, and it is
  what the custom-pattern literal spells. The kit's two non-8-periodic motifs
  (the 12×12 barber, the 4×4 two-color checker) keep their `TileRect[]`
  constants; `TileRect[]` stays the engine's bottom-layer input and
  `patternRects` is the adapter onto it.
- Stored as byte tuples (`[0xDD, 0x77, …]`), not hex strings: readable in the
  source, bit-addressable in the verify script, converted once for the
  attribute form.
- Declared at module top, never module-tail (the `@vfElement` upgrade-time
  TDZ trap, `vintage-frames-cem-and-upgrade-traps`).

### The engine — `src/pattern-fill.ts`

```ts
export class PatternFillController implements ReactiveController {
  constructor(host, {
    getBox: () => HTMLElement | null               // the element whose background is painted
    getPattern: () => Pattern | null               // resolved by the component; null = no fill
    getSize?: () => { width?: number | null; height?: number | null } | null
                                                   // declared system px per axis; a missing axis is measured
    paper?: string                                 // bake an opaque paper into the raster (desktop); default transparent
  })
  /** The raster's current system-px box, for tests and for `vf-desktop`'s token path. */
  readonly size: { width: number; height: number } | null
}
export const vfPatternFill: CSSResult
```

**It paints the box's own background, not a child element.** Every existing
surface renders a `.vf-tile-raster` child because the consumer-token path
needs elements (a placed tile grid). A container has no token path, and a
background has three properties a child does not: it paints below all
content by definition (no `isolation: isolate` + `z-index: -1`, so a
patterned container never becomes a stacking context that traps a slotted
`vf-select`'s fixed panel under a later sibling — `vf-grid` already pays that
cost and a general-purpose box must not), it clips itself to the box (no
`overflow: hidden`, which the container must never set — outgrowing content
overflows by contract), and it needs no element to size. The exactness
argument is unchanged: a `background-size` stated in system px is one stored
length quantized once over the *whole* image (≤ 1/128 CSS px, the
`tile-grid.ts` bound), and nearest-neighbor sampling can only produce source
colors. Phase-1 acceptance measures this at the eight densities; if the
background form shows a single impure interior pixel the child-raster form
(the desktop's arrangement) is the fallback and this paragraph gets rewritten.

**What the controller does on `hostUpdated`:**

1. Resolve the box and pattern. No box, or no pattern → remove everything it
   wrote (the VfSized/VfPositioned unwind rule: only its own declarations)
   and stop.
2. Resolve the size in system px: a declared axis is used as is; an
   undeclared axis is the box's measured content size, `toSys`-rounded. The
   measurement is a `ResizeObserver` on the box, wired once per distinct
   element (the `TrackWidthController` shape — extend that controller to
   report `height` alongside `width` rather than write a third observer;
   `vf-slider`/`vf-progress-bar` keep reading `.width`). Declared on both
   axes → no observer at all, the `vf-desktop` contract.
3. Raster size: each axis ceiled to a multiple of 8 plus 8 of overdraw
   (`ceil((n + 8) / 8) × 8`) — a floored border or a fractional measured box
   overshoots rather than stretches, and the background painting area crops
   the rest. The encode is cached on `(patternHex, w, h)`: `TileRasterCache`
   gains a caller key (today it keys on size only, which is right for a fixed
   motif and wrong the moment the pattern can change under the same size).
4. Write onto the box's inline style, as custom properties the recipe reads:
   `--_vf-pattern-image: url(data:…)` and `--_vf-pattern-size: <w> <h>` as
   two `sysLength`s — live against `--vf-scale`, so density and zoom changes
   re-encode nothing, and the recipe's forced-colors rule can out-cascade
   them (an inline `background-image` could only be beaten with
   `!important`).

**The recipe** (`vfPatternFill`, composed by the component):

```css
.vf-pattern-fill {
  background-image: var(--_vf-pattern-image, none);
  background-size: var(--_vf-pattern-size, auto);
  background-repeat: no-repeat;     /* the box's overdraw is the repeat */
  background-position: 0 0;         /* phase anchored at the box origin */
  image-rendering: pixelated;       /* the exactness mechanism */
}
.vf-pattern-fill.patterned {
  background-color: var(--vf-white, #fff);   /* the paper, token-routed */
}
@media (forced-colors: active) {
  .vf-pattern-fill { background-image: none; }   /* flat Canvas — a backdrop is decoration */
}
```

`patterned` is set by the component's template from its resolved pattern, so
an unpatterned container paints exactly nothing, as it does today.

**Phase anchor: the box's own origin.** QuickDraw aligned patterns to the
port, so two abutting boxes in one window shared phase; here each fill
starts its motif at its box's top-left, which is what the desktop, trough and
swatch already do. Two same-pattern containers placed at offsets that are not
multiples of 8 will show a phase seam where they meet. Deliberately not
solved now — a port-anchored offset from `top`/`left` is a contained
follow-up (`patternRects` would take a phase, nothing else changes) and only
placed children could ever use it.

**Forced colors: flat.** The desktop's posture, for the desktop's reason — a
backdrop is decoration and high-contrast mode asks for less of it. The
`--vf-white` paper remaps to Canvas through `vfBase`. The one case this
under-serves is a pattern *chooser* under forced colors (every cell flat);
the windoid-dots mask idiom (`vfDots`) is the change if that ever matters,
and it keeps the forced-colors-plus-zoom residual every masked surface has.

**Ink and paper are the kit's, not tokens of their own.** Ink is literal
black in the raster like every kit raster (`--vf-black` retheming has never
reached raster art); paper is `var(--vf-white)`. No `--vf-pattern-ink` — the
1-bit palette is the contract, and System 7 patterns were 1-bit.

**No consumer token.** The attribute is the declarative channel and the hex
literal is the custom-art channel; that covers every 8×8 pattern there is. A
consumer who wants a larger motif or raster art has the existing token +
placed-tile-grid path on the surfaces that document one.

### `vf-container`

```ts
/**
 * A 1-bit fill for the box: a pattern name from the library (`bricks`,
 * `gray-50`, …) or sixteen hex digits stating a custom 8×8 pattern row by
 * row. Paints the pattern in black on a `--vf-white` ground under the
 * content, anchored at the box's top-left corner. Unset or unrecognized,
 * the container paints nothing (an unrecognized value warns once).
 */
@property() pattern?: string | null
```

- `willUpdate` resolves `pattern` through `parsePattern` into a private
  `_pattern: Pattern | null`; an unrecognized non-empty value warns once per
  element (the `#warnIfUnsized` latch idiom) and paints nothing.
- `render()` keeps the one shadow box and adds the class pair:
  `<div class="vf-snap box vf-pattern-fill${patterned}">`. The fill rides the
  grid-snap correction with the coordinate system, which is the point of the
  one-box arrangement.
- The controller: `getBox: () => this.box`, `getPattern: () => this._pattern`,
  `getSize: () => ({ width: this.width, height: this.height })` — a declared
  axis is exact and observer-free; `fill-width` and shrink-wrapped axes are
  measured.
- No `reflect` (nothing in CSS keys off the attribute), no part (the box is
  the container), no event.
- Docs change in kind: "paints nothing" becomes "paints nothing unless
  `pattern` says what". The typographic transparency and the anchor are
  untouched.

### Unification: the kit's dithers are library patterns

Three of the five tiled surfaces are 8-periodic 1-bit motifs, and under the
palette's port anchor their bytes are **identical** to library entries:

| surface | today's constant | library | phase check |
| --- | --- | --- | --- |
| `vf-desktop` dither | `DITHER_RECTS` 2×2, black at (0,0),(1,1) over opaque white | `gray-50` AA55 | row 0 even columns → `AA` ✓ |
| windoid bar (`vfDots`) | `DOT_RECTS` 2×2, one dot at (0,0) | `dots` AA00 | ✓ |
| scroll trough | `TROUGH_RECTS` 4×2, dots at (0,0),(2,1) | `gray-25` 8822 | row 0 → `88`, row 1 → `22` ✓ |

Phase 2 replaces each constant with `patternRects(PATTERNS[...])` (the
desktop with `paper: '#ffffff'` baked, so `--vf-desktop`'s
only-under-a-custom-token semantics hold verbatim) and each motif-ceiling
with the 8×8 cell. Nothing else about those surfaces moves: the child
`.vf-tile-raster`, the CSS-repeated underlay, the token → placed-tile-grid
path and the forced-colors masks all stay. It is a pure refactor with pixel
assertions already in place — `verify:tile` (desktop, dots; eight densities,
zero impure) and `verify:scrollbars` (the trough's lattice at the 4×2 phase,
which an 8×8 cell in the same phase reproduces exactly) are the regression
test, and must stay byte-green.

What stays as it is, and why: the **barber stripes** are a 12×12 motif
(`TileRect[]` is still the right statement), the **swatch checker** is
two-color (white and `#c0c0c0`; representable as the pat `CC CC 33 33 CC CC
33 33` with a gray ink, but the swatch's own constant is two rects and
changing it buys nothing), the **racing stripes** are not a tile at all
(`vfStripes`, the engine split). The `--vf-*-pattern` tokens keep their
documented contract to the byte.

After phase 2 the system is: *data* (`Pattern` / `TileRect[]`) → *encode*
(`tileRaster`, cached) → *paint* (a background via `PatternFillController`,
or a `.vf-tile-raster` child where the surface has other layers to
interleave) → *consumer override* (the placed tile grid, token surfaces
only). One vocabulary, one exactness argument, one test idiom.

### Phase 3 — `vf-desktop pattern`

System 7's General Controls panel let the user pick the desktop pattern from
exactly this set; the consumer that wants that control panel (system7web)
needs one attribute:

```html
<vf-desktop width="512" height="342" pattern="gray-75">
```

- Same property, same `parsePattern`, default `'gray-50'`. Resolution and
  precedence: a `--vf-desktop-pattern` token override → the placed tile grid,
  exactly as today; else the attribute's pattern → the whole-surface raster.
- The desktop moves its kit-art path onto `PatternFillController` with
  `getBox: () => this.screen`, `getSize` from `width`/`height`, `paper:
  '#ffffff'`. The `.vf-tile-raster` child and the CSS-repeated underlay go
  (the raster is now the screen's background; `tileRaster` already falls back
  to the SVG tile where canvas is unavailable, which was the underlay's only
  remaining job). `.screen.patterned` keeps hiding the background under a
  consumer token. Forced colors unchanged: flat Canvas.
- `verify:tile`'s desktop checks stay, reading the screen's background-size
  instead of a child's box; `verify:desktop*` unaffected.

### Phase 4 (optional) — `vf-swatch pattern`: the chooser cell

MacPaint's palette cell *is* a pattern swatch, and `vf-swatch` is the kit's
palette cell — a native button with the form-disabled contract, focus rule
and `label` plumbing a chooser needs. `pattern` on a swatch paints the named
pattern in `.fill` in place of the color (the checker still shows when
neither is set; `color` wins if both are). The fill is a declared box, so the
controller runs observer-free. Out of scope for the first release unless the
reference page's chooser demo wants real buttons; listed so the design is
agreed before someone builds a chooser out of 38 containers and a click
handler.

### Exports, manifest, docs

- `src/index.ts`: `PATTERNS`, `PATTERN_NAMES`, `parsePattern`, `patternHex`,
  `patternRects`, `PatternFillController`, `vfPatternFill`; types `Pattern`,
  `PatternName`. `vfPatternFill` also re-exported from `src/styles/base.ts`
  only if it moves under `styles/recipes/` — it stays beside its controller
  in `src/pattern-fill.ts` like `vfTileGrid` does, so it does not.
- `npm run analyze` after every `src/` touch; commit `custom-elements.json`
  and `editor/*` with the change (CI diffs them). `verify:manifest`'s §5
  token audit is unaffected (no new `--vf-*` token; `--_vf-pattern-*` are
  private channels, the `--_vf-tile-image` precedent).
- `docs/PATTERNS.md` (new): the library table, the attribute contract, the
  hex literal, the phase and forced-colors facts — reference prose, plain.
  `docs/SPEC.md`: §3 *Tiled fills* gains a paragraph naming the library and
  the controller; §5 `vf-container` (and `vf-desktop`) entries gain the
  property. `docs/TOOLKIT.md`: one row. `docs/DESIGN-TOKENS.md`: the
  *Patterns* section notes that named patterns are attributes, not tokens.
  `CLAUDE.md` *Where things are*: PATTERNS in the docs list; `src/patterns.ts`
  beside the glyphs. README: nothing — the storefront stays short.
- `index.html`: two `data-example` templates on `vf-container` (a patterned
  region with placed controls; a `fill-width` strip), and one palette
  specimen — a `vf-grid columns="19" rows="2" cell-width="19" cell-height="16"`
  of 38 patterned containers, MacPaint's own 2×19 bar, which doubles as the
  visual proof the table is complete. Captions in the plain register.

## Decisions taken (do not relitigate without new evidence)

- **`pattern`, not `fill`/`texture`/`background`.** It is the Mac word
  (`Pattern`, `PAT#`, the Patterns menu, "Desktop Pattern") and it reads on
  both surfaces; `fill` collides with `fill-width`/`fill-height` in the same
  tag; `background` is a legacy presentation attribute on several elements
  and invites CSS colors. `vf-text-field` forwards a native `pattern`
  attribute to its `<input>` — a different element, a native attribute, and
  `HTMLElement` has no `pattern` IDL member to shadow (the `align`/
  `draggable` trap does not apply). Noted as the one vocabulary overlap.
- The property takes a string only. The hex literal is the programmatic form
  too (`el.pattern = patternHex(bytes)`); no object form.
- Background form for the container (argued above); child-raster form stays
  where a surface interleaves other layers (the token grid, the thumb).
- Phase anchored at the box origin; forced colors flat; ink/paper the kit's
  own; no consumer token; unknown value warns once and paints nothing.
- The library ships 8×8 only, 38 entries, palette order, kebab-case names;
  the `gray-N` ramp by ink percentage; no aliases.
- The three kit dithers become library patterns by reference; the barber,
  checker and racing stripes do not change.
- The capture does not enter the repo; `src/patterns.ts` is the manifest.

## Testing

New script `scripts/verify-pattern.mjs` (`npm run verify:pattern`; `npm test`
picks it up from package.json):

1. **Library integrity.** 38 entries in `PATTERN_NAMES`, each 8 bytes in
   0–255, no duplicates; `gray-50`/`gray-25`/`gray-75` equal AA55/8822/DD77;
   `patternHex(parsePattern(hex)) === hex` for every entry; `parsePattern`
   accepts names, spaced and unspaced hex, mixed case, and rejects 15 or 17
   digits, non-hex, and unknown names.
2. **The kit's own motifs are the library's.** `patternRects(PATTERNS['gray-50'], '#000', '#fff')`
   rasterizes to the same 8×8 pixels as the desktop's former `DITHER_RECTS`;
   likewise `dots` vs `DOT_RECTS` and `gray-25` vs `TROUGH_RECTS` — asserted
   on canvas pixel data in-page, so phase 2 is provably byte-identical.
3. **A declared container is 1-bit at all eight densities** (`[1, 1.25, 1.5,
   1.7, 2, 2.3, 2.5, 3]`, the `verify:tile` set): zero impure pixels in the
   interior of a 120×72 `pattern="bricks"` box, stepped in from the edges the
   way `verify:tile`'s `impureIn` does; the background-size resolves to whole
   device px (`sys × n`). Lift `impureIn` into `scripts/harness.mjs` — it is
   about to have three callers (tile, scrollbars, pattern).
4. **A measured container** (`fill-width` inside a 200-px parent, undeclared
   height around slotted content) paints the full box, re-encodes on a parent
   resize, and stays 1-bit.
5. **Unpatterned is unchanged.** A container with no `pattern` paints no
   pixel; removing the attribute unwinds the inline properties.
6. **Bad values.** An unknown name warns once (spy on `console.warn`) and
   paints nothing; a later valid value paints and warns no further.
7. **Forced colors** (`forcedColors: 'active'`): the interior is flat Canvas.
8. **Snap interplay.** A patterned container on a fractional page origin
   recovers to zero impure (the `verify:tile` snap case, on this surface).
9. **Phase 3:** `vf-desktop pattern="gray-75"` → the screen's interior is
   DD77 at the raster's phase; the `--vf-desktop-pattern` token still wins
   and still renders the placed grid (`verify:tile`'s consumer-token checks
   unchanged).

Regression guards for phase 2: `npm run verify:tile` (154 checks today) and
`npm run verify:scrollbars` must pass without edits to their expectations.
`verify:manifest`, `verify:grid`, `verify:snap`, `verify:forced-colors`,
`verify:position` all touch the container or the desktop; run the suite.

Manual (Adam's): the Safari ⌘± walk on a 2× display over a patterned
container and the new desktop attribute — expected clean at every rung,
regime-3 worst case an isolated device-px line at the box edge, never smear;
a Firefox check of a `fill-width` container (the ResizeObserver path).

## Order of work

1. **Library + engine + `vf-container`.** `src/patterns.ts`;
   `src/pattern-fill.ts`; `TileRasterCache` key; `TrackWidthController`
   height; the container's property, class and controller; `verify-pattern`
   checks 1–8; exports; `npm run analyze`. *Accept:* zero impure at all eight
   densities on the declared and measured boxes; suite green; one commit
   (plus the regenerated manifest in it).
2. **Unification.** Desktop, dots and trough constants → `patternRects` of
   library entries; delete the three local rect constants. *Accept:*
   `verify:tile` and `verify:scrollbars` pass unmodified; `verify-pattern`
   check 2 pins the equivalence. One commit.
3. **`vf-desktop pattern`.** Property, controller, the child raster and
   underlay retired, `verify:tile` desktop checks re-pointed, check 9.
   *Accept:* suite green; the token path pixel-identical to phase 0.
4. **Docs + reference page.** `docs/PATTERNS.md`; SPEC/TOOLKIT/DESIGN-TOKENS/
   CLAUDE.md edits; the three `index.html` specimens; delete this file.
   Version `0.5.0` (a new attribute on two components and new root exports);
   the `npm version` routine with the web-types follow-up commit.
5. **Phase 4 only if asked:** `vf-swatch pattern`.

## Open for Adam

- **The 38 names.** The table above is a proposal; they become API the day
  phase 1 lands.
- **`pattern` as the attribute name** — the recommendation and its
  reasoning are above; `fill` is the runner-up if the text-field overlap
  bothers more than the `fill-width` one.
- **Forced colors flat vs masked** — flat is proposed (the desktop's
  precedent); masked keeps a chooser legible under high contrast at the cost
  of the zoom residual.
- **The provenance line** for `docs/PATTERNS.md` under the repo's
  no-Apple-artwork rule: 8-byte bitmaps transcribed from a capture, credited
  to Apple/MacPaint as the designers, the capture staying out of the repo —
  confirm that framing is the one to ship.
- **Phase 4** in or out of the first release.

## File inventory

| File | Role |
| --- | --- |
| `src/patterns.ts` (new) | `Pattern`, `PATTERNS`, `PATTERN_NAMES`, `parsePattern`, `patternHex`, `patternRects` |
| `src/pattern-fill.ts` (new) | `PatternFillController`, `vfPatternFill` |
| `src/tile-grid.ts` | `TileRasterCache.for` takes a caller key |
| `src/track-width.ts` | reports `height` too |
| `src/components/vf-container.ts` | `pattern` property, controller, class on `.box` |
| `src/components/vf-desktop.ts` | phase 2: `gray-50` by reference; phase 3: `pattern` property, background form |
| `src/styles/recipes/pattern.ts` | phase 2: `DOT_RECTS` → `patternRects(PATTERNS.dots)` |
| `src/styles/recipes/scroll-rail.ts`, `src/scroll-rail.ts` | phase 2: trough → `gray-25`, 8×8 ceiling |
| `src/index.ts` | the new exports |
| `scripts/verify-pattern.mjs` (new), `scripts/harness.mjs` (`impureIn`), `package.json` (`verify:pattern`) | tests |
| `scripts/verify-tile.mjs` | phase 3: desktop raster read off the screen's background |
| `docs/PATTERNS.md` (new), `docs/SPEC.md`, `docs/TOOLKIT.md`, `docs/DESIGN-TOKENS.md`, `CLAUDE.md`, `index.html` | docs and specimens |
| `custom-elements.json`, `editor/*` | regenerated, committed with each `src/` change |
