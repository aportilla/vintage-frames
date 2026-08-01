import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { DocumentListenersController } from './document-listeners.js'
import { PRESS_HOLD_MS } from './motion.js'
import type { VfMenu } from './components/vf-menu.js'
import type { VfMenuItem } from './components/vf-menu-item.js'

/**
 * The coordinating side of a menu press — supplied by whoever owns the set of
 * menus the gesture may travel across: `vf-menu-bar` for a bar of menus, the
 * `vf-menu` itself when it stands alone. The controller never reaches for a
 * parent or a sibling itself, so the bar keeps owning open state exactly as it
 * does for click and keyboard input.
 */
export interface MenuPressTarget {
  /** The menus the press may travel between, in bar order. */
  menus(): readonly VfMenu[]
  /** Drop `menu`'s panel, closing any sibling (the bar's single-open rule). */
  open(menu: VfMenu): void
  /** Close the open menu with no selection. */
  close(): void
}

/** What sits under a point: a menu's bar title, or a row in its dropped panel. */
interface MenuHit {
  menu: VfMenu
  /** The row under the point, or `null` when the point is on the bar title. */
  item: VfMenuItem | null
}

/**
 * The System 7 press-drag-release gesture for pull-down menus — the same
 * mechanic `vf-select` uses for its popup, and the way the real menu bar was
 * driven: **press a title, keep the button down, slide onto a command, release
 * over it to run it.** Sliding sideways onto another title switches menus
 * mid-press; releasing over a disabled row, a separator, the title, or off the
 * menu entirely closes with nothing chosen (the classic "release outside"
 * cancel).
 *
 * The modern click-to-open style coexists, disambiguated by the gesture itself
 * and resolved at the first release: a quick in-place tap on a title (under
 * {@link PRESS_HOLD_MS}) leaves the menu dropped for a second, independent
 * click, while a held in-place press closes it. Time is consulted *only* for an
 * in-place release — any press that travels to another title or row is a
 * drag-pick however long it took.
 *
 * Everything is hit-tested by **coordinates**, not by event target, for the
 * same reason `vf-select` is: under touch, the pointer is implicitly captured
 * by the element the gesture started on, so every move and the release itself
 * are delivered to the pressed title no matter what they are actually over.
 *
 * The host binds {@link onPointerDown} to a `pointerdown` on itself — presses
 * on titles and rows both bubble up composed — and supplies a
 * {@link MenuPressTarget}. Everything else (tracking to the release anywhere on
 * the page, the row highlight, classification) lives here.
 */
export class MenuPressController implements ReactiveController {
  /** True between a press on a title/row and its matching release. */
  #pressing = false

  /** True when *this* press is the one that dropped the menu. */
  #openedByPress = false

  /** Set once the pointer leaves the title/row it pressed on (a drag-pick). */
  #moved = false

  /** What the press started over — the origin for {@link #moved}. */
  #origin: VfMenu | VfMenuItem | null = null

  /** `event.timeStamp` of the pointerdown (for the hold threshold). */
  #downTime = 0

  /** The row currently inverted by the drag, if any. */
  #active: VfMenuItem | null = null

  /** While a press is in flight: track it to its release anywhere. */
  readonly #listeners: DocumentListenersController

  constructor(
    host: ReactiveControllerHost,
    private readonly target: MenuPressTarget
  ) {
    host.addController(this)
    this.#listeners = new DocumentListenersController(host, () => [
      [document, 'pointermove', this.#onPointerMove, true],
      [document, 'pointerup', this.#onPointerUp, true],
      [document, 'pointercancel', this.#onPointerCancel, true],
    ])
  }

  /**
   * Host torn down mid-gesture. The listener controller detaches itself; drop
   * the press state and any highlight it stamped on a row, which the normal
   * close path is no longer going to run for.
   */
  hostDisconnected(): void {
    this.#end()
    this.#highlight(null)
  }

  /**
   * Starts a press: drops the menu under the pointer if it isn't already, then
   * tracks the press to its release. Both interaction styles begin here; the
   * gesture is classified in {@link #onPointerUp}.
   */
  onPointerDown = (event: PointerEvent): void => {
    // Primary button / single touch / pen only — ignore right/middle and extra
    // touch points so a secondary press can't hijack an in-flight gesture.
    if (event.button > 0 || !event.isPrimary) return
    const hit = this.#hitTest(event.clientX, event.clientY)
    if (!hit) return // a press on the bar's own background: not ours
    // We drive focus and the highlight ourselves; block the browser's text-range
    // selection and native focus so a drag across the bar doesn't select the
    // titles. (The trailing `click` survives this — `vf-menu` and `vf-menu-item`
    // swallow their own, the way `vf-select` does.)
    event.preventDefault()
    this.#pressing = true
    this.#moved = false
    this.#origin = hit.item ?? hit.menu
    this.#downTime = event.timeStamp
    this.#openedByPress = !hit.menu.open
    this.#listeners.attach()
    if (hit.item) {
      // A press that starts inside an already-dropped panel (the second click of
      // the click-to-open style, or the start of a drag between rows).
      this.#highlight(hit.item)
      return
    }
    hit.menu.focus()
    if (this.#openedByPress) this.target.open(hit.menu)
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#pressing) return
    event.preventDefault()
    const hit = this.#hitTest(event.clientX, event.clientY)
    const over = hit ? (hit.item ?? hit.menu) : null
    if (!this.#moved && over !== this.#origin) this.#moved = true
    // Slide sideways with the button still down and the title under the pointer
    // takes over — the classic way to walk the bar in one gesture.
    if (hit && !hit.item && !hit.menu.open) this.target.open(hit.menu)
    this.#highlight(hit?.item ?? null)
  }

  #onPointerUp = (event: PointerEvent): void => {
    if (!this.#pressing) return
    const hit = this.#hitTest(event.clientX, event.clientY)
    const openedByThisPress = this.#openedByPress
    const inPlace = !this.#moved
    const quick = event.timeStamp - this.#downTime < PRESS_HOLD_MS
    this.#end()
    // Modern click-to-open: a quick in-place tap on a title leaves the menu
    // dropped for a second, independent click.
    if (openedByThisPress && inPlace && quick) return
    // Otherwise the press is a completed pick or dismissal — a drag onto a row,
    // a held in-place press, or a press on an already-dropped menu.
    this.#resolve(hit?.item ?? null)
  }

  #onPointerCancel = (): void => {
    // Pointer interrupted (e.g. a cancelled touch). Stop tracking but leave the
    // menu as it is — the click-to-open state; the user can retry or dismiss it.
    this.#end()
    this.#highlight(null)
  }

  #end(): void {
    if (!this.#pressing) return
    this.#pressing = false
    this.#origin = null
    this.#listeners.detach()
  }

  /**
   * Resolves a press that ended as a pick/dismissal (not a click-to-open):
   * activate an enabled row — which blinks, fires `vf-menu-select` and closes
   * the menu itself — otherwise close with nothing chosen.
   */
  #resolve(item: VfMenuItem | null): void {
    if (!item || item.disabled) {
      this.#highlight(null)
      this.target.close()
      return
    }
    // The row keeps its inversion into the blink, which starts in the OFF phase
    // (see runSelectionBlink): the release reads as the highlight flashing off,
    // which is what System 7 drew. Light it first — a release can land on a row
    // no pointermove reported (a fast enough gesture coalesces), and the row
    // that was lit has to go out either way — then hand the flag over: `vf-menu`
    // clears it when the panel closes.
    this.#highlight(item)
    this.#active = null
    item.activate()
  }

  /** Inverts the row under the pointer during a drag; at most one at a time. */
  #highlight(item: VfMenuItem | null): void {
    const next = item && !item.disabled ? item : null
    if (next === this.#active) return
    if (this.#active) this.#active.active = false
    this.#active = next
    if (next) next.active = true
  }

  /** The bar title or panel row under a viewport point, if any. */
  #hitTest(x: number, y: number): MenuHit | null {
    const menus = this.target.menus()
    const open = menus.find((menu) => menu.open)
    if (open) {
      // Rows first: a dropped panel is painted over whatever is behind it.
      // Disabled rows hit too — releasing over one cancels, rather than falling
      // through to whatever it covers.
      for (const item of open.allItems) {
        if (within(item.getBoundingClientRect(), x, y)) return { menu: open, item }
      }
    }
    for (const menu of menus) {
      const rect = menu.labelRect
      if (rect && within(rect, x, y)) return { menu, item: null }
    }
    return null
  }
}

/** Half-open on the right/bottom edge, so adjacent boxes never both match. */
function within(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
}
