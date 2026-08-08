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

/**
 * How long (ms) an *in-place* press may last and still read as a modern
 * click-to-open tap rather than a completed System 7 press.
 *
 * Shared by the two surfaces that offer the classic press-drag-release gesture
 * — `vf-select`'s popup and the pull-down menus (`src/menu-press.ts`) — so the
 * one timing a user can feel across both can't drift between them. Only an
 * in-place release consults it: a press that travels to another row is a
 * drag-pick regardless of duration.
 */
export const PRESS_HOLD_MS = 200

/**
 * How long (ms) a press on a selected icon's name waits before it opens the
 * rename box — long enough that a double-click has already declared itself.
 *
 * The Finder's two pointer gestures on a name are the same press: click once
 * and it renames, click twice and it opens. Only the *second* press tells them
 * apart, so the rename cannot commit to opening until the window for one has
 * passed — which is what makes this a delay rather than an immediate response.
 * A press landing inside the window calls the pending rename off outright, so
 * the number is only an upper bound on how slow a double-click may be and still
 * read as one.
 *
 * No API reports what the *browser* counts as a double-click: it follows a
 * platform setting the user can move (Windows offers up to 900 ms, macOS a
 * comparable slider, both defaulting near 500). Overshooting it costs a wait
 * before a rename box appears; undershooting it renames when the user meant to
 * open. So the number leans long deliberately.
 */
export const RENAME_DELAY_MS = 800

/**
 * Milliseconds per row while the pointer rests on a menu scroll arrow — the
 * pace a clipped popup rolls its list through the panel at (~15 rows/s).
 *
 * Deliberately *not* gated on `prefers-reduced-motion`, unlike the blink below.
 * The blink is decoration played at the kit's discretion; this stepping is the
 * interaction itself — user-held, discrete, and stopped the moment the pointer
 * leaves — and suppressing it would leave the clipped rows unreachable by
 * pointer. Same reasoning the drag gestures are ungated.
 */
export const MENU_SCROLL_INTERVAL_MS = 66

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
