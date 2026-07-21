import { css, html, LitElement } from 'lit'
import { customElement } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'

/**
 * `<vf-scroll-area>` — a container whose scrollbars look like System 7.
 *
 * White box with a 1px black border and an inner scrolling viewport. WebKit
 * scrollbars are fully skinned: 16px wide, a black/white 1-bit dither
 * trough, a white boxed thumb, and boxed arrow buttons with inline-SVG
 * triangle glyphs (one at each end, classic style). Firefox falls back to
 * `scrollbar-color`.
 *
 * Size the host (width/height) from the outside; the viewport fills it.
 *
 * @slot - Scrollable content.
 * @csspart viewport - The inner scrolling container (`overflow: auto`).
 */
@customElement('vf-scroll-area')
export class VfScrollArea extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        background: var(--vf-white, #fff);
        border: 1px solid var(--vf-black, #000);
        overflow: hidden;
      }
      .viewport {
        width: 100%;
        height: 100%;
        overflow: auto;
        padding: 8px;
      }
      /* Focusable so keyboard users can scroll; inset ring to stay in-box. */
      .viewport:focus-visible {
        outline: var(--vf-focus-outline, 1px dotted #000);
        outline-offset: -2px;
      }

      /* --- System 7 scrollbars ------------------------------------------- */
      .viewport::-webkit-scrollbar {
        width: 16px;
        height: 16px;
      }
      .viewport::-webkit-scrollbar-track {
        background: repeating-conic-gradient(
          var(--vf-white, #fff) 0% 25%,
          var(--vf-black, #000) 0% 50%
        );
        background-size: 2px 2px;
      }
      .viewport::-webkit-scrollbar-track:vertical {
        border-left: 1px solid var(--vf-black, #000);
      }
      .viewport::-webkit-scrollbar-track:horizontal {
        border-top: 1px solid var(--vf-black, #000);
      }
      .viewport::-webkit-scrollbar-thumb {
        background: var(--vf-scrollbar-thumb, #ffffff);
        border: 1px solid var(--vf-black, #000);
      }
      .viewport::-webkit-scrollbar-corner {
        background: var(--vf-white, #fff);
      }
      .viewport::-webkit-scrollbar-button {
        display: block;
        width: 16px;
        height: 16px;
        background-color: var(--vf-white, #fff);
        border: 1px solid var(--vf-black, #000);
        background-repeat: no-repeat;
        background-position: center;
      }
      /* Single arrow button at each end, classic style. */
      .viewport::-webkit-scrollbar-button:vertical:start:increment,
      .viewport::-webkit-scrollbar-button:vertical:end:decrement,
      .viewport::-webkit-scrollbar-button:horizontal:start:increment,
      .viewport::-webkit-scrollbar-button:horizontal:end:decrement {
        display: none;
      }
      .viewport::-webkit-scrollbar-button:vertical:decrement {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M8 4L12 10H4Z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:vertical:increment {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M4 6H12L8 12Z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:horizontal:decrement {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M10 4L4 8L10 12Z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:horizontal:increment {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M6 4L12 8L6 12Z'/%3E%3C/svg%3E");
      }
      /* Firefox (no ::-webkit-scrollbar): approximate with scrollbar-color. */
      @supports not selector(::-webkit-scrollbar) {
        .viewport {
          scrollbar-width: auto;
          scrollbar-color: var(--vf-scrollbar-thumb, #ffffff) #808080;
        }
      }
    `,
  ]

  protected override render() {
    return html`
      <div class="viewport" part="viewport" tabindex="0">
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
