import type { TileRect } from './styles/recipes/tile.js'

/**
 * The standard Macintosh pattern set — the 38 fills of MacPaint's pattern
 * bar and the System file's `PAT#` 0 — as 8-byte bitmaps, with the helpers
 * that turn one into the art the kit's exact-fill machinery draws
 * (src/pattern-fill.ts paints one as a box's background; src/tile-grid.ts
 * is the raster mechanism under it).
 *
 * A {@link Pattern} is the QuickDraw type: eight rows, top row first, each a
 * byte whose bit 7 is the leftmost pixel and whose set bits are ink. That is
 * also what a `pattern` attribute spells as a custom value — sixteen hex
 * digits, the way a PAT resource read in ResEdit — so the library, the
 * attribute and the data model are one representation.
 *
 * Transcribed 2026-08-22 from a 2× capture of the tear-off pattern palette
 * (a windoid over a 5×8 grid of 19×16 cells on a 20×17 pitch, the first two
 * merged into the current-pattern well; native pixel (x, y) at image
 * (2x+1, 2y+1), cell (c, r) at (5 + 20c, 15 + 17r)) and normalized to the
 * palette window's port origin (5, 4) — the phase QuickDraw drew them at.
 * Under it the three toolbox constants come out byte-for-byte (`gray` AA55,
 * `ltGray` 8822, `dkGray` DD77), and so do the kit's own desktop dither,
 * scroll trough and windoid dots, which are those three patterns. Designed
 * at Apple for MacPaint and the System; stated here as data, the way
 * `fonts/VF-*.glyphs.txt` states the strikes. The capture is not in the
 * repo. docs/PATTERNS.md is the consumer table.
 */
export type Pattern = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

/** The library's names, in palette order. */
export type PatternName =
  | 'black'
  | 'gray-50'
  | 'white'
  | 'gray-88'
  | 'gray-75'
  | 'gray-75-striped'
  | 'gray-75-diagonal'
  | 'dots'
  | 'pinpoint'
  | 'dots-sparse'
  | 'speckle'
  | 'gray-12'
  | 'gray-25'
  | 'stripes-vertical'
  | 'stripes-horizontal'
  | 'diagonal'
  | 'grid'
  | 'weave'
  | 'lines-vertical'
  | 'lines-horizontal'
  | 'diagonal-wide'
  | 'grid-wide'
  | 'zigzag'
  | 'arrows'
  | 'chevrons'
  | 'shingles'
  | 'dotted-grid'
  | 'birds'
  | 'waves'
  | 'bricks'
  | 'scales'
  | 'basket-weave'
  | 'lattice'
  | 'twigs'
  | 'hexagons'
  | 'pyramids'
  | 'mesh'
  | 'stones'

/**
 * The 38 standard patterns, in palette order (row-major from the cell after
 * the well — insertion order is the order). The ordered-dither ramp is named
 * `gray-N` by ink percentage; everything else for what it reads as.
 */
export const PATTERNS: Readonly<Record<PatternName, Pattern>> = {
  'black': [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  'gray-50': [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55],
  'white': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  'gray-88': [0x77, 0xff, 0xdd, 0xff, 0x77, 0xff, 0xdd, 0xff],
  'gray-75': [0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77],
  'gray-75-striped': [0x55, 0xff, 0x55, 0xff, 0x55, 0xff, 0x55, 0xff],
  'gray-75-diagonal': [0xbb, 0x77, 0xee, 0xdd, 0xbb, 0x77, 0xee, 0xdd],
  'dots': [0xaa, 0x00, 0xaa, 0x00, 0xaa, 0x00, 0xaa, 0x00],
  'pinpoint': [0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00],
  'dots-sparse': [0x08, 0x00, 0x80, 0x00, 0x08, 0x00, 0x80, 0x00],
  'speckle': [0x40, 0x04, 0x80, 0x10, 0x02, 0x20, 0x01, 0x08],
  'gray-12': [0x22, 0x00, 0x88, 0x00, 0x22, 0x00, 0x88, 0x00],
  'gray-25': [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22],
  'stripes-vertical': [0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa],
  'stripes-horizontal': [0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00],
  'diagonal': [0x44, 0x88, 0x11, 0x22, 0x44, 0x88, 0x11, 0x22],
  'grid': [0x88, 0x88, 0xff, 0x88, 0x88, 0x88, 0xff, 0x88],
  'weave': [0x0c, 0x8d, 0xb1, 0x30, 0x03, 0x1b, 0xd8, 0xc0],
  'lines-vertical': [0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88],
  'lines-horizontal': [0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0xff, 0x00],
  'diagonal-wide': [0x40, 0x80, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20],
  'grid-wide': [0x80, 0x80, 0xff, 0x80, 0x80, 0x80, 0x80, 0x80],
  'zigzag': [0x08, 0x00, 0x80, 0x40, 0x20, 0x00, 0x02, 0x04],
  'arrows': [0x05, 0x02, 0x20, 0x50, 0x88, 0x88, 0x88, 0x88],
  'chevrons': [0xaa, 0x00, 0x88, 0x14, 0x22, 0x41, 0x88, 0x00],
  'shingles': [0x04, 0x08, 0x10, 0x20, 0x54, 0xaa, 0xff, 0x02],
  'dotted-grid': [0x80, 0x00, 0xaa, 0x00, 0x80, 0x00, 0x88, 0x00],
  'birds': [0x00, 0x00, 0x40, 0xa0, 0x00, 0x00, 0x04, 0x0a],
  'waves': [0x01, 0x01, 0x03, 0x84, 0x48, 0x30, 0x0c, 0x02],
  'bricks': [0x08, 0x08, 0xff, 0x80, 0x80, 0x80, 0xff, 0x08],
  'scales': [0x02, 0x04, 0x08, 0x1c, 0x22, 0xc1, 0x80, 0x01],
  'basket-weave': [0xb0, 0xb0, 0xbf, 0x00, 0xbf, 0xbf, 0xb0, 0xb0],
  'lattice': [0x01, 0x01, 0x82, 0x44, 0x39, 0x44, 0x82, 0x01],
  'twigs': [0x10, 0x10, 0x55, 0x82, 0x01, 0x01, 0x55, 0x28],
  'hexagons': [0x14, 0xe3, 0x80, 0x80, 0x41, 0x3e, 0x08, 0x08],
  'pyramids': [0x22, 0x71, 0xf8, 0x74, 0x22, 0x47, 0x8f, 0x17],
  'mesh': [0x14, 0x08, 0x00, 0x08, 0x14, 0x2a, 0x55, 0x2a],
  'stones': [0xf8, 0xf8, 0x77, 0x89, 0x8f, 0x8f, 0x77, 0x98],
}

/** The names in palette order — a chooser's iteration order. */
export const PATTERN_NAMES: readonly PatternName[] = Object.keys(
  PATTERNS
) as PatternName[]

/** A pattern's side in system px — what a custom literal states. */
export const PATTERN_SIZE = 8

/**
 * The value a `pattern` attribute takes, resolved: a library name, or
 * sixteen hex digits (two per row, top row first; whitespace between bytes
 * and either case allowed — `"DD 77 DD 77 DD 77 DD 77"`). Anything else,
 * including an empty string, is `null`: the caller paints nothing.
 */
export function parsePattern(value: string | null | undefined): Pattern | null {
  if (value == null) return null
  const text = value.trim()
  if (text === '') return null
  if (Object.prototype.hasOwnProperty.call(PATTERNS, text)) {
    return PATTERNS[text as PatternName]
  }
  const hex = text.replace(/\s+/g, '')
  if (!/^[0-9a-f]{16}$/i.test(hex)) return null
  const rows: number[] = []
  for (let i = 0; i < PATTERN_SIZE; i++) {
    rows.push(parseInt(hex.slice(2 * i, 2 * i + 2), 16))
  }
  return rows as unknown as Pattern
}

/** The attribute form of a pattern: sixteen upper-case hex digits, no spaces. */
export function patternHex(pattern: Pattern): string {
  return pattern
    .map((row) => row.toString(16).padStart(2, '0').toUpperCase())
    .join('')
}

/**
 * A pattern's art as the rect data the tile machinery takes
 * (`tileRaster`, `tileImage` via `tileRects`): `width × height` is the cell
 * the rects cover and tile at.
 */
export interface PatternMotif {
  readonly width: number
  readonly height: number
  readonly rects: readonly TileRect[]
}

/** Whether `(x, y)` of the pattern is ink. */
const inkAt = (pattern: Pattern, x: number, y: number): boolean =>
  ((pattern[y % PATTERN_SIZE] ?? 0) & (0x80 >> x % PATTERN_SIZE)) !== 0

/**
 * The smallest period of the pattern along each axis — 1, 2, 4 or 8 — so a
 * 50% dither is stated as the 2×2 motif it is and tiles on the 30-px span
 * the kit's surfaces document, rather than as an 8×8 cell on a 120-px one.
 */
function period(pattern: Pattern): { x: number; y: number } {
  let x = PATTERN_SIZE
  let y = PATTERN_SIZE
  for (const p of [1, 2, 4]) {
    let holds = true
    for (let row = 0; row < PATTERN_SIZE && holds; row++) {
      for (let col = 0; col < PATTERN_SIZE - p; col++) {
        if (inkAt(pattern, col, row) !== inkAt(pattern, col + p, row)) {
          holds = false
          break
        }
      }
    }
    if (holds) {
      x = p
      break
    }
  }
  for (const p of [1, 2, 4]) {
    let holds = true
    for (let row = 0; row < PATTERN_SIZE - p; row++) {
      if (pattern[row] !== pattern[row + p]) {
        holds = false
        break
      }
    }
    if (holds) {
      y = p
      break
    }
  }
  return { x, y }
}

/** The ink of a `width × height` window of the pattern as horizontal runs. */
function inkRuns(
  pattern: Pattern,
  width: number,
  height: number,
  ink: string,
  paper: string | undefined
): TileRect[] {
  const rects: TileRect[] = []
  if (paper !== undefined) rects.push([0, 0, width, height, paper])
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      if (!inkAt(pattern, x, y)) {
        x++
        continue
      }
      let w = 1
      while (x + w < width && inkAt(pattern, x + w, y)) w++
      rects.push([x, y, w, 1, ink])
      x += w
    }
  }
  return rects
}

/**
 * A pattern's art on its **minimal** cell — the smallest period along each
 * axis — as ink runs over a transparent ground, or over an opaque `paper`
 * rect when one is given. This is how the kit's own surfaces state their
 * dithers from the library: `gray-50` comes back as the 2×2 cell with two
 * black pixels the desktop always had.
 */
export function patternMotif(
  pattern: Pattern,
  ink = '#000000',
  paper?: string
): PatternMotif {
  const { x, y } = period(pattern)
  return { width: x, height: y, rects: inkRuns(pattern, x, y, ink, paper) }
}

/**
 * A pattern's art on the full 8×8 cell, as {@link patternMotif}'s rects —
 * for a caller that wants the literal QuickDraw cell regardless of period.
 */
export function patternRects(
  pattern: Pattern,
  ink = '#000000',
  paper?: string
): TileRect[] {
  return inkRuns(pattern, PATTERN_SIZE, PATTERN_SIZE, ink, paper)
}
