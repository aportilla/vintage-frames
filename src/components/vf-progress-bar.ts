import { css, html, LitElement } from 'lit'
import type { PropertyValues } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'
import { ScaleController, sys, toSys } from '../scale.js'

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
 */
@customElement('vf-progress-bar')
export class VfProgressBar extends LitElement {
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
           whole system pixel. Override the whole pattern via
           --vf-progress-stripes. */
        background-color: var(--vf-white, #fff);
        background-image: var(
          --vf-progress-stripes,
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' shape-rendering='crispEdges'%3E%3Crect x='0' y='0' width='6' height='1'/%3E%3Crect x='1' y='1' width='6' height='1'/%3E%3Crect x='2' y='2' width='6' height='1'/%3E%3Crect x='3' y='3' width='6' height='1'/%3E%3Crect x='4' y='4' width='6' height='1'/%3E%3Crect x='5' y='5' width='6' height='1'/%3E%3Crect x='6' y='6' width='6' height='1'/%3E%3Crect x='0' y='7' width='1' height='1'/%3E%3Crect x='7' y='7' width='5' height='1'/%3E%3Crect x='0' y='8' width='2' height='1'/%3E%3Crect x='8' y='8' width='4' height='1'/%3E%3Crect x='0' y='9' width='3' height='1'/%3E%3Crect x='9' y='9' width='3' height='1'/%3E%3Crect x='0' y='10' width='4' height='1'/%3E%3Crect x='10' y='10' width='2' height='1'/%3E%3Crect x='0' y='11' width='5' height='1'/%3E%3Crect x='11' y='11' width='1' height='1'/%3E%3C/svg%3E")
        );
        background-size: calc(var(--vf-scale, 1) * 12px) calc(var(--vf-scale, 1) * 12px);
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
      @media (prefers-reduced-motion: reduce) {
        .fill.stripes {
          animation: none;
        }
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Current progress, from 0 to `max`. Clamped for display and ARIA. */
  @property({ type: Number }) value = 0

  /** Maximum value (default 100). */
  @property({ type: Number }) max = 100

  /** Barber-pole "busy" mode; ignores `value` and omits `aria-valuenow`. */
  @property({ type: Boolean, reflect: true }) indeterminate = false

  @query('.track') private track!: HTMLElement | null

  /** Measured content width of the track, in px (from a ResizeObserver). */
  @state() private trackWidth = 0

  private resizeObserver?: ResizeObserver

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('role', 'progressbar')
    this.setAttribute('aria-valuemin', '0')
    this.observeTrack()
  }

  protected override firstUpdated(): void {
    this.observeTrack()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
  }

  /** Track the fill area's width so the determinate fill can snap to it. */
  private observeTrack(): void {
    if (!this.track) return
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) this.trackWidth = Math.floor(entry.contentRect.width)
      })
    }
    this.resizeObserver.observe(this.track)
  }

  /** `value` clamped to `[0, max]` (with a non-positive `max` treated as 100). */
  private get clampedValue(): number {
    const max = this.max > 0 ? this.max : 100
    return Math.min(Math.max(this.value, 0), max)
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('max')) {
      this.setAttribute('aria-valuemax', String(this.max > 0 ? this.max : 100))
    }
    if (changed.has('value') || changed.has('max') || changed.has('indeterminate')) {
      if (this.indeterminate) {
        this.removeAttribute('aria-valuenow')
      } else {
        this.setAttribute('aria-valuenow', String(this.clampedValue))
      }
    }
  }

  protected override render() {
    if (this.indeterminate) {
      return html`
        <div class="track" part="track">
          <div class="fill stripes" part="fill"></div>
        </div>
      `
    }
    const max = this.max > 0 ? this.max : 100
    const fraction = this.clampedValue / max
    // Snap the fill to whole system px so its 1px leading edge lands on the
    // device grid (no antialiased fringe), the way the slider snaps its fill.
    // Until the track is measured, fall back to a raw % so the bar still paints.
    const sysW = toSys(this.trackWidth, this)
    const width =
      sysW > 0 ? `${sys(Math.round(fraction * sysW), this)}px` : `${fraction * 100}%`
    return html`
      <div class="track" part="track">
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
