import { css, html } from 'lit'
import type { PropertyValues } from 'lit'
import { property, query } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { vfBase, vfFocusUnderline } from '../styles/base.js'
import { SLIDER_THUMB, SLIDER_THUMB_FACE } from '../glyphs.js'
import { ScaleController, sys, toSys } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { TrackWidthController } from '../track-width.js'
import { VfFormControl } from '../form-control.js'
import { FocusRuleController } from '../focus-modality.js'
import { emit, emitNative } from '../events.js'
import { decimalsOf } from '../number.js'

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
 * @fires input - Native event, dispatched from the host on every user value
 *   move — a native range input's cadence. A programmatic `value` set fires
 *   nothing.
 * @fires change - Native event, dispatched from the host on commit (release,
 *   or a key change) so form delegation and framework bindings hear it.
 *
 * @csspart track - The full-width rail row (the pointer target).
 * @csspart rail - The `<svg>` capsule (fill + hollow).
 * @csspart thumb - The shield-shaped drag handle.
 */
@vfElement('vf-slider')
export class VfSlider extends VfFormControl {
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
      /* Never draw the UA outline on the host: keyboard focus is the kit's
         dashed rule under the RAIL, not a ring around the handle. Marking the
         handle marked the value rather than the control, and moved as the value
         did; the rail is the slider's whole extent, so the rule reads as one
         underline for the control however far along the thumb has travelled.
         One blank system px row under the rail's bottom edge, which sits
         RAIL_TOP + RAIL_H from the track's top: the offset counts back up from
         the track's own bottom, 12 − (3 + 4) − 1 − 1 = 3.

         The thumb is z-index 1 and the rule is not, so the handle occludes the
         dashes it passes over — the same way it occludes the rail behind it.

         Gated on a class, not :focus-visible, as vf-select and vf-menu are: a
         press on the track preventDefaults (to suppress text selection), which
         cancels the native focus, so #onPointerDown calls focus() itself — and
         Blink reads a scripted focus as a visible one. */
      :host(:focus) {
        outline: none;
      }
      .track.vf-focus-rule::after {
        --vf-focus-underline-offset: ${THUMB_H - (RAIL_TOP + RAIL_H) - 2}px;
        ${vfFocusUnderline}
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

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /** Accessible name, exposed as the control's `aria-label`. */
  @property() label = ''

  @query('.track') private track!: HTMLElement | null

  /** Measured content width of the rail, in px — the rail SVG is regenerated
   * from it so every edge stays on the device grid. */
  private readonly trackSize = new TrackWidthController(this, () => this.track)

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /** True when this component owns the host `tabindex`. */
  private selfManagedTabIndex = false

  /**
   * Whether the rail wears the kit's dashed focus rule — keyboard focus only,
   * which this control can't read off `:focus-visible` (see the CSS).
   */
  readonly #focusRule = new FocusRuleController(this)

  /** Value captured at pointer-down, to decide whether a drag emitted a change. */
  #dragStartValue = 0

  /** True between pointer-down and its release — drives the drag lifecycle so a
   * commit does not depend on pointer capture having been established. */
  #dragging = false

  constructor() {
    super()
    this.internals.role = 'slider'
    // Constant for the life of the control — set once rather than rewritten on
    // every update alongside the values that actually change.
    this.internals.ariaOrientation = 'horizontal'
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.latchFormDefault(this.value)
    if (!this.hasAttribute('tabindex')) {
      this.selfManagedTabIndex = true
      this.tabIndex = this.isDisabled ? -1 : 0
    }
    this.addEventListener('keydown', this.#onKeydown)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('keydown', this.#onKeydown)
  }

  /** Restores the initial value when the associated form resets. */
  formResetCallback(): void {
    this.value = this.formDefault(0)
  }

  /**
   * Restored form state parses back to the numeric `value` (the stored state
   * is `String(clampedValue)`; the base default would assign the string).
   */
  protected override applyFormState(state: string): void {
    const parsed = Number(state)
    if (!Number.isNaN(parsed)) this.value = parsed
  }

  // ------------------------------------------------------------- value math

  get #range(): number {
    return this.max - this.min || 1
  }

  /** Effective step: a non-positive `step` snaps continuously (treated as 1). */
  get #step(): number {
    return this.step > 0 ? this.step : 1
  }

  #clamp(n: number): number {
    return Math.min(Math.max(n, this.min), this.max)
  }

  /** Snap a raw value to the step grid, clamp it, and fix float precision. */
  #snap(n: number): number {
    const step = this.#step
    const steps = Math.round((n - this.min) / step)
    const snapped = this.#clamp(this.min + steps * step)
    return Number(snapped.toFixed(decimalsOf(step)))
  }

  /** `value` clamped to `[min, max]` for display/ARIA (unsnapped). */
  get #clampedValue(): number {
    // A non-finite `value` (NaN/±Infinity written by a consumer) would survive
    // #clamp and reach the DOM as `left: NaNpx` — silently rejected, mislaying
    // the thumb — and as ariaValueNow="NaN". Fall back to `min`, matching the
    // number field's guarded parse path. Every geometry/ARIA read funnels
    // through here, so this one guard covers the fill, the thumb and the
    // keyboard steps.
    const value = Number.isFinite(this.value) ? this.value : this.min
    return this.#clamp(value)
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
    emit(this, type, { value: this.value })
    // Every #emit call site is a user gesture (drag step, release, key), and
    // the slider has no inner native control firing its own — so the native
    // counterpart maps 1:1 here, matching a native range input's cadence.
    emitNative(this, type === 'vf-input' ? 'input' : 'change')
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
    const usable = rect.width - sys(THUMB_W, this)
    if (usable <= 0) return this.value
    const fraction = Math.min(Math.max((clientX - rect.left - sys(THUMB_HALF, this)) / usable, 0), 1)
    return this.#snap(this.min + fraction * this.#range)
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (this.isDisabled || event.button !== 0) return
    event.preventDefault()
    // We preventDefault (to suppress text selection), which also cancels the
    // native focus, so focus() manually. The modality tracker sees the
    // pointerdown first and leaves the rule off — except when the slider is
    // ALREADY focused, where focus() moves nothing and fires no focusin, so
    // suppress() covers a keyboard-focused slider the user then grabs.
    this.#focusRule.suppress()
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
    if (this.isDisabled) return
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
    // A handled key is keyboard interaction, whatever put the focus here —
    // reveal the rule even on a slider that was grabbed with the mouse.
    this.#focusRule.reveal()
    if (next !== this.value) {
      this.#update(next)
      this.#emit('vf-change')
    }
  }

  // -------------------------------------------------------------- lifecycle

  /**
   * Mirror state into the form value, ARIA and the tab stop — each write gated
   * on the properties it derives from, so the re-renders driven by unrelated
   * state (the focus ring, a rail resize tick) don't re-run all of it. On the
   * first update every reactive property is in `changed` (class-field defaults,
   * with `undefined` as the old value), so the initial writes all still happen.
   */
  protected override updated(changed: PropertyValues<this>): void {
    const disabled = this.disabledChanged(changed)
    const range = changed.has('value') || changed.has('min') || changed.has('max')
    if (range || disabled) this.syncFormValue(String(this.#clampedValue))
    if (changed.has('min')) this.internals.ariaValueMin = String(this.min)
    if (changed.has('max')) this.internals.ariaValueMax = String(this.max)
    if (range) this.internals.ariaValueNow = String(this.#clampedValue)
    if (changed.has('label')) this.internals.ariaLabel = this.label || null
    if (disabled) {
      this.internals.ariaDisabled = this.isDisabled ? 'true' : 'false'
      if (this.selfManagedTabIndex) this.tabIndex = this.isDisabled ? -1 : 0
    }
  }

  protected override render() {
    // trackWidth is on-screen (already-scaled) CSS px. Author the rail in system
    // px and scale it up via the SVG viewBox, so the whole capsule (caps, edges,
    // fill) scales uniformly. The thumb's left edge travels 0…(sysW − thumbW) in
    // system px and snaps to the system grid (whole device pixels) so the sprite
    // stays crisp; the fill ends at the thumb's centre grip.
    const sysW = toSys(this.trackSize.width, this)
    const thumbLeftSys = Math.round(this.#fraction * Math.max(0, sysW - THUMB_W))
    const thumbLeft = sys(thumbLeftSys, this)
    const pos = thumbLeftSys + THUMB_CENTER
    return html`
      <div
        class="track vf-snap ${this.#focusRule.marked ? 'vf-focus-rule' : ''} ${
          this.isDisabled ? 'disabled' : ''
        }"
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
              width=${sys(sysW, this)}
              height=${sys(RAIL_H, this)}
              viewBox="0 0 ${sysW} ${RAIL_H}"
              shape-rendering="crispEdges"
              aria-hidden="true"
            >
              <path d=${railPath(sysW, pos)}></path>
            </svg>`
          : null}
        <span class="thumb" part="thumb" style="left: ${thumbLeft}px">
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
