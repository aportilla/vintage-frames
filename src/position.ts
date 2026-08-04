import type { LitElement, ReactiveController } from 'lit'
import { property } from 'lit/decorators.js'
import { sysLength } from './scale.js'

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
 * It re-applies **only when the property values changed** — the `vf-window`
 * width/height rule. `vf-window` drag and `vf-icon` move write resolved px
 * into the same inline `left`/`top` without touching these properties (both
 * re-seed from *computed* style, so they read a live calc correctly); if some
 * unrelated update re-asserted the authored coordinates, activating a window
 * would snap it back to where its markup put it. Setting a property again is
 * the deliberate way to re-place a moved element — and, as with any reactive
 * property, setting it to the value it already holds is a no-op.
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
