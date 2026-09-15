import { html, css, LitElement, unsafeCSS, type PropertyValues } from 'lit'
import { property, query, queryAssignedElements } from 'lit/decorators.js'
import { emit } from '../events.js'
import { vfElement } from '../define.js'
import { VfPositioned, placementIn } from '../position.js'
import { vfBase } from '../styles/base.js'
import { tileImage, tileRects, tileSpan } from '../styles/recipes/tile.js'
import { patternOverride, tileGrid, vfTileGrid } from '../tile-grid.js'
import {
  PATTERNS,
  parsePattern,
  patternMotif,
  type Pattern,
  type PatternName,
} from '../patterns.js'
import { PatternFillController, vfPatternFill } from '../pattern-fill.js'
import { ScaleController, effectiveScale, sysLength } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { DocumentListenersController } from '../document-listeners.js'
import { SCREEN_CORNER, steppedCornerClip } from '../pixel-frame.js'

/**
 * The screen's stacking tiers, bottom to top, inside the one stacking context
 * `.screen` isolates: a consumer tile grid (`z-index: -1`), document windows
 * (the counter), utility windows (`counter + UTILITY_Z_BAND`), the menu tier
 * (`MENU_BAR_Z` — a slotted bar or free-standing menu, its dropped panel with
 * it), the drag outline (`DRAG_OUTLINE_Z`, one above the menu tier), the
 * corner mask (the maximal z-index — hardware, in front of every pixel).
 *
 * Both window tiers share the one monotonic counter, so a utility window
 * assigned `counter + BAND` stays above every document window until the
 * counter itself crosses the band — far beyond any real session's restack
 * count; the bar sits a second band up, the same margin above the floating
 * tier. The Menu Manager drew menus over every window, floating ones
 * included, which is why the bar's tier is the desktop's to state (see the
 * `::slotted(vf-menu-bar)` rule): the bar's own `z-index: 1000` serves it
 * outside a desktop, and a slotted sibling in the utility band would outrank
 * it.
 */
const UTILITY_Z_BAND = 1_000_000
const MENU_BAR_Z = 2 * UTILITY_Z_BAND
/** The outline an icon drags as: over windows, palettes and the menu bar alike. */
const DRAG_OUTLINE_Z = MENU_BAR_Z + 1

/**
 * The classic compact Mac raster — the screen an undeclared desktop gets.
 * A desktop ALWAYS has an explicit whole-system-px size (pure CSS sizing is
 * not supported: the host's inline size, written from these properties,
 * wins over a stylesheet); these are just the numbers it starts on.
 */
const DEFAULT_SCREEN_WIDTH = 512
const DEFAULT_SCREEN_HEIGHT = 342

/** The desktop pattern a desktop starts on: the classic 50% dither. */
const DEFAULT_PATTERN: PatternName = 'gray-50'

/**
 * The consumer-token path's geometry. `--vf-desktop-pattern` is documented
 * as a 30-system-px tile — the span of the dither's 2×2 motif — and a
 * consumer's art renders as a placed grid of those (src/tile-grid.ts). The
 * SVG tile states the kit's own dither on that tile for the token's fallback
 * slot: `gray-50` on its minimal cell, two black pixels on the diagonal over
 * an opaque white paper (the authentic black-on-white dither, which is why
 * `--vf-desktop` only shows through a custom token). The kit path itself
 * paints the pattern as the screen's background (the `PatternFillController`
 * below), not through this tile. Declared above the class because
 * `@vfElement` upgrades synchronously at module evaluation, so a module-tail
 * const would be in its temporal dead zone by the time `styles` is read.
 */
const DITHER = patternMotif(PATTERNS[DEFAULT_PATTERN], '#000000', '#ffffff')
const DITHER_TILE = tileImage(DITHER.width, DITHER.height, tileRects(DITHER.rects))

/** The dither's tile size in system px (30) — the box each placed tile spans. */
const DITHER_SPAN = tileSpan(DITHER.width)

/**
 * `<vf-desktop>` — the full-bleed classic desktop container.
 *
 * Renders the desktop pattern — the classic 50% dither by default, or any of
 * the standard patterns by name (`pattern`, System 7's General Controls
 * setting) — and manages the stacking order and `active` state of slotted
 * `vf-window` children: a `pointerdown` or
 * `focusin` (keyboard focus) anywhere inside a window brings it to the front
 * and makes it the single active window. The windows' light-DOM order is kept
 * in step with the stacking order (bottom-most first, synced in a task once
 * any pointer gesture has ended), so tabbing walks the stack the way the eye
 * does and Shift+Tab is its exact mirror.
 *
 * Utility windows (`vf-window[variant="utility"]`) stack in a floating tier
 * above every document-tier window, restack only among themselves, and stand
 * outside the single-active invariant entirely — clicking a palette neither
 * deactivates the active document window nor greys the palette, exactly as
 * System 7's floating windoids behaved while their application was frontmost.
 * A slotted `vf-menu-bar` (or a free-standing `vf-menu`) sits on a tier
 * above both, so its dropped menus cover palettes and document windows
 * alike; only the screen-corner mask is in front of it.
 *
 * **Deactivation.** On a real System 7 machine clicking the desktop clicked
 * the *Finder* — the frontmost application's windows lost their stripes.
 * {@link clearActive} is that gesture's handler: it clears `active` from
 * the whole document tier, and **zero active windows is a legal state**,
 * held until a press or keyboard focus re-enters a document window (or a
 * new one is slotted, which activates it — opening a window brings its
 * application forward). The desktop never takes this decision itself: its
 * furniture is slotted light DOM (an icon layer, say), so only the page
 * knows which of its children — or which presses on the bare dither — mean
 * "the Finder", and it routes those through `clearActive()`. Left alone,
 * the classic always-one-active behavior is unchanged. {@link activeWindow}
 * reads the current holder, and every change of holder — including to and
 * from none — fires `vf-activate`.
 *
 * The desktop is a raster with an explicit size, always: **`width` and
 * `height`**, in system px, the way a WIND resource declared a window's —
 * the host box renders at the declared screen plus `2 × bezel` per axis, a
 * whole number of system pixels by construction (default 512×342, the
 * compact Mac's screen). Pure CSS sizing is not supported; the page sets
 * the numbers — directly, or via {@link VfDesktop.fitWithin} on
 * `resize`/`onScaleChange` for a viewport-filling desktop — and positions
 * the sized box with its own stylesheet, keeping any sub-system-pixel
 * slack on its side. `bezel` (system px) draws the black screen surround —
 * the CRT's unlit margin — around the screen, rounding its four corners
 * with the classic corner mask.
 *
 * **`pattern`** names the desktop pattern — `gray-50` (the dither) by
 * default, any of the 38 standard patterns (docs/PATTERNS.md), or sixteen
 * hex digits stating a custom 8×8 pattern, as on `vf-container`. It is
 * painted as the screen's own background: black ink on an opaque white
 * paper, one whole-surface raster at one image px per system px, 1-bit at
 * every density and zoom (src/pattern-fill.ts).
 *
 * **The drag surface.** The Finder dragged an icon as a dotted outline drawn
 * on the *screen*, clipped at its edge and phase-locked to its raster, so
 * the screen hosts the layer that outline draws on: a full-bleed child of
 * the screen, `pointer-events: none` (never a hit for the page's
 * `elementsFromPoint`), whose children paint one tier above the menu bar
 * and under the corner mask — the layer itself is deliberately no stacking
 * context, since a blend inside one would composite against nothing. An
 * icon reaches it without an import, the menu-handshake idiom: on a drag's
 * first step it dispatches `vf-drag-surface-request` (bubbles, non-composed,
 * `detail.surface` null), and the nearest desktop on its light-DOM path
 * fills the detail with the layer. Not the top layer: stable Safari cannot
 * blend an element there against the page (src/cursor.ts), and a second
 * kit entry in the top layer would need a re-promotion handshake.
 *
 * Custom properties:
 * - `--vf-desktop-pattern` — a consumer's own tile art in place of the
 *   pattern (the kit's default is a 1-bit 50% checker, opaque
 *   black-on-white on a 30-system-px tile). Set, it wins over `pattern` and
 *   renders as a placed tile grid at that same 30-px geometry
 *   (src/tile-grid.ts); a token swapped at runtime without touching the
 *   component wants a `requestUpdate()`.
 * - `--vf-desktop` — base color painted *under* the pattern (default
 *   `#808080`). The pattern's paper is opaque, so this only becomes visible
 *   when `--vf-desktop-pattern` is overridden with a tile that has
 *   transparent cells (or with `none`).
 *
 * @slot - Default slot: menu bar, windows, anything.
 * @fires vf-activate - The active document-tier window changed. Detail
 *   `{ window: HTMLElement | null }` — the new holder, or `null` when the
 *   document tier deactivated (a {@link clearActive} call, or the active
 *   window leaving the DOM with none behind it). Fired once per change of
 *   holder, never for a re-assertion of the same one.
 * @csspart desktop - The patterned screen surface — the whole-system-px
 *   raster (inset by `bezel` when one is set).
 * @cssprop [--vf-desktop=#808080] - base color under the desktop pattern —
 *   occluded by the pattern's opaque paper, so it only shows through a
 *   custom `--vf-desktop-pattern`
 * @cssprop --vf-desktop-pattern - a consumer's own desktop tile, in place of
 *   `pattern` — the kit's default is the 50% checker drawn as opaque
 *   black-on-white rects on a 30-system-px tile. Override the whole tile;
 *   consumer art renders as a placed tile grid at that same geometry (raster
 *   art magnifies nearest-neighbor, the `vf-img` idiom)
 */
@vfElement('vf-desktop')
export class VfDesktop extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    vfTileGrid,
    vfPatternFill,
    css`
      :host {
        display: block;
        position: relative;
      }
      .desktop {
        position: relative;
        width: 100%;
        height: 100%;
      }
      /* The bezel surface: the unlit black margin a compact Mac's CRT showed
         between the raster and the case. Painted only when bezeled, so an
         unbezeled desktop's paint is exactly the screen's. */
      .desktop.bezeled {
        background: var(--vf-black, #000);
      }
      .screen {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        /* Clip here rather than on the host so dragged windows crop at the
           raster's corrected edge, not the host's possibly-fractional one. */
        overflow: hidden;
        /* An isolated stacking context, so the tile grid's z-index: -1 below
           resolves HERE — above this element's own background, under every
           slotted child. Without it the negative z-index would resolve
           against some ancestor stacking context and paint the tiles beneath
           this background. */
        isolation: isolate;
        /* The base color. Under the kit pattern it is covered by the fill's
           opaque white paper (vfPatternFill) — the authentic black-on-white
           dither — and shows only through a consumer token's translucent
           tile (see the --vf-desktop note in the class doc). The pattern
           itself is this element's own background, written by the
           PatternFillController: one whole-surface raster at one image px
           per system px, magnified nearest-neighbor, which is what keeps it
           1-bit at the zoom-minted scales a repeating fill cannot hold
           (src/tile-grid.ts, src/pattern-fill.ts). */
        background-color: var(--vf-desktop, #808080);
        /* Forced colors: the pattern is literal black ink on white, which
           ignores a dark theme entirely. A backdrop is decoration, and
           high-contrast mode is a request for less of that — so the desktop
           goes flat Canvas (the forced background-color) rather than
           re-dithering in the user's pair. Deliberate; the windoid dot bar,
           which carries meaning, IS re-inked (see vfDots). The recipe drops
           the image too; stated here as well so the posture lives with the
           surface. */
        @media (forced-colors: active) {
          background-image: none;
        }
      }
      /* A consumer token's exact fill — the placed tile grid — kept under
         every slotted child (menu bar, windows) by the negative z-index the
         .screen isolation scopes. The grid's tiles resolve the token stated
         once here rather than per tile; the fallback is the kit dither for
         the record, never reached (the grid renders only under a set token). */
      .screen > .vf-tile-grid {
        position: absolute;
        inset: 0;
        z-index: -1;
        --_vf-tile-image: var(--vf-desktop-pattern, ${unsafeCSS(DITHER_TILE)});
        /* Forced colors: hidden with the pattern, same posture. */
        @media (forced-colors: active) {
          display: none;
        }
      }
      /* Bezeled, the screen is inset by exactly one bezel width. The host
         is always the declared screen + 2×bezel (written in updated()), so
         this subtraction is exact and the raster is whole by construction —
         a page's sub-system-pixel slack never enters the component. */
      .bezeled .screen {
        top: var(--vf-desktop-bezel, 0px);
        left: var(--vf-desktop-bezel, 0px);
        width: calc(100% - 2 * var(--vf-desktop-bezel, 0px));
        height: calc(100% - 2 * var(--vf-desktop-bezel, 0px));
      }
      /* Slotted windows need a positioning context so z-index applies.
         (An inline position: absolute set by a movable window wins.) */
      ::slotted(vf-window) {
        position: relative;
      }
      /* The menu tier: a slotted bar, or a free-standing menu placed on the
         desktop, sits above both window tiers (MENU_BAR_Z), so a dropped
         menu paints over a floating palette exactly as it does over a
         document window. Stated here rather than left to the bar's own
         :host z-index (1000, which the utility band outranks): an outer
         tree's ::slotted declaration beats the inner tree's :host one, so the
         desktop that hands out the window bands owns this band too. Under
         the corner mask, like everything. */
      ::slotted(vf-menu-bar),
      ::slotted(vf-menu) {
        position: relative;
        z-index: ${MENU_BAR_Z};
      }
      /* The drag surface (see the class doc): the box an icon's outline is
         positioned in — the screen's own, bezel excluded — clipped with
         everything else at the raster's edge, and never a hit. No z-index
         and no position: relative + z-index of its own: a stacking context
         is an isolated group, and the outline's mix-blend-mode would then
         composite against the empty layer instead of the windows and dither
         beneath. The z-index goes on the outline itself, which is what puts
         it on the tier above the menu bar within .screen's own context. */
      .drag-surface {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .drag-surface > * {
        z-index: ${DRAG_OUTLINE_Z};
      }
      /* With a bezel, the screen's four corners wear the SCREEN_CORNER mask,
         rounding into the surrounding black; the bottom pair is the same
         staircase mirrored vertically. Children of .screen, so they anchor to
         the raster's own corners (the top pair over a slotted menu bar's,
         which sit in the same place). The hardware mask was in front of every
         pixel — a window dragged into a corner slides under it — hence the
         maximal z-index. */
      .corner {
        position: absolute;
        width: calc(var(--vf-scale, 1) * ${SCREEN_CORNER[0]!}px);
        height: calc(var(--vf-scale, 1) * ${SCREEN_CORNER.length}px);
        background: var(--vf-black, #000);
        pointer-events: none;
        z-index: 2147483647;
      }
      .corner.tl {
        top: 0;
        left: 0;
        clip-path: ${unsafeCSS(steppedCornerClip(SCREEN_CORNER, 'left'))};
      }
      .corner.tr {
        top: 0;
        right: 0;
        clip-path: ${unsafeCSS(steppedCornerClip(SCREEN_CORNER, 'right'))};
      }
      .corner.bl {
        bottom: 0;
        left: 0;
        clip-path: ${unsafeCSS(steppedCornerClip(SCREEN_CORNER, 'left', 'bottom'))};
      }
      .corner.br {
        bottom: 0;
        right: 0;
        clip-path: ${unsafeCSS(steppedCornerClip(SCREEN_CORNER, 'right', 'bottom'))};
      }
    `,
  ]

  /**
   * Screen width in system px — the raster's own size, the way a WIND
   * resource declared a window's. The host box renders at exactly
   * `width + 2 × bezel` system px, always whole; a desktop is never sized
   * by page CSS — the page sets these numbers (directly or via
   * {@link fitWithin}) and positions the explicitly sized box with its own
   * stylesheet, keeping whatever sub-system-pixel slack its layout has on
   * its side of the fence. Defaults to the compact Mac's 512.
   */
  @property({ type: Number }) width = DEFAULT_SCREEN_WIDTH

  /** Screen height in system px; see {@link width}. Defaults to 342. */
  @property({ type: Number }) height = DEFAULT_SCREEN_HEIGHT

  /**
   * Width of the black screen bezel, in system px (`0` = none), added onto
   * the declared screen on every side — a `width="502" bezel="5"` desktop
   * renders a 512-system-px host box. The compact Mac's CRT showed an
   * unlit black margin between the desktop's raster and the case; `bezel`
   * draws it around the screen and puts the classic screen-corner mask on
   * all four of the screen's corners. Flow, window coordinates and the drag
   * clip all belong to the screen, so windows crop at its edge. Inside a
   * bezeled desktop a menu bar needs no `rounded` of its own — the desktop's
   * top pair lands on the same pixels.
   */
  @property({ type: Number }) bezel = 0

  /**
   * The desktop pattern — System 7's General Controls setting. A library
   * pattern by name (`gray-50`, the classic dither, by default; `gray-75`,
   * `bricks`, … — docs/PATTERNS.md) or sixteen hex digits stating a custom
   * 8×8 pattern, as on `vf-container`. Painted black on opaque white over
   * the whole screen, 1-bit at every density and zoom. A
   * `--vf-desktop-pattern` token override still wins and renders the
   * consumer's tile as a placed grid; an unrecognized value warns once and
   * keeps the dither.
   */
  @property() pattern: string | null | undefined = DEFAULT_PATTERN

  /**
   * Size the screen to the largest whole-system-px raster whose host box —
   * bezel included — fits a CSS-px bound, and return what was set. The
   * page's half of the sizing contract: it owns the viewport, so it
   * measures the box and hands it here on `resize` and `onScaleChange`
   * (zoom and density moves change how many CSS px a system px costs),
   * and the sub-system-pixel remainder stays on the page, behind the
   * bezel. The epsilon forgives float error in the division so an
   * exact-fit bound never drops a whole system pixel.
   */
  fitWithin(maxWidth: number, maxHeight: number): { width: number; height: number } {
    const s = effectiveScale(this)
    const fit = (cssPx: number): number =>
      Math.max(0, Math.floor(cssPx / s + 1e-6) - 2 * this.bezel)
    this.width = fit(maxWidth)
    this.height = fit(maxHeight)
    return { width: this.width, height: this.height }
  }

  /**
   * A viewport point (CSS px) as a placement on the screen — `{ left, top }`
   * in whole system px on the placement lattice, measured from the raster's
   * corner with the bezel excluded: the pair a child dropped onto the desktop
   * is written with. The screen sits in the shadow tree, which is why the
   * conversion is a method here. With `child`, the pair to write to that
   * element: the offset its `origin` adds is folded in, so its box's corner
   * lands on the point.
   */
  placementAt(
    clientX: number,
    clientY: number,
    child?: Element
  ): { left: number; top: number } {
    return placementIn(this.screen ?? this, clientX, clientY, this, child)
  }

  /** Slotted `vf-window` children (direct children only). */
  @queryAssignedElements({ selector: 'vf-window' })
  private _windows!: HTMLElement[]

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * The consumer's `--vf-desktop-pattern` override, or `''` for the kit
   * pattern — which of the two exact-fill paths render() takes (see
   * src/tile-grid.ts). Re-read every update; a token swapped at runtime
   * without touching the component wants a `requestUpdate()`.
   */
  private _token = ''

  /** `pattern`, resolved — the kit path's art; the dither when unset. */
  private _desktopPattern: Pattern = PATTERNS[DEFAULT_PATTERN]

  /** One warning per element for an unrecognized `pattern`, not per render. */
  #warnedPattern = false

  /** The screen surface the pattern paints on; exists from the first render. */
  @query('.screen') private readonly screen!: HTMLDivElement

  /** The layer a dragged icon's outline draws on; exists from the first render. */
  @query('.drag-surface') private readonly dragSurface!: HTMLDivElement

  /**
   * The desktop pattern, painted as the screen's own background
   * (src/pattern-fill.ts) from the declared raster — scale-independent, so
   * density and zoom re-encode nothing — and silent while a consumer token
   * owns the fill.
   */
  private readonly patternFill = new PatternFillController(this, {
    getBox: () => this.screen,
    getPattern: () => (this._token ? null : this._desktopPattern),
    getSize: () => ({
      width: this.width ?? DEFAULT_SCREEN_WIDTH,
      height: this.height ?? DEFAULT_SCREEN_HEIGHT,
    }),
  })

  /** Monotonic z-index counter for window stacking. */
  private _zCounter = 0

  /**
   * The active document-tier window, or null when the tier is deactivated
   * (or empty). The single change-tracked truth behind {@link activeWindow}
   * and the `vf-activate` event — written only by {@link _setActive}.
   */
  private _activeWindow: HTMLElement | null = null

  /**
   * Whether the document tier was *deliberately* deactivated (a
   * {@link clearActive} call) — as opposed to `_activeWindow` being null
   * because nothing has activated yet. Slot changes preserve a deliberate
   * deactivation instead of promoting a survivor; a newly slotted document
   * window still activates (opening a window brings its application forward).
   */
  private _deactivated = false

  /** Whether a one-shot post-upgrade re-normalization is already pending. */
  private _awaitingUpgrade = false

  /** Whether a pointer gesture that began on the desktop is still in flight. */
  private _pointerGesture = false

  /** Whether {@link _syncDomOrder} is putting focus back after a node move. */
  private _restoringFocus = false

  /** The pending DOM-order sync task, or 0 (see {@link _requestDomSync}). */
  private _domSyncTimer = 0

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
    this.addEventListener('vf-drag-surface-request', this._onDragSurfaceRequest)
  }

  override disconnectedCallback(): void {
    this.removeEventListener('pointerdown', this._onPointerDown)
    this.removeEventListener('focusin', this._onFocusIn)
    this.removeEventListener('vf-drag-surface-request', this._onDragSurfaceRequest)
    // The controller detaches the document listeners; drop the flag with
    // them so a reconnected desktop doesn't sit on a stale deferral.
    this._pointerGesture = false
    if (this._domSyncTimer) {
      clearTimeout(this._domSyncTimer)
      this._domSyncTimer = 0
    }
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
   * reachable only travelling backwards. The sync runs in a task, and not
   * before any in-flight pointer gesture has ended — moving a node clears the
   * pointer capture a title-bar drag or grow-box resize holds on it (a
   * background window must stay draggable in the same gesture that raises
   * it), and a node moved between a press's release and its `click` costs a
   * control in the raised window that click (see {@link _requestDomSync}).
   */
  bringToFront(win: HTMLElement): void {
    this._restack(win)
    this._requestDomSync()
  }

  /** The active document-tier window, or null while the tier is deactivated
   *  (or has no windows). Utility windows are never the holder. */
  get activeWindow(): HTMLElement | null {
    return this._activeWindow
  }

  /**
   * Deactivate the whole document tier — clear `active` from every document
   * window, leaving none the holder. Pages route "the user clicked the
   * Finder" presses — on the bare dither, on their own desktop furniture
   * (an icon layer) — through here; the deactivated state holds until a
   * document window is pressed, focused, brought to front, or newly
   * slotted.
   */
  clearActive(): void {
    this._deactivated = true
    this._setActive(null)
  }

  /** The z/active half of a raise, shared by every path. */
  private _restack(win: HTMLElement): void {
    const utility = this._isUtility(win)
    win.style.zIndex = String(++this._zCounter + (utility ? UTILITY_Z_BAND : 0))
    if (!utility) this._setActive(win)
  }

  /**
   * Schedule the DOM-order sync: one task from now, coalesced, and never
   * while a pointer is down — the gesture's end schedules it instead.
   *
   * A task rather than the synchronous move this used to be, because the
   * browser dispatches a release's pointerup, mouseup and click in ONE task,
   * and Chromium drops a click whose mousedown node left the tree before the
   * click was dispatched — and re-inserting a window is a removal. Synced at
   * pointerup, a raise moved the window between the press and its click, so
   * a control in a background window (a checkbox in a palette under another
   * palette) got its press and release but never its click: it looked
   * pressed and never acted. Not a microtask either — that runs between the
   * listeners of the same dispatch, still ahead of the click. A task runs
   * after the whole chain, the shape `deferActivation` (src/events.ts) falls
   * back on for the same reason.
   */
  private _requestDomSync(): void {
    if (this._pointerGesture || this._domSyncTimer) return
    this._domSyncTimer = window.setTimeout(() => {
      this._domSyncTimer = 0
      // A press that began meanwhile re-defers: its own end schedules again.
      if (!this._pointerGesture) this._syncDomOrder()
    }, 0)
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
   * would revisit it forever. The pointer path schedules the sync at gesture
   * end instead, which is also the next safe point after any keyboard-session
   * staleness.
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
   * The press ended (or was cancelled) — schedule the DOM-order sync.
   * Unconditional rather than only-if-raised: the sync no-ops when order
   * already agrees, and running it after every gesture is what heals the
   * staleness a keyboard-only stretch leaves behind (focus-driven raises
   * change z but never move nodes — see {@link _raise}).
   */
  private _onGestureEnd = (): void => {
    this._gestureEnd.detach()
    this._pointerGesture = false
    this._requestDomSync()
  }

  /**
   * A dragged icon asking for the screen's drag surface (see the class
   * doc). Non-composed, so it reaches here only through the light-DOM path
   * the icon is slotted on — a window body included. The nearest desktop
   * answers; an outer one leaves a filled detail alone.
   */
  private _onDragSurfaceRequest = (event: Event): void => {
    const detail = (event as CustomEvent<{ surface: HTMLElement | null }>).detail
    if (!detail || detail.surface) return
    detail.surface = this.dragSurface
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
    // Resolve who should hold `active` after the mutation. A newly slotted
    // document window takes it (opening a window brings its application
    // forward — this also ends a deliberate deactivation); otherwise a
    // still-present holder keeps it, a deliberate deactivation is preserved
    // (never promote a survivor over the user's "clicked the Finder"), and
    // only then does the topmost survivor inherit — the active window left
    // the DOM. Applied even when null, so a stray `active` attribute on
    // slotted markup is normalized in the deactivated state too.
    const docTier = windows.filter((w) => !this._isUtility(w))
    const kept =
      this._activeWindow && docTier.includes(this._activeWindow)
        ? this._activeWindow
        : null
    this._setActive(
      newest ?? kept ?? (this._deactivated ? null : this._topmost(docTier))
    )
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
      // the holder is whoever slotchange resolved — re-asserted through the
      // same funnel (silent when unchanged), which also re-clears the tier
      // if the resolution was "none" (a deliberate deactivation, or no
      // document windows at all).
      const docTier = this._windows.filter((w) => !this._isUtility(w))
      const kept =
        this._activeWindow && docTier.includes(this._activeWindow)
          ? this._activeWindow
          : null
      this._setActive(
        kept ?? (this._deactivated ? null : this._topmost(docTier))
      )
    })
  }

  /** Set `active` on `win` only, clearing it on every other *document-tier*
   *  window (`null` clears the whole tier — the deactivated state). Utility
   *  windows stand outside the invariant: a palette keeps whatever `active`
   *  state it has (true by default, so its dither and widgets stay drawn
   *  while document windows trade the highlight). The one write site of
   *  {@link _activeWindow}, so `vf-activate` fires exactly on a change of
   *  holder — re-asserting the current holder is silent. */
  private _setActive(win: HTMLElement | null): void {
    if (win) this._deactivated = false
    for (const other of this._windows) {
      if (this._isUtility(other)) continue
      this._setWindowActive(other, other === win)
    }
    if (win !== this._activeWindow) {
      this._activeWindow = win
      emit(this, 'vf-activate', { window: win })
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
   * Reached only through {@link _requestDomSync}'s task — after a pointer
   * gesture or a programmatic raise, never from a focus-driven one (see
   * {@link _raise} for why).
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

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    this._token = patternOverride(this, '--vf-desktop-pattern')
    if (changed.has('pattern')) {
      const parsed = parsePattern(this.pattern)
      if (parsed === null && this.pattern?.trim() && !this.#warnedPattern) {
        this.#warnedPattern = true
        console.warn(
          `vf-desktop: unknown pattern "${this.pattern}" — a library name ` +
            `(docs/PATTERNS.md) or sixteen hex digits. Keeping ${DEFAULT_PATTERN}.`
        )
      }
      this._desktopPattern = parsed ?? PATTERNS[DEFAULT_PATTERN]
    }
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    // Written as a host custom property (the self-set-geometry channel, like
    // --vf-scale / --vf-snap-*) so the stylesheet's inset stays live against
    // the display; removed at 0 to keep an unbezeled host's inline style
    // clean (a no-op on the first update, where 0 is the class default).
    if (changed.has('bezel')) {
      if (this.bezel > 0) {
        this.style.setProperty('--vf-desktop-bezel', sysLength(this.bezel))
      } else {
        this.style.removeProperty('--vf-desktop-bezel')
      }
    }
    // The declared raster, written as the host's size with the bezel added
    // on — a live sysLength, so it tracks the display like every declared
    // metric. Written on the first update too (the properties have
    // defaults), which is what makes "a desktop always has an explicit
    // whole size" total: the inline size wins over any page stylesheet.
    // The ?? guards attribute removal, which Lit's Number converter hands
    // back as null — the raster falls back to the classic screen.
    if (changed.has('width') || changed.has('height') || changed.has('bezel')) {
      const w = this.width ?? DEFAULT_SCREEN_WIDTH
      const h = this.height ?? DEFAULT_SCREEN_HEIGHT
      this.style.width = sysLength(w + 2 * this.bezel)
      this.style.height = sysLength(h + 2 * this.bezel)
    }
  }

  protected override render(): unknown {
    // The kit pattern is the screen's own background, painted by the
    // PatternFillController from the declared raster. A consumer token's
    // fill is the placed tile grid at the token's documented 30-px tile
    // geometry, its count from that same declared raster (the ?? fallbacks
    // updated() applies) — scale-independent, so density and zoom changes
    // re-render nothing; every length is live against --vf-scale. See
    // src/tile-grid.ts and src/pattern-fill.ts for why each path is exact.
    const w = this.width ?? DEFAULT_SCREEN_WIDTH
    const h = this.height ?? DEFAULT_SCREEN_HEIGHT
    const fill = this._token
      ? html`<div class="vf-tile-grid">
          ${tileGrid({
            cols: Math.ceil(w / DITHER_SPAN),
            rows: Math.ceil(h / DITHER_SPAN),
            tile: DITHER_SPAN,
          })}
        </div>`
      : null
    return html`
      <div class=${this.bezel > 0 ? 'desktop vf-snap bezeled' : 'desktop vf-snap'}>
        <div
          class="screen vf-pattern-fill${this._token ? '' : ' vf-patterned'}"
          part="desktop"
        >
          ${fill}
          <slot @slotchange=${this._onSlotChange}></slot>
          <div class="drag-surface"></div>
          ${this.bezel > 0
            ? html`<div class="corner tl"></div>
                <div class="corner tr"></div>
                <div class="corner bl"></div>
                <div class="corner br"></div>`
            : null}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-desktop': VfDesktop
  }
}
