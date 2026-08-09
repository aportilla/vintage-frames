import { css, html, type CSSResult, type TemplateResult } from 'lit'
import { sysLength } from './scale.js'
import { tileRaster, type TileRect } from './styles/recipes/tile.js'

/**
 * The tiled-fill machinery that replaces CSS `background-repeat` on the kit's
 * convertible tiled surfaces (the desktop dither, the windoid dots, the swatch
 * checker, the barber stripes).
 *
 * A CSS repeating fill is ONE paint-snapped box holding N *unsnapped* repeats,
 * each placed at `k × tileSize` where the tile size is a single stored length
 * the engine quantizes to its layout grid (Chromium 1/64 CSS px, Gecko 1/60).
 * The error compounds linearly with `k` until a motif boundary has walked a
 * whole device pixel and the 1-bit art smears to gray. The span construction
 * (`tileSpan`, src/styles/recipes/tile.ts) makes the stored length exact for
 * every scale the *density* ladder derives — but zoom mints scales with
 * arbitrary prime denominators (20/17 at Safari's 85%, 30/23 at its 115%),
 * and no finite lattice can hold those. ZOOM-TILE-DRIFT.md is the analysis;
 * TILE-GRID-PLAN.md the plan this module implements.
 *
 * Two rendering paths, chosen by whether the surface's pattern token is
 * overridden ({@link patternOverride}):
 *
 * **Kit art (token unset): one whole-surface raster** — a single `.vf-tile-raster`
 * element carrying the motif tiled over the surface's declared system-px size
 * as a raster image at one image px per system px (`tileRaster`), stretched
 * `background-size: 100% 100%` under `image-rendering: pixelated`. Exact at
 * every scale, holdable or not, for two measured reasons: nearest-neighbor
 * sampling can only produce source colors, and ONE box has no interior
 * boundaries — Chromium paints an image background to the box's *unsnapped*
 * layout rect with antialiased edges, so any fill assembled from several
 * boxes blends a one-device-px line at every interior seam at a zoom-minted
 * scale, no matter how exactly the boxes were placed. (That measurement is
 * what buried both this plan's original per-tile form and SVG art of any
 * kind: Chromium rasterizes SVG images at the fractional layout size and
 * ignores `image-rendering` for them.) The box's own edge is the one place a
 * partial device pixel remains — the same status every component box already
 * has. The sampling stays exact because the box's stored length errs at most
 * 1/128 CSS px over the WHOLE surface: the relative error shrinks as the
 * surface grows, so the nearest-neighbor grid cannot slip a pixel at any
 * realistic size.
 *
 * **Consumer art (token set): the placed tile grid** — a flat set of
 * absolutely positioned `.vf-tile` boxes, each `T × T` system px at
 * `left: calc(var(--vf-scale, 1) * kT px)`: one single-multiplication length
 * per tile, quantized once, so each box paint-snaps onto the device grid
 * independently and the documented tile geometry (`--vf-*-pattern` art on a
 * 30- or 60-system-px tile) renders verbatim. Positions never accumulate
 * error; at a zoom-minted scale what remains is the bounded per-seam blend
 * above — a hairline per tile boundary, never surface-wide smear. Raster
 * consumer art additionally magnifies nearest-neighbor (the `vf-img` idiom).
 *
 * The trap that must not come back: NEVER lay tiles out with CSS grid,
 * flexbox, inline-block flow, or nested row containers. Track and flow
 * layouts accumulate quantized box sizes — the position of column `k` becomes
 * a *sum* of `k` quantized lengths, error `k/64` CSS px, and the disease
 * returns. Flat absolute placement with one multiplication per tile is the
 * correctness, not a style choice.
 *
 * Wiring: the *container* — the layer the fill used to paint on, or a
 * dedicated child filling it — takes the `vf-tile-grid` class (clip and
 * pointer transparency; it must be positioned, which every kit layer already
 * is). For the grid path it resolves `--_vf-tile-image` — the pattern-token
 * `var()` each tile stretches over its box, stated once so no data URI is
 * repeated per tile — and {@link tileGrid} renders the tiles. For the raster
 * path the component renders a `.vf-tile-raster` child whose
 * `background-image` it writes from `tileRaster(...)`, regenerated only when
 * the declared system-px size changes (density and zoom re-render nothing:
 * the box lengths are live against `--vf-scale`).
 *
 * Forced colors keeps each surface's existing layer-level branches (flat
 * Canvas desktop, span-masked dots and barber, the swatch's
 * forced-color-adjust) — no mask pipeline rasterizes exactly at a zoom-minted
 * scale (image-rendering does not reach masks), so forced-colors-plus-zoom
 * remains the one accepted residual, unchanged from before this work.
 */
export const vfTileGrid: CSSResult = css`
  .vf-tile-grid {
    /* Clip the overdraw: a fill overdrawn past a box that is not a whole
       number of tiles (or a raster ceiled up to one) crops here. */
    overflow: hidden;
    pointer-events: none;
  }
  .vf-tile,
  .vf-tile-raster {
    position: absolute;
    /* The box IS the size — never the image's intrinsic size, and never an
       intra-box repeat: a consumer tile smaller than its box repeating
       inside it would re-import the accumulation this module removes. */
    background-size: 100% 100%;
    background-repeat: no-repeat;
    /* Raster art samples nearest-neighbor — the exactness mechanism for the
       kit's own tiles and the vf-img idiom for consumer raster art. A no-op
       for SVG (which is why kit art is raster; see tileRaster). */
    image-rendering: pixelated;
  }
  .vf-tile {
    background-image: var(--_vf-tile-image);
  }
  .vf-tile-raster {
    top: 0;
    left: 0;
  }
`

/**
 * The flat set of tiles covering `cols × rows` boxes of `tile` system px each,
 * to render inside a `vf-tile-grid` container — the consumer-pattern path.
 * Each tile carries its own single-multiplication `calc()` position and size,
 * live against `--vf-scale` — so a density or zoom change re-renders nothing,
 * and the count changes only when the caller's *declared system-px size*
 * does. Compute `cols`/`rows` from that declared size with `Math.ceil`; the
 * clipped last row and column are absorbed by the container's clip.
 */
export function tileGrid({
  cols,
  rows,
  tile,
}: {
  cols: number
  rows: number
  tile: number
}): TemplateResult[] {
  const size = sysLength(tile)
  const tiles: TemplateResult[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Spans, not divs: a tile grid can land inside phrasing content
      // (vf-swatch's button), and position: absolute blockifies them anyway.
      tiles.push(
        html`<span
          class="vf-tile"
          style="left:${sysLength(col * tile)};top:${sysLength(row * tile)};width:${size};height:${size}"
        ></span>`
      )
    }
  }
  return tiles
}

/**
 * The consumer's override of a pattern token, or `''` when the token is unset
 * and the surface should paint its own art — how a converted surface picks
 * between its whole-surface raster (kit art) and its placed tile grid
 * (consumer art at the documented tile geometry).
 *
 * Read with `getComputedStyle` at update time, not observed live: a pattern
 * token swapped at runtime without touching the component wants a nudge (any
 * property write, or `requestUpdate()`) — the same re-check-on-update
 * contract the component's other measured inputs follow.
 */
export function patternOverride(el: Element, token: string): string {
  if (typeof getComputedStyle === 'undefined') return ''
  return getComputedStyle(el).getPropertyValue(token).trim()
}

/**
 * A one-entry cache for a surface's whole-surface raster, keyed by its
 * system-px size — so every render with an unchanged size (all of them except
 * a declared-size change) reuses the encoded image instead of re-running
 * `tileRaster`'s canvas encode.
 */
export class TileRasterCache {
  #key = ''
  #uri = ''

  for(
    motifWidth: number,
    motifHeight: number,
    rects: readonly TileRect[],
    width: number,
    height: number
  ): string {
    const key = `${width}x${height}`
    if (this.#key !== key) {
      this.#key = key
      this.#uri = tileRaster(motifWidth, motifHeight, rects, width, height)
    }
    return this.#uri
  }
}
