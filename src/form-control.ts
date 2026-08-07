import { html, LitElement, nothing, type PropertyValues } from 'lit'
import { property, state } from 'lit/decorators.js'

/**
 * Resolved text of a host-level IDREF attribute (`aria-labelledby` /
 * `aria-describedby`): each id is looked up in the host's own tree scope — the
 * scope the consumer wrote the reference in, and the one AccName itself would
 * search — and the targets' text joined in reference order. Empty when the
 * attribute is absent or nothing resolves.
 */
function idrefText(host: Element, attr: string): string {
  const refs = host.getAttribute(attr)
  if (!refs) return ''
  const root = host.getRootNode()
  if (!(root instanceof Document || root instanceof ShadowRoot)) return ''
  return refs
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => root.getElementById(id)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
}

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

  // ---------------------------------------------------- constraint validation

  /**
   * Requires a value before the associated form submits (SPEC §4): an empty
   * control fails constraint validation with `valueMissing`, exactly like a
   * native `required`. What "empty" means is each control's own
   * {@link valueMissing}; a control with no required semantics (a slider
   * always has a value, a swatch submits nothing) never fails it, the way a
   * native range input never does.
   */
  @property({ type: Boolean, reflect: true }) required = false

  /** The message {@link setCustomValidity} installed; `''` when clear. */
  #customError = ''

  /**
   * Installs a custom validity message — the native channel: a non-empty
   * string makes the control invalid with exactly that message, `''` clears
   * it.
   */
  setCustomValidity(message: string): void {
    this.#customError = message
    this.syncValidity()
    this.requestUpdate()
  }

  /** The control's current `ValidityState`, as on a native control. */
  get validity(): ValidityState {
    return this.internals.validity
  }

  /** The message of the currently failing constraint, `''` while valid. */
  get validationMessage(): string {
    return this.internals.validationMessage
  }

  /**
   * Whether the control is a candidate for constraint validation — false
   * while disabled or readonly, per HTML's barring rules (the browser
   * computes this from the reflected attributes).
   */
  get willValidate(): boolean {
    return this.internals.willValidate
  }

  /** True when the control satisfies its constraints; fires `invalid` if not. */
  checkValidity(): boolean {
    return this.internals.checkValidity()
  }

  /** {@link checkValidity} plus the browser's own error UI on failure. */
  reportValidity(): boolean {
    return this.internals.reportValidity()
  }

  /**
   * Whether the control is empty for `required`'s purposes. Overridden by the
   * controls a value can be missing from — `value === ''` on the fields, the
   * select and the radio group, unchecked on the checkbox. The default never
   * fails, which is what makes a bare `required` inert on the rest.
   */
  protected get valueMissing(): boolean {
    return false
  }

  /** The `valueMissing` message; subclasses match their native counterpart's. */
  protected get valueMissingMessage(): string {
    return 'Please fill out this field.'
  }

  /**
   * The single funnel every validity write goes through — the
   * {@link syncFormValue} shape, one place for the contract: the flags are
   * computed from the live properties (`required` × {@link valueMissing},
   * plus any custom error) and installed with `setValidity`, so `:invalid`
   * matches on the host and `form.reportValidity()` blocks exactly as it
   * would on a native control. Runs from {@link willUpdate}, before render,
   * so the same update's template reads fresh validity. Also mirrors
   * `aria-required`/`aria-invalid` through internals for the controls whose
   * role sits on the host — internals lose to a consumer's own host
   * attribute, which is the correct precedence direction.
   */
  protected syncValidity(): void {
    const valueMissing = this.required && this.valueMissing
    const message =
      this.#customError || (valueMissing ? this.valueMissingMessage : '')
    this.internals.setValidity(
      { customError: this.#customError !== '', valueMissing },
      message || undefined
    )
    this.internals.ariaRequired = this.required ? 'true' : null
    this.internals.ariaInvalid = this.internals.validity.valid ? null : 'true'
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    // Unconditional: the flags derive from whichever properties the
    // subclass's valueMissing reads, which this base class cannot enumerate.
    // Re-installing unchanged flags is cheap and re-renders nothing.
    this.syncValidity()
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

/**
 * {@link VfFormControl} plus the name/description bridge, for the controls
 * whose **role sits on a shadow-internal node** — `vf-button`, `vf-select`,
 * `vf-swatch`, and the three fields via `VfTextControlBase` (SPEC §4).
 *
 * That one structural fact is the whole membership rule. On those controls the
 * host is a generic wrapper AccName never consults, and a host-level IDREF
 * cannot reach into a shadow tree, so the platform's own words — `aria-label`,
 * `aria-labelledby`, `<label for>`, `aria-describedby` — land on nothing unless
 * something resolves them to text and hands them inward. This class is that
 * something.
 *
 * The controls whose role sits on the **host** (`vf-checkbox`,
 * `vf-radio-group`, `vf-slider`) deliberately stay on the plain base: the
 * platform reads their host attributes directly, so a bridge there would
 * duplicate a working channel — and an inherited property that renders nothing
 * is exactly the "advertised API that silently does nothing" this split exists
 * to make impossible. `verify:manifest` holds the line: a tag whose manifest
 * carries `description` must call {@link renderDescription} in its own source.
 */
export class VfShadowRoleControl extends VfFormControl {
  /**
   * The host-level ARIA attributes the bridge mirrors inward, observed so a
   * consumer writing one after upgrade re-renders the control. They are
   * deliberately not reactive properties: each has an IDL accessor on
   * `Element` already, and a Lit `@property` would shadow the platform member
   * (the kit's `align`/`draggable` trap) — so they are observed by name and
   * read at render time, the `forwardedAttributes` shape.
   */
  private static readonly bridgedAriaAttributes = [
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
  ]

  static override get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      ...VfShadowRoleControl.bridgedAriaAttributes,
    ]
  }

  override attributeChangedCallback(
    name: string,
    old: string | null,
    value: string | null
  ): void {
    super.attributeChangedCallback(name, old, value)
    if (VfShadowRoleControl.bridgedAriaAttributes.includes(name)) {
      this.requestUpdate()
    }
  }

  /**
   * Form-associated lifecycle: the association changed, so the `<label for>`
   * set feeding {@link hostLabel} may have too — re-render whatever mirrors it.
   */
  formAssociatedCallback(_form: HTMLFormElement | null): void {
    this.requestUpdate()
  }

  /**
   * The accessible name the *host* carries. A consumer's `aria-label`,
   * `aria-labelledby` or `<label for>` used to be silently inert on these
   * controls, so the bridge resolves them to text for the control to hand to
   * its inner focusable element. The explicit `label` property still wins:
   * templates read `this.label || this.hostLabel`.
   *
   * Precedence is html-aam's — `aria-labelledby`, then `aria-label`, then the
   * associated `<label for>` elements (`internals.labels`). Referenced text is
   * flattened at render time, so an edit to a referenced element's *text*
   * lands on the control's next render rather than instantly — the one
   * divergence from a native control, recorded in SPEC §4.
   */
  protected get hostLabel(): string {
    return (
      this.hostAriaLabel ||
      [...this.internals.labels]
        .map((label) => label.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
    )
  }

  /**
   * The ARIA half of {@link hostLabel} — `aria-labelledby`, then `aria-label`,
   * in html-aam's order — without the `<label for>` leg.
   *
   * Split out because that leg does not apply to every control. A `<button>`
   * is not a labelable element, so no caption names a native one and none
   * should name a `vf-button` either (`verify:names` asserts that a `vf-label
   * for=` leaves a button's own name alone). What a button DOES need is the
   * other half: on a control whose role sits on a shadow-internal node, a
   * consumer's `aria-label` is otherwise inert, because it lands on a generic
   * host AccName never consults — so an icon button labelled the ordinary way
   * was announced by its glyph.
   */
  protected get hostAriaLabel(): string {
    return (
      idrefText(this, 'aria-labelledby') ||
      this.getAttribute('aria-label')?.trim() ||
      ''
    )
  }

  /**
   * Description for the control — hint text, a format, a unit. A host-level
   * `aria-describedby` cannot reach a focusable element inside a shadow root,
   * so there was structurally no way to describe a field; this property is
   * that channel. It renders as a hidden span in the control's own shadow root
   * with the inner control's `aria-describedby` pointing at it — the
   * shadow-internal IDREF idiom `vf-dialog`'s title patch already uses. A
   * host-level `aria-describedby` is bridged into the same span when this
   * property is empty, and a failing constraint's {@link validationMessage}
   * joins it too, so AT hears the error where it hears the hint.
   *
   * Host-role controls get neither half: their `aria-describedby` already
   * works, and their validation message reaches AT the way a native control's
   * does — `aria-invalid` plus the browser's own validation UI, not AccName.
   */
  @property() description = ''

  /**
   * What {@link renderDescription}'s span carries: the current validation
   * message while the control is invalid, then the description (the property,
   * or the bridged host `aria-describedby` text).
   */
  protected get descriptionText(): string {
    return [
      this.internals.validity.valid ? '' : this.internals.validationMessage,
      this.description || idrefText(this, 'aria-describedby'),
    ]
      .filter(Boolean)
      .join(' ')
  }

  /**
   * `aria-describedby` value for the inner control — set only while the span
   * has something to say, so an idle control isn't announced as described by
   * nothing.
   */
  protected get describedBy(): string | typeof nothing {
    return this.descriptionText ? 'description' : nothing
  }

  /**
   * The hidden span the inner control's `aria-describedby` points at.
   * `hidden` keeps it out of the page; AccName still resolves `display: none`
   * reference targets (the fact vf-window's utility title patch leans on), so
   * the text reaches AT without painting.
   */
  protected renderDescription() {
    const text = this.descriptionText
    return text ? html`<span id="description" hidden>${text}</span>` : nothing
  }
}
