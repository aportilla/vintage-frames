import { html, css, LitElement, nothing } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import {
  vfBase,
  vfStripes,
  vfFocus,
  vfChromeFrame,
  vfTitleBar,
} from '../styles/base.js'
import { ScaleController, snapToDevicePx, sys } from '../scale.js'
import { DragController } from '../drag.js'
import { chromeTitleBar } from '../chrome.js'
import { emit } from '../events.js'

interface ResizeState {
  pointerId: number
  startX: number
  startY: number
  baseWidth: number
  baseHeight: number
}

/**
 * `<vf-window>` — the classic System 7 document window.
 *
 * Racing-stripe title bar with close box (left) and optional zoom box
 * (right), a solid-white frame with a hard offset shadow, and an optional
 * grow box for resizing. Place inside `<vf-desktop>` to get click-to-front
 * stacking and automatic `active` management.
 *
 * @slot - Default slot: window body content.
 * @csspart frame - The outer chrome frame.
 * @csspart title-bar - The striped title bar.
 * @csspart title - The centered title patch.
 * @csspart close-box - The close widget (left).
 * @csspart zoom-box - The zoom widget (right).
 * @csspart body - The content area.
 * @csspart grow-box - The resize widget (bottom-right, when `resizable`).
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
    vfFocus,
    vfChromeFrame,
    vfTitleBar,
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
      :host(:not([active])) .vf-stripes {
        display: none;
      }
      /* Inactive window: stripes and widgets go away, but the title text
         stays black — classic System 7 never grayed the title. */

      /* --- Window widgets (close / zoom boxes) ----------------------- */
      .box {
        position: absolute;
        /* 11×11 box with 3px of clear white above and below it (title-bar
           interior is 17px: 3 + 11 + 3). See SPEC §5 vf-window. */
        top: calc(var(--vf-scale, 1) * 3px);
        z-index: 1;
        width: calc(var(--vf-scale, 1) * 11px);
        height: calc(var(--vf-scale, 1) * 11px);
        padding: 0;
        margin: 0;
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        background: var(--vf-white, #ffffff);
        /* A 2px white patch ring that interrupts the stripes around the
           box (no bevel — flat 1-bit). */
        box-shadow: 0 0 0 calc(var(--vf-scale, 1) * 2px) var(--vf-white, #ffffff);
        font: inherit;
        cursor: default;
        -webkit-appearance: none;
        appearance: none;
      }
      .close {
        left: calc(var(--vf-scale, 1) * 8px);
      }
      .zoom {
        right: calc(var(--vf-scale, 1) * 8px);
      }
      /* Pressed box (close AND zoom): the interior fills with the classic
         radiating "go-away" sunburst — black 1-bit spokes on the white face
         (4 orthogonal 3px spokes + 4 diagonal 2px ones around an empty center),
         traced pixel-for-pixel from the UI kit's close-button-active-state
         sprite. Both widgets flash the identical graphic while pressed. That
         sprite is the whole 11×11 box; its outer ring is this element's own 1px
         border, so the SVG draws just the 9×9 interior into the padding box. */
      .box:active {
        background-color: var(--vf-white, #ffffff);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9'%3E%3Cpath d='M4 0h1v1h-1zM1 1h1v1h-1zM4 1h1v1h-1zM7 1h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM6 2h1v1h-1zM0 4h3v1h-3zM6 4h3v1h-3zM2 6h1v1h-1zM4 6h1v1h-1zM6 6h1v1h-1zM1 7h1v1h-1zM4 7h1v1h-1zM7 7h1v1h-1zM4 8h1v1h-1z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: center;
        background-size: calc(var(--vf-scale, 1) * 9px) calc(var(--vf-scale, 1) * 9px);
      }
      .zoom::after {
        content: '';
        position: absolute;
        /* A small box nested in the TOP-LEFT corner of the widget (classic
           System 7 zoom box). It shares the widget's own top and left border, so
           only its right and bottom edges are drawn: a 6×6 box anchored at the
           padding-box origin whose 1px right/bottom borders land the vertical at
           sprite col 6 and the horizontal at row 6. Traced from the UI kit
           zoom-button rest sprite. */
        top: 0;
        left: 0;
        width: calc(var(--vf-scale, 1) * 6px);
        height: calc(var(--vf-scale, 1) * 6px);
        border-right: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        border-bottom: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
      }
      /* While pressed the zoom box shows the same sunburst as the close box, so
         its inner detail square gives way to it. */
      .zoom:active::after {
        display: none;
      }
      :host(:not([active])) .box {
        display: none;
      }

      /* --- Body ------------------------------------------------------ */
      .body {
        flex: 1 1 auto;
        min-height: 0;
        padding: calc(var(--vf-scale, 1) * 12px);
      }
      :host([flush]) .body {
        padding: 0;
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
    `,
  ]

  /** Title text shown centered in the title bar. */
  @property() heading = ''

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

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

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
      // time the window is dragged. Every coordinate is snapped: at a
      // fractional origin all the 1-bit art inside grows a fringe (scale.ts).
      const computed = getComputedStyle(this)
      if (computed.position !== 'absolute') {
        const left = snapToDevicePx(this.offsetLeft)
        const top = snapToDevicePx(this.offsetTop)
        this.style.position = 'absolute'
        this.style.left = `${left}px`
        this.style.top = `${top}px`
        this.style.margin = '0'
      } else if (this.style.left === '' || this.style.top === '') {
        // Already absolute via a stylesheet but with no inline coordinates yet:
        // seed them from the computed position so the drag math has a base
        // (otherwise the first drag would jump the window to 0,0).
        this.style.left = `${snapToDevicePx(parseFloat(computed.left) || 0)}px`
        this.style.top = `${snapToDevicePx(parseFloat(computed.top) || 0)}px`
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
      // clamped edge still lands on the device grid.
      const parent = this.offsetParent as HTMLElement | null
      const pw = parent?.clientWidth ?? window.innerWidth
      const ph = parent?.clientHeight ?? window.innerHeight
      const keep = sys(24, this) // px of the window that must stay reachable
      const nx = Math.min(Math.max(x, keep - this.offsetWidth), pw - keep)
      const ny = Math.min(Math.max(y, 0), Math.max(0, ph - keep))
      this.style.left = `${snapToDevicePx(nx)}px`
      this.style.top = `${snapToDevicePx(ny)}px`
    },
  })

  private _resizeState: ResizeState | null = null

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
    // CSS px, so convert the floors with sys(). Snapped so the right/bottom
    // borders land on the device grid like the (snapped) left/top edges.
    const width = Math.max(sys(80, this), resize.baseWidth + (event.clientX - resize.startX))
    const height = Math.max(
      sys(54, this),
      resize.baseHeight + (event.clientY - resize.startY)
    )
    this.style.width = `${snapToDevicePx(width)}px`
    this.style.height = `${snapToDevicePx(height)}px`
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

  /**
   * Widget label, qualified by the window title when there is one — several
   * windows are open at once by design, so a bare "Close" repeated across the
   * desktop leaves an AT user no way to tell which window a button belongs to.
   */
  private _widgetLabel(action: string): string {
    return this.heading ? `${action} ${this.heading}` : action
  }

  protected override render(): unknown {
    return html`
      <div class="vf-frame" part="frame">
        ${chromeTitleBar(
          this._drag,
          html`
            ${this.closable
              ? html`
                  <button
                    type="button"
                    class="box close vf-focus"
                    part="close-box"
                    aria-label=${this._widgetLabel('Close')}
                    @click=${this._onCloseClick}
                  ></button>
                `
              : nothing}
            <span class="vf-title" part="title">${this.heading}</span>
            ${this.zoomable
              ? html`
                  <button
                    type="button"
                    class="box zoom vf-focus"
                    part="zoom-box"
                    aria-label=${this._widgetLabel('Zoom')}
                    @click=${this._onZoomClick}
                  ></button>
                `
              : nothing}
          `
        )}
        <div class="body" part="body"><slot></slot></div>
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
