import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { DocumentListenersController } from './document-listeners.js'
import { PRESS_HOLD_MS, SUBMENU_CLOSE_MS, SUBMENU_OPEN_MS } from './motion.js'
import { openPath } from './menu-navigation.js'
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

/**
 * What sits under a point: a menu's bar title, or somewhere in an open
 * menu's panel — a row, or none of them (a separator).
 */
interface MenuHit {
  menu: VfMenu
  /** Whether the point is on the menu's bar title. */
  title: boolean
  /** The row under the point, or `null` on the title or between rows. */
  item: VfMenuItem | null
}

/** Where the pointer is among the open panels: the panel's menu and its enabled row, if any. */
interface Over {
  menu: VfMenu
  row: VfMenuItem | null
}

/**
 * The System 7 press-drag-release gesture for pull-down menus — the same
 * mechanic `vf-select` uses for its popup, and the way the real menu bar was
 * driven: **press a title, keep the button down, slide onto a command, release
 * over it to run it.** Sliding sideways onto another title switches menus
 * mid-press; releasing over a disabled row, a separator, the title, or off the
 * menu entirely closes with nothing chosen (the classic "release outside").
 *
 * The modern click-to-open style coexists, disambiguated by the gesture itself
 * and resolved at the first release: a quick in-place tap on a title (under
 * {@link PRESS_HOLD_MS}) leaves the menu dropped for a second, independent
 * click, while a held in-place press closes it. Time is consulted *only* for an
 * in-place release — any press that travels to another title or row is a
 * drag-pick however long it took.
 *
 * **One pointer model for both.** While a menu is open the pointer is tracked
 * with or without a button down; the button only changes what a release
 * means. Each open menu highlights the row under the pointer, or, with the
 * pointer elsewhere, the item whose submenu is open. The pointer resting on
 * an item for {@link SUBMENU_OPEN_MS} opens its submenu, and an open submenu
 * stays {@link SUBMENU_CLOSE_MS} after the pointer moves onto another row of
 * its menu, so a diagonal slide into it can cross the rows between. A release
 * on an item that opens a submenu chooses nothing: the submenu opens now, and
 * every menu stays dropped for clicking on.
 *
 * Everything is hit-tested by **coordinates**, not by event target, for the
 * same reason `vf-select` is: under touch, the pointer is implicitly captured
 * by the element the gesture started on, so every move and the release itself
 * are delivered to the pressed title no matter what they are actually over.
 * The open menus are tried deepest first, since a submenu is painted over its
 * parent.
 *
 * The host binds {@link onPointerDown} to a `pointerdown` on itself — presses
 * on titles and rows both bubble up composed — calls {@link track} as its
 * menus open and close, and supplies a {@link MenuPressTarget}. Everything
 * else (tracking to the release anywhere on the page, the highlight, the
 * submenus, classification) lives here.
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

  /** True while the host has a menu open: the pointer is tracked, button or not. */
  #tracking = false

  /** Set once a row is chosen: the menus hold still through its blink. */
  #chosen = false

  /** The panel the pointer is in and its row, or null off every panel. */
  #over: Over | null = null

  /** The submenu waiting to open or close where the pointer rests. */
  #timer: number | undefined

  /** While a press is in flight or a menu is open: track the pointer anywhere. */
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
   * the press and tracking state, which the normal close path is no longer
   * going to run for.
   */
  hostDisconnected(): void {
    this.#end()
    this.track(false)
  }

  /**
   * The host opened (`true`) or closed (`false`) its menus. While one is open
   * the pointer is tracked with or without a button down, so a resting mouse
   * highlights rows and opens submenus in the click-to-open style too.
   */
  track(open: boolean): void {
    this.#tracking = open
    if (open) {
      this.#listeners.attach()
      return
    }
    this.#chosen = false
    this.#over = null
    this.#cancelTimer()
    if (!this.#pressing) this.#listeners.detach()
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
    // A press on the bar's own background, or between a panel's rows: not ours.
    if (!hit || (!hit.title && !hit.item)) return
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
      this.#point(hit)
      return
    }
    hit.menu.focus()
    if (this.#openedByPress) this.target.open(hit.menu)
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (this.#chosen) return
    const hit = this.#hitTest(event.clientX, event.clientY)
    if (this.#pressing) {
      event.preventDefault()
      const over = hit ? (hit.item ?? (hit.title ? hit.menu : null)) : null
      if (!this.#moved && over !== this.#origin) this.#moved = true
      // Slide sideways with the button still down and the title under the
      // pointer takes over — the classic way to walk the bar in one gesture.
      if (hit?.title && !hit.menu.open) this.target.open(hit.menu)
    }
    this.#point(hit)
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
    this.#resolve(hit && !hit.title ? hit : null)
  }

  #onPointerCancel = (): void => {
    // Pointer interrupted (e.g. a cancelled touch). Stop tracking the press but
    // leave the menus as they are — the click-to-open state; the user can retry
    // or dismiss them.
    this.#end()
    this.#point(null)
  }

  #end(): void {
    if (!this.#pressing) return
    this.#pressing = false
    this.#origin = null
    if (!this.#tracking) this.#listeners.detach()
  }

  /**
   * Resolves a press that ended as a pick/dismissal (not a click-to-open):
   * activate an enabled row — which blinks, fires `vf-menu-select` and closes
   * the menus itself — open the submenu of an item that has one, leaving the
   * menus dropped, or otherwise close with nothing chosen.
   */
  #resolve(hit: MenuHit | null): void {
    const item = hit?.item
    if (!hit || !item || item.disabled) {
      this.target.close()
      return
    }
    this.#cancelTimer()
    if (item.submenu) {
      hit.menu.expand(item)
      return
    }
    // The row keeps its inversion into the blink, which starts in the OFF phase
    // (see runSelectionBlink): the release reads as the highlight flashing off,
    // which is what System 7 drew. Light it first — a release can land on a row
    // no pointermove reported (a fast enough gesture coalesces) — then hold the
    // menus still until they close, so a moving pointer can't light another.
    this.#point(hit)
    this.#chosen = true
    item.activate()
  }

  /**
   * The pointer is over `hit`: each open menu hears whether it is on one of
   * its rows, on none of them, or elsewhere, and the submenu where it rests
   * is set to open or close.
   */
  #point(hit: MenuHit | null): void {
    const next: Over | null =
      hit && !hit.title
        ? { menu: hit.menu, row: hit.item && !hit.item.disabled ? hit.item : null }
        : null
    const prev = this.#over
    if (prev?.menu === next?.menu && prev?.row === next?.row) return
    this.#over = next
    for (const top of this.target.menus()) {
      if (!top.open) continue
      for (const menu of openPath(top)) {
        menu.pointerOver(menu === next?.menu ? next.row : undefined)
      }
    }
    this.#cancelTimer()
    if (!next) return
    const { menu, row } = next
    const open = menu.expandedItem
    if (row !== null && row === open) return
    if (open) {
      // Strayed from the open submenu's item: it closes, and the row's own
      // submenu opens, if the pointer is still here once the grace is up.
      this.#timer = window.setTimeout(
        () => menu.expand(row?.submenu ? row : null),
        SUBMENU_CLOSE_MS
      )
    } else if (row?.submenu) {
      this.#timer = window.setTimeout(() => menu.expand(row), SUBMENU_OPEN_MS)
    }
  }

  #cancelTimer(): void {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = undefined
  }

  /** The bar title or the open panel and row under a viewport point, if any. */
  #hitTest(x: number, y: number): MenuHit | null {
    const menus = this.target.menus()
    const open = menus.find((menu) => menu.open)
    if (open) {
      // Panels first, deepest first: a dropped panel is painted over whatever
      // is behind it, a submenu over its parent. Disabled rows hit too —
      // releasing over one cancels, rather than falling through to whatever
      // it covers.
      for (const menu of openPath(open).reverse()) {
        const panel = menu.panelRect
        if (!panel || !within(panel, x, y)) continue
        const item = menu.allItems.find((row) => within(row.getBoundingClientRect(), x, y))
        return { menu, title: false, item: item ?? null }
      }
    }
    for (const menu of menus) {
      const rect = menu.labelRect
      if (rect && within(rect, x, y)) return { menu, title: true, item: null }
    }
    return null
  }
}

/** Half-open on the right/bottom edge, so adjacent boxes never both match. */
function within(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
}
