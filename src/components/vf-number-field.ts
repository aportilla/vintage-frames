import { css, html, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { classMap } from 'lit/directives/class-map.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfField } from '../styles/base.js'
import { STEPPER, STEPPER_DOWN_FILL, STEPPER_UP_FILL } from '../glyphs.js'
import { VfTextControlBase } from '../text-control.js'
import { decimalsOf } from '../number.js'
import { emitNative } from '../events.js'

/**
 * `<vf-number-field>` — a System 7 numeric entry field paired with the classic
 * "little arrows" stepper.
 *
 * A form-associated wrapper around a native `<input>` (white well, 1px black
 * border) plus the pixel-exact little-arrows control from the Classic Macintosh
 * UI Kit sprite. Clicking (or press-and-holding, with autorepeat) an arrow
 * steps the value by `step`, clamped to `min`/`max`; the held arrow fills solid
 * black, matching the kit's hollow→filled press convention. Keyboard focus
 * draws the kit's dashed rule under the well alone — the stepper is beside the
 * text, not part of it. The field is a `spinbutton`: ArrowUp/ArrowDown step, Home/End
 * jump to min/max. The shared field skin lives in `vfField`; the value/form
 * scaffolding in {@link VfTextControlBase}.
 *
 * @fires vf-input - On every keystroke. `detail: { value, valueAsNumber }`.
 * @fires vf-change - On commit or step. `detail: { value, valueAsNumber }`.
 * @fires input - The native event: the inner input's own on a keystroke
 *   (composed, crosses the boundary itself), dispatched from the host on a
 *   step — a native number input's spinner fires it per click too.
 * @fires change - The native commit event, dispatched from the host on a
 *   typed commit and on every step, as a native spinner does.
 *
 * The input-behavior attributes — `autocomplete`, `inputmode`, `enterkeyhint`,
 * `maxlength`, `spellcheck`, `autocapitalize` — are forwarded from the host
 * onto the inner input; unset, `inputmode` stays the numeric keypad's
 * `decimal` and `autocomplete` stays `off`.
 *
 * @csspart input - The inner native `<input>`.
 * @csspart stepper - The little-arrows control.
 * @cssprop [--vf-control-height=22px] - text fields — `vf-text-field`,
 *   `vf-text-area`, the `vf-number-field` well
 * @cssprop [--vf-number-field-width=4em] - width of `vf-number-field`'s input,
 *   in its own text (an em, not a system px length — it sizes to the digits)
 * @cssprop [--vf-field-placeholder=#767676] - placeholder text in the editable
 *   fields — kept off `--vf-disabled`: a placeholder sits in an *enabled* well
 *   and holds AA contrast, where the disabled gray is exempt
 */
@vfElement('vf-number-field')
export class VfNumberField extends VfPositioned(VfTextControlBase) {
  static override styles = [
    vfBase,
    vfField,
    css`
      :host {
        display: inline-flex;
        /* NOT stretch: that sized the well to the stepper's 25px, making this
           the one field that ignored --vf-control-height (see the input rule). */
        align-items: flex-start;
        gap: calc(var(--vf-scale, 1) * 3px);
      }
      /* The flex item is the wrapper, not the input: it boxes the well exactly,
         so the focus rule spans the well and stops short of the stepper beside
         it. Kept a flex container of its own so the input's own em width still
         sets the base size — and the input still grows with it when a consumer
         widens the host. */
      .vf-field-well {
        display: flex;
        flex: 1 1 auto;
        /* Shrinkable, or the stepper leaves the host box: min-width's auto
           floor here is the input's definite 4em width, so a host narrowed to
           4em or less pushed gap + stepper past its own border box (under
           whatever sits beside it) instead of narrowing the well. 0 hands the
           floor to the input's own min-width. */
        min-width: 0;
        /* The 3px difference is odd, so centering the well would land it on a
           half pixel and fringe at every scale. Bias it one whole pixel down
           (1 above / 2 below) — optically centered, still on the device grid. */
        margin-top: calc(var(--vf-scale, 1) * 1px);
      }
      input {
        flex: 1 1 auto;
        width: var(--vf-number-field-width, 4em);
        min-width: 2em;
        /* The reference sheets measure text fields at 22px and the little-arrows
           sprite at 15×25 — the well and the stepper are authentically different
           heights, so the well sits on the shared control token and the
           sprite keeps its native 1:1 size (the host ends up stepper-tall).
           min-, not height, as in vf-text-field: the default line box exactly
           fills it, and a user stylesheet raising line-height grows the well
           instead of clipping the digits. */
        min-height: calc(var(--vf-scale, 1) * var(--vf-control-height, 22px));
        padding: 0 calc(var(--vf-scale, 1) * 6px);
        text-align: right;
      }

      /* The little-arrows stepper, drawn at its native 15×25 (1:1, crisp). */
      .stepper {
        position: relative;
        flex: none;
        width: calc(var(--vf-scale, 1) * 15px);
        height: calc(var(--vf-scale, 1) * 25px);
        /* Stays solid black even when the field is disabled. */
        color: var(--vf-black, #000);
        cursor: default;
      }
      .stepper svg {
        display: block;
        width: calc(var(--vf-scale, 1) * 15px);
        height: calc(var(--vf-scale, 1) * 25px);
      }
      .fill {
        display: none;
      }
      .fill.on {
        display: inline;
      }
      /* Transparent hit targets over the top/bottom halves. */
      .hit {
        position: absolute;
        left: 0;
        right: 0;
        height: 50%;
        touch-action: none;
      }
      .hit.up {
        top: 0;
      }
      .hit.down {
        bottom: 0;
      }
      :host([disabled]) .hit,
      :host([readonly]) .hit {
        pointer-events: none;
      }
    `,
  ]

  /** Minimum allowed value (inclusive). Omit for no lower bound. */
  @property({ type: Number }) min?: number

  /** Maximum allowed value (inclusive). Omit for no upper bound. */
  @property({ type: Number }) max?: number

  /** Increment applied per step / arrow press. Also sets the value's precision. */
  @property({ type: Number }) step = 1

  /** Which arrow is currently held (drives the solid pressed glyph). */
  @state() private pressed: 'up' | 'down' | null = null

  @query('input') private input!: HTMLInputElement | null

  #delayTimer?: number
  #repeatTimer?: number

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#stopRepeat()
  }

  // ------------------------------------------------------------ value math

  #parse(): number {
    return parseFloat(this.value)
  }

  #clamp(n: number): number {
    if (this.min != null && n < this.min) return this.min
    if (this.max != null && n > this.max) return this.max
    return n
  }

  /** Clamp + round to the step's precision, store, and announce a change — but
   * only when the value actually changes, so autorepeat held against a bound
   * (or a keyboard step already at min/max) doesn't fire a redundant
   * `vf-change` on every 60ms tick. */
  #commit(n: number): void {
    const next = String(Number(this.#clamp(n).toFixed(decimalsOf(this.step))))
    if (next === this.value) return
    this.value = next
    this.#emit('vf-change')
    // A step writes the value programmatically, so unlike typing there is no
    // inner native event at all — dispatch both from the host, the pair a
    // native number input's spinner fires per click.
    emitNative(this, 'input')
    emitNative(this, 'change')
  }

  #stepBy(dir: 1 | -1): void {
    if (this.isDisabled || this.readonly) return
    const cur = this.#parse()
    const next = Number.isNaN(cur) ? (this.min ?? 0) : cur + dir * this.step
    this.#commit(next)
  }

  #emit(type: 'vf-input' | 'vf-change'): void {
    this.emitValue(type, { value: this.value, valueAsNumber: this.#parse() })
  }

  // -------------------------------------------------------------- autorepeat

  #startRepeat(dir: 1 | -1): void {
    this.#stopRepeat()
    // Classic press-and-hold: a pause, then repeat while held.
    this.#delayTimer = window.setTimeout(() => {
      this.#repeatTimer = window.setInterval(() => this.#stepBy(dir), 60)
    }, 300)
  }

  #stopRepeat(): void {
    if (this.#delayTimer !== undefined) window.clearTimeout(this.#delayTimer)
    if (this.#repeatTimer !== undefined) window.clearInterval(this.#repeatTimer)
    this.#delayTimer = this.#repeatTimer = undefined
  }

  // ------------------------------------------------------------------ events

  #onArrowDown = (event: PointerEvent): void => {
    if (this.isDisabled || this.readonly) return
    const dir: 1 | -1 = (event.currentTarget as HTMLElement).classList.contains('up') ? 1 : -1
    // Keep focus (and the text caret) on the input, and suppress text selection.
    event.preventDefault()
    // Capture so an autorepeat that outlives a drag off the button still ends.
    try {
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    } catch {
      // Non-active/synthetic pointer id — capture is a best-effort nicety.
    }
    this.input?.focus()
    this.pressed = dir > 0 ? 'up' : 'down'
    this.#stepBy(dir)
    this.#startRepeat(dir)
  }

  #onArrowUp = (): void => {
    this.#stopRepeat()
    this.pressed = null
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (this.isSubmitEnter(event)) {
      this.requestImplicitSubmit()
      return
    }
    if (this.isDisabled || this.readonly) return
    // Bare keys only — the APG spinbutton model. With a modifier held these
    // keys are *editing* commands in a text input (Shift+Home selects to the
    // start; the others move the caret or belong to the OS), so stepping on
    // them both rewrote the value and swallowed the edit. And while an IME
    // composition is open the arrows navigate the candidate list — stepping
    // there rewrote the input mid-composition. `isSubmitEnter` already knows
    // the composition half of this guard (see text-control.ts).
    if (
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return
    }
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        this.#stepBy(1)
        break
      case 'ArrowDown':
        event.preventDefault()
        this.#stepBy(-1)
        break
      case 'Home':
        if (this.min != null) {
          event.preventDefault()
          this.#commit(this.min)
        }
        break
      case 'End':
        if (this.max != null) {
          event.preventDefault()
          this.#commit(this.max)
        }
        break
      case ' ':
        // The one printable key that can never parse as a number: don't let
        // it type, or the field commits values like `'20 '` as text.
        event.preventDefault()
        break
      default:
        break
    }
  }

  #onInput = (event: Event): void => {
    this.value = (event.target as HTMLInputElement).value
    this.#emit('vf-input')
  }

  #onChange = (event: Event): void => {
    const raw = (event.target as HTMLInputElement).value
    const parsed = parseFloat(raw)
    // Normalize (clamp + round) on commit when numeric; otherwise keep as typed.
    this.value = Number.isNaN(parsed)
      ? raw
      : String(Number(this.#clamp(parsed).toFixed(decimalsOf(this.step))))
    this.#emit('vf-change')
    // See VfTextControlBase.handleChange: the inner change is composed: false.
    emitNative(this, 'change')
  }

  protected override render() {
    const disabled = this.isDisabled
    const current = this.#parse()
    return html`
      <div class=${this.wellClass}>
        <input
          part="input"
          class="vf-field"
          type="text"
          inputmode=${this.getAttribute('inputmode') ?? 'decimal'}
          role="spinbutton"
          autocomplete=${this.getAttribute('autocomplete') ?? 'off'}
          enterkeyhint=${this.forwardedAttr('enterkeyhint')}
          maxlength=${this.forwardedAttr('maxlength')}
          spellcheck=${this.forwardedAttr('spellcheck')}
          autocapitalize=${this.forwardedAttr('autocapitalize')}
          aria-label=${this.label || this.hostLabel || nothing}
          aria-describedby=${this.describedBy}
          aria-required=${this.required ? 'true' : nothing}
          aria-invalid=${this.validity.valid ? nothing : 'true'}
          aria-valuenow=${Number.isNaN(current) ? nothing : current}
          aria-valuemin=${this.min ?? nothing}
          aria-valuemax=${this.max ?? nothing}
          .value=${live(this.value)}
          placeholder=${this.placeholder}
          ?disabled=${disabled}
          ?readonly=${this.readonly}
          @input=${this.#onInput}
          @change=${this.#onChange}
          @keydown=${this.#onKeydown}
        />
      </div>
      <span class="stepper vf-snap" part="stepper">
        <svg viewBox="0 0 15 25" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">
          <path d=${STEPPER.d}></path>
          <path class=${classMap({ fill: true, on: this.pressed === 'up' })} d=${STEPPER_UP_FILL.d}></path>
          <path class=${classMap({ fill: true, on: this.pressed === 'down' })} d=${STEPPER_DOWN_FILL.d}></path>
        </svg>
        <span
          class="hit up"
          aria-hidden="true"
          @pointerdown=${this.#onArrowDown}
          @pointerup=${this.#onArrowUp}
          @pointercancel=${this.#onArrowUp}
          @lostpointercapture=${this.#onArrowUp}
        ></span>
        <span
          class="hit down"
          aria-hidden="true"
          @pointerdown=${this.#onArrowDown}
          @pointerup=${this.#onArrowUp}
          @pointercancel=${this.#onArrowUp}
          @lostpointercapture=${this.#onArrowUp}
        ></span>
      </span>
      ${this.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-number-field': VfNumberField
  }
}
