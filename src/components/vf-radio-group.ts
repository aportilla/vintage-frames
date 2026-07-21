import { css, html, LitElement } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'
import { VfRadio } from './vf-radio.js'

/**
 * Groups `vf-radio` children, owning selection, keyboard navigation and the
 * form value. Renders no chrome of its own; directly slotted radios stack
 * vertically with a 6px gap (override with your own layout if needed —
 * arbitrary markup containing radios also works).
 *
 * Form-associated: submits `value` under `name`, restores the initial value
 * on form reset. Keeps children in sync — the child whose `value` matches
 * the group's `value` is checked, all others unchecked.
 *
 * Keyboard (classic Mac behavior): the group is one tab stop (roving
 * tabindex on the selected radio); ArrowUp/ArrowLeft and
 * ArrowDown/ArrowRight move the selection AND select it, wrapping around
 * and skipping disabled radios.
 *
 * @slot - `vf-radio` elements, or arbitrary markup containing them.
 * @fires vf-change - When the selection changes via user interaction. `detail: { value: string }`.
 */
@customElement('vf-radio-group')
export class VfRadioGroup extends LitElement {
  /** Participates in native forms via ElementInternals. */
  static formAssociated = true

  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
      }
      ::slotted(vf-radio) {
        display: flex;
      }
      ::slotted(vf-radio:not(:first-child)) {
        margin-top: 6px;
      }
    `,
  ]

  /**
   * The value of the selected radio. An empty string means no selection
   * (and nothing is submitted with the form).
   */
  @property() value = ''

  /** Form field name used when submitting. */
  @property({ reflect: true }) name = ''

  /** Disables the whole group: all radios dim and become non-interactive. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** True while an ancestor `<fieldset disabled>` disables this control. */
  @state() private formDisabled = false

  private readonly internals: ElementInternals

  /** Value at first connect, restored on form reset. */
  private defaultValue: string | null = null

  constructor() {
    super()
    this.internals = this.attachInternals()
    this.internals.role = 'radiogroup'
    this.addEventListener('keydown', this.handleKeydown)
    this.addEventListener('vf-change', this.handleRadioChange)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.defaultValue === null) this.defaultValue = this.value
  }

  override render() {
    return html`<slot @slotchange=${this.handleSlotChange}></slot>`
  }

  protected override updated(): void {
    this.internals.setFormValue(this.value === '' ? null : this.value)
    this.internals.ariaDisabled = this.isDisabled ? 'true' : 'false'
    this.syncRadios()
  }

  /**
   * Form-associated lifecycle: called by the browser when the element is
   * disabled or re-enabled by an ancestor (e.g. `<fieldset disabled>`).
   */
  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  /** Form-associated lifecycle: restores the initial value. */
  formResetCallback(): void {
    this.value = this.defaultValue ?? ''
  }

  private get isDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  /** All descendant radios belonging to this group (nested groups excluded). */
  private get radios(): VfRadio[] {
    return [...this.querySelectorAll<VfRadio>('vf-radio')].filter(
      (radio) => radio.closest('vf-radio-group') === this
    )
  }

  /**
   * Push group state down to the children: checked flags, group-disabled
   * dimming, and the roving tabindex (the checked radio is the tab stop;
   * with no selection, the first enabled radio is).
   */
  private syncRadios(): void {
    const radios = this.radios
    const disabled = this.isDisabled
    const checked =
      this.value === ''
        ? undefined
        : radios.find((radio) => radio.value === this.value)
    let tabStop = checked && !checked.disabled ? checked : undefined
    if (!tabStop) tabStop = radios.find((radio) => !radio.disabled)
    for (const radio of radios) {
      radio.checked = radio === checked
      radio.groupDisabled = disabled
      radio.tabIndex = !disabled && radio === tabStop ? 0 : -1
    }
  }

  /** Select a radio, sync everything, and fire `vf-change` if value changed. */
  private selectRadio(radio: VfRadio, focus: boolean): void {
    const changed = this.value !== radio.value
    this.value = radio.value
    this.syncRadios()
    if (focus) radio.focus()
    if (changed) {
      this.dispatchEvent(
        new CustomEvent<{ value: string }>('vf-change', {
          detail: { value: this.value },
          bubbles: true,
          composed: true,
        })
      )
    }
  }

  /** A child radio was clicked or Space-selected: adopt it. */
  private handleRadioChange = (event: Event): void => {
    const radio = event.target
    if (radio === this || !(radio instanceof VfRadio)) return
    if (radio.closest('vf-radio-group') !== this) return
    if (this.isDisabled || radio.disabled) return
    this.selectRadio(radio, false)
  }

  /** Arrow keys move the selection AND select (classic Mac behavior). */
  private handleKeydown = (event: KeyboardEvent): void => {
    if (this.isDisabled) return
    const key = event.key
    let delta = 0
    if (key === 'ArrowDown' || key === 'ArrowRight') delta = 1
    else if (key === 'ArrowUp' || key === 'ArrowLeft') delta = -1
    else return
    event.preventDefault()
    const enabled = this.radios.filter((radio) => !radio.disabled)
    if (enabled.length === 0) return
    const current =
      event.target instanceof VfRadio
        ? event.target
        : this.radios.find((radio) => radio.checked)
    const index = current ? enabled.indexOf(current) : -1
    const nextIndex =
      index === -1
        ? delta > 0
          ? 0
          : enabled.length - 1
        : (index + delta + enabled.length) % enabled.length
    const next = enabled[nextIndex]
    if (next) this.selectRadio(next, true)
  }

  private handleSlotChange = (): void => {
    // If the group has no value but the markup pre-checked a radio, adopt
    // its value (and treat it as the form-reset default).
    if (this.value === '') {
      const preChecked = this.radios.find((radio) => radio.checked)
      if (preChecked && preChecked.value !== '') {
        this.value = preChecked.value
        if (this.defaultValue === null || this.defaultValue === '') {
          this.defaultValue = this.value
        }
      }
    }
    this.syncRadios()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-radio-group': VfRadioGroup
  }
}
