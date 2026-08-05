/**
 * Geneva — a self-registering bitmap webfont (the classic Mac body face, for
 * list rows and page copy).
 *
 * This is the genuine Geneva 9pt strike (extracted from its suitcase via
 * `fonts/dfont-to-bdf.py`, then `fonts/import-bdf.py --em 16 --ascent 12`,
 * which re-ems the 12px strike onto the kit's 16px grid with the baseline on
 * its 12/4 split — see fonts/README.md). It ships deliberately un-extended
 * for now — the base64 below is the pristine fonts/Geneva.woff2, so `×` and
 * `⌘` (the two glyphs the strike never carried) fall back per glyph; the
 * backfill is a Geneva entry in fonts/add-glyphs.py.
 *
 * Registers the face on `document.fonts` via {@link registerEmbeddedFont} so
 * it applies inside every `vf-*` shadow root (an `@font-face` rule can't cross
 * the shadow boundary — see that module for the full rationale).
 *
 * Import for the side effect (it self-registers on first import), or call
 * `registerGeneva()` explicitly.
 */
import { PIXEL_GRID_METRICS, registerEmbeddedFont } from './register-embedded-font.js'

/** The CSS `font-family` name the face is registered under. */
export const GENEVA_FAMILY = 'Geneva'

// WOFF2 for Geneva.woff2 (3076 bytes), base64-encoded.
const FONT_WOFF2_BASE64 =
  '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'

/** Register the Geneva face on the document once (idempotent). */
export function registerGeneva(): void {
  // PIXEL_GRID_METRICS pins the baseline to the face's 12/4 design-pixel em.
  // Unlike the retired converter-artifact faces, this face's own tables
  // already carry those numbers (import-bdf.py writes them on the grid); the
  // overrides restate them so every face the kit registers is pinned the same
  // way regardless of provenance.
  registerEmbeddedFont(GENEVA_FAMILY, FONT_WOFF2_BASE64, PIXEL_GRID_METRICS)
}

registerGeneva()
