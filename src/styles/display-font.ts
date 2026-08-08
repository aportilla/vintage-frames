/**
 * VF Display — a self-registering bitmap webfont: the kit's *chrome* face, for
 * menus, titles, buttons and controls.
 *
 * The artwork is the genuine Chicago 12pt strike (imported from its BDF via
 * `fonts/import-bdf.py --em 16`, which re-ems the 15px strike onto the kit's
 * 16px grid — see fonts/README.md), extended with `×`, the one glyph UI copy
 * types that MacRoman never carried.
 *
 * It ships under the kit's own name rather than the strike's. Apple's face
 * name belongs to Apple, and a family name is a *claim* — it goes in the font
 * binary and in every consumer's font-family stack — where the provenance
 * above is a *description*, which is what fonts/README.md is for. The name is
 * stamped into the binary by `fonts/add-glyphs.py`, not just declared here, so
 * the two can't drift. (The fallback entries in {@link vfDisplayDecls} still
 * name Chicago and Charcoal: those select faces the reader may have installed,
 * which claims nothing about what the kit ships.)
 *
 * Registers the face on `document.fonts` via {@link registerEmbeddedFont} so
 * it applies inside every `vf-*` shadow root (an `@font-face` rule can't cross
 * the shadow boundary — see that module for the full rationale).
 *
 * Import for the side effect (it self-registers on first import), or call
 * `registerDisplayFace()` explicitly.
 */
import { PIXEL_GRID_METRICS, registerEmbeddedFont } from './register-embedded-font.js'

/**
 * The CSS `font-family` name the face is registered under — the default of
 * `--vf-font-family-display`, and the `familyName` inside the woff2 itself.
 */
export const VF_DISPLAY_FAMILY = 'VF Display'

// WOFF2 for Chicago.ext.woff2 (3492 bytes), base64-encoded.
const FONT_WOFF2_BASE64 =
  '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'

/** Register the display face on the document once (idempotent). */
export function registerDisplayFace(): void {
  // PIXEL_GRID_METRICS pins the baseline to the face's 12/4 design-pixel em.
  // Unlike the retired converter-artifact faces, this face's own tables
  // already carry those numbers (import-bdf.py writes them on the grid); the
  // overrides restate them so every face the kit registers is pinned the same
  // way regardless of provenance.
  registerEmbeddedFont(VF_DISPLAY_FAMILY, FONT_WOFF2_BASE64, PIXEL_GRID_METRICS)
}

registerDisplayFace()
