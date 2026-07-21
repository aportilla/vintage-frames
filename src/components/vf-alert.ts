import { html, css, LitElement, nothing } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { vfBase, vfDisplay } from '../styles/base.js'
import { ScaleController } from '../scale.js'

/**
 * The classic black/white caution icon: a triangle with an exclamation mark.
 * Colors are themeable from CSS (`.caution-tri`, `.caution-mark`).
 */
const cautionIcon = html`
  <svg
    class="caution"
    viewBox="0 0 32 32"
    width="32"
    height="32"
    aria-hidden="true"
  >
    <path class="caution-tri" d="M16 2 L31 29 H1 Z" stroke-width="2" />
    <rect class="caution-mark" x="14.5" y="11" width="3" height="9" />
    <rect class="caution-mark" x="14.5" y="23" width="3" height="3" />
  </svg>
`

/**
 * `<vf-alert>` — the classic fixed modal alert.
 *
 * Double black rule frame (2px outer border, 1px inner rule), no title bar,
 * white body with an icon column on the left, the message on the right, and
 * a button row at the bottom-right. Wraps a native `<dialog>` (top layer +
 * focus trap) with a transparent backdrop.
 *
 * Open with `show()` (or the `open` attribute/property); close with
 * `close()`. Escape fires `vf-close` with `{ reason: 'escape' }`,
 * programmatic closing with `{ reason: 'close' }`.
 *
 * @slot - Default slot: the alert message.
 * @slot icon - Custom icon (overrides the `variant` icon).
 * @slot buttons - Action buttons, laid out bottom-right with a 12px gap.
 * @csspart frame - The outer double-rule frame.
 * @csspart icon - The 32px icon column.
 * @csspart message - The message area.
 * @csspart buttons - The button row.
 * @fires vf-close - Alert closed. Detail `{ reason: 'escape' | 'close' }`.
 */
@customElement('vf-alert')
export class VfAlert extends LitElement {
  static override styles = [
    vfBase,
    vfDisplay,
    css`
      :host {
        display: contents;
      }
      dialog {
        padding: 0;
        margin: auto;
        border: none;
        background: transparent;
        overflow: visible;
        color: inherit;
        font: inherit;
      }
      dialog::backdrop {
        background: transparent;
      }
      .frame {
        --vf-surface: var(--vf-white, #ffffff);
        background: var(--vf-white, #ffffff);
        border: calc(var(--vf-scale, 1) * 2px) solid var(--vf-black, #000000);
        box-shadow: calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px))
          calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px)) 0 0
          var(--vf-black, #000000);
      }
      .inner {
        margin: calc(var(--vf-scale, 1) * 2px);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
      }
      .content {
        display: grid;
        grid-template-columns: calc(var(--vf-scale, 1) * 32px) 1fr;
        grid-template-areas:
          'icon message'
          'buttons buttons';
        column-gap: calc(var(--vf-scale, 1) * 16px);
        row-gap: calc(var(--vf-scale, 1) * 16px);
        padding: calc(var(--vf-scale, 1) * 16px) calc(var(--vf-scale, 1) * 20px);
      }
      .content.no-icon {
        grid-template-columns: 1fr;
        grid-template-areas:
          'message'
          'buttons';
      }
      .icon {
        grid-area: icon;
        width: calc(var(--vf-scale, 1) * 32px);
      }
      .content.no-icon .icon {
        display: none;
      }
      .caution-tri {
        fill: var(--vf-white, #ffffff);
        stroke: var(--vf-black, #000000);
      }
      .caution-mark {
        fill: var(--vf-black, #000000);
      }
      .message {
        grid-area: message;
        align-self: center;
      }
      .buttons {
        grid-area: buttons;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: calc(var(--vf-scale, 1) * 12px);
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Whether the alert is open. Kept in sync with the native `<dialog>`. */
  @property({ type: Boolean, reflect: true }) open = false

  /**
   * Built-in icon variant. `'caution'` renders the classic black/white
   * triangle-with-! icon. Omit for no icon (or slot your own via `icon`).
   */
  @property() variant?: 'caution'

  /**
   * Accessible name for the alert dialog (`aria-label`). Alerts have no title
   * bar, so the name must come from ARIA; defaults to `'Caution'` when
   * `variant="caution"`, otherwise `'Alert'`.
   */
  @property() label = ''

  @query('dialog') private _dialog!: HTMLDialogElement

  /** True when the consumer slotted custom icon content. */
  @state() private _hasSlottedIcon = false

  /** Close reason pending for the next native `close` event. */
  private _closeReason: 'escape' | 'close' | null = null

  /** Open the alert modally (native `showModal()`). */
  show(): void {
    this.open = true
    if (this.hasUpdated && !this._dialog.open) this._dialog.showModal()
  }

  /** Close the alert. Fires `vf-close` with `{ reason: 'close' }`. */
  close(): void {
    this.open = false
    if (this.hasUpdated && this._dialog.open) this._dialog.close()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open')) {
      const dialog = this._dialog
      if (this.open && !dialog.open) {
        dialog.showModal()
      } else if (!this.open && dialog.open) {
        dialog.close()
      }
    }
  }

  /** Native `cancel` (Escape): remember the reason; `close` follows. */
  private _onNativeCancel(): void {
    this._closeReason = 'escape'
  }

  /** Native `close`: sync `open` and fire `vf-close` with the reason. */
  private _onNativeClose(): void {
    const reason = this._closeReason ?? 'close'
    this._closeReason = null
    this.open = false
    this.dispatchEvent(
      new CustomEvent('vf-close', {
        detail: { reason },
        bubbles: true,
        composed: true,
      })
    )
  }

  private _onIconSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this._hasSlottedIcon = slot.assignedElements().length > 0
  }

  protected override render(): unknown {
    const showIcon = this._hasSlottedIcon || this.variant === 'caution'
    return html`
      <dialog
        role="alertdialog"
        aria-label=${this.label ||
        (this.variant === 'caution' ? 'Caution' : 'Alert')}
        aria-describedby="message"
        @cancel=${this._onNativeCancel}
        @close=${this._onNativeClose}
      >
        <div class="frame" part="frame">
          <div class="inner">
            <div class="content ${showIcon ? '' : 'no-icon'}">
              <span class="icon" part="icon">
                <slot name="icon" @slotchange=${this._onIconSlotChange}>
                  ${this.variant === 'caution' ? cautionIcon : nothing}
                </slot>
              </span>
              <div class="message" part="message" id="message">
                <slot></slot>
              </div>
              <div class="buttons" part="buttons">
                <slot name="buttons"></slot>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-alert': VfAlert
  }
}
