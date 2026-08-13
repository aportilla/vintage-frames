import { html, css, LitElement } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import type { PropertyValues } from 'lit'
import { vfBase } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

/**
 * `<vf-separator>` — a 1px System 7 rule.
 *
 * Horizontal by default (1px tall, full width); set the `vertical` attribute
 * for a 1px-wide vertical rule (give it a height, or let a flex parent
 * stretch it).
 *
 * Containers may restyle it via custom properties:
 * - `--vf-separator-color` — line color (default `var(--vf-black, #000)`).
 * - `--vf-separator-style` — line style, e.g. `dotted` (default `solid`).
 *   `vf-menu` sets these so slotted separators render as the classic dimmed
 *   dotted menu rule (see Menus.png).
 * @cssprop --vf-separator-color - `vf-separator` rule color — `vf-menu` sets it
 *   to `--vf-disabled` for the dimmed menu rule
 * @cssprop [--vf-separator-style=solid] - `vf-separator` rule style — `vf-menu`
 *   sets `dotted` (see `Menus.png`)
 */
@vfElement('vf-separator')
export class VfSeparator extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        height: calc(var(--vf-scale, 1) * 1px);
      }
      :host([vertical]) {
        width: calc(var(--vf-scale, 1) * 1px);
        height: auto;
        align-self: stretch;
      }
      /* The rule ink lives on an inner element rather than a host border so it
         can ride the snap offset (see .vf-snap in base.ts). */
      .rule {
        width: 100%;
        height: 100%;
        border-top: calc(var(--vf-scale, 1) * 1px)
          var(--vf-separator-style, solid)
          var(--vf-separator-color, var(--vf-black, #000));
      }
      :host([vertical]) .rule {
        border-top: none;
        border-left: calc(var(--vf-scale, 1) * 1px)
          var(--vf-separator-style, solid)
          var(--vf-separator-color, var(--vf-black, #000));
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /** Render as a vertical rule (1px wide) instead of horizontal. */
  @property({ type: Boolean, reflect: true }) vertical = false

  /**
   * ARIA goes through internals, never `setAttribute` on the host: internals
   * values are *defaults*, so a consumer's own `role`/`aria-*` on the tag wins
   * — the platform's own precedence, and the opposite of what a host
   * `setAttribute` gives. See SPEC §2. This component already had the right
   * behavior via a `hasAttribute` guard; internals is the same rule spelled
   * the way every other component now spells it.
   */
  readonly #internals = this.attachInternals()

  constructor() {
    super()
    this.#internals.role = 'separator'
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('vertical')) {
      this.#internals.ariaOrientation = this.vertical ? 'vertical' : null
    }
  }

  protected override render(): unknown {
    return html`<div class="rule vf-snap"></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-separator': VfSeparator
  }
}
