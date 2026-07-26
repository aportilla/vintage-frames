import { LitElement, type PropertyValues } from 'lit'
import { property, state } from 'lit/decorators.js'

/**
 * Shared base for the kit's form-associated controls (SPEC §4).
 *
 * Owns the boilerplate every one of them repeated: the `ElementInternals`
 * handle, the reflected `disabled` property, the `formDisabled` state fed by
 * `formDisabledCallback` (an ancestor `<fieldset disabled>`), the resolved
 * {@link isDisabled} getter, the form-reset default latch
 * ({@link latchFormDefault} / {@link formDefault}), and — crucially — the
 * disabled-guarded {@link syncFormValue} funnel every subclass routes its
 * `setFormValue` through, so a disabled control can never leak a value into
 * submission.
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

  /**
   * The value {@link formDefault} hands back for the subclass's
   * `formResetCallback`. `unknown` because each control latches its own value
   * type (string, number, boolean); {@link formDefault} casts it back out.
   */
  #formDefault: unknown
  #formDefaultLatched = false

  /**
   * Capture the control's form-reset default. Only the first call latches, so
   * lifecycle paths that can run more than once — reconnects, repeated
   * slotchanges — may call it unconditionally. WHEN to call it is each
   * control's own contract: most latch on first connect, `vf-select` waits
   * until options exist, `vf-radio-group` lets a pre-checked radio adopted on
   * slotchange claim an unauthored default.
   */
  protected latchFormDefault(value: unknown): void {
    if (this.#formDefaultLatched) return
    this.#formDefaultLatched = true
    this.#formDefault = value
  }

  /**
   * The latched form-reset default, or `fallback` while nothing has latched.
   * The cast is sound because a control only ever latches its own value type.
   */
  protected formDefault<T>(fallback: T): T {
    return this.#formDefaultLatched ? (this.#formDefault as T) : fallback
  }

  /**
   * True when this update changed the *resolved* disabled state — the gate a
   * subclass's `updated()` should use before re-running its form value, ARIA
   * or tab-stop writes.
   *
   * It exists because {@link formDisabled} is protected, so `keyof this` can't
   * name it and a `PropertyValues<this>` gate silently can't test for it: a
   * `changed.has('disabled')` check compiles, reads as complete, and misses
   * every ancestor `<fieldset disabled>` — which is the path that must clear a
   * control's submitted value. One named predicate keeps that trap in one
   * place instead of in each subclass's gate.
   */
  protected disabledChanged(changed: PropertyValues): boolean {
    return changed.has('disabled') || changed.has('formDisabled')
  }
}
