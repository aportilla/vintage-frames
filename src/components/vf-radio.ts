import { css, html, LitElement } from 'lit'
import { property, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay, vfFocusUnderline, vfToggle } from '../styles/base.js'
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
 *   Left empty, the label and its gap collapse: the control is the bare
 *   13×13 circle.
 * @csspart circle - The 13×13 radio circle.
 * @csspart label - The label wrapper around the slot.
 * @fires vf-change - When selected by user interaction. `detail: { value: string }`.
 */
@vfElement('vf-radio')
export class VfRadio extends VfPositioned(VfToggleControl(LitElement)) {
  static override styles = [
    vfBase,
    vfDisplay,
    vfToggle,
    css`
      /* Keyboard focus underlines the circle itself — not the label, and not a
         ring around either (see vfFocusUnderline). One blank row below the
         well, which is where vf-checkbox puts its own: −2 rather than that
         control's −3 only because this well is unbordered, so the two rules
         land on the same row of a mixed list. The 12px sprite sits half a
         pixel proud of the 13px well, so the gap reads as one row or two
         depending on which way that rounds — the well is the anchor, not the
         sprite. */
      :host(:focus-visible) .circle::after {
        --vf-focus-underline-offset: -2px;
        ${vfFocusUnderline}
        /* …and narrower than the well, because the shape above it is round:
           a full-width rule reads as wider than the circle it marks. 9 of the
           13px (5 dashes) is the closest to two thirds that still insets by a
           whole 2px each side and keeps ink at both ends. */
        left: calc(var(--vf-scale, 1) * 2px);
        right: calc(var(--vf-scale, 1) * 2px);
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

  /** Whether the slot holds non-whitespace content; gates the label row. */
  @state() private _hasLabel = false

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
        class=${classMap({ circle: true, dim, 'vf-snap': true })}
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
      <span class=${classMap({ label: true, dim, empty: !this._hasLabel })} part="label">
        <slot @slotchange=${this.#onLabelSlotChange}></slot>
      </span>
    `
  }

  #onLabelSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this._hasLabel = slot
      .assignedNodes({ flatten: true })
      .some((node) => node.nodeType === Node.ELEMENT_NODE || !!node.textContent?.trim())
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
