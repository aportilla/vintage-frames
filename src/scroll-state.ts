import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { sys } from './scale.js'

/** Sub-pixel scroll slop (fractional `--vf-scale` rounding) to ignore. */
const OVERFLOW_EPSILON = 1

/**
 * Vertical slop, in system px — the body face's negative half-leading.
 *
 * A face renders its content area at the em (16 system px), but `vf-paragraph`
 * sets Geneva's authentic 12-system-px line box under it, so half-leading is
 * `(12 - 16) / 2 = -2`: the inline box spills 2 system px past the block box at
 * each end, and `scrollHeight` counts the bottom one. There is no ink in that
 * spill — Geneva 9 draws 9 up / 2 down, inside the 12 — so a box whose content
 * visually fits would otherwise measure as overflowing and grow a live rail,
 * a tab stop and a role.
 *
 * It has to be system px rather than CSS px because it scales with the art:
 * 6 CSS px at scale 3, 18 at scale 9. Genuine overflow clears it easily — the
 * next line of body copy is a whole 12-system-px line box.
 *
 * Vertical only: the spill is a leading artifact, so the horizontal axis keeps
 * the sub-pixel epsilon and still catches a 1-system-px-wide overrun.
 */
const LEADING_SPILL_SYS = 2

/**
 * Rail-state tracking for System 7 "always-a-rail" scrollbars.
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
 * (`"true"` | `"false"`) onto the scroll element. The shared `vfScrollRail`
 * recipe keys the drawn rail's dither, thumb and arrows off those attributes,
 * so a rail is a bare white channel at `"false"` and the full System 7
 * scrollbar at `"true"`.
 *
 * It also supplies the HIG's inactive-window treatment: a window that isn't
 * frontmost must not display interactive scroll UX, so System 7 blanked a
 * deactivated window's scrollbars back to the empty rail (and its List
 * Manager/TextEdit did the same for scrollbars *inside* the window). The
 * controller finds the nearest `vf-window` up the composed tree, watches its
 * reflected `active` attribute, and toggles `data-window-inactive`
 * (presence-only) on the scroll element; the recipe empties the
 * dither/thumb/arrows while it is present, regardless of overflow. A scroller
 * with no `vf-window` ancestor never carries the attribute — `vf-dialog` has
 * no inactive state, and a bare scroll component on a page always draws live.
 *
 * The controller reports BOTH axes always; each component decides which rails
 * it *reserves* by which rail elements it renders (`renderScrollRail`,
 * src/scroll-rail.ts). An unreserved axis still scrolls natively but draws no
 * rail, so the idle rules never touch it. The attributes exist only on
 * managed elements, so a plain `.vf-scroll` used without a controller is
 * untouched.
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
 * `<textarea>` changing scrollHeight on input would still need the imperative
 * path). The window-activity half has the same trajectory via `@container
 * style()` queries: vf-window cascades a custom property under
 * `:host(:not([active]))` and the recipe gates on
 * `style(--vf-window-active: false)`, retiring {@link observeWindow}'s
 * MutationObserver and composed-tree walk. The rails being ordinary DOM,
 * either migration is a plain selector swap — the old scrollbar-pseudo
 * re-resolution caveat retired with `::-webkit-scrollbar`.
 */
export class ScrollStateController implements ReactiveController {
  private resizeObserver?: ResizeObserver
  private windowObserver?: MutationObserver
  private vfWindow: HTMLElement | null = null
  private wired = false

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly getScroll: () => HTMLElement | null | undefined,
    private readonly getContent?: () => Element | null | undefined,
    /**
     * Invoked whenever the measured overflow state changes (including the
     * first measurement), with the per-axis result. Components that gate
     * *rendered* state on scrollability — vf-scroll-area's conditional tab
     * stop — hang a reactive property off this; the data attributes alone
     * are written outside Lit's render and would never re-render the host.
     */
    private readonly onOverflowChange?: (overflow: {
      x: boolean
      y: boolean
    }) => void
  ) {
    host.addController(this)
  }

  hostConnected(): void {
    this.wired = false
    this.wire()
    this.observeWindow()
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
    this.reflectWindowState()
  }

  hostDisconnected(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.windowObserver?.disconnect()
    this.windowObserver = undefined
    this.vfWindow = null
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
   * Find the containing `vf-window` (checked by tag name, not instanceof — an
   * import here would pull the whole window component into every scroller's
   * graph) and watch its `active` attribute. The walk crosses shadow
   * boundaries, so it reaches the window whether the scroller is slotted into
   * its body (light-DOM ancestor) or is the window's own edge scroll area
   * (shadow-DOM ancestor). Reconnect re-runs it, so a reparented scroller
   * re-resolves its window.
   */
  private observeWindow(): void {
    let node: Node | null = this.host
    this.vfWindow = null
    while (node) {
      if (node instanceof HTMLElement && node.localName === 'vf-window') {
        this.vfWindow = node
        break
      }
      node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)
    }
    if (!this.vfWindow || typeof MutationObserver === 'undefined') return
    this.windowObserver ??= new MutationObserver(() =>
      this.reflectWindowState()
    )
    this.windowObserver.observe(this.vfWindow, {
      attributes: true,
      attributeFilter: ['active'],
    })
  }

  /**
   * Reflect the containing window's `active` state as a presence-only
   * `data-window-inactive` on the scroll element. A window that hasn't
   * upgraded yet has no `active` attribute (its default reflects on first
   * update, which precedes any scroller rendering inside it); the observer
   * catches the reflection either way.
   */
  private reflectWindowState(): void {
    const el = this.getScroll()
    if (!el) return
    const inactive =
      this.vfWindow !== null && !this.vfWindow.hasAttribute('active')
    if (el.hasAttribute('data-window-inactive') === inactive) return
    el.toggleAttribute('data-window-inactive', inactive)
  }

  /**
   * Measure overflow and reflect it as `data-overflow-{x,y}` on the scroll
   * element. Safe to call any time; components hit it imperatively when content
   * changes without a box resize (e.g. a `<textarea>` on input).
   */
  measure(): void {
    const el = this.getScroll()
    if (!el) return
    const overY =
      el.scrollHeight - el.clientHeight > sys(LEADING_SPILL_SYS, el) + OVERFLOW_EPSILON
    const overX = el.scrollWidth - el.clientWidth > OVERFLOW_EPSILON
    const changed =
      el.getAttribute('data-overflow-y') !== String(overY) ||
      el.getAttribute('data-overflow-x') !== String(overX)
    el.setAttribute('data-overflow-y', String(overY))
    el.setAttribute('data-overflow-x', String(overX))
    if (changed) {
      this.onOverflowChange?.({ x: overX, y: overY })
    }
  }
}
