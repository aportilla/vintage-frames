import { css } from 'lit'
import { vfBodyDecls } from './body-face.js'
import { vfDisplayDecls } from './display-face.js'

/**
 * The two host switches shared by the kit's static-text components
 * (`vf-label`, `vf-paragraph`) — the only things those two do identically:
 *
 * - `face="display" | "body"` picks the face explicitly, so a caption can be
 *   set in body copy or a paragraph in chrome type. Each component keeps its
 *   own *default* face in its own stylesheet (a label is chrome, a paragraph is
 *   body); this is the override.
 * - `dim` greys the text to `--vf-disabled` — the System 7 dimmed-text
 *   treatment (SPEC §1), for static text beside a disabled control.
 *
 * Each face renders at its native strike size — one design px = one system
 * px. The body face doubles as the kit's fine print, exactly as System 7's
 * did: a dialog's small captions are Geneva 9 at its own size (SPEC §3,
 * "One size, honestly").
 *
 * Every rule is `:host([attr])`, one specificity step above the plain `:host`
 * rule a component sets its own defaults in, so they win wherever they are
 * composed.
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
  :host([dim]) {
    color: var(--vf-disabled, #c0c0c0);
  }
`
