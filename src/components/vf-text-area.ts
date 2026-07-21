import { css, html, LitElement } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfDisplayDecls } from '../styles/base.js'
import { ScaleController } from '../scale.js'

/**
 * `<vf-text-area>` — a System 7 multi-line text entry field.
 *
 * Identical styling to `<vf-text-field>` but wrapping a native `<textarea>`.
 * No resize grip (`resize: none`) — System 7 fields don't resize.
 *
 * @fires vf-input - On every keystroke. `detail: { value: string }`.
 * @fires vf-change - On commit (native `change`). `detail: { value: string }`.
 *
 * @csspart textarea - The inner native `<textarea>` element.
 */
@customElement('vf-text-area')
export class VfTextArea extends LitElement {
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
      textarea {
        display: block;
        width: 100%;
        padding: calc(var(--vf-scale, 1) * 3px) calc(var(--vf-scale, 1) * 6px);
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        border-radius: 0;
        resize: none;
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
      textarea:focus {
        box-shadow: 0 0 0 calc(var(--vf-scale, 1) * 1px) var(--vf-black, #000);
      }
      textarea::placeholder {
        color: var(--vf-disabled, #808080);
        font-weight: inherit;
        opacity: 1;
      }
      /* Disabled: the text dims to gray; the solid black box border stays. */
      textarea:disabled {
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

  /** Number of visible text rows (native `rows`). Default 4. */
  @property({ type: Number }) rows = 4

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /** True while an ancestor `<fieldset disabled>` disables this control. */
  @state() private formDisabled = false

  private readonly scale = new ScaleController(this)

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
    this.value = (event.target as HTMLTextAreaElement).value
    this.dispatchEvent(
      new CustomEvent('vf-input', {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      })
    )
  }

  private handleChange(event: Event): void {
    this.value = (event.target as HTMLTextAreaElement).value
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
      <textarea
        part="textarea"
        rows=${this.rows}
        .value=${live(this.value)}
        placeholder=${this.placeholder}
        ?disabled=${this.disabled || this.formDisabled}
        ?readonly=${this.readonly}
        @input=${this.handleInput}
        @change=${this.handleChange}
      ></textarea>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-text-area': VfTextArea
  }
}
