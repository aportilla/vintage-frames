/**
 * Register an embedded bitmap webfont on the document.
 *
 * WHY THIS IS JS AND NOT AN `@font-face` RULE: font faces declared inside a
 * component's shadow root are ignored by the browser — `@font-face` resolves
 * only against the document. Every `vf-*` element renders into its own shadow
 * root, so a stylesheet `@font-face` would never take effect. Registering the
 * face imperatively on `document.fonts` makes it visible inside *every* shadow
 * root at once, which preserves the library's "components need no global CSS"
 * promise.
 *
 * Each face is inlined as a base64 WOFF2 data URL by its wrapper module (e.g.
 * `chikarego-font.ts`), so there is no separate asset to ship or to resolve
 * through a consumer's bundler; the font is available the moment the wrapper is
 * imported, with no network round trip.
 */

/** Families already registered (or in flight) this session — one attempt each. */
const attempted = new Set<string>()

/**
 * Vertical-metric overrides for a registered face, applied via the CSS
 * `ascent-override`/`descent-override`/`line-gap-override` descriptors.
 * Percentages of the em (`'75%'`), same as the CSS properties.
 */
export interface EmbeddedFontMetrics {
  ascentOverride?: string
  descentOverride?: string
  lineGapOverride?: string
}

/**
 * The em box both embedded bitmap faces are drawn on: a 16-design-pixel grid
 * split 12 px above the baseline and 4 px below (the classic Chicago-12
 * ascent/descent), no line gap.
 *
 * WHY OVERRIDE AT ALL: browsers place a line box's baseline from the face's
 * hhea metrics, and both shipped WOFF2s carry converter-artifact hhea values —
 * ascender 682, descender 192, line gap 92 of the 1024 upm, i.e. 10.66 px /
 * 3 px / 1.44 px at 16px — which are NOT on the 64-unit design-pixel grid the
 * glyphs are drawn on. Half-leading computed from them lands the baseline
 * ~0.5px high in every whole-pixel line box, and rasterization snaps that to a
 * whole device pixel: all chrome/body text sat one device px above its
 * System 7 position (first seen as fractional gaps in the vf-select pill).
 * The faces' OS/2 typo metrics carry the intended grid-clean em (768/256/0 =
 * 12/4/0 px); these overrides force every browser onto it regardless of which
 * table its platform prefers.
 *
 * KNOWN LIMIT (dpr 2, scale 1.5): Chrome snaps aliased text baselines to whole
 * ABSOLUTE CSS px. A pill's ideal baseline sits 13 system px (19.5 CSS px at
 * scale 1.5) below its border-box top, so a host at a whole CSS-px position
 * puts it on a half pixel and the snap misses by 1 device px (⅓ system px) —
 * no metric value can reach it; only a host at a half-CSS-px position (still
 * on the device grid) renders it exactly. dpr 1 and 3 land exactly at whole
 * CSS-px positions, the common case.
 */
export const PIXEL_GRID_METRICS: EmbeddedFontMetrics = {
  ascentOverride: '75%', // 12 of the 16-px em
  descentOverride: '25%', // 4 of the 16-px em
  lineGapOverride: '0%',
}

/**
 * Register `family` from an inlined base64 WOFF2 exactly once per session.
 *
 * Idempotent and environment-safe: it no-ops under SSR (no `document`), when
 * the CSS Font Loading API is unavailable, or when the family is already
 * present (duplicate bundles / HMR). A failed decode releases the family so a
 * later explicit call can retry, and on any failure components simply keep the
 * fallback stack — so this can never break rendering.
 */
export function registerEmbeddedFont(
  family: string,
  woff2Base64: string,
  metrics?: EmbeddedFontMetrics
): void {
  if (attempted.has(family)) return

  if (typeof document === 'undefined' || !('fonts' in document)) return

  for (const face of document.fonts) {
    if (face.family === family) {
      attempted.add(family)
      return
    }
  }

  // Claim the slot only now — after the env guards and the already-present
  // check — so an SSR/no-op pass never burns it, and a failed load releases it
  // below for a retry.
  attempted.add(family)
  const src = `url(data:font/woff2;base64,${woff2Base64}) format('woff2')`
  try {
    // Declare a broad weight range so the single pixel master is used as-is for
    // both normal and bold requests (components render at 700) — this prevents
    // the browser from synthesizing faux-bold, which would smear the pixels.
    const face = new FontFace(family, src, {
      style: 'normal',
      weight: '100 900',
      display: 'swap',
      ...metrics,
    })
    // Add the face BEFORE the decode finishes, not after: a loading face in
    // the set is what makes `document.fonts.ready` (and `loadingdone`) wait
    // for it. Added only-once-loaded, the set looks idle during the decode,
    // `ready` settles immediately, and anything that re-measures "once the
    // fonts have landed" — vf-icon's name plate sizing itself against the
    // fallback face's wider glyphs was the visible symptom — runs before
    // they have.
    document.fonts.add(face)
    face.load().then(
      () => {}, // loaded in place — the face is already in the set
      () => {
        document.fonts.delete(face)
        attempted.delete(family) // decode failed — allow retry; fall back meanwhile
      },
    )
  } catch {
    attempted.delete(family) // FontFace unsupported — components keep the fallback stack
  }
}
