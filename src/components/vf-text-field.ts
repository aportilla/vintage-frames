import { css, html, nothing } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfDisplayDecls } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { VfFormControl } from '../form-control.js'

/**
 * `<vf-text-field>` — a System 7 single-line text entry field.
 *
 * A form-associated wrapper around a native `<input>`: white well, 1px solid
 * black border, no corner radius. Focus thickens the border (no dotted
 * outline, per SPEC §1/§5).
 *
 * @fires vf-input - On every keystroke. `detail: { value: string }`.
 * @fires vf-change - On commit (native `change`). `detail: { value: string }`.
 *
 * @csspart input - The inner native `<input>` element.
 */
@customElement('vf-text-field')
export class VfTextField extends VfFormControl {
  static override shadowRootOptions: ShadowRootInit = {
    ...VfFormControl.shadowRootOptions,
    delegatesFocus: true,
  }

  static override styles = [
    vfBase,
    css`
      :host {
        display: inline-block;
        /* A sensible default width (authored system px, scaled) so a bare field
           doesn't collapse; the inner control fills it. Override with a width
           on the host or the --vf-field-width token. */
        width: calc(var(--vf-scale, 1) * var(--vf-field-width, 180px));
      }
      input {
        display: block;
        width: 100%;
        height: calc(var(--vf-scale, 1) * var(--vf-control-height, 22px));
        padding: 0 calc(var(--vf-scale, 1) * 6px);
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        border-radius: 0;
        /* Editable text is set in the Chicago-style display face. */
        ${vfDisplayDecls}
        font-weight: var(--vf-font-weight, 700);
        line-height: inherit;
        color: var(--vf-black, #000);
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
      /* Disabled: the text dims to gray; the solid black box border stays. */
      input:disabled {
        color: var(--vf-disabled, #c0c0c0);
        box-shadow: none;
      }
    `,
  ]

  /** Current text value. Synced on every keystroke and submitted with forms. */
  @property() value = ''

  /** Placeholder text shown when the field is empty. */
  @property() placeholder = ''

  /** Makes the field read-only (focusable, not editable). */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Input type, passed through to the native input (e.g. `password`). */
  @property() type = 'text'

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /**
   * Accessible name for the field, rendered as `aria-label` on the inner
   * native input (which is what receives focus and is announced by screen
   * readers — an `aria-label` on the host does not reach into the shadow DOM).
   */
  @property() label = ''

  private readonly scale = new ScaleController(this)

  /** Value restored by `formResetCallback`; captured on first connect. */
  private defaultValue = ''
  private defaultCaptured = false

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultCaptured = true
      this.defaultValue = this.value
    }
  }

  protected override updated(): void {
    this.syncFormValue(this.value)
  }

  /** Restores the initial value when the associated form resets. */
  formResetCallback(): void {
    this.value = this.defaultValue
  }

  /**
   * Enter in a single-line field triggers the associated form's implicit
   * submission. The native `<input>` is shadow-encapsulated, so its form owner
   * is null and the browser won't do this itself.
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (
      event.key === 'Enter' &&
      !event.isComposing &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      this.internals.form?.requestSubmit()
    }
  }

  private handleInput(event: Event): void {
    this.value = (event.target as HTMLInputElement).value
    this.dispatchEvent(
      new CustomEvent('vf-input', {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      })
    )
  }

  private handleChange(event: Event): void {
    this.value = (event.target as HTMLInputElement).value
    this.dispatchEvent(
      new CustomEvent('vf-change', {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      })
    )
  }

  protected override render() {
    return html`
      <input
        part="input"
        type=${this.type}
        aria-label=${this.label || nothing}
        .value=${live(this.value)}
        placeholder=${this.placeholder}
        ?disabled=${this.isDisabled}
        ?readonly=${this.readonly}
        @keydown=${this.handleKeydown}
        @input=${this.handleInput}
        @change=${this.handleChange}
      />
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-text-field': VfTextField
  }
}
