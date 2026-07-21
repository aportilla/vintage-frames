import { css, html, LitElement, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfDisplayDecls } from '../styles/base.js'

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
export class VfTextField extends LitElement {
  /** Participate in native forms via ElementInternals. */
  static formAssociated = true

  static override shadowRootOptions: ShadowRootInit = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  }

  static override styles = [
    vfBase,
    css`
      :host {
        display: inline-block;
      }
      input {
        display: block;
        width: 100%;
        height: var(--vf-control-height, 22px);
        padding: 0 6px;
        background: var(--vf-white, #fff);
        border: 1px solid var(--vf-black, #000);
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
        box-shadow: 0 0 0 1px var(--vf-black, #000);
      }
      input::placeholder {
        color: var(--vf-disabled, #808080);
        font-weight: inherit;
        opacity: 1;
      }
      /* Disabled: the text dims to gray; the solid black box border stays. */
      input:disabled {
        color: var(--vf-disabled, #808080);
        box-shadow: none;
      }
    `,
  ]

  /** Current text value. Synced on every keystroke and submitted with forms. */
  @property() value = ''

  /** Placeholder text shown when the field is empty. */
  @property() placeholder = ''

  /** Disables the field: gray text; the black border stays; no interaction, no form value. */
  @property({ type: Boolean, reflect: true }) disabled = false

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

  /** True while an ancestor `<fieldset disabled>` disables this control. */
  @state() private formDisabled = false

  private readonly internals: ElementInternals = this.attachInternals()

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
    const disabled = this.disabled || this.formDisabled
    this.internals.setFormValue(disabled ? null : this.value)
  }

  /** Called by the form owner when the element's disabled state changes. */
  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  /** Restores the initial value when the associated form resets. */
  formResetCallback(): void {
    this.value = this.defaultValue
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
        ?disabled=${this.disabled || this.formDisabled}
        ?readonly=${this.readonly}
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
