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
 * Register `family` from an inlined base64 WOFF2 exactly once per session.
 *
 * Idempotent and environment-safe: it no-ops under SSR (no `document`), when
 * the CSS Font Loading API is unavailable, or when the family is already
 * present (duplicate bundles / HMR). A failed decode releases the family so a
 * later explicit call can retry, and on any failure components simply keep the
 * fallback stack — so this can never break rendering.
 */
export function registerEmbeddedFont(family: string, woff2Base64: string): void {
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
    })
    face.load().then(
      (loaded) => document.fonts.add(loaded),
      () => {
        attempted.delete(family) // decode failed — allow retry; fall back meanwhile
      },
    )
  } catch {
    attempted.delete(family) // FontFace unsupported — components keep the fallback stack
  }
}
