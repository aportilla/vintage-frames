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
   * Form-associated lifecycle: the browser calls this when this control's
   * disabled state changes — an ancestor `<fieldset disabled>`, or the
   * element's OWN `disabled` attribute (the browser counts both).
   *
   * Also mirrored as the `form-disabled` custom state: `disabled` reflects as
   * an attribute a stylesheet can see, but a `<fieldset disabled>` ancestor
   * lands here in otherwise-private state — `:state(form-disabled)` is the
   * one selector that lets consumer CSS style that case. Optional-chained for
   * engines without `CustomStateSet`.
   */
  formDisabledCallback(disabled: boolean): void {
    const changed = this.formDisabled !== disabled
    this.formDisabled = disabled
    if (disabled) this.internals.states?.add('form-disabled')
    else this.internals.states?.delete('form-disabled')
    // The own-attribute path arrives at the worst possible moment: Lit's
    // attribute reflection runs INSIDE ReactiveElement.update() — after the
    // template was computed, inside the window where Lit's contract is that
    // property sets do not schedule another update (__markUpdated wipes
    // them). So the `formDisabled` write above is silently dropped from
    // reactivity, and a control re-enabled via `el.disabled = false` kept
    // its shadow control rendered disabled until some unrelated re-render.
    // Re-request from a microtask, outside the doomed window. Argument-less
    // on purpose: the follow-up update re-renders with the (already
    // correct) live fields but carries an empty changed-map, so the
    // `updated()` gates don't re-run form work a second time.
    if (changed && this.isUpdatePending) {
      queueMicrotask(() => this.requestUpdate())
    }
  }

  /**
   * Form-associated lifecycle: the browser hands back state it stored for
   * this control — a bfcache/session restore, or a browser autofill pass.
   * The kit's controls all submit through single-argument `setFormValue`, so
   * the stored state IS the last submitted string. Without this callback,
   * every native input in the form repopulates on restore while the `vf-*`
   * controls silently keep their defaults.
   */
  formStateRestoreCallback(
    state: string | File | FormData | null,
    _mode: 'restore' | 'autofill'
  ): void {
    if (typeof state === 'string') this.applyFormState(state)
  }

  /**
   * Maps stored form state back onto the control's own value semantics. The
   * default covers the string-valued majority (the fields, `vf-select`,
   * `vf-radio-group`); `vf-checkbox` (a checked flag) and `vf-slider` (a
   * number) override.
   */
  protected applyFormState(state: string): void {
    ;(this as { value?: string }).value = state
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
