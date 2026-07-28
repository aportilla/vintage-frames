import { html, css, LitElement, nothing } from 'lit'
import type { PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import {
  vfBase,
  vfStripes,
  vfDots,
  vfFocus,
  vfChromeFrame,
  vfTitleBar,
  vfWindowWidgets,
} from '../styles/base.js'
import { ScaleController, snapToSystemPx, sys, sysLength } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { DragController } from '../drag.js'
import { chromeTitleBar, widgetLabel, closeBox, zoomBox } from '../chrome.js'
import { emit } from '../events.js'
import './vf-scroll-area.js'

interface ResizeState {
  pointerId: number
  startX: number
  startY: number
  baseWidth: number
  baseHeight: number
}

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
 *   compatible with vf-dialog/vf-alert's `vf-close`). The window does NOT
 *   remove itself; the consumer decides what closing means.
 * @fires vf-zoom - Zoom box clicked. Detail `{}`.
 */
@customElement('vf-window')
export class VfWindow extends LitElement {
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
         8px offset + an 11px box + its 2px white patch ring, doubled, rounded
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
      /* Inactive window: stripes and widgets go away, but the title text
         stays black — classic System 7 never grayed the title. */

      /* --- Window widgets (close / zoom boxes) ----------------------- */
      /* Skin from vfWindowWidgets (shared with vf-dialog); only the
         host-state rule is the window's own — a dialog has no inactive
         state, so hiding widgets with the stripes lives here. */
      :host(:not([active])) .box {
        display: none;
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
           11px: 2 + 7 + 2). */
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
      .body {
        flex: 1 1 auto;
        min-height: 0;
        padding: calc(var(--vf-scale, 1) * 12px);
      }
      :host([flush]) .body,
      :host([scrollbars]) .body {
        padding: 0;
      }

      /* --- Edge scroll rails (scrollbars) ----------------------------- */
      /* The TeachText composition (SPEC §5 vf-scroll-area), internalized:
         the built-in scroll area is pulled one system pixel under the window
         frame on every side, so its own frame overlay repaints the window's
         border lines exactly (no doubled frame), the rails run edge to edge,
         and a resizable window's grow box (z-index 1) lands in the scrollbar
         corner cell. The scrollbar anchors ride the window's whole-pixel box;
         drag and grow keep it on coordinates the engine's scrollbar rects can
         hold (see snapToSystemPx). */
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
        cursor: default;
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

  /**
   * Window width in whole system px — the art's own unit, so the window keeps
   * its proportions to the chrome inside it at every display density (a CSS-px
   * width does not: it stays put while the components in it triple).
   *
   * **Declare it.** A window owns its size the way a real one does; left to
   * layout it takes whatever width its container or its content hands it, which
   * is how a title bar ends up wider than the screen or a dialog reflows as it
   * moves. Unset, the window still renders — normal block layout, as before —
   * and says so once in the console. {@link height} is optional on top of it:
   * unset, the body sizes to its content.
   */
  @property({ type: Number }) width?: number

  /** Window height in whole system px; unset, the body sizes to its content. */
  @property({ type: Number }) height?: number

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
   * Title-bar drag-to-move (shared with `vf-dialog` via {@link DragController}).
   * The delegate seeds absolute positioning on the first drag and writes the
   * snapped `left`/`top` back; the controller owns the pointer bookkeeping.
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
      // Seed absolute positioning from the current in-flow offset the first
      // time the window is dragged. Every coordinate is snapped onto the
      // system-pixel grid (scale.ts): a fractional origin fringes all the
      // 1-bit art inside, and a half-CSS-px edge shifts WebKit's rails.
      const computed = getComputedStyle(this)
      if (computed.position !== 'absolute') {
        const left = snapToSystemPx(this.offsetLeft, this)
        const top = snapToSystemPx(this.offsetTop, this)
        this.style.position = 'absolute'
        this.style.left = `${left}px`
        this.style.top = `${top}px`
        this.style.margin = '0'
      } else {
        // Already absolute: re-seed the inline coordinates from the COMPUTED
        // ones before every drag. They are resolved pixels whatever the author
        // wrote — an inline `left: 1em` or `left: 10%` is a perfectly good way
        // to place a window, and reading `style.left` back would parse it as
        // the bare number and jump the window there on the first move. Once
        // the drag owns the coordinates they are already px, so this is a
        // no-op from the second drag on.
        this.style.left = `${snapToSystemPx(parseFloat(computed.left) || 0, this)}px`
        this.style.top = `${snapToSystemPx(parseFloat(computed.top) || 0, this)}px`
      }
      return {
        x: parseFloat(this.style.left) || 0,
        y: parseFloat(this.style.top) || 0,
      }
    },
    onDrag: (x: number, y: number): void => {
      // Keep a grabbable strip on-screen: clamp the origin against the
      // positioning parent (the desktop, usually) so the window can't be
      // dragged fully past an edge and lost. Re-snap after clamping so the
      // clamped edge still lands on the system grid.
      const parent = this.offsetParent as HTMLElement | null
      const pw = parent?.clientWidth ?? window.innerWidth
      const ph = parent?.clientHeight ?? window.innerHeight
      const keep = sys(24, this) // px of the window that must stay reachable
      const nx = Math.min(Math.max(x, keep - this.offsetWidth), pw - keep)
      const ny = Math.min(Math.max(y, 0), Math.max(0, ph - keep))
      this.style.left = `${snapToSystemPx(nx, this)}px`
      this.style.top = `${snapToSystemPx(ny, this)}px`
    },
  })

  private _resizeState: ResizeState | null = null

  /**
   * Write {@link width}/{@link height} onto the host as scaled lengths, and say
   * something the first time a window is opened without a width.
   *
   * Only on the update that *changed* them: the grow box writes its own px
   * width/height straight to the host, and re-applying the authored size on
   * some later render (a title change, the desktop toggling `active`) would
   * snap a resized window back. Setting the property again is the deliberate
   * way to re-size it.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('width')) this.style.width = sysLength(this.width)
    if (changed.has('height')) this.style.height = sysLength(this.height)
    this.#warnIfUnsized()
  }

  /** One warning per element, not per render. */
  #warnedNoSize = false

  #warnIfUnsized(): void {
    if (this.#warnedNoSize || this.width !== undefined) return
    // An inline width is the other honest way to say it; a stylesheet rule we
    // cannot tell apart from normal block layout, so it warns too.
    if (this.style.width !== '') return
    this.#warnedNoSize = true
    console.warn(
      `vf-window${this.heading ? ` ("${this.heading}")` : ''}: no width declared — ` +
        'falling back to block layout. Declare the size in system px: ' +
        '<vf-window width="240" height="176">.'
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
      baseWidth: rect.width,
      baseHeight: rect.height,
    }
    const grow = event.currentTarget as HTMLElement
    grow.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  private _onGrowPointerMove(event: PointerEvent): void {
    const resize = this._resizeState
    if (!resize || event.pointerId !== resize.pointerId) return
    // Minimums are in system px; getBoundingClientRect/clientX are real (scaled)
    // CSS px, so convert the floors with sys(). Snapped onto the system grid so
    // the window stays a whole count of art pixels — every interior metric
    // (and an edge-mounted scroll rail's anchors) stays whole with it, and the
    // right/bottom borders land on the device grid like the left/top edges.
    const width = Math.max(sys(80, this), resize.baseWidth + (event.clientX - resize.startX))
    const height = Math.max(
      sys(54, this),
      resize.baseHeight + (event.clientY - resize.startY)
    )
    this.style.width = `${snapToSystemPx(width, this)}px`
    this.style.height = `${snapToSystemPx(height, this)}px`
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
    return html`
      <div class="vf-frame vf-snap" part="frame">
        ${chromeTitleBar(
          this._drag,
          html`
            ${this.closable
              ? closeBox(widgetLabel('Close', this.heading), this._onCloseClick)
              : nothing}
            <span class="vf-title" part="title">${this.heading}</span>
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
