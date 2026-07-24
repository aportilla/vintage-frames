import { property } from 'lit/decorators.js'
import { ScaleController } from './scale.js'
import { VfFormControl } from './form-control.js'

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

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  protected readonly scale = new ScaleController(this)

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
   * Dispatch a bubbling, composed value event (SPEC §4). Text fields use the
   * default `{ value }` detail; `vf-number-field` passes an enriched detail that
   * also carries `valueAsNumber`.
   */
  protected emitValue(
    type: 'vf-input' | 'vf-change',
    detail: Record<string, unknown> = { value: this.value }
  ): void {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true })
    )
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
  }
}
