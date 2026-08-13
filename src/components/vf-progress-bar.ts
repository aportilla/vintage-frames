import { css, html, LitElement, unsafeCSS } from 'lit'
import type { PropertyValues } from 'lit'
import { property, query } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { vfBase } from '../styles/base.js'
import {
  tileImage,
  tileRects,
  tileSpan,
  vfTileMaskSize,
  type TileRect,
} from '../styles/recipes/tile.js'
import {
  TileRasterCache,
  patternOverride,
  tileGrid,
  vfTileGrid,
} from '../tile-grid.js'
import { ScaleController, sys, sysLength, toSys } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { TrackWidthController } from '../track-width.js'

/**
 * The barber motif: a 12-system-px cell whose two black \ bands are a
 * staircase of axis-aligned 1px rects (genuine pixel art), stated once as
 * rect data over a transparent ground. The SVG tile derived from it is the
 * forced-colors mask; the strip the bar animates carries the same data as a
 * whole-surface raster or a consumer token's placed tile grid
 * (src/tile-grid.ts). Above the class, since `@vfElement` upgrades at module
 * evaluation.
 */
const BARBER_MOTIF = 12
const BARBER_RECTS: readonly TileRect[] = [
  [0, 0, 6, 1],
  [1, 1, 6, 1],
  [2, 2, 6, 1],
  [3, 3, 6, 1],
  [4, 4, 6, 1],
  [5, 5, 6, 1],
  [6, 6, 6, 1],
  [0, 7, 1, 1],
  [7, 7, 5, 1],
  [0, 8, 2, 1],
  [8, 8, 4, 1],
  [0, 9, 3, 1],
  [9, 9, 3, 1],
  [0, 10, 4, 1],
  [10, 10, 2, 1],
  [0, 11, 5, 1],
  [11, 11, 1, 1],
]
const BARBER_TILE = tileImage(BARBER_MOTIF, BARBER_MOTIF, tileRects(BARBER_RECTS))
const BARBER_SPAN = tileSpan(BARBER_MOTIF)

/** The fill's interior height in system px: the 14px track minus its borders. */
const FILL_HEIGHT = 12

/**
 * `<vf-progress-bar>` — the System 7 progress indicator.
 *
 * A 14px white track (`--vf-progress-track`) with a 1px black border.
 * Determinate mode fills from the left in solid black
 * (`--vf-progress-fill`) with a 1px black leading edge. Indeterminate
 * mode shows chunky, stepped diagonal black/white barber stripes (the classic
 * "busy" bar) animated with `steps()` timing so movement is deliberately
 * steppy, not smooth.
 *
 * Exposes `role="progressbar"` with `aria-valuemin/max` and, when
 * determinate, `aria-valuenow`.
 *
 * @csspart track - The outer bordered track.
 * @csspart fill - The determinate fill or the indeterminate stripe layer.
 * @cssprop [--vf-progress-fill=#000000] - determinate progress fill (solid
 *   black)
 * @cssprop --vf-progress-stripes - the indeterminate barber stripes — a 12×12
 *   motif drawn as rects so the staircase stays whole system px at any scale,
 *   on a 60-system-px tile (override the whole tile — consumer art renders as
 *   a placed tile grid at that same geometry)
 * @cssprop [--vf-progress-track=#ffffff] - progress track (white)
 */
@vfElement('vf-progress-bar')
export class VfProgressBar extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    vfTileGrid,
    css`
      :host {
        display: block;
        height: calc(var(--vf-scale, 1) * 14px);
      }
      .track {
        position: relative;
        height: 100%;
        background: var(--vf-progress-track, #ffffff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        border-radius: 0;
        overflow: hidden;
      }
      .fill {
        height: 100%;
        background: var(--vf-progress-fill, #000000);
        /* The classic 1px black leading edge. */
        border-right: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
      }
      .fill.empty {
        border-right: none;
      }
      .fill.stripes {
        width: 100%;
        border-right: none;
        /* Chunky 45° barber stripes: a 12×12 system-px cell whose two black
           \ bands are a staircase of axis-aligned 1px rects (genuine pixel
           art — a *diagonal* edge would blur where these stay pixel-exact)
           over this themeable white ground. The art itself rides the
           .vf-tile-strip child (src/tile-grid.ts): the kit's whole-surface
           raster, or a consumer --vf-progress-stripes token's placed tile
           grid at the token's documented 60-px tile geometry. This layer is
           the strip's containing block and its clip. */
        position: relative;
        background-color: var(--vf-white, #fff);
        --_vf-tile-image: var(--vf-progress-stripes, ${unsafeCSS(BARBER_TILE)});
      }
      /* The animated strip: rests one 12px cell to the left (fully covering
         the fill), and each cycle advances one whole cell in 4 chunky steps —
         steppy, not smooth, wrapping with zero phase jump because the art's
           period is the cell. The animated value is a layout property, so
         every step is one quantized length paint-snapped like any placed
         box — no CSS length ever accumulates a phase. */
      .vf-tile-strip {
        position: absolute;
        top: 0;
        height: 100%;
        left: calc(var(--vf-scale, 1) * -12px);
        animation: vf-barber 0.4s steps(4, end) infinite;
      }
      @keyframes vf-barber {
        from {
          left: calc(var(--vf-scale, 1) * -12px);
        }
        to {
          left: 0;
        }
      }
      /* Forced colors: the fill and track are the bar's whole reading, and
         both have their own tokens with literal fallbacks the override
         flattens to Canvas — remapped here like the palette tokens in vfBase.
         The strip's raster art would keep its literal black ink (invisible on
         a dark theme), so the strip hides and the layer repaints as a mask
         over the ink token — same tile, same token a consumer overrides —
         with the animation on the mask's position. The span-tiled mask keeps
         the zoom caveat (no mask pipeline rasterizes exactly at a zoom-minted
         scale); forced-colors-plus-zoom stays the accepted residual. */
      @media (forced-colors: active) {
        :host {
          --vf-progress-fill: CanvasText;
          --vf-progress-track: Canvas;
        }
        .fill.stripes {
          background-color: var(--vf-progress-fill, CanvasText);
          mask-image: var(--vf-progress-stripes, ${unsafeCSS(BARBER_TILE)});
          ${vfTileMaskSize(BARBER_MOTIF)}
          animation: vf-barber-mask 0.4s steps(4, end) infinite;
        }
        .fill.stripes .vf-tile-strip {
          display: none;
        }
      }
      @keyframes vf-barber-mask {
        from {
          mask-position: 0 0;
        }
        to {
          mask-position: calc(var(--vf-scale, 1) * 12px) 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .fill.stripes,
        .vf-tile-strip {
          animation: none;
        }
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /** Current progress, from 0 to `max`. Clamped for display and ARIA. */
  @property({ type: Number }) value = 0

  /** Maximum value (default 100). */
  @property({ type: Number }) max = 100

  /** Barber-pole "busy" mode; ignores `value` and omits `aria-valuenow`. */
  @property({ type: Boolean, reflect: true }) indeterminate = false

  /**
   * Accessible name for the bar, applied as the host's `aria-label` (which
   * carries `role="progressbar"`). Especially useful in `indeterminate` mode,
   * where there is no `aria-valuenow` to describe the bar. A consumer-supplied
   * `aria-label`/`aria-labelledby` attribute is left alone.
   */
  @property() label = ''

  @query('.track') private track!: HTMLElement | null

  /** Track the fill area's width so the determinate fill can snap to it. */
  private readonly trackSize = new TrackWidthController(this, () => this.track)

  /**
   * The consumer's `--vf-progress-stripes` override, or `''` for the kit
   * barber — which exact-fill path the strip takes (src/tile-grid.ts).
   * Re-read every update; a runtime token swap wants a `requestUpdate()`.
   */
  private _pattern = ''

  /** The whole-strip barber raster, cached against its ceiled width. */
  readonly #raster = new TileRasterCache()

  /**
   * ARIA goes through internals, never `setAttribute` on the host: internals
   * values are *defaults*, so a consumer's own `role`/`aria-*` on the tag wins
   * — the platform's own precedence, and the opposite of what a host
   * `setAttribute` gives. See SPEC §2.
   */
  readonly #internals = this.attachInternals()

  constructor() {
    super()
    // Constant for the life of the bar — set once rather than rewritten on
    // every update alongside the values that actually change.
    this.#internals.role = 'progressbar'
    this.#internals.ariaValueMin = '0'
  }

  /** Effective maximum: a non-positive `max` is treated as the default 100. */
  private get effectiveMax(): number {
    return this.max > 0 ? this.max : 100
  }

  /** `value` clamped to `[0, effectiveMax]`. */
  private get clampedValue(): number {
    return Math.min(Math.max(this.value, 0), this.effectiveMax)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    if (this.indeterminate) {
      this._pattern = patternOverride(this, '--vf-progress-stripes')
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    // Written unconditionally: an empty label clears the internals default
    // rather than the host, so a consumer's own aria-label is never in reach
    // to be blown away and needs no first-update guard.
    if (changed.has('label')) this.#internals.ariaLabel = this.label || null
    if (changed.has('max')) {
      this.#internals.ariaValueMax = String(this.effectiveMax)
    }
    if (changed.has('value') || changed.has('max') || changed.has('indeterminate')) {
      this.#internals.ariaValueNow = this.indeterminate
        ? null
        : String(this.clampedValue)
    }
  }

  protected override render() {
    if (this.indeterminate) {
      // The strip covers the measured fill width plus the 12px cell it rests
      // shifted by, ceiled to whole 60-px tiles so a resize only re-encodes
      // the raster when it crosses a tile boundary (the layer clips the
      // overdraw). Until the track is measured the single-tile strip still
      // covers a 48px bar — the first measurement re-renders.
      const sysW = toSys(this.trackSize.width, this)
      const stripW = Math.max(
        BARBER_SPAN,
        Math.ceil((sysW + BARBER_MOTIF) / BARBER_SPAN) * BARBER_SPAN
      )
      // The raster overdraws the fill height by one motif: a floored track
      // border can leave the interior a fraction of a system px taller than
      // its stated 12, and the raster must overshoot rather than stretch —
      // the layer's clip crops it (the art's period is the motif, so the
      // overdraw continues the pattern).
      const art = this._pattern
        ? tileGrid({ cols: stripW / BARBER_SPAN, rows: 1, tile: BARBER_SPAN })
        : html`<div
            class="vf-tile-raster"
            style="width:${sysLength(stripW)};height:${sysLength(
              FILL_HEIGHT + BARBER_MOTIF
            )};background-image:${this.#raster.for(
              BARBER_MOTIF,
              BARBER_MOTIF,
              BARBER_RECTS,
              stripW,
              FILL_HEIGHT + BARBER_MOTIF
            )}"
          ></div>`
      return html`
        <div class="track vf-snap" part="track">
          <div class="fill stripes vf-tile-grid" part="fill">
            <div class="vf-tile-strip">${art}</div>
          </div>
        </div>
      `
    }
    const fraction = this.clampedValue / this.effectiveMax
    // Snap the fill to whole system px so its 1px leading edge lands on the
    // device grid (no antialiased fringe), the way the slider snaps its fill.
    // Until the track is measured, fall back to a raw % so the bar still paints.
    const sysW = toSys(this.trackSize.width, this)
    const width =
      sysW > 0 ? `${sys(Math.round(fraction * sysW), this)}px` : `${fraction * 100}%`
    return html`
      <div class="track vf-snap" part="track">
        <div
          class="fill ${fraction <= 0 ? 'empty' : ''}"
          part="fill"
          style="width: ${width}"
        ></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-progress-bar': VfProgressBar
  }
}
