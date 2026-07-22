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
        background: repeating-linear-gradient(
          45deg,
          var(--vf-black, #000) 0 calc(var(--vf-scale, 1) * 4px),
          var(--vf-white, #fff) calc(var(--vf-scale, 1) * 4px) calc(var(--vf-scale, 1) * 8px)
        );
        /* One stripe period (8px pitch at 45° ≈ 11.31px horizontally) in 4
           chunky steps — steppy, not smooth. */
        animation: vf-barber 0.4s steps(4, end) infinite;
      }
      @keyframes vf-barber {
        from {
          background-position: 0 0;
        }
        to {
          background-position: calc(var(--vf-scale, 1) * 11.31px) 0;
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
    const sysW = toSys(this.trackWidth)
    const width =
      sysW > 0 ? `${sys(Math.round(fraction * sysW))}px` : `${fraction * 100}%`
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
