import { html, css, LitElement } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { vfBase, vfStripes, vfDisplayDecls } from '../styles/base.js'
import { ScaleController } from '../scale.js'

/**
 * `<vf-dialog>` — the System 7 movable-modal dialog.
 *
 * A striped title bar with a centered title and NO window widgets, over a
 * white body. Wraps a native `<dialog>` for top-layer rendering and focus
 * trapping, with a fully transparent backdrop (no dimming — pure System 7).
 *
 * Open it with `show()` (or set the `open` attribute/property); close with
 * `close()`. Escape closes it and fires `vf-close` with
 * `{ reason: 'escape' }`; programmatic closing fires `{ reason: 'close' }`.
 *
 * @slot - Default slot: dialog body content.
 * @csspart frame - The outer chrome frame.
 * @csspart title-bar - The striped title bar.
 * @csspart title - The centered title patch.
 * @csspart body - The white content area.
 * @fires vf-close - Dialog closed. Detail `{ reason: 'escape' | 'close' }`.
 */
@customElement('vf-dialog')
export class VfDialog extends LitElement {
  static override styles = [
    vfBase,
    vfStripes,
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
        background: var(--vf-white, #ffffff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        box-shadow: calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px))
          calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px)) 0 0
          var(--vf-black, #000000);
      }
      .title-bar {
        position: relative;
        height: calc(var(--vf-scale, 1) * var(--vf-titlebar-height, 22px));
        border-bottom: calc(var(--vf-scale, 1) * 1px) solid
          var(--vf-black, #000000);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
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
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Whether the dialog is open. Kept in sync with the native `<dialog>`. */
  @property({ type: Boolean, reflect: true }) open = false

  /** Title text shown centered in the title bar. */
  @property() heading = ''

  @query('dialog') private _dialog!: HTMLDialogElement

  /** Close reason pending for the next native `close` event. */
  private _closeReason: 'escape' | 'close' | null = null

  /** Open the dialog modally (native `showModal()`). */
  show(): void {
    this.open = true
    if (this.hasUpdated && !this._dialog.open) this._dialog.showModal()
  }

  /** Close the dialog. Fires `vf-close` with `{ reason: 'close' }`. */
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

  protected override render(): unknown {
    return html`
      <dialog
        aria-labelledby="title"
        @cancel=${this._onNativeCancel}
        @close=${this._onNativeClose}
      >
        <div class="frame" part="frame">
          <header class="title-bar" part="title-bar">
            <div class="vf-stripes"></div>
            <span class="title" part="title" id="title">${this.heading}</span>
          </header>
          <div class="body" part="body"><slot></slot></div>
        </div>
      </dialog>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-dialog': VfDialog
  }
}
