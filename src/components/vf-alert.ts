import { html, css, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import { VfModalDialog, modalDialogStyles } from '../modal-dialog.js'
import './vf-button-group.js'

/**
 * The classic black/white caution icon — a triangle enclosing an exclamation
 * mark, authored as a self-contained 1-bit inline SVG in the spirit of the
 * sprite glyphs in glyphs.ts: integer-coordinate *filled* geometry (a white
 * face under a black border, like the radio/slider handle) rendered with
 * `shape-rendering: crispEdges`, so its edges stay hard 1-bit steps and it
 * scales as whole pixels with `--vf-scale` instead of the old anti-aliased 2px
 * stroke. Sized in CSS off `--vf-scale` (see `.caution`); colors are themeable
 * via `.caution-face`, `.caution-tri` (border) and `.caution-mark`.
 */
const cautionIcon = html`
  <svg
    class="caution"
    viewBox="0 0 32 32"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <path class="caution-face" d="M16 3 29 28 3 28Z" />
    <path
      class="caution-tri"
      fill-rule="evenodd"
      d="M16 3 29 28 3 28Z M16 10 24 25 8 25Z"
    />
    <rect class="caution-mark" x="15" y="12" width="3" height="8" />
    <rect class="caution-mark" x="15" y="22" width="3" height="3" />
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
 * @slot buttons - Action buttons, laid out bottom-right in a `vf-button-group`
 *   (equal-width, faces aligned; classic 12px gap).
 * @csspart frame - The outer double-rule frame.
 * @csspart icon - The 32px icon column.
 * @csspart message - The message area.
 * @csspart buttons - The button group.
 * @fires vf-close - Alert closed. Detail `{ reason: 'escape' | 'close' }`.
 */
@customElement('vf-alert')
export class VfAlert extends VfModalDialog {
  static override styles = [
    vfBase,
    vfDisplay,
    modalDialogStyles,
    css`
      :host {
        display: contents;
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
      /* Sized off --vf-scale so the icon scales with the rest of the chrome
         (its 32px grid = the grid column width), staying whole-pixel crisp. */
      .caution {
        display: block;
        width: calc(var(--vf-scale, 1) * 32px);
        height: calc(var(--vf-scale, 1) * 32px);
      }
      .caution-face {
        fill: var(--vf-white, #ffffff);
      }
      .caution-tri {
        fill: var(--vf-black, #000000);
      }
      .caution-mark {
        fill: var(--vf-black, #000000);
      }
      .message {
        grid-area: message;
        align-self: center;
      }
      /* The action row is a vf-button-group: it equalizes the button widths and
         aligns their faces. It shrink-wraps, so justify-self pins it to the
         right of the full-width buttons area (classic bottom-right actions). */
      .buttons {
        grid-area: buttons;
        justify-self: end;
      }
    `,
  ]

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

  /** True when the consumer slotted custom icon content. */
  @state() private _hasSlottedIcon = false

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
              <vf-button-group class="buttons" part="buttons">
                <slot name="buttons"></slot>
              </vf-button-group>
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
