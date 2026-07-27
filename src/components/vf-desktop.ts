import { html, css, LitElement } from 'lit'
import { customElement, queryAssignedElements } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

/**
 * z-index offset lifting the utility (floating) tier above the document tier.
 * Both tiers share the one monotonic counter, so a utility window assigned
 * `counter + BAND` stays above every document window until the counter itself
 * crosses the band — far beyond any real session's restack count.
 */
const UTILITY_Z_BAND = 1_000_000

/**
 * `<vf-desktop>` — the full-bleed classic desktop container.
 *
 * Renders the 50%-dither gray desktop pattern and manages the stacking order
 * and `active` state of slotted `vf-window` children: a `pointerdown` or
 * `focusin` (keyboard focus) anywhere inside a window brings it to the front
 * and makes it the single active window.
 *
 * Utility windows (`vf-window[variant="utility"]`) stack in a floating tier
 * above every document-tier window, restack only among themselves, and stand
 * outside the single-active invariant entirely — clicking a palette neither
 * deactivates the active document window nor greys the palette, exactly as
 * System 7's floating windoids behaved while their application was frontmost.
 *
 * Custom properties:
 * - `--vf-desktop-pattern` — the background-image pattern layer (default a
 *   1-bit 50% checker dither, drawn as opaque black-on-white).
 * - `--vf-desktop` — base color painted *under* the pattern layer (default
 *   `#808080`). The default tile is opaque, so this only becomes visible when
 *   `--vf-desktop-pattern` is overridden with a tile that has transparent
 *   cells (or with `none`).
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
      }
      .desktop {
        position: relative;
        /* Clip here rather than on the host so dragged windows crop at this
           box's corrected edge, not the host's possibly-fractional one. */
        overflow: hidden;
        width: 100%;
        height: 100%;
        background-color: var(--vf-desktop, #808080);
        /* Classic 50% checker dither as a crisp 1-bit SVG tile — a 2×2 grid
           painting an opaque white base with two black pixels on the diagonal.
           Black-on-white is the authentic System 7 dither, so the tile is
           deliberately opaque and covers the background-color above (see the
           --vf-desktop note in the class doc). Scaled with --vf-scale so each
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

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /** Monotonic z-index counter for window stacking. */
  private _zCounter = 0

  /** Whether a one-shot post-upgrade re-normalization is already pending. */
  private _awaitingUpgrade = false

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

  /** Whether a slotted window belongs to the floating (utility) tier. The
   *  attribute is the source of truth here so a not-yet-upgraded element
   *  still lands in the right tier (variant reflects, so an upgraded
   *  property-set window agrees). */
  private _isUtility(win: HTMLElement): boolean {
    return win.getAttribute('variant') === 'utility'
  }

  /**
   * Bring a slotted window to the front of its tier. A document-tier window
   * also becomes the single active window (clearing `active` on the other
   * document windows); a utility window restacks within the floating tier
   * and leaves every `active` state alone.
   */
  bringToFront(win: HTMLElement): void {
    const utility = this._isUtility(win)
    win.style.zIndex = String(++this._zCounter + (utility ? UTILITY_Z_BAND : 0))
    if (!utility) this._setActive(win)
  }

  /**
   * Raise the window an event originated in, skipping the restack/activation
   * churn when it is already on top of its own tier (and, for a document
   * window, already active): otherwise every click inside the front window
   * would bump _zCounter and re-run the whole-fleet activation loop for
   * nothing.
   */
  private _raise(win: HTMLElement): void {
    const utility = this._isUtility(win)
    const tier = this._windows.filter((w) => this._isUtility(w) === utility)
    if (
      this._topmost(tier) === win &&
      (utility || win.hasAttribute('active'))
    ) {
      return
    }
    this.bringToFront(win)
  }

  /** Delegated pointerdown: raise the window the event originated in. */
  private _onPointerDown = (event: PointerEvent): void => {
    const win = this._windowFromEvent(event)
    if (win) this._raise(win)
  }

  /**
   * Delegated focusin: raise the window keyboard focus entered, so tabbing
   * into a background window brings it to front (and reveals its close/zoom
   * widgets) just like a pointerdown would.
   */
  private _onFocusIn = (event: FocusEvent): void => {
    const win = this._windowFromEvent(event)
    if (win) this._raise(win)
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
        const utility = this._isUtility(win)
        win.style.zIndex = String(
          ++this._zCounter + (utility ? UTILITY_Z_BAND : 0)
        )
        // Only a document-tier window can become the active one; a newly
        // slotted palette floats up without touching active states.
        if (!utility) newest = win
      }
    }
    const top =
      newest ?? this._topmost(windows.filter((w) => !this._isUtility(w)))
    if (top) this._setActive(top)
    // Windows slotted before vf-window is defined are plain unknown elements,
    // so _setWindowActive can only *clear their attribute* — and on upgrade
    // vf-window's reflected `active = true` default puts it straight back,
    // flipping every background window active at once. Upgrading a slotted
    // node doesn't re-fire slotchange, so re-assert once the definition lands.
    if (!customElements.get('vf-window')) this._normalizeAfterUpgrade()
  }

  /**
   * Re-assert the single-active-window state after slotted `<vf-window>`
   * elements upgrade. One-shot: the flag collapses repeat slotchanges into a
   * single wait, and once the definition is registered `_onSlotChange` stops
   * calling this at all. If a consumer never imports vf-window the promise
   * simply never settles — those elements render nothing either way.
   */
  private _normalizeAfterUpgrade(): void {
    if (this._awaitingUpgrade) return
    this._awaitingUpgrade = true
    void customElements.whenDefined('vf-window').then(() => {
      this._awaitingUpgrade = false
      if (!this.isConnected) return
      // Every window now exposes the property, so _setWindowActive takes the
      // authoritative property path; z-indices were already seeded above, so
      // the topmost document-tier window is the one that should be active.
      const top = this._topmost(
        this._windows.filter((w) => !this._isUtility(w))
      )
      if (top) this._setActive(top)
    })
  }

  /** Set `active` on `win` only, clearing it on every other *document-tier*
   *  window. Utility windows stand outside the invariant: a palette keeps
   *  whatever `active` state it has (true by default, so its dither and
   *  widgets stay drawn while document windows trade the highlight). */
  private _setActive(win: HTMLElement): void {
    for (const other of this._windows) {
      if (this._isUtility(other)) continue
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
      <div class="desktop vf-snap" part="desktop">
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
