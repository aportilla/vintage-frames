import { LitElement } from 'lit'
import { property, state } from 'lit/decorators.js'

/**
 * Shared base for the kit's form-associated controls (SPEC §4).
 *
 * Owns the boilerplate every one of them repeated: the `ElementInternals`
 * handle, the reflected `disabled` property, the `formDisabled` state fed by
 * `formDisabledCallback` (an ancestor `<fieldset disabled>`), the resolved
 * {@link isDisabled} getter, and — crucially — the disabled-guarded
 * {@link syncFormValue} funnel every subclass routes its `setFormValue`
 * through, so a disabled control can never leak a value into submission.
 *
 * Subclasses supply their own value semantics, ARIA and (where needed) a
 * `formResetCallback` restoring their captured default.
 */
export class VfFormControl extends LitElement {
  /** Participates in native forms via ElementInternals. */
  static formAssociated = true

  /** Form + ARIA internals; attached once here for every subclass. */
  protected readonly internals: ElementInternals = this.attachInternals()

  /**
   * Disables the control: it stops responding and submits no value. Each
   * control dims per SPEC §1 (typically the label greys while the 1-bit chrome
   * stays black).
   */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** True while an ancestor `<fieldset disabled>` disables this control. */
  @state() protected formDisabled = false

  /** Effective disabled state: the `disabled` prop OR an ancestor fieldset. */
  get isDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  /**
   * Form-associated lifecycle: the browser calls this when an ancestor (e.g.
   * `<fieldset disabled>`) disables or re-enables this control.
   */
  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  /**
   * Submit `value` under the control's `name` — unless the control is disabled,
   * in which case nothing is submitted (SPEC §4). The single guarded funnel for
   * every subclass's form value, so the disabled contract holds in one place.
   */
  protected syncFormValue(value: string | File | FormData | null): void {
    this.internals.setFormValue(this.isDisabled ? null : value)
  }
}
