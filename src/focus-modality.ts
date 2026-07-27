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
import type { LitElement, ReactiveController } from 'lit'

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

/**
 * Whether a control should be wearing the kit's dashed focus rule right now:
 * {@link focusModality} resolved against the host's own focus, as one reactive
 * flag.
 *
 * Four controls need this rather than `:focus-visible`, for two different
 * reasons (SPEC §4). The editable fields, because that selector is specified to
 * match *any* focus of an element which takes keyboard input, so it is already
 * true for a clicked text field. And the three that suppress the browser's own
 * mouse focus so a press-drag gesture can own the pointer — `vf-select`,
 * `vf-menu`, `vf-slider` — then call `focus()` themselves, which Blink reads as
 * a *visible* focus, making `:focus-visible` true after a pure mouse gesture.
 * One controller so the answer can't drift between them.
 *
 * `focusin`/`focusout`, not `focus`/`blur`: the focus usually lands on an
 * element inside the shadow root, and only the bubbling, composed pair crosses
 * that boundary to reach the host. Focus moving *within* the component — a
 * `vf-select` pill handing off to its option rows, a `vf-menu` title to its
 * dropped panel — is not leaving, so the mark survives it and the host takes it
 * back when the panel closes.
 */
export class FocusRuleController implements ReactiveController {
  #marked = false

  /** This host's share of the document listeners; see {@link trackFocusModality}. */
  #release?: () => void

  constructor(private readonly host: LitElement) {
    host.addController(this)
  }

  /** True while the host's focus should be marked. */
  get marked(): boolean {
    return this.#marked
  }

  hostConnected(): void {
    this.#release = trackFocusModality()
    this.host.addEventListener('focusin', this.#onFocusIn)
    this.host.addEventListener('focusout', this.#onFocusOut)
  }

  hostDisconnected(): void {
    this.host.removeEventListener('focusin', this.#onFocusIn)
    this.host.removeEventListener('focusout', this.#onFocusOut)
    this.#release?.()
    this.#release = undefined
    this.#set(false)
  }

  /**
   * Force the mark on: the keyboard just drove the control, whatever put the
   * focus there. `vf-slider` calls this from a handled arrow key, so a slider
   * clicked and then nudged with the keys starts showing its rule.
   */
  reveal(): void {
    this.#set(true)
  }

  /**
   * Force the mark off. A pointer press on an ALREADY-focused control moves no
   * focus and so fires no `focusin` — the one pointer route this controller
   * cannot see for itself.
   */
  suppress(): void {
    this.#set(false)
  }

  #set(next: boolean): void {
    if (next === this.#marked) return
    this.#marked = next
    this.host.requestUpdate()
  }

  #onFocusIn = (): void => {
    this.#set(modality === 'keyboard')
  }

  #onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget
    const inside =
      next instanceof Node && (this.host.contains(next) || this.host.renderRoot.contains(next))
    if (!inside) this.#set(false)
  }
}
