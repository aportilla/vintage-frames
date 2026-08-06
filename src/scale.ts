import type { ReactiveController, ReactiveControllerHost } from 'lit'
import {
  DEVICE_PX_PER_SYSTEM_PX,
  devicePxPerSystemPx,
  getZoom,
  onZoomChange,
  truePixelRatio,
} from './zoom.js'

/**
 * Display scaling — replicate the classic 72 dpi "system pixel" on modern
 * screens.
 *
 * Vintage Frames' components are authored in *system pixels* (the 1-bit art
 * grid: a 1px border, a 13px checkbox, a 22px control). To read at their true
 * classic size — and stay pixel-crisp — each system pixel must map to a whole
 * number of device pixels. The target is **3 × zoom device pixels per system
 * pixel**, rounded whole (`src/zoom.ts`): at 100% zoom the scale adapts to the
 * display alone —
 *
 *   1× display  → scale 3.0   (3 CSS px × 1 dpr = 3 device px)
 *   2× retina   → scale 1.5   (1.5 CSS px × 2 dpr = 3 device px)
 *   3× display  → scale 1.0   (1 CSS px × 3 dpr = 3 device px)
 *
 * — and as the user zooms, the target moves with them (6 device px at 200%,
 * 2 at 50%), so the kit grows with the page instead of dividing the zoom back
 * out and holding its physical size while the copy around it doubles. The
 * invariant is `--vf-scale × trueDpr = a whole device-px count`, where
 * `trueDpr` is {@link truePixelRatio} — device px per CSS px *including* zoom,
 * which `window.devicePixelRatio` reports in Chrome/Firefox but not Safari.
 * Because the count is always whole, the art is crisp at every density and
 * every zoom level.
 *
 * Components multiply their metrics by the inherited `--vf-scale` custom
 * property in `calc()`; JS geometry uses {@link sys} / {@link toSys} to
 * convert between system and CSS px. The scale is a plain multiplier, so
 * nesting never compounds: a window and a button inside it each scale their
 * own metrics once.
 *
 * Nothing here runs automatically — a component with no `--vf-scale` in scope
 * renders at 1× (today's behavior). Opt in with {@link applyScale} or by setting
 * `--vf-scale` yourself.
 */

export { DEVICE_PX_PER_SYSTEM_PX }

/**
 * The CSS scale factor for the current display and zoom:
 * `devicePxPerSystemPx(zoom) / trueDpr`. At 100% zoom that reduces exactly to
 * the historical `3 / devicePixelRatio`.
 */
export function getScale(): number {
  const dpr = truePixelRatio() || 1
  return devicePxPerSystemPx(getZoom()) / dpr
}

/**
 * The effective `--vf-scale` in force at `el` — the resolved custom property
 * CSS multiplies every metric by. Reading the computed value keeps JS geometry
 * in the SAME coordinate system as CSS: a consumer/ancestor override
 * (`:root{--vf-scale:1}`, `.dense{--vf-scale:1.25}`) wins for both, so
 * JS-written positions (drag origins, slider fill, panel placement, resize
 * floors) never drift off the device grid the way a hardcoded `3/dpr` would.
 * Falls back to the display scale when no property is in scope (before connect /
 * SSR), matching {@link ScaleController}'s own default.
 */
export function effectiveScale(el: Element): number {
  return (
    parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale')) || getScale()
  )
}

/** Convert system (art) units to display (CSS) px, honoring `--vf-scale` at `el`. */
export function sys(value: number, el: Element): number {
  return value * effectiveScale(el)
}

/**
 * A length of `size` system px as a CSS length that stays live: the scale is
 * read at paint time, so the box follows the display the way every metric
 * declared in a component's stylesheet does. `sys()` resolves the number *now*
 * and freezes it; this is what a size written onto an element belongs in.
 *
 * `undefined` gives back the empty string — the inline declaration is removed
 * and the box goes back to whatever layout gives it. So does `null`, which is
 * what Lit's Number converter hands back when the attribute is *removed* rather
 * than never set; `0` is a real length and still emits one.
 */
export function sysLength(size: number | null | undefined): string {
  return size == null ? '' : `calc(var(--vf-scale, 1) * ${size}px)`
}

/**
 * A CSS shorthand of one to four system-px lengths — `padding`, `margin`,
 * `inset` — each one live against `--vf-scale` the way {@link sysLength}'s
 * single value is. `12` gives one length, `'10 12'` two, and so on in the usual
 * top/right/bottom/left order.
 *
 * Whole system px only: a fractional entry is truncated rather than passed
 * through, because an 8.5-system-px padding is precisely the off-grid metric
 * the layout contract exists to prevent (README rule 2). A value that can't be
 * read as one to four whole numbers gives back the empty string — the
 * declaration is removed rather than half-applied.
 */
export function sysLengths(value: number | string | null | undefined): string {
  if (value == null) return ''
  const parts = String(value).trim().split(/\s+/).filter(Boolean).slice(0, 4)
  if (parts.length === 0) return ''
  const lengths = parts.map((part) => {
    const n = Math.trunc(Number(part))
    return Number.isFinite(n) ? sysLength(n) : ''
  })
  return lengths.every(Boolean) ? lengths.join(' ') : ''
}

/** Convert display (CSS) px to whole system (art) units, honoring `--vf-scale` at `el`. */
export function toSys(value: number, el: Element): number {
  return Math.round(value / effectiveScale(el))
}

/**
 * Convert display (CSS) px to system units *without* rounding — the seed
 * conversion for geometry that is about to be snapped onto the placement
 * lattice anyway ({@link snapSys}), where rounding twice only loses precision.
 */
export function toSysExact(value: number, el: Element): number {
  return value / effectiveScale(el)
}

/**
 * Snap a CSS-px coordinate onto the device-pixel grid.
 *
 * The 1-bit art is only crisp when its container's origin sits on a whole
 * device pixel: at a fractional origin every edge inside — clip-path
 * staircases, 1px borders, stripes, dithers, bitmap glyphs — rasterizes with
 * fractional coverage and grows a gray antialiasing fringe. Positions
 * declared in CSS as `calc(var(--vf-scale) * Npx)` land on the grid by
 * construction (N system px = 3N device px), but positions written from JS
 * (pointer drags report fractional clientX/Y on trackpads, computed styles
 * resolve percentages fractionally) must round through this before being
 * applied.
 *
 * At an integral density the snap is to whole CSS px — still whole device px
 * (1 CSS px = dpr device px), but also a coordinate WebKit can hold its
 * scrollbar rects to. WebKit pins scrollbar rects to whole CSS px, so a
 * scroll-bearing box whose edge lands on a half CSS px (an odd device px at
 * dpr 2) gets its rail painted one device pixel off its frame — dragging or
 * growing a document window in Safari fluttered a white hairline between the
 * rail and the frame as edges alternated half/whole CSS px. The costs: drag
 * granularity of one CSS px instead of one device px (imperceptible), and the
 * dpr-2 baseline nudge (MAKING-OF §5) always takes its known whole-CSS-px
 * rendering rather than sometimes its exact half-px one — a hard black/white
 * rail edge outranks a one-device-px text nudge. Fractional densities (where
 * WebKit doesn't run) keep the finest crisp grid: whole device px.
 */
export function snapToDevicePx(value: number): number {
  const dpr = truePixelRatio() || 1
  if (Number.isInteger(dpr)) return Math.round(value)
  return Math.round(value * dpr) / dpr
}

/**
 * Snap a CSS-px coordinate or length onto the system-pixel grid — the art's
 * own unit — as resolved by `--vf-scale` at `el`.
 *
 * Window chrome geometry (title-bar drags, grow-box sizes, dialog pins) is
 * held to whole system pixels rather than merely whole device pixels: a
 * window N system px wide keeps every interior metric — the flexing body, an
 * edge-mounted scroll rail — a whole count of system px too, and drags step
 * whole art pixels, the way QuickDraw moved windows. Every step is a whole
 * count of device px by the scale contract (`scale × dpr` integral), so the
 * 1-bit art stays fringe-free.
 *
 * The step is the smallest run of system px that is also whole in CSS px —
 * one system px at dpr 1 and 3, two at dpr 2's 1.5 scale, where an odd count
 * lands an edge on a half CSS px. That lift is not optional at dpr 2:
 * browsers place scrollbar geometry in CSS-px terms, and a scroll-bearing
 * box with a half-CSS edge renders measurably wrong in BOTH engines — WebKit
 * pins the whole scrollbar rect to whole CSS px and shifts the rail a device
 * pixel off its frame (the slow-resize hairline flutter), and Blink paints a
 * half-CSS-height window's bottom rail edge one device pixel thick. Single-
 * pixel steps at dpr 2 would blemish every other position; the kit prefers
 * the every-step-perfect grid. A scale whole in neither (a fractional
 * density) falls back to single system px: whole device px, the finest crisp
 * grid there.
 */
export function snapToSystemPx(value: number, el: Element): number {
  const step = systemPxStep(el)
  return Math.round(value / step) * step
}

/**
 * The placement lattice **in system px**: the smallest run of k ≤ 4 system px
 * that is also whole in CSS px at `el`'s scale (see {@link snapToSystemPx} for
 * why dpr 2 takes two). Identical to the historical behavior at 100% zoom
 * (k = 1 for scales 3 and 1, k = 2 for 1.5); under zoom the scale can be a
 * ratio like 5/3, where k = 3 is what keeps every drag step whole in CSS px —
 * without it the step fell through to a single system px and revived the
 * half-CSS-px edge that makes WebKit shift a scroll rail one device pixel off
 * its frame. A scale whole in no k ≤ 4 falls back to single system px: whole
 * device px, the finest crisp grid there. The float tolerance absorbs a scale
 * that round-trips through a custom-property string (5/3 stringifies and parses
 * exactly, but k × scale can land a few ulps off a whole number).
 *
 * The quantum moves with the scale, which is why a *stored* placement has to be
 * re-snapped when the display or zoom changes: 94 system px is legal at k = 2
 * and lands on a half CSS px at k = 3. Whole system px is always whole device
 * px (the scale contract), so that re-snap is about the CSS-px edge alone.
 */
export function systemPxQuantum(el: Element): number {
  const scale = effectiveScale(el)
  for (let k = 1; k <= 4; k++) {
    const step = k * scale
    if (Math.abs(step - Math.round(step)) < 1e-9) return k
  }
  return 1
}

/**
 * Snap a **system-px** coordinate onto the placement lattice
 * ({@link systemPxQuantum}) — the system-px twin of {@link snapToSystemPx},
 * and the one gestures use, because a placement is *stored* in system px and
 * written as a live `calc()` ({@link sysLength}) so it survives a zoom.
 */
export function snapSys(value: number, el: Element): number {
  const k = systemPxQuantum(el)
  return Math.round(value / k) * k
}

/** {@link systemPxQuantum} expressed in CSS px — what {@link snapToSystemPx} rounds to. */
function systemPxStep(el: Element): number {
  return systemPxQuantum(el) * effectiveScale(el)
}

/* ── The shared scale tracker ───────────────────────────────────────────── */

type ScaleListener = (scale: number) => void

/**
 * Two tiers, and the order is the point. The kit's own subscribers WRITE
 * `--vf-scale` (every component's {@link ScaleController}, a page's
 * {@link applyScale}); consumer callbacks tend to READ it back — a
 * `fitWithin()` re-fit calls {@link effectiveScale}, a layout callback
 * measures a component. Writers must run first, or every such read sees the
 * *previous* scale: subscription order alone put page code (which subscribes
 * at module eval) ahead of the controllers (which subscribe on a component's
 * first update), and the showcase's zoom re-fit sized its raster one zoom
 * step behind for exactly that reason.
 */
const scaleWriters = new Set<ScaleListener>()
const scaleReaders = new Set<ScaleListener>()
let scaleWatchers = 0
let lastPair = { scale: 0, dpr: 0 }
let stopScaleZoom: (() => void) | undefined
let scaleMql: MediaQueryList | undefined

/**
 * One evaluation per actual change, deduped on the pair `(scale, trueDpr)` —
 * and the pair matters: at Chrome 100% → 200% on a 2× display the scale is
 * 1.5 both times, but the true dpr goes 2 → 4 — the *device grid* changed,
 * and grid snapping must re-sweep even though `--vf-scale` did not move.
 * Conversely a Chrome zoom fires both sources in one turn, and the dedupe
 * collapses them to one callback wave per actual change.
 */
const fireScale = (): void => {
  const next = { scale: getScale(), dpr: truePixelRatio() }
  if (next.scale === lastPair.scale && next.dpr === lastPair.dpr) return
  lastPair = next
  for (const listener of [...scaleWriters]) listener(next.scale)
  for (const listener of [...scaleReaders]) listener(next.scale)
}

const armScaleMql = (): void => {
  disarmScaleMql()
  scaleMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  scaleMql.addEventListener('change', onScaleMql)
}

const onScaleMql = (): void => {
  fireScale()
  // dpr changed, so the old query no longer matches — re-register on the new one.
  armScaleMql()
}

const disarmScaleMql = (): void => {
  scaleMql?.removeEventListener('change', onScaleMql)
  scaleMql = undefined
}

/** Shared, refcounted subscription — both tiers ride one media query and one
 *  zoom subscription for the whole page. */
function subscribeScale(callback: ScaleListener, tier: Set<ScaleListener>): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  tier.add(callback)
  if (scaleWatchers++ === 0) {
    lastPair = { scale: getScale(), dpr: truePixelRatio() }
    stopScaleZoom = onZoomChange(fireScale)
    armScaleMql()
  }
  let released = false
  return () => {
    if (released) return
    released = true
    tier.delete(callback)
    if (--scaleWatchers === 0) {
      stopScaleZoom?.()
      stopScaleZoom = undefined
      disarmScaleMql()
    }
  }
}

/**
 * Watch for anything that moves the scale *or* the device grid under it — the
 * window moving to a different-density monitor (via a resolution media query),
 * or the user changing browser zoom (via `onZoomChange`, which also carries
 * Safari's dpr-invisible zoom) — and invoke `callback` with the new scale.
 * Returns a cleanup function.
 *
 * Ordering guarantee: by the time a callback runs, every `--vf-scale` the kit
 * itself manages (component defaults via {@link ScaleController}, a root set
 * by {@link applyScale}) has already been updated — so reading
 * {@link effectiveScale} or a computed style inside the callback is sound.
 * The README's full-screen pattern (`onScaleChange(fit)` re-deriving a
 * `vf-desktop` raster) depends on this.
 */
export function onScaleChange(callback: ScaleListener): () => void {
  return subscribeScale(callback, scaleReaders)
}

/**
 * Opt a subtree into true-size rendering: set `--vf-scale` on `target` (default
 * the document root) to the dynamic scale and keep it in sync as the display
 * changes. Returns a cleanup function that stops watching (it leaves the last
 * value in place). Strictly opt-in — call it once from your app.
 */
export function applyScale(
  target: HTMLElement = document.documentElement
): () => void {
  const set = (): void => target.style.setProperty('--vf-scale', String(getScale()))
  set()
  // Writer tier: this runs before any onScaleChange() consumer callback, so
  // code reading the root's scale in one sees the value already applied.
  return subscribeScale(set, scaleWriters)
}

/**
 * Reactive controller that makes true-size rendering the DEFAULT for a
 * component: on connect it sets `--vf-scale` to the display scale (3 / dpr) on
 * the host — UNLESS a `--vf-scale` is already in scope (a consumer or ancestor
 * override always wins) — and keeps it synced as the display's dpr changes.
 * Because `--vf-scale` is a plain inherited multiplier, a component whose
 * ancestor already set it just inherits that value (no compounding).
 *
 * Add one line to each component:  `new ScaleController(this)`.
 */
export class ScaleController implements ReactiveController {
  private stop?: () => void

  /**
   * True once THIS controller has written the inline `--vf-scale`, so a
   * reconnect resumes syncing the value it already owns.
   *
   * Ownership cannot be sniffed from the inline property merely being present:
   * on a *first* connect that value is the consumer's own
   * (`<vf-window style="--vf-scale:1">`), and treating it as ours overwrote
   * exactly the override the contract promises always wins.
   */
  private owns = false

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this)
  }

  /**
   * True while the connect-time read was not yet trustworthy, so the decision
   * is waiting for the host to be rendered (see {@link decide}).
   */
  private pending = false

  hostConnected(): void {
    if (typeof window === 'undefined') return
    this.decide(true)
  }

  /**
   * Re-decide once the host has rendered. Controllers' `hostUpdated` runs
   * before the component's own `firstUpdated`/`updated` and before paint, so a
   * deferred takeover still lands in the first frame and ahead of any JS
   * geometry the component derives from {@link sys}.
   */
  hostUpdated(): void {
    if (this.pending) this.decide(false)
  }

  hostDisconnected(): void {
    this.stop?.()
    this.stop = undefined
  }

  /**
   * A consumer/ancestor value always wins: an inline value we did not write, or
   * any value inherited from a rule, leaves the controller dormant. Only take
   * over when the property is genuinely unset — or when it is already ours from
   * a previous connect.
   *
   * `deferrable` marks the connect-time call, whose inherited read can be a
   * false negative: Lit attaches a shadow root synchronously on connect but
   * renders its `<slot>`s on the first update, so during the
   * `customElements.define` sweep a light-DOM child whose parent upgraded first
   * is assigned to no slot. Such an element sits outside the flat tree — it
   * still reports a computed style, because its own rules apply, but it
   * inherits nothing, so `--vf-scale` reads back empty whether or not the page
   * set one. Taking over on that read is how three components ended up pinned
   * at 3× inside a `:root { --vf-scale: 1 }` page; which components were hit
   * was pure module-evaluation order.
   */
  private decide(deferrable: boolean): void {
    const set = (): void => {
      this.owns = true
      this.host.style.setProperty('--vf-scale', String(getScale()))
    }
    const take = (): void => {
      this.pending = false
      set()
      // Writer tier: the host's --vf-scale is updated before any consumer's
      // onScaleChange() callback can read it.
      this.stop = subscribeScale(set, scaleWriters)
    }
    if (this.owns) return take()
    // Reading our own inline style needs no layout, so it is always decisive.
    if (this.host.style.getPropertyValue('--vf-scale') !== '') {
      this.pending = false
      return
    }
    if (getComputedStyle(this.host).getPropertyValue('--vf-scale').trim() !== '') {
      this.pending = false
      return
    }
    // Empty — either nothing is in scope, or nothing can resolve yet. Wait for
    // the host to render rather than guess; an unrendered host paints nothing in
    // the meantime, so deferring costs no frame.
    if (deferrable || !this.inFlatTree()) {
      this.pending = true
      return
    }
    take()
  }

  /**
   * Whether inherited properties can resolve on the host at all: every shadow
   * host between it and the document must have assigned it (or its ancestor) to
   * a slot. Keeps a host whose parent renders its slot late — or never — from
   * being decided on an unresolvable read.
   */
  private inFlatTree(): boolean {
    for (let el: Element | null = this.host; el; el = el.parentElement) {
      if (el.parentElement?.shadowRoot && !el.assignedSlot) return false
    }
    return true
  }
}
