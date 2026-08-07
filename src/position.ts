import type { LitElement, ReactiveController } from 'lit'
import { property } from 'lit/decorators.js'
import { snapSys, sysLength, toSysExact } from './scale.js'

type Constructor<T = object> = new (...args: any[]) => T

/**
 * The mixin's surface, as a `declare class` for the same TS4094 reason
 * {@link VfToggleControlInterface} states: TypeScript cannot name the
 * anonymous class a mixin returns when emitting declarations. Keep it in sync
 * with the implementation below.
 */
export declare abstract class VfPositionedInterface extends LitElement {
  top?: number | null
  left?: number | null
}

/**
 * Explicit placement — `top`/`left` in whole system px, on (nearly) every
 * component.
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
 * content region (the frame's inner edge, below the title bar — the 12px body
 * inset governs flow content only, exactly the DITL convention), a dialog's
 * content area, a stack's box, a fieldset's border box, a scroll area's
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

    constructor(...args: any[]) {
      super(...args)
      new PositionController(this)
    }
  }

  return VfPositionedElement as Constructor<VfPositionedInterface> & T
}

/**
 * Held by the host's controller list — no field on the element class, so the
 * mixin adds nothing TS4094 would trip over.
 */
class PositionController implements ReactiveController {
  readonly #host: LitElement & { top?: number | null; left?: number | null }

  /** Last coordinates written, valid only while {@link #applied}. */
  #appliedTop: number | null = null
  #appliedLeft: number | null = null
  #applied = false

  constructor(host: LitElement & { top?: number | null; left?: number | null }) {
    this.#host = host
    host.addController(this)
  }

  hostUpdated(): void {
    // Absent (never set) and null (attribute removed — what Lit's Number
    // converter hands back) both mean "unset".
    const top = this.#host.top ?? null
    const left = this.#host.left ?? null
    const style = this.#host.style

    if (top === null && left === null) {
      // Only unwind our own writes: a host whose inline position was set by
      // someone else (vf-window's drag, vf-icon's move, a consumer) keeps it.
      if (!this.#applied) return
      this.#applied = false
      style.removeProperty('position')
      style.removeProperty('top')
      style.removeProperty('left')
      style.removeProperty('right')
      style.removeProperty('bottom')
      style.removeProperty('margin')
      return
    }

    if (this.#applied && top === this.#appliedTop && left === this.#appliedLeft)
      return
    this.#applied = true
    this.#appliedTop = top
    this.#appliedLeft = left
    style.position = 'absolute'
    style.top = sysLength(top ?? 0)
    style.left = sysLength(left ?? 0)
    style.right = 'auto'
    style.bottom = 'auto'
    style.margin = '0'
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
  readonly #host: HTMLElement & { top?: number | null; left?: number | null }
  readonly #clamp: PlacementClamp
  #placed = false
  /** The containing box, measured once per gesture by {@link seed}. */
  #bounds: PlacementBounds | null = null

  constructor(
    host: HTMLElement & { top?: number | null; left?: number | null },
    clamp: PlacementClamp
  ) {
    this.#host = host
    this.#clamp = clamp
  }

  /** Whether a gesture has placed this host (as opposed to markup or CSS). */
  get placed(): boolean {
    return this.#placed
  }

  /**
   * The origin a move adds its delta to, in system px.
   *
   * A stated coordinate is authoritative and needs no measuring — including
   * the one this controller wrote last time. Otherwise the host is wherever
   * layout or a stylesheet put it, so the *used* position is read and
   * converted: absolutely positioned hosts through their computed offsets
   * (`left: 10%` and `left: 1em` are perfectly good ways to place one, and
   * both resolve to px here), everything else through its in-flow offset,
   * which is measured against the same padding box `left`/`top` will be.
   */
  seed(): { x: number; y: number } {
    const host = this.#host
    this.#bounds = this.#measureBounds()
    if (host.left != null || host.top != null) {
      return { x: host.left ?? 0, y: host.top ?? 0 }
    }
    const computed = getComputedStyle(host)
    const positioned = computed.position === 'absolute' || computed.position === 'fixed'
    const left = positioned ? parseFloat(computed.left) || 0 : host.offsetLeft
    const top = positioned ? parseFloat(computed.top) || 0 : host.offsetTop
    return {
      x: snapSys(toSysExact(left, host), host),
      y: snapSys(toSysExact(top, host), host),
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
   */
  moveTo(x: number, y: number): void {
    const host = this.#host
    const kept = this.#clamp(x, y, this.#bounds ?? this.#measureBounds())
    host.left = snapSys(kept.x, host)
    host.top = snapSys(kept.y, host)
    this.#placed = true
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
  host: HTMLElement & { top?: number | null; left?: number | null },
  what: string,
  example: string
): boolean {
  const stated = host.top != null || host.left != null
  const position = getComputedStyle(host).position
  const outOfFlow = position === 'absolute' || position === 'fixed'

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
