import { nothing } from 'lit'
import type { PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { ScaleController } from './scale.js'
import { GridSnapController } from './grid-snap.js'
import { VfFormControl } from './form-control.js'
import { FocusRuleController } from './focus-modality.js'
import { emit, emitNative } from './events.js'

/**
 * Shared base for the kit's editable text fields — `vf-text-field`,
 * `vf-text-area` and `vf-number-field`. Builds on {@link VfFormControl} (form
 * association + the disabled-value guard) and adds the value/label scaffolding
 * every field repeated: the reflected `name`, the `value`/`placeholder`/
 * `readonly`/`label` props, the captured default restored on form reset, the
 * `updated()` → {@link VfFormControl.syncFormValue} funnel, and the display-
 * scaling controller. Pairs with the `vfField` css fragment (the white-well
 * skin) in styles/base.ts.
 *
 * Subclasses render their own native control (`<input>`/`<textarea>` plus any
 * adornments), tag it `class="vf-field"`, and may enrich the emitted event
 * detail via {@link emitValue}.
 */
export class VfTextControlBase extends VfFormControl {
  /** Focus delegates into the inner native control. */
  static override shadowRootOptions: ShadowRootInit = {
    ...VfFormControl.shadowRootOptions,
    delegatesFocus: true,
  }

  /** Current value. Synced on every keystroke and submitted with forms. */
  @property() value = ''

  /** Placeholder text shown when the field is empty. */
  @property() placeholder = ''

  /** Makes the field read-only (focusable, not editable). */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /**
   * Accessible name, applied as `aria-label` on the inner native control (which
   * receives focus and is announced by screen readers — an `aria-label` on the
   * host does not reach into the shadow DOM).
   */
  @property() label = ''

  /**
   * Host attributes forwarded verbatim onto the inner native control — the
   * input-behavior vocabulary the platform only honors on the element that
   * actually takes the input. `<vf-text-field autocomplete="email">` used to
   * put the token on a custom element the browser ignores for autofill while
   * the shadow `<input>` never received it; same story for the mobile-keyboard
   * pair (`inputmode`, `enterkeyhint`) and the rest. These are deliberately
   * *not* reactive properties: four of them are global attributes with IDL
   * accessors already on `HTMLElement` (`spellcheck`, `autocapitalize`,
   * `inputMode`, `enterKeyHint`), and a Lit `@property` would shadow the
   * platform member — the kit's own `align`/`draggable` trap. Instead the
   * attributes are observed (see `observedAttributes`) and read at render
   * time via {@link forwardedAttr}. Subclasses may extend the list
   * (`vf-text-field` adds `pattern`) or override a default in their template
   * (`vf-number-field` keeps `inputmode="decimal"` unless told otherwise).
   */
  protected static readonly forwardedAttributes: readonly string[] = [
    'autocomplete',
    'inputmode',
    'enterkeyhint',
    'maxlength',
    'spellcheck',
    'autocapitalize',
  ]

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, ...this.forwardedAttributes]
  }

  override attributeChangedCallback(
    name: string,
    old: string | null,
    value: string | null
  ): void {
    super.attributeChangedCallback(name, old, value)
    const forwarded = (this.constructor as typeof VfTextControlBase)
      .forwardedAttributes
    if (forwarded.includes(name)) this.requestUpdate()
  }

  /**
   * The forwarded value of a host attribute for the inner control's template
   * binding, or `nothing` (remove the attribute) while the host doesn't
   * carry it.
   */
  protected forwardedAttr(name: string): string | typeof nothing {
    return this.getAttribute(name) ?? nothing
  }

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  protected readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  protected readonly gridSnap = new GridSnapController(this)

  /**
   * Whether the well wears the kit's dashed focus rule — keyboard focus only.
   * See {@link FocusRuleController} for why a field cannot get this from
   * `:focus-visible` the way most of the kit does. Typing does NOT reveal the
   * rule after a click: the click already showed where the insertion point
   * went, which is the whole reason a field marks keyboard focus and not every
   * focus, so the field never calls the controller's `reveal()`.
   */
  protected readonly focusRule = new FocusRuleController(this)

  /**
   * Classes for the `.vf-field-well` wrapper every field renders around its
   * native control: the shared skin hook (`vfField`), the grid-snap target, and
   * the focus rule's own gate. Assembled here so the three fields state the
   * wrapper once and can't drift on what turns the rule on.
   */
  protected get wellClass(): string {
    return `vf-field-well vf-snap${this.focusRule.marked ? ' vf-focus-rule' : ''}`
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.latchFormDefault(this.value)
  }

  /**
   * Re-submit the value only when it (or the disabled state gating it) actually
   * changed. Unrelated re-renders would otherwise re-run this — `vf-number-field`
   * re-renders on every stepper press and release for its `pressed` state alone.
   * On the first update `value` is in `changed` (class-field defaults are, with
   * `undefined` as the old value), so the initial form value is still set.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('value') || this.disabledChanged(changed)) {
      this.syncFormValue(this.value)
    }
  }

  /** Restores the initial value when the associated form resets. */
  formResetCallback(): void {
    this.value = this.formDefault('')
  }

  /**
   * True for a plain Enter press (no modifiers, not IME-composing) — the key
   * that triggers a form's implicit submission. The native control is
   * shadow-encapsulated (null form owner), so single-line fields call
   * `internals.form?.requestSubmit()` themselves; this centralises the guard.
   */
  protected isSubmitEnter(event: KeyboardEvent): boolean {
    return (
      event.key === 'Enter' &&
      !event.isComposing &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    )
  }

  /**
   * Emulates the form's implicit submission for a plain Enter press. HTML
   * defines it as *activating the form's default button* — the first submit
   * button in tree order — so the submission carries that button's submitter
   * identity and name/value. A bare `requestSubmit()` carries neither
   * (`event.submitter === null`), which made Enter and a click on the same
   * form produce different payloads. `click()` is the activation: a native
   * button becomes the real submitter, and a `vf-button` forwards it to its
   * inner button, which runs the same transient-proxy path a pointer does. A
   * disabled default button means no submission at all, as in HTML; a form
   * with no submit button falls back to the bare call, also as in HTML.
   */
  protected requestImplicitSubmit(): void {
    const form = this.internals.form
    if (!form) return
    const defaultButton = [...form.elements].find(
      (el) =>
        (el instanceof HTMLButtonElement && el.type === 'submit') ||
        (el instanceof HTMLInputElement &&
          (el.type === 'submit' || el.type === 'image')) ||
        (el.localName === 'vf-button' &&
          (el as { type?: string }).type === 'submit')
    )
    if (defaultButton) {
      if (defaultButton.matches(':disabled')) return
      ;(defaultButton as HTMLElement).click()
      return
    }
    form.requestSubmit()
  }

  /**
   * Dispatch a bubbling, composed value event (SPEC §4). Text fields use the
   * default `{ value }` detail; `vf-number-field` passes an enriched detail that
   * also carries `valueAsNumber`.
   */
  protected emitValue(
    type: 'vf-input' | 'vf-change',
    detail: Record<string, unknown> = { value: this.value }
  ): void {
    emit(this, type, detail)
  }

  /** Mirror the native control's value into `value` and announce a keystroke. */
  protected handleInput(event: Event): void {
    this.value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
    this.emitValue('vf-input')
  }

  /** Mirror the native control's value into `value` and announce a commit. */
  protected handleChange(event: Event): void {
    this.value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
    this.emitValue('vf-change')
    // The inner control's own `change` never leaves the shadow root (native
    // change is composed: false, unlike input's) — re-dispatch it from the
    // host so form-level delegation and framework bindings hear the commit.
    emitNative(this, 'change')
  }
}
