import { css } from 'lit'
import { vfBodyDecls } from './body-face.js'

/**
 * Shared base styles for every Vintage Frames component.
 * See SPEC.md §3 (tokens) and §4 (recipes).
 */
export const vfBase = css`
  :host {
    box-sizing: border-box;
    ${vfBodyDecls}
    font-weight: var(--vf-font-weight, 700);
    line-height: 1.25;
    color: var(--vf-black, #000);
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
  /* Device-pixel grid snapping (src/grid-snap.ts). The controller writes the
     sub-half-pixel correction as two reserved custom properties on the host
     (--vf-snap-dx/-dy); this class applies it to a component's top-level
     painted element(s). Absolutely positioned satellites that anchor to the
     host (vf-menu's panel, the default button's ring) compose the same
     variables into their own insets instead. Controller-owned — never set the
     variables by hand. */
  .vf-snap {
    position: relative;
    left: var(--vf-snap-dx, 0px);
    top: var(--vf-snap-dy, 0px);
  }
`
