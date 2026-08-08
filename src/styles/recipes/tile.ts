import { css, type CSSResult } from 'lit'

/**
 * `background-size` for a REPEATING tile, rounded to a size the device grid can
 * express — stated as the tile's *cell* and how many of them it holds, because
 * that is the unit that has to land whole.
 *
 * A tile is the one place where the scale contract is not enough on its own.
 * One system pixel is always a whole number of device pixels (`src/zoom.ts`),
 * but the *CSS length* expressing it need not be one the engine can hold:
 * Chromium lays out in 1/64 CSS px, and a 3× display's `--vf-scale` of 4/3
 * makes a 2-system-px tile 2.6667 CSS px, which it stores as 2.65625. A single
 * edge survives that — paint-time snapping rounds it back onto the device grid
 * — but a tiled fill places every repeat at `k × tileSize`, so the error
 * compounds: by the 32nd repeat the boundary has walked a whole device pixel,
 * and 36% of the desktop dither rasterizes to mid-gray.
 *
 * So the CELL rounds to `--vf-tile-quantum` — the smallest CSS length that is
 * both whole in device px and holdable by the layout grid (`tileQuantum()` in
 * src/scale.ts, written by `ScaleController`) — and the tile is that many cells
 * wide. Rounding the tile instead was tried and is not enough: on a 1.5×
 * display the smallest holdable tile is three device pixels, which a two-cell
 * dither cannot divide evenly, and the dot bar went from 19% mid-gray to 40%.
 *
 * The cost is pitch: on a 3× display the dither's cell paints at 1 CSS px
 * rather than 1.333, so the tile is 6 device pixels where the art asks for 8.
 * Every caller is a *texture* — the desktop dither, the windoid dots, the
 * swatch's transparency checker, the scroll rails' trough — and a texture can
 * afford a coarser pitch far more than it can afford being gray. Measured art
 * (a glyph, a border, a stepped corner) is never rounded this way, and does not
 * need to be. Where no holdable step is close enough to be worth it (1.25×,
 * whose finest is five device pixels), the quantum resolves to the scale
 * itself, `round()` becomes an exact no-op, and the tile keeps its true size.
 *
 * Two declarations, deliberately. The plain `calc()` first is the fallback for
 * an engine without `round()` (Chrome < 125, Firefox < 118): it is dropped as
 * invalid where `round()` parses, and is the current behavior where it does
 * not. The `1px` fallback inside `var()` covers a consumer-pinned
 * `--vf-scale`, where the controller stays dormant and writes no quantum —
 * correct at any whole `devicePixelRatio`.
 *
 * @param cell    the tile's cell, in system px (the dither's check, the dot's
 *                slot) — the length that must land on whole device pixels
 * @param across  cells per tile horizontally
 * @param down    cells per tile vertically (defaults to `across`)
 */
export function vfTileSize(cell: number, across: number, down = across): CSSResult {
  return css`
    background-size: calc(var(--vf-scale, 1) * ${cell * across}px)
      calc(var(--vf-scale, 1) * ${cell * down}px);
    background-size: calc(
        round(calc(var(--vf-scale, 1) * ${cell}px), var(--vf-tile-quantum, 1px)) * ${across}
      )
      calc(round(calc(var(--vf-scale, 1) * ${cell}px), var(--vf-tile-quantum, 1px)) * ${down});
  `
}
