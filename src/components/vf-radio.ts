import { css, html, LitElement } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase } from '../styles/base.js'

/**
 * A single System 7 radio button: a 13×13 white circle with a 1px black
 * border and a centered 5px black dot when selected.
 *
 * Radios are meant to live inside a `vf-radio-group`, which owns selection
 * state, the form value and the roving tabindex. A `vf-radio` is NOT itself
 * form-associated. Clicking (or pressing Space on) an unselected radio
 * dispatches `vf-change`; the containing group listens, selects it and
 * unselects its siblings.
 *
 * @slot - The label, rendered to the right of the circle with a 6px gap.
 * @csspart circle - The 13×13 radio circle.
 * @csspart label - The label wrapper around the slot.
 * @fires vf-change - When selected by user interaction. `detail: { value: string }`.
 */
@customElement('vf-radio')
export class VfRadio extends LitElement {
  static override styles = [
    vfBase,
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
      /* Focus ring around the circle only, not the label. */
      :host(:focus-visible) .circle {
        outline: var(--vf-focus-outline, 1px dotted #000);
        outline-offset: 2px;
      }
      .circle {
        position: relative;
        flex: none;
        width: 13px;
        height: 13px;
        background: var(--vf-white, #fff);
        border: 1px solid var(--vf-black, #000);
        border-radius: 50%;
        color: var(--vf-black, #000);
      }
      /* Pressed: border thickens (classic press feedback). */
      :host(:active) .circle:not(.dim) {
        box-shadow: inset 0 0 0 1px var(--vf-black, #000);
      }
      .dot {
        display: none;
        position: absolute;
        top: 50%;
        left: 50%;
        width: 5px;
        height: 5px;
        margin: -2.5px 0 0 -2.5px;
        border-radius: 50%;
        background: currentColor;
      }
      :host([checked]) .dot {
        display: block;
      }
      /* Disabled: the circle and dot stay solid black — System 7 dims the
         label, not the control. (.dim still suppresses the press feedback.) */
      .label.dim {
        color: var(--vf-disabled, #808080);
      }
    `,
  ]

  /** Whether this radio is selected. Managed by the containing group. */
  @property({ type: Boolean, reflect: true }) checked = false

  /** Disables this single radio: the label dims to gray; circle and dot stay black. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The value the containing `vf-radio-group` reports when selected. */
  @property() value = ''

  /**
   * True while the containing `vf-radio-group` is disabled. Managed by the
   * group — not intended to be set by consumers.
   */
  @property({ attribute: false }) groupDisabled = false

  private readonly internals: ElementInternals

  constructor() {
    super()
    this.internals = this.attachInternals()
    this.internals.role = 'radio'
    this.addEventListener('click', this.handleClick)
    this.addEventListener('keydown', this.handleKeydown)
  }

  override render() {
    const dim = this.disabled || this.groupDisabled
    return html`
      <span
        class=${classMap({ circle: true, dim })}
        part="circle"
        aria-hidden="true"
      >
        <span class="dot"></span>
      </span>
      <span class=${classMap({ label: true, dim })} part="label">
        <slot></slot>
      </span>
    `
  }

  protected override updated(): void {
    this.internals.ariaChecked = this.checked ? 'true' : 'false'
    this.internals.ariaDisabled =
      this.disabled || this.groupDisabled ? 'true' : 'false'
  }

  /** Select this radio in response to user interaction. */
  private interact(): void {
    if (this.disabled || this.groupDisabled || this.checked) return
    this.checked = true
    this.focus()
    this.dispatchEvent(
      new CustomEvent<{ value: string }>('vf-change', {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      })
    )
  }

  private handleClick = (): void => {
    this.interact()
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === ' ') {
      event.preventDefault()
      this.interact()
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-radio': VfRadio
  }
}
