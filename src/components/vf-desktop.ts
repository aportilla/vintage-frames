import { html, css, LitElement, unsafeCSS } from 'lit'
import { property, queryAssignedElements } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { vfBase } from '../styles/base.js'
import { ScaleController, sysLength } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { DocumentListenersController } from '../document-listeners.js'
import { SCREEN_CORNER, steppedCornerClip } from '../pixel-frame.js'

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
 * and makes it the single active window. The windows' light-DOM order is kept
 * in step with the stacking order (bottom-most first, at pointer-gesture
 * ends), so tabbing walks the stack the way the eye does and Shift+Tab is
 * its exact mirror.
 *
 * Utility windows (`vf-window[variant="utility"]`) stack in a floating tier
 * above every document-tier window, restack only among themselves, and stand
 * outside the single-active invariant entirely — clicking a palette neither
 * deactivates the active document window nor greys the palette, exactly as
 * System 7's floating windoids behaved while their application was frontmost.
 *
 * `bezel` (system px) draws the black screen surround — the CRT's unlit
 * margin — around the desktop, rounding the screen's top corners with the
 * classic corner mask.
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
 * @cssprop [--vf-desktop=#808080] - base color under the desktop dither —
 *   occluded by the default (opaque) tile, so it only shows through a custom
 *   `--vf-desktop-pattern`
 * @cssprop --vf-desktop-pattern - `vf-desktop`'s background-image layer — a 50%
 *   checker drawn as opaque black-on-white rects (override the whole pattern)
 */
@vfElement('vf-desktop')
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
        /* The screen bezel: the unlit black margin a compact Mac's CRT showed
           between the raster and the case, as a border so everything inside
           it comes along by construction — the content sits in the padding
           box, so flow (the menu bar), an absolutely positioned window's
           containing block, and the overflow clip all move to the bezel's
           inner edge, and a dragged window crops there, sliding "under" the
           black. Width is written by the bezel property (updated()), in
           system px. */
        border: var(--vf-desktop-bezel, 0px) solid var(--vf-black, #000);
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
        /* Forced colors: the checker is opaque literal white-and-black (a
           preserved url() tile), which ignores a dark theme entirely. A
           backdrop is decoration, and high-contrast mode is a request for
           less of that — so the desktop goes flat Canvas (the forced
           background-color) rather than re-dithering in the user's pair.
           Deliberate; the windoid dot bar, which carries meaning, IS
           re-inked (see vfDots). */
        @media (forced-colors: active) {
          background-image: none;
        }
      }
      /* Slotted windows need a positioning context so z-index applies.
         (An inline position: absolute set by a movable window wins.) */
      ::slotted(vf-window) {
        position: relative;
      }
      /* With a bezel, the screen's top corners wear the SCREEN_CORNER mask,
         rounding into the surrounding black — the top pair only, because the
         classic framebuffer masked only those; the raster's bottom corners
         ran square. Anchored to .desktop's padding box, i.e. the screen's own
         corners (over a slotted menu bar's, which sit in the same place). The
         hardware mask was in front of every pixel — a window dragged into a
         corner slides under it — hence the maximal z-index. */
      .corner {
        position: absolute;
        top: 0;
        width: calc(var(--vf-scale, 1) * ${SCREEN_CORNER[0]!}px);
        height: calc(var(--vf-scale, 1) * ${SCREEN_CORNER.length}px);
        background: var(--vf-black, #000);
        pointer-events: none;
        z-index: 2147483647;
      }
      .corner.tl {
        left: 0;
        clip-path: ${unsafeCSS(steppedCornerClip(SCREEN_CORNER, 'left'))};
      }
      .corner.tr {
        right: 0;
        clip-path: ${unsafeCSS(steppedCornerClip(SCREEN_CORNER, 'right'))};
      }
    `,
  ]

  /**
   * Width of the black screen bezel, in system px (`0` = none). The compact
   * Mac's CRT showed an unlit black margin between the desktop's raster and
   * the case; `bezel` draws it around the whole desktop, and puts the
   * classic screen-corner mask on the screen's two *top* corners — only the
   * top pair was rounded in the framebuffer. The screen area (flow, window
   * coordinates, the drag clip) is inset by the same amount, so windows crop
   * at the bezel's inner edge. Inside a bezeled desktop a menu bar needs no
   * `rounded` of its own — the desktop's mask lands on the same pixels.
   */
  @property({ type: Number }) bezel = 0

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

  /** Whether a pointer gesture that began on the desktop is still in flight. */
  private _pointerGesture = false

  /** Whether {@link _syncDomOrder} is putting focus back after a node move. */
  private _restoringFocus = false

  /**
   * Ends the pointer-gesture window that defers DOM reordering. Capture-phase
   * on the document so a component's `stopPropagation` can't strand the flag,
   * and detached on host disconnect by the controller.
   */
  private readonly _gestureEnd = new DocumentListenersController(this, () => [
    [document, 'pointerup', this._onGestureEnd, true],
    [document, 'pointercancel', this._onGestureEnd, true],
  ])

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener('pointerdown', this._onPointerDown)
    this.addEventListener('focusin', this._onFocusIn)
  }

  override disconnectedCallback(): void {
    this.removeEventListener('pointerdown', this._onPointerDown)
    this.removeEventListener('focusin', this._onFocusIn)
    // The controller detaches the document listeners; drop the flag with
    // them so a reconnected desktop doesn't sit on a stale deferral.
    this._pointerGesture = false
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
   *
   * The light-DOM order of the slotted windows follows ({@link _syncDomOrder}):
   * visual stacking and sequential focus order come from independent channels
   * (z-index vs DOM position), and letting them drift apart is how a desktop
   * tabs front-to-back one way and back-to-front the other, with widgets
   * reachable only travelling backwards. Deferred to the end of any in-flight
   * pointer gesture — moving a node clears the pointer capture a title-bar
   * drag or grow-box resize holds on it, and a background window must stay
   * draggable in the same gesture that raises it.
   */
  bringToFront(win: HTMLElement): void {
    this._restack(win)
    this._requestDomSync()
  }

  /** The z/active half of a raise, shared by every path. */
  private _restack(win: HTMLElement): void {
    const utility = this._isUtility(win)
    win.style.zIndex = String(++this._zCounter + (utility ? UTILITY_Z_BAND : 0))
    if (!utility) this._setActive(win)
  }

  /** Sync the DOM order now, or at gesture end if a pointer is down. */
  private _requestDomSync(): void {
    if (!this._pointerGesture) this._syncDomOrder()
  }

  /**
   * Raise the window an event originated in, skipping the restack/activation
   * churn when it is already on top of its own tier (and, for a document
   * window, already active): otherwise every click inside the front window
   * would bump _zCounter and re-run the whole-fleet activation loop for
   * nothing.
   *
   * Restacks z/active only — deliberately no DOM sync. A focus-driven raise
   * MUST NOT move nodes: moving the window focus just entered re-orders the
   * sequence mid-traversal, and a Shift+Tab that raises each window it
   * enters (pushing it forward in the DOM, back the way the traversal came)
   * would revisit it forever. The pointer path syncs at gesture end instead,
   * which is also the next safe point after any keyboard-session staleness.
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
    this._restack(win)
  }

  /**
   * Delegated pointerdown: raise the window the event originated in. Any
   * press opens the gesture window that defers DOM reordering (see
   * {@link bringToFront}) — a raise can be requested mid-gesture by this
   * press or by code the press runs.
   */
  private _onPointerDown = (event: PointerEvent): void => {
    if (!this._pointerGesture) {
      this._pointerGesture = true
      this._gestureEnd.attach()
    }
    const win = this._windowFromEvent(event)
    if (win) this._raise(win)
  }

  /**
   * The press ended (or was cancelled) — sync the DOM order. Unconditional
   * rather than only-if-raised: the sync no-ops when order already agrees,
   * and running it at every gesture end is what heals the staleness a
   * keyboard-only stretch leaves behind (focus-driven raises change z but
   * never move nodes — see {@link _raise}).
   */
  private _onGestureEnd = (): void => {
    this._gestureEnd.detach()
    this._pointerGesture = false
    this._syncDomOrder()
  }

  /**
   * Delegated focusin: raise the window keyboard focus entered, so tabbing
   * into a background window brings it to front (and reveals its close/zoom
   * widgets) just like a pointerdown would. Ignored while `_syncDomOrder` is
   * putting focus back after a node move — the restore re-fires focusin on
   * an element that may sit in a *background* window, and raising that
   * window would undo the raise that triggered the sync.
   */
  private _onFocusIn = (event: FocusEvent): void => {
    if (this._restoringFocus) return
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

  /** The innermost focused element, through open shadow roots. */
  private _deepActiveElement(): Element | null {
    let el: Element | null = document.activeElement
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
    return el
  }

  /**
   * Re-order the slotted windows in the light DOM to match their z-order
   * (bottom-most first), so sequential focus navigation walks the stack the
   * way the eye does — and Shift+Tab is its exact mirror. The utility band
   * sorts the floating tier after every document window by construction.
   *
   * Minimal-move: windows already in relative order are never touched (the
   * common case — after one raise, one window moves). Non-window siblings
   * (a menu bar, page content) keep their positions; only a window that must
   * cross the stack moves past them. Moving a node containing the focused
   * element drops focus to `<body>`, so it is restored afterwards — behind
   * `_restoringFocus`, because the restore re-fires focusin (see
   * {@link _onFocusIn}) on an element that may sit in a background window.
   * Only runs between pointer gestures or programmatically, never from a
   * focus-driven raise (see {@link _raise} for why).
   */
  private _syncDomOrder(): void {
    if (!this.isConnected) return
    const windows = this._windows
    if (windows.length < 2) return
    const sorted = [...windows].sort(
      (a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0)
    )
    const focused = this._deepActiveElement()
    let moved = false
    let prev: HTMLElement | null = null
    for (const win of sorted) {
      if (
        prev &&
        prev.compareDocumentPosition(win) & Node.DOCUMENT_POSITION_PRECEDING
      ) {
        // `win` stacks above `prev` but sits before it in the DOM.
        this.insertBefore(win, prev.nextSibling)
        moved = true
      }
      prev = win
    }
    if (
      moved &&
      focused instanceof HTMLElement &&
      focused.isConnected &&
      this._deepActiveElement() !== focused
    ) {
      this._restoringFocus = true
      focused.focus({ preventScroll: true })
      this._restoringFocus = false
    }
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    // Written as a host custom property (the self-set-geometry channel, like
    // --vf-scale / --vf-snap-*) so the stylesheet's border stays live against
    // the display; removed at 0 to keep an unbezeled host's inline style
    // clean (a no-op on the first update, where 0 is the class default).
    if (changed.has('bezel')) {
      if (this.bezel > 0) {
        this.style.setProperty('--vf-desktop-bezel', sysLength(this.bezel))
      } else {
        this.style.removeProperty('--vf-desktop-bezel')
      }
    }
  }

  protected override render(): unknown {
    return html`
      <div class="desktop vf-snap" part="desktop">
        <slot @slotchange=${this._onSlotChange}></slot>
        ${this.bezel > 0
          ? html`<div class="corner tl"></div>
              <div class="corner tr"></div>`
          : null}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-desktop': VfDesktop
  }
}
