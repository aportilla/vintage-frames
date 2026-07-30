import { html, css, nothing, unsafeCSS } from 'lit'
import { property, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { styleMap } from 'lit/directives/style-map.js'
import { CAUTION_ICON } from '../icons.js'
import { vfBase, vfDisplay, vfHardShadowDecls } from '../styles/base.js'
import { VfModalDialog, modalDialogStyles } from '../modal-dialog.js'
import './vf-button-group.js'

/**
 * The classic caution icon — the one piece of raster art the library itself
 * ships. An alert icon is a *picture*, not geometry, so it is not vectorized
 * into glyphs.ts the way the checkmark and the little arrows are: this is the
 * reference sheet's own 32x32 pixels (`src/icons.ts`, cut by
 * `npm run extract:icons` from the same crop as the demo copy, so the two
 * cannot drift). Being black ink on transparency it is precisely an alpha
 * mask, which is how `.caution` paints it — see the note there.
 */
const cautionIcon = html`<span class="caution" aria-hidden="true"></span>`

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
@vfElement('vf-alert')
export class VfAlert extends VfModalDialog {
  static override styles = [
    vfBase,
    vfDisplay,
    modalDialogStyles,
    css`
      :host {
        display: contents;
      }
      /* Not vfChromeFrame: the alert's outer rule is 2px, the double-frame's
         heavier outer stroke. Only the shadow is shared.

         A declared height lands on the <dialog> (dialogSize), so each ring of
         the double frame has to pass it inward — a plain block child of a
         taller box stays content-tall and leaves the framed art floating in a
         transparent dialog. Unset height leaves the <dialog> auto, where this
         chain resolves to the content and costs nothing. */
      .frame {
        --vf-surface: var(--vf-white, #ffffff);
        background: var(--vf-white, #ffffff);
        display: flex;
        flex-direction: column;
        height: 100%;
        border: calc(var(--vf-scale, 1) * 2px) solid var(--vf-black, #000000);
        ${vfHardShadowDecls}
      }
      .inner {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        margin: calc(var(--vf-scale, 1) * 2px);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
      }
      /* Clips at the frame, as vf-window's and vf-dialog's bodies do. */
      .content {
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
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
      /* The 32x32 reference bitmap, painted as an alpha mask over --vf-black
         (the vf-grid rules idiom) rather than as an <img>: the ink then follows
         the token like every other 1-bit surface, and the triangle's interior
         shows the alert's own surface instead of a baked-in white. Sized off
         --vf-scale so it scales with the rest of the chrome (its 32px box is
         the grid column width) — one image pixel per system pixel, on a whole
         number of device px, so mask-size 100% magnifies bit-exactly with no
         resampling. */
      .caution {
        display: block;
        width: calc(var(--vf-scale, 1) * 32px);
        height: calc(var(--vf-scale, 1) * 32px);
        background: var(--vf-black, #000000);
        /* Nearest-neighbor, as vf-img does for a consumer's art: without it the
           browser smooths the 32px source up to the scaled box and the 1-bit
           edges go gray (verify:caution's PURITY check). */
        image-rendering: pixelated;
        -webkit-mask-image: url(${unsafeCSS(CAUTION_ICON)});
        mask-image: url(${unsafeCSS(CAUTION_ICON)});
        -webkit-mask-size: 100% 100%;
        mask-size: 100% 100%;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
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
        style=${styleMap(this.dialogSize)}
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
