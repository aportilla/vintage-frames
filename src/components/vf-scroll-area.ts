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
      /* Authentic System 7 scroll arrows (arrow + stem), traced from the
         Classic Macintosh UI Kit sprites: a hollow outline at rest that fills
         solid black while the button is pressed (:active). */
      .viewport::-webkit-scrollbar-button:vertical:decrement {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 3h2v1h-2zM6 4h1v1h-1zM9 4h1v1h-1zM5 5h1v1h-1zM10 5h1v1h-1zM4 6h1v1h-1zM11 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM2 8h4v1h-4zM10 8h4v1h-4zM5 9h1v1h-1zM10 9h1v1h-1zM5 10h1v1h-1zM10 10h1v1h-1zM5 11h1v1h-1zM10 11h1v1h-1zM5 12h6v1h-6z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:vertical:decrement:active {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 3h2v1h-2zM6 4h4v1h-4zM5 5h6v1h-6zM4 6h8v1h-8zM3 7h10v1h-10zM2 8h12v1h-12zM5 9h6v1h-6zM5 10h6v1h-6zM5 11h6v1h-6zM5 12h6v1h-6z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:vertical:increment {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M5 3h6v1h-6zM5 4h1v1h-1zM10 4h1v1h-1zM5 5h1v1h-1zM10 5h1v1h-1zM5 6h1v1h-1zM10 6h1v1h-1zM2 7h4v1h-4zM10 7h4v1h-4zM3 8h1v1h-1zM12 8h1v1h-1zM4 9h1v1h-1zM11 9h1v1h-1zM5 10h1v1h-1zM10 10h1v1h-1zM6 11h1v1h-1zM9 11h1v1h-1zM7 12h2v1h-2z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:vertical:increment:active {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M5 3h6v1h-6zM5 4h6v1h-6zM5 5h6v1h-6zM5 6h6v1h-6zM2 7h12v1h-12zM3 8h10v1h-10zM4 9h8v1h-8zM5 10h6v1h-6zM6 11h4v1h-4zM7 12h2v1h-2z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:horizontal:decrement {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M8 2h1v1h-1zM7 3h2v1h-2zM6 4h1v1h-1zM8 4h1v1h-1zM5 5h1v1h-1zM8 5h5v1h-5zM4 6h1v1h-1zM12 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM3 8h1v1h-1zM12 8h1v1h-1zM4 9h1v1h-1zM12 9h1v1h-1zM5 10h1v1h-1zM8 10h5v1h-5zM6 11h1v1h-1zM8 11h1v1h-1zM7 12h2v1h-2zM8 13h1v1h-1z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:horizontal:decrement:active {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M8 2h1v1h-1zM7 3h2v1h-2zM6 4h3v1h-3zM5 5h8v1h-8zM4 6h9v1h-9zM3 7h10v1h-10zM3 8h10v1h-10zM4 9h9v1h-9zM5 10h8v1h-8zM6 11h3v1h-3zM7 12h2v1h-2zM8 13h1v1h-1z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:horizontal:increment {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 2h1v1h-1zM7 3h2v1h-2zM7 4h1v1h-1zM9 4h1v1h-1zM3 5h5v1h-5zM10 5h1v1h-1zM3 6h1v1h-1zM11 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM3 8h1v1h-1zM12 8h1v1h-1zM3 9h1v1h-1zM11 9h1v1h-1zM3 10h5v1h-5zM10 10h1v1h-1zM7 11h1v1h-1zM9 11h1v1h-1zM7 12h2v1h-2zM7 13h1v1h-1z'/%3E%3C/svg%3E");
      }
      .viewport::-webkit-scrollbar-button:horizontal:increment:active {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 2h1v1h-1zM7 3h2v1h-2zM7 4h3v1h-3zM3 5h8v1h-8zM3 6h9v1h-9zM3 7h10v1h-10zM3 8h10v1h-10zM3 9h9v1h-9zM3 10h8v1h-8zM7 11h3v1h-3zM7 12h2v1h-2zM7 13h1v1h-1z'/%3E%3C/svg%3E");
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
