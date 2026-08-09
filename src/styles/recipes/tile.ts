import { css, type CSSResult } from 'lit'

/**
 * The lattice a repeating tile's span has to land on, in system px.
 *
 * `--vf-scale` is `target / trueDpr` in lowest terms — 1, 3/2, 4/3, 8/5, 6/5,
 * 5/4 — and a span of `N` system px is `N × scale` CSS px, which the engine can
 * hold only when its layout grid can express it (Chromium's `LayoutUnit` is
 * 1/64 CSS px, Gecko's app unit 1/60). For a scale `p/q` that needs `q` to
 * divide `64 × N`, and the 64 already absorbs every power of two — so what is
 * left is the ODD part of `q`, and every density the ladder derives has an odd
 * part of 1, 3 or 5:
 *
 *   dpr 1 → 1     dpr 1.25 → 8/5   dpr 1.5 → 4/3
 *   dpr 2 → 3/2   dpr 2.5  → 6/5   dpr 3   → 4/3   dpr 4 → 5/4
 *
 * 15 covers all of them at once, which is why a tile is measured in multiples
 * of it rather than per-display: the span is a constant of the art, not of the
 * screen, so the CSS stays a plain `calc()` with nothing to recompute when the
 * density changes.
 */
export const TILE_LATTICE = 15

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * The span a motif of `motif` system px tiles at: the smallest multiple of
 * {@link TILE_LATTICE} that is also a whole number of motifs, so the tile is
 * both seamless and holdable.
 *
 *   1 → 15    2 → 30    3 → 15    4 → 60    12 → 60
 */
export function tileSpan(motif: number): number {
  return (motif * TILE_LATTICE) / gcd(motif, TILE_LATTICE)
}

/**
 * A repeating fill's art, as a data URI: the `motif` markup laid into a tile of
 * {@link tileSpan} system px by an SVG `<pattern>`, so the image carries the
 * whole span while the source stays the two or three rects that are actually
 * the artwork.
 *
 * The subdivision inside the tile costs nothing: the span is a whole number of
 * device pixels (below), the SVG divides its box into that many whole units,
 * and `shape-rendering: crispEdges` keeps every rect on them.
 *
 * @param motifWidth  the motif's width in system px
 * @param motifHeight the motif's height in system px
 * @param motif       the motif's markup, URL-encoded as the rest of the kit's
 *                    inline SVG is (`%3Crect …/%3E`)
 */
export function tileImage(motifWidth: number, motifHeight: number, motif: string): string {
  const w = tileSpan(motifWidth)
  const h = tileSpan(motifHeight)
  return (
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' ` +
    `width='${w}' height='${h}' shape-rendering='crispEdges'%3E` +
    `%3Cdefs%3E%3Cpattern id='m' width='${motifWidth}' height='${motifHeight}' ` +
    `patternUnits='userSpaceOnUse'%3E${motif}%3C/pattern%3E%3C/defs%3E` +
    `%3Crect width='${w}' height='${h}' fill='url(%23m)'/%3E%3C/svg%3E")`
  )
}

/**
 * `background-size` for a REPEATING tile — stated as the motif, sized as the
 * span that motif tiles at ({@link tileSpan}).
 *
 * A tile is the one place where "one system pixel is a whole number of device
 * pixels" is not enough on its own. That contract holds (`src/zoom.ts`), but
 * the CSS *length* expressing it need not be one the engine can hold: at
 * `--vf-scale` 4/3 a 2-system-px tile is 2.6667 CSS px and Chromium stores
 * 2.65625. A single edge survives that — paint snaps each box to the device
 * grid independently, which is why every border, stepped corner and magnified
 * icon rasterizes exactly at 4/3 — but a tiled fill is ONE snapped box holding
 * N unsnapped repeats, each placed at `k × tileSize`. The error compounds until
 * the boundary has walked a whole device pixel, and 43% of the desktop dither
 * rasterizes to mid-gray.
 *
 * Enlarging the tile removes the accumulation instead of trading it away: the
 * span is holdable by construction, so every repeat lands exactly, and because
 * the span is a whole number of motifs the pattern is unchanged — one system
 * pixel of texture is still one system pixel, the same count of device pixels
 * as every other edge on the screen. What is left over at an unholdable scale
 * is a single seam per span rather than per motif, and the spans the kit uses
 * (30 and 60 system px) are holdable at every density the ladder derives, so
 * there is no seam at all.
 *
 * The cost is a bigger tile texture — 60 CSS px square at most, for art that
 * repeats forever — and nothing else. There is no rounding, no display-derived
 * custom property to keep in sync, and no `round()`, so it behaves the same in
 * every engine.
 *
 * @param motifWidth  the motif's width in system px
 * @param motifHeight the motif's height in system px (defaults to the width)
 */
export function vfTileSize(motifWidth: number, motifHeight = motifWidth): CSSResult {
  return css`
    background-size: calc(var(--vf-scale, 1) * ${tileSpan(motifWidth)}px)
      calc(var(--vf-scale, 1) * ${tileSpan(motifHeight)}px);
  `
}

/**
 * {@link vfTileSize} as `mask-size`, for the forced-colors branches that repaint
 * a `url()` tile in the ink token by masking with the same art (the windoid
 * dots, the barber stripes). Same span, so the mask lands on the fill.
 */
export function vfTileMaskSize(motifWidth: number, motifHeight = motifWidth): CSSResult {
  return css`
    mask-size: calc(var(--vf-scale, 1) * ${tileSpan(motifWidth)}px)
      calc(var(--vf-scale, 1) * ${tileSpan(motifHeight)}px);
  `
}

