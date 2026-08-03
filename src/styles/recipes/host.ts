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
  /* Forced-colors mode (Windows High Contrast) — a modern adaptation the kit
     ADDS, in what is arguably the most 1-bit-native form the platform offers:
     the user chose their own two colors, and a two-color design honors them by
     re-declaring its palette in the system pair rather than fighting the
     override. The mechanism: forced colors rewrites color-valued properties at
     used-value time, but a property whose computed value is a <system-color>
     keyword is preserved — and var() substitution happens before the override
     judges it. So remapping the tokens here repairs, in one place, every paint
     site that routes through them: borders, faces, glyphs, the selection
     inversion, the button's silhouette pseudos, vf-grid's masked rules.
     What it cannot reach is filed per site: non-url()
     background-images are deleted regardless of color (the focus underline and
     title-bar stripe gradients — see vfFocusUnderline/vfStripes), url() tiles
     are preserved with their literal ink (the dot/sprite tiles — masks over
     these tokens instead), and box-shadows are never painted. */
  @media (forced-colors: active) {
    :host {
      --vf-black: CanvasText;
      --vf-white: Canvas;
      --vf-surface: Canvas;
      --vf-disabled: GrayText;
      --vf-field-placeholder: GrayText;
      --vf-highlight: Highlight;
      --vf-highlight-text: HighlightText;
    }
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
