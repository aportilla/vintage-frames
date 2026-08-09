/**
 * VF Body — a self-registering bitmap webfont: the kit's *body* face, for list
 * rows and page copy.
 *
 * The artwork is the genuine Geneva 9pt strike (extracted from its suitcase
 * via `fonts/dfont-to-bdf.py`, then `fonts/import-bdf.py --em 16 --ascent 12`,
 * which re-ems the 12px strike onto the kit's 16px grid with the baseline on
 * its 12/4 split — see fonts/README.md). One glyph the strike never carried is
 * added on top: `×`, drawn into its own `+`'s box (a `specs` row in
 * fonts/add-glyphs.py). `⌘` still falls back per glyph — its backfill traces
 * Chicago's ink.
 *
 * It ships under the kit's own name rather than the strike's, for the reason
 * given in ./display-font.ts.
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

// WOFF2 for Geneva.ext.woff2 (3188 bytes), base64-encoded.
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
