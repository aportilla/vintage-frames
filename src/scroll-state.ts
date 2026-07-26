import type { ReactiveController, ReactiveControllerHost } from 'lit'

/** Sub-pixel scroll slop (fractional `--vf-scale` rounding) to ignore. */
const OVERFLOW_EPSILON = 1

/**
 * Overflow-state tracking for System 7 "always-a-rail" scrollbars.
 *
 * System 7 draws a scrollable frame's scroll bar as a permanent part of its
 * chrome: an empty white rail sits in the reserved channel even when there is
 * nothing to scroll, and it only fills in — dither track, draggable thumb,
 * arrow buttons — once the content actually overflows. Native `overflow` can't
 * express that: `auto` is all-or-nothing (no rail when it fits) and `scroll`
 * shows the whole bar always (arrows + a full-height thumb even when it fits),
 * and there is no CSS selector for "is this element overflowing".
 *
 * This controller supplies the missing signal. It measures scroll vs. client
 * size on both axes and writes `data-overflow-x` / `data-overflow-y`
 * (`"true"` | `"false"`) onto the scroll element. The shared `vfScrollbars`
 * recipe keys the dither, thumb and arrows off those attributes, so a bar is a
 * bare white rail at `"false"` and the full System 7 scrollbar at `"true"`.
 *
 * The controller reports BOTH axes always; each component decides which rails
 * it *reserves* purely in CSS (`overflow-{x,y}: scroll` + `scrollbar-gutter`).
 * An unreserved axis (`overflow: auto`) only renders a bar when it overflows —
 * at which point its attribute already reads `"true"` — so the idle rules never
 * touch it. The attributes exist only on managed elements, so a plain
 * `.vf-scroll` used without a controller is untouched.
 *
 * Re-measures on every signal that can change overflow: the viewport resizing
 * (host size, `--vf-scale`), the content resizing (a passed content element —
 * slotted rows growing, media or late bitmap-font load), the host re-rendering,
 * and an imperative {@link measure} (a `<textarea>`'s own scrollHeight changes
 * on input without any box resizing).
 *
 * FUTURE: once `@container scroll-state(scrollable)` container queries reach
 * baseline support, slotted-content components could drop this JS and gate the
 * same recipe rules with a pure-CSS `@container` query instead (a native
 * `<textarea>`'s own scrollbar would still need the imperative path). See the
 * matching note in styles/base.ts `vfScrollbars`.
 */
export class ScrollStateController implements ReactiveController {
  private resizeObserver?: ResizeObserver
  private wired = false

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly getScroll: () => HTMLElement | null | undefined,
    private readonly getContent?: () => Element | null | undefined
  ) {
    host.addController(this)
  }

  hostConnected(): void {
    this.wired = false
    this.wire()
    // The bitmap chrome/body faces register and paint after first layout, which
    // changes measured content height; re-measure once they're ready so a field
    // that only overflows in the real font doesn't miss its first activation.
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => this.measure())
    }
  }

  hostUpdated(): void {
    this.wire()
    this.measure()
  }

  hostDisconnected(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.wired = false
  }

  /** (Re-)attach the ResizeObserver to the viewport and content boxes. */
  private wire(): void {
    if (this.wired || typeof ResizeObserver === 'undefined') return
    const scroll = this.getScroll()
    if (!scroll) return
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.measure())
    }
    // Observe the viewport (its box changes on host resize / scale) AND the
    // content (its box changes as rows/copy grow) — a fixed-height viewport
    // never resizes when its own content overflows, so content is the signal
    // that catches typing, added rows and late-loading media.
    this.resizeObserver.observe(scroll)
    const content = this.getContent?.()
    if (content) this.resizeObserver.observe(content)
    this.wired = true
  }

  /**
   * Measure overflow and reflect it as `data-overflow-{x,y}` on the scroll
   * element. Safe to call any time; components hit it imperatively when content
   * changes without a box resize (e.g. a `<textarea>` on input).
   */
  measure(): void {
    const el = this.getScroll()
    if (!el) return
    const overY = el.scrollHeight - el.clientHeight > OVERFLOW_EPSILON
    const overX = el.scrollWidth - el.clientWidth > OVERFLOW_EPSILON
    const changed =
      el.getAttribute('data-overflow-y') !== String(overY) ||
      el.getAttribute('data-overflow-x') !== String(overX)
    el.setAttribute('data-overflow-y', String(overY))
    el.setAttribute('data-overflow-x', String(overX))
    if (changed) refreshWebKitScrollbars(el)
  }
}

/**
 * Force WebKit to rebuild an element's scrollbars after the overflow
 * attributes flip.
 *
 * Safari resolves `::-webkit-scrollbar` pseudo-element styles when a scrollbar
 * is (re)created or its scroller relaid out — not when an attribute selector
 * starts or stops matching. Typing into a `vf-text-area` flips
 * `data-overflow-y` to `"true"`, but Safari keeps showing the idle rail until
 * something unrelated (blurring the field, say, whose `:focus` border
 * treatment repaints the box) makes it re-resolve. Tearing the scrollbars down
 * and back up inside one task — overflow to `hidden` and immediately back,
 * with a forced layout between — recreates them under the current attributes
 * with no intermediate paint (no frame boundary is crossed), no focus or
 * selection change, and scroll offsets restored in case the `hidden` clamp
 * moved them. Chromium restyles scrollbars on attribute changes by itself, so
 * only WebKit takes this path.
 */
function refreshWebKitScrollbars(el: HTMLElement): void {
  const isWebKit =
    typeof window !== 'undefined' &&
    typeof (window as { webkitConvertPointFromNodeToPage?: unknown })
      .webkitConvertPointFromNodeToPage === 'function'
  if (!isWebKit) return
  const { scrollTop, scrollLeft } = el
  const prev = el.style.overflow
  el.style.overflow = 'hidden'
  void el.offsetHeight
  el.style.overflow = prev
  el.scrollTop = scrollTop
  el.scrollLeft = scrollLeft
}
