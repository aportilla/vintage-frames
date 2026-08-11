import { html, type TemplateResult } from 'lit'
import type { ReactiveController, ReactiveControllerHost } from 'lit'
import type { DragController } from './drag.js'
import { effectiveScale, systemPxQuantum, sysLength } from './scale.js'
import { truePixelRatio } from './zoom.js'

/**
 * The title-bar element shared by `vf-window` and `vf-dialog`: the
 * `.vf-title-bar` row (skinned by `vfTitleBar` in styles/base.ts), the texture
 * layer behind it (racing stripes by default; `vf-window`'s utility variant
 * passes `'vf-dots'` for the windoid dither), and the four pointer bindings
 * that hand the bar to a {@link DragController}.
 *
 * Both components render a byte-identical bar with byte-identical wiring;
 * only what sits in the bar differs — vf-window interleaves its close/zoom
 * widgets around the title, vf-dialog carries just the title (with the id its
 * `aria-labelledby` points at). That goes in as `content`, so the four bindings
 * — which have to stay in lockstep with DragController's three handlers, and
 * where a dropped `pointercancel` would strand a drag — live in one place.
 *
 * The standard bar's racing stripes render here unconditionally, BOTH
 * engine renderings side by side — placed rows for Gecko/WebKit, the
 * 12-unit SVG for Blink — and the {@link vfStripes} recipe displays exactly
 * one (it has the per-engine split and its measurements). `texture` is the dots' different story: the exact fill
 * a width-declaring utility window renders INTO the dots layer — the
 * whole-surface raster or a consumer token's tile grid (src/tile-grid.ts).
 * Passing it marks the layer `vf-tile-grid`, which is what switches the
 * layer's own CSS-repeated tile off (see `vfDots`).
 *
 * A `<div>`, deliberately not a `<header>`: per HTML-AAM a `<header>` maps to
 * the `banner` landmark unless a sectioning ancestor demotes it, and inside a
 * shadow root nothing in the chain qualifies — so every window and dialog was
 * publishing an unnamed `banner` to AT landmark navigation. The bar is chrome,
 * not page structure; the skin selects by class, so nothing else moves.
 *
 * Internal to the kit: it bakes in our own `part` name and class contract, so
 * it is deliberately not re-exported from index.ts (same call as `number.ts`).
 */
/**
 * The racing stripes, both engine renderings in one template — the
 * {@link vfStripes} recipe displays exactly one (see it for the
 * measurements):
 *
 * - Six placed solid rows on the band's 2px rhythm, each positioned by one
 *   multiplication against `--vf-scale` — Gecko and WebKit, where a solid
 *   quad device-snaps exactly.
 * - A 12-unit-tall SVG (the 11-row band plus an empty pad row), its viewBox
 *   stretched onto a 12px-tall box — Blink and any unknown engine. Twelve,
 *   not eleven: 12·scale is a whole CSS length at every scale an integer
 *   display derives (18 CSS px at 3/2, 16 at 4/3), so the box the geometry
 *   stretches into never gets CSS-px-rounded. The rects carry no fill
 *   attribute; the recipe routes it through the ink token.
 *
 * Static — rows and SVG span the layer's width, so no component measurement
 * is involved and an undeclared-width window carries them all the same.
 */
const RACING_STRIPES: TemplateResult = html`${[0, 2, 4, 6, 8, 10].map(
    (row) => html`<span style="top:${sysLength(row)}"></span>`
  )}<svg
    viewBox="0 0 2 12"
    preserveAspectRatio="none"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <rect x="0" y="0" width="2" height="1"></rect>
    <rect x="0" y="2" width="2" height="1"></rect>
    <rect x="0" y="4" width="2" height="1"></rect>
    <rect x="0" y="6" width="2" height="1"></rect>
    <rect x="0" y="8" width="2" height="1"></rect>
    <rect x="0" y="10" width="2" height="1"></rect>
  </svg>`

export const chromeTitleBar = (
  drag: DragController,
  content: unknown,
  textureClass: 'vf-stripes' | 'vf-dots' = 'vf-stripes',
  texture?: unknown
): TemplateResult => html`
  <div
    class="vf-title-bar"
    part="title-bar"
    @pointerdown=${drag.onPointerDown}
    @pointermove=${drag.onPointerMove}
    @pointerup=${drag.onPointerUp}
    @pointercancel=${drag.onPointerUp}
  >
    <div class=${texture ? `${textureClass} vf-tile-grid` : textureClass}>
      ${texture ?? (textureClass === 'vf-stripes' ? RACING_STRIPES : null)}
    </div>
    ${content}
  </div>
`

/**
 * Correction change (in device px) small enough to leave alone — the same
 * bar GridSnapController uses, and for the same reason: at dpr 3 the layout
 * engine cannot represent every device px, so an irreducible remainder must
 * not be re-chased every sweep.
 */
const DEADBAND_DEVICE_PX = 0.05

/** Chromium's layout resolution; offsets are quantized to it (grid-snap.ts). */
const LAYOUT_UNIT_CSS_PX = 1 / 64

/**
 * Holds the flex-centered `.vf-title` patch on the placement lattice.
 *
 * The bar centers the patch as `(bar − patch) / 2`, and the patch's width
 * follows the heading's text run — so whenever the two widths' parities
 * differ the patch lands half a system px off the grid, which a 3:1 display
 * renders as title ink one device px off (both the glyph rows against the
 * close box's, and the patch edge cutting a stripe to a hairline). No static
 * rule can fix a parity that depends on the string, so this controller
 * measures the centered offset after each render and cancels the fraction
 * with `--vf-title-dx` on the host, which the recipe applies as a relative
 * `left` on the patch (through layout, not transform — a fractional
 * transform leaves a composite-time fringe; see grid-snap.ts).
 *
 * The offset snaps to the placement lattice ({@link systemPxQuantum} system
 * px — whole CSS px at dpr 2, where engines re-quantize sub-CSS-px paint per
 * box), the same lattice drags and dialog centering land on, so bar origin
 * plus offset stays on it absolutely. The exact-half remainder — the parity
 * case itself — is settled by a floor biased just under half a step: the
 * title gives QuickDraw's `div 2` its leftward half pixel, and measurement
 * noise (rects arrive quantized to 1/64 CSS px) can't flip the choice
 * between sweeps and jiggle the title.
 *
 * Re-measures after every host render (heading, size and scale changes all
 * re-render) and on any resize of the bar or patch — which is also how a
 * late-registering 'VF Display' lands: the swap re-measures the text run and
 * resizes the patch. A missing or boxless patch (the plain dialog frame, the
 * utility windoid's display:none title) resets the correction.
 */
export class TitleCenterController implements ReactiveController {
  /** Our current correction, in CSS px. */
  private applied = 0
  /** Exactly what we last wrote, to detect an externally rewritten style. */
  private written = ''
  private frame = 0
  private resizes?: ResizeObserver

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this)
  }

  hostConnected(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizes ??= new ResizeObserver(() => this.schedule())
    }
    // A reconnected host doesn't necessarily re-render; measure regardless.
    this.schedule()
  }

  hostDisconnected(): void {
    this.resizes?.disconnect()
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  hostUpdated(): void {
    this.schedule()
  }

  /** Coalesce to one measurement per frame, after layout settles. */
  private schedule(): void {
    if (this.frame || typeof window === 'undefined') return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.center()
    })
  }

  private center(): void {
    const root = this.host.shadowRoot
    const bar = root?.querySelector('.vf-title-bar')
    const title = root?.querySelector('.vf-title')
    if (!bar || !title) {
      this.reset()
      return
    }
    // Re-observing an already-observed target is a no-op, and a node replaced
    // by a chrome switch (plain ↔ striped) drops off the observer with itself.
    this.resizes?.observe(bar)
    this.resizes?.observe(title)

    const patch = title.getBoundingClientRect()
    if (!patch.width) {
      // The utility windoid's display:none title.
      this.reset()
      return
    }

    // If something rewrote the host's style attribute, the variable is gone
    // and the bookkeeping with it.
    const style = this.host.style
    if (style.getPropertyValue('--vf-title-dx') !== this.written) {
      this.applied = 0
      this.written = ''
    }

    // The flex-computed offset, with our own correction folded back out.
    const natural = patch.left - bar.getBoundingClientRect().left - this.applied
    const step = systemPxQuantum(this.host) * effectiveScale(this.host)
    // Floor at 0.45, not round at 0.5: the parity fault measures EXACTLY half
    // a step, where any unbiased rounding would flip on sub-1/64-px noise.
    const snapped = Math.floor(natural / step + 0.45) * step
    const next =
      Math.round((snapped - natural) / LAYOUT_UNIT_CSS_PX) * LAYOUT_UNIT_CSS_PX

    const dpr = truePixelRatio() || 1
    if (Math.abs(next - this.applied) * dpr < DEADBAND_DEVICE_PX) return
    this.applied = next
    this.written = `${next}px`
    style.setProperty('--vf-title-dx', this.written)
  }

  /** Drop the correction: delete the variable and forget everything. */
  private reset(): void {
    if (!this.written) return
    this.host.style.removeProperty('--vf-title-dx')
    this.applied = 0
    this.written = ''
  }
}

/**
 * Widget label, qualified by the window/dialog title when there is one —
 * several windows are open at once by design, so a bare "Close" repeated
 * across the desktop leaves an AT user no way to tell which window a button
 * belongs to.
 */
export const widgetLabel = (action: string, heading: string): string =>
  heading ? `${action} ${heading}` : action

/**
 * The close box (left of the bar) and zoom box (right of the bar), shared by
 * `vf-window` and a `closable` `vf-dialog`. Byte-identical markup for the same
 * reason as {@link chromeTitleBar}: the widgets must match by construction,
 * not by copies staying in sync. Skinned by `vfWindowWidgets` (styles/base.ts);
 * drag delegates must keep ignoring pointerdowns on `.box` so a press on a
 * widget never starts a bar drag.
 */
export const closeBox = (
  label: string,
  onClick: () => void
): TemplateResult => html`
  <button
    type="button"
    class="box close vf-focus"
    part="close-box"
    aria-label=${label}
    @click=${onClick}
  ></button>
`

export const zoomBox = (
  label: string,
  onClick: () => void
): TemplateResult => html`
  <button
    type="button"
    class="box zoom vf-focus"
    part="zoom-box"
    aria-label=${label}
    @click=${onClick}
  ></button>
`
