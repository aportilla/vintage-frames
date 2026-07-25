import { css, html, LitElement } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay, vfFocusRing, vfToggle } from '../styles/base.js'
import {
  RADIO_DOT,
  RADIO_FACE,
  RADIO_RING,
  RADIO_RING_PRESSED,
} from '../glyphs.js'
import { VfToggleControl } from '../toggle-control.js'
import { emit } from '../events.js'

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
export class VfRadio extends VfToggleControl(LitElement) {
  static override styles = [
    vfBase,
    vfDisplay,
    vfToggle,
    css`
      /* Focus ring around the circle only, not the label. */
      :host(:focus-visible) .circle {
        ${vfFocusRing}
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
    `,
  ]

  /** Whether this radio is selected. Managed by the containing group. */
  @property({ type: Boolean, reflect: true }) override checked = false

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
  }

  /**
   * A radio attaches its own internals: it is deliberately NOT form-associated
   * (the enclosing `vf-radio-group` is the form surface), so there is no
   * `VfFormControl` handle to inherit.
   */
  protected override get toggleInternals(): ElementInternals {
    return this.internals
  }

  /** This radio's own `disabled`, or its group's. */
  protected override get toggleDisabled(): boolean {
    return this.disabled || this.groupDisabled
  }

  /**
   * Inside a `vf-radio-group` the group is the single source of truth: it runs
   * the roving tabindex and flips `checked` on the whole set. Standalone, this
   * radio owns both — otherwise a bare radio would be keyboard-dead (its Space
   * handler unreachable) and would never visibly toggle.
   */
  protected override get externallyCoordinated(): boolean {
    return !!this.closest('vf-radio-group')
  }

  override render() {
    const dim = this.toggleDisabled
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

  /** Click/Space on an enabled, unselected radio selects it. */
  protected override activate(): void {
    if (this.checked) return
    // In a group, the group flips `checked` and unchecks siblings in response
    // to vf-change; self-setting here would give the set two sources of truth.
    if (!this.externallyCoordinated) this.checked = true
    this.focus()
    emit(this, 'vf-change', { value: this.value })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-radio': VfRadio
  }
}
