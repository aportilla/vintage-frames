/**
 * One of the kit's bitmap faces, as data: each glyph's advance, placement
 * and ink, from the glyph manifest the face's woff2 is built from
 * (fonts/manifest-to-font.py writes both). Everything is in whole design
 * px, and one design px is one system px.
 */
export interface Strike {
  /** The family it is registered under: `VF Display` or `VF Body`. */
  family: string
  /** The em box: `ascent` px above the baseline, `descent` below. */
  ascent: number
  descent: number
  /** Each character the face draws, by the character itself. */
  glyphs: Readonly<Record<string, StrikeGlyph>>
}

/** One glyph of a {@link Strike}. */
export interface StrikeGlyph {
  /** The pen advance. */
  advance: number
  /**
   * The ink field's left and bottom edges from the pen origin. The baseline
   * is y = 0, and y grows upward.
   */
  x0: number
  y0: number
  width: number
  height: number
  /** The ink, top row first: `#` ink, `.` blank. Empty for a glyph with no ink. */
  rows: readonly string[]
}
