import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { onScaleChange } from './scale.js'

/**
 * Device-pixel grid snapping — hold a component's painted box on whole device
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
 * This controller closes that hole from inside the component: it measures its
 * host box each frame it might have moved, and cancels the fractional
 * remainder with an equal and opposite offset on its painted elements. The correction is always under
 * half a device pixel, so nothing visibly moves; what changes is that the
 * interior rasterizes on the grid again.
 *
 * ## Where the correction lands
 *
 * Not on the host. The controller writes the offset as two reserved custom
 * properties on the host's inline style — `--vf-snap-dx` / `--vf-snap-dy` —
 * and the component's own stylesheet applies them inside the shadow root:
 * the `.vf-snap` class (in `vfBase`) puts them on the top-level painted
 * element(s), and absolutely positioned satellites that anchor to the host
 * (vf-menu's panel, the default button's ring) compose the same variables into
 * their insets. Because the host's `position`/`left`/`top`/`margin` are never
 * written, the correction cannot collide with a consumer's positioning or with
 * vf-window's own drag coordinates, and turning it off is deleting two
 * variables. Components whose chrome is painted by a container carry no target
 * and simply ride it: list rows sit inside vf-list's corrected scroller, menu
 * items inside vf-menu's offset-composed panel, options inside vf-select's
 * JS-positioned panel; vf-button-group and vf-radio-group paint nothing and
 * their slotted children correct themselves.
 *
 * To snap a custom component, add the class to its top-level painted element
 * and the controller line from {@link GridSnapController}. The measured
 * element must be in-flow (static or relative) — the correction is expressed
 * through `left`/`top` on a relatively positioned box.
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
 * re-rasterizes on the grid. Transforms also make the box a containing block
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
 * is whole system pixels, so snapping the outermost paint puts everything below
 * it on the grid. On the showcase, one correction on `vf-desktop` lands every
 * host.
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
 * Snap this component's paint to the device-pixel grid. One line per
 * component, alongside `ScaleController`:
 *
 * ```ts
 * private readonly gridSnap = new GridSnapController(this)
 * ```
 *
 * The component's template must put the `vf-snap` class (see `vfBase`) on its
 * top-level painted element(s); the host box is what gets measured, so an
 * authored offset inside it (a toggle's centered box) stays put. Dormant
 * until the app calls {@link applyGridSnap}, and skipped per-element by a
 * `nosnap` attribute on the host.
 */
export class GridSnapController implements ReactiveController {
  /** vf-* ancestors above this host; the sweep runs in ascending order. */
  depth = 0

  /** Our current correction, in CSS px. */
  private applied = { x: 0, y: 0 }
  /** Exactly what we last wrote, so an externally rewritten style attribute
   *  (a consumer framework re-templating `style`) is detected and rebased. */
  private written = { x: '', y: '' }

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
   * The HOST is what gets measured: its origin is the page's contribution,
   * and the page's fraction is the whole fault being canceled. The paint
   * roots consuming the variables sit at *authored* offsets inside the host —
   * including deliberate half-pixel ones like a toggle's centered box — and
   * measuring one of them would make the controller "correct" the component's
   * own design. Because the host never moves from its own correction, the
   * applied offset is folded into the error arithmetically rather than being
   * expected in the measured rect; an ancestor's correction, which does move
   * this host, is picked up the normal way.
   */
  correct(dpr: number): void {
    const host = this.host
    // Opting out mid-life gives the host its variables back, rather than
    // freezing whatever correction happened to be applied when the attribute
    // arrived.
    if (host.hasAttribute('nosnap')) {
      if (this.written.x || this.written.y) this.reset()
      return
    }

    const rect = host.getBoundingClientRect()
    // No box at all: display:none, or a display:contents host (vf-dialog,
    // vf-alert), whose real surface is a native <dialog> in the top layer and
    // is snapped by snapDialogToGrid instead.
    if (!rect.width && !rect.height) return

    // If something rewrote the host's style attribute, the variables are gone
    // and the bookkeeping with them. Start over from what is really there.
    const style = host.style
    if (
      style.getPropertyValue('--vf-snap-dx') !== this.written.x ||
      style.getPropertyValue('--vf-snap-dy') !== this.written.y
    ) {
      this.applied = { x: 0, y: 0 }
      this.written = { x: '', y: '' }
    }

    // Residual error of the *corrected* paint position: host origin plus the
    // offset the variables currently apply inside it.
    const errorX = gridError(rect.left + this.applied.x, dpr)
    const errorY = gridError(rect.top + this.applied.y, dpr)
    if (
      Math.abs(errorX) <= DEADBAND_DEVICE_PX &&
      Math.abs(errorY) <= DEADBAND_DEVICE_PX
    ) {
      return
    }

    const next = {
      x: quantize(this.applied.x - errorX / dpr),
      y: quantize(this.applied.y - errorY / dpr),
    }
    // Already as close as the layout engine can be asked to get.
    if (next.x === this.applied.x && next.y === this.applied.y) return
    this.applied = next
    this.written = { x: `${next.x}px`, y: `${next.y}px` }
    style.setProperty('--vf-snap-dx', this.written.x)
    style.setProperty('--vf-snap-dy', this.written.y)
  }

  /** Drop the correction: delete the two variables and forget everything. */
  reset(): void {
    this.host.style.removeProperty('--vf-snap-dx')
    this.host.style.removeProperty('--vf-snap-dy')
    this.applied = { x: 0, y: 0 }
    this.written = { x: '', y: '' }
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

let holds = 0

/**
 * Opt the page into automatic device-pixel-grid snapping: every mounted
 * component (and every one mounted afterwards) holds its paint on whole device
 * pixels, whatever the surrounding layout does. Returns a cleanup function
 * that turns it back off. Calls share one switch: snapping stays on until
 * every caller's cleanup has run, and running a cleanup twice releases only
 * once — so two widgets on one page can each opt in and out without turning
 * the other's snapping off.
 *
 * ```ts
 * import { applyGridSnap } from 'vintage-frames'
 * applyGridSnap()
 * ```
 *
 * The whole footprint on your DOM is two reserved custom properties
 * (`--vf-snap-dx`/`--vf-snap-dy`) on each corrected host's inline style; the
 * offset they drive is applied inside the component's own shadow root. Worth
 * knowing: a component's painted box can sit up to half a device pixel outside
 * its layout box while corrected.
 */
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
