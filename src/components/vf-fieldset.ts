import { css, html, LitElement, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplayDecls } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

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
 * @cssprop [--vf-surface=...] - bg behind legends/label patches; `vf-window`
 *   and `vf-dialog` both set it to white
 */
@vfElement('vf-fieldset')
export class VfFieldset extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
      }
      .fieldset {
        position: relative;
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        padding: calc(var(--vf-scale, 1) * 14px) calc(var(--vf-scale, 1) * 12px)
          calc(var(--vf-scale, 1) * 10px);
        margin-top: calc(var(--vf-scale, 1) * 8px);
      }
      .legend {
        /* Chicago-style legend (chrome); grouped content keeps the body face. */
        ${vfDisplayDecls}
        position: absolute;
        /* Whole system px like every other length here. Authored as -0.7em
           this was 11.2px against the 16px display face — off the device grid
           at every scale, and it took a slotted legend with it (verify:grid).
           11 keeps the legend straddling the border, a fifth of a system px
           lower. */
        top: calc(var(--vf-scale, 1) * -11px);
        left: calc(var(--vf-scale, 1) * 8px);
        padding: 0 calc(var(--vf-scale, 1) * 5px);
        /* Punches through the border, matching the surface behind it. */
        background: var(--vf-surface, var(--vf-white, #fff));
        white-space: nowrap;
      }
      .legend.empty {
        display: none;
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /** Legend text shown on the top border. */
  @property() legend = ''

  /** Whether the named `legend` slot has assigned content. */
  @state() private _hasSlottedLegend = false

  protected override render() {
    const empty = !this.legend && !this._hasSlottedLegend
    return html`
      <div
        class="fieldset vf-snap"
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
