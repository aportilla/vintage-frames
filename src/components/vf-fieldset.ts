import { css, html, LitElement, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplayDecls } from '../styles/base.js'

/**
 * `<vf-fieldset>` — the classic "Install Location" group box.
 *
 * A 1px black rectangle whose bold legend sits on the top border, punching a
 * gap through it with a `var(--vf-surface, ...)` background patch — so it
 * matches whatever surface sits behind it.
 *
 * @slot - Group contents.
 * @slot legend - Rich legend content; overrides the `legend` attribute.
 * @csspart fieldset - The bordered box.
 * @csspart legend - The legend patch on the top border.
 */
@customElement('vf-fieldset')
export class VfFieldset extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
      }
      .fieldset {
        position: relative;
        border: 1px solid var(--vf-black, #000);
        padding: 14px 12px 10px;
        margin-top: 8px;
      }
      .legend {
        /* Chicago-style legend (chrome); grouped content keeps the body face. */
        ${vfDisplayDecls}
        position: absolute;
        top: -0.7em;
        left: 8px;
        padding: 0 5px;
        /* Punches through the border, matching the surface behind it. */
        background: var(--vf-surface, var(--vf-white, #fff));
        white-space: nowrap;
      }
      .legend.empty {
        display: none;
      }
    `,
  ]

  /** Legend text shown on the top border. */
  @property() legend = ''

  /** Whether the named `legend` slot has assigned content. */
  @state() private _hasSlottedLegend = false

  protected override render() {
    const empty = !this.legend && !this._hasSlottedLegend
    return html`
      <div
        class="fieldset"
        part="fieldset"
        role="group"
        aria-labelledby=${empty ? nothing : 'legend'}
      >
        <span
          id="legend"
          class=${classMap({ legend: true, empty })}
          part="legend"
        >
          <slot name="legend" @slotchange=${this.#onLegendSlotChange}>
            ${this.legend}
          </slot>
        </span>
        <slot></slot>
      </div>
    `
  }

  #onLegendSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this._hasSlottedLegend = slot.assignedNodes({ flatten: true }).length > 0
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-fieldset': VfFieldset
  }
}
