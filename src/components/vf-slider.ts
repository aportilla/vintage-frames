import { css, html, LitElement } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'
import { SLIDER_THUMB, SLIDER_THUMB_FACE } from '../glyphs.js'
import { ScaleController, sys, toSys } from '../scale.js'

/** Native pixel size of the {@link SLIDER_THUMB} sprite. */
const THUMB_W = 11
const THUMB_H = 12
/** Left offset that puts the thumb's centre grip (sprite column 5) on a point. */
const THUMB_CENTER = 5
/** Half the thumb width — the travel is inset by this at each end so the thumb's
 * edges stay flush within the rail (they never overhang past its ends). */
const THUMB_HALF = THUMB_W / 2
/** Rail band: 4px tall, occupying thumb sprite rows 3–6 (so it threads the grips). */
const RAIL_H = 4
const RAIL_TOP = 3

/**
 * Build the pixel-exact rail path for a track `w` px wide with the solid fill
 * ending at `pos` px. One rounded 1-bit capsule (4px tall): solid black from the
 * left cap up to the thumb, hollow (1px top/bottom edge) after it, both ends
 * tapering to a 2px tip. Traced from the reference sprite — a whole-pixel union
 * of runs, so at 1:1 with `crispEdges` every edge is exact.
 */
function railPath(w: number, pos: number): string {
  const runs: string[] = []
  const rect = (x: number, y: number, rw: number, rh: number): void => {
    if (rw > 0 && rh > 0) runs.push(`M${x} ${y}h${rw}v${rh}h-${rw}z`)
  }
  // Top & bottom edges span the full width minus the two clipped corner columns.
  rect(1, 0, w - 2, 1)
  rect(1, RAIL_H - 1, w - 2, 1)
  // Rounded 2px caps at each end (the exposed middle rows).
  rect(0, 1, 1, 2)
  rect(w - 1, 1, 1, 2)
  // Solid fill of the middle band, from the left cap up to the thumb position.
  const fillEnd = Math.min(Math.max(pos, 0), w - 1)
  rect(1, 1, fillEnd - 1, 2)
  return runs.join('')
}

/**
 * `<vf-slider>` — a horizontal 1-bit slider.
 *
 * Not a historically shipped System 7 control: it reverse-adapts the later
 * Mac OS slider into the library's solid-black, pixel-crisp 1-bit style. A
 * rounded capsule rail fills solid black from the left up to a shield-shaped
 * drag handle (the {@link SLIDER_THUMB} sprite) and runs hollow after it. The
 * rail is regenerated as a whole-pixel SVG on every resize so it stays crisp at
 * any width, and the thumb snaps to integer pixels so the sprite never blurs.
 *
 * Form-associated: submits `value` under `name` and restores it on form reset.
 * Drag or click the track to set the value; focus it and use the arrow keys
 * (Home/End jump to min/max, PageUp/PageDown move in bigger steps).
 *
 * @fires vf-input - On every drag move or key change. `detail: { value: number }`.
 * @fires vf-change - On commit (pointer release, or key change). `detail: { value: number }`.
 *
 * @csspart track - The full-width rail row (the pointer target).
 * @csspart rail - The `<svg>` capsule (fill + hollow).
 * @csspart thumb - The shield-shaped drag handle.
 */
@customElement('vf-slider')
export class VfSlider extends LitElement {
  /** Participates in native forms via ElementInternals. */
  static formAssociated = true

  static override styles = [
    vfBase,
    css`
      :host {
        /* Padding just leaves room for the thumb's focus ring; the thumb itself
           stays within the rail (its travel is inset by half its width). */
        display: block;
        padding: calc(var(--vf-scale, 1) * 3px) calc(var(--vf-scale, 1) * 4px);
        color: var(--vf-black, #000);
        cursor: default;
        -webkit-tap-highlight-color: transparent;
      }
      .track {
        position: relative;
        width: 100%;
        height: calc(var(--vf-scale, 1) * ${THUMB_H}px);
        touch-action: none;
      }
      /* A slider has no separate label — the fill *is* the value, so the whole
         control dims to gray when disabled (like the number field's value).
         Keyed off the resolved state (covers both the attribute and an ancestor
         <fieldset disabled>), which .rail/.thumb inherit via currentColor. */
      .track.disabled {
        color: var(--vf-disabled, #c0c0c0);
        pointer-events: none;
      }
      .rail {
        position: absolute;
        left: 0;
        top: calc(var(--vf-scale, 1) * ${RAIL_TOP}px);
        height: calc(var(--vf-scale, 1) * ${RAIL_H}px);
        color: inherit;
        pointer-events: none;
      }
      .rail path {
        fill: currentColor;
      }
      .thumb {
        position: absolute;
        top: 0;
        /* Above the rail so the opaque handle occludes it. */
        z-index: 1;
        width: calc(var(--vf-scale, 1) * ${THUMB_W}px);
        height: calc(var(--vf-scale, 1) * ${THUMB_H}px);
        color: inherit;
        pointer-events: none;
      }
      .thumb-glyph {
        display: block;
        width: calc(var(--vf-scale, 1) * ${THUMB_W}px);
        height: calc(var(--vf-scale, 1) * ${THUMB_H}px);
      }
      /* Solid white fill behind the black outline so the rail passes *behind*
         the handle, not through its interior. */
      .thumb-face {
        fill: var(--vf-white, #fff);
      }
      .thumb-outline {
        fill: currentColor;
      }
      /* Never draw the UA outline on the host. We render our own dotted ring on
         the thumb, and only for keyboard focus — never during a pointer drag
         (:focus-visible misfires there because we focus() programmatically). */
      :host(:focus) {
        outline: none;
      }
      .thumb.focus-ring {
        outline: var(--vf-focus-outline, 1px dotted #000);
        outline-offset: calc(var(--vf-scale, 1) * 2px);
      }
    `,
  ]

  /** Current value, clamped to `[min, max]` and snapped to `step`. */
  @property({ type: Number }) value = 0

  /** Minimum value (inclusive). */
  @property({ type: Number }) min = 0

  /** Maximum value (inclusive). */
  @property({ type: Number }) max = 100

  /** Increment the value snaps to (also sets its display precision). */
  @property({ type: Number }) step = 1

  /** Disables the slider: it dims to gray and stops responding. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /** Accessible name, exposed as the control's `aria-label`. */
  @property() label = ''

  /** Measured content width of the rail, in px (from a ResizeObserver). */
  @state() private trackWidth = 0

  @query('.track') private track!: HTMLElement | null

  private readonly internals: ElementInternals

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  private resizeObserver?: ResizeObserver

  /** Value at first connect, restored on form reset. */
  private defaultValue: number | null = null

  /** True when this component owns the host `tabindex`. */
  private selfManagedTabIndex = false

  /** True while an ancestor `<fieldset disabled>` disables this control. */
  @state() private formDisabled = false

  /** Whether to show the dotted focus ring — true only for keyboard focus. */
  @state() private focusRing = false

  /** Value captured at pointer-down, to decide whether a drag emitted a change. */
  #dragStartValue = 0

  /** True between pointer-down and its release — drives the drag lifecycle so a
   * commit does not depend on pointer capture having been established. */
  #dragging = false

  /** True when the current focus originated from a pointer (suppresses the ring). */
  #pointerFocus = false

  constructor() {
    super()
    this.internals = this.attachInternals()
    this.internals.role = 'slider'
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.defaultValue === null) this.defaultValue = this.value
    if (!this.hasAttribute('tabindex')) {
      this.selfManagedTabIndex = true
      this.tabIndex = this.#isDisabled ? -1 : 0
    }
    this.addEventListener('keydown', this.#onKeydown)
    this.addEventListener('focus', this.#onFocus)
    this.addEventListener('blur', this.#onBlur)
    // Re-attach the size observer when re-connected (the track already exists on
    // reconnect; on first connect it is null and firstUpdated wires it instead).
    this.#observeTrack()
  }

  protected override firstUpdated(): void {
    this.#observeTrack()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.removeEventListener('keydown', this.#onKeydown)
    this.removeEventListener('focus', this.#onFocus)
    this.removeEventListener('blur', this.#onBlur)
  }

  // Focus-ring modality: show the dotted ring only when focus arrives from the
  // keyboard. A pointer-down flags the focus as pointer-originated (ring off);
  // an arrow/page/home/end key re-enables it (see #onKeydown).
  #onFocus = (): void => {
    this.focusRing = !this.#pointerFocus
  }

  #onBlur = (): void => {
    this.focusRing = false
    this.#pointerFocus = false
  }

  /** Lazily create the ResizeObserver and (re-)observe the rail track. */
  #observeTrack(): void {
    if (!this.track) return
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) this.trackWidth = Math.floor(entry.contentRect.width)
      })
    }
    this.resizeObserver.observe(this.track)
  }

  /** Called by the form owner when an ancestor enables/disables this control. */
  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  /** Restores the initial value when the associated form resets. */
  formResetCallback(): void {
    this.value = this.defaultValue ?? 0
  }

  get #isDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  // ------------------------------------------------------------- value math

  get #range(): number {
    return this.max - this.min || 1
  }

  /** Effective step: a non-positive `step` snaps continuously (treated as 1). */
  get #step(): number {
    return this.step > 0 ? this.step : 1
  }

  #decimals(): number {
    const s = String(this.#step)
    const dot = s.indexOf('.')
    return dot < 0 ? 0 : s.length - dot - 1
  }

  #clamp(n: number): number {
    return Math.min(Math.max(n, this.min), this.max)
  }

  /** Snap a raw value to the step grid, clamp it, and fix float precision. */
  #snap(n: number): number {
    const step = this.#step
    const steps = Math.round((n - this.min) / step)
    const snapped = this.#clamp(this.min + steps * step)
    return Number(snapped.toFixed(this.#decimals()))
  }

  /** `value` clamped to `[min, max]` for display/ARIA (unsnapped). */
  get #clampedValue(): number {
    return this.#clamp(this.value)
  }

  /** Fraction 0–1 of the current value across the range. */
  get #fraction(): number {
    return Math.min(Math.max((this.#clampedValue - this.min) / this.#range, 0), 1)
  }

  /** Set the value and emit `vf-input` if it actually changed. */
  #update(next: number): void {
    if (next === this.value) return
    this.value = next
    this.#emit('vf-input')
  }

  #emit(type: 'vf-input' | 'vf-change'): void {
    this.dispatchEvent(
      new CustomEvent(type, {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      })
    )
  }

  // -------------------------------------------------------------- pointer

  /** Map a client X coordinate to a snapped value. The usable travel is the rail
   * width inset by half a thumb at each end, so the pointer tracks the thumb's
   * centre while its edges stay within the rail. */
  #valueFromClientX(clientX: number): number {
    const rect = this.track?.getBoundingClientRect()
    if (!rect) return this.value
    // rect is real (scaled) CSS px; the thumb constants are system px, so the
    // half-thumb inset is converted with sys().
    const usable = rect.width - sys(THUMB_W)
    if (usable <= 0) return this.value
    const fraction = Math.min(Math.max((clientX - rect.left - sys(THUMB_HALF)) / usable, 0), 1)
    return this.#snap(this.min + fraction * this.#range)
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (this.#isDisabled || event.button !== 0) return
    event.preventDefault()
    // We preventDefault (to suppress text selection), which also cancels the
    // native focus, so focus() manually — but flag it as pointer-originated so
    // the dotted keyboard ring stays hidden during the drag.
    this.#pointerFocus = true
    this.focusRing = false
    this.focus()
    this.#dragging = true
    this.#dragStartValue = this.value
    // Capture keeps moves flowing if the pointer leaves the track; it is a
    // best-effort nicety (can throw for synthetic ids) and the drag lifecycle
    // is driven by #dragging, not by capture, so a failed capture still commits.
    try {
      this.track?.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic/inactive pointer id — proceed without capture.
    }
    this.#update(this.#valueFromClientX(event.clientX))
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#dragging) return
    this.#update(this.#valueFromClientX(event.clientX))
  }

  /** End a drag on pointerup / pointercancel / lostpointercapture, and commit
   * a change if the value moved. Idempotent (releasing capture re-enters here). */
  #onPointerUp = (event: PointerEvent): void => {
    if (!this.#dragging) return
    this.#dragging = false
    try {
      if (this.track?.hasPointerCapture(event.pointerId)) {
        this.track.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Capture already gone — nothing to release.
    }
    if (this.value !== this.#dragStartValue) this.#emit('vf-change')
  }

  // -------------------------------------------------------------- keyboard

  #onKeydown = (event: KeyboardEvent): void => {
    if (this.#isDisabled) return
    const step = this.#step
    const big = Math.max(step, this.#range / 10)
    let next = this.value
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = this.#snap(this.#clampedValue + step)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        next = this.#snap(this.#clampedValue - step)
        break
      case 'PageUp':
        next = this.#snap(this.#clampedValue + big)
        break
      case 'PageDown':
        next = this.#snap(this.#clampedValue - big)
        break
      case 'Home':
        next = this.min
        break
      case 'End':
        next = this.max
        break
      default:
        return
    }
    event.preventDefault()
    // A handled key is keyboard interaction — reveal the dotted ring.
    this.#pointerFocus = false
    this.focusRing = true
    if (next !== this.value) {
      this.#update(next)
      this.#emit('vf-change')
    }
  }

  // -------------------------------------------------------------- lifecycle

  protected override updated(): void {
    const value = this.#clampedValue
    this.internals.setFormValue(this.#isDisabled ? null : String(value))
    this.internals.ariaValueMin = String(this.min)
    this.internals.ariaValueMax = String(this.max)
    this.internals.ariaValueNow = String(value)
    this.internals.ariaOrientation = 'horizontal'
    this.internals.ariaLabel = this.label || null
    this.internals.ariaDisabled = this.#isDisabled ? 'true' : 'false'
    if (this.selfManagedTabIndex) this.tabIndex = this.#isDisabled ? -1 : 0
  }

  protected override render() {
    // trackWidth is on-screen (already-scaled) CSS px. Author the rail in system
    // px and scale it up via the SVG viewBox, so the whole capsule (caps, edges,
    // fill) scales uniformly. The thumb's left edge travels 0…(sysW − thumbW) in
    // system px and snaps to the system grid (whole device pixels) so the sprite
    // stays crisp; the fill ends at the thumb's centre grip.
    const sysW = toSys(this.trackWidth)
    const thumbLeftSys = Math.round(this.#fraction * Math.max(0, sysW - THUMB_W))
    const thumbLeft = sys(thumbLeftSys)
    const pos = thumbLeftSys + THUMB_CENTER
    return html`
      <div
        class="track ${this.#isDisabled ? 'disabled' : ''}"
        part="track"
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerUp}
        @lostpointercapture=${this.#onPointerUp}
      >
        ${sysW >= 2
          ? html`<svg
              class="rail"
              part="rail"
              width=${sys(sysW)}
              height=${sys(RAIL_H)}
              viewBox="0 0 ${sysW} ${RAIL_H}"
              shape-rendering="crispEdges"
              aria-hidden="true"
            >
              <path d=${railPath(sysW, pos)}></path>
            </svg>`
          : null}
        <span
          class="thumb ${this.focusRing ? 'focus-ring' : ''}"
          part="thumb"
          style="left: ${thumbLeft}px"
        >
          <svg
            class="thumb-glyph"
            viewBox="0 0 ${THUMB_W} ${THUMB_H}"
            shape-rendering="crispEdges"
            aria-hidden="true"
          >
            <path class="thumb-face" d=${SLIDER_THUMB_FACE.d}></path>
            <path class="thumb-outline" d=${SLIDER_THUMB.d}></path>
          </svg>
        </span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-slider': VfSlider
  }
}
