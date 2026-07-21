import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * Display scaling — replicate the classic 72 dpi "system pixel" on modern
 * screens.
 *
 * Vintage Frames' components are authored in *system pixels* (the 1-bit art
 * grid: a 1px border, a 13px checkbox, a 22px control). To read at their true
 * classic size — and stay pixel-crisp — each system pixel should map to a whole
 * number of device pixels. We target exactly **3 device pixels per system
 * pixel**, so the CSS scale adapts to `devicePixelRatio`:
 *
 *   1× display  → scale 3.0   (3 CSS px × 1 dpr = 3 device px)
 *   2× retina   → scale 1.5   (1.5 CSS px × 2 dpr = 3 device px)
 *   3× display  → scale 1.0   (1 CSS px × 3 dpr = 3 device px)
 *
 * Because it's always a whole 3 device px, the art is crisp at *every* dpr, not
 * only even ones. Components multiply their metrics by the inherited
 * `--vf-scale` custom property in `calc()`; JS geometry uses {@link sys} /
 * {@link toSys} to convert between system and CSS px. The scale is a plain
 * multiplier, so nesting never compounds: a window and a button inside it each
 * scale their own metrics once.
 *
 * Nothing here runs automatically — a component with no `--vf-scale` in scope
 * renders at 1× (today's behavior). Opt in with {@link applyScale} or by setting
 * `--vf-scale` yourself.
 */

/** Device pixels each authored system pixel should occupy. */
export const DEVICE_PX_PER_SYSTEM_PX = 3

/** The CSS scale factor for the current display: 3 / devicePixelRatio. */
export function getScale(): number {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  return DEVICE_PX_PER_SYSTEM_PX / dpr
}

/** Convert system (art) units to display (CSS) pixels. */
export function sys(value: number): number {
  return value * getScale()
}

/** Convert display (CSS) pixels to whole system (art) units. */
export function toSys(value: number): number {
  return Math.round(value / getScale())
}

/**
 * Watch for `devicePixelRatio` changes — the window moving to a monitor with a
 * different density, or the user changing browser zoom — and invoke `callback`
 * with the new scale. Returns a cleanup function.
 */
export function onScaleChange(callback: (scale: number) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  let mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  const handler = (): void => {
    callback(getScale())
    // dpr changed, so the old query no longer matches — re-register on the new one.
    mql.removeEventListener('change', handler)
    mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    mql.addEventListener('change', handler)
  }
  mql.addEventListener('change', handler)
  return () => mql.removeEventListener('change', handler)
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
  return onScaleChange(set)
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

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this)
  }

  hostConnected(): void {
    if (typeof window === 'undefined') return
    const set = (): void =>
      this.host.style.setProperty('--vf-scale', String(getScale()))
    // Own the value when we set it before (reconnect) or nothing is inherited.
    const ownsInline = this.host.style.getPropertyValue('--vf-scale') !== ''
    const inherited =
      getComputedStyle(this.host).getPropertyValue('--vf-scale').trim() !== ''
    if (ownsInline || !inherited) {
      set()
      this.stop = onScaleChange(set)
    }
  }

  hostDisconnected(): void {
    this.stop?.()
    this.stop = undefined
  }
}
