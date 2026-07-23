import { html, css } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { vfBase, vfStripes, vfDisplayDecls } from '../styles/base.js'
import { snapToDevicePx } from '../scale.js'
import { DragController } from '../drag.js'
import { VfModalDialog, modalDialogStyles } from '../modal-dialog.js'
import './vf-button-group.js'

/**
 * `<vf-dialog>` — the System 7 movable-modal dialog.
 *
 * A striped title bar with a centered title and NO window widgets, over a
 * white body. Drag the title bar to move it — the classic movable-modal
 * behavior. Wraps a native `<dialog>` for top-layer rendering and focus
 * trapping, with a fully transparent backdrop (no dimming — pure System 7).
 *
 * Open it with `show()` (or set the `open` attribute/property); close with
 * `close()`. Escape closes it and fires `vf-close` with
 * `{ reason: 'escape' }`; programmatic closing fires `{ reason: 'close' }`.
 *
 * @slot - Default slot: dialog body content.
 * @slot buttons - Optional action buttons. Rendered as a bottom-right
 *   `vf-button-group` (equal-width, faces aligned); the footer only takes
 *   space when the slot is populated.
 * @csspart frame - The outer chrome frame.
 * @csspart title-bar - The striped title bar.
 * @csspart title - The centered title patch.
 * @csspart body - The white content area.
 * @csspart footer - The action row wrapping the buttons.
 * @csspart buttons - The button group inside the footer.
 * @fires vf-close - Dialog closed. Detail `{ reason: 'escape' | 'close' }`.
 */
@customElement('vf-dialog')
export class VfDialog extends VfModalDialog {
  static override styles = [
    vfBase,
    vfStripes,
    modalDialogStyles,
    css`
      :host {
        display: contents;
      }
      .frame {
        background: var(--vf-white, #ffffff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        box-shadow: calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px))
          calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px)) 0 0
          var(--vf-black, #000000);
      }
      .title-bar {
        position: relative;
        height: calc(var(--vf-scale, 1) * var(--vf-titlebar-height, 18px));
        border-bottom: calc(var(--vf-scale, 1) * 1px) solid
          var(--vf-black, #000000);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        /* Draggable handle (see _drag); keep touch gestures from scrolling. */
        touch-action: none;
      }
      .title {
        /* Chicago-style title (chrome); the dialog body keeps the body face. */
        ${vfDisplayDecls}
        position: relative;
        z-index: 1;
        padding: 0 calc(var(--vf-scale, 1) * 8px);
        max-width: calc(100% - var(--vf-scale, 1) * 16px);
        background: var(--vf-white, #ffffff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .body {
        --vf-surface: var(--vf-white, #ffffff);
        background: var(--vf-white, #ffffff);
        padding: calc(var(--vf-scale, 1) * 16px);
      }
      /* Optional action row (slot="buttons"): a right-aligned vf-button-group
         that only takes space when populated. */
      .footer {
        display: flex;
        justify-content: flex-end;
        margin-top: calc(var(--vf-scale, 1) * 16px);
      }
      .footer.empty {
        display: none;
      }
    `,
  ]

  /**
   * Title-bar drag-to-move (shared with `vf-window` via {@link DragController}).
   * The dialog is a centered top-layer `<dialog>` pinned onto the device grid
   * on open (snapDialogToGrid); dragging rewrites those centering margins with
   * the snapped new origin. `unsnapDialog` on close clears them so the next
   * open re-centers.
   */
  private readonly _drag = new DragController(this, {
    onDragStart: (event: PointerEvent): { x: number; y: number } | null => {
      if (event.button !== 0) return null
      const dialog = this._dialog
      if (!dialog?.open) return null
      // Seed from the grid-pinned margins written on open; fall back to the
      // live rect if a drag somehow precedes the pin.
      let x = parseFloat(dialog.style.marginLeft)
      let y = parseFloat(dialog.style.marginTop)
      if (Number.isNaN(x) || Number.isNaN(y)) {
        const rect = dialog.getBoundingClientRect()
        x = snapToDevicePx(rect.left)
        y = snapToDevicePx(rect.top)
      }
      return { x, y }
    },
    onDrag: (x: number, y: number): void => {
      const dialog = this._dialog
      if (!dialog) return
      dialog.style.marginLeft = `${x}px`
      dialog.style.marginTop = `${y}px`
    },
  })

  /** Title text shown centered in the title bar. */
  @property() heading = ''

  /** Whether the `buttons` slot has assigned content (drives the footer). */
  @state() private _hasButtons = false

  protected override render(): unknown {
    return html`
      <dialog
        aria-labelledby="title"
        @cancel=${this._onNativeCancel}
        @close=${this._onNativeClose}
      >
        <div class="frame" part="frame">
          <header
            class="title-bar"
            part="title-bar"
            @pointerdown=${this._drag.onPointerDown}
            @pointermove=${this._drag.onPointerMove}
            @pointerup=${this._drag.onPointerUp}
            @pointercancel=${this._drag.onPointerUp}
          >
            <div class="vf-stripes"></div>
            <span class="title" part="title" id="title">${this.heading}</span>
          </header>
          <div class="body" part="body">
            <slot></slot>
            <div class="footer ${this._hasButtons ? '' : 'empty'}" part="footer">
              <vf-button-group class="buttons" part="buttons">
                <slot
                  name="buttons"
                  @slotchange=${this._onButtonsSlotChange}
                ></slot>
              </vf-button-group>
            </div>
          </div>
        </div>
      </dialog>
    `
  }

  private _onButtonsSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this._hasButtons = slot.assignedElements().length > 0
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-dialog': VfDialog
  }
}
