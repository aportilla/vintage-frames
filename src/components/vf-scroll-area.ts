import { css, html, LitElement } from 'lit'
import { customElement } from 'lit/decorators.js'
import { vfBase, vfScrollbars } from '../styles/base.js'
import { ScaleController } from '../scale.js'

/**
 * `<vf-scroll-area>` — a container whose scrollbars look like System 7.
 *
 * White box with a 1px black border and an inner scrolling viewport. The
 * WebKit scrollbars are the shared `vfScrollbars` recipe: 16px wide, a loose
 * 1-bit dot-dither trough, a white boxed thumb, and boxed arrow buttons that
 * nest cleanly inside the host border. Firefox falls back to `scrollbar-color`.
 *
 * Size the host (width/height) from the outside; the viewport fills it.
 *
 * @slot - Scrollable content.
 * @csspart viewport - The inner scrolling container (`overflow: auto`).
 */
@customElement('vf-scroll-area')
export class VfScrollArea extends LitElement {
  private readonly scale = new ScaleController(this)

  static override styles = [
    vfBase,
    vfScrollbars,
    css`
      :host {
        display: block;
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        overflow: hidden;
      }
      .viewport {
        width: 100%;
        height: 100%;
        overflow: auto;
        padding: calc(var(--vf-scale, 1) * 8px);
      }
      /* Focusable so keyboard users can scroll; inset ring to stay in-box. */
      .viewport:focus-visible {
        outline: var(--vf-focus-outline, 1px dotted #000);
        outline-offset: calc(var(--vf-scale, 1) * -2px);
      }
    `,
  ]

  protected override render() {
    return html`
      <div class="viewport vf-scroll" part="viewport" tabindex="0">
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-scroll-area': VfScrollArea
  }
}
