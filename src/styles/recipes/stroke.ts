import { unsafeCSS, type CSSResult } from 'lit'
import type { RuleEdge } from './rule.js'

/** The four edges in shorthand order. */
const EDGES: readonly RuleEdge[] = ['top', 'right', 'bottom', 'left']

/**
 * How much of each stroke sits in padding: 1, or 0 under forced colors, where
 * every stroke is a border again. The helper sets it on each stroked element,
 * and custom properties inherit, so a child placed against a stroked box reads
 * the same switch.
 */
const PAD = 'var(--_vf-stroke-pad, 1)'

/** The stroke's color, declared per element by the helper. */
const INK = 'var(--_vf-stroke-ink)'

/** One to four values in shorthand order, as top/right/bottom/left. */
type Sides<T> = T | readonly T[]

function sides<T>(value: Sides<T>): [T, T, T, T] {
  const list: readonly T[] = Array.isArray(value) ? value : [value as T]
  const top = list[0]!
  const right = list[1] ?? top
  const bottom = list[2] ?? top
  return [top, right, bottom, list[3] ?? right]
}

/** A system-px length inside `calc()`: a number is px, a string is a length. */
const sysPx = (value: number | string): string =>
  typeof value === 'number' ? `${value}px` : value

/** `width` system px of stroke, as the CSS length it paints at. */
const strokeLength = (width: number): string =>
  `calc(var(--vf-scale, 1) * ${width}px * ${PAD})`

/** The padding under a stroked edge: the element's own plus the stroke's. */
export function strokePadding(own: number | string, width: number): string {
  return own === 0
    ? strokeLength(width)
    : `calc(var(--vf-scale, 1) * (${sysPx(own)} + ${width}px * ${PAD}))`
}

/** The border a stroked edge becomes under forced colors; 0 wide otherwise. */
export function strokeBorder(width: number): string {
  return `calc(var(--vf-scale, 1) * ${width}px * (1 - ${PAD})) solid ${INK}`
}

/** The inset shadow that paints one edge's stroke. */
export function strokeEdgeShadow(edge: RuleEdge, width: number): string {
  const along = (sign: number): string =>
    `calc(var(--vf-scale, 1) * ${sign * width}px * ${PAD})`
  switch (edge) {
    case 'top':
      return `inset 0 ${along(1)} 0 0 ${INK}`
    case 'right':
      return `inset ${along(-1)} 0 0 0 ${INK}`
    case 'bottom':
      return `inset 0 ${along(-1)} 0 0 ${INK}`
    case 'left':
      return `inset ${along(1)} 0 0 0 ${INK}`
  }
}

/** The forced-colors switch every stroked element carries. */
export const STROKE_FORCED_COLORS = `@media (forced-colors: active) {
    --_vf-stroke-pad: 0;
  }`

/**
 * The inset shadow of a stroke `width` system px wide on all four edges — the
 * value to restate when only the painted width changes, as vf-checkbox's
 * press does. Reads the ink and forced-colors switch the element's
 * {@link vfStrokeDecls} declares.
 */
export function vfStrokeShadow(width = 1): CSSResult {
  return unsafeCSS(`inset 0 0 0 ${strokeLength(width)} ${INK}`)
}

/** The options of {@link vfStrokeDecls}. */
export interface VfStrokeOptions {
  /** The stroked edges. Default all four. */
  edges?: readonly RuleEdge[]
  /**
   * The stroke's width in whole system px, one to four values in shorthand
   * order. Default 1.
   */
  width?: Sides<number>
  /**
   * The element's own padding, in system px, one to four values in shorthand
   * order; each stroked edge adds its stroke. A value is a number or a
   * system-px CSS length (`'var(--vf-select-gutter, 16px)'`). Omitted, the
   * declarations set padding on the stroked edges alone, to the stroke.
   */
  padding?: Sides<number | string>
  /**
   * More shadows, painted with the stroke: the hard drop shadow
   * ({@link vfHardShadow}), a white ring. The stroke comes first in the list.
   */
  shadows?: string | CSSResult
  /** The stroke's color. Default `var(--vf-black, #000)`. */
  ink?: string
}

/**
 * A 1-bit stroke that isn't a line width. The declarations for a box whose
 * edges carry a black line of whole system px — every frame, well, rule and
 * box in the kit — for interpolating into the box's rule:
 * `.card { ${vfStrokeDecls({ padding: [4, 8] })} }`.
 *
 * Safari rounds a border width to device px before it applies page zoom, so a
 * `border` of `calc(var(--vf-scale, 1) * 1px)` draws thinner than the art
 * around it at most zoom levels, and moves everything inside the box off the
 * device grid. Padding and box-shadow lengths are not rounded that way. So the
 * stroke's space is padding on each stroked edge, added to the element's own,
 * and the black is an inset `box-shadow`, with `shadows` after it in the same
 * list. Both land on whole device px at every zoom.
 *
 * What changes from a border:
 * - The declarations own `padding` on the stroked edges (on all four, when
 *   `padding` is passed) and `box-shadow`. Pass the element's own padding and
 *   shadows here; a later `padding` or `box-shadow` on the element replaces
 *   the stroke's.
 * - A child placed against the box measures from its outer edge. Offset it by
 *   the stroke with {@link vfStrokeInset}.
 * - An `overflow: hidden` box clips at its outer edge, so its content can
 *   paint over the stroke. Clip on an inner element instead.
 * - Forced colors paints no `box-shadow`, so there each stroke is a border
 *   again and the padding is the element's own: the same box a border draws.
 *
 * The color goes through a private property the declarations set, so pass a
 * `var()` as `ink` to change it from a state rule without restating the
 * shadow list.
 */
export function vfStrokeDecls(options: VfStrokeOptions = {}): CSSResult {
  const edges = new Set(options.edges ?? EDGES)
  const widths = sides(options.width ?? 1)
  const padding = sides(options.padding ?? 0)
  const stroked = EDGES.map((edge, i) => (edges.has(edge) ? widths[i]! : 0))
  const uniform = stroked.every((width) => width > 0 && width === stroked[0])

  const decls = [`--_vf-stroke-ink: ${options.ink ?? 'var(--vf-black, #000)'};`]
  const shadows: string[] = []
  EDGES.forEach((edge, i) => {
    const width = stroked[i]!
    if (!width) {
      if (options.padding !== undefined) {
        decls.push(`padding-${edge}: calc(var(--vf-scale, 1) * ${sysPx(padding[i]!)});`)
      }
      return
    }
    decls.push(`padding-${edge}: ${strokePadding(padding[i]!, width)};`)
    decls.push(`border-${edge}: ${strokeBorder(width)};`)
    if (!uniform) shadows.push(strokeEdgeShadow(edge, width))
  })
  if (uniform) shadows.push(String(vfStrokeShadow(stroked[0])))
  if (options.shadows) shadows.push(String(options.shadows))
  decls.push(`box-shadow: ${shadows.length ? shadows.join(', ') : 'none'};`)
  decls.push(STROKE_FORCED_COLORS)
  return unsafeCSS(decls.join('\n  '))
}

/**
 * A length `base` system px in from a stroke's inner edge, measured from the
 * box's outer edge, on an edge carrying `stroke` system px of it (see
 * {@link vfStrokeDecls}): the inset for a child placed against a stroked box
 * (`right: ${vfStrokeInset(0)}` is flush inside a 1px frame), or a padding
 * that restates the stroke's (`padding: ${vfStrokeInset(0)} ${vfStrokeInset(6)}`).
 * `base` is a number or a system-px CSS length. Under forced colors, where
 * the stroke is a border, it is `base`.
 */
export function vfStrokeInset(base: number | string, stroke = 1): CSSResult {
  return unsafeCSS(strokePadding(base, stroke))
}
