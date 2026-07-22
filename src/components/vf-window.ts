import { html, css, LitElement, nothing } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { vfBase, vfStripes, vfFocus, vfDisplayDecls } from '../styles/base.js'
import { ScaleController, snapToDevicePx, sys } from '../scale.js'

interface DragState {
  pointerId: number
  startX: number
  startY: number
  baseLeft: number
  baseTop: number
}

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
 * @fires vf-close - Close box clicked. Detail `{}`. The window does NOT
 *   remove itself; the consumer decides what closing means.
 * @fires vf-zoom - Zoom box clicked. Detail `{}`.
 */
@customElement('vf-window')
export class VfWindow extends LitElement {
  static override styles = [
    vfBase,
    vfStripes,
    vfFocus,
    css`
      :host {
        display: block;
        position: relative;
        --vf-surface: var(--vf-white, #ffffff);
      }
      .frame {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: var(--vf-white, #ffffff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        box-shadow: calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px))
          calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px)) 0 0
          var(--vf-black, #000000);
      }

      /* --- Title bar ------------------------------------------------- */
      .title-bar {
        position: relative;
        flex: none;
        height: calc(var(--vf-scale, 1) * var(--vf-titlebar-height, 22px));
        border-bottom: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      :host([movable]) .title-bar {
        touch-action: none;
      }
      :host(:not([active])) .vf-stripes {
        display: none;
      }
      .title {
        /* Chicago-style title (chrome); the window body keeps the body face. */
        ${vfDisplayDecls}
        position: relative;
        z-index: 1;
        padding: 0 calc(var(--vf-scale, 1) * 8px);
        max-width: calc(100% - var(--vf-scale, 1) * 60px);
        background: var(--vf-white, #ffffff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      :host(:not([active])) .title {
        color: var(--vf-disabled, #c0c0c0);
      }

      /* --- Window widgets (close / zoom boxes) ----------------------- */
      .box {
        position: absolute;
        top: calc(var(--vf-scale, 1) * 4px);
        z-index: 1;
        width: calc(var(--vf-scale, 1) * 13px);
        height: calc(var(--vf-scale, 1) * 13px);
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
      .box:active {
        background: var(--vf-black, #000000);
        box-shadow: 0 0 0 calc(var(--vf-scale, 1) * 2px) var(--vf-white, #ffffff);
      }
      .zoom::after {
        content: '';
        position: absolute;
        top: calc(var(--vf-scale, 1) * 2px);
        left: calc(var(--vf-scale, 1) * 2px);
        width: calc(var(--vf-scale, 1) * 7px);
        height: calc(var(--vf-scale, 1) * 7px);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
      }
      .zoom:active::after {
        border-color: var(--vf-white, #ffffff);
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

  @query('.title-bar') private _titleBar!: HTMLElement

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  private _dragState: DragState | null = null
  private _resizeState: ResizeState | null = null

  /** Dispatch a `vf-*` CustomEvent that bubbles and crosses shadow roots. */
  private _emit(name: string, detail: Record<string, unknown> = {}): void {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    )
  }

  private _onCloseClick(): void {
    this._emit('vf-close')
  }

  private _onZoomClick(): void {
    this._emit('vf-zoom')
  }

  /* --- Title-bar dragging (movable) --------------------------------- */

  private _onTitlePointerDown(event: PointerEvent): void {
    if (!this.movable || event.button !== 0) return
    // Ignore drags that start on the close/zoom widgets.
    if (
      event
        .composedPath()
        .some(
          (node) =>
            node instanceof HTMLElement && node.classList.contains('box')
        )
    ) {
      return
    }
    // Seed absolute positioning from the current in-flow offset the first
    // time the window is dragged. Every JS-written coordinate goes through
    // snapToDevicePx: at a fractional origin all the 1-bit art inside the
    // window grows an antialiasing fringe (see scale.ts).
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
      // (otherwise the first drag would jump the window to 0,0). Computed
      // values resolve percentages etc. to fractional px — snap them.
      this.style.left = `${snapToDevicePx(parseFloat(computed.left) || 0)}px`
      this.style.top = `${snapToDevicePx(parseFloat(computed.top) || 0)}px`
    }
    this._dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseLeft: parseFloat(this.style.left) || 0,
      baseTop: parseFloat(this.style.top) || 0,
    }
    this._titleBar.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  private _onTitlePointerMove(event: PointerEvent): void {
    const drag = this._dragState
    if (!drag || event.pointerId !== drag.pointerId) return
    // Trackpads report fractional clientX/Y — snap every step of the drag so
    // the window (and all the pixel art inside it) stays on the device grid.
    this.style.left = `${snapToDevicePx(drag.baseLeft + (event.clientX - drag.startX))}px`
    this.style.top = `${snapToDevicePx(drag.baseTop + (event.clientY - drag.startY))}px`
  }

  private _onTitlePointerEnd(event: PointerEvent): void {
    const drag = this._dragState
    if (!drag || event.pointerId !== drag.pointerId) return
    this._dragState = null
    if (this._titleBar.hasPointerCapture(event.pointerId)) {
      this._titleBar.releasePointerCapture(event.pointerId)
    }
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
    const width = Math.max(sys(80), resize.baseWidth + (event.clientX - resize.startX))
    const height = Math.max(
      sys(54),
      resize.baseHeight + (event.clientY - resize.startY)
    )
    this.style.width = `${snapToDevicePx(width)}px`
    this.style.height = `${snapToDevicePx(height)}px`
  }

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
      <div class="frame" part="frame">
        <header
          class="title-bar"
          part="title-bar"
          @pointerdown=${this._onTitlePointerDown}
          @pointermove=${this._onTitlePointerMove}
          @pointerup=${this._onTitlePointerEnd}
          @pointercancel=${this._onTitlePointerEnd}
        >
          <div class="vf-stripes"></div>
          ${this.closable
            ? html`
                <button
                  type="button"
                  class="box close vf-focus"
                  part="close-box"
                  aria-label="Close"
                  @click=${this._onCloseClick}
                ></button>
              `
            : nothing}
          <span class="title" part="title">${this.heading}</span>
          ${this.zoomable
            ? html`
                <button
                  type="button"
                  class="box zoom vf-focus"
                  part="zoom-box"
                  aria-label="Zoom"
                  @click=${this._onZoomClick}
                ></button>
              `
            : nothing}
        </header>
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
