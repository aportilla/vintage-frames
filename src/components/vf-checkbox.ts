import { css, html, type PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay, vfFocusUnderline, vfToggle } from '../styles/base.js'
import { CHECKBOX_X, glyphSvg } from '../glyphs.js'
import { VfFormControl } from '../form-control.js'
import { VfToggleControl } from '../toggle-control.js'
import { emit, emitNative } from '../events.js'

/**
 * The classic System 7 checkbox: a 13×13 white square with a 1px black
 * border whose checked state is the corner-to-corner ✕ glyph — the pixel-exact
 * cross traced from the Classic Macintosh UI Kit sprite. The border "thickens"
 * while pressed, exactly like the original control.
 *
 * Form-associated: submits `value` under `name` when checked (like a native
 * checkbox) and restores its initial checked state on form reset. Toggles on
 * click and Space.
 *
 * @slot - The label, rendered to the right of the box with a 6px gap.
 * @csspart box - The 13×13 checkbox square.
 * @csspart label - The label wrapper around the slot.
 * @fires vf-change - When toggled by user interaction. `detail: { checked: boolean }`.
 * @fires input - Native event, dispatched from the host per user toggle (with
 *   `change`, the pair a native checkbox fires). A programmatic `checked` set
 *   fires nothing, as on a native checkbox.
 * @fires change - Native event, dispatched from the host per user toggle so
 *   form delegation and framework bindings hear it.
 */
@vfElement('vf-checkbox')
export class VfCheckbox extends VfToggleControl(VfFormControl) {
  static override styles = [
    vfBase,
    vfDisplay,
    vfToggle,
    css`
      /* Keyboard focus underlines the box itself — not the label, and not a
         ring around either (see vfFocusUnderline). Both adjustments below are
         the 1px border: an absolutely positioned pseudo sizes to the PADDING
         box, which the border sits outside of. So the rule grows 1px each side
         to span the whole well, and its offset counts the border before the
         blank row and the rule itself: −(1 + 1 + 1). */
      :host(:focus-visible) .box::after {
        --vf-focus-underline-offset: -3px;
        ${vfFocusUnderline}
        left: calc(var(--vf-scale, 1) * -1px);
        right: calc(var(--vf-scale, 1) * -1px);
      }
      .box {
        position: relative;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: calc(var(--vf-scale, 1) * 13px);
        height: calc(var(--vf-scale, 1) * 13px);
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        color: var(--vf-black, #000);
      }
      /* Pressed: border thickens to 2px (classic press feedback). */
      :host(:active) .box:not(.dim) {
        box-shadow: inset 0 0 0 calc(var(--vf-scale, 1) * 1px) var(--vf-black, #000);
      }
      /* Native 12×12 sprite — centered in the 13×13 box; the glyph's own 1px
         transparent margin lets it overhang onto the border harmlessly. Scales
         with the box; crispEdges keeps it whole-device-pixel at any dpr. */
      .check {
        flex: none;
        width: calc(var(--vf-scale, 1) * 12px);
        height: calc(var(--vf-scale, 1) * 12px);
        display: none;
        color: inherit;
      }
      :host([checked]) .check {
        display: block;
      }
    `,
  ]

  /** Whether the checkbox is checked. */
  @property({ type: Boolean, reflect: true }) override checked = false

  /** Form field name used when submitting. */
  @property({ reflect: true }) name = ''

  /** Value submitted with the form while checked. */
  @property() value = 'on'

  constructor() {
    super()
    this.internals.role = 'checkbox'
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.latchFormDefault(this.checked)
  }

  /** The handle {@link VfFormControl} already attached. */
  protected override get toggleInternals(): ElementInternals {
    return this.internals
  }

  /** `disabled`, or an ancestor `<fieldset disabled>`. */
  protected override get toggleDisabled(): boolean {
    return this.isDisabled
  }

  override render() {
    const dim = this.isDisabled
    return html`
      <span
        class=${classMap({ box: true, dim, 'vf-snap': true })}
        part="box"
        aria-hidden="true"
      >
        ${glyphSvg(CHECKBOX_X, 'check')}
      </span>
      <span class=${classMap({ label: true, dim, 'vf-snap': true })} part="label">
        <slot></slot>
      </span>
    `
  }

  protected override updated(changed: PropertyValues<this>): void {
    // ARIA + tabindex mirroring comes from VfToggleControl.
    super.updated(changed)
    // Re-submit only when the submission's inputs changed — checked/value, or
    // the resolved disabled state that gates it (same shape as
    // VfTextControlBase.updated; disabledChanged covers the ancestor
    // <fieldset disabled> path a plain `changed.has('disabled')` misses).
    if (changed.has('checked') || changed.has('value') || this.disabledChanged(changed)) {
      this.syncFormValue(this.checked ? this.value : null)
    }
  }

  /** Form-associated lifecycle: restores the initial checked state. */
  formResetCallback(): void {
    this.checked = this.formDefault(false)
  }

  /**
   * Restored form state means the flag, not `value`: a checkbox only ever
   * stores its submission string while checked, so getting one back IS
   * "checked" (the base default would have overwritten `value` instead).
   */
  protected override applyFormState(): void {
    this.checked = true
  }

  /** Click/Space on an enabled checkbox flips it. */
  protected override activate(): void {
    this.checked = !this.checked
    this.focus()
    emit(this, 'vf-change', { checked: this.checked })
    emitNative(this, 'input')
    emitNative(this, 'change')
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-checkbox': VfCheckbox
  }
}
