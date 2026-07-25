import { css, html, LitElement, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import { CHECKMARK, glyphSvg } from '../glyphs.js'
import { ScaleController } from '../scale.js'
import { runSelectionBlink, type BlinkHandle } from '../motion.js'
import { emit } from '../events.js'

/**
 * `<vf-menu-item>` — a single command inside a `<vf-menu>` panel.
 *
 * Renders the classic System 7 menu row: optional ✓ check in a 22px left
 * gutter, label, and a right-aligned keyboard shortcut. On activation the item
 * performs the classic 3-blink inversion (~250ms), then dispatches
 * `vf-menu-select` and asks its ancestors to close the menu.
 *
 * @slot - The item label.
 * @csspart item - The row container.
 * @csspart check - The ✓ checkmark glyph (rendered when `checked`).
 * @csspart label - The label wrapper around the default slot.
 * @csspart shortcut - The right-aligned shortcut text.
 * @fires vf-menu-select - After the blink completes. `detail: { value, item }`.
 *   Named for the menu rather than plain `vf-select`, which would collide with
 *   the `<vf-select>` popup on any delegated ancestor listener (that component
 *   commits with `vf-change`).
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
      /* The inherited color deliberately lets a disabled row dim its ✓ along
         with the label. Brief §1 says dimming greys the label only while chrome
         glyphs stay black, but authentic System 7 greyed the whole disabled
         row, check included — and reference behavior wins over the rule of
         thumb. Documented deviation, not an oversight. */
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
      /* Highlight = full-width inversion (hover, keyboard focus, blink "on").
         blink-on is scoped to the enabled host like its siblings: an item
         disabled mid-blink has its timer cancelled (see updated()), and this
         keeps it from flashing even for the frame before that lands. */
      :host(:not([disabled])) .item:hover,
      :host(:not([disabled]):focus) .item,
      :host(:not([disabled])) .item.blink-on {
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

  /**
   * Declares the item a *checkable* toggle up front, so it carries
   * `role="menuitemcheckbox"` and `aria-checked="false"` from the first render
   * rather than only once it has been checked. Set this on a toggle that starts
   * **off** — otherwise it announces as a plain command until the first flip
   * (the `checked` attribute can't express "checkable but off": for a boolean
   * attribute, presence *is* true).
   */
  @property({ type: Boolean, reflect: true }) checkable = false

  /** Right-aligned keyboard shortcut text, e.g. `"⌘H"`. Display only. */
  @property() shortcut = ''

  /**
   * Value reported in the `vf-menu-select` event detail. Defaults to the item's
   * trimmed text content when unset.
   */
  @property() value?: string

  /** `'on' | 'off'` while the selection blink runs, otherwise `null`. */
  @state() private _blinkPhase: 'on' | 'off' | null = null

  #blinkHandle: BlinkHandle | undefined
  #blinking = false

  /**
   * Latches true once the item has ever been `checked`, so an item that only
   * ever sets `checked` — without declaring {@link checkable} — is still
   * promoted to a toggle. Folded together with the public prop by
   * {@link #isCheckable}.
   */
  #everChecked = false

  /**
   * Whether this component owns the host `role`. Decided on the FIRST connect
   * only: our own `role` write persists on the element, so re-testing
   * `hasAttribute('role')` on a reconnect would read that write back as
   * consumer-supplied and freeze the role wherever it happened to be.
   */
  #ownsRole: boolean | undefined

  constructor() {
    super()
    // Bound on the host: keydown targets the focused host element and never
    // enters the shadow tree, so a shadow-internal binding would not fire.
    this.addEventListener('keydown', this.#onKeydown)
  }

  /** True when the item should announce as a toggle, not a plain command. */
  get #isCheckable(): boolean {
    return this.checkable || this.#everChecked
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.#ownsRole ??= !this.hasAttribute('role')
    // Re-derived (not blindly reset) so re-parenting a checkable item keeps its
    // menuitemcheckbox role and aria-checked — updated() does not re-fire on a
    // reconnect, so an unconditional write here stranded it as a plain command.
    this.#syncRole()
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#cancelBlink()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('disabled')) {
      if (this.disabled) {
        this.setAttribute('aria-disabled', 'true')
        // Disabled mid-blink: drop the pending activation. #activate only
        // checked `disabled` on entry, so the timer would otherwise run to
        // completion and dispatch vf-menu-select for a now-disabled item.
        this.#cancelBlink()
      } else this.removeAttribute('aria-disabled')
    }
    if (changed.has('checked') && this.checked) this.#everChecked = true
    if (changed.has('checked') || changed.has('checkable')) this.#syncRole()
  }

  /**
   * Writes the ARIA role and `aria-checked` for the current state. A checkable
   * item announces its on/off state (`aria-checked` is only valid on the
   * checkbox role); a plain command stays `role="menuitem"`. Skipped entirely
   * when the consumer supplied their own role.
   */
  #syncRole(): void {
    if (!this.#ownsRole) return
    if (this.#isCheckable) {
      this.setAttribute('role', 'menuitemcheckbox')
      this.setAttribute('aria-checked', this.checked ? 'true' : 'false')
    } else {
      this.setAttribute('role', 'menuitem')
      this.removeAttribute('aria-checked')
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
   * Runs the classic 3-blink inversion, then dispatches `vf-menu-select` and an
   * internal `vf-menu-close-request` so ancestor menu/menu-bar close.
   */
  #activate(): void {
    if (this.disabled || this.#blinking) return
    this.#blinking = true
    // Shared primitive owns the timing + reduced-motion short-circuit; under
    // reduced motion it runs `onDone` synchronously (no blink), clearing the
    // flag before we retain the handle.
    const handle = runSelectionBlink(
      (on) => {
        this._blinkPhase = on ? 'on' : 'off'
      },
      () => {
        this._blinkPhase = null
        this.#blinking = false
        this.#blinkHandle = undefined
        this.#dispatchSelect()
      }
    )
    if (this.#blinking) this.#blinkHandle = handle
  }

  /**
   * Aborts an in-flight selection blink *without* dispatching — the item is
   * being disabled or torn down, so the pending `vf-menu-select` is dropped.
   */
  #cancelBlink(): void {
    if (!this.#blinking) return
    this.#blinkHandle?.cancel()
    this.#blinkHandle = undefined
    this.#blinking = false
    this._blinkPhase = null
  }

  #dispatchSelect(): void {
    const value = this.value ?? (this.textContent ?? '').trim()
    emit(this, 'vf-menu-select', { value, item: this })
    // Internal coordination event: `vf-menu` / `vf-menu-bar` listen and close.
    emit(this, 'vf-menu-close-request', { item: this })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-menu-item': VfMenuItem
  }
}
