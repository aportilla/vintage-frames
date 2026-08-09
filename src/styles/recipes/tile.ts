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
 * @param spanWidth   explicit tile width in system px (default
 *                    `tileSpan(motifWidth)`) — a placed tile grid
 *                    (src/tile-grid.ts) may size its tile independently of the
 *                    lattice, since each placed box paint-snaps on its own
 * @param spanHeight  explicit tile height in system px, likewise
 */
export function tileImage(
  motifWidth: number,
  motifHeight: number,
  motif: string,
  spanWidth = tileSpan(motifWidth),
  spanHeight = tileSpan(motifHeight)
): string {
  const w = spanWidth
  const h = spanHeight
  return (
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' ` +
    `width='${w}' height='${h}' shape-rendering='crispEdges'%3E` +
    `%3Cdefs%3E%3Cpattern id='m' width='${motifWidth}' height='${motifHeight}' ` +
    `patternUnits='userSpaceOnUse'%3E${motif}%3C/pattern%3E%3C/defs%3E` +
    `%3Crect width='${w}' height='${h}' fill='url(%23m)'/%3E%3C/svg%3E")`
  )
}

/**
 * One rect of a 1-bit motif, stated as data: `[x, y, w, h, fill]` in system px
 * over the motif cell, painted in order. `fill` is a CSS hex color; omitted
 * means black, the SVG default. The motif stated once as data is what lets a
 * surface derive BOTH of its artifacts — the SVG tile ({@link tileImage} via
 * {@link tileRects}) and the raster tile ({@link tileRaster}) — from the same
 * two or three rects that are actually the artwork.
 */
export type TileRect = readonly [x: number, y: number, w: number, h: number, fill?: string]

/** {@link TileRect} data as the URL-encoded rect markup {@link tileImage} takes. */
export function tileRects(rects: readonly TileRect[]): string {
  return rects
    .map(([x, y, w, h, fill]) => {
      const pos = (x ? `x='${x}' ` : '') + (y ? `y='${y}' ` : '')
      const paint = fill ? ` fill='${encodeURIComponent(fill)}'` : ''
      return `%3Crect ${pos}width='${w}' height='${h}'${paint}/%3E`
    })
    .join('')
}

/**
 * The motif tiled over `spanWidth × spanHeight` system px as a RASTER image —
 * a PNG data URI at one image px per system px — for the whole-surface fill a
 * converted tiled surface paints (src/tile-grid.ts).
 *
 * A raster because of how engines rasterize a fill's art, not how they place
 * its box. Chromium rasterizes an SVG image at the box's *stored* (layout)
 * size — fractional at every scale the layout grid can't hold — and ignores
 * `image-rendering` for SVG entirely, so the 1-bit rects antialias to gray no
 * matter how exactly the box paint-snapped (measured; inline `crispEdges`
 * patterns smear the same way). A raster source under
 * `image-rendering: pixelated` is sampled nearest-neighbor, which can only
 * ever produce source colors: the art is 1-bit by construction at every
 * scale, holdable or not.
 *
 * Encoded through an offscreen canvas (a PNG encoder, not a render surface:
 * the motif is drawn once into a cell, pattern-filled across the span, read
 * out as a data URI and released — kit art only, so there is nothing
 * cross-origin to taint). Where canvas is unavailable the SVG tile is
 * returned instead, so the declaration still paints.
 */
export function tileRaster(
  motifWidth: number,
  motifHeight: number,
  rects: readonly TileRect[],
  spanWidth = tileSpan(motifWidth),
  spanHeight = tileSpan(motifHeight)
): string {
  const svg = () => tileImage(motifWidth, motifHeight, tileRects(rects), spanWidth, spanHeight)
  if (typeof document === 'undefined') return svg()
  const cell = document.createElement('canvas')
  cell.width = motifWidth
  cell.height = motifHeight
  const cellCtx = cell.getContext('2d')
  if (!cellCtx) return svg()
  for (const [x, y, w, h, fill] of rects) {
    cellCtx.fillStyle = fill ?? '#000000'
    cellCtx.fillRect(x, y, w, h)
  }
  const canvas = document.createElement('canvas')
  canvas.width = spanWidth
  canvas.height = spanHeight
  const ctx = canvas.getContext('2d')
  const pattern = ctx?.createPattern(cell, 'repeat')
  if (!ctx || !pattern) return svg()
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, spanWidth, spanHeight)
  return `url("${canvas.toDataURL('image/png')}")`
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

