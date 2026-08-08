/**
 * VF Body — a self-registering bitmap webfont: the kit's *body* face, for list
 * rows and page copy.
 *
 * The artwork is the genuine Geneva 9pt strike (extracted from its suitcase
 * via `fonts/dfont-to-bdf.py`, then `fonts/import-bdf.py --em 16 --ascent 12`,
 * which re-ems the 12px strike onto the kit's 16px grid with the baseline on
 * its 12/4 split — see fonts/README.md). Its glyph set ships deliberately
 * un-extended for now, so `×` and `⌘` (the two the strike never carried) fall
 * back per glyph; the backfill is a `specs` row in fonts/add-glyphs.py.
 *
 * It ships under the kit's own name rather than the strike's, for the reason
 * given in ./display-font.ts. That rename is the whole of this face's build
 * step — an un-extended face is still a built one.
 *
 * Registers the face on `document.fonts` via {@link registerEmbeddedFont} so
 * it applies inside every `vf-*` shadow root (an `@font-face` rule can't cross
 * the shadow boundary — see that module for the full rationale).
 *
 * Import for the side effect (it self-registers on first import), or call
 * `registerBodyFace()` explicitly.
 */
import { PIXEL_GRID_METRICS, registerEmbeddedFont } from './register-embedded-font.js'

/**
 * The CSS `font-family` name the face is registered under — the default of
 * `--vf-font-family`, and the `familyName` inside the woff2 itself.
 */
export const VF_BODY_FAMILY = 'VF Body'

// WOFF2 for Geneva.ext.woff2 (3160 bytes), base64-encoded.
const FONT_WOFF2_BASE64 =
  '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'

/** Register the body face on the document once (idempotent). */
export function registerBodyFace(): void {
  // PIXEL_GRID_METRICS pins the baseline to the face's 12/4 design-pixel em.
  // Unlike the retired converter-artifact faces, this face's own tables
  // already carry those numbers (import-bdf.py writes them on the grid); the
  // overrides restate them so every face the kit registers is pinned the same
  // way regardless of provenance.
  registerEmbeddedFont(VF_BODY_FAMILY, FONT_WOFF2_BASE64, PIXEL_GRID_METRICS)
}

registerBodyFace()
