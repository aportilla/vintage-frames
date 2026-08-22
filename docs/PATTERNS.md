# Patterns

The 38 standard Macintosh patterns — MacPaint's pattern bar, the System file's `PAT#` 0 — as named 8×8 fills, and the `pattern` attribute that paints one.

## `pattern`

`vf-container` and `vf-desktop` take `pattern`: a name from the table below, or sixteen hex digits stating a custom 8×8 pattern.

```html
<vf-container width="200" height="120" pattern="bricks">…</vf-container>
<vf-desktop width="512" height="342" pattern="gray-75">…</vf-desktop>
<vf-container width="64" height="64" pattern="DD 77 DD 77 DD 77 DD 77"></vf-container>
```

A custom value is two hex digits per row, top row first; bit 7 is the leftmost pixel and a set bit is ink — the QuickDraw `Pattern` layout, as ResEdit showed it. Whitespace between bytes and either case are accepted.

The pattern is painted as the box's own background: black ink on a `--vf-white` ground, one whole-surface raster at one image pixel per system pixel, magnified nearest-neighbor — the desktop dither's mechanism, 1-bit at every density and zoom. A declared `width`/`height` sizes the raster; an undeclared axis (`fill-width`, a shrink-wrapped height) is measured. Phase is anchored at the box's top-left corner, so two boxes with the same pattern meeting at an offset that is not a multiple of 8 show a seam.

- `vf-container`: unset, the container paints nothing. An unrecognized value paints nothing and warns once.
- `vf-desktop`: `gray-50` by default. An unrecognized value warns once and keeps the dither. A `--vf-desktop-pattern` token override wins over the attribute and renders its tile as a placed grid.
- Under forced colors the pattern goes flat (Canvas).
- The box is `image-rendering: pixelated` while patterned; slotted content is handed `auto` back, so a slotted `<img>` renders as it does anywhere else. A declaration of your own on the child still wins.

```sh
npm run verify:pattern
```

## The library

Palette order. Bytes are the eight rows, top row first.

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

The ordered-dither ramp is `gray-N` by ink percentage. `gray-50`, `gray-25` and `gray-75` are QuickDraw's `gray`, `ltGray` and `dkGray`; the desktop dither, the scroll trough and the windoid bar's dots are drawn from the `gray-50`, `gray-25` and `dots` entries.

The motifs, in the palette's own layout (the blank first cell is the palette's current-pattern well; `#` is ink):

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

## In JavaScript

```ts
import { PATTERNS, PATTERN_NAMES, parsePattern, patternHex } from 'vintage-frames'
```

`PATTERNS` maps each name to its eight bytes; `PATTERN_NAMES` is the palette order. `parsePattern` reads an attribute value — a name or hex — to a `Pattern`, or `null`; `patternHex` writes one back as sixteen hex digits. `patternMotif` gives a pattern's ink as the rect data the tile machinery takes, on its minimal cell (`patternRects`, on the full 8×8). `PatternFillController` and `vfPatternFill` paint a pattern on a custom element's own box — see [TOOLKIT.md](./TOOLKIT.md).

## Provenance

The standard pattern set, designed at Apple for MacPaint and the System. Transcribed from a 2× screen capture of the pattern palette as 8-byte bitmaps and normalized to the palette window's port origin, the phase QuickDraw drew them at — under it `gray`, `ltGray` and `dkGray` come out byte-for-byte. The table in `src/patterns.ts` is the source of truth; no capture or resource file is in the repo.
