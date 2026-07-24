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

/** Milliseconds between selection-blink phase flips. */
export const BLINK_INTERVAL_MS = 42

/** Phase flips in one selection blink (6 = three off/on cycles, ~250ms). */
export const BLINK_FLIPS = 6

/** Handle for an in-flight {@link runSelectionBlink}; {@link cancel} stops it. */
export interface BlinkHandle {
  cancel(): void
}

/**
 * The classic System 7 selection "blink": the highlighted row inverts on/off a
 * few times (~250ms) before the action commits. Owns the shared timing
 * ({@link BLINK_INTERVAL_MS}/{@link BLINK_FLIPS}) and the reduced-motion
 * short-circuit so `vf-menu-item` and `vf-select` can't drift apart on either.
 *
 * `setPhase(on)` is invoked with the highlight state for each frame — the caller
 * maps it onto its own representation (a CSS class, an option's `active` flag).
 * The blink starts in the OFF phase and finishes by calling `onDone()`; under
 * `prefers-reduced-motion` it skips straight to `onDone()` and returns a no-op
 * handle. `setPhase` is never called after `onDone()`.
 */
export function runSelectionBlink(
  setPhase: (on: boolean) => void,
  onDone: () => void
): BlinkHandle {
  if (prefersReducedMotion()) {
    onDone()
    return { cancel() {} }
  }
  let flips = 0
  setPhase(false)
  const timer = window.setInterval(() => {
    flips += 1
    if (flips >= BLINK_FLIPS) {
      window.clearInterval(timer)
      onDone()
      return
    }
    // Odd flips land on the inverted (on) phase, even flips on off.
    setPhase(flips % 2 === 1)
  }, BLINK_INTERVAL_MS)
  return {
    cancel() {
      window.clearInterval(timer)
    },
  }
}
