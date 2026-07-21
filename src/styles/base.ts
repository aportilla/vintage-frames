import { css } from 'lit'

/**
 * Shared base styles for every Vintage Frames component.
 * See SPEC.md §3 (tokens) and §4 (recipes).
 */
export const vfBase = css`
  :host {
    box-sizing: border-box;
    font-family: var(
      --vf-font-family,
      'Chicago',
      'ChicagoFLF',
      'Charcoal',
      'Geneva',
      'Helvetica Neue',
      Helvetica,
      Arial,
      sans-serif
    );
    font-size: var(--vf-font-size, 15px);
    font-weight: var(--vf-font-weight, 700);
    line-height: 1.25;
    color: var(--vf-black, #000);
    -webkit-font-smoothing: var(--vf-font-smoothing, antialiased);
    user-select: none;
    -webkit-user-select: none;
  }
  :host *,
  :host *::before,
  :host *::after {
    box-sizing: inherit;
  }
  :host([hidden]) {
    display: none !important;
  }
`

/**
 * Racing stripes for title bars. Apply the class to an absolutely-positioned
 * layer inset 5px (top/bottom) and 2px (left/right) within the title bar.
 */
export const vfStripes = css`
  .vf-stripes {
    position: absolute;
    inset: 5px 2px;
    background: repeating-linear-gradient(
      to bottom,
      var(--vf-black, #000) 0 1px,
      transparent 1px 2px
    );
    pointer-events: none;
  }
`

/**
 * Panel recipe for menus and popups: white face, 1px black border, hard
 * offset shadow.
 */
export const vfPanel = css`
  .vf-panel {
    background: var(--vf-white, #fff);
    border: 1px solid var(--vf-black, #000);
    box-shadow: var(--vf-shadow-offset, 2px) var(--vf-shadow-offset, 2px) 0 0
      var(--vf-black, #000);
  }
`

/**
 * Focus ring for non-text controls. Apply to the focusable element:
 *   .control:focus-visible { ... }
 * or compose this class name onto it.
 */
export const vfFocus = css`
  .vf-focus:focus-visible {
    outline: var(--vf-focus-outline, 1px dotted #000);
    outline-offset: 2px;
  }
`
