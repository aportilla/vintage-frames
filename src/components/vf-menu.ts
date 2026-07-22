import { css, html, LitElement } from 'lit'
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from 'lit/decorators.js'
import { vfBase, vfDisplay, vfFocus, vfPanel } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import type { VfMenuItem } from './vf-menu-item.js'

/**
 * `<vf-menu>` — a pull-down menu: a bar label plus a dropped panel of
 * `<vf-menu-item>` / `<vf-separator>` children.
 *
 * Inside a `<vf-menu-bar>` the bar coordinates open state (only one menu open,
 * hover-switching, outside-click/Escape dismissal). Used standalone, the menu
 * toggles itself on label click and manages its own dismissal and item
 * keyboard navigation (ArrowUp/ArrowDown, Home/End) while open.
 *
 * @slot - Menu contents: `vf-menu-item` and `vf-separator` elements.
 * @csspart label - The menu title in the bar (inverts while open).
 * @csspart panel - The dropped `.vf-panel` containing the items.
 */
@customElement('vf-menu')
export class VfMenu extends LitElement {
  static override styles = [
    vfBase,
    vfDisplay,
    vfPanel,
    vfFocus,
    css`
      :host {
        display: inline-block;
        position: relative;
      }
      .label {
        display: flex;
        align-items: center;
        height: calc(var(--vf-scale, 1) * var(--vf-menubar-height, 24px));
        padding: 0 calc(var(--vf-scale, 1) * 10px);
        white-space: nowrap;
        cursor: default;
      }
      :host([open]) .label {
        background: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
      }
      .panel {
        position: absolute;
        top: 100%;
        left: 0;
        min-width: calc(var(--vf-scale, 1) * 180px);
        padding: calc(var(--vf-scale, 1) * 2px) 0;
        z-index: 1000;
        /* Slotted vf-separators render as the classic dimmed dotted menu rule. */
        --vf-separator-color: var(--vf-disabled, #c0c0c0);
        --vf-separator-style: dotted;
      }
      :host(:not([open])) .panel {
        display: none;
      }
      .panel ::slotted(vf-separator) {
        margin: calc(var(--vf-scale, 1) * 2px) 0;
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** The menu title shown in the bar (may contain a glyph, e.g. an apple). */
  @property() label = ''

  /**
   * Whether the panel is dropped. Reflected. Managed by the parent
   * `vf-menu-bar` when present, otherwise by the menu itself.
   */
  @property({ type: Boolean, reflect: true }) open = false

  @query('.label') private _labelEl!: HTMLElement

  @queryAssignedElements({ selector: 'vf-menu-item', flatten: true })
  private _assignedItems!: VfMenuItem[]

  /** The enabled `vf-menu-item` children, in document order. */
  get items(): VfMenuItem[] {
    return this._assignedItems.filter((item) => !item.disabled)
  }

  #onCloseRequest = (): void => {
    this.open = false
  }

  #onDocPointerDown = (event: PointerEvent): void => {
    if (!event.composedPath().includes(this)) this.open = false
  }

  // Attached only when standalone (a parent vf-menu-bar handles these itself).
  #onDocKeydown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        this.open = false
        this.focusLabel()
        break
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        this.#moveItemFocus(event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Home':
      case 'End': {
        event.preventDefault()
        const items = this.items
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
        break
      }
    }
  }

  /** Moves keyboard focus through the enabled items, wrapping at the ends. */
  #moveItemFocus(direction: 1 | -1): void {
    const items = this.items
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as VfMenuItem)
    let next: number
    if (current < 0) next = direction === 1 ? 0 : items.length - 1
    else next = (current + direction + items.length) % items.length
    items[next]?.focus()
  }

  #docListenersAttached = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener('vf-menu-close-request', this.#onCloseRequest)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('vf-menu-close-request', this.#onCloseRequest)
    this.#removeDocListeners()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('open')) {
      // A parent vf-menu-bar owns document-level dismissal; only self-manage
      // when standalone.
      const inBar = this.closest('vf-menu-bar') !== null
      if (this.open && !inBar) this.#addDocListeners()
      else this.#removeDocListeners()
    }
  }

  /** Moves keyboard focus to the menu's bar label. */
  focusLabel(): void {
    this._labelEl?.focus()
  }

  protected override render() {
    return html`
      <div
        class="label vf-focus"
        part="label"
        role="menuitem"
        tabindex="0"
        aria-haspopup="menu"
        aria-expanded=${this.open ? 'true' : 'false'}
        @click=${this.#onLabelClick}
        @pointerenter=${this.#onLabelEnter}
        @keydown=${this.#onLabelKeydown}
      >
        ${this.label}
      </div>
      <div class="panel vf-panel" part="panel" role="menu" aria-label=${this.label}>
        <slot></slot>
      </div>
    `
  }

  /**
   * Requests a toggle. A parent `vf-menu-bar` cancels the internal
   * `vf-menu-toggle-request` event and coordinates; otherwise the menu
   * toggles itself.
   */
  #requestToggle(): void {
    const proceed = this.dispatchEvent(
      new CustomEvent('vf-menu-toggle-request', {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { menu: this },
      })
    )
    if (proceed) this.open = !this.open
  }

  #onLabelClick(): void {
    this.#requestToggle()
  }

  #onLabelEnter(): void {
    // Internal event: while a sibling menu is open, the bar switches to us.
    this.dispatchEvent(
      new CustomEvent('vf-menu-hover', {
        bubbles: true,
        composed: true,
        detail: { menu: this },
      })
    )
  }

  #onLabelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.#requestToggle()
    } else if (event.key === 'ArrowDown' && !this.open) {
      event.preventDefault()
      this.#requestToggle()
      if (this.open) void this.#focusFirstItem()
    }
  }

  /**
   * Focuses the first enabled item once the panel is visible. The reflected
   * `open` attribute (which un-hides the panel) only lands on the host in the
   * next Lit update, so focusing synchronously would silently no-op.
   */
  async #focusFirstItem(): Promise<void> {
    await this.updateComplete
    this.items[0]?.focus()
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
    'vf-menu': VfMenu
  }
}
