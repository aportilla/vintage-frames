import { css, html, LitElement } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { RING_INSET } from '../pixel-frame.js'

/**
 * Lays out a set of `vf-button`s the way a System 7 dialog does: a tidy row
 * (or column) with a consistent gap, every button sharing the width of the
 * widest, and all their *faces* on one line.
 *
 * Two wrinkles make an ad-hoc flex row get this subtly wrong, and the group
 * fixes both:
 *
 * - **Face alignment.** A `variant="default"` button reserves room for its
 *   ring with a {@link RING_INSET}px margin, so in a row aligned by any edge
 *   its *face* drifts from its neighbors' — you line up the ring, not the
 *   button. The group zeroes that margin (via the inherited
 *   `--vf-button-ring-margin`) and reserves the ring space itself as padding,
 *   then centers the cross axis, so the faces — not the margin boxes — align.
 * - **Shared width.** Classic dialogs sized grouped buttons to the widest, even
 *   when a label was short ("OK" as wide as "Cancel"). The group does this with
 *   pure CSS — equal `1fr` grid columns resolve to the widest button's
 *   intrinsic width under the shrink-wrapped `inline-grid` — and stretches each
 *   button's face to fill (via the inherited `--vf-button-flex`). No measuring.
 *   `natural` opts out, letting each button size to its own label.
 *
 * The group is layout-neutral: it shrink-wraps to its buttons, so position it
 * with the parent (e.g. `justify-self: end` for a bottom-right action row).
 *
 * @slot - The `vf-button`s to arrange.
 * @cssprop --vf-button-group-gap - Gap between buttons (default 12px).
 */
@customElement('vf-button-group')
export class VfButtonGroup extends LitElement {
  static override styles = [
    vfBase,
    css`
      /* Uniform row (the default): each button lands in its own auto column,
         all sized 1fr so they equalize to the widest button's intrinsic width
         under the shrink-wrapped inline-grid; the host of each stretches to
         that column (default justify-items) and its face fills via
         --vf-button-flex. align-items centers the cross axis so a shorter
         button (e.g. size="small") shares the row's baseline. */
      :host {
        /* Neutralize each default button's ring-reservation margin and reserve
           the ring space here instead, so faces — not margin boxes — align and
           equalize. The gap (12px) always exceeds the ring's ${RING_INSET}px
           reach, so rings never collide. */
        --vf-button-ring-margin: 0px;
        --vf-button-flex: 1 1 auto;
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        align-items: center;
        gap: calc(var(--vf-scale, 1) * var(--vf-button-group-gap, 12px));
        padding: calc(var(--vf-scale, 1) * ${RING_INSET}px);
      }
      /* Vertical: stack in a single column sized to the widest button; each
         button stretches to that width (justify-items defaults to stretch). */
      :host([vertical]) {
        grid-auto-flow: row;
      }
      /* Natural width: fall back to flex so columns don't equalize — each
         button keeps its own content width. */
      :host([natural]) {
        display: inline-flex;
        --vf-button-flex: 0 1 auto;
      }
      :host([natural][vertical]) {
        flex-direction: column;
        align-items: center;
      }
    `,
  ]

  /** Stack the buttons vertically instead of in a row. */
  @property({ type: Boolean, reflect: true }) vertical = false

  /**
   * Let each button size to its own label instead of every button sharing the
   * widest button's width. Off by default: grouped buttons are uniform width,
   * matching classic System 7 dialogs.
   */
  @property({ type: Boolean, reflect: true }) natural = false

  private readonly scale = new ScaleController(this)

  private readonly internals: ElementInternals

  constructor() {
    super()
    this.internals = this.attachInternals()
    this.internals.role = 'group'
  }

  override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-button-group': VfButtonGroup
  }
}
