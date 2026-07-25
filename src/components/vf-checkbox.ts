import { css, html, type PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay, vfFocusRing, vfToggle } from '../styles/base.js'
import { CHECKBOX_X, glyphSvg } from '../glyphs.js'
import { VfFormControl } from '../form-control.js'
import { VfToggleControl } from '../toggle-control.js'
import { emit } from '../events.js'

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
 */
@customElement('vf-checkbox')
export class VfCheckbox extends VfToggleControl(VfFormControl) {
  static override styles = [
    vfBase,
    vfDisplay,
    vfToggle,
    css`
      /* Focus ring around the box only, not the label. */
      :host(:focus-visible) .box {
        ${vfFocusRing}
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

  /** Checked state at first connect, restored on form reset. */
  private defaultChecked: boolean | null = null

  constructor() {
    super()
    this.internals.role = 'checkbox'
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.defaultChecked === null) this.defaultChecked = this.checked
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
      <span class=${classMap({ box: true, dim })} part="box" aria-hidden="true">
        ${glyphSvg(CHECKBOX_X, 'check')}
      </span>
      <span class=${classMap({ label: true, dim })} part="label">
        <slot></slot>
      </span>
    `
  }

  protected override updated(changed: PropertyValues): void {
    // ARIA + tabindex mirroring comes from VfToggleControl.
    super.updated(changed)
    this.syncFormValue(this.checked ? this.value : null)
  }

  /** Form-associated lifecycle: restores the initial checked state. */
  formResetCallback(): void {
    this.checked = this.defaultChecked ?? false
  }

  /** Click/Space on an enabled checkbox flips it. */
  protected override activate(): void {
    this.checked = !this.checked
    this.focus()
    emit(this, 'vf-change', { checked: this.checked })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-checkbox': VfCheckbox
  }
}
