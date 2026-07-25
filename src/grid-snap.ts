import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { onScaleChange } from './scale.js'

/**
 * Device-pixel grid snapping — hold a component's own origin on whole device
 * pixels wherever the host page's layout puts it.
 *
 * A component is built entirely from whole system pixels, so every edge inside
 * it sits on the grid *relative to its own origin* (see SPEC §2 and the layout
 * contract in README). Land that origin on a fractional device pixel and the
 * whole 1-bit interior rasterizes wrong: stepped corners staircase
 * asymmetrically, hairlines and bitmap glyph stems smear across two device rows
 * and go gray. A host page does that constantly and by accident — a ratio
 * `line-height` resolves to `28.05px`, a centered box computes its origin as
 * `edge − width` from a text-derived width — and until now the only fix was for
 * the page to follow the contract.
 *
 * This controller closes that hole from inside the component: it measures the
 * host's real position each frame it might have moved, and cancels the
 * fractional remainder with an equal and opposite offset. The correction is
 * always under half a device pixel, so nothing visibly moves; what changes is
 * that the interior rasterizes on the grid again.
 *
 * ## Why an offset and not a transform
 *
 * The obvious tool is `transform: translate()`, since transforms don't perturb
 * layout. Measured on blog.html (stray non-1-bit pixels in a `vf-button` crop,
 * where a clean render scores 0):
 *
 *   dpr   pristine   off-grid   transform   this controller
 *   1        0          959        189            0
 *   2        0          990        159            0
 *   3        0          957        189           89  (all within 8/255 of pure)
 *
 * A transform only recovers ~80%. A no-op `translate: 0 0` costs nothing, so
 * transforms are not inherently soft — but a *fractional* one leaves a fringe,
 * because the subtree rasterizes at its layout position and is shifted at
 * composite time. A `left`/`top` offset goes through layout, so the interior
 * re-rasterizes on the grid. Transforms also make the host a containing block
 * for `position: fixed` descendants, which drifted vf-select's popup panel off
 * its control by half a pixel.
 *
 * ## What it does not fix
 *
 * Only the origin. A fractional *size* — a block-level component whose width
 * comes from a fractional-width parent — is still the page's to fix, and so is
 * a `--vf-scale × devicePixelRatio` that isn't a whole number. Both remain in
 * the layout contract; this removes the third rule (whole-pixel line boxes),
 * which is where nearly every real fault came from.
 *
 * Opt in once per app with {@link applyGridSnap}; opt a single element out with
 * the `nosnap` attribute.
 */

/**
 * Origin error (in device px) small enough to leave alone.
 *
 * Not just a performance guard — it is what makes the correction terminate.
 * Chromium lays out in 1/64 CSS px, so at dpr 3 a whole device pixel (1/3 CSS
 * px) is not a representable position at all; the best available offset lands
 * within 1/128 CSS px of it. Without a deadband the controller re-measures that
 * irreducible remainder every frame and keeps nudging, and the rendering
 * visibly jitters. 0.05 device px is ~5% coverage on one edge pixel — below
 * what a 1-bit edge can show.
 */
const DEADBAND_DEVICE_PX = 0.05

/**
 * Chromium's layout resolution. Offsets are quantized to it (see above).
 * Gecko lays out in 1/60 CSS px instead — it re-rounds what we write, and the
 * no-progress guard in correct() still ends the loop, at worst a shade short
 * of the deadband.
 */
const LAYOUT_UNIT_CSS_PX = 1 / 64

/**
 * The two ways to move a box without disturbing anything else, and the CSS
 * properties each one writes.
 *
 * `offset` (`left`/`top` on a relatively positioned host) is the default: for
 * an in-flow box it is purely a paint-time shift — no sibling moves, no line
 * re-wraps, no intrinsic size changes.
 *
 * `margin` is for boxes where that isn't true. On an out-of-flow box
 * (`absolute`/`fixed`) margins are inert in exactly the same way, and unlike
 * `left`/`top` they don't collide with the coordinates the box is positioned
 * by — vf-window writes its own inline `left`/`top` on every drag frame. A
 * `sticky` box gets margins too, because there `left`/`top` are the stickiness
 * constraint rather than an offset, and writing them would change when the box
 * sticks.
 */
interface Mechanism {
  readonly kind: 'offset' | 'margin'
  readonly x: string
  readonly y: string
}

const OFFSET: Mechanism = { kind: 'offset', x: 'left', y: 'top' }
const MARGIN: Mechanism = { kind: 'margin', x: 'margin-left', y: 'margin-top' }

const currentDpr = (): number =>
  (typeof window !== 'undefined' && window.devicePixelRatio) || 1

/** Signed device-pixel error of a CSS-px coordinate. */
const gridError = (css: number, dpr: number): number => {
  const device = css * dpr
  return device - Math.round(device)
}

/** Round to what the layout engine can actually represent. */
const quantize = (css: number): number =>
  Math.round(css / LAYOUT_UNIT_CSS_PX) * LAYOUT_UNIT_CSS_PX

/**
 * One shared scheduler for every component on the page.
 *
 * Sweeps are coalesced into a single `requestAnimationFrame` — the correction
 * has to be in before paint, and a sweep costs 1–3 ms for 180 hosts, so
 * batching it is the difference between free and not.
 *
 * Order matters: hosts are swept outermost-first, so a nested component
 * measures a position its ancestor has already corrected and finds nothing left
 * to do. That is the common case, not an optimization — a component's interior
 * is whole system pixels, so snapping the outermost host puts everything below
 * it on the grid. On the showcase, one correction on `vf-desktop` lands all 111
 * hosts.
 */
class GridSnapScheduler {
  private readonly controllers = new Set<GridSnapController>()
  private enabled = false
  private frame = 0
  private resizes?: ResizeObserver
  private teardown: Array<() => void> = []

  register(controller: GridSnapController): void {
    this.controllers.add(controller)
    if (!this.enabled) {
      // A host can disconnect while snapping is on (its correction stays; it
      // isn't painting) and reconnect after the cleanup ran. Hand its own
      // styles back now rather than freezing the stale correction. No-op for
      // the common fresh controller.
      controller.reset()
      return
    }
    this.resizes?.observe(controller.host)
    this.request()
  }

  unregister(controller: GridSnapController): void {
    this.controllers.delete(controller)
    this.resizes?.unobserve(controller.host)
  }

  enable(): void {
    if (this.enabled || typeof window === 'undefined') return
    this.enabled = true
    this.install()
    this.request()
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    for (const stop of this.teardown.splice(0)) stop()
    this.resizes?.disconnect()
    this.resizes = undefined
    for (const controller of this.controllers) controller.reset()
  }

  /** Ask for a sweep before the next paint. Cheap to call repeatedly. */
  request(): void {
    if (!this.enabled || this.frame || typeof window === 'undefined') return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.sweep()
    })
  }

  private sweep(): void {
    const dpr = currentDpr()
    // Outermost first — see the class comment.
    const ordered = [...this.controllers].sort((a, b) => a.depth - b.depth)
    for (const controller of ordered) controller.correct(dpr)
  }

  /**
   * Everything that can move a host without the host knowing.
   *
   * There is no "position observer" in the platform, so this is a set of
   * heuristics rather than a guarantee: a resize of the host or of the document
   * element (which grows with content), a viewport change, a webfont swapping in
   * and re-measuring every line box, a display-density change, and scrolling
   * (harmless in itself, but `position: sticky` turns it into movement — see
   * the listener below). What it cannot see is a pure position change with no
   * size change anywhere — content inserted into a fixed-height sibling, say.
   * {@link requestGridSnap} is the escape hatch for a page that knows it just
   * moved something.
   *
   * FUTURE: the IntersectionObserver "position observer" pattern (a threshold
   * armed against the element's exact current rect, re-armed on every fire)
   * would close that gap without polling, at the cost of one observer per host.
   */
  private install(): void {
    this.resizes = new ResizeObserver(() => this.request())
    this.resizes.observe(document.documentElement)
    for (const controller of this.controllers) this.resizes.observe(controller.host)

    const onChange = (): void => this.request()
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    // A scroll moves nothing in document space — engines keep scroll offsets
    // device-pixel-aligned, so every in-flow origin keeps its error — but
    // `position: sticky` turns it into layout: a stuck box holds its contents
    // at the *stuck* geometry, whose fractional residue differs from the flow
    // geometry's on exactly the pages that need correcting, and a correction
    // tuned in one state is wrong in the other. Capture phase reaches light-DOM
    // scrollers too; one inside another component's shadow root is out of reach
    // (requestGridSnap() covers it). The deadband keeps the quiet sweeps to one
    // rect read per host.
    window.addEventListener('scroll', onChange, { capture: true, passive: true })
    this.teardown.push(() => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
      window.removeEventListener('scroll', onChange, { capture: true })
    })

    // Bitmap faces register themselves asynchronously (styles/*-font.ts), and
    // every line box re-measures when one lands.
    const fonts = document.fonts
    if (fonts) {
      fonts.addEventListener('loadingdone', onChange)
      this.teardown.push(() => fonts.removeEventListener('loadingdone', onChange))
      void fonts.ready.then(onChange)
    }

    // The window moving to a different-density display changes what "on the
    // grid" means, and ScaleController rewrites --vf-scale at the same moment.
    this.teardown.push(onScaleChange(onChange))

    // `nosnap` is read during a sweep, and setting an attribute schedules none —
    // so a host opted out at runtime would keep the correction it happened to
    // have until something unrelated triggered the next sweep. One filtered
    // observer fixes that for the light DOM (a host inside another component's
    // shadow root is out of reach; requestGridSnap() covers it).
    const optOuts = new MutationObserver(onChange)
    optOuts.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['nosnap'],
    })
    this.teardown.push(() => optOuts.disconnect())
  }
}

const scheduler = new GridSnapScheduler()

/**
 * Snap this component's origin to the device-pixel grid. One line per
 * component, alongside `ScaleController`:
 *
 * ```ts
 * private readonly gridSnap = new GridSnapController(this)
 * ```
 *
 * Dormant until the app calls {@link applyGridSnap}, and skipped per-element by
 * a `nosnap` attribute.
 */
export class GridSnapController implements ReactiveController {
  /** vf-* ancestors above this host; the sweep runs in ascending order. */
  depth = 0

  private mechanism: Mechanism | null = null
  /** Our own contribution, in CSS px — never the whole property value. */
  private applied = { x: 0, y: 0 }
  /** The value the component or the consumer had; we add our offset to it. */
  private base = { x: 0, y: 0 }
  /** Exactly what we last wrote, so we can tell our value from someone else's. */
  private written = { x: '', y: '' }
  private positioned = false

  constructor(readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this)
  }

  hostConnected(): void {
    this.depth = nestingDepth(this.host)
    scheduler.register(this)
  }

  hostDisconnected(): void {
    scheduler.unregister(this)
  }

  /** A render can change the host's size, and therefore where its edges land. */
  hostUpdated(): void {
    scheduler.request()
  }

  /**
   * Measure and correct. Runs from the shared sweep only.
   *
   * The correction is a *delta* against what we already applied, and the rect
   * we measure already includes it — so this is self-correcting: an offset that
   * lands short converges on the next sweep instead of accumulating.
   */
  correct(dpr: number): void {
    const host = this.host
    // Opting out mid-life gives the host its own styles back, rather than
    // freezing whatever correction happened to be applied when the attribute
    // arrived.
    if (host.hasAttribute('nosnap')) {
      if (this.mechanism) this.reset()
      return
    }

    const rect = host.getBoundingClientRect()
    // No box at all: display:none, or a display:contents host (vf-dialog,
    // vf-alert), whose real surface is a native <dialog> in the top layer and
    // is snapped by snapDialogToGrid instead.
    if (!rect.width && !rect.height) return

    const errorX = gridError(rect.left, dpr)
    const errorY = gridError(rect.top, dpr)
    if (
      Math.abs(errorX) <= DEADBAND_DEVICE_PX &&
      Math.abs(errorY) <= DEADBAND_DEVICE_PX
    ) {
      return
    }

    // Only now is a computed style worth its cost — the common case above is a
    // single rect read and nothing else.
    const computed = getComputedStyle(host)
    const position = computed.position
    const mechanism =
      position === 'absolute' || position === 'fixed' || position === 'sticky'
        ? MARGIN
        : OFFSET
    if (this.mechanism && this.mechanism !== mechanism) this.reset()
    this.rebaseIfForeign(mechanism, computed)

    const next = {
      x: quantize(this.applied.x - errorX / dpr),
      y: quantize(this.applied.y - errorY / dpr),
    }
    // Already as close as the layout engine can be asked to get.
    if (next.x === this.applied.x && next.y === this.applied.y) return
    this.applied = next

    if (mechanism === OFFSET && position === 'static') {
      host.style.position = 'relative'
      this.positioned = true
    }
    this.writeAxis(mechanism.x, this.base.x + next.x, 'x')
    this.writeAxis(mechanism.y, this.base.y + next.y, 'y')
  }

  /** Drop every correction and put the host's own styles back. */
  reset(): void {
    const mechanism = this.mechanism
    if (mechanism) {
      const style = this.host.style
      if (style.getPropertyValue(mechanism.x) === this.written.x) {
        style.removeProperty(mechanism.x)
      }
      if (style.getPropertyValue(mechanism.y) === this.written.y) {
        style.removeProperty(mechanism.y)
      }
    }
    if (this.positioned) {
      // Same ownership rule as the offsets: take back only the 'relative' we
      // wrote. A consumer may have repositioned the host since, and deleting
      // their inline 'absolute' would throw it back into flow.
      if (this.host.style.position === 'relative') {
        this.host.style.removeProperty('position')
      }
      this.positioned = false
    }
    this.mechanism = null
    this.applied = { x: 0, y: 0 }
    this.base = { x: 0, y: 0 }
    this.written = { x: '', y: '' }
  }

  /**
   * Re-read the baseline whenever the properties we write are not the ones we
   * last wrote — the component itself may own them (vf-window re-seeds inline
   * `left`/`top` and clears `margin` when a drag starts), or a consumer may.
   * Adopting their value rather than fighting for the property means the
   * correction rides on top of whatever they set, and a component that rewrites
   * its position every frame still ends up on the grid.
   */
  private rebaseIfForeign(mechanism: Mechanism, computed: CSSStyleDeclaration): void {
    const style = this.host.style
    if (
      this.mechanism === mechanism &&
      style.getPropertyValue(mechanism.x) === this.written.x &&
      style.getPropertyValue(mechanism.y) === this.written.y
    ) {
      return
    }
    this.mechanism = mechanism
    this.base = {
      x: parseFloat(computed.getPropertyValue(mechanism.x)) || 0,
      y: parseFloat(computed.getPropertyValue(mechanism.y)) || 0,
    }
    this.applied = { x: 0, y: 0 }
  }

  private writeAxis(property: string, value: number, axis: 'x' | 'y'): void {
    const text = `${value}px`
    if (this.written[axis] === text) return
    this.host.style.setProperty(property, text)
    this.written[axis] = text
  }
}

/** Walk out of shadow roots as well as up the light tree. */
const parentOf = (el: Element): Element | null => {
  if (el.parentElement) return el.parentElement
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

/** How many vf-* elements enclose this one, across shadow boundaries. */
const nestingDepth = (el: Element): number => {
  let depth = 0
  for (let node = parentOf(el); node; node = parentOf(node)) {
    if (node.tagName.toLowerCase().startsWith('vf-')) depth++
  }
  return depth
}

/**
 * Opt the page into automatic device-pixel-grid snapping: every mounted
 * component (and every one mounted afterwards) holds its origin on whole device
 * pixels, whatever the surrounding layout does. Returns a cleanup function that
 * turns it back off and restores the hosts' own styles. Calls share one
 * switch: snapping stays on until every caller's cleanup has run, and running
 * a cleanup twice releases only once — so two widgets on one page can each
 * opt in and out without turning the other's snapping off.
 *
 * ```ts
 * import { applyGridSnap } from 'vintage-frames'
 * applyGridSnap()
 * ```
 *
 * Strictly opt-in, unlike display scaling: this one writes inline styles on the
 * host elements, so it asks first. Two consequences worth knowing — a component
 * that was `position: static` becomes `position: relative` (it paints above
 * non-positioned siblings it overlaps, and becomes the containing block for any
 * absolutely positioned descendant), and a host's painted box can sit up to half
 * a device pixel outside its layout box.
 */
let holds = 0

export function applyGridSnap(): () => void {
  holds++
  scheduler.enable()
  let released = false
  return () => {
    if (released) return
    released = true
    if (--holds === 0) scheduler.disable()
  }
}

/**
 * Re-check every component before the next paint. Call it after moving
 * components in a way nothing observable changed size — the one case the
 * built-in triggers can't see. Free when nothing has actually moved.
 */
export function requestGridSnap(): void {
  scheduler.request()
}
