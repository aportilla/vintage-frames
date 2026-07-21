import { css, html, LitElement } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import { CHECKBOX_X, glyphSvg } from '../glyphs.js'

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
export class VfCheckbox extends LitElement {
  /** Participates in native forms via ElementInternals. */
  static formAssociated = true

  static override styles = [
    vfBase,
    vfDisplay,
    css`
      :host {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: default;
      }
      :host(:focus-visible) {
        outline: none;
      }
      /* Focus ring around the box only, not the label. */
      :host(:focus-visible) .box {
        outline: var(--vf-focus-outline, 1px dotted #000);
        outline-offset: 2px;
      }
      .box {
        position: relative;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 13px;
        height: 13px;
        background: var(--vf-white, #fff);
        border: 1px solid var(--vf-black, #000);
        color: var(--vf-black, #000);
      }
      /* Pressed: border thickens to 2px (classic press feedback). */
      :host(:active) .box:not(.dim) {
        box-shadow: inset 0 0 0 1px var(--vf-black, #000);
      }
      /* Native 12×12 (1:1, crisp) — centered in the 13×13 box; the glyph's own
         1px transparent margin lets it overhang onto the border harmlessly. */
      .check {
        flex: none;
        width: 12px;
        height: 12px;
        display: none;
        color: inherit;
      }
      :host([checked]) .check {
        display: block;
      }
      /* Disabled: the box and ✕ glyph stay solid black — System 7 dims the
         label, not the control. (.dim still suppresses the press feedback.) */
      .label.dim {
        color: var(--vf-disabled, #808080);
      }
    `,
  ]

  /** Whether the checkbox is checked. */
  @property({ type: Boolean, reflect: true }) checked = false

  /** Disables the checkbox: the label dims to gray; box and ✕ glyph stay black. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Form field name used when submitting. */
  @property({ reflect: true }) name = ''

  /** Value submitted with the form while checked. */
  @property() value = 'on'

  /** True while an ancestor `<fieldset disabled>` disables this control. */
  @state() private formDisabled = false

  private readonly internals: ElementInternals

  /** Checked state at first connect, restored on form reset. */
  private defaultChecked: boolean | null = null

  /**
   * True when the component owns the host tabindex (no consumer-authored
   * `tabindex` attribute at connect). Guards `updated()` so a consumer-set
   * tabindex (e.g. `tabindex="-1"`) is never clobbered.
   */
  private selfManagedTabIndex = false

  constructor() {
    super()
    this.internals = this.attachInternals()
    this.internals.role = 'checkbox'
    this.addEventListener('click', this.handleClick)
    this.addEventListener('keydown', this.handleKeydown)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.defaultChecked === null) this.defaultChecked = this.checked
    if (!this.hasAttribute('tabindex')) {
      this.selfManagedTabIndex = true
      this.tabIndex = this.isDisabled ? -1 : 0
    }
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

  protected override updated(): void {
    this.internals.setFormValue(this.checked ? this.value : null)
    this.internals.ariaChecked = this.checked ? 'true' : 'false'
    const disabled = this.isDisabled
    this.internals.ariaDisabled = disabled ? 'true' : 'false'
    if (this.selfManagedTabIndex) this.tabIndex = disabled ? -1 : 0
  }

  /**
   * Form-associated lifecycle: called by the browser when the element is
   * disabled or re-enabled by an ancestor (e.g. `<fieldset disabled>`).
   */
  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  /** Form-associated lifecycle: restores the initial checked state. */
  formResetCallback(): void {
    this.checked = this.defaultChecked ?? false
  }

  private get isDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  private toggle(): void {
    if (this.isDisabled) return
    this.checked = !this.checked
    this.focus()
    this.dispatchEvent(
      new CustomEvent<{ checked: boolean }>('vf-change', {
        detail: { checked: this.checked },
        bubbles: true,
        composed: true,
      })
    )
  }

  private handleClick = (): void => {
    this.toggle()
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === ' ') {
      event.preventDefault()
      this.toggle()
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-checkbox': VfCheckbox
  }
}
