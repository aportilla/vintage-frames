import { html, css, LitElement, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { PlacementController, VfPositioned } from '../position.js'
import { VfSized } from '../size.js'
import {
  vfBase,
  vfStripes,
  vfDots,
  vfFocus,
  vfChromeFrame,
  vfTitleBar,
  vfWindowWidgets,
} from '../styles/base.js'
import { ScaleController, snapSys, toSysExact } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { DragController } from '../drag.js'
import { chromeTitleBar, widgetLabel, closeBox, zoomBox } from '../chrome.js'
import { emit } from '../events.js'
import './vf-scroll-area.js'

interface ResizeState {
  pointerId: number
  /** Press point, in CSS px — the unit pointer events speak. */
  startX: number
  startY: number
  /** The box at press time, in SYSTEM px — the unit the size is stored in. */
  baseWidth: number
  baseHeight: number
}

/** Grow-box floors, in system px: a window smaller than this can't be worked. */
const MIN_WIDTH = 80
const MIN_HEIGHT = 54

/**
 * How much of a dragged window must stay inside its parent, in system px —
 * enough of the title bar to grab it back by.
 */
const KEEP_GRABBABLE = 24

/**
 * `<vf-window>` — the System 7 desktop-window shell.
 *
 * Striped title bar with optional close box (left) and zoom box (right), a
 * solid-white frame with a hard offset shadow, an optional grow box for
 * resizing, optional edge scroll rails (`scrollbars`), and the slim windoid
 * chrome (`variant="utility"`). The HIG's window archetypes are parameter
 * recipes over this shell rather than fixed anatomies — the component enables
 * HIG compliance, it doesn't enforce it (see README "window archetypes"):
 * the full document window is `closable zoomable movable resizable
 * scrollbars="both"`, a modeless dialog box is `closable movable`, a utility
 * window is `variant="utility" movable`. Place inside `<vf-desktop>` to get
 * click-to-front stacking and automatic `active` management (utility windows
 * float above the document tier).
 *
 * Every recipe also declares `width` AND `height` ({@link VfSized}), in whole
 * system px — the art's own unit, so the window keeps its proportions to the
 * chrome inside it at every display density (a CSS-px size stays put while
 * the components in it triple). A window is a fixed box in both axes, the way
 * the WIND resource carried it: left to layout it takes whatever its
 * container or content hands it, which is how a title bar ends up wider than
 * the screen or a dialog reflows as it moves — and a window that grows with
 * its body is one the user can neither predict nor (via the grow box) own.
 * Content taller than the declared box is clipped at the frame the way the
 * classic content region was; `scrollbars` lets the user reach the rest.
 * Unset, the window still renders — normal block layout, as before — and
 * says so once in the console.
 *
 * @slot - Default slot: window body content.
 * @csspart frame - The outer chrome frame.
 * @csspart title-bar - The striped (or dithered) title bar.
 * @csspart title - The centered title patch (hidden on the utility bar).
 * @csspart close-box - The close widget (left).
 * @csspart zoom-box - The zoom widget (right).
 * @csspart body - The content area.
 * @csspart grow-box - The resize widget (bottom-right, when `resizable`).
 * @csspart viewport - The built-in scroll area's viewport (when `scrollbars`;
 *   re-exported from vf-scroll-area).
 * @fires vf-close - Close box clicked. Detail `{ reason: 'close' }` (shape-
 *   compatible with vf-dialog's `vf-close`). The window does NOT
 *   remove itself; the consumer decides what closing means.
 * @fires vf-zoom - Zoom box clicked. Detail `{}`.
 * @cssprop --vf-dots-pattern - the windoid bar's dot-grid dither — a 2×2 tile,
 *   one black pixel at the origin (`vfDots`; override the whole pattern like
 *   `--vf-desktop-pattern`)
 * @cssprop --vf-titlebar-height - window/dialog title bars
 * @cssprop [--vf-titlebar-height-utility=12px] - the slim
 *   `vf-window[variant="utility"]` (windoid) bar — 11px interior + 1px bottom
 *   rule, traced from `Windows/utility-window.png`
 */
@vfElement('vf-window')
export class VfWindow extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    vfStripes,
    vfDots,
    vfFocus,
    vfChromeFrame,
    vfTitleBar,
    vfWindowWidgets,
    css`
      :host {
        display: block;
        position: relative;
        --vf-surface: var(--vf-white, #ffffff);
      }
      /* Skin from vfChromeFrame; the layout is the window's own — a full-size
         flex column so the body takes the slack the title bar and grow box
         don't. */
      .vf-frame {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }

      /* --- Title bar ------------------------------------------------- */
      /* Clearance for the close/zoom widgets either side of the title patch:
         8px offset + an 11px box + its 1px white patch ring, doubled, rounded
         up to the classic 30-per-side. Not a theming knob — it's the widgets'
         own geometry — so it's set on the element, like --vf-focus-offset. */
      .vf-title {
        --vf-title-inset: 60px;
      }
      :host([movable]) .vf-title-bar {
        touch-action: none;
      }
      :host(:not([active])) .vf-stripes,
      :host(:not([active])) .vf-dots {
        display: none;
      }
      /* Inactive window: the stripes go away and the widgets stop being
         drawn (see the widget rule below — they keep their tab stops), but
         the title text stays black — classic System 7 never grayed the
         title. */

      /* --- Window widgets (close / zoom boxes) ----------------------- */
      /* Skin from vfWindowWidgets (shared with vf-dialog); only the
         host-state rule is the window's own — a dialog has no inactive
         state, so blanking widgets with the stripes lives here.

         Blanked with transparent ink, NOT display/visibility: System 7 drew
         an inactive bar bare, and this reproduces exactly that — but the
         controls stay in the tree and the tab order, a modern affordance the
         kit adds (SPEC §1). A background window whose body holds nothing
         focusable (a static About window, the modeless-dialog recipe, a
         palette of labels) is otherwise unreachable by keyboard entirely:
         Tab must be able to land on "Close Bravo" so vf-desktop's focusin
         raise can activate the window — which repaints the widgets under
         the focus that just arrived. It also means deactivation never yanks
         a focused widget out of the tree, so focus can't be dropped to
         <body> by a click on another window. */
      :host(:not([active])) .box {
        border-color: transparent;
        background-color: transparent;
        box-shadow: none;
      }
      :host(:not([active])) .zoom::after {
        border-color: transparent;
      }

      /* --- Utility (windoid) variant --------------------------------- */
      /* The slim floating-window bar, traced from Windows/utility-window.png
         (npm run extract:windows): 11px interior over the 1px rule
         (--vf-titlebar-height-utility: 12px), the vf-dots dither instead of
         stripes, and 7×7 widgets at left:7px / right:8px — the art really is
         asymmetric by that pixel. No title patch: the bar is two system px
         shorter than the display face's line box, so the heading feeds the
         widget labels instead (a consumer retheming a taller bar can re-show
         it through ::part(title)). */
      :host([variant='utility']) .vf-title-bar {
        height: calc(
          var(--vf-scale, 1) * var(--vf-titlebar-height-utility, 12px)
        );
      }
      :host([variant='utility']) .vf-title {
        display: none;
      }
      :host([variant='utility']) .box {
        /* 7×7 box with 2px of clear white above and below (bar interior is
           11px: 2 + 7 + 2). The patch ring stays 2px here where the striped
           bar's is 1px: the windoid sheet deliberately clears two px of
           dither beside its widgets — the flush dot grid lands a dot in the
           column adjacent to the box, and the art blanks it (npm run
           extract:windows). A custom property rather than box-shadow so the
           inactive blanking rule above still wins the cascade. */
        --vf-widget-ring: 2px;
        top: calc(var(--vf-scale, 1) * 2px);
        width: calc(var(--vf-scale, 1) * 7px);
        height: calc(var(--vf-scale, 1) * 7px);
      }
      :host([variant='utility']) .close {
        left: calc(var(--vf-scale, 1) * 7px);
      }
      :host([variant='utility']) .zoom {
        right: calc(var(--vf-scale, 1) * 8px);
      }
      /* Pressed windoid widget: the whole box inverts — black interior under
         a white (invisible, over the patch ring) borderline — rather than the
         big bar's 9×9 sunburst, which cannot land whole on a 5×5 interior. */
      :host([variant='utility']) .box:active {
        border-color: var(--vf-white, #ffffff);
        background-color: var(--vf-black, #000000);
        background-image: none;
      }
      /* The nested zoom square, miniaturized: right/bottom edges land at
         sprite col/row 3 of the 7×7 box (padding col/row 2). */
      :host([variant='utility']) .zoom::after {
        width: calc(var(--vf-scale, 1) * 3px);
        height: calc(var(--vf-scale, 1) * 3px);
      }

      /* --- Body ------------------------------------------------------ */
      /* Clipped at the frame, the way the classic content region was: the
         window is a fixed box (width and height are both declared), so content
         taller than it is content the user reaches with the scrollbars
         parameter, not something that paints out over the desktop.

         What this deliberately does NOT clip is a control's drop-open panel.
         vf-select's list is position:fixed, computed from the control's rect,
         precisely so it escapes clipping ancestors (see vf-select.ts) — and it
         still escapes this one, because nothing between it and the viewport
         establishes a containing block for fixed descendants: the grid-snap
         correction is a position:relative left/top offset, never a transform
         (see grid-snap.ts, "Why an offset and not a transform"). So a popup
         opening near the bottom edge still runs past the window border, as it
         should. A vf-menu panel is anchored position:absolute and would clip —
         but a menu bar belongs to the desktop, not inside a window body. */
      .body {
        /* The positioning anchor for slotted children placed with top/left
           (src/position.ts): coordinates measure from the content region's
           corner — the frame's inner edge, below the title bar — exactly the
           DITL convention. CSS anchors absolute children at the padding box,
           so the 12px inset below governs flow content only. */
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
        padding: calc(var(--vf-scale, 1) * 12px);
      }
      :host([flush]) .body,
      :host([scrollbars]) .body {
        padding: 0;
      }
      /* The edge-rail composition pulls the scroll area one system px OUT of
         the body on every side so its frame overlay repaints the window's
         border (see .edge-scroll below) — clipping the body would shave
         exactly that overhang off. The scroll area does its own clipping. */
      :host([scrollbars]) .body {
        overflow: visible;
      }

      /* --- Edge scroll rails (scrollbars) ----------------------------- */
      /* The TeachText composition (SPEC §5 vf-scroll-area), internalized:
         the built-in scroll area is pulled one system pixel under the window
         frame on every side, so its own frame overlay repaints the window's
         border lines exactly (no doubled frame), the rails run edge to edge,
         and a resizable window's grow box (z-index 1) lands in the scrollbar
         corner cell. The scrollbar anchors ride the window's whole-pixel box;
         drag and grow keep it on coordinates the engine's scrollbar rects can
         hold (see snapSys). */
      .edge-scroll {
        width: calc(100% + var(--vf-scale, 1) * 2px);
        height: calc(100% + var(--vf-scale, 1) * 2px);
        margin: calc(var(--vf-scale, 1) * -1px);
      }

      /* --- Grow box --------------------------------------------------- */
      .grow {
        position: absolute;
        right: 0;
        bottom: 0;
        z-index: 1;
        width: calc(var(--vf-scale, 1) * 15px);
        height: calc(var(--vf-scale, 1) * 15px);
        border-top: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        border-left: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        background: var(--vf-white, #ffffff);
        touch-action: none;
        cursor: var(--vf-cursor, default);
      }
      .grow::before {
        content: '';
        position: absolute;
        right: calc(var(--vf-scale, 1) * 2px);
        bottom: calc(var(--vf-scale, 1) * 2px);
        width: calc(var(--vf-scale, 1) * 9px);
        height: calc(var(--vf-scale, 1) * 9px);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
      }
      .grow::after {
        content: '';
        position: absolute;
        top: calc(var(--vf-scale, 1) * 2px);
        left: calc(var(--vf-scale, 1) * 2px);
        width: calc(var(--vf-scale, 1) * 7px);
        height: calc(var(--vf-scale, 1) * 7px);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        background: var(--vf-white, #ffffff);
      }
      /* Inactive window: the size box empties with the scroll rails (the same
         HIG no-interactive-UX treatment ScrollStateController drives for the
         bars) — its cell and borders stay, the nested squares go. */
      :host(:not([active])) .grow::before,
      :host(:not([active])) .grow::after {
        display: none;
      }
    `,
  ]

  /**
   * Chrome variant. Omit for the standard 18px striped bar; `'utility'` for
   * the slim windoid bar (dot-grid dither, 7×7 widgets, no title patch — the
   * heading still names the widgets). Inside a `vf-desktop`, utility windows
   * float above the document tier and never take the single-active state.
   */
  @property({ reflect: true }) variant?: 'utility'

  /** Title text shown centered in the title bar. */
  @property() heading = ''

  // `width`/`height` come from VfSized — declare BOTH; see the class doc.

  /**
   * Whether this is the frontmost (active) window: stripes and widgets show.
   * Managed automatically by an enclosing `vf-desktop`.
   */
  @property({ type: Boolean, reflect: true }) active = true

  /** Show the close box (left side of the title bar). */
  @property({ type: Boolean, reflect: true }) closable = true

  /** Show the zoom box (right side of the title bar). */
  @property({ type: Boolean, reflect: true }) zoomable = false

  /** Allow dragging the window by its title bar. */
  @property({ type: Boolean, reflect: true }) movable = false

  /** Show a grow box at the bottom-right corner for resizing. */
  @property({ type: Boolean, reflect: true }) resizable = false

  /** Remove the default 12px body padding. */
  @property({ type: Boolean, reflect: true }) flush = false

  /**
   * Put System 7 scroll rails on the window edge — the classic document
   * window. The body slot renders inside a built-in `vf-scroll-area` pulled
   * one system pixel under the frame on every side, so the rails repaint the
   * border lines and a `resizable` window's grow box lands in the corner
   * cell. Values mirror `vf-scroll-area`'s `axis`; the `heading` names the
   * scroll region; the viewport part is re-exported. Implies `flush` (the
   * viewport carries its own padding). The slotted composition (SPEC §5
   * vf-scroll-area) still works for windows that want an inset well instead.
   */
  @property({ reflect: true }) scrollbars?: 'vertical' | 'horizontal' | 'both'

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * Where a dragged window is allowed to end up, in system px: clamped against
   * the positioning parent (the desktop, usually) so it can't be pushed fully
   * past an edge and lost. Only a grabbable strip has to stay in — a window
   * pushed mostly off-screen is a thing System 7 let you do.
   */
  #keepGrabbable = (x: number, y: number): { x: number; y: number } => {
    const parent = this.offsetParent as HTMLElement | null
    const pw = toSysExact(parent?.clientWidth ?? window.innerWidth, this)
    const ph = toSysExact(parent?.clientHeight ?? window.innerHeight, this)
    const width = toSysExact(this.offsetWidth, this)
    return {
      x: Math.min(Math.max(x, KEEP_GRABBABLE - width), pw - KEEP_GRABBABLE),
      y: Math.min(Math.max(y, 0), Math.max(0, ph - KEEP_GRABBABLE)),
    }
  }

  /**
   * Drag placement: the origin lands in `top`/`left` in system px, so a moved
   * window is placed the way an authored one is and holds its spot through a
   * zoom (see src/position.ts).
   */
  private readonly _placement = new PlacementController(this, (x, y) =>
    this.#keepGrabbable(x, y)
  )

  /**
   * Title-bar drag-to-move (shared with `vf-dialog` via {@link DragController}).
   * The controller owns the pointer bookkeeping and hands over system px; the
   * placement controller seeds the origin and writes the result.
   */
  private readonly _drag = new DragController(this, {
    onDragStart: (event: PointerEvent): { x: number; y: number } | null => {
      if (!this.movable || event.button !== 0) return null
      // Ignore drags that start on the close/zoom widgets.
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
      return this._placement.seed()
    },
    onDrag: (x: number, y: number): void => this._placement.moveTo(x, y),
  })

  private _resizeState: ResizeState | null = null

  /**
   * Say something the first time a window is opened without a width. The size
   * itself is written by VfSized's controller, from `width`/`height` — which
   * is also what the grow box sets, so a resized window and an authored one
   * are the same declaration and neither can be re-asserted over the other.
   * Controllers run before this hook, so the inline style the warning reads is
   * already written.
   */
  protected override updated(): void {
    this.#warnIfUnsized()
  }

  /** One warning per element, not per render. */
  #warnedNoSize = false

  /**
   * Both dimensions are required: a window is a fixed box in both axes, and
   * each one left out falls back to a different wrong thing.
   *
   * An inline `width`/`height` is the other honest way to declare it — the grow
   * box writes exactly that — so it counts. A stylesheet rule we cannot tell
   * apart from normal block layout, so it still warns.
   */
  #warnIfUnsized(): void {
    if (this.#warnedNoSize) return
    const missing: string[] = []
    if (this.width == null && this.style.width === '') {
      missing.push('width (falling back to block layout)')
    }
    if (this.height == null && this.style.height === '') {
      missing.push('height (falling back to the content)')
    }
    if (missing.length === 0) return
    this.#warnedNoSize = true
    console.warn(
      `vf-window${this.heading ? ` ("${this.heading}")` : ''}: no ` +
        `${missing.join(', no ')}. A window owns its whole box — declare both ` +
        'in system px: <vf-window width="240" height="176">.'
    )
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    // Drop any in-flight resize: the grow box goes away with the shadow tree, so
    // its pointerup/lostpointercapture never arrives. Matches DragController's
    // and vf-slider's teardown.
    this._resizeState = null
  }

  private _onCloseClick(): void {
    emit(this, 'vf-close', { reason: 'close' })
  }

  private _onZoomClick(): void {
    // Empty `{}` detail (not null) preserved intentionally — see the vf-close
    // detail-shape note; vf-zoom keeps `{}` for consistency with vf-window's
    // other widget events.
    emit(this, 'vf-zoom', {})
  }

  /* --- Grow-box resizing (resizable) -------------------------------- */

  private _onGrowPointerDown(event: PointerEvent): void {
    if (!this.resizable || event.button !== 0) return
    const rect = this.getBoundingClientRect()
    this._resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseWidth: toSysExact(rect.width, this),
      baseHeight: toSysExact(rect.height, this),
    }
    const grow = event.currentTarget as HTMLElement
    grow.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  private _onGrowPointerMove(event: PointerEvent): void {
    const resize = this._resizeState
    if (!resize || event.pointerId !== resize.pointerId) return
    // The grow box writes the same `width`/`height` an author declares, in the
    // same unit: whole system px, snapped onto the placement lattice, so the
    // window stays a whole count of art pixels — every interior metric (and an
    // edge-mounted scroll rail's anchors) stays whole with it, the right/bottom
    // borders land on the device grid like the left/top edges, and the box a
    // user grew holds its size through a zoom instead of being re-read as a
    // different number of art pixels at every step. Only the pointer delta
    // crosses units: clientX is real (scaled) CSS px.
    const width = Math.max(
      MIN_WIDTH,
      resize.baseWidth + toSysExact(event.clientX - resize.startX, this)
    )
    const height = Math.max(
      MIN_HEIGHT,
      resize.baseHeight + toSysExact(event.clientY - resize.startY, this)
    )
    this.width = snapSys(width, this)
    this.height = snapSys(height, this)
  }

  /**
   * Ends a grow-box resize on pointerup / pointercancel / lostpointercapture.
   * Idempotent — releasing the capture below re-enters here, and by then
   * `_resizeState` is already null.
   */
  private _onGrowPointerEnd(event: PointerEvent): void {
    const resize = this._resizeState
    if (!resize || event.pointerId !== resize.pointerId) return
    this._resizeState = null
    const grow = event.currentTarget as HTMLElement
    if (grow.hasPointerCapture(event.pointerId)) {
      grow.releasePointerCapture(event.pointerId)
    }
  }

  protected override render(): unknown {
    // The frame is a named group, so AT users can tell whose content they are
    // reading when several windows are open — role="group" rather than
    // "region" deliberately: a region is a landmark, and a desktop full of
    // windows would pollute landmark navigation with exactly the elements
    // that shouldn't be there (the review's §9.3 failure, inverted). The
    // title patch names it the way vf-dialog's names its <dialog>; AccName
    // resolves aria-labelledby through display:none, so the utility bar's
    // hidden patch still names the windoid. An untitled window is an unnamed
    // group — unlike a dialog, a group carries no obligation to be named.
    return html`
      <div
        class="vf-frame vf-snap"
        part="frame"
        role="group"
        aria-labelledby=${this.heading ? 'title' : nothing}
      >
        ${chromeTitleBar(
          this._drag,
          html`
            ${this.closable
              ? closeBox(widgetLabel('Close', this.heading), this._onCloseClick)
              : nothing}
            <span class="vf-title" part="title" id="title">${this.heading}</span>
            ${this.zoomable
              ? zoomBox(widgetLabel('Zoom', this.heading), this._onZoomClick)
              : nothing}
          `,
          this.variant === 'utility' ? 'vf-dots' : 'vf-stripes'
        )}
        <div class="body" part="body">
          ${this.scrollbars
            ? html`
                <vf-scroll-area
                  class="edge-scroll"
                  axis=${this.scrollbars}
                  label=${this.heading || nothing}
                  exportparts="viewport"
                >
                  <slot></slot>
                </vf-scroll-area>
              `
            : html`<slot></slot>`}
        </div>
        ${this.resizable
          ? html`
              <div
                class="grow"
                part="grow-box"
                @pointerdown=${this._onGrowPointerDown}
                @pointermove=${this._onGrowPointerMove}
                @pointerup=${this._onGrowPointerEnd}
                @pointercancel=${this._onGrowPointerEnd}
                @lostpointercapture=${this._onGrowPointerEnd}
              ></div>
            `
          : nothing}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-window': VfWindow
  }
}
