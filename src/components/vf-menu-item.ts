import { css, html, LitElement, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import { CHECKMARK, glyphSvg } from '../glyphs.js'
import { ScaleController } from '../scale.js'
import { prefersReducedMotion } from '../motion.js'

/**
 * `<vf-menu-item>` — a single command inside a `<vf-menu>` panel.
 *
 * Renders the classic System 7 menu row: optional ✓ check in a 22px left
 * gutter, label, and a right-aligned keyboard shortcut. On activation the item
 * performs the classic 3-blink inversion (~250ms), then dispatches `vf-select`
 * and asks its ancestors to close the menu.
 *
 * @slot - The item label.
 * @csspart item - The row container.
 * @csspart check - The ✓ checkmark glyph (rendered when `checked`).
 * @csspart label - The label wrapper around the default slot.
 * @csspart shortcut - The right-aligned shortcut text.
 * @fires vf-select - After the blink completes. `detail: { value, item }`.
 */
@customElement('vf-menu-item')
export class VfMenuItem extends LitElement {
  static override styles = [
    vfBase,
    vfDisplay,
    css`
      :host {
        display: block;
        cursor: default;
        outline: none;
      }
      .item {
        display: flex;
        align-items: center;
        height: calc(var(--vf-scale, 1) * 22px);
        padding: 0 calc(var(--vf-scale, 1) * 12px) 0
          calc(var(--vf-scale, 1) * 22px);
        position: relative;
        white-space: nowrap;
      }
      .check {
        position: absolute;
        left: calc(var(--vf-scale, 1) * 6px);
        top: 0;
        height: calc(var(--vf-scale, 1) * 22px);
        display: flex;
        align-items: center;
        color: inherit;
      }
      /* Native 9×9 (1:1, crisp). */
      .check svg {
        display: block;
        width: calc(var(--vf-scale, 1) * 9px);
        height: calc(var(--vf-scale, 1) * 9px);
      }
      .label {
        flex: 1;
      }
      .shortcut {
        margin-left: calc(var(--vf-scale, 1) * 24px);
      }
      :host([disabled]) .item {
        color: var(--vf-disabled, #c0c0c0);
      }
      /* Highlight = full-width inversion (hover, keyboard focus, blink "on"). */
      :host(:not([disabled])) .item:hover,
      :host(:not([disabled]):focus) .item,
      .item.blink-on {
        background: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
      }
      /* While blinking, the timer — not the pointer — owns the inversion. */
      :host(:not([disabled])) .item.blink-off:hover,
      :host(:not([disabled]):focus) .item.blink-off,
      .item.blink-off {
        background: transparent;
        color: inherit;
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Disables the item: dimmed text, no highlight, no activation. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows the classic ✓ checkmark in the left gutter. */
  @property({ type: Boolean, reflect: true }) checked = false

  /** Right-aligned keyboard shortcut text, e.g. `"⌘H"`. Display only. */
  @property() shortcut = ''

  /**
   * Value reported in the `vf-select` event detail. Defaults to the item's
   * trimmed text content when unset.
   */
  @property() value?: string

  /** `'on' | 'off'` while the selection blink runs, otherwise `null`. */
  @state() private _blinkPhase: 'on' | 'off' | null = null

  #blinkTimer: number | undefined
  #blinking = false

  /**
   * Latches true once the item is ever `checked`, marking it a *checkable*
   * item: it then carries `role="menuitemcheckbox"` with `aria-checked` kept in
   * sync. Plain command items (never checked) stay `role="menuitem"`.
   */
  #checkable = false

  constructor() {
    super()
    // Bound on the host: keydown targets the focused host element and never
    // enters the shadow tree, so a shadow-internal binding would not fire.
    this.addEventListener('keydown', this.#onKeydown)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('role', 'menuitem')
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    if (this.#blinkTimer !== undefined) {
      clearInterval(this.#blinkTimer)
      this.#blinkTimer = undefined
    }
    this.#blinking = false
    this._blinkPhase = null
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('disabled')) {
      if (this.disabled) this.setAttribute('aria-disabled', 'true')
      else this.removeAttribute('aria-disabled')
    }
    if (changed.has('checked')) {
      // A checkable item announces its on/off state; promote the role and keep
      // aria-checked in sync (aria-checked is only valid on the checkbox role).
      if (this.checked) this.#checkable = true
      if (this.#checkable) {
        this.setAttribute('role', 'menuitemcheckbox')
        this.setAttribute('aria-checked', this.checked ? 'true' : 'false')
      }
    }
  }

  protected override render() {
    const classes = {
      item: true,
      'blink-on': this._blinkPhase === 'on',
      'blink-off': this._blinkPhase === 'off',
    }
    return html`
      <div
        class=${classMap(classes)}
        part="item"
        @click=${this.#onClick}
      >
        ${this.checked
          ? html`<span class="check" part="check" aria-hidden="true"
              >${glyphSvg(CHECKMARK, 'checkmark')}</span
            >`
          : nothing}
        <span class="label" part="label"><slot></slot></span>
        ${this.shortcut
          ? html`<span class="shortcut" part="shortcut">${this.shortcut}</span>`
          : nothing}
      </div>
    `
  }

  #onClick(): void {
    this.#activate()
  }

  #onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      this.#activate()
    }
  }

  /**
   * Runs the classic 3-blink inversion, then dispatches `vf-select` and an
   * internal `vf-menu-close-request` so ancestor menu/menu-bar close.
   */
  #activate(): void {
    if (this.disabled || this.#blinking) return
    // Reduced motion: skip the ~250ms blink and select immediately.
    if (prefersReducedMotion()) {
      this.#dispatchSelect()
      return
    }
    this.#blinking = true
    // 6 phase flips = 3 full off/on blinks over ~250ms.
    let flips = 0
    this._blinkPhase = 'off'
    this.#blinkTimer = window.setInterval(() => {
      flips += 1
      if (flips >= 6) {
        clearInterval(this.#blinkTimer)
        this.#blinkTimer = undefined
        this._blinkPhase = null
        this.#blinking = false
        this.#dispatchSelect()
        return
      }
      this._blinkPhase = this._blinkPhase === 'on' ? 'off' : 'on'
    }, 42)
  }

  #dispatchSelect(): void {
    const value = this.value ?? (this.textContent ?? '').trim()
    this.dispatchEvent(
      new CustomEvent('vf-select', {
        bubbles: true,
        composed: true,
        detail: { value, item: this },
      })
    )
    // Internal coordination event: `vf-menu` / `vf-menu-bar` listen and close.
    this.dispatchEvent(
      new CustomEvent('vf-menu-close-request', {
        bubbles: true,
        composed: true,
        detail: { item: this },
      })
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-menu-item': VfMenuItem
  }
}
