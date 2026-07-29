import { css, LitElement } from 'lit'
import type { PropertyValues } from 'lit'
import { property, query } from 'lit/decorators.js'
import {
  ScaleController,
  snapDialogToGrid,
  sysLength,
  unsnapDialog,
} from './scale.js'
import { emit } from './events.js'

/** Reason a modal closed, carried by the `vf-close` event's detail. */
export type VfCloseReason = 'escape' | 'close'

/**
 * The width an undeclared modal falls back to, in system px — a classic
 * dialog's own measure, wide enough for a line of chrome text and a button row.
 * It exists so an unsized modal still renders, and still owns a *definite*
 * width so dragging cannot squeeze it; the console says what to declare.
 */
export const MODAL_FALLBACK_WIDTH = 260

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

  /**
   * Modal width in whole system px — the art's own unit, so the box holds its
   * proportion to the chrome inside it at every display density.
   *
   * **Declare it.** A modal owns its width; it is not a shape its content
   * happens to fall into. The platform's own default is `fit-content` measured
   * against the space *left over* beside the margins — and those margins are
   * how {@link snapDialogToGrid} pins the box and how a movable dialog is
   * dragged, so an undeclared modal squeezes itself and reflows its text as it
   * moves toward an edge. Unset, it falls back to {@link MODAL_FALLBACK_WIDTH}
   * and says so once in the console.
   */
  @property({ type: Number }) width?: number

  /**
   * Modal height in whole system px.
   *
   * **Declare it,** with {@link width}. A modal is a fixed box in both axes —
   * the same rule `vf-window` follows, for the same reason: the classic shells
   * carried both dimensions in the resource, and a box that grows with its body
   * is one whose buttons move under the pointer as its text changes. Unset, the
   * body sizes to its content — the old behavior — and it says so once in the
   * console.
   *
   * Content taller than the declared box is clipped at the frame.
   */
  @property({ type: Number }) height?: number

  @query('dialog') protected _dialog!: HTMLDialogElement

  /**
   * The declared box as inline styles for the subclass's `<dialog>`:
   * `style=${styleMap(this.dialogSize)}`. Width always resolves to something
   * definite — the declaration or the fallback — because that is what keeps a
   * drag from squeezing the box.
   */
  protected get dialogSize(): Record<string, string | null> {
    return {
      width: sysLength(this.width ?? MODAL_FALLBACK_WIDTH),
      height: this.height === undefined ? null : sysLength(this.height),
    }
  }

  /** One warning per element, on the open that first shows an unsized modal. */
  #warnedNoSize = false

  /**
   * Say it once, when an unsized modal is first shown — a hidden one is not
   * yet anybody's problem, and the name in the message is what makes it
   * findable in a page with several.
   *
   * Both dimensions are required, as on `vf-window`, but they fail differently:
   * an undeclared width takes a definite fallback (a squeezing box is worse
   * than a wrong-but-stable one), while an undeclared height just sizes to the
   * content and says so.
   */
  #warnIfUnsized(): void {
    if (this.#warnedNoSize || !this.open) return
    const missing: string[] = []
    if (this.width === undefined) {
      missing.push(`width (falling back to ${MODAL_FALLBACK_WIDTH} system px)`)
    }
    if (this.height === undefined) {
      missing.push('height (falling back to the content)')
    }
    if (missing.length === 0) return
    this.#warnedNoSize = true
    // Read the name off attributes: `heading` and `label` belong to the
    // subclasses, and the base has no business knowing which is which.
    const name = this.getAttribute('heading') ?? this.getAttribute('label') ?? ''
    console.warn(
      `${this.localName}${name ? ` ("${name}")` : ''}: no ` +
        `${missing.join(', no ')}. A modal owns its whole box — declare both ` +
        `in system px: <${this.localName} width="320" height="140">.`
    )
  }

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
    this.#warnIfUnsized()
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
    emit(this, 'vf-close', { reason })
  }
}
