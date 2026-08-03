/**
 * Browser-zoom tracking — the zoom half of the display-scale model.
 *
 * Every component renders one system pixel (the 1-bit art unit) as a whole
 * number of device pixels. At 100% zoom that number is
 * {@link DEVICE_PX_PER_SYSTEM_PX} (3); as the user zooms, the target moves
 * with them — `clamp(round(3 × zoom), 1, 24)` — so at 200% the art is 6 device
 * px per system px and the kit grows *with* the page instead of un-zooming
 * itself back to physical size. Always whole device pixels, because the layout
 * contract's rule 1 is not negotiable.
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
 * ladder level browsers actually offer (within 2%), so `round(3z)`'s threshold
 * at exactly z = 1.5 can't flutter between 4 and 5 device px on a
 * width-derived 1.4998 vs 1.5001.
 */

/** Device pixels each authored system pixel occupies at 100% zoom. */
export const DEVICE_PX_PER_SYSTEM_PX = 3

/**
 * Hard bounds on the device-px-per-system-px target. 1 is the floor below
 * which the art stops being art; 24 is a guard against a mis-measured zoom,
 * not a policy.
 */
const MIN_TARGET = 1
const MAX_TARGET = 24

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
 * ladder). Exists specifically because `round(3z)` has a threshold at exactly
 * z = 1.5: without snapping, a width-derived 1.4998 and 1.5001 give 4 and 5
 * device px — a 25% size flip — on alternating resize events.
 */
export function quantizeZoom(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  for (const level of ZOOM_LADDER) {
    if (Math.abs(raw / level - 1) <= LADDER_TOLERANCE) return level
  }
  return raw
}

/**
 * Device px per system px the kit aims for at `zoom`: `clamp(round(3z), 1, 24)`.
 * `Math.round` ties go *up* (4.5 → 5), deliberately: a zoom-driven
 * accessibility response should err toward larger, so 150% zoom renders 167%
 * of true size rather than 133%.
 */
export function devicePxPerSystemPx(zoom: number): number {
  const target = Math.round(DEVICE_PX_PER_SYSTEM_PX * zoom)
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
