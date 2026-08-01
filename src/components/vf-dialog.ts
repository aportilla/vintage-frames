import { html, css, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { styleMap } from 'lit/directives/style-map.js'
import {
  vfBase,
  vfStripes,
  vfFocus,
  vfFocusRing,
  vfChromeFrame,
  vfModalFrame,
  vfTitleBar,
  vfWindowWidgets,
  vfDisplayDecls,
  vfScrollbars,
} from '../styles/base.js'
import { snapToSystemPx, sys } from '../scale.js'
import { DragController } from '../drag.js'
import { ScrollStateController } from '../scroll-state.js'
import { chromeTitleBar, widgetLabel, closeBox } from '../chrome.js'
import { VfModalDialog, modalDialogStyles } from '../modal-dialog.js'
import './vf-button-group.js'

/**
 * `<vf-dialog>` — the System 7 modal dialog shell.
 *
 * Two chromes, one modal lifecycle (native `<dialog>` for top-layer rendering
 * and focus trapping, with a fully transparent backdrop — no dimming):
 *
 * - **Default:** a striped title bar with a centered title over a white body —
 *   the movable-modal look. Drag the title bar to move it. `closable` adds the
 *   standard close box (left of the bar) — the HIG's own figures disagree on
 *   whether a movable modal carries one (Figure 5-1 says yes, Figure 6-1 and
 *   the Chapter 6 text say no), so the component enables either reading rather
 *   than enforcing one.
 * - **`frame="plain"`:** the classic dBoxProc modal-dialog frame — 1px outer
 *   border, 2px gap, 2px inner band, no shadow, no title bar — and immovable,
 *   like the original. A `heading` renders as a centered display-face heading
 *   at the top of the body (the reference art's "Dialog title"); `closable` is
 *   ignored, there being no bar to carry the widget.
 *
 * Open it with `show()` (or set the `open` attribute/property); close with
 * `close()`. Escape closes it and fires `vf-close` with
 * `{ reason: 'escape' }`; the close box and programmatic closing fire
 * `{ reason: 'close' }`.
 *
 * @slot - Default slot: dialog body content.
 * @slot buttons - Optional action buttons. Rendered as a bottom-right
 *   `vf-button-group` (equal-width, faces aligned); the footer only takes
 *   space when the slot is populated.
 * @csspart frame - The outer chrome frame (striped-bar or plain).
 * @csspart title-bar - The striped title bar (default chrome only).
 * @csspart title - The centered title patch (or the plain-frame heading).
 * @csspart close-box - The close widget (`closable`, default chrome only).
 * @csspart body - The white content area.
 * @csspart content - The scrolling region inside the body (heading + slotted
 *   content, not the footer). Inert while the content fits; over-stuffed, it
 *   scrolls under a System 7 rail and becomes a keyboard stop.
 * @csspart footer - The action row wrapping the buttons.
 * @csspart buttons - The button group inside the footer.
 * @fires vf-close - Dialog closed. Detail `{ reason: 'escape' | 'close' }`.
 * @cssprop --vf-dots-pattern - the windoid bar's dot-grid dither — a 2×2 tile,
 *   one black pixel at the origin (`vfDots`; override the whole pattern like
 *   `--vf-desktop-pattern`)
 * @cssprop --vf-titlebar-height - window/dialog title bars
 */
@vfElement('vf-dialog')
export class VfDialog extends VfModalDialog {
  static override styles = [
    vfBase,
    vfStripes,
    vfFocus,
    vfChromeFrame,
    vfModalFrame,
    vfTitleBar,
    vfWindowWidgets,
    vfScrollbars,
    modalDialogStyles,
    css`
      :host {
        display: contents;
      }
      /* A declared height lands on the <dialog> (dialogSize), so the frame has
         to be told to fill it — vfChromeFrame is skin only. Both chromes are
         full-height flex columns for the same reason vf-window's is: the body
         takes the slack the title bar doesn't. The frame is the flex child of
         the <dialog> itself (modalDialogStyles), not a height: 100% block —
         a percentage can't resolve against the undeclared-height dialog that
         only the UA's dialog:modal max-height caps, and that spill was
         exactly how a tall modal used to strand its buttons off-screen. */
      .vf-frame,
      .vf-modal-frame {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
      }
      .vf-modal-frame-inner {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
      }
      /* The bar is always a drag handle here (a movable modal has no immovable
         state, unlike vf-window's [movable]); keep touch gestures from
         scrolling the page instead of moving the dialog. */
      .vf-title-bar {
        touch-action: none;
      }
      /* Close box clearance: the same 60px vf-window uses, so an ellipsized
         title can't run under the widget (the title is centered, so the inset
         has to cover both sides). */
      :host([closable]) .vf-title {
        --vf-title-inset: 60px;
      }
      /* Takes the slack under the title bar. A modal is a fixed box — the
         frame never grows with its body — but content taller than the box is
         no longer silently clipped: the .content region below scrolls it
         under a System 7 rail, with the footer pinned outside the scroll so
         the action buttons stay reachable. overflow: hidden stays as the
         frame-level backstop. A slotted vf-select's list still escapes: it is
         position:fixed off the control's own rect (see vf-select.ts). */
      .body {
        --vf-surface: var(--vf-white, #ffffff);
        background: var(--vf-white, #ffffff);
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
        padding: calc(var(--vf-scale, 1) * 16px);
      }
      /* The scroll region's positioned wrapper (the .vf-scroll-frame overlay
         insets against it). Shrink-only (flex-grow 0): with slack in the box
         the footer sits right after the content, exactly where block flow put
         it before this wrapper existed — the wrap only gives height back when
         the content doesn't fit. */
      .content-wrap {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 0 1 auto;
        min-height: 0;
      }
      .content {
        flex: 0 1 auto;
        min-height: 0;
        overflow-y: auto;
      }
      /* Only while genuinely over-stuffed (ScrollStateController's measured
         signal): reserve the real 16px channel — modern Chromium draws a
         zero-width overlay bar for a styled ::-webkit-scrollbar otherwise —
         and box the rail with the recipe's frame overlay, which also draws
         the bar's outer line. While the content fits, none of this matches
         and the body renders exactly as it always has. */
      .content[data-overflow-y='true'] {
        overflow-y: scroll;
        scrollbar-gutter: stable;
      }
      .content-wrap .vf-scroll-frame {
        display: none;
      }
      .content[data-overflow-y='true'] + .vf-scroll-frame {
        display: block;
      }
      /* A scrollable region is a keyboard stop (tabindex in the template);
         mark it with the kit's dotted ring, inset to stay in-box — the same
         treatment as vf-scroll-area's viewport. */
      .content:focus-visible {
        --vf-focus-offset: -2px;
        ${vfFocusRing}
      }
      /* The plain frame's heading: centered chrome type at the top of the
         body, the way dBoxProc dialogs drew their title in content (see
         Windows/modal dialog.png). No patch, no ellipsis — it's body-top
         text, not a bar. */
      .plain-heading {
        ${vfDisplayDecls}
        display: block;
        text-align: center;
        margin-bottom: calc(var(--vf-scale, 1) * 16px);
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
   * open re-centers. Inert with `frame="plain"` — no bar is rendered, so no
   * pointer ever reaches the controller (dBoxProc dialogs don't move).
   */
  private readonly _drag = new DragController(this, {
    onDragStart: (event: PointerEvent): { x: number; y: number } | null => {
      if (event.button !== 0) return null
      // Ignore drags that start on the close widget (same guard as vf-window).
      if (
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof HTMLElement && node.classList.contains('box')
          )
      ) {
        return null
      }
      const dialog = this._dialog
      if (!dialog?.open) return null
      // Seed from the grid-pinned margins written on open; fall back to the
      // live rect if a drag somehow precedes the pin.
      let x = parseFloat(dialog.style.marginLeft)
      let y = parseFloat(dialog.style.marginTop)
      if (Number.isNaN(x) || Number.isNaN(y)) {
        const rect = dialog.getBoundingClientRect()
        x = snapToSystemPx(rect.left, this)
        y = snapToSystemPx(rect.top, this)
      }
      return { x, y }
    },
    onDrag: (x: number, y: number): void => {
      const dialog = this._dialog
      if (!dialog) return
      // Keep a grabbable strip on-screen, as vf-window does against its
      // positioning parent — the dialog's is the viewport. With a declared
      // width nothing else stops a drag at an edge; the box used to run out of
      // room and squeeze itself instead of moving.
      // Re-snap after clamping so the clamped edge still lands on the grid.
      const keep = sys(24, this)
      const nx = Math.min(Math.max(x, keep - dialog.offsetWidth), window.innerWidth - keep)
      const ny = Math.min(Math.max(y, 0), Math.max(0, window.innerHeight - keep))
      dialog.style.marginLeft = `${snapToSystemPx(nx, this)}px`
      dialog.style.marginTop = `${snapToSystemPx(ny, this)}px`
    },
  })

  /** Title text: the bar's centered patch, or the plain frame's heading. */
  @property() heading = ''

  /**
   * Accessible name for the dialog (`aria-label`), for a dialog with no
   * `heading` — an untitled title bar has no text to be named by. Ignored when
   * empty and a `heading` is set (the title patch names the dialog then);
   * defaults to `'Dialog'` when neither is given. Mirrors vf-alert's `label`.
   */
  @property() label = ''

  /**
   * Show the close box (left side of the title bar). Off by default — the
   * bare movable-modal bar. Ignored with `frame="plain"` (no bar). Clicking
   * it closes the dialog and fires `vf-close` with `{ reason: 'close' }`.
   */
  @property({ type: Boolean, reflect: true }) closable = false

  /**
   * Frame chrome. Omit for the striped title bar (movable modal); `'plain'`
   * for the immovable dBoxProc double frame with no bar (modal dialog box).
   */
  @property({ reflect: true }) frame?: 'plain'

  /** Whether the `buttons` slot has assigned content (drives the footer). */
  @state() private _hasButtons = false

  @query('.content') private _content!: HTMLElement | null

  /** Whether the body content overflows its box (drives the content stop). */
  @state() private _scrollable = false

  /**
   * Activates the System 7 rail — and the content region's keyboard stop —
   * once the body content overflows the declared (or viewport-capped) box.
   */
  private readonly _scrollState = new ScrollStateController(
    this,
    () => this._content,
    undefined,
    (overflow) => {
      this._scrollable = overflow.y
    }
  )

  /** Content changed under the fixed box — re-measure the overflow. */
  private _onBodySlotChange(): void {
    this._scrollState.measure()
  }

  private _onCloseClick(): void {
    this.close()
  }

  protected override render(): unknown {
    // A titled dialog is named by its own title patch (or, on the plain
    // frame, its body-top heading — both carry id="title"). An untitled one
    // has nothing to point at — aria-labelledby would resolve to an empty
    // node and leave the dialog with no accessible name at all — so it names
    // itself with aria-label instead, the way vf-alert (which never has a
    // title bar) does.
    const titled = !this.label && this.heading !== ''
    const plain = this.frame === 'plain'
    const body = html`
      <div class="body" part="body">
        <div class="content-wrap">
          <div
            class="content vf-scroll"
            part="content"
            tabindex=${this._scrollable ? '0' : nothing}
            role=${this._scrollable ? 'group' : nothing}
          >
            ${plain && this.heading !== ''
              ? html`<span class="plain-heading" part="title" id="title"
                  >${this.heading}</span
                >`
              : nothing}
            <slot @slotchange=${this._onBodySlotChange}></slot>
          </div>
          <div class="vf-scroll-frame" aria-hidden="true"></div>
        </div>
        <div class="footer ${this._hasButtons ? '' : 'empty'}" part="footer">
          <vf-button-group class="buttons" part="buttons">
            <slot
              name="buttons"
              @slotchange=${this._onButtonsSlotChange}
            ></slot>
          </vf-button-group>
        </div>
      </div>
    `
    return html`
      <dialog
        style=${styleMap(this.dialogSize)}
        aria-labelledby=${titled ? 'title' : nothing}
        aria-label=${titled ? nothing : this.label || 'Dialog'}
        @cancel=${this._onNativeCancel}
        @close=${this._onNativeClose}
      >
        ${plain
          ? html`
              <div class="vf-modal-frame" part="frame">
                <div class="vf-modal-frame-inner">${body}</div>
              </div>
            `
          : html`
              <div class="vf-frame" part="frame">
                ${chromeTitleBar(
                  this._drag,
                  html`
                    ${this.closable
                      ? closeBox(
                          widgetLabel('Close', this.heading),
                          this._onCloseClick
                        )
                      : nothing}
                    <span class="vf-title" part="title" id="title"
                      >${this.heading}</span
                    >
                  `
                )}
                ${body}
              </div>
            `}
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
