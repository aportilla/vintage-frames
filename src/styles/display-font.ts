/**
 * VF Display — a self-registering bitmap webfont: the kit's *chrome* face, for
 * menus, titles, buttons and controls.
 *
 * The artwork is the genuine Chicago 12pt strike (imported from its BDF via
 * `fonts/import-bdf.py --em 16`, which re-ems the 15px strike onto the kit's
 * 16px grid — see fonts/README.md). On top of the strike rides the kit's
 * chrome backfill (specs rows in fonts/add-glyphs.py): `×`, the Mac modifier
 * keys `⇧ ⌥ ⌃` beside the strike's own `⌘`, the uppercase accents, arrows,
 * and the rest of what modern chrome types — plus corrected ink for
 * `⁄ € ‹ ›`, whose byte slots in the pre-MacRoman-extension source carried
 * the ✓ ◆  drawings over again (those stay reachable at their own
 * codepoints). Review it all on glyph-proof.html (dev server).
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

// WOFF2 for Chicago.ext.woff2 (4604 bytes), base64-encoded.
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
