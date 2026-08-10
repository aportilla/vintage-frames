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

// WOFF2 for Chicago.ext.woff2 (4088 bytes), base64-encoded.
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
