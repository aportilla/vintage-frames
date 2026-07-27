/**
 * Which input modality last drove the page — the signal a control consults to
 * decide whether an incoming focus deserves a visible focus mark.
 *
 * `:focus-visible` answers that question for every control in the kit except
 * the editable fields. The selector is specified to match ANY focus of an
 * element that takes keyboard input, so a text field clicked with the mouse
 * matches it exactly as a tabbed-to one does — unlike a button, which matches
 * only from the keyboard (`npm run verify:focus` asserts both halves). That is
 * the right default for a browser drawing a ring nobody asked for on a field
 * with no other focus affordance. It is the wrong one here, where a click has
 * already put the insertion point on screen and the kit draws its own mark.
 *
 * Why the document, rather than latching the field's own `pointerdown` the way
 * `vf-slider` does for its ring: the pointer event that lands focus in a field
 * is routinely not on the field. A `vf-label` `for` caption focuses its control
 * from a click on the caption, and all the field sees is a programmatic
 * `focus()` — locally indistinguishable from Tab. Watching the page catches
 * that, and any other control that focuses a field on the user's behalf.
 *
 * The default is `'keyboard'`: focus that arrives with no preceding input at
 * all is assistive tech, an `autofocus`, or a script, and all three should be
 * marked. Only an observed pointer suppresses the mark.
 */
export type FocusModality = 'keyboard' | 'pointer'

let modality: FocusModality = 'keyboard'

/** How many live controls are watching (see {@link trackFocusModality}). */
let watchers = 0

const onPointer = (): void => {
  modality = 'pointer'
}

const onKey = (): void => {
  modality = 'keyboard'
}

/** The modality that last drove the page. `'keyboard'` until a pointer says otherwise. */
export function focusModality(): FocusModality {
  return modality
}

/**
 * Start watching the page's input modality; returns the release function.
 *
 * The two listeners are shared by every watcher and refcounted, so a page full
 * of fields adds one capture-phase `pointerdown` and one `keydown` to the
 * document, not one pair each. Both are passive and read-only — they set a
 * variable and nothing else. Releasing the last watcher removes them, so a kit
 * torn off a page leaves nothing behind (calling the release twice is a no-op).
 *
 * Capture phase, because the modality has to be recorded before the focus it
 * explains: a `pointerdown` that a control stops from bubbling still moved the
 * focus, and a `keydown` on the element being tabbed away from is the thing
 * that makes the next focus a keyboard one.
 *
 * Both handlers assign one variable and do nothing else — no DOM reads, no
 * `preventDefault` (a passive listener could not anyway), no
 * `stopPropagation` — so a host page's own handlers see every event exactly as
 * they would without the kit. The one way a page can defeat the tracker is to
 * stop these events before the document sees them, e.g. a window-capture
 * listener calling `stopPropagation()`. The modality then goes stale and a
 * field may wear its mark after a click: the failure mode is a focus rule
 * shown too eagerly, never an exception or a swallowed event.
 */
export function trackFocusModality(): () => void {
  if (watchers++ === 0) {
    document.addEventListener('pointerdown', onPointer, { capture: true, passive: true })
    document.addEventListener('keydown', onKey, { capture: true, passive: true })
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--watchers === 0) {
      document.removeEventListener('pointerdown', onPointer, { capture: true })
      document.removeEventListener('keydown', onKey, { capture: true })
    }
  }
}
