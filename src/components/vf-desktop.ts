import { html, css, LitElement } from 'lit'
import { customElement, queryAssignedElements } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'
import { ScaleController } from '../scale.js'

/**
 * `<vf-desktop>` — the full-bleed classic desktop container.
 *
 * Renders the 50%-dither gray desktop pattern and manages the stacking order
 * and `active` state of slotted `vf-window` children: a `pointerdown` or
 * `focusin` (keyboard focus) anywhere inside a window brings it to the front
 * and makes it the single active window.
 *
 * Custom properties:
 * - `--vf-desktop` — base desktop gray (default `#808080`).
 * - `--vf-desktop-pattern` — background-image pattern layer (default a
 *   black/white 1-bit 50% checker dither).
 *
 * @slot - Default slot: menu bar, windows, anything.
 * @csspart desktop - The full-size desktop surface.
 */
@customElement('vf-desktop')
export class VfDesktop extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        position: relative;
        overflow: hidden;
      }
      .desktop {
        position: relative;
        width: 100%;
        height: 100%;
        background-color: var(--vf-desktop, #808080);
        /* Classic 50% checker dither as a crisp 1-bit SVG tile — a 2×2 grid with
           two black pixels (the other two transparent, so the desktop gray shows
           through as the "white" of the dither). Scaled with --vf-scale so each
           system pixel lands on whole device pixels; unlike a conic-gradient
           (whose hard stops the browser feathers into a blur), the SVG rects are
           pixel-exact. Override the whole pattern via --vf-desktop-pattern. */
        background-image: var(
          --vf-desktop-pattern,
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2' shape-rendering='crispEdges'%3E%3Crect width='2' height='2' fill='%23ffffff'/%3E%3Crect width='1' height='1' fill='%23000000'/%3E%3Crect x='1' y='1' width='1' height='1' fill='%23000000'/%3E%3C/svg%3E")
        );
        background-size: calc(var(--vf-scale, 1) * 2px) calc(var(--vf-scale, 1) * 2px);
      }
      /* Slotted windows need a positioning context so z-index applies.
         (An inline position: absolute set by a movable window wins.) */
      ::slotted(vf-window) {
        position: relative;
      }
    `,
  ]

  /** Slotted `vf-window` children (direct children only). */
  @queryAssignedElements({ selector: 'vf-window' })
  private _windows!: HTMLElement[]

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Monotonic z-index counter for window stacking. */
  private _zCounter = 0

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener('pointerdown', this._onPointerDown)
    this.addEventListener('focusin', this._onFocusIn)
  }

  override disconnectedCallback(): void {
    this.removeEventListener('pointerdown', this._onPointerDown)
    this.removeEventListener('focusin', this._onFocusIn)
    super.disconnectedCallback()
  }

  /**
   * Bring a slotted window to the front of the stack and make it the single
   * active window (clears `active` on all the others).
   */
  bringToFront(win: HTMLElement): void {
    win.style.zIndex = String(++this._zCounter)
    this._setActive(win)
  }

  /** Delegated pointerdown: activate the window the event originated in. */
  private _onPointerDown = (event: PointerEvent): void => {
    const win = this._windowFromEvent(event)
    if (!win) return
    // Skip the restack/activation churn when the click is inside the window
    // that's already active and on top: otherwise every click there would
    // bump _zCounter and re-run the whole-fleet activation loop for nothing.
    if (win.hasAttribute('active') && Number(win.style.zIndex) === this._zCounter) return
    this.bringToFront(win)
  }

  /**
   * Delegated focusin: activate the window keyboard focus entered, so
   * tabbing into a background window brings it to front (and reveals its
   * close/zoom widgets) just like a pointerdown would.
   */
  private _onFocusIn = (event: FocusEvent): void => {
    const win = this._windowFromEvent(event)
    if (win && !win.hasAttribute('active')) this.bringToFront(win)
  }

  /** The slotted window the event originated in, if any. */
  private _windowFromEvent(event: Event): HTMLElement | undefined {
    const windows = this._windows
    return event
      .composedPath()
      .find(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && windows.includes(node)
      )
  }

  /** Wire up newly slotted windows: seed z-indices, normalize `active`. */
  private _onSlotChange(): void {
    const windows = this._windows
    let newest: HTMLElement | null = null
    for (const win of windows) {
      if (!win.style.zIndex) {
        win.style.zIndex = String(++this._zCounter)
        newest = win
      }
    }
    const top = newest ?? this._topmost(windows)
    if (top) this._setActive(top)
  }

  /** Set `active` on `win` only, clearing it on every other window. */
  private _setActive(win: HTMLElement): void {
    for (const other of this._windows) {
      this._setWindowActive(other, other === win)
    }
  }

  /**
   * Set a window's `active` state. Prefers the property (the source of truth
   * on an upgraded `vf-window`, whose reflection then wins over any pending
   * initial-value reflection); falls back to the attribute for not-yet
   * upgraded elements.
   */
  private _setWindowActive(win: HTMLElement, value: boolean): void {
    if ('active' in win) {
      const upgraded = win as HTMLElement & { active: boolean }
      if (upgraded.active !== value) upgraded.active = value
    } else if (win.hasAttribute('active') !== value) {
      win.toggleAttribute('active', value)
    }
  }

  /** The window with the highest z-index, or null when there are none. */
  private _topmost(windows: HTMLElement[]): HTMLElement | null {
    let top: HTMLElement | null = null
    let topZ = -Infinity
    for (const win of windows) {
      const z = Number(win.style.zIndex) || 0
      if (z >= topZ) {
        topZ = z
        top = win
      }
    }
    return top
  }

  protected override render(): unknown {
    return html`
      <div class="desktop" part="desktop">
        <slot @slotchange=${this._onSlotChange}></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-desktop': VfDesktop
  }
}
