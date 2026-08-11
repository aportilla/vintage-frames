import type { LitElement, ReactiveController } from 'lit'
import { property } from 'lit/decorators.js'
import { sysLength } from './scale.js'

type Constructor<T = object> = new (...args: any[]) => T

/**
 * The mixin's surface, as a `declare class` for the same TS4094 reason
 * {@link VfPositionedInterface} states: TypeScript cannot name the
 * anonymous class a mixin returns when emitting declarations. Keep it in sync
 * with the implementation below.
 */
export declare abstract class VfSizedInterface extends LitElement {
  width?: number | null
  height?: number | null
}

/**
 * A declared box — `width`/`height` in whole system px, the size half of
 * {@link VfPositioned}'s DITL story: a resource stated each item's rectangle,
 * position *and* extent, in the window's own coordinates.
 *
 * It goes only on the components whose box is *stated* rather than governed
 * by content: the two static-text elements (`vf-paragraph`, where width is
 * the measure the copy wraps to; `vf-label`, a caption column's shared
 * width), `vf-stack` (a panel's declared box) and `vf-window` (the WIND
 * rect). The rest of the kit is content-governed on purpose — a push button
 * is as wide as its label, a popup hugs its widest option (docs/LAYOUT.md, "the
 * content governs the box") — and the components that *transform* a declared
 * size keep their own properties: `vf-desktop` adds the bezel around it,
 * `vf-dialog` sizes the top-layer box, `vf-img` negotiates with the art's
 * natural size.
 *
 * Mechanics, mirroring the position mixin: each declared dimension goes on
 * the host's own inline style as `calc(var(--vf-scale, 1) * Npx)` — live
 * against the display, resolved at paint time — and a whole number keeps the
 * box on the device-pixel grid by construction (the size half of layout
 * contract rule 3, the one grid snapping deliberately doesn't cover).
 * Unsetting a dimension removes the declaration and that axis returns to
 * layout.
 *
 * The writing rides a {@link ReactiveController} for the lifecycle reason
 * position.ts records (components override `updated()` without calling
 * `super.updated()`, which would shadow a mixin-level override), and it
 * re-applies **only when the property values changed** — the `vf-window`
 * grow-box rule: a resize writes resolved px into the same inline
 * `width`/`height` without touching these properties, and re-asserting the
 * authored size on an unrelated render would snap a resized window back.
 * Setting the property again is the deliberate way to re-size it.
 */
export const VfSized = <T extends Constructor<LitElement>>(Base: T) => {
  class VfSizedElement extends Base {
    /**
     * Width in whole system px. What the number means is the component's own
     * affair — the measure a paragraph wraps to, a caption column, a window's
     * box — but the mechanics are shared: the length lands on the host as a
     * live `calc(var(--vf-scale, 1) * Npx)`, so the box scales with the
     * display and sits on the device-pixel grid by construction. Remove it
     * and the width returns to layout.
     */
    @property({ type: Number }) width?: number | null

    /**
     * Height in whole system px; see {@link width}. Content that outgrows a
     * declared height overflows the box rather than growing it — the number
     * is the layout, and content that doesn't fit is a number to raise.
     */
    @property({ type: Number }) height?: number | null

    constructor(...args: any[]) {
      super(...args)
      new SizeController(this)
    }
  }

  return VfSizedElement as Constructor<VfSizedInterface> & T
}

/**
 * Held by the host's controller list — no field on the element class, so the
 * mixin adds nothing TS4094 would trip over.
 */
class SizeController implements ReactiveController {
  readonly #host: LitElement & { width?: number | null; height?: number | null }

  /** Last value written per axis, `null` while that axis is unwritten. */
  readonly #applied: { width: number | null; height: number | null } = {
    width: null,
    height: null,
  }

  constructor(host: LitElement & { width?: number | null; height?: number | null }) {
    this.#host = host
    host.addController(this)
  }

  hostUpdated(): void {
    this.#apply('width')
    this.#apply('height')
  }

  #apply(axis: 'width' | 'height'): void {
    // Absent (never set) and null (attribute removed — what Lit's Number
    // converter hands back) both mean "unset".
    const value = this.#host[axis] ?? null
    if (value === this.#applied[axis]) return
    this.#applied[axis] = value
    if (value === null) {
      // Only reached when unsetting a size this controller wrote: an inline
      // length someone else put there (the grow box, a consumer) never has an
      // applied value to differ from, so it is never removed here.
      this.#host.style.removeProperty(axis)
    } else {
      this.#host.style[axis] = sysLength(value)
    }
  }
}
