/**
 * Browser-zoom tracking — the zoom half of the display-scale model.
 *
 * Every component renders one system pixel (the 1-bit art unit) as a whole
 * number of device pixels, and that number is *derived from the display*, not
 * fixed: the Macintosh pixel this art was drawn for is 1/72 inch, so the target
 * is the whole device-pixel count that lands nearest that size —
 * `clamp(round(trueDpr × 96/72), 1, 24)`, where 96 is CSS's reference dpi and
 * `trueDpr` is device px per CSS px (see {@link devicePxPerSystemPx} for the
 * worked displays). A 2× Retina display works out to 3, which is where the
 * kit's old hard-coded 3 came from — it was that one display's answer written
 * down as a constant, 3× too large on a 1× monitor and a quarter short on a 3×
 * one. Zoom needs no separate term: it multiplies device px per CSS px, which
 * is what zoom *is*, so it arrives inside `trueDpr` and the art grows *with*
 * the page instead of un-zooming itself back to physical size. Always whole
 * device pixels, because the layout contract's rule 1 is not negotiable.
 *
 * The work is knowing the zoom at all. Zoom multiplies device-px-per-CSS-px in
 * every engine — that is what zoom is — but the engines differ in whether they
 * report it: Chrome and Firefox fold it into `devicePixelRatio`, Safari pins
 * `devicePixelRatio` to the hardware and moves `innerWidth` instead. So the
 * tracker watches two signals:
 *
 *   1. `devicePixelRatio`, via a resolution media query re-armed at each new
 *      value. A dpr change is *either* zoom or the window moving to a
 *      different-density display, and the two must not be confused — a monitor
 *      move already renders perfectly today and must keep doing so. The
 *      discriminator: page zoom moves neither the window nor the screen's
 *      logical geometry, so a `screen.*`/`screenX/Y` signature that is
 *      unchanged (or uniformly scaled by the dpr ratio, for engines that
 *      report those members in zoom-affected CSS px) means zoom; anything else
 *      means a display change, which rebases the baseline and reports nothing.
 *   2. `innerWidth`/`innerHeight` against `outerWidth`/`outerHeight`, for
 *      Safari: zoom rescales the inner (CSS-px) viewport on both axes by the
 *      same factor while the outer (screen-px) window holds still. A change in
 *      the outer size is a real window resize and rebases; a one-axis inner
 *      change (an edge drag, devtools docking, a sidebar) is never zoom and
 *      rebases; a both-axes change reads as zoom only when both axes land on
 *      the same {@link ZOOM_LADDER} level. A width-derived zoom is an
 *      inference, unlike path 1's engine-stated density, so anything it can't
 *      match to a real zoom level rebases rather than reports (see
 *      {@link onResize} for what accepting a raw ratio used to cost).
 *
 * Once path 1 has classified a change as zoom, the engine is known to fold
 * zoom into dpr and path 2 is switched off for the session
 * ({@link dprTracksZoom}) — killing its false positives wholesale.
 *
 * Like `focus-modality.ts`, this is a module-scoped singleton with refcounted
 * listeners: the first {@link onZoomChange} subscriber starts the tracker, the
 * last release stops it. The baselines are sampled at module evaluation — not
 * at first subscribe — so a lazily imported kit still dates them from page
 * load, which is the closest thing to "100%" a page can observe. A page loaded
 * *already* zoomed (Chrome persists zoom per origin) reads that as its 100%;
 * `resetZoomBaseline()` is the escape hatch, and so is a reload at 100%.
 *
 * Pinch zoom is out of scope by design: `visualViewport.scale` magnifies
 * already-rasterized output at composite time, changes no rasterization
 * density, and is not reported by either path.
 *
 * Everything here is reported *quantized*: measured zoom snaps to the nearest
 * ladder level browsers actually offer (within 2%), so a zoom that sits exactly
 * on a rounding threshold can't flutter between two device-px targets on a
 * width-derived 1.4998 vs 1.5001. The thresholds move with the display — the
 * target flips where `96/72 × trueDpr` hits a half — and on a 1.5× display
 * (Windows at 150%) two real ladder rungs, 75% and 125%, land exactly on one.
 */

/** The screen the art was drawn for: one system pixel is 1/72 inch. */
export const CLASSIC_DPI = 72

/**
 * CSS's reference pixel — 1 CSS px = 1/96 inch — which is the only density
 * anchor the platform offers. `devicePixelRatio` is device px per *CSS* px, so
 * `96 × dpr` is the display's density as far as a browser will say it; nothing
 * reports a panel's real ppi (a `resolution` media query in `dpi` is defined as
 * 96 × dppx — the same number wearing different units).
 *
 * Real hardware differs from the nominal figure, and it differs in the kit's
 * favor: macOS lays a Retina display out at ~109 logical dpi, so its dpr 2 is
 * really ~218 ppi. Both anchors round to the same whole target there (218/72 =
 * 3.03, 192/72 = 2.67), while a *measured* ppi would not — a 254-ppi MacBook
 * Pro panel would ask for 4 and render the art larger than the iMac beside it.
 * The nominal anchor is the stable thing to compute from.
 */
export const CSS_REFERENCE_DPI = 96

/** One system pixel in CSS px, before rounding to whole device px: 96/72. */
export const SYSTEM_PX_IN_CSS_PX = CSS_REFERENCE_DPI / CLASSIC_DPI

/**
 * Hard bounds on the device-px-per-system-px target. 1 is the floor below
 * which the art stops being art; 24 is a guard against a mis-measured zoom,
 * not a policy.
 */
const MIN_TARGET = 1
const MAX_TARGET = 24

/**
 * ONE THING THIS DELIBERATELY DOES NOT DO, because it was tried and was worse.
 *
 * A whole target does not make `target / trueDpr` — the `--vf-scale` every
 * metric multiplies by — a length the *engine* can hold: Blink lays out in 1/64
 * CSS px, so a scale of 4/3 (a 3× display, or a 2× one at 150% zoom) quantizes
 * to 85/64 and a 7-system-px gap measures 27.98 device px instead of 28. Over a
 * repeated fill that error accumulates, which is what takes the desktop dither
 * to 38% mid-gray at that scale.
 *
 * Preferring counts whose scale IS holdable (multiples of a quarter CSS px)
 * fixes that and breaks something worse: the holdable set depends on the
 * *denominator* of trueDpr, which jumps around, so the target stops being
 * monotonic. On a 2× display that shipped 3 device px at 100%, 5 at 125% and 3
 * again at 150% — zooming in made the art smaller. Nothing rescues it either:
 * at 110% zoom (trueDpr 2.2) the smallest holdable count is 11, four times the
 * art's size, so no policy can be both holdable and near true size everywhere.
 *
 * So the rounding stands, and sub-quantum drift is accepted as the engine's
 * price for a fractional density — the same price the kit paid at every
 * fractional zoom before any of this. Where it showed was tiled art, and that
 * is fixed where it belongs: a tiled fill rounds its own cell to a size the
 * device grid can express ({@link vfTileSize}, `--vf-tile-quantum`), rather
 * than every component on the page resizing around it.
 */

/**
 * Zoom levels browsers actually offer — Chrome's set plus Safari's 85% and
 * 115%. Two consumers, two strictnesses: path 1 snaps its dpr-derived zoom to
 * the nearest entry within {@link LADDER_TOLERANCE} and otherwise trusts it
 * raw (the engine measured it — Firefox's 120/133/170% land between entries
 * and pass through, which is fine), while path 2 accepts ONLY these levels:
 * its width-derived measurement is an inference, and every real zoom it can
 * observe is a Safari one, so Safari's own steps must all be entries.
 */
export const ZOOM_LADDER = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.15, 1.25, 1.5, 1.75, 2,
  2.5, 3, 4, 5,
]
const LADDER_TOLERANCE = 0.02

/**
 * Snap a measured zoom to the nearest {@link ZOOM_LADDER} entry within 2%,
 * else return it unchanged (Firefox steps and OS-level zoom can land off the
 * ladder). Exists because the device-px target rounds, so some zoom level on
 * any given display sits exactly on a threshold: without snapping, a
 * width-derived 1.4998 and 1.5001 on a 2× display give 4 and 5 device px — a
 * 25% size flip — on alternating resize events.
 */
export function quantizeZoom(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  for (const level of ZOOM_LADDER) {
    if (Math.abs(raw / level - 1) <= LADDER_TOLERANCE) return level
  }
  return raw
}

/**
 * Device px per system px the kit aims for on a display of `trueDpr`: the whole
 * count nearest the classic 1/72 inch — `round(96/72 × trueDpr)` — stepped by
 * at most one to a count whose `--vf-scale` the layout grid can hold exactly
 * ({@link SCALE_GRID}), and clamped to [1, 24].
 *
 *   display              ideal  target  --vf-scale
 *   1×                    1.33     1      1
 *   1.25× (Win 125%)      1.67     2      1.6
 *   1.5×  (Win 150%)      2.0      2      1.333
 *   2×    Retina          2.67     3      1.5
 *   3×                    4.0      4      1.333
 *
 * Monotonic by construction: `round` of an increasing quantity never goes
 * backwards, so a denser display — or a deeper zoom, which is the same thing —
 * never renders the art smaller.
 *
 * The 2× row is where the kit's old hard-coded 3 came from — one display's
 * answer written down as a constant. The 1× row is why that was wrong: it
 * rendered every system pixel 3 device px wide on a display where 1.33 is true,
 * three times the size the art was drawn at.
 *
 * The target is a step function, so zoom moves it in steps, and *not moving* is
 * a correct answer: 100% and 125% on a 2× display both round to 3, so the art
 * holds its size while the copy around it grows. Rounding to the nearest whole
 * count is the whole contract — bending it to make zoom feel responsive would
 * put the art off the device grid, which is the one thing that never bends.
 *
 * Pass {@link truePixelRatio}, not `devicePixelRatio`: zoom belongs in this
 * number. A 2× display at 200% zoom is `trueDpr` 4 → 5 device px per system px,
 * so the art grows with the page. `Math.round` ties go *up* (4.5 → 5)
 * deliberately: a zoom-driven accessibility response should err toward larger,
 * and the representability step prefers the larger count for the same reason.
 *
 * Rounding is what costs physical accuracy, and it is bounded at half a device
 * pixel per system pixel: a 1× monitor renders 25% small, a 2× display 12%
 * large, a 1.5× and a 3× one exact. Nothing does better while every system
 * pixel is a whole number of device pixels, and that is the invariant — art off
 * the device grid is not the art.
 */
export function devicePxPerSystemPx(trueDpr: number): number {
  const target = Math.round(SYSTEM_PX_IN_CSS_PX * trueDpr)
  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, target))
}

/* ── Tracker state ──────────────────────────────────────────────────────── */

/**
 * The screen geometry page zoom cannot move. `screen.*` and `screenX/Y` are
 * snapshotted beside the dpr baseline; on a dpr change they are what tells a
 * zoom (nothing moved, or everything scaled by exactly the dpr ratio) from a
 * display change (something else moved).
 */
interface DisplaySignature {
  sw: number
  sh: number
  aw: number
  ah: number
  x: number
  y: number
}

const readSignature = (): DisplaySignature =>
  typeof window === 'undefined'
    ? { sw: 0, sh: 0, aw: 0, ah: 0, x: 0, y: 0 }
    : {
        sw: screen.width,
        sh: screen.height,
        aw: screen.availWidth,
        ah: screen.availHeight,
        x: window.screenX,
        y: window.screenY,
      }

/** Members equal within a pixel of jitter. */
const signatureUnchanged = (a: DisplaySignature, b: DisplaySignature): boolean =>
  (Object.keys(a) as Array<keyof DisplaySignature>).every(
    (k) => Math.abs(a[k] - b[k]) <= 1
  )

/**
 * Every member of `next` is `previous / r` within tolerance — the shape a pure
 * zoom leaves in an engine that reports screen geometry in zoom-affected CSS
 * px (dpr × r divides every CSS length by r). Which engines do is exactly what
 * the §6 probe settles; testing both hypotheses is correct either way.
 */
const signatureScaledBy = (
  next: DisplaySignature,
  previous: DisplaySignature,
  r: number
): boolean =>
  (Object.keys(next) as Array<keyof DisplaySignature>).every((k) => {
    const expected = previous[k] / r
    return Math.abs(next[k] - expected) <= Math.max(2, Math.abs(expected) * 0.01)
  })

/** An inner/outer width change smaller than this is noise, not a signal. */
const WIDTH_EPS = 4

/** Resolution media queries match a band, not a point — float-serialization slack. */
const BAND = 0.001

/** Device px per CSS px at load, assumed to be 100% zoom. */
let baselineDpr = 1
/** The dpr the media query is currently armed at (the last value seen). */
let lastSeenDpr = 1
/** Inner viewport at 100% zoom (rebased on real window resizes). */
let baselineInner = 0
let baselineInnerHeight = 0
/** Outer window size in screen px — zoom never moves it; a resize does. */
let baselineOuter = 0
let baselineOuterHeight = 0
let signature = readSignature()

/** Page zoom relative to load, quantized. */
let zoom = 1
/**
 * Latched the first time path 1 classifies a dpr change as zoom: this engine
 * folds zoom into `devicePixelRatio` (Chrome/Firefox), so path 2 is switched
 * off for the rest of the session, killing its false positives (devtools,
 * sidebars). Safari never sets it and keeps path 2.
 */
let dprTracksZoom = false

if (typeof window !== 'undefined') {
  baselineDpr = window.devicePixelRatio || 1
  lastSeenDpr = baselineDpr
  baselineInner = window.innerWidth
  baselineInnerHeight = window.innerHeight
  baselineOuter = window.outerWidth
  baselineOuterHeight = window.outerHeight
}

/** Page zoom relative to load, quantized to the ladder. 1 until observed otherwise. */
export function getZoom(): number {
  return zoom
}

/**
 * Device px per CSS px *right now* — the number every "snap to the device
 * grid" computation must divide by. `window.devicePixelRatio` is that number
 * only in engines that fold zoom into it; Safari's is simply wrong about the
 * current rasterization density at any non-100% zoom. Reading the live dpr and
 * folding the tracked zoom back in is correct in both:
 *
 *   Chrome/Firefox (latched)   dpr already includes zoom  →  dpr
 *   Safari (never latches)     dpr is the hardware        →  dpr × zoom
 *
 * The live read matters: a monitor move changes the true density whether or
 * not the tracker is running, and this stays exactly as correct as the old
 * direct `devicePixelRatio` read in that case (zoom is 1 until tracked).
 */
export function truePixelRatio(): number {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  return dprTracksZoom ? dpr : dpr * zoom
}

/* ── The tracker ────────────────────────────────────────────────────────── */

type ZoomListener = (zoom: number) => void

const listeners = new Set<ZoomListener>()
let mql: MediaQueryList | undefined

const notify = (): void => {
  for (const listener of [...listeners]) listener(zoom)
}

const setZoom = (next: number): void => {
  if (next === zoom) return
  zoom = next
  notify()
}

/**
 * A dpr change arrived (from either signal path — the resize handler delegates
 * here when it notices the dpr moved, so a missed media-query fire can't lose
 * the event). Classify it as zoom or display change per the signature, apply,
 * and re-arm the query at the new value.
 *
 * A display change rebases the baseline and reports nothing: `zoom` is
 * whatever it was (Chrome carries page zoom across displays), and scale
 * consumers hear about the new density through their own resolution query.
 * A misclassification here costs physical size only, never crispness — the
 * target stays an integer and {@link truePixelRatio} reads the live dpr, so
 * `--vf-scale × trueDpr` is whole in every case.
 */
const onDprChange = (newDpr: number): void => {
  const r = newDpr / lastSeenDpr
  const sig = readSignature()
  const isZoom =
    signatureUnchanged(sig, signature) || signatureScaledBy(sig, signature, r)
  lastSeenDpr = newDpr
  signature = sig
  arm()
  if (isZoom) {
    dprTracksZoom = true
    setZoom(quantizeZoom(newDpr / baselineDpr))
  } else {
    // The same physical window on a different screen: keep the zoom, move the
    // baseline under it so future ratios are measured against this display.
    baselineDpr = dprTracksZoom ? newDpr / zoom : newDpr
  }
}

const onMediaChange = (): void => {
  const dpr = window.devicePixelRatio
  if (dpr !== lastSeenDpr) onDprChange(dpr)
  // Some engines fire resolution queries spuriously (e.g. straddling two
  // displays); re-arm either way so the band tracks the value we act on.
  else arm()
}

const arm = (): void => {
  disarm()
  if (typeof window === 'undefined' || !window.matchMedia) return
  mql = window.matchMedia(
    `(min-resolution: ${lastSeenDpr - BAND}dppx) and (max-resolution: ${lastSeenDpr + BAND}dppx)`
  )
  mql.addEventListener('change', onMediaChange)
}

const disarm = (): void => {
  mql?.removeEventListener('change', onMediaChange)
  mql = undefined
}

/**
 * Path 2 — Safari-shaped zoom, where the dpr holds still and the CSS viewport
 * rescales instead. Everything that is not zoom-shaped is classified away and
 * *rebased*, never reported: a dpr move belongs to path 1; an outer-size
 * change is the user resizing the window; a one-axis inner change is never
 * zoom (zoom rescales both axes at once — an edge drag, devtools, a sidebar
 * move one). A both-axes change is accepted only when both axes land on the
 * same {@link ZOOM_LADDER} level, because a false positive here is never
 * merely a size error: it folds a zoom into {@link truePixelRatio} that the
 * rasterizer never applied, so `--vf-scale × trueDpr` stays whole while the
 * art's *actual* device coverage goes fractional — the exact fringe the whole
 * model exists to prevent. A janky window-edge drag used to do just that:
 * resize events coalesce into a 2–3% one-axis jump, a stale outer baseline
 * missed it, and the raw off-ladder ratio shrank the kit a hair into gray.
 * One-axis-is-never-zoom and ladder-or-rebase each close that independently,
 * and rebasing on every unclassified change means no drift can *accumulate*
 * toward a ladder level either. The residual false positive — a single jump
 * that rescales both axes by one real zoom level with the outer size held —
 * remains accepted and documented.
 */
const onResize = (): void => {
  const dpr = window.devicePixelRatio
  if (dpr !== lastSeenDpr) {
    onDprChange(dpr)
    return
  }
  if (dprTracksZoom) return
  const iw = window.innerWidth
  const ih = window.innerHeight
  const ow = window.outerWidth
  const oh = window.outerHeight
  if (
    Math.abs(ow - baselineOuter) > WIDTH_EPS ||
    Math.abs(oh - baselineOuterHeight) > WIDTH_EPS
  ) {
    // A real window resize. The inner baselines are stored at 100%, so fold
    // the current zoom back out of the measured size.
    baselineOuter = ow
    baselineOuterHeight = oh
    baselineInner = iw * zoom
    baselineInnerHeight = ih * zoom
    return
  }
  // Not zoom: rebase so a later real zoom measures from the viewport that
  // remains, and so repeated near-misses never accumulate into a ladder hit.
  const rebase = (): void => {
    baselineInner = iw * zoom
    baselineInnerHeight = ih * zoom
  }
  const dw = Math.abs(iw - baselineInner / zoom)
  const dh = Math.abs(ih - baselineInnerHeight / zoom)
  if (dw < WIDTH_EPS && dh < WIDTH_EPS) return
  if (dw < WIDTH_EPS || dh < WIDTH_EPS) return rebase()
  const qw = quantizeZoom(baselineInner / iw)
  const qh = quantizeZoom(baselineInnerHeight / ih)
  if (qw !== qh || !ZOOM_LADDER.includes(qw)) return rebase()
  setZoom(qw)
}

let watchers = 0

/**
 * Subscribe to quantized zoom changes; returns the release function. The
 * listeners behind it are shared and refcounted exactly like
 * `trackFocusModality()`: the first subscriber arms one media query and one
 * `resize` listener for the whole page, the last release removes them
 * (releasing twice is a no-op).
 */
export function onZoomChange(callback: ZoomListener): () => void {
  if (typeof window === 'undefined') return () => {}
  listeners.add(callback)
  if (watchers++ === 0) {
    arm()
    window.addEventListener('resize', onResize)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    listeners.delete(callback)
    if (--watchers === 0) {
      disarm()
      window.removeEventListener('resize', onResize)
    }
  }
}

/**
 * Declare the *current* state to be 100% zoom: re-sample every baseline and
 * clear the tracked zoom. The escape hatch for the one classification hole
 * that needs a human — a display-mode switch at an identical logical size
 * (macOS 1440×900 HiDPI ↔ native), which moves nothing the discriminator can
 * see — and for a page that knows it loaded already-zoomed. The engine latch
 * survives: which signal zoom arrives through is a fact about the browser,
 * not about the baseline.
 */
export function resetZoomBaseline(): void {
  if (typeof window === 'undefined') return
  baselineDpr = window.devicePixelRatio || 1
  lastSeenDpr = baselineDpr
  baselineInner = window.innerWidth
  baselineInnerHeight = window.innerHeight
  baselineOuter = window.outerWidth
  baselineOuterHeight = window.outerHeight
  signature = readSignature()
  if (watchers > 0) arm()
  setZoom(1)
}
