/**
 * Pixel-exact stepped silhouettes for variable-size 1-bit chrome — the
 * `clip-path` analog of the fixed-size sprite glyphs in `glyphs.ts`.
 *
 * A System 7 rounded rectangle is not a curve: it is a staircase of whole
 * pixels. Native `border-radius` renders those corners as antialiased arcs,
 * which is exactly the gray smudge the kit forbids. Instead we author each
 * silhouette as a *corner trace* — the per-row left inset of the shape, in
 * system pixels, read straight off the reference sheet
 * (`Classic Macintosh UI Kit Reference/Buttons Exact 1x pixel Refrence.png`,
 * extracted by `scripts/extract-button-pixels.py`) — and compile it into a
 * stepped `polygon()` whose every vertex is a `calc(var(--vf-scale, 1) * Npx)`
 * multiple. Under display scaling each system pixel is a whole number of
 * device pixels, so every edge lands on the device grid and nothing
 * antialiases; the element's own `background` supplies the color, so the
 * result stays `var(--vf-*)`-themeable like everything else (SPEC §1).
 *
 * Corners are anchored to their own edges (left/right via `100% - …`), so one
 * polygon fits any width and height: the straight runs stretch, the traced
 * corners never distort — the CSS equivalent of a 9-slice.
 *
 * A frame is drawn as a *difference of silhouettes*, exactly like QuickDraw's
 * `FrameRoundRect`: paint the outer silhouette in the frame color, then paint
 * the face silhouette (inset one pixel, with its own traced corners) on top.
 * The 1px outline — including the 2px-wide diagonal step pixels at the
 * corners — is simply the region the face doesn't cover. The reference's
 * border pixels reproduce exactly; nothing is stroked.
 */

/** A stepped silhouette: per-row corner insets traced from the reference. */
export interface SteppedProfile {
  /**
   * Left inset (system px) of each corner row, topmost first. Mirrored to all
   * four corners; must be non-increasing (each row steps outward).
   */
  readonly corner: readonly number[]
  /** Inset of the straight edges once the corner rows are exhausted. */
  readonly edge: number
  /** Row (system px from the box top) where the silhouette begins. */
  readonly start: number
}

/**
 * The push button's outer silhouette. Reference rows (80×20 sample, pressed
 * state is solid ink so the trace is unambiguous): y0 inset 3, y1–y2 inset 1,
 * then straight. Identical on the short row-3 buttons, so it holds for any
 * control height.
 */
export const BUTTON_FRAME: SteppedProfile = { corner: [3, 1, 1], edge: 0, start: 0 }

/**
 * The button's face (the white fill inside the 1px frame). Starts one row
 * down: y1 from x3, y2 from x2, then 1px inside the straight edges. Painting
 * this over {@link BUTTON_FRAME} leaves the reference's exact border pixels —
 * row 0 full-width, `##`/`#` corner steps, 1px sides.
 */
export const BUTTON_FACE: SteppedProfile = { corner: [3, 2], edge: 1, start: 1 }

/**
 * Outer silhouette of the default-button ring. The reference ring box is the
 * button box outset by {@link RING_INSET} on every side (88×28 around 80×20):
 * y0 inset 5, y1 3, y2 2, y3–y4 1, then straight.
 */
export const RING_FRAME: SteppedProfile = { corner: [5, 3, 2, 1, 1], edge: 0, start: 0 }

/**
 * The transparent hole inside the ring. The band is 3px thick: the hole opens
 * at row 3 (inset 6, then 4, 4, then 3px inside the straight edges). Kept as
 * a hole — not painted over — so the 1px gap between ring and button shows
 * the surface behind, exactly like the sheet's alpha-0 gap pixels.
 */
export const RING_HOLE: SteppedProfile = { corner: [6, 4, 4], edge: 3, start: 3 }

/** How far the ring box outsets the button box on each side (system px). */
export const RING_INSET = 4

/** A coordinate `n` system px from the box's top or left edge. */
const px = (n: number): string =>
  n === 0 ? '0' : `calc(var(--vf-scale, 1) * ${n}px)`

/** The same coordinate measured back from the box's bottom or right edge. */
const pxFromEnd = (n: number): string =>
  n === 0 ? '100%' : `calc(100% - var(--vf-scale, 1) * ${n}px)`

/** Rows where the inset shrinks: the staircase's step boundaries. */
interface Step {
  /** Row boundary (system px from the top) where the inset changes. */
  readonly y: number
  /** Inset above the boundary. */
  readonly from: number
  /** Inset below it. */
  readonly to: number
}

const steps = (p: SteppedProfile): Step[] => {
  const out: Step[] = []
  let prev = p.corner[0] ?? p.edge
  for (let i = 1; i <= p.corner.length; i++) {
    const cur = p.corner[i] ?? p.edge
    if (cur !== prev) {
      out.push({ y: p.start + i, from: prev, to: cur })
      prev = cur
    }
  }
  return out
}

/**
 * The silhouette's vertices, clockwise from the top-left corner of its top
 * edge. Each staircase is emitted four times — mirrored horizontally,
 * vertically, or both — so the polygon closes around all four traced corners.
 */
const rectPoints = (p: SteppedProfile): string[] => {
  const top = p.corner[0] ?? p.edge
  const st = steps(p)
  const reversed = [...st].reverse()
  const pts: string[] = []
  // Top edge, left to right.
  pts.push(`${px(top)} ${px(p.start)}`, `${pxFromEnd(top)} ${px(p.start)}`)
  // Top-right staircase, stepping outward on the way down.
  for (const s of st)
    pts.push(`${pxFromEnd(s.from)} ${px(s.y)}`, `${pxFromEnd(s.to)} ${px(s.y)}`)
  // Bottom-right staircase, stepping back in.
  for (const s of reversed)
    pts.push(
      `${pxFromEnd(s.to)} ${pxFromEnd(s.y)}`,
      `${pxFromEnd(s.from)} ${pxFromEnd(s.y)}`
    )
  // Bottom edge, right to left.
  pts.push(
    `${pxFromEnd(top)} ${pxFromEnd(p.start)}`,
    `${px(top)} ${pxFromEnd(p.start)}`
  )
  // Bottom-left staircase, stepping outward on the way up.
  for (const s of st)
    pts.push(`${px(s.from)} ${pxFromEnd(s.y)}`, `${px(s.to)} ${pxFromEnd(s.y)}`)
  // Top-left staircase, stepping back in to close at the start.
  for (const s of reversed)
    pts.push(`${px(s.to)} ${px(s.y)}`, `${px(s.from)} ${px(s.y)}`)
  return pts
}

/** Compile a profile into a stepped `polygon()` clip-path value. */
export const steppedRectClip = (p: SteppedProfile): string =>
  `polygon(${rectPoints(p).join(', ')})`

/**
 * Compile an outer profile and a hole profile into a ring (a stepped donut).
 *
 * `polygon()` has no subpaths, so the hole uses the keyhole technique: walk
 * the outer loop clockwise from the top-center, bridge straight down to the
 * hole's top edge, walk the hole counter-clockwise, and bridge back up. The
 * two bridge edges are coincident verticals at x 50%, so with the `evenodd`
 * fill rule they cancel exactly — no visible seam — and the enclosed hole
 * (crossed twice) stays transparent, keeping the classic gap between the
 * default ring and the button see-through.
 */
export const steppedRingClip = (
  outer: SteppedProfile,
  hole: SteppedProfile
): string => {
  const o = rectPoints(outer)
  const h = rectPoints(hole)
  const bridgeTop = `50% ${px(outer.start)}`
  const bridgeBottom = `50% ${px(hole.start)}`
  // Outer loop rotated to begin after the top-center bridge point; hole loop
  // reversed so both half-edges of its top row are traversed exactly once.
  const outerLoop = [...o.slice(1), o[0]]
  const holeLoop = [h[0], ...h.slice(1).reverse()]
  return `polygon(evenodd, ${[
    bridgeTop,
    ...outerLoop,
    bridgeTop,
    bridgeBottom,
    ...holeLoop,
    bridgeBottom,
  ].join(', ')})`
}
