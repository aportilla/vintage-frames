import { html, css, LitElement } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { vfBase } from '../styles/base.js'

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
 */
@customElement('vf-separator')
export class VfSeparator extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        height: 1px;
        border: none;
        border-top: 1px var(--vf-separator-style, solid)
          var(--vf-separator-color, var(--vf-black, #000));
      }
      :host([vertical]) {
        display: block;
        width: 1px;
        height: auto;
        align-self: stretch;
        border-top: none;
        border-left: 1px var(--vf-separator-style, solid)
          var(--vf-separator-color, var(--vf-black, #000));
      }
    `,
  ]

  /** Render as a vertical rule (1px wide) instead of horizontal. */
  @property({ type: Boolean, reflect: true }) vertical = false

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.hasAttribute('role')) this.setAttribute('role', 'separator')
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('vertical')) {
      if (this.vertical) this.setAttribute('aria-orientation', 'vertical')
      else this.removeAttribute('aria-orientation')
    }
  }

  protected override render(): unknown {
    return html``
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-separator': VfSeparator
  }
}
