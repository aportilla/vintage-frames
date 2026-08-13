import { css, html, LitElement, unsafeCSS } from 'lit'
import { property, queryAssignedElements } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { vfBase } from '../styles/base.js'
import { SCREEN_CORNER, steppedCornerClip } from '../pixel-frame.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { DocumentListenersController } from '../document-listeners.js'
import { MenuPressController } from '../menu-press.js'
import { TypeAheadBuffer } from '../type-ahead.js'
import type { VfMenu } from './vf-menu.js'
import type { VfMenuItem } from './vf-menu-item.js'

/**
 * `<vf-menu-bar>` — the System 7 menu bar: white strip, 1px black bottom
 * rule, slotted `<vf-menu>` children laid out from the left. `rounded` adds
 * the classic screen-corner mask to the top corners.
 *
 * Coordinates its menus: pressing a label opens that menu (and inverts the
 * label); while any menu is open, hovering another label switches to it;
 * Escape, an outside click, or item selection closes. ArrowLeft/ArrowRight
 * move between menus while one is open; ArrowDown/ArrowUp move focus through
 * the open menu's items, Home/End jump to its first/last, and typed letters
 * run the shared Finder first-letter type-ahead (src/type-ahead.ts).
 *
 * The bar also owns the **press-drag-release** gesture (see src/menu-press.ts)
 * — press a title, slide onto a command, release over it — because one press
 * may travel across several of its menus. `vf-select` drives its popup by the
 * same mechanic.
 *
 * @slot - `vf-menu` elements.
 * @csspart bar - The horizontal layout container.
 * @cssprop [--vf-menubar-height=20px] - `vf-menu-bar`
 */
@vfElement('vf-menu-bar')
export class VfMenuBar extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        /* 19 white system px over the 1px black rule — Menus.png's bar strip
           exactly (white rows y 69..87 of the sheet). */
        height: calc(var(--vf-scale, 1) * var(--vf-menubar-height, 20px));
        position: relative;
        z-index: 1000;
      }
      .bar {
        /* Paint lives here rather than on the host so it rides the snap offset
           (see .vf-snap in base.ts); border-box sizing keeps the geometry. */
        background: var(--vf-white, #fff);
        border-bottom: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        display: flex;
        align-items: stretch;
        height: 100%;
        /* 9px of bar before the first title's plate (System 7 put the Apple
           plate 9 system px from the screen edge, clear of the 5px corner
           mask), plus 5px cancelling the first title's share of the overlap
           below. */
        padding-inline-start: calc(var(--vf-scale, 1) * 14px);
      }
      /* Adjacent title plates OVERLAP by 5 system px: Menus.png spaces title
         ink 14px apart while each plate runs 10px left / 9px right of its own
         ink, so neighboring plates share a 5px band. A title's plate is its
         label box (padding in vf-menu), so the overlap is layout: every menu
         pulled 5px into its left neighbor. */
      ::slotted(vf-menu) {
        margin-inline-start: calc(var(--vf-scale, 1) * -5px);
      }
      /* rounded: the screen-corner mask. The corners aren't a shape of the
         bar's own — they're the black staircase the ROM painted over the
         CRT's rounded corners, worn by the menu bar because it sat flush with
         the screen top. So they paint as ink *over* the bar (above slotted
         content, like the hardware mask over anything), not as a cutout that
         would show the backdrop. Stepped per the SCREEN_CORNER trace; the
         --vf-black token keeps it themeable and forced-colors-safe. Absolute
         position anchors to .bar (positioned via .vf-snap), riding the snap
         offset with the paint it masks. */
      :host([rounded]) .bar::before,
      :host([rounded]) .bar::after {
        content: '';
        position: absolute;
        top: 0;
        width: calc(var(--vf-scale, 1) * ${SCREEN_CORNER[0]!}px);
        height: calc(var(--vf-scale, 1) * ${SCREEN_CORNER.length}px);
        background: var(--vf-black, #000);
        pointer-events: none;
      }
      :host([rounded]) .bar::before {
        left: 0;
        clip-path: ${unsafeCSS(steppedCornerClip(SCREEN_CORNER, 'left'))};
      }
      :host([rounded]) .bar::after {
        right: 0;
        clip-path: ${unsafeCSS(steppedCornerClip(SCREEN_CORNER, 'right'))};
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * Accessible name for the bar, applied as `aria-label` on the host (which
   * carries `role="menubar"`). Without it the menubar computes with an empty
   * name. A consumer-supplied `aria-label`/`aria-labelledby` attribute is
   * left alone.
   */
  @property() label = ''

  /**
   * Rounds the bar's top corners the way System 7's were: not a curve of the
   * bar itself but the black stair-step mask the compact Mac's ROM painted
   * over the CRT's rounded corners, which the menu bar wore by sitting flush
   * with the screen top. Drawn as the traced 5-px staircase in `--vf-black`
   * ink over the bar's own corners — over any backdrop, as the hardware
   * mask was.
   */
  @property({ type: Boolean, reflect: true }) rounded = false

  @queryAssignedElements({ selector: 'vf-menu', flatten: true })
  private _menus!: VfMenu[]

  /** The currently-open slotted menu, if any. */
  #openMenu: VfMenu | null = null

  /**
   * ARIA goes through internals, never `setAttribute` on the host: internals
   * values are *defaults*, so a consumer's own `role`/`aria-*` on the tag wins
   * — the platform's own precedence, and the opposite of what a host
   * `setAttribute` gives. See SPEC §2. It retired this component's
   * first-connect role latch: `<vf-menu-bar role="toolbar">` keeps its role
   * because the attribute outranks the internals default, not because we
   * checked for it before writing.
   */
  readonly #internals = this.attachInternals()

  /** First-letter type-ahead over the open menu's items; see src/type-ahead.ts. */
  readonly #typeAhead = new TypeAheadBuffer()

  /**
   * The menu that currently holds the bar's single Tab stop (roving
   * tabindex). Falls back to the first menu when unset.
   */
  #rovingMenu: VfMenu | null = null

  /** Outside dismissal + menu/item keyboard nav while a menu is open. */
  readonly #docListeners = new DocumentListenersController(this, () => [
    [document, 'pointerdown', this.#onDocPointerDown, true],
    [document, 'keydown', this.#onDocKeydown, true],
  ])

  /**
   * The System 7 press-drag-release gesture across the whole bar. Presses on a
   * title or a dropped row both bubble up here composed, and the callbacks are
   * the bar's own open/close rules — so the gesture changes *when* a menu
   * opens, never *how*.
   */
  readonly #press = new MenuPressController(this, {
    menus: () => this._menus,
    open: (menu) => this.#openMenuAt(menu),
    close: () => this.#closeAll(),
  })

  override connectedCallback(): void {
    super.connectedCallback()
    this.#internals.role = 'menubar'
    this.addEventListener('vf-menu-toggle-request', this.#onToggleRequest)
    this.addEventListener('vf-menu-hover', this.#onMenuHover)
    this.addEventListener('vf-menu-close-request', this.#onCloseRequest)
    this.addEventListener('keydown', this.#onBarKeydown)
    this.addEventListener('pointerdown', this.#press.onPointerDown)
    this.addEventListener('focusout', this.#onHostFocusOut)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('vf-menu-toggle-request', this.#onToggleRequest)
    this.removeEventListener('vf-menu-hover', this.#onMenuHover)
    this.removeEventListener('vf-menu-close-request', this.#onCloseRequest)
    this.removeEventListener('keydown', this.#onBarKeydown)
    this.removeEventListener('pointerdown', this.#press.onPointerDown)
    this.removeEventListener('focusout', this.#onHostFocusOut)
    this.#openMenu = null
    this.#rovingMenu = null
  }

  /**
   * Moves keyboard focus to the bar's single Tab stop — the open menu's label,
   * else the roving one's, else the first. Overridden because the platform's
   * `focus()` was a silent no-op on this host (no `delegatesFocus`, no
   * tabindex), so `vf-label for` and consumer scripts couldn't reach the bar.
   */
  override focus(options?: FocusOptions): void {
    const target = this.#openMenu ?? this.#rovingMenu ?? this._menus[0]
    target?.focus(options)
  }

  /**
   * Focus left the bar entirely while a menu was open: close it, so an open
   * panel can't outlive the focus that operates it and go on capturing every
   * arrow key on the page. Modeled on `VfSelect.handleHostFocusOut`; the
   * relatedTarget is retargeted to light-DOM scope, so slotted menus (and
   * their panels' items) read as contained.
   */
  #onHostFocusOut = (event: FocusEvent): void => {
    if (!this.#openMenu) return
    const next = event.relatedTarget
    if (next instanceof Node && (this.contains(next) || this.renderRoot.contains(next))) {
      return
    }
    this.#closeAll()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    // Written unconditionally: an empty label clears the internals default
    // rather than the host, so a consumer's own aria-label is never in reach
    // to be blown away and needs no first-update guard.
    if (changed.has('label')) this.#internals.ariaLabel = this.label || null
  }

  protected override render() {
    // role="presentation" keeps the menubar→menuitem ownership chain free of
    // the layout div: the menubar's items are the slotted menus' labels, and
    // this generic sits between them in the AX tree otherwise.
    return html`
      <div class="bar vf-snap" part="bar" role="presentation">
        <slot @slotchange=${this.#onSlotChange}></slot>
      </div>
    `
  }

  #onSlotChange(): void {
    // If the open menu was removed from the light DOM, reset state.
    if (this.#openMenu && !this._menus.includes(this.#openMenu)) {
      this.#closeAll()
    }
    // Drop a stale roving reference before re-syncing the Tab stop.
    if (this.#rovingMenu && !this._menus.includes(this.#rovingMenu)) {
      this.#rovingMenu = null
    }
    this.#syncMenus()
  }

  /**
   * Push a roving tabindex down to the slotted menus so the whole bar is a
   * single Tab stop: the active menu's label gets tabindex 0, the rest -1.
   * The active menu is the open one, else the roving one, else the first.
   * Mirrors `vf-radio-group.syncRadios()`.
   */
  #syncMenus(): void {
    const menus = this._menus
    const active = this.#openMenu ?? this.#rovingMenu ?? menus[0]
    for (const menu of menus) {
      menu.barTabIndex = menu === active ? 0 : -1
    }
  }

  /** Moves the roving Tab stop to `menu` and re-syncs tabindices. */
  #setRovingMenu(menu: VfMenu): void {
    this.#rovingMenu = menu
    this.#syncMenus()
  }

  #onToggleRequest = (event: Event): void => {
    const detail = (event as CustomEvent<{ menu: VfMenu }>).detail
    event.preventDefault() // Tell the menu the bar is coordinating.
    event.stopPropagation()
    if (detail.menu.open) this.#closeAll()
    else this.#openMenuAt(detail.menu)
  }

  #onMenuHover = (event: Event): void => {
    const detail = (event as CustomEvent<{ menu: VfMenu }>).detail
    if (this.#openMenu && detail.menu !== this.#openMenu) {
      this.#openMenuAt(detail.menu)
    }
  }

  #onCloseRequest = (): void => {
    // The originating vf-menu already set itself closed; sync bar state.
    // Closing hides the focused slotted item, which would drop focus to
    // <body> — return it to the menu's bar label (as the Escape path does).
    this.#openMenu?.focus()
    this.#closeAll()
  }

  #openMenuAt(menu: VfMenu): void {
    for (const other of this._menus) {
      if (other !== menu) other.open = false
    }
    menu.open = true
    this.#openMenu = menu
    this.#rovingMenu = menu
    // A prefix typed in one menu means nothing in the next.
    this.#typeAhead.reset()
    this.#syncMenus()
    this.#docListeners.attach()
  }

  #closeAll(): void {
    for (const menu of this._menus) menu.open = false
    this.#openMenu = null
    this.#typeAhead.reset()
    this.#docListeners.detach()
    // Keep the Tab stop on the last-active menu so re-tabbing lands there.
    this.#syncMenus()
  }

  #onDocPointerDown = (event: PointerEvent): void => {
    if (!event.composedPath().includes(this)) this.#closeAll()
  }

  #onDocKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || !this.#openMenu) return
    switch (event.key) {
      case 'Escape': {
        event.preventDefault()
        this.#openMenu.focus()
        this.#closeAll()
        break
      }
      case 'Tab': {
        // Let focus move on; close without cancelling the tab, as vf-select
        // does. The focusout listener is the belt for this suspender.
        this.#closeAll()
        break
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        event.preventDefault()
        this.#switchMenu(event.key === 'ArrowRight' ? 1 : -1)
        break
      }
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        this.#moveItemFocus(event.key === 'ArrowDown' ? 1 : -1)
        break
      }
      case 'Home':
      case 'End': {
        // Jump to the open menu's first/last enabled item — the same case the
        // standalone menu's own handler has; #onBarKeydown's Home/End only
        // runs while no menu is open.
        event.preventDefault()
        const items = this.#openMenu.items
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
        break
      }
      default: {
        // Printable keys run the shared Finder type-ahead over the open
        // menu's items. Space stays out of the prefix — it is the focused
        // item's activation key — and modified keys stay the consumer's.
        if (
          event.key.length !== 1 ||
          event.key === ' ' ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        ) {
          break
        }
        event.preventDefault()
        const items = this.#openMenu.items
        const current = items.indexOf(document.activeElement as VfMenuItem)
        const index = this.#typeAhead.feed(
          event.key,
          current,
          // Already the enabled rows only, so nothing here is disabled.
          items.map((item) => ({
            text: item.textContent ?? '',
            disabled: false,
          }))
        )
        items[index]?.focus()
        break
      }
    }
  }

  /**
   * Roving-focus navigation while the bar has focus but no menu is open.
   * ArrowLeft/Right (and Home/End) move the single Tab stop between labels
   * and follow it with DOM focus. While a menu IS open, ArrowLeft/Right is
   * handled by `#onDocKeydown`/`#switchMenu` instead, so bail out here.
   */
  #onBarKeydown = (event: KeyboardEvent): void => {
    if (this.#openMenu) return
    const menus = this._menus
    if (menus.length === 0) return
    const current = event.target
    if (!(current instanceof HTMLElement)) return
    const from = menus.find((menu) => menu.contains(current))
    if (!from) return
    let target: VfMenu | undefined
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const index = menus.indexOf(from)
        const dir = event.key === 'ArrowRight' ? 1 : -1
        target = menus[(index + dir + menus.length) % menus.length]
        break
      }
      case 'Home':
        target = menus[0]
        break
      case 'End':
        target = menus[menus.length - 1]
        break
      default:
        return
    }
    event.preventDefault()
    if (target) {
      this.#setRovingMenu(target)
      target.focus()
    }
  }

  /** Opens the previous/next menu in the bar, wrapping at the ends. */
  #switchMenu(direction: 1 | -1): void {
    const menus = this._menus
    if (!this.#openMenu || menus.length === 0) return
    const index = menus.indexOf(this.#openMenu)
    const next = menus[(index + direction + menus.length) % menus.length]
    if (next && next !== this.#openMenu) {
      this.#openMenuAt(next)
      // Closing the old menu hides any focused item in it; move focus to the
      // new menu's label so keyboard users keep their place (ArrowDown then
      // walks into the items).
      next.focus()
    }
  }

  /** Moves keyboard focus through the open menu's enabled items, wrapping. */
  #moveItemFocus(direction: 1 | -1): void {
    if (!this.#openMenu) return
    const items = this.#openMenu.items
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as VfMenuItem)
    let next: number
    if (current < 0) next = direction === 1 ? 0 : items.length - 1
    else next = (current + direction + items.length) % items.length
    items[next]?.focus()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-menu-bar': VfMenuBar
  }
}
