import {
  css,
  html,
  type CSSResult,
  type ReactiveController,
  type ReactiveControllerHost,
  type TemplateResult,
} from 'lit'
import { effectiveScale, onScaleChange, sysLength } from './scale.js'
import { truePixelRatio } from './zoom.js'
import { tileRaster, type TileRect } from './styles/recipes/tile.js'

/**
 * The tiled-fill machinery behind the kit's patterned surfaces — the desktop
 * and container patterns, the windoid dots, the swatch checker, the barber
 * stripes and the scroll trough.
 *
 * **Kit art is a CSS repeat of one pre-scaled tile** ({@link repeatTile}):
 * the motif laid over {@link REPEAT_TILE} system px square and drawn at n
 * image px per system px, n = `--vf-scale × trueDpr` — whole by the scale
 * contract — so the engine copies the tile to the device grid 1:1 and has no
 * filtering to choose. The surface states the tile's size as
 * {@link vfRepeatTileSize}, a length every engine holds exactly at every
 * density and zoom, so each repeat lands exactly. The tile depends only on
 * the art and n: it is encoded once per pair for the whole page, drawn again
 * when zoom or the display changes n, and never on a resize.
 * {@link RepeatTileController} keeps a box's tile current.
 *
 * Why 120, and why pre-scaled (docs/TILE-REPEAT-PLAN.md has the
 * measurements): Safari smooths a repeated image it has to magnify, whatever
 * `image-rendering` says, so the image must already be at device
 * resolution; and WebKit on a 3× display now and then draws one small tile a
 * device px narrow and resamples it, which tiles of 192 device px and up
 * never showed. The repeat replaced one raster the size of the whole surface,
 * re-encoded as it was resized.
 *
 * **Consumer art (a pattern token set): the placed tile grid** — a flat set
 * of absolutely positioned `.vf-tile` boxes, each `T × T` system px at
 * `left: calc(var(--vf-scale, 1) * kT px)`: one single-multiplication length
 * per tile, quantized once, so each box paint-snaps onto the device grid
 * independently and the documented tile geometry (`--vf-*-pattern` art on a
 * 30- or 60-system-px tile) renders verbatim. A token is any CSS image —
 * SVG included — so it cannot be pre-scaled the way kit art is. Positions
 * never accumulate error; at a scale the layout grid cannot hold, what
 * remains is a hairline per tile boundary, never surface-wide smear. Raster
 * consumer art additionally magnifies nearest-neighbor (the `vf-img` idiom).
 *
 * The trap that must not come back: NEVER lay tiles out with CSS grid,
 * flexbox, inline-block flow, or nested row containers. Track and flow
 * layouts accumulate quantized box sizes — the position of column `k` becomes
 * a *sum* of `k` quantized lengths, error `k/64` CSS px, and the disease
 * returns. Flat absolute placement with one multiplication per tile is the
 * correctness, not a style choice.
 *
 * Wiring the grid: the *container* — the layer the fill paints on, or a
 * dedicated child filling it — takes the `vf-tile-grid` class (clip and
 * pointer transparency; it must be positioned, which every kit layer already
 * is). It resolves `--_vf-tile-image` — the pattern-token `var()` each tile
 * stretches over its box, stated once so no data URI is repeated per tile —
 * and {@link tileGrid} renders the tiles.
 *
 * Forced colors keeps each surface's existing branches (flat Canvas desktop,
 * span-masked dots, barber and trough, the swatch's forced-color-adjust) — no
 * mask pipeline rasterizes exactly at a zoom-minted scale (image-rendering
 * does not reach masks), so forced-colors-plus-zoom remains the one accepted
 * residual.
 */
export const vfTileGrid: CSSResult = css`
  .vf-tile-grid {
    /* Clip the overdraw: a fill overdrawn past a box that is not a whole
       number of tiles crops here. */
    overflow: hidden;
    pointer-events: none;
  }
  .vf-tile {
    position: absolute;
    /* The box IS the size — never the image's intrinsic size, and never an
       intra-box repeat: a consumer tile smaller than its box repeating
       inside it would re-import the accumulation this module removes. */
    background-image: var(--_vf-tile-image);
    background-size: 100% 100%;
    background-repeat: no-repeat;
    /* Consumer raster art samples nearest-neighbor — the vf-img idiom. A
       no-op for SVG. */
    image-rendering: pixelated;
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
 * and the surface should paint its own art — how a surface picks between its
 * repeating kit tile and its placed tile grid (consumer art at the
 * documented tile geometry).
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

/** A motif as rect data over the cell it tiles at, in system px. */
export interface TileMotif {
  readonly width: number
  readonly height: number
  readonly rects: readonly TileRect[]
}

/**
 * The side of a kit repeat tile in system px: a whole number of every motif
 * the kit draws (8 × 15 — the 2-, 4-, 8- and 12-px cells all divide it), and
 * a whole number of layout px in every engine at every density and zoom
 * (120n device px over the engine's ratio: 40n at 3×, 60n at 2×).
 */
export const REPEAT_TILE = 120

/**
 * `background-size` for a {@link repeatTile}: {@link REPEAT_TILE} system px
 * square, live against `--vf-scale`.
 */
export const vfRepeatTileSize: CSSResult = css`
  background-size: calc(var(--vf-scale, 1) * ${REPEAT_TILE}px)
    calc(var(--vf-scale, 1) * ${REPEAT_TILE}px);
`

/** Encoded tiles, one per motif and density, shared by the whole page. */
const repeatTiles = new Map<string, string>()

/**
 * The motif laid over {@link REPEAT_TILE} system px square and drawn at `n`
 * image px per system px, as a CSS `url()` — the image a
 * {@link vfRepeatTileSize} repeat copies 1:1 at that density. Cached for the
 * page by the motif's content and `n`.
 */
export function repeatTile(motif: TileMotif, n: number): string {
  const key = `${motif.width}×${motif.height}|${n}|${motif.rects.join(';')}`
  let image = repeatTiles.get(key)
  if (!image) {
    image = tileRaster(
      motif.width,
      motif.height,
      motif.rects,
      REPEAT_TILE,
      REPEAT_TILE,
      n
    )
    repeatTiles.set(key, image)
  }
  return image
}

/**
 * Device px per system px at `el`: its `--vf-scale` (a consumer override
 * included) times the true device pixel ratio — the `n` a {@link repeatTile}
 * shown there is drawn at.
 */
export function devicePxAt(el: Element): number {
  return Math.max(1, Math.round(effectiveScale(el) * truePixelRatio()))
}

/** What a component hands {@link RepeatTileController}. */
export interface RepeatTileOptions {
  /** The element the tile's custom property is written on. */
  getBox: () => HTMLElement | null | undefined
  /** The art to tile, or null to write nothing (a consumer token owns the
   *  surface, or the component isn't showing it). Return the same object for
   *  the same art: an unchanged motif and density cost nothing. */
  getArt: () => TileMotif | null | undefined
  /** The custom property the surface's `background-image` reads. */
  property: string
}

/**
 * Keeps a box's {@link repeatTile} current: writes it as a custom property on
 * the box's inline style after each host update, drawn for the density at
 * the box, and again when zoom or the display changes that density
 * ({@link onScaleChange}); removes it the moment there is nothing to paint.
 * A custom-property channel rather than `background-image` itself, so a
 * surface's forced-colors rule can out-cascade it without `!important`.
 *
 * The surface's stylesheet does the rest: `background-image` from the
 * property, {@link vfRepeatTileSize}, `background-repeat: repeat`, and
 * `image-rendering: pixelated` for the frame between a zoom and the new
 * tile.
 */
export class RepeatTileController implements ReactiveController {
  readonly #opts: RepeatTileOptions
  #stopScale?: () => void

  /** What was last written where, so an unchanged update costs nothing and
   *  an unrelated render never re-asserts anything. */
  #box: HTMLElement | null = null
  #art: TileMotif | null = null
  #n = 0
  #image = ''

  constructor(host: ReactiveControllerHost, opts: RepeatTileOptions) {
    this.#opts = opts
    host.addController(this)
  }

  hostConnected(): void {
    // Reader tier: the kit's own --vf-scale writers have run by the time
    // this reads the new scale back.
    this.#stopScale = onScaleChange(() => this.#apply())
  }

  hostDisconnected(): void {
    this.#stopScale?.()
    this.#stopScale = undefined
  }

  hostUpdated(): void {
    this.#apply()
  }

  #apply(): void {
    const box = this.#opts.getBox() ?? null
    if (box !== this.#box) {
      // A different box (a re-rendered template) — never leave the old one
      // painted.
      this.#clear()
      this.#box = box
    }
    const art = this.#opts.getArt() ?? null
    if (!box || !art) {
      this.#clear()
      return
    }
    const n = devicePxAt(box)
    if (art === this.#art && n === this.#n && this.#image) return
    this.#art = art
    this.#n = n
    const image = repeatTile(art, n)
    if (image === this.#image) return
    this.#image = image
    box.style.setProperty(this.#opts.property, image)
  }

  #clear(): void {
    this.#art = null
    this.#n = 0
    if (!this.#image) return
    this.#image = ''
    this.#box?.style.removeProperty(this.#opts.property)
  }
}
