import { css, html, LitElement } from 'lit'
import { customElement, queryAssignedElements } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'
import type { VfMenu } from './vf-menu.js'
import type { VfMenuItem } from './vf-menu-item.js'

/**
 * `<vf-menu-bar>` — the System 7 menu bar: white strip, 1px black bottom
 * rule, slotted `<vf-menu>` children laid out from the left.
 *
 * Coordinates its menus: clicking a label opens that menu (and inverts the
 * label); while any menu is open, hovering another label switches to it;
 * Escape, an outside click, or item selection closes. ArrowLeft/ArrowRight
 * move between menus while one is open; ArrowDown/ArrowUp move focus through
 * the open menu's items.
 *
 * @slot - `vf-menu` elements.
 * @csspart bar - The horizontal layout container.
 */
@customElement('vf-menu-bar')
export class VfMenuBar extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        height: var(--vf-menubar-height, 24px);
        background: var(--vf-white, #fff);
        border-bottom: 1px solid var(--vf-black, #000);
        position: relative;
        z-index: 1000;
      }
      .bar {
        display: flex;
        align-items: stretch;
        height: 100%;
      }
    `,
  ]

  @queryAssignedElements({ selector: 'vf-menu', flatten: true })
  private _menus!: VfMenu[]

  /** The currently-open slotted menu, if any. */
  #openMenu: VfMenu | null = null

  #docListenersAttached = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('role', 'menubar')
    this.addEventListener('vf-menu-toggle-request', this.#onToggleRequest)
    this.addEventListener('vf-menu-hover', this.#onMenuHover)
    this.addEventListener('vf-menu-close-request', this.#onCloseRequest)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('vf-menu-toggle-request', this.#onToggleRequest)
    this.removeEventListener('vf-menu-hover', this.#onMenuHover)
    this.removeEventListener('vf-menu-close-request', this.#onCloseRequest)
    this.#removeDocListeners()
    this.#openMenu = null
  }

  protected override render() {
    return html`
      <div class="bar" part="bar">
        <slot @slotchange=${this.#onSlotChange}></slot>
      </div>
    `
  }

  #onSlotChange(): void {
    // If the open menu was removed from the light DOM, reset state.
    if (this.#openMenu && !this._menus.includes(this.#openMenu)) {
      this.#closeAll()
    }
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
    this.#openMenu?.focusLabel()
    this.#closeAll()
  }

  #openMenuAt(menu: VfMenu): void {
    for (const other of this._menus) {
      if (other !== menu) other.open = false
    }
    menu.open = true
    this.#openMenu = menu
    this.#addDocListeners()
  }

  #closeAll(): void {
    for (const menu of this._menus) menu.open = false
    this.#openMenu = null
    this.#removeDocListeners()
  }

  #onDocPointerDown = (event: PointerEvent): void => {
    if (!event.composedPath().includes(this)) this.#closeAll()
  }

  #onDocKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || !this.#openMenu) return
    switch (event.key) {
      case 'Escape': {
        event.preventDefault()
        this.#openMenu.focusLabel()
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
      next.focusLabel()
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

  #addDocListeners(): void {
    if (this.#docListenersAttached) return
    this.#docListenersAttached = true
    document.addEventListener('pointerdown', this.#onDocPointerDown, true)
    document.addEventListener('keydown', this.#onDocKeydown, true)
  }

  #removeDocListeners(): void {
    if (!this.#docListenersAttached) return
    this.#docListenersAttached = false
    document.removeEventListener('pointerdown', this.#onDocPointerDown, true)
    document.removeEventListener('keydown', this.#onDocKeydown, true)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-menu-bar': VfMenuBar
  }
}
