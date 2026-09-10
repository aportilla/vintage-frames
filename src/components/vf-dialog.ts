import { html, css, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { styleMap } from 'lit/directives/style-map.js'
import {
  vfBase,
  vfStripes,
  vfFocus,
  vfFocusRing,
  vfModalFrame,
  vfTitleBar,
  vfWindowWidgets,
  vfScrollRail,
} from '../styles/base.js'
import { snapSys, toSysExact } from '../scale.js'
import { DragController } from '../drag.js'
import { ScrollStateController } from '../scroll-state.js'
import { ScrollRailController, renderScrollRail } from '../scroll-rail.js'
import {
  chromeTitleBar,
  TitleCenterController,
  widgetLabel,
  closeBox,
} from '../chrome.js'
import { VfModalDialog, modalDialogStyles } from '../modal-dialog.js'

/**
 * `<vf-dialog>` — the System 7 modal dialog shell.
 *
 * Two chromes, one modal lifecycle (native `<dialog>` for top-layer rendering
 * and focus trapping, with a fully transparent backdrop — no dimming). Both
 * are the same dBoxProc double frame — 1px outer rule, 2px gap, 2px inner
 * band, no shadow ({@link vfModalFrame}):
 *
 * - **Default:** the movable modal (movableDBoxProc) — the striped title bar
 *   set into the top of that frame, with a centered title over a white body.
 *   Drag the title bar to move it. `closable` adds the standard close box
 *   (left of the bar) — the HIG's own figures disagree on whether a movable
 *   modal carries one (Figure 5-1 says yes, Figure 6-1 and the Chapter 6 text
 *   say no), so the component enables either reading rather than enforcing
 *   one.
 * - **`frame="plain"`:** the modal dialog box — the bare frame, no title bar —
 *   and immovable, like the original. With no bar, `heading` only names the
 *   dialog and `closable` is ignored.
 *
 * Open it with `show()` (or set the `open` attribute/property); close with
 * `close()`. Escape closes it and fires `vf-close` with
 * `{ reason: 'escape' }`; the close box and programmatic closing fire
 * `{ reason: 'close' }`. With `light-dismiss`, a click outside the frame
 * closes it too, with `{ reason: 'outside' }` — for the About box; off by
 * default, since the classic modal ignored an outside click.
 *
 * Keyboard, the classic Dialog Manager's two rules ({@link VfModalDialog}):
 * on open, focus goes to the first text-entry control — a slotted control
 * with `autofocus` first — or, with none, to the default button
 * (`vf-button variant="default"`). Return or Enter activates the default
 * button from anywhere in the dialog, a focused Cancel included; Space
 * presses the focused control. A link keeps its own Enter, and in a
 * multi-line editor Return inserts the newline while the keypad's Enter
 * activates the button.
 *
 * Slotted children placed with `top`/`left` measure from the content region's
 * corner — the frame's inner edge, below the title bar — and flow content
 * starts at the same corner.
 *
 * @slot - Default slot: the dialog's content.
 * @csspart frame - The outer frame (the double frame's 1px rule; the bar and
 *   the inner band sit inside it).
 * @csspart title-bar - The striped title bar (default chrome only).
 * @csspart title - The centered title patch (default chrome only).
 * @csspart close-box - The close widget (`closable`, default chrome only).
 * @csspart body - The white content region.
 * @csspart content - The scrolling region inside the body (the slotted
 *   content). Inert while the content fits; over-stuffed, it scrolls under a
 *   System 7 rail and becomes a keyboard stop.
 * @fires vf-close - Dialog closed. Detail `{ reason: 'escape' | 'close' |
 *   'outside' }` — `'outside'` only under `light-dismiss`.
 * @cssprop --vf-dots-pattern - the windoid bar's dot-grid dither — a 2×2 tile,
 *   one black pixel at the origin (`vfDots`; override the whole pattern like
 *   `--vf-desktop-pattern`)
 * @cssprop --vf-titlebar-height - window/dialog title bars
 * @cssprop --vf-scrollbar-thumb - scrollbar thumb/elevator (white)
 * @cssprop --vf-scrollbar-track - the scroll trough's base color under the
 *   dot-dither (white)
 */
@vfElement('vf-dialog')
export class VfDialog extends VfModalDialog {
  static override styles = [
    vfBase,
    vfStripes,
    vfFocus,
    vfModalFrame,
    vfTitleBar,
    vfWindowWidgets,
    vfScrollRail,
    modalDialogStyles,
    css`
      :host {
        display: contents;
      }
      /* A declared height lands on the <dialog> (dialogSize), so the frame has
         to be told to fill it — vfModalFrame is skin only. The frame is a
         full-height flex column for the same reason vf-window's is: the body
         takes the slack the title bar doesn't. The frame is the flex child of
         the <dialog> itself (modalDialogStyles), not a height: 100% block —
         a percentage can't resolve against the undeclared-height dialog that
         only the UA's dialog:modal max-height caps, and that spill was
         exactly how a tall modal used to strand its buttons off-screen. */
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
      /* The content region: takes the slack under the title bar, and is the
         positioning anchor for slotted children placed with top/left
         (src/position.ts) — coordinates measure from the frame's inner edge,
         exactly the DITL convention. No inset of its own: flow content starts
         at the same corner a placed child does. A modal is a fixed box — the
         frame never grows with its body — but flow content taller than the
         box is not silently clipped: the .content region below scrolls it
         under a System 7 rail. Placed children anchor here, outside that
         scroller, so they hold still while it scrolls. overflow: hidden stays
         as the frame-level backstop. A slotted vf-select's list still
         escapes: it is position:fixed off the control's own rect (see
         vf-select.ts). */
      .body {
        --vf-surface: var(--vf-white, #ffffff);
        background: var(--vf-white, #ffffff);
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      }
      /* hidden, not auto, until the controller says otherwise — the two have
         to agree on what "overflowing" means or the dialog scrolls without a
         rail.
         ScrollStateController deliberately ignores the body face's negative
         half-leading (LEADING_SPILL_SYS, scroll-state.ts): vf-paragraph sets
         Geneva's 12-system-px line box under a 16-system-px em, so the inline
         box spills 2 inkless system px past the block box and scrollHeight
         counts it. auto doesn't know that — it saw 6 CSS px of overflow at
         scale 3 and handed the user a fixed info dialog that rubber-banded
         under the wheel with no scrollbar to explain it.
         hidden still scrolls programmatically (scrollIntoView on a focused
         control keeps working); it just refuses to invent a user-facing scroll
         the component has decided doesn't exist. */
      .content {
        flex: 0 1 auto;
        min-height: 0;
        overflow-y: hidden;
      }
      /* Only while genuinely over-stuffed (ScrollStateController's measured
         signal) does the region scroll — reserving the rail's 15px as its
         own padding — and only then does the rail appear. While the content
         fits, none of this matches. */
      .content[data-overflow-y='true'] {
        overflow-y: scroll;
        padding-right: calc(var(--vf-scale, 1) * 15px);
      }
      /* The rail rides the body as an OVERLAY pinned to its right edge, flush
         against the frame's inner band — the band is the classic 16px cell's
         outer line on three sides; the fourth is the rail's own divider —
         deliberately out of the layout flow: a rail column's two fixed 15px
         arrow cells would hand the region a 32px minimum height, and a short
         dialog would then measure as fitting with the rail shown and
         overflowing without it, flip-flopping forever. An overlay cannot move
         the box; the channel the content pays for is the padding above.
         Hidden until the region actually scrolls. */
      .body > .vf-rail {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        display: none;
      }
      .content[data-overflow-y='true'] ~ .vf-rail {
        display: grid;
      }
      /* A scrollable region is a keyboard stop (tabindex in the template);
         mark it with the kit's dotted ring, inset to stay in-box — the same
         treatment as vf-scroll-area's viewport. */
      .content:focus-visible {
        --vf-focus-offset: -2px;
        ${vfFocusRing}
      }
    `,
  ]

  /**
   * Title-bar drag-to-move (shared with `vf-window` via {@link DragController}).
   * The gesture states the modal's `top`/`left` in system px — viewport
   * coordinates, since `showModal()` puts the box in the top layer — so a
   * dragged dialog is placed exactly the way an authored one is, and holds its
   * spot through a zoom rather than being re-centered by it. Inert with
   * `frame="plain"` — no bar is rendered, so no pointer ever reaches the
   * controller (dBoxProc dialogs don't move).
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
      // The origin stated on open — or, if a drag somehow precedes it, the
      // live rect, which is where the UA's own centering put the box.
      if (this.left != null || this.top != null) {
        return { x: this.left ?? 0, y: this.top ?? 0 }
      }
      const rect = dialog.getBoundingClientRect()
      return {
        x: snapSys(toSysExact(rect.left, this), this),
        y: snapSys(toSysExact(rect.top, this), this),
      }
    },
    onDrag: (x: number, y: number): void => this.placeAt(x, y),
  })

  /** Holds the centered title patch on the placement lattice (src/chrome.ts). */
  private readonly _titleCenter = new TitleCenterController(this)

  /**
   * Title text: the bar's centered patch, and the dialog's accessible name.
   * With `frame="plain"`, which has no bar, it only names the dialog.
   */
  @property() heading = ''

  /**
   * Accessible name for the dialog (`aria-label`), for a dialog with no
   * `heading` — an untitled title bar has no text to be named by. Ignored when
   * empty and a `heading` is set (the heading names the dialog then);
   * defaults to `'Dialog'` when neither is given.
   */
  @property() label = ''

  /**
   * Show the close box (left side of the title bar). Off by default — the
   * bare movable-modal bar. Ignored with `frame="plain"` (no bar). Clicking
   * it closes the dialog and fires `vf-close` with `{ reason: 'close' }`.
   */
  @property({ type: Boolean, reflect: true }) closable = false

  /**
   * Frame chrome. Omit for the movable modal (the double frame with the
   * striped title bar set into it); `'plain'` for the immovable modal dialog
   * box (the bare double frame, no bar).
   */
  @property({ reflect: true }) frame?: 'plain'

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

  /** Syncs the drawn rail to the content region and drives its interactions. */
  private readonly _rail = new ScrollRailController(this, {
    getScroll: () => this._content,
  })

  /** Content changed under the fixed box — re-measure the overflow. */
  private _onBodySlotChange(): void {
    this._scrollState.measure()
    this._rail.sync()
  }

  private _onCloseClick(): void {
    this.close()
  }

  protected override render(): unknown {
    // A titled default-chrome dialog is named by its own title patch
    // (id="title"). Anything else has no patch to point at — aria-labelledby
    // would resolve to an empty node and leave the dialog with no accessible
    // name at all — so it names itself with aria-label: the label, else the
    // heading (a plain frame's), else 'Dialog'.
    const plain = this.frame === 'plain'
    const titled = !plain && !this.label && this.heading !== ''
    const body = html`
      <div class="body" part="body">
        <div
          class="content vf-scroll"
          part="content"
          tabindex=${this._scrollable ? '0' : nothing}
          role=${this._scrollable ? 'group' : nothing}
        >
          <slot @slotchange=${this._onBodySlotChange}></slot>
        </div>
        ${renderScrollRail(this._rail, 'vertical')}
      </div>
    `
    return html`
      <dialog
        style=${styleMap(this.dialogSize)}
        aria-labelledby=${titled ? 'title' : nothing}
        aria-label=${titled ? nothing : this.label || this.heading || 'Dialog'}
        @cancel=${this._onNativeCancel}
        @close=${this._onNativeClose}
      >
        <div class="vf-modal-frame" part="frame">
          ${plain
            ? nothing
            : chromeTitleBar(
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
          <div class="vf-modal-frame-inner">${body}</div>
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
