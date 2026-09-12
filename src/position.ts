import type { LitElement, ReactiveController } from 'lit'
import { property } from 'lit/decorators.js'
import { emit } from './events.js'
import { effectiveScale, snapSys, sysLength, toSysExact } from './scale.js'

type Constructor<T = object> = new (...args: any[]) => T

/**
 * The nine placement origins — which point of a placed element's own box
 * `left`/`top` place, the vertical keyword first. `top left` is the default.
 */
export type PlacementOrigin =
  | 'top left'
  | 'top center'
  | 'top right'
  | 'center left'
  | 'center'
  | 'center right'
  | 'bottom left'
  | 'bottom center'
  | 'bottom right'

/** Where each origin sits on the box, as fractions of its width and height. */
type OriginPoint = readonly [fx: number, fy: number]

const ORIGIN_POINTS = new Map<PlacementOrigin, OriginPoint>([
  ['top left', [0, 0]],
  ['top center', [0.5, 0]],
  ['top right', [1, 0]],
  ['center left', [0, 0.5]],
  ['center', [0.5, 0.5]],
  ['center right', [1, 0.5]],
  ['bottom left', [0, 1]],
  ['bottom center', [0.5, 1]],
  ['bottom right', [1, 1]],
])

const TOP_LEFT = ORIGIN_POINTS.get('top left')!

/** A system-px offset, `{ x, y }`. */
type Offset = { x: number; y: number }

const NO_OFFSET: Readonly<Offset> = { x: 0, y: 0 }

/**
 * The origin point's offset from the box's top-left corner, in whole system
 * px, for a border box of `width` × `height` CSS px. The box is rounded to
 * whole system px first, and the ceiling sends an odd size's leftover half
 * toward the start (left, up) — the tie rule `vf-stack`'s centering and the
 * title bar's title patch already use.
 */
function originOffset(
  width: number,
  height: number,
  [fx, fy]: OriginPoint,
  scale: number
): Offset {
  return {
    x: Math.ceil(Math.round(width / scale) * fx),
    y: Math.ceil(Math.round(height / scale) * fy),
  }
}

/**
 * The mixin's surface, as a `declare class` for the same TS4094 reason
 * {@link VfToggleControlInterface} states: TypeScript cannot name the
 * anonymous class a mixin returns when emitting declarations. Keep it in sync
 * with the implementation below.
 */
export declare abstract class VfPositionedInterface extends LitElement {
  top?: number | null
  left?: number | null
  fixed: boolean
  origin?: PlacementOrigin | null
}

/** A host that takes the placement trio and its origin. */
type PositionedHost = HTMLElement & {
  top?: number | null
  left?: number | null
  fixed?: boolean
  origin?: string | null
}

/**
 * The outer display a placed host takes. `position: absolute` blockifies by
 * itself; `position: sticky` does not, and an inline-level fixed host would
 * sit in a line box — a footprint no margin can cancel.
 */
const BLOCKIFIED: Record<string, string> = {
  inline: 'block',
  'inline-block': 'block',
  'inline-flex': 'flex',
  'inline-grid': 'grid',
  'inline-table': 'table',
}

/**
 * Explicit placement — `top`/`left` in whole system px, on **every** component.
 *
 * No exceptions, deliberately. These are web components, and a consumer may put
 * one wherever they like; the kit does not get to decide that a `vf-option` is
 * only ever a popup row. The rows a container normally owns (`vf-option`,
 * `vf-menu-item`, `vf-list-item`) and a bar's `vf-menu` take the pair on the
 * same terms as anything else — and stating an origin on one *inside* its
 * managing parent does take it out of that parent's flow layout, which is the
 * placement working, not failing. Each of those components documents what its
 * container stops doing for it. `vf-dialog` takes the pair in viewport
 * coordinates, the one difference the platform forces (see modal-dialog.ts).
 *
 * A DITL resource laid a dialog out as a list of items, each with a rectangle
 * in the window's own coordinates; arranging controls by stating where they go
 * is as native to System 7 as stacking them. This mixin is that mechanism:
 * declaring `top` or `left` takes the element out of normal flow and
 * absolutely positions it within its parent, both coordinates in the art's own
 * unit so the position scales with the display like every other metric. A
 * window or dialog body can be laid out either way — a tree of `vf-stack`s, or
 * positioned children — with no stylesheet in either case.
 *
 * Mechanics, mirroring how `vf-stack` writes its declared size:
 *
 * - Setting either property writes `position: absolute` and both offsets onto
 *   the host's inline style as `calc(var(--vf-scale, 1) * Npx)` — live against
 *   the display, resolved at paint time. The coordinate left unset is 0.
 * - `right`/`bottom` are released to `auto` and `margin` zeroed, so the stated
 *   offsets are the whole story — an auto-width box with both edges set would
 *   stretch rather than sit (the `vf-icon` seed logic, generalized).
 * - Unsetting both returns the element to normal flow: every inline
 *   declaration this wrote is removed, and stylesheet values resume.
 *
 * The anchor is CSS's own: the nearest positioned ancestor's padding box. The
 * kit's containers are all deliberate anchors — a desktop's raster, a window's
 * or a dialog's content region (the frame's inner edge, below any title bar,
 * with no inset — flow content starts there too, exactly the DITL
 * convention), a stack's box, a fieldset's border box, a scroll area's
 * scrolled plane. In a non-kit parent, give the parent `position: relative`,
 * the one line of CSS this feature can't write for you.
 *
 * The writing rides a {@link ReactiveController} (`hostUpdated`) rather than
 * an `updated()` override, for a lifecycle reason worth keeping in the source:
 * the mixin sits *under* each component class, and most components override
 * `updated()` without calling `super.updated()` — Lit's base is a no-op, so
 * nothing ever forced the call — which would silently shadow a mixin-level
 * override. A controller is invoked by ReactiveElement itself, after every
 * update, no matter what the subclass does.
 *
 * A gesture writes **through these properties**: `vf-window`'s title-bar drag
 * and `vf-icon`'s drag and arrow nudge hand their new origin to a
 * {@link PlacementController}, which snaps it onto the placement lattice and
 * sets `left`/`top`. A moved element is therefore placed exactly the way an
 * authored one is — a live `calc()` in the art's own unit — and stays where it
 * was dropped when the zoom or the display changes what a system px costs.
 *
 * It did not always. Writing the resolved CSS px straight to the inline style
 * froze the coordinate in the wrong unit: `--vf-scale` moved under it at every
 * zoom step and the same constant read back as a different number of system px,
 * so moved windows and icons slid off the grid the rest of the kit stayed on
 * (by `3z / round(3z)` — 10% at 110% zoom, where nothing else moves at all).
 *
 * Setting a property yourself is still the deliberate way to re-place a moved
 * element. The controller re-applies **only when the values changed**, so an
 * unrelated update — a heading change, a desktop toggling `active` — never
 * re-asserts a coordinate and costs nothing.
 *
 * **Every write it makes is announced** as `vf-placement-change` (bubbles,
 * `composed: false`, detail `{ left, top }` — nulls on a return to flow). It
 * is an internal coordination event on the terms of the menu handshakes:
 * parent and child share one light tree, and a kit protocol must not leak out
 * of a consumer's shadow boundary. `vf-scroll-area` listens for it and
 * re-measures, because a placed child moved through `top`/`left` changes the
 * scroll range with no box changing anywhere a ResizeObserver can see — the
 * plane's box is never grown by an absolutely positioned child. One funnel
 * covers a drop, an arrow nudge and a page's own `icon.left = …` alike.
 *
 * **`origin`** names which point of the host's own box the pair places —
 * nine keywords, vertical then horizontal (`top center`, `bottom right`,
 * `center`), `top left` the default. A title stays centered on its `left`
 * whatever its text; a button group keeps its bottom-right corner in from
 * the dialog's however long its labels run. The point is measured, not
 * transformed: the controller reads the host's border box in whole system px
 * (w × h) and writes `left` as the stated `L` less ⌈w·fx⌉ (`fx` 0, ½ or 1),
 * `top` the same way — the ceiling sends an odd size's leftover half toward
 * the start, the tie rule the kit's other centering uses. A ResizeObserver
 * keeps the offset current through a relabel or a late font, and each such
 * rewrite is announced like any other write. A zoom step changes CSS px, not
 * system px, so it recomputes the same offset. `translate: -50% 0` would have
 * been the no-JavaScript version, and fails twice: a percentage of an odd
 * width is half a pixel, which smears the 1-bit art, and a transform makes
 * the host the containing block for `position: fixed` descendants — a placed
 * group holding a `vf-select` would trap its list. `top left` is the plain
 * code path: no observer, no measurement, the same inline style as before
 * the attribute existed. An unknown value places as `top left` and warns once
 * per element. On its own the attribute places nothing: it changes what the
 * pair means, and is inert on a host in flow.
 *
 * **`fixed`** holds the placement against the *visible* region of the nearest
 * scrolling ancestor instead of its scrolled plane — a tool strip over a
 * document, a column header over rows — and the flag alone places at (0,0).
 * The engine underneath is `position: sticky`, the one way the platform holds
 * a box against a scrollport from inside it on the compositor (a scroll
 * listener counter-translating lags a frame; a layer outside the scroller
 * stops wheel and touch over it). Sticky boxes stay in flow, which is not
 * what a placement is, so the controller erases the footprint: the host is
 * blockified (no line box), shrink-wrapped, and given a negative right/bottom
 * margin equal to its own box — a 0×0 margin box that flow content lays out
 * as if it weren't there, measured by a ResizeObserver so a relabel or a zoom
 * step keeps it exact. `z-index: 1` puts it over the plane's placed children,
 * which is where a fixed strip belongs. Two facts of the engine that the
 * docs state as rules: sticky only ever pushes a box *down* from where the
 * flow put it, so a fixed child comes before the flow content in its parent;
 * and a scroll container that never scrolls (a plain window body is
 * `overflow: hidden`) holds it exactly where placement would.
 */
export const VfPositioned = <T extends Constructor<LitElement>>(Base: T) => {
  class VfPositionedElement extends Base {
    /**
     * Offset from the top of the positioning parent, in whole system px.
     * Setting this (or `left`) absolutely positions the element within its
     * parent; the coordinate left unset is 0. Remove both to return the
     * element to normal flow.
     */
    @property({ type: Number }) top?: number | null

    /**
     * Offset from the left of the positioning parent, in whole system px.
     * See {@link top}.
     */
    @property({ type: Number }) left?: number | null

    /**
     * Hold the placement against the visible region of the nearest scrolling
     * ancestor: the element keeps its stated `top`/`left` while the content
     * scrolls under it, and the flag alone places it at (0,0). It comes
     * before the flow content in its parent. Where nothing scrolls it renders
     * exactly as placed.
     */
    @property({ type: Boolean, reflect: true }) fixed = false

    /**
     * Which point of the element's own box `top`/`left` place: one of nine
     * keywords, vertical then horizontal — `top left` (the default), `top
     * center`, `top right`, `center left`, `center`, `center right`, `bottom
     * left`, `bottom center`, `bottom right`. The point is measured in whole
     * system px and kept current as the box changes; an odd size's leftover
     * half goes toward the start. An unknown value places as `top left` and
     * warns once. On its own it places nothing.
     */
    @property({ reflect: true }) origin?: PlacementOrigin | null

    constructor(...args: any[]) {
      super(...args)
      new PositionController(this)
    }
  }

  return VfPositionedElement as Constructor<VfPositionedInterface> & T
}

/** Each positioned host's controller, for the offset its origin adds. */
const controllers = new WeakMap<Element, PositionController>()

/**
 * The offset `el`'s stated pair sits from its box's top-left corner, in
 * whole system px — what its `origin` adds, and `(0, 0)` for an element
 * with none, or with no placement controller at all.
 */
function placementOffset(el: Element): Readonly<Offset> {
  return controllers.get(el)?.offset ?? NO_OFFSET
}

/**
 * Held by the host's controller list — no field on the element class, so the
 * mixin adds nothing TS4094 would trip over.
 */
class PositionController implements ReactiveController {
  readonly #host: LitElement & PositionedHost

  /** Last values written, valid only while {@link #applied}. */
  #appliedTop: number | null = null
  #appliedLeft: number | null = null
  #appliedFixed = false
  #appliedOrigin: string | null = null
  #applied = false

  /** The `origin` value last resolved, and the point it resolved to. */
  #seenOrigin: string | null = null
  #point: OriginPoint = TOP_LEFT
  #warnedOrigin = false

  /**
   * Whether the applied placement carries a non-default origin — the offset
   * below is live, measured and observed.
   */
  #anchored = false

  /** The origin point's offset from the box's corner, in whole system px. */
  #offsetX = 0
  #offsetY = 0

  /**
   * Keeps a fixed host's footprint-cancelling margins equal to its box, and
   * an anchored host's origin offset equal to its box — one observer, either
   * or both jobs.
   */
  #resizes: ResizeObserver | null = null

  constructor(host: LitElement & PositionedHost) {
    this.#host = host
    host.addController(this)
    controllers.set(host, this)
  }

  /**
   * The offset the host's stated pair sits from its box's corner: the
   * measured one while placed, a fresh measurement for an origin on a host
   * not yet placed (a gesture seeding from flow), and zero for `top left`.
   */
  get offset(): Readonly<Offset> {
    if (this.#point === TOP_LEFT) return NO_OFFSET
    if (this.#applied) return { x: this.#offsetX, y: this.#offsetY }
    const box = this.#host.getBoundingClientRect()
    return originOffset(box.width, box.height, this.#point, effectiveScale(this.#host))
  }

  hostConnected(): void {
    // A re-insert (a desktop's DOM-order sync) must come back observed.
    if (this.#applied && (this.#appliedFixed || this.#anchored)) this.#observe()
  }

  hostDisconnected(): void {
    this.#unobserve()
  }

  hostUpdated(): void {
    // Absent (never set) and null (attribute removed — what Lit's Number
    // converter hands back) both mean "unset".
    const top = this.#host.top ?? null
    const left = this.#host.left ?? null
    const fixed = this.#host.fixed === true
    const origin = this.#host.origin ?? null
    const style = this.#host.style

    // Resolved whenever it changes, placed or not, so a misspelling is
    // reported when it is written rather than when the pair arrives.
    if (origin !== this.#seenOrigin) {
      this.#seenOrigin = origin
      this.#point = this.#resolveOrigin(origin)
    }

    if (top === null && left === null && !fixed) {
      // Only unwind our own writes: a host whose inline position was set by
      // someone else (vf-window's drag, vf-icon's move, a consumer) keeps it.
      if (!this.#applied) return
      if (this.#appliedFixed) this.#unfix()
      this.#unobserve()
      this.#applied = false
      this.#appliedFixed = false
      this.#anchored = false
      this.#offsetX = 0
      this.#offsetY = 0
      style.removeProperty('position')
      style.removeProperty('top')
      style.removeProperty('left')
      style.removeProperty('right')
      style.removeProperty('bottom')
      style.removeProperty('margin')
      this.#announce(null, null)
      return
    }

    if (
      this.#applied &&
      top === this.#appliedTop &&
      left === this.#appliedLeft &&
      fixed === this.#appliedFixed &&
      origin === this.#appliedOrigin
    )
      return
    const wasFixed = this.#applied && this.#appliedFixed
    const anchored = this.#point !== TOP_LEFT
    this.#applied = true
    this.#appliedTop = top
    this.#appliedLeft = left
    this.#appliedFixed = fixed
    this.#appliedOrigin = origin
    this.#anchored = anchored
    style.position = fixed ? 'sticky' : 'absolute'
    // The origin's offset, from a box that is actually laid out — the
    // observer's first notification covers a host that has none yet.
    if (anchored) {
      const box = this.#host.getBoundingClientRect()
      if (box.width > 0 || box.height > 0) this.#measure(box.width, box.height)
    } else {
      this.#offsetX = 0
      this.#offsetY = 0
    }
    this.#writeOffsets()
    style.right = 'auto'
    style.bottom = 'auto'
    if (fixed) {
      if (!wasFixed) this.#fix()
    } else {
      if (wasFixed) this.#unfix()
      style.margin = '0'
    }
    if (fixed || anchored) this.#observe()
    else this.#unobserve()
    this.#announce(left ?? 0, top ?? 0)
  }

  /**
   * The nine keywords, whitespace-normalized; anything else is `top left`,
   * said once per element. Unset and empty are `top left` and say nothing.
   */
  #resolveOrigin(value: string | null): OriginPoint {
    if (value == null) return TOP_LEFT
    const key = value.trim().replace(/\s+/g, ' ')
    if (key === '') return TOP_LEFT
    const point = ORIGIN_POINTS.get(key as PlacementOrigin)
    if (point) return point
    if (!this.#warnedOrigin) {
      this.#warnedOrigin = true
      console.warn(
        `${this.#host.localName}: origin="${value}" is not a placement origin — ` +
          'one of top left, top center, top right, center left, center, ' +
          'center right, bottom left, bottom center, bottom right. Placing as ' +
          'top left.'
      )
    }
    return TOP_LEFT
  }

  /** The stated pair, less the origin's offset, as live system-px lengths. */
  #writeOffsets(): void {
    const style = this.#host.style
    style.top = sysLength((this.#appliedTop ?? 0) - this.#offsetY)
    style.left = sysLength((this.#appliedLeft ?? 0) - this.#offsetX)
  }

  /** Read the origin's offset off a border box of `width` × `height` CSS px. */
  #measure(width: number, height: number): boolean {
    const next = originOffset(width, height, this.#point, effectiveScale(this.#host))
    if (next.x === this.#offsetX && next.y === this.#offsetY) return false
    this.#offsetX = next.x
    this.#offsetY = next.y
    return true
  }

  /**
   * The write, announced up the light tree (see the mixin doc). Non-composed:
   * from a slotted child the event still travels through the slots it is
   * assigned to, which is how a window's built-in scroll area hears an icon
   * slotted into the window body.
   */
  #announce(left: number | null, top: number | null): void {
    emit(this.#host, 'vf-placement-change', { left, top }, { composed: false })
  }

  /**
   * The fixed recipe on top of the offsets: shrink-wrap, a layer over the
   * plane's placed children, and — from a box that is actually laid out —
   * the blockify and the footprint-cancelling margins ({@link #hold}),
   * written now if the host has a box and kept by the observer either way.
   */
  #fix(): void {
    const style = this.#host.style
    style.maxWidth = 'fit-content'
    style.zIndex = '1'
    this.#blockified = false
    const box = this.#host.getBoundingClientRect()
    if (box.width > 0 || box.height > 0) this.#hold(box.width, box.height)
  }

  #unfix(): void {
    this.#blockified = false
    const style = this.#host.style
    style.removeProperty('display')
    style.removeProperty('max-width')
    style.removeProperty('z-index')
  }

  /**
   * Watch the host's border box. A fixed host keeps its margins equal to it;
   * an anchored host keeps its origin offset equal to it — a relabel, a late
   * font, a zoom step (which changes the CSS px, not the system px, so the
   * same offset comes back and nothing is rewritten). A rewrite is a
   * placement write like any other, and is announced as one.
   */
  #observe(): void {
    this.#resizes ??= new ResizeObserver((entries) => {
      const size = entries[entries.length - 1]?.borderBoxSize?.[0]
      const box = size
        ? { width: size.inlineSize, height: size.blockSize }
        : this.#host.getBoundingClientRect()
      if (this.#appliedFixed) this.#hold(box.width, box.height)
      if (this.#anchored && this.#measure(box.width, box.height)) {
        this.#writeOffsets()
        this.#announce(this.#appliedLeft ?? 0, this.#appliedTop ?? 0)
      }
    })
    this.#resizes.observe(this.#host)
  }

  #unobserve(): void {
    this.#resizes?.disconnect()
    this.#resizes = null
  }

  /** Whether the outer display has been read off a rendered host and set. */
  #blockified = false

  /**
   * Erase the footprint of a host that has a box: blockify (the outer display
   * change `absolute` makes on its own), then the 0×0 margin box — the
   * border box taken back on the right and bottom.
   *
   * The blockify waits for a rendered box on purpose. A host's first update
   * can run before a nested slot has rendered it (a window's slot into its
   * built-in scroll area's slot), and a host outside the flat tree has no
   * computed style to read — the display came back empty, the map missed,
   * and the host stayed inline-level in a line box its own height. The
   * observer's first notification is the moment the box exists, so that is
   * when the display is read.
   */
  #hold(width: number, height: number): void {
    const style = this.#host.style
    if (!this.#blockified) {
      const display = getComputedStyle(this.#host).display
      if (display) {
        const block = BLOCKIFIED[display]
        if (block) style.display = block
        this.#blockified = true
      }
    }
    style.margin = `0 ${-width}px ${-height}px 0`
  }
}

/**
 * A viewport point as a placement in `anchor`'s coordinates: `{ left, top }`
 * in whole system px on the placement lattice, measured from the anchor's
 * box the way a placed child's `top`/`left` are — the unit and lattice a
 * drag lands on, so the result can be written straight to a child's pair.
 *
 * The three containers whose anchor sits in shadow DOM (`vf-window`'s
 * content region, `vf-desktop`'s screen, `vf-scroll-area`'s plane) expose it
 * as `placementAt(clientX, clientY)`; everywhere else the anchor is the
 * element's own padding box, and `toSysExact` against
 * `getBoundingClientRect()` is the documented conversion. The anchor is
 * expected to carry no border of its own (the three do not), so its border
 * box is its padding box; `scaleAt` is the element whose `--vf-scale` the
 * conversion reads — the component's host.
 *
 * With `child`, the pair to write to *that* element so its box's corner
 * lands on the point: the offset its `origin` adds is folded in, and is zero
 * for a child with none.
 */
export function placementIn(
  anchor: Element,
  clientX: number,
  clientY: number,
  scaleAt: Element = anchor,
  child?: Element
): { left: number; top: number } {
  const rect = anchor.getBoundingClientRect()
  const offset = child ? placementOffset(child) : NO_OFFSET
  return {
    left: snapSys(toSysExact(clientX - rect.left, scaleAt) + offset.x, scaleAt),
    top: snapSys(toSysExact(clientY - rect.top, scaleAt) + offset.y, scaleAt),
  }
}

/** The box a gesture is clamped into, in system px — see {@link PlacementClamp}. */
export type PlacementBounds = { width: number; height: number }

/**
 * A moved host's own containment rule, in system px, against the box measured
 * once at the start of the gesture.
 */
export type PlacementClamp = (
  x: number,
  y: number,
  bounds: PlacementBounds
) => { x: number; y: number }

/**
 * The gesture half of placement: the piece a *movable* host adds on top of
 * {@link VfPositioned}, so a drag ends up in the same `top`/`left` system-px
 * properties an author would have written.
 *
 * Two things it owns, both consequences of storing the origin in the art's own
 * unit rather than in resolved CSS px:
 *
 * - **Seeding.** A gesture starts from wherever the host already is, which may
 *   be a coordinate nobody stated in system px — an authored `left: 10%`, a
 *   `right`-anchored Trash icon, or plain normal flow. {@link seed} reads the
 *   *used* position and converts it once; from then on the properties are the
 *   whole truth.
 * - **The lattice.** Every write is snapped to {@link snapSys} — whole art
 *   pixels, the way QuickDraw moved windows, and the k-system-px run that also
 *   lands the edge on a whole CSS px (scale.ts explains why that second half
 *   matters to a scroll rail).
 *
 * It holds no state the host's own properties don't already hold, so it takes
 * no lifecycle and is not a {@link ReactiveController}: the writes it makes are
 * ordinary property sets, and `VfPositioned`'s controller renders them.
 *
 * And one thing it deliberately does **not** do: re-snap a placed host when the
 * scale changes. The lattice moves with the scale (k is 2 at dpr 2, 3 at that
 * display's 150%), so a coordinate dropped on one rung sits between two on the
 * next — but re-rounding it there is worse than leaving it. It is lossy, and it
 * compounds: 62 → 63 at 150% → 64 at 200%, a window walking away from where it
 * was dropped one zoom step at a time, which is a milder version of the exact
 * bug this class exists to fix (`verify:zoom` group (e) fails on it). Whole
 * system px is whole *device* px at every rung by the scale contract, so the
 * art stays crisp regardless; only the whole-CSS-px edge is given up, and an
 * authored `left="10"` gives that up already. A dropped coordinate is therefore
 * as immutable as an authored one — which is the whole claim.
 */
export class PlacementController {
  readonly #host: PositionedHost
  readonly #clamp: PlacementClamp
  #placed = false
  /** The containing box, measured once per gesture by {@link seed}. */
  #bounds: PlacementBounds | null = null

  constructor(host: PositionedHost, clamp: PlacementClamp) {
    this.#host = host
    this.#clamp = clamp
  }

  /** Whether a gesture has placed this host (as opposed to markup or CSS). */
  get placed(): boolean {
    return this.#placed
  }

  /**
   * The box the gesture is clamped into, in system px: the one {@link seed}
   * measured, or a fresh measurement before any gesture. A group drag reads
   * it to clamp a whole selection's delta at once.
   */
  get bounds(): PlacementBounds {
    return this.#bounds ?? this.#measureBounds()
  }

  /**
   * The offset the host's stated pair sits from its box's top-left corner,
   * in whole system px — what its `origin` adds, `(0, 0)` without one. A
   * group drag reads it to clamp each member's box rather than its pair.
   */
  get offset(): Readonly<Offset> {
    return placementOffset(this.#host)
  }

  /**
   * The origin a move adds its delta to, in system px — the stated pair,
   * which with an `origin` is the origin point rather than the corner.
   *
   * A stated coordinate is authoritative and needs no measuring — including
   * the one this controller wrote last time. Otherwise the host is wherever
   * layout or a stylesheet put it, so the *used* position is read and
   * converted: absolutely positioned hosts through their computed offsets
   * (`left: 10%` and `left: 1em` are perfectly good ways to place one, and
   * both resolve to px here), everything else through its in-flow offset,
   * which is measured against the same padding box `left`/`top` will be.
   * That read is the corner, so the origin's offset is added back.
   */
  seed(): { x: number; y: number } {
    const host = this.#host
    this.#bounds = this.#measureBounds()
    if (host.left != null || host.top != null) {
      return { x: host.left ?? 0, y: host.top ?? 0 }
    }
    const computed = getComputedStyle(host)
    const positioned = OUT_OF_FLOW.has(computed.position)
    const left = positioned ? parseFloat(computed.left) || 0 : host.offsetLeft
    const top = positioned ? parseFloat(computed.top) || 0 : host.offsetTop
    const offset = this.offset
    return {
      x: snapSys(toSysExact(left, host), host) + offset.x,
      y: snapSys(toSysExact(top, host), host) + offset.y,
    }
  }

  /**
   * Place the host at a system-px origin, clamped by its own rule and snapped.
   *
   * The clamp runs *here*, during the gesture, which is the moment the user is
   * actually pushing against an edge — and nowhere else. Re-clamping later, on
   * a parent that shrank under a zoom, would move a host nobody moved and would
   * not give the position back when the parent grew again.
   *
   * It runs against the box {@link seed} measured, not a fresh one. The
   * difference only shows when the movable contract is unmet: a host with no
   * stated origin is in normal flow, so its first move takes it out — and an
   * auto-height parent then collapses to whatever is left, which is a box the
   * host never actually sat in. Re-measuring per move would clamp the rest of
   * the gesture into that phantom, walking the host to the parent's origin
   * while the user drags away from it. The box at the moment of the press is
   * the one the user is pushing against.
   *
   * The pair is the origin point; the clamp is a rule about the *box*. So
   * the origin's offset comes off before the clamp and goes back on after,
   * and a dragged title stays centered on wherever it was dropped.
   */
  moveTo(x: number, y: number): void {
    const { x: kx, y: ky } = this.resolve(x, y)
    this.#host.left = kx
    this.#host.top = ky
    this.#placed = true
  }

  /**
   * The pair {@link moveTo} would write for a requested origin — clamped by
   * the host's own rule against the box {@link seed} measured and snapped
   * onto the lattice — without writing it. A move that shows where it is
   * going before it goes (`vf-icon.dragTo`) reads its landing here first.
   */
  resolve(x: number, y: number): { x: number; y: number } {
    const host = this.#host
    const { x: ox, y: oy } = this.offset
    const kept = this.#clamp(x - ox, y - oy, this.#bounds ?? this.#measureBounds())
    return { x: snapSys(kept.x + ox, host), y: snapSys(kept.y + oy, host) }
  }

  /**
   * The positioning parent's content box, in system px.
   *
   * A parent with no box at all falls back to the viewport, the same as no
   * parent — that is the *other* contract failure (a `position: relative`
   * container nobody gave a size), and clamping into nothing would leave the
   * host unable to move at all. The viewport keeps the gesture usable while
   * {@link warnMovableContract} does the teaching.
   */
  #measureBounds(): PlacementBounds {
    const host = this.#host
    const parent = host.offsetParent as HTMLElement | null
    const box = parent && parent.clientWidth > 0 && parent.clientHeight > 0 ? parent : null
    return {
      width: toSysExact(box?.clientWidth ?? window.innerWidth, host),
      height: toSysExact(box?.clientHeight ?? window.innerHeight, host),
    }
  }
}

/**
 * The computed positions a stated origin resolves to — the two CSS takes out
 * of flow, plus `sticky`, which a `fixed` placement writes and whose computed
 * offsets read the same way.
 */
const OUT_OF_FLOW = new Set(['absolute', 'fixed', 'sticky'])

/** The two ways the movable contract is broken; see {@link warnMovableContract}. */
type MovableFault = 'unplaced' | 'unsized-parent'

/**
 * The movable contract, as a one-time console warning.
 *
 * A host that moves under a gesture states its own origin, and its positioning
 * parent is a box with a size. Neither half is something the component can
 * supply for itself, and both fail quietly rather than loudly:
 *
 * - **Unplaced.** A host still in normal flow has to be taken out of it by its
 *   first move — which reflows everything after it and can collapse the very
 *   parent the clamp is about to measure. What matters is being out of flow,
 *   not which mechanism did it: `top`/`left` are the kit's way and the one that
 *   scales, but a stylesheet's own `position: absolute` satisfies it too, and
 *   {@link PlacementController.seed} reads that case from the computed offsets.
 * - **Unsized parent.** A positioning parent with no box gives the clamp no
 *   range, and the host cannot be dragged away from the parent's origin at all.
 *   Only checked for a real ancestor: with no positioned ancestor the host
 *   resolves against the initial containing block and the clamp falls back to
 *   the viewport, which agree with each other and need no warning.
 *
 * Returns whether it warned, so the caller can latch — one warning per element,
 * not per render.
 */
export function warnMovableContract(
  host: PositionedHost,
  what: string,
  example: string
): boolean {
  const stated = host.top != null || host.left != null || host.fixed === true
  const outOfFlow = OUT_OF_FLOW.has(getComputedStyle(host).position)

  let fault: MovableFault | null = null
  if (!stated && !outOfFlow) {
    fault = 'unplaced'
  } else {
    // The body is never the fault: with no positioned ancestor the host
    // resolves against the initial containing block, which the viewport
    // fallback already matches.
    const parent = host.offsetParent as HTMLElement | null
    if (
      parent &&
      parent !== host.ownerDocument.body &&
      (parent.clientWidth === 0 || parent.clientHeight === 0)
    ) {
      fault = 'unsized-parent'
    }
  }
  if (fault === null) return false

  console.warn(
    fault === 'unplaced'
      ? `${what}: movable, but in normal flow — so the first drag has to pull ` +
          'it out, reflowing everything after it on the page. State the ' +
          `origin in system px and it never was in flow: ${example}`
      : `${what}: the positioning parent has no box, so there is nowhere to ` +
          'drag to. Give it a size (and `position: relative`, if it is not a ' +
          'kit container) — the clamp is falling back to the viewport ' +
          'meanwhile.'
  )
  return true
}
