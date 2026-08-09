import { css, html, LitElement, unsafeCSS } from 'lit'
import type { PropertyValues } from 'lit'
import { property, query } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { vfBase } from '../styles/base.js'
import { tileImage, vfTileMaskSize, vfTileSize } from '../styles/recipes/tile.js'
import { ScaleController, sys, toSys } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { TrackWidthController } from '../track-width.js'

/**
 * The barber motif: a 12-system-px cell whose two black \ bands are a staircase
 * of axis-aligned 1px rects, laid into the span a repeating fill has to take
 * ({@link tileImage}). Declared once here rather than inline twice — the
 * forced-colors branch masks with the same art — and above the class, since
 * `@vfElement` upgrades at module evaluation.
 */
const BARBER_MOTIF = 12
const BARBER_TILE = tileImage(
  BARBER_MOTIF,
  BARBER_MOTIF,
  "%3Crect x='0' y='0' width='6' height='1'/%3E%3Crect x='1' y='1' width='6' height='1'/%3E" +
    "%3Crect x='2' y='2' width='6' height='1'/%3E%3Crect x='3' y='3' width='6' height='1'/%3E" +
    "%3Crect x='4' y='4' width='6' height='1'/%3E%3Crect x='5' y='5' width='6' height='1'/%3E" +
    "%3Crect x='6' y='6' width='6' height='1'/%3E%3Crect x='0' y='7' width='1' height='1'/%3E" +
    "%3Crect x='7' y='7' width='5' height='1'/%3E%3Crect x='0' y='8' width='2' height='1'/%3E" +
    "%3Crect x='8' y='8' width='4' height='1'/%3E%3Crect x='0' y='9' width='3' height='1'/%3E" +
    "%3Crect x='9' y='9' width='3' height='1'/%3E%3Crect x='0' y='10' width='4' height='1'/%3E" +
    "%3Crect x='10' y='10' width='2' height='1'/%3E%3Crect x='0' y='11' width='5' height='1'/%3E" +
    "%3Crect x='11' y='11' width='1' height='1'/%3E"
)

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
 *   on a 60-system-px tile (override the whole tile)
 * @cssprop [--vf-progress-track=#ffffff] - progress track (white)
 */
@vfElement('vf-progress-bar')
export class VfProgressBar extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
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
        /* Chunky 45° barber stripes as a crisp 1-bit SVG tile: a 12×12
           system-px cell whose two black \ bands are drawn as a staircase of
           axis-aligned 1px rects (genuine pixel art) over a themeable white
           ground, meeting seamlessly when tiled. Every edge is horizontal or
           vertical — a *diagonal* polygon edge only rasterizes crisply at the
           SVG's own resolution and then blurs to a gray fringe when the
           background is scaled up, whereas these rects stay pixel-exact at any
           scale (same reason the desktop dither uses rects). --vf-scale maps
           each system pixel to whole device pixels; each staircase step is one
           whole system pixel. The motif ships inside the 60-system-px tile a
           repeating fill has to span (vfTileSize). Override the whole tile via
           --vf-progress-stripes. */
        background-color: var(--vf-white, #fff);
        background-image: var(--vf-progress-stripes, ${unsafeCSS(BARBER_TILE)});
        ${vfTileSize(BARBER_MOTIF)}
        /* Advance exactly one whole cell (12px) per cycle so the loop wraps
           with zero phase jump (no seam), in 4 chunky steps — steppy, not
           smooth. */
        animation: vf-barber 0.4s steps(4, end) infinite;
      }
      @keyframes vf-barber {
        from {
          background-position: 0 0;
        }
        to {
          background-position: calc(var(--vf-scale, 1) * 12px) 0;
        }
      }
      /* Forced colors: the fill and track are the bar's whole reading, and
         both have their own tokens with literal fallbacks the override
         flattens to Canvas — remapped here like the palette tokens in vfBase.
         The barber tile is a url() image, which forced colors preserves with
         its literal black ink (invisible on a dark theme), so it repaints as
         a mask over the ink token — same tile, same token a consumer
         overrides — with the animation moved onto the mask's position. */
      @media (forced-colors: active) {
        :host {
          --vf-progress-fill: CanvasText;
          --vf-progress-track: Canvas;
        }
        .fill.stripes {
          background-image: none;
          background-color: var(--vf-progress-fill, CanvasText);
          mask-image: var(--vf-progress-stripes, ${unsafeCSS(BARBER_TILE)});
          ${vfTileMaskSize(BARBER_MOTIF)}
          animation-name: vf-barber-mask;
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
        .fill.stripes {
          animation: none;
        }
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
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
      return html`
        <div class="track vf-snap" part="track">
          <div class="fill stripes" part="fill"></div>
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
