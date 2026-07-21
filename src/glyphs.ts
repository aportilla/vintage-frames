import { html } from 'lit'
import type { TemplateResult } from 'lit'

/**
 * Pixel-exact 1-bit glyphs reconstructed from the **Classic Macintosh UI Kit**
 * sprite sheet (`Classic Macintosh UI Kit Reference/ui-sprites/`). Each glyph's
 * `d` is a run-length-merged fill path traced directly from the original PNG's
 * pixel grid. Rendered at its native pixel size (or an integer multiple) with
 * `shape-rendering: crispEdges` it is pixel-exact — so consumers MUST size the
 * SVG to `w`×`h` px (or a whole multiple), never a fractional scale, or the
 * 1-bit edges snap unevenly to the device grid. It inherits `currentColor`
 * (fully themeable) and ships as inline SVG — no external raster assets,
 * matching the library's zero-CSS, `var(--vf-*)`-themeable design (see SPEC §1).
 *
 * The sprites are authoritative per SPEC.md: "When this spec is ambiguous, the
 * reference images win." These replace the earlier anti-aliased approximations
 * (the checkbox ✕ was a 1.5px SVG stroke; the radio was a `border-radius: 50%`
 * box; the menu ✓ was a font-dependent Unicode character; the popup ▼ was a
 * CSS-border triangle) with the exact System 7 pixel shapes.
 */
export interface Glyph {
  /** Native grid width (viewBox units = source-sprite pixels). */
  readonly w: number
  /** Native grid height. */
  readonly h: number
  /** SVG path data (a union of 1×N pixel-run rectangles). */
  readonly d: string
}

/** Checkbox ✕ — the interior corner-to-corner cross (`check Selected=True`). */
export const CHECKBOX_X: Glyph = {
  w: 12,
  h: 12,
  d: 'M1 1h1v1h-1zM10 1h1v1h-1zM2 2h1v1h-1zM9 2h1v1h-1zM3 3h1v1h-1zM8 3h1v1h-1zM4 4h1v1h-1zM7 4h1v1h-1zM5 5h2v1h-2zM5 6h2v1h-2zM4 7h1v1h-1zM7 7h1v1h-1zM3 8h1v1h-1zM8 8h1v1h-1zM2 9h1v1h-1zM9 9h1v1h-1zM1 10h1v1h-1zM10 10h1v1h-1z',
}

/** Radio solid disc — the white control face under the ring (`radio` outline, flood-filled). */
export const RADIO_FACE: Glyph = {
  w: 12,
  h: 12,
  d: 'M4 0h4v1h-4zM2 1h8v1h-8zM1 2h10v1h-10zM1 3h10v1h-10zM0 4h12v1h-12zM0 5h12v1h-12zM0 6h12v1h-12zM0 7h12v1h-12zM1 8h10v1h-10zM1 9h10v1h-10zM2 10h8v1h-8zM4 11h4v1h-4z',
}

/** Radio ring — the 1px pixel circle outline (`radio Selected=False`). */
export const RADIO_RING: Glyph = {
  w: 12,
  h: 12,
  d: 'M4 0h4v1h-4zM2 1h2v1h-2zM8 1h2v1h-2zM1 2h1v1h-1zM10 2h1v1h-1zM1 3h1v1h-1zM10 3h1v1h-1zM0 4h1v1h-1zM11 4h1v1h-1zM0 5h1v1h-1zM11 5h1v1h-1zM0 6h1v1h-1zM11 6h1v1h-1zM0 7h1v1h-1zM11 7h1v1h-1zM1 8h1v1h-1zM10 8h1v1h-1zM1 9h1v1h-1zM10 9h1v1h-1zM2 10h2v1h-2zM8 10h2v1h-2zM4 11h4v1h-4z',
}

/** Radio ring, pressed — the 2px-thick outline (`radio State=Press`). */
export const RADIO_RING_PRESSED: Glyph = {
  w: 12,
  h: 12,
  d: 'M4 0h4v1h-4zM2 1h8v1h-8zM1 2h3v1h-3zM8 2h3v1h-3zM1 3h2v1h-2zM9 3h2v1h-2zM0 4h2v1h-2zM10 4h2v1h-2zM0 5h2v1h-2zM10 5h2v1h-2zM0 6h2v1h-2zM10 6h2v1h-2zM0 7h2v1h-2zM10 7h2v1h-2zM1 8h2v1h-2zM9 8h2v1h-2zM1 9h3v1h-3zM8 9h3v1h-3zM2 10h8v1h-8zM4 11h4v1h-4z',
}

/** Radio dot — the centered pixel disc shown when selected (`radio Selected=True` minus ring). */
export const RADIO_DOT: Glyph = {
  w: 12,
  h: 12,
  d: 'M4 3h4v1h-4zM3 4h6v1h-6zM3 5h6v1h-6zM3 6h6v1h-6zM3 7h6v1h-6zM4 8h4v1h-4z',
}

/** Menu / popup ✓ checkmark (`Symbols/Check.png`). */
export const CHECKMARK: Glyph = {
  w: 9,
  h: 9,
  d: 'M8 0h1v1h-1zM7 1h2v1h-2zM6 2h2v1h-2zM5 3h2v1h-2zM0 4h1v1h-1zM4 4h2v1h-2zM0 5h2v1h-2zM3 5h2v1h-2zM1 6h3v1h-3zM2 7h1v1h-1z',
}

/** Popup-menu ▼ caret (`Symbols/Caret Down.png`). */
export const CARET_DOWN: Glyph = {
  w: 11,
  h: 6,
  d: 'M0 0h11v1h-11zM1 1h9v1h-9zM2 2h7v1h-7zM3 3h5v1h-5zM4 4h3v1h-3zM5 5h1v1h-1z',
}

/**
 * The "little arrows" stepper at rest — a rounded 1-bit frame enclosing hollow
 * up/down arrows (`Little arrows.png`), used by `vf-number-field`.
 */
export const STEPPER: Glyph = {
  w: 15,
  h: 25,
  d: 'M2 0h11v1h-11zM1 1h1v1h-1zM13 1h1v1h-1zM0 2h1v1h-1zM14 2h1v1h-1zM0 3h1v1h-1zM7 3h1v1h-1zM14 3h1v1h-1zM0 4h1v1h-1zM6 4h1v1h-1zM8 4h1v1h-1zM14 4h1v1h-1zM0 5h1v1h-1zM5 5h1v1h-1zM9 5h1v1h-1zM14 5h1v1h-1zM0 6h1v1h-1zM4 6h1v1h-1zM10 6h1v1h-1zM14 6h1v1h-1zM0 7h1v1h-1zM3 7h3v1h-3zM9 7h3v1h-3zM14 7h1v1h-1zM0 8h1v1h-1zM5 8h1v1h-1zM9 8h1v1h-1zM14 8h1v1h-1zM0 9h1v1h-1zM5 9h1v1h-1zM9 9h1v1h-1zM14 9h1v1h-1zM0 10h1v1h-1zM5 10h5v1h-5zM14 10h1v1h-1zM0 11h1v1h-1zM14 11h1v1h-1zM0 12h1v1h-1zM14 12h1v1h-1zM0 13h1v1h-1zM14 13h1v1h-1zM0 14h1v1h-1zM5 14h5v1h-5zM14 14h1v1h-1zM0 15h1v1h-1zM5 15h1v1h-1zM9 15h1v1h-1zM14 15h1v1h-1zM0 16h1v1h-1zM5 16h1v1h-1zM9 16h1v1h-1zM14 16h1v1h-1zM0 17h1v1h-1zM3 17h3v1h-3zM9 17h3v1h-3zM14 17h1v1h-1zM0 18h1v1h-1zM4 18h1v1h-1zM10 18h1v1h-1zM14 18h1v1h-1zM0 19h1v1h-1zM5 19h1v1h-1zM9 19h1v1h-1zM14 19h1v1h-1zM0 20h1v1h-1zM6 20h1v1h-1zM8 20h1v1h-1zM14 20h1v1h-1zM0 21h1v1h-1zM7 21h1v1h-1zM14 21h1v1h-1zM0 22h1v1h-1zM14 22h1v1h-1zM1 23h1v1h-1zM13 23h1v1h-1zM2 24h11v1h-11z',
}

/**
 * The horizontal slider thumb — a shield-shaped handle with three vertical grip
 * lines and a pointed bottom (`Slider Handle.png`), used by `vf-slider`. Traced
 * pixel-exact from the sprite: an 11×12 hollow 1-bit frame (flat top, tapering
 * to a point) enclosing the three grip strokes. The grip lines sit at columns
 * 3/5/7 so the middle stroke (x5) marks the thumb's value point.
 */
export const SLIDER_THUMB: Glyph = {
  w: 11,
  h: 12,
  d: 'M1 0h9v1h-9zM0 1h1v1h-1zM10 1h1v1h-1zM0 2h1v1h-1zM10 2h1v1h-1zM0 3h1v1h-1zM3 3h1v1h-1zM5 3h1v1h-1zM7 3h1v1h-1zM10 3h1v1h-1zM0 4h1v1h-1zM3 4h1v1h-1zM5 4h1v1h-1zM7 4h1v1h-1zM10 4h1v1h-1zM0 5h1v1h-1zM3 5h1v1h-1zM5 5h1v1h-1zM7 5h1v1h-1zM10 5h1v1h-1zM0 6h1v1h-1zM3 6h1v1h-1zM5 6h1v1h-1zM7 6h1v1h-1zM10 6h1v1h-1zM0 7h1v1h-1zM3 7h1v1h-1zM5 7h1v1h-1zM7 7h1v1h-1zM10 7h1v1h-1zM1 8h1v1h-1zM9 8h1v1h-1zM2 9h1v1h-1zM8 9h1v1h-1zM3 10h1v1h-1zM7 10h1v1h-1zM4 11h3v1h-3z',
}

/**
 * Solid white face for the slider thumb — the filled shield silhouette drawn
 * *behind* {@link SLIDER_THUMB} so the handle is opaque (the rail passes behind
 * it, not through it). Same 11×12 grid, flood-filled to the outline's extent on
 * each row. Analogous to {@link RADIO_FACE} under the radio ring.
 */
export const SLIDER_THUMB_FACE: Glyph = {
  w: 11,
  h: 12,
  d: 'M1 0h9v1h-9zM0 1h11v1h-11zM0 2h11v1h-11zM0 3h11v1h-11zM0 4h11v1h-11zM0 5h11v1h-11zM0 6h11v1h-11zM0 7h11v1h-11zM1 8h9v1h-9zM2 9h7v1h-7zM3 10h5v1h-5zM4 11h3v1h-3z',
}

/**
 * Solid up-arrow fill for the pressed state — overlaid on {@link STEPPER} while
 * the up arrow is held. Synthesized from the rest sprite (the only reference we
 * have) by filling the hollow arrow solid, matching the kit's scroll-arrow
 * hollow→solid press convention.
 */
export const STEPPER_UP_FILL: Glyph = {
  w: 15,
  h: 25,
  d: 'M7 3h1v1h-1zM6 4h3v1h-3zM5 5h5v1h-5zM4 6h7v1h-7zM3 7h9v1h-9zM5 8h5v1h-5zM5 9h5v1h-5zM5 10h5v1h-5z',
}

/** Solid down-arrow fill for the pressed state (mirror of {@link STEPPER_UP_FILL}). */
export const STEPPER_DOWN_FILL: Glyph = {
  w: 15,
  h: 25,
  d: 'M5 14h5v1h-5zM5 15h5v1h-5zM5 16h5v1h-5zM3 17h9v1h-9zM4 18h7v1h-7zM5 19h5v1h-5zM6 20h3v1h-3zM7 21h1v1h-1z',
}

/**
 * Render a single-color glyph as a crisp, theme-colored inline SVG.
 *
 * Size and color come from CSS on the passed `className` (the SVG fills with
 * `currentColor`), so consumers theme it via `var(--vf-*)` like everything else.
 */
export function glyphSvg(g: Glyph, className: string): TemplateResult {
  return html`<svg
    class=${className}
    viewBox="0 0 ${g.w} ${g.h}"
    fill="currentColor"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <path d=${g.d}></path>
  </svg>`
}
