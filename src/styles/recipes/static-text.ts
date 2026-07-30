import { css } from 'lit'
import { vfBodyDecls } from './body-face.js'
import { vfDisplayDecls } from './display-face.js'

/**
 * The three host switches shared by the kit's static-text components
 * (`vf-label`, `vf-paragraph`) — the only things those two do identically:
 *
 * - `face="display" | "body"` picks the face explicitly, so a caption can be
 *   set in body copy or a paragraph in chrome type. Each component keeps its
 *   own *default* face in its own stylesheet (a label is chrome, a paragraph is
 *   body); this is the override.
 * - `size="small"` drops to `--vf-font-size-small` (12px), the kit's fine print.
 * - `dim` greys the text to `--vf-disabled` — the System 7 dimmed-text
 *   treatment (SPEC §1), for static text beside a disabled control.
 *
 * Every rule is `:host([attr])`, one specificity step above the plain `:host`
 * rule a component sets its own defaults in, so they win wherever they are
 * composed. Order matters *within* this fragment: `size` follows `face`
 * because both set `font-size` at equal specificity.
 *
 * Offering both faces is the point of the recipe, so this is the one module
 * that pulls both font files whatever the component does with it.
 */
export const vfStaticText = css`
  :host([face='display']) {
    ${vfDisplayDecls}
  }
  :host([face='body']) {
    ${vfBodyDecls}
  }
  :host([size='small']) {
    font-size: calc(var(--vf-scale, 1) * var(--vf-font-size-small, 12px));
  }
  :host([dim]) {
    color: var(--vf-disabled, #c0c0c0);
  }
`
