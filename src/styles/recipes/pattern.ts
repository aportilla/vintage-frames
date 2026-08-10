import { css, unsafeCSS } from 'lit'
import { tileImage, tileRects, tileSpan, vfTileMaskSize, vfTileSize, type TileRect } from './tile.js'

/**
 * The windoid bar's dither: a 2-system-px motif with a single black pixel at
 * its origin, stated once as rect data. Transparent ground, because the layer
 * floats over the bar and the same art doubles as the forced-colors mask,
 * where the ground would be opacity rather than paint. The SVG tile below is
 * the CSS-repeated form (the no-declared-width fallback and the forced-colors
 * mask); `vf-window` renders the exact fill — the whole-surface raster or a
 * consumer token's placed tile grid — from the same data (src/tile-grid.ts).
 */
export const DOT_MOTIF = 2
export const DOT_RECTS: readonly TileRect[] = [[0, 0, 1, 1, '#000000']]
const DOT_TILE = tileImage(DOT_MOTIF, DOT_MOTIF, tileRects(DOT_RECTS))

/** The dots' tile size in system px (30) — the consumer token's documented box. */
export const DOT_SPAN = tileSpan(DOT_MOTIF)

/**
 * Racing stripes for title bars. Apply the class to an absolutely-positioned
 * layer inset 3px (top/bottom) and 1px (left/right) within the title bar. At
 * the 18px bar height this yields exactly six 1px stripes spanning the close
 * box's top and bottom edges (title-bar interior 17px, band 11px tall); the
 * side inset leaves the stripes one system px clear of the frame border,
 * matching the widgets' 1px patch ring in the reference art.
 *
 * TWO renderings by engine, each the measured best (2026-08-09/10: all
 * three engines at eight densities, then a four-geometry Blink
 * registration sweep; the numbers live in scripts/verify-tile.mjs):
 *
 * - **Gecko and WebKit show the six placed solid rows** (`chromeTitleBar`
 *   renders the spans). Both engines device-snap solid boxes — the rows
 *   measured pixel-perfect at all eight densities in each — and each
 *   misrendered the gradient this layer once used: Gecko's GPU WebRender
 *   pipeline renders a gradient through a cached texture whose sampling
 *   softens a hard stop at default zoom (the originally reported bug), and
 *   WebKit landed the sixth stripe one device row thin at dpr 3 and the
 *   zoom-minted scales.
 *
 * - **Blink — and any engine failing both gate properties — shows the
 *   12-unit SVG**: the band's 11 rows plus one empty pad row, viewBox
 *   stretched onto a 12px-tall box, crispEdges. Blink pixel-snaps a
 *   painted BOX to whole CSS px, which killed every mechanism whose
 *   geometry rides an 11-system-px box — no legal CSS height exists at
 *   scale 3/2 (16.5px), so placed rows fuse, rasters and an 11-tall SVG
 *   drop or wobble a row, and a clip-path comb (origin-anchored, so the
 *   even-height trick can't reach it) AAs at every fractional density.
 *   Twelve divides by 2 and 3, so 12·scale is a whole CSS length at every
 *   scale an integer display derives (18px at 3/2, 16px at 4/3): the box
 *   never rounds. Measured: registered Δ0 with the close box, whole-rhythm
 *   and zero-gray at dpr 1/1.5/2/3 across all four sweep geometries, and
 *   never worse than the retired gradient at the unholdable scales
 *   (1.25/1.7/2.3/2.5), where its residual is a hard one-row-thin first
 *   stripe with no gray — the gradient produced the same thin stripe PLUS
 *   a smeared row, so it is strictly dominated and gone.
 *
 * The gate is two engine-exclusive properties: `-moz-appearance` parses
 * only in Gecko, `-webkit-backdrop-filter` only in WebKit (Blink's
 * backdrop-filter is unprefixed, never aliased).
 *
 * Forced colors: every paint is token-routed — the rows' background-color
 * and the rects' fill both resolve var(--vf-black), remapped to CanvasText
 * — and the layer keeps forced-color-adjust: none (inherited, so it covers
 * the SVG) so no forced palette repaints the active window's whole signal
 * out from under it.
 */
export const vfStripes = css`
  .vf-stripes {
    position: absolute;
    inset: calc(var(--vf-scale, 1) * 3px) calc(var(--vf-scale, 1) * 1px);
    pointer-events: none;
    @media (forced-colors: active) {
      forced-color-adjust: none;
    }
  }
  .vf-stripes svg {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: calc(var(--vf-scale, 1) * 12px);
  }
  .vf-stripes rect {
    fill: var(--vf-black, #000000);
  }
  .vf-stripes span {
    display: none;
  }
  /* Gecko (-moz-appearance) and WebKit (-webkit-backdrop-filter): each
     parses nowhere else — Blink's backdrop-filter is unprefixed. */
  @supports (-moz-appearance: none) or (-webkit-backdrop-filter: blur(1px)) {
    .vf-stripes svg {
      display: none;
    }
    .vf-stripes span {
      display: block;
      position: absolute;
      left: 0;
      right: 0;
      height: calc(var(--vf-scale, 1) * 1px);
      background: var(--vf-black, #000000);
    }
  }
`

/**
 * Dot-grid dither for the utility ("windoid") title bar — the slim bar's
 * counterpart to {@link vfStripes}. Apply the class to an absolutely-positioned
 * layer inset 2px top/bottom and FLUSH left/right: the close-up reference art
 * runs the dots all the way into the side borders (the Windows/ sheet hand-
 * insets them 2px, which the close-up shows is not the bar's own geometry).
 *
 * The layer's own CSS-repeated tile (a crisp 1-bit SVG on the 30-system-px
 * span, overridable via `--vf-dots-pattern`) is the fallback for a window
 * with no declared width. A `vf-window` that knows its width renders the
 * exact fill INTO the layer instead — the whole-surface raster, or a consumer
 * token's placed tile grid (src/tile-grid.ts) — and marks the layer
 * `vf-tile-grid`, which switches the repeat off: the dot art is transparent-
 * grounded, so a drifting CSS-repeated copy underneath would show through
 * between the exactly-placed dots.
 */
export const vfDots = css`
  .vf-dots {
    position: absolute;
    inset: calc(var(--vf-scale, 1) * 2px) 0;
    background-image: var(--vf-dots-pattern, ${unsafeCSS(DOT_TILE)});
    ${vfTileSize(DOT_MOTIF)}
    pointer-events: none;
    /* The consumer-token art channel for the placed tile grid. */
    --_vf-tile-image: var(--vf-dots-pattern, ${unsafeCSS(DOT_TILE)});
  }
  .vf-dots.vf-tile-grid {
    background-image: none;
  }
  /* Forced colors preserves url() tiles verbatim, so the dots would stay
     literal black — invisible on a dark high-contrast theme. Repainted as the
     ink token through the same tile as a mask (the vf-grid rules idiom), so
     the windoid bar's signature follows the user's palette. The exact-fill
     children hide here and the span mask takes over — no mask pipeline
     rasterizes exactly at a zoom-minted scale anyway (image-rendering does
     not reach masks), so forced-colors keeps the span approach and its zoom
     caveat, unchanged. */
  @media (forced-colors: active) {
    .vf-dots {
      background-image: none;
      background-color: var(--vf-black, #000);
      mask-image: var(--vf-dots-pattern, ${unsafeCSS(DOT_TILE)});
      ${vfTileMaskSize(DOT_MOTIF)}
    }
    .vf-dots .vf-tile,
    .vf-dots .vf-tile-raster {
      display: none;
    }
  }
`
