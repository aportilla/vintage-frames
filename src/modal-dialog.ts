import { css, LitElement } from 'lit'
import type { PropertyValues } from 'lit'
import { property, query } from 'lit/decorators.js'
import { ScaleController, snapDialogToGrid, unsnapDialog } from './scale.js'

/** Reason a modal closed, carried by the `vf-close` event's detail. */
export type VfCloseReason = 'escape' | 'close'

/**
 * Shared native-`<dialog>` styles for the modal shells: a chromeless top-layer
 * dialog (the frame is drawn by the subclass) with a fully transparent
 * backdrop — pure System 7, no dimming.
 */
export const modalDialogStyles = css`
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
`

/**
 * Base class for the movable-modal `vf-dialog` and fixed-modal `vf-alert`.
 *
 * Owns the native `<dialog>` lifecycle both share: `open` sync, `show()` /
 * `close()`, the device-grid pin on open, and the single `close` funnel that
 * clears the grid-pinned margins ({@link unsnapDialog}) and fires `vf-close`
 * with the reason. Because every close path — Escape, `close()`, backdrop —
 * routes through the native `close` event, an Escape-close no longer leaves
 * stale margins behind, so the next open re-centers.
 *
 * Subclasses supply only the frame chrome: a `render()` returning
 * `<dialog @cancel=${this._onNativeCancel} @close=${this._onNativeClose}>` with
 * their role/ARIA and body, and {@link modalDialogStyles} in `static styles`.
 *
 * @fires vf-close - The modal closed. `detail: { reason: 'escape' | 'close' }`.
 */
export class VfModalDialog extends LitElement {
  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  protected readonly scale = new ScaleController(this)

  /** Whether the modal is open. Kept in sync with the native `<dialog>`. */
  @property({ type: Boolean, reflect: true }) open = false

  @query('dialog') protected _dialog!: HTMLDialogElement

  /** Close reason pending for the next native `close` event. */
  #closeReason: VfCloseReason | null = null

  /** Open the modal (native `showModal()`), pinned onto the device grid. */
  show(): void {
    this.open = true
    if (this.hasUpdated) this.#syncDialog()
  }

  /** Close the modal. Fires `vf-close` with `{ reason: 'close' }`. */
  close(): void {
    this.open = false
    if (this.hasUpdated) this.#syncDialog()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open')) this.#syncDialog()
  }

  /**
   * Reconcile the native `<dialog>` with `open`. Opening pins the UA's
   * auto-centering onto the device-pixel grid (half-pixel offsets fringe the
   * 1-bit chrome — see scale.ts). Closing just calls `dialog.close()`, routing
   * teardown through the native `close` event so {@link _onNativeClose} is the
   * one place margins are cleared and `vf-close` is fired.
   */
  #syncDialog(): void {
    const dialog = this._dialog
    if (!dialog) return
    if (this.open && !dialog.open) {
      dialog.showModal()
      snapDialogToGrid(dialog)
    } else if (!this.open && dialog.open) {
      dialog.close()
    }
  }

  /** Native `cancel` (Escape): remember the reason; `close` follows. */
  protected _onNativeCancel(): void {
    this.#closeReason = 'escape'
  }

  /**
   * Native `close` — the single teardown funnel for every close path. Clears
   * the grid-pinned margins so the next open re-centers, syncs `open`, and
   * fires `vf-close` with the reason.
   */
  protected _onNativeClose(): void {
    const reason = this.#closeReason ?? 'close'
    this.#closeReason = null
    this.open = false
    unsnapDialog(this._dialog)
    this.dispatchEvent(
      new CustomEvent<{ reason: VfCloseReason }>('vf-close', {
        detail: { reason },
        bubbles: true,
        composed: true,
      })
    )
  }
}
