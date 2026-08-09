import { html, type TemplateResult } from 'lit'
import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { effectiveScale, sysLength } from './scale.js'
import { PRESS_HOLD_MS } from './motion.js'
import {
  SCROLL_ARROW_DOWN,
  SCROLL_ARROW_DOWN_FILL,
  SCROLL_ARROW_LEFT,
  SCROLL_ARROW_LEFT_FILL,
  SCROLL_ARROW_RIGHT,
  SCROLL_ARROW_RIGHT_FILL,
  SCROLL_ARROW_UP,
  SCROLL_ARROW_UP_FILL,
  type Glyph,
} from './glyphs.js'
import {
  TROUGH_MOTIF_X,
  TROUGH_MOTIF_Y,
  TROUGH_RECTS,
} from './styles/recipes/scroll-rail.js'
import { TileRasterCache } from './tile-grid.js'

/** Which way a rail runs. A component renders one rail per reserved axis. */
export type RailAxis = 'vertical' | 'horizontal'

/** One line, in system px — what an arrow click scrolls by. */
const LINE_SYS = 16

/** The fixed System 7 thumb, in system px (never proportional). */
const THUMB_SYS = 16

/** The channel between the divider and the component frame, in system px. */
const CHANNEL_SYS = 14

/**
 * Milliseconds between auto-repeat steps while an arrow or the trough is
 * held (after the initial {@link PRESS_HOLD_MS} beat) — the same ~15/s pace
 * as the menu scroll arrows, and like them deliberately not gated on
 * `prefers-reduced-motion`: the stepping is the interaction itself,
 * user-held and stopped the moment the press ends.
 */
const REPEAT_INTERVAL_MS = 66

/** What the components hand the controller. */
export interface ScrollRailOptions {
  /** The scrolling element the rail reflects and drives (a div or textarea). */
  getScroll: () => HTMLElement | null | undefined
  /**
   * Optionally, the content whose growth changes `scrollHeight` without the
   * scroller's own box resizing (slotted rows, wrapping copy) — observed so
   * the thumb re-syncs when it grows.
   */
  getContent?: () => Element | null | undefined
}

interface RailPress {
  pointerId: number
  kind: 'thumb' | 'page' | 'step'
  axis: RailAxis
  rail: HTMLElement
  /** Scroll direction of a page/step press. */
  dir: 1 | -1
  /** The held arrow button (step presses), carrying `data-pressed`. */
  button: HTMLElement | null
  /** Thumb drag: the press point and the scroll position it grabbed at. */
  startCoord: number
  startScroll: number
  /** Thumb drag: track length minus thumb length, in CSS px, at press time. */
  travelCss: number
  /** The pointer's latest main-axis coordinate (trough repeat aims at it). */
  lastCoord: number
}

/**
 * The behavior half of the kit-drawn scroll rails (SCROLL-RAILS-PLAN.md):
 * syncs the rail subtree {@link renderScrollRail} renders to the scroller's
 * native scroll state, and drives the three classic pointer interactions.
 *
 * The native scrollbar is hidden (`vfScrollRail` recipe), never the native
 * scrolling — wheel, trackpad momentum, keyboard and AT scrolling stay the
 * platform's, and this controller writes scroll position exclusively through
 * `scrollTop`/`scrollLeft`, so native scrolling, `ScrollStateController` and
 * consumers observing scroll events see one source of truth.
 *
 * What it owns:
 * - **Sync** — a `scroll` listener on the scroller (plus a ResizeObserver on
 *   scroller and content) recomputes the thumb's travel and writes it as a
 *   whole-system-px translate, so the art is crisp mid-scroll; accepts the
 *   ≤1-frame lag behind compositor wheel scrolling every scripted scrollbar
 *   has (at 1-bit there is no smooth motion to betray it — no rAF loop, no
 *   polling). The same pass sizes the trough's whole-surface dither raster
 *   (the exact-tile idiom, `tileRaster`) and writes the degenerate-track
 *   state the recipe's decision table styles.
 * - **Thumb drag** — pointer-captured and axis-locked, live scrolling (the
 *   modern expectation; System 7's dotted-outline drag is a possible later
 *   opt-in). The thumb's paint position always snaps to whole system px.
 * - **Trough press** — pages by one viewport minus one 16px line of overlap
 *   toward the press, auto-repeating after {@link PRESS_HOLD_MS} while held
 *   and pausing when the thumb reaches the pointer (classic behavior).
 * - **Arrow press** — steps one 16px line, auto-repeats on hold, and holds
 *   `data-pressed` on the button so the glyph fills solid for the press's
 *   whole extent.
 *
 * The rail subtree is `aria-hidden` and pointer-only — System 7 scrollbars
 * were never keyboard targets; keyboard users scroll the focused viewport
 * natively and screen readers scroll content their own way — so the
 * viewport's focus ring, tabindex gating and role/name logic are untouched.
 * Deliberately NOT reused: `snapSys`'s placement lattice — the rail needs
 * plain whole-system-px snapping, not the k-lattice a drag gesture stores
 * coordinates on.
 */
export class ScrollRailController implements ReactiveController {
  private resizeObserver?: ResizeObserver
  private scroller: HTMLElement | null = null
  private press: RailPress | null = null
  private holdTimer: number | undefined
  private repeatTimer: number | undefined

  /** One raster per axis, re-encoded only when the track's size changes. */
  private readonly troughCache = {
    vertical: new TileRasterCache(),
    horizontal: new TileRasterCache(),
  }

  constructor(
    private readonly host: ReactiveControllerHost &
      HTMLElement & { readonly renderRoot: HTMLElement | DocumentFragment },
    private readonly opts: ScrollRailOptions
  ) {
    host.addController(this)
  }

  hostUpdated(): void {
    this.wire()
    this.sync()
  }

  hostDisconnected(): void {
    this.clearRepeat()
    this.press = null
    this.unwire()
  }

  /** (Re-)attach the scroll listener and observers to the current scroller. */
  private wire(): void {
    const scroller = this.opts.getScroll() ?? null
    if (scroller === this.scroller) return
    this.unwire()
    this.scroller = scroller
    if (!scroller) return
    scroller.addEventListener('scroll', this.onScroll, { passive: true })
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.sync())
      this.resizeObserver.observe(scroller)
      const content = this.opts.getContent?.()
      if (content) this.resizeObserver.observe(content)
    }
  }

  private unwire(): void {
    this.scroller?.removeEventListener('scroll', this.onScroll)
    this.scroller = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
  }

  private readonly onScroll = (): void => this.sync()

  /**
   * Re-derive every measured output: thumb position, trough raster,
   * degenerate state. Safe to call any time; components hit it imperatively
   * when content changes without a box resize (a `<textarea>` on input —
   * the same moments they call `ScrollStateController.measure()`).
   */
  sync(): void {
    const scroller = this.scroller ?? this.opts.getScroll()
    const root = this.host.renderRoot
    if (!scroller || !root) return
    for (const rail of root.querySelectorAll('.vf-rail')) {
      this.syncRail(rail as HTMLElement, scroller)
    }
  }

  private syncRail(rail: HTMLElement, scroller: HTMLElement): void {
    const axis = railAxis(rail)
    const track = rail.querySelector<HTMLElement>('.vf-rail-track')
    const thumb = rail.querySelector<HTMLElement>('.vf-rail-thumb')
    if (!track || !thumb) return
    const scale = effectiveScale(this.host) || 1
    const rect = track.getBoundingClientRect()
    const trackSys = (axis === 'vertical' ? rect.height : rect.width) / scale

    // The classic decision table: track shorter than the thumb drops the
    // thumb; a rail with no track at all (arrow cells ate everything, or
    // more) drops the trough and arrows too — the recipe styles both.
    const degenerate =
      trackSys < 1 ? 'rail' : trackSys < THUMB_SYS ? 'thumb' : null
    if (degenerate) rail.setAttribute('data-degenerate', degenerate)
    else rail.removeAttribute('data-degenerate')
    if (degenerate === 'rail') return

    // Thumb travel: whole system px of the track minus the fixed thumb, so
    // the box is crisp mid-drag and mid-scroll.
    const range = this.scrollRange(scroller, axis)
    const pos =
      axis === 'vertical' ? scroller.scrollTop : scroller.scrollLeft
    const travelSys = trackSys - THUMB_SYS
    const offsetSys =
      range > 0 && travelSys > 0
        ? Math.max(
            0,
            Math.min(
              Math.floor(travelSys),
              Math.round((pos / range) * travelSys)
            )
          )
        : 0
    thumb.style.translate =
      axis === 'vertical'
        ? `0 ${sysLength(offsetSys)}`
        : `${sysLength(offsetSys)} 0`

    // The trough's whole-surface raster (the exact-tile idiom): one image px
    // per system px, ceiled up to whole motifs of the measured track so a
    // fractional box overshoots rather than stretches — the trough's clip
    // crops the overdraw. The cache re-encodes only when the size changes.
    const art = rail.querySelector<HTMLElement>('.vf-rail-trough-art')
    if (art) {
      const main =
        Math.ceil(
          (trackSys + (axis === 'vertical' ? TROUGH_MOTIF_Y : TROUGH_MOTIF_X)) /
            (axis === 'vertical' ? TROUGH_MOTIF_Y : TROUGH_MOTIF_X)
        ) * (axis === 'vertical' ? TROUGH_MOTIF_Y : TROUGH_MOTIF_X)
      const w = axis === 'vertical' ? CHANNEL_SYS : main
      const h = axis === 'vertical' ? main : CHANNEL_SYS
      art.style.width = sysLength(w)
      art.style.height = sysLength(h)
      art.style.backgroundImage = this.troughCache[axis].for(
        TROUGH_MOTIF_X,
        TROUGH_MOTIF_Y,
        TROUGH_RECTS,
        w,
        h
      )
    }
  }

  /* ── Pointer interactions (bound by renderScrollRail) ─────────────────── */

  readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.press !== null) return
    const rail = event.currentTarget as HTMLElement
    const scroller = this.opts.getScroll()
    if (!scroller) return
    const axis = railAxis(rail)
    // A blanked rail is not interactive: idle axis, inactive window, or the
    // bare degenerate rail (the thumbless degenerate keeps its arrows and
    // trough working, as the classic control did).
    const overflowAttr =
      axis === 'vertical' ? 'data-overflow-y' : 'data-overflow-x'
    if (scroller.getAttribute(overflowAttr) === 'false') return
    if (scroller.hasAttribute('data-window-inactive')) return
    if (rail.getAttribute('data-degenerate') === 'rail') return

    const target = event.target as HTMLElement
    const coord = axis === 'vertical' ? event.clientY : event.clientX
    const scale = effectiveScale(this.host) || 1
    const thumb = target.closest('.vf-rail-thumb')
    const decrement = target.closest<HTMLElement>('.vf-rail-button--decrement')
    const increment = target.closest<HTMLElement>('.vf-rail-button--increment')

    if (thumb) {
      const track = rail.querySelector<HTMLElement>('.vf-rail-track')
      if (!track) return
      const rect = track.getBoundingClientRect()
      const trackCss = axis === 'vertical' ? rect.height : rect.width
      this.press = {
        pointerId: event.pointerId,
        kind: 'thumb',
        axis,
        rail,
        dir: 1,
        button: null,
        startCoord: coord,
        startScroll:
          axis === 'vertical' ? scroller.scrollTop : scroller.scrollLeft,
        travelCss: trackCss - THUMB_SYS * scale,
        lastCoord: coord,
      }
    } else if (decrement || increment) {
      const button = (decrement ?? increment) as HTMLElement
      const dir: 1 | -1 = decrement ? -1 : 1
      button.setAttribute('data-pressed', '')
      this.press = {
        pointerId: event.pointerId,
        kind: 'step',
        axis,
        rail,
        dir,
        button,
        startCoord: coord,
        startScroll: 0,
        travelCss: 0,
        lastCoord: coord,
      }
      this.stepBy(dir, axis)
      this.armRepeat(() => this.stepBy(dir, axis))
    } else if (target.closest('.vf-rail-track')) {
      const thumbEl = rail.querySelector<HTMLElement>('.vf-rail-thumb')
      const thumbRect = thumbEl?.getBoundingClientRect()
      const thumbStart =
        (thumbRect && (axis === 'vertical' ? thumbRect.top : thumbRect.left)) ??
        coord
      const dir: 1 | -1 = coord < thumbStart ? -1 : 1
      this.press = {
        pointerId: event.pointerId,
        kind: 'page',
        axis,
        rail,
        dir,
        button: null,
        startCoord: coord,
        startScroll: 0,
        travelCss: 0,
        lastCoord: coord,
      }
      this.pageBy(dir, axis)
      this.armRepeat(() => this.pageTowardPointer())
    } else {
      return
    }
    rail.setPointerCapture(event.pointerId)
    // Suppress text selection and native focus shuffling — the rail is
    // pointer-only chrome, and a press on it must not move focus.
    event.preventDefault()
  }

  readonly onPointerMove = (event: PointerEvent): void => {
    const press = this.press
    if (!press || event.pointerId !== press.pointerId) return
    press.lastCoord =
      press.axis === 'vertical' ? event.clientY : event.clientX
    if (press.kind !== 'thumb') return
    const scroller = this.opts.getScroll()
    if (!scroller || press.travelCss <= 0) return
    const range = this.scrollRange(scroller, press.axis)
    if (range <= 0) return
    // Axis-locked: only the main-axis delta moves the scroll position (the
    // browser clamps the write). The thumb's own paint position comes back
    // through the scroll event's sync, already snapped to whole system px.
    const next =
      press.startScroll +
      ((press.lastCoord - press.startCoord) / press.travelCss) * range
    if (press.axis === 'vertical') scroller.scrollTop = next
    else scroller.scrollLeft = next
  }

  /** Ends a press on pointerup / pointercancel / lostpointercapture. */
  readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press
    if (!press || event.pointerId !== press.pointerId) return
    this.press = null
    this.clearRepeat()
    press.button?.removeAttribute('data-pressed')
    // Releasing the capture re-enters here via lostpointercapture; by then
    // `press` is already null, so the teardown is idempotent.
    if (press.rail.hasPointerCapture(event.pointerId)) {
      press.rail.releasePointerCapture(event.pointerId)
    }
  }

  /* ── The scroll writes ────────────────────────────────────────────────── */

  private scrollRange(scroller: HTMLElement, axis: RailAxis): number {
    return axis === 'vertical'
      ? scroller.scrollHeight - scroller.clientHeight
      : scroller.scrollWidth - scroller.clientWidth
  }

  /** One line ({@link LINE_SYS} system px) in `dir`. */
  private stepBy(dir: 1 | -1, axis: RailAxis): void {
    const scroller = this.opts.getScroll()
    if (!scroller) return
    const step = dir * LINE_SYS * (effectiveScale(this.host) || 1)
    if (axis === 'vertical') scroller.scrollTop += step
    else scroller.scrollLeft += step
  }

  /** One viewport minus one line of overlap in `dir` (the classic page). */
  private pageBy(dir: 1 | -1, axis: RailAxis): void {
    const scroller = this.opts.getScroll()
    if (!scroller) return
    const line = LINE_SYS * (effectiveScale(this.host) || 1)
    const viewport =
      axis === 'vertical' ? scroller.clientHeight : scroller.clientWidth
    const page = Math.max(line, viewport - line)
    if (axis === 'vertical') scroller.scrollTop += dir * page
    else scroller.scrollLeft += dir * page
  }

  /**
   * One auto-repeat beat of a held trough press: page again unless the thumb
   * has reached the pointer — classic behavior; the press keeps repeating if
   * the pointer then moves past the thumb again.
   */
  private pageTowardPointer(): void {
    const press = this.press
    if (!press || press.kind !== 'page') return
    const thumb = press.rail.querySelector<HTMLElement>('.vf-rail-thumb')
    if (thumb) {
      const rect = thumb.getBoundingClientRect()
      const start = press.axis === 'vertical' ? rect.top : rect.left
      const end = press.axis === 'vertical' ? rect.bottom : rect.right
      if (press.dir > 0 ? end > press.lastCoord : start < press.lastCoord) {
        return
      }
    }
    this.pageBy(press.dir, press.axis)
  }

  private armRepeat(beat: () => void): void {
    this.clearRepeat()
    this.holdTimer = window.setTimeout(() => {
      this.repeatTimer = window.setInterval(beat, REPEAT_INTERVAL_MS)
    }, PRESS_HOLD_MS)
  }

  private clearRepeat(): void {
    if (this.holdTimer !== undefined) window.clearTimeout(this.holdTimer)
    if (this.repeatTimer !== undefined) window.clearInterval(this.repeatTimer)
    this.holdTimer = undefined
    this.repeatTimer = undefined
  }
}

const railAxis = (rail: HTMLElement): RailAxis =>
  rail.classList.contains('vf-rail--horizontal') ? 'horizontal' : 'vertical'

/**
 * An arrow sprite windowed to its 14×14 interior. The glyphs are stated on
 * the scrollbar's full 16-unit cell, whose outer ring is exactly the frame
 * and divider lines the rail draws as real borders — and every arrow cell's
 * padding box is that interior by construction — so one viewBox window
 * places all eight sprites with no per-variant offsets, and the ink (which
 * never reaches the ring) survives whole.
 */
const railArrow = (glyph: Glyph, state: 'rest' | 'fill'): TemplateResult =>
  html`<svg
    class="vf-rail-arrow vf-rail-arrow--${state}"
    viewBox="1 1 14 14"
    fill="currentColor"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <path d=${glyph.d}></path>
  </svg>`

/**
 * The rail subtree the `vfScrollRail` recipe styles — arrows at each end, the
 * dithered trough and the fixed thumb between them — wired to a
 * {@link ScrollRailController}.
 *
 * Render it as a **later sibling of the scrolling element** (the recipe's
 * state selectors reach the rail from the scroller's attributes), inside a
 * container that lays the rail along the component's edge; the component's
 * own 1px frame border supplies the rail's outer line. The subtree is
 * `aria-hidden` and contributes nothing to the accessibility tree or tab
 * order — scrolling's keyboard and AT contract lives on the viewport, where
 * it always did.
 */
export function renderScrollRail(
  rail: ScrollRailController,
  axis: RailAxis
): TemplateResult {
  const [decRest, decFill, incRest, incFill] =
    axis === 'vertical'
      ? [
          SCROLL_ARROW_UP,
          SCROLL_ARROW_UP_FILL,
          SCROLL_ARROW_DOWN,
          SCROLL_ARROW_DOWN_FILL,
        ]
      : [
          SCROLL_ARROW_LEFT,
          SCROLL_ARROW_LEFT_FILL,
          SCROLL_ARROW_RIGHT,
          SCROLL_ARROW_RIGHT_FILL,
        ]
  return html`
    <div
      class="vf-rail vf-rail--${axis}"
      aria-hidden="true"
      @pointerdown=${rail.onPointerDown}
      @pointermove=${rail.onPointerMove}
      @pointerup=${rail.onPointerUp}
      @pointercancel=${rail.onPointerUp}
      @lostpointercapture=${rail.onPointerUp}
    >
      <div class="vf-rail-button vf-rail-button--decrement">
        ${railArrow(decRest, 'rest')}${railArrow(decFill, 'fill')}
      </div>
      <div class="vf-rail-track">
        <div class="vf-rail-trough">
          <div class="vf-rail-trough-art"></div>
        </div>
        <div class="vf-rail-thumb"></div>
      </div>
      <div class="vf-rail-button vf-rail-button--increment">
        ${railArrow(incRest, 'rest')}${railArrow(incFill, 'fill')}
      </div>
    </div>
  `
}
