/**
 * VF Display — a self-registering bitmap webfont: the kit's *chrome* face, for
 * menus, titles, buttons and controls.
 *
 * The artwork is the kit's own re-drawn strike in the style of Chicago 12pt —
 * the classic Macintosh system font designed by Susan Kare for Apple — with
 * every glyph authored as a plaintext pixel field in
 * fonts/VF-Display.glyphs.txt, the manifest the face is built from
 * (fonts/manifest-to-font.py; no Apple binary is involved — see
 * fonts/README.md). Beyond the classic character set rides the kit's chrome
 * backfill: `×`, the Mac modifier keys `⇧ ⌥ ⌃` beside `⌘`, the uppercase
 * accents, arrows, and the rest of what modern chrome types — plus the kit's
 * own ink for `⁄ € ‹ ›`, which the design's pre-MacRoman-extension era never
 * drew (the ✓ ◆  drawings stay reachable at their own codepoints). Review
 * it all on glyph-proof.html (dev server).
 *
 * It ships under the kit's own name because the artwork is the kit's own —
 * and Apple's face name belongs to Apple in any case: a family name is a
 * *claim* — it goes in the font binary and in every consumer's font-family
 * stack — where the design credit above is a *description*, which is what
 * fonts/README.md is for. The name is
 * stamped into the binary by `fonts/manifest-to-font.py` (from the manifest's
 * `family` field), not just declared here, so the two can't drift. (The fallback entries in {@link vfDisplayDecls} still
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

// WOFF2 for VF-Display.woff2 (4608 bytes), base64-encoded.
const FONT_WOFF2_BASE64 =
  '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'

/** Register the display face on the document once (idempotent). */
export function registerDisplayFace(): void {
  // PIXEL_GRID_METRICS pins the baseline to the face's 12/4 design-pixel em.
  // Unlike the retired converter-artifact faces, this face's own tables
  // already carry those numbers (manifest-to-font.py writes them on the
  // grid); the overrides restate them so every face the kit registers is
  // pinned the same way regardless of provenance.
  registerEmbeddedFont(VF_DISPLAY_FAMILY, FONT_WOFF2_BASE64, PIXEL_GRID_METRICS)
}

registerDisplayFace()
