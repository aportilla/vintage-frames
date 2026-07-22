/**
 * Accessibility: honor the user's "reduce motion" preference.
 *
 * Components use this to skip non-essential animation — chiefly the classic
 * ~250ms selection "blink" on menu items and popup options — and act instantly
 * instead, so keyboard and assistive-tech users aren't made to wait through an
 * effect they've asked the system to suppress. Guarded for SSR / environments
 * without `matchMedia`, where it reports `false` (no reduction).
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
