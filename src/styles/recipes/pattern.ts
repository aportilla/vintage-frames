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
 * TWO renderings by engine, each the measured best (2026-08-09, all three
 * engines, eight densities; the numbers live in scripts/verify-tile.mjs):
 *
 * - **Blink and WebKit keep the repeating-linear-gradient.** Blink
 *   pixel-snaps a painted BOX to whole CSS px — not device px — so inside
 *   the bar's floored frame border (origin on a half CSS px at scale 3/2)
 *   every box-shaped mechanism fails where the gradient cannot: placed
 *   solid rows paint 2-or-4 device rows for a 1.5-CSS-px stripe and fuse at
 *   dpr 3, a whole-surface raster resamples into the rounded box and drops
 *   one device row (one stripe a device px thin at dpr 2 and 3), and inline
 *   SVG rects wobble a stripe's position under the stretched viewBox. A
 *   gradient's stops are the one paint that lands at DEVICE precision
 *   inside the CSS-rounded box: six whole stripes on the exact 2-system-px
 *   rhythm at every integer density. What remains is the shipped residual —
 *   a soft edge at the fractional densities (1.25×/1.5×/2.5×) and
 *   zoom-minted scales.
 *
 * - **Gecko gets the six stripes as placed solid rows** (`chromeTitleBar`
 *   renders the spans; they are display:none elsewhere). Gecko device-snaps
 *   solid boxes — headless parity with its gradient at every density — but
 *   its GPU WebRender pipeline renders a gradient through a cached texture,
 *   and sampling it softens one hard stop at default zoom (the reported
 *   bug this split fixes). A solid-color quad never passes through that
 *   pipeline, so the class of artifact cannot occur.
 *
 * Forced colors: both paints are already in the remapped ink token. The
 * gradient needs its forced-color-adjust exemption (forced colors deletes
 * gradient backgrounds, and the stripes are the active window's whole
 * signal); the Gecko rows need nothing — background-color in a system color
 * (CanvasText via --vf-black) is honored as-is.
 */
export const vfStripes = css`
  .vf-stripes {
    position: absolute;
    inset: calc(var(--vf-scale, 1) * 3px) calc(var(--vf-scale, 1) * 1px);
    background: repeating-linear-gradient(
      to bottom,
      var(--vf-black, #000) 0 calc(var(--vf-scale, 1) * 1px),
      transparent calc(var(--vf-scale, 1) * 1px) calc(var(--vf-scale, 1) * 2px)
    );
    pointer-events: none;
    @media (forced-colors: active) {
      forced-color-adjust: none;
    }
  }
  .vf-stripes span {
    display: none;
  }
  /* Gecko only: -moz-appearance parses nowhere else. */
  @supports (-moz-appearance: none) {
    .vf-stripes {
      background: none;
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
