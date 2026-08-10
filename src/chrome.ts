import { html, type TemplateResult } from 'lit'
import type { DragController } from './drag.js'
import { sysLength } from './scale.js'

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
