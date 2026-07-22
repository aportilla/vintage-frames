import { css, html, LitElement } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import {
  RADIO_DOT,
  RADIO_FACE,
  RADIO_RING,
  RADIO_RING_PRESSED,
} from '../glyphs.js'
import { ScaleController } from '../scale.js'

/**
 * A single System 7 radio button: a 13×13 white circle with the pixel-exact
 * 1-bit ring and centered dot traced from the Classic Macintosh UI Kit sprite
 * (replacing the anti-aliased `border-radius` rendering). The ring thickens
 * while pressed, exactly like the original control.
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
    vfDisplay,
    css`
      :host {
        display: inline-flex;
        align-items: center;
        gap: calc(var(--vf-scale, 1) * 6px);
        cursor: default;
        /* Display scaling: metrics are authored in system px and multiplied by
           --vf-scale (default 1). See src/scale.ts. Font scales with the box. */
        font-size: calc(var(--vf-scale, 1) * var(--vf-font-size-display, 16px));
      }
      :host(:focus-visible) {
        outline: none;
      }
      /* Focus ring around the circle only, not the label. */
      :host(:focus-visible) .circle {
        outline: var(--vf-focus-outline, 1px dotted #000);
        outline-offset: calc(var(--vf-scale, 1) * 2px);
      }
      .circle {
        position: relative;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: calc(var(--vf-scale, 1) * 13px);
        height: calc(var(--vf-scale, 1) * 13px);
        color: var(--vf-black, #000);
      }
      /* Native 12×12 sprite centered in the 13×13 focus box; scales with the
         circle, crispEdges keeps it whole-device-pixel at any dpr. */
      .circle svg {
        display: block;
        width: calc(var(--vf-scale, 1) * 12px);
        height: calc(var(--vf-scale, 1) * 12px);
      }
      /* White control face, black ring + dot — the ring path covers the
         face's outer edge so no anti-aliasing shows. */
      .face {
        fill: var(--vf-white, #fff);
      }
      .ring,
      .ring-pressed,
      .dot {
        fill: currentColor;
      }
      .ring-pressed,
      .dot {
        display: none;
      }
      :host([checked]) .dot {
        display: inline;
      }
      /* Pressed: swap to the 2px-thick ring (classic press feedback). */
      :host(:active) .circle:not(.dim) .ring {
        display: none;
      }
      :host(:active) .circle:not(.dim) .ring-pressed {
        display: inline;
      }
      /* Disabled: the circle and dot stay solid black — System 7 dims the
         label, not the control. (.dim still suppresses the press feedback.) */
      .label.dim {
        color: var(--vf-disabled, #c0c0c0);
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

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

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
        <svg viewBox="0 0 12 12" shape-rendering="crispEdges">
          <path class="face" d=${RADIO_FACE.d}></path>
          <path class="ring" d=${RADIO_RING.d}></path>
          <path class="ring-pressed" d=${RADIO_RING_PRESSED.d}></path>
          <path class="dot" d=${RADIO_DOT.d}></path>
        </svg>
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
