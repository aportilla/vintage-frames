import { css, html, nothing } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfDisplayDecls } from '../styles/base.js'
import { STEPPER, STEPPER_DOWN_FILL, STEPPER_UP_FILL } from '../glyphs.js'
import { ScaleController } from '../scale.js'
import { VfFormControl } from '../form-control.js'

/**
 * `<vf-number-field>` — a System 7 numeric entry field paired with the classic
 * "little arrows" stepper.
 *
 * A form-associated wrapper around a native `<input>` (white well, 1px black
 * border) plus the pixel-exact little-arrows control from the Classic Macintosh
 * UI Kit sprite. Clicking (or press-and-holding, with autorepeat) an arrow
 * steps the value by `step`, clamped to `min`/`max`; the held arrow fills solid
 * black, matching the kit's hollow→filled press convention. The field is a
 * `spinbutton`: ArrowUp/ArrowDown step, Home/End jump to min/max.
 *
 * @fires vf-input - On every keystroke. `detail: { value, valueAsNumber }`.
 * @fires vf-change - On commit or step. `detail: { value, valueAsNumber }`.
 *
 * @csspart input - The inner native `<input>`.
 * @csspart stepper - The little-arrows control.
 */
@customElement('vf-number-field')
export class VfNumberField extends VfFormControl {
  static override shadowRootOptions: ShadowRootInit = {
    ...VfFormControl.shadowRootOptions,
    delegatesFocus: true,
  }

  static override styles = [
    vfBase,
    css`
      :host {
        display: inline-flex;
        align-items: stretch;
        gap: calc(var(--vf-scale, 1) * 3px);
      }
      input {
        flex: 1 1 auto;
        width: var(--vf-number-field-width, 4em);
        min-width: 2em;
        padding: 0 calc(var(--vf-scale, 1) * 6px);
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        border-radius: 0;
        /* Editable text is set in the Chicago-style display face. */
        ${vfDisplayDecls}
        font-weight: var(--vf-font-weight, 700);
        line-height: inherit;
        color: var(--vf-black, #000);
        text-align: right;
        user-select: text;
        -webkit-user-select: text;
        outline: none;
      }
      /* Text inputs thicken their border on focus instead of a dotted ring. */
      input:focus {
        box-shadow: 0 0 0 calc(var(--vf-scale, 1) * 1px) var(--vf-black, #000);
      }
      input::placeholder {
        color: var(--vf-disabled, #c0c0c0);
        font-weight: inherit;
        opacity: 1;
      }
      /* Disabled: the value dims to gray; the black box + stepper stay black. */
      input:disabled {
        color: var(--vf-disabled, #c0c0c0);
        box-shadow: none;
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

  /** Current value as a string (submitted with forms). */
  @property() value = ''

  /** Minimum allowed value (inclusive). Omit for no lower bound. */
  @property({ type: Number }) min?: number

  /** Maximum allowed value (inclusive). Omit for no upper bound. */
  @property({ type: Number }) max?: number

  /** Increment applied per step / arrow press. Also sets the value's precision. */
  @property({ type: Number }) step = 1

  /** Placeholder text shown when the field is empty. */
  @property() placeholder = ''

  /** Read-only: focusable and editable-looking, but the value cannot change. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /** Accessible name, applied as `aria-label` on the inner input. */
  @property() label = ''

  /** Which arrow is currently held (drives the solid pressed glyph). */
  @state() private pressed: 'up' | 'down' | null = null

  @query('input') private input!: HTMLInputElement | null

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  private defaultValue = ''
  private defaultCaptured = false

  #delayTimer?: number
  #repeatTimer?: number

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultCaptured = true
      this.defaultValue = this.value
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#stopRepeat()
  }

  protected override updated(): void {
    this.syncFormValue(this.value)
  }

  /** Restores the initial value when the associated form resets. */
  formResetCallback(): void {
    this.value = this.defaultValue
  }

  // ------------------------------------------------------------ value math

  #parse(): number {
    return parseFloat(this.value)
  }

  #decimals(): number {
    const s = String(this.step)
    const dot = s.indexOf('.')
    return dot < 0 ? 0 : s.length - dot - 1
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
    const next = String(Number(this.#clamp(n).toFixed(this.#decimals())))
    if (next === this.value) return
    this.value = next
    this.#emit('vf-change')
  }

  #stepBy(dir: 1 | -1): void {
    if (this.isDisabled || this.readonly) return
    const cur = this.#parse()
    const next = Number.isNaN(cur) ? (this.min ?? 0) : cur + dir * this.step
    this.#commit(next)
  }

  #emit(type: 'vf-input' | 'vf-change'): void {
    this.dispatchEvent(
      new CustomEvent(type, {
        detail: { value: this.value, valueAsNumber: this.#parse() },
        bubbles: true,
        composed: true,
      })
    )
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
    if (
      event.key === 'Enter' &&
      !event.isComposing &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      this.internals.form?.requestSubmit()
      return
    }
    if (this.isDisabled || this.readonly) return
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
      : String(Number(this.#clamp(parsed).toFixed(this.#decimals())))
    this.#emit('vf-change')
  }

  protected override render() {
    const disabled = this.isDisabled
    const current = this.#parse()
    return html`
      <input
        part="input"
        type="text"
        inputmode="decimal"
        role="spinbutton"
        autocomplete="off"
        aria-label=${this.label || nothing}
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
      <span class="stepper" part="stepper">
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
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-number-field': VfNumberField
  }
}
