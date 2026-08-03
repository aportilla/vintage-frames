import { css, unsafeCSS } from 'lit'
import { vfHardShadowDecls } from './shadow.js'

/**
 * The raised white surface shared by panels and chrome frames: white face, 1px
 * black border, hard offset shadow. Kept as a private fragment behind the two
 * public classes below — a menu panel and a window frame are different things
 * in the art that currently happen to share a skin, so each keeps its own class
 * name and a future divergence is a one-line edit rather than an unpick.
 */
const raisedSurfaceDecls = unsafeCSS(`
  background: var(--vf-white, #fff);
  border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  ${vfHardShadowDecls}
`)

/**
 * Panel recipe for menus and popups: white face, 1px black border, hard
 * offset shadow.
 */
export const vfPanel = css`
  .vf-panel {
    ${raisedSurfaceDecls}
  }
`

/**
 * Chrome-frame recipe for the two framed containers (vf-window, vf-dialog):
 * the same white face, 1px black border and hard offset shadow as
 * {@link vfPanel}. Apply `.vf-frame` to the outer frame element.
 *
 * Skin only — each component adds its own layout, because they size very
 * differently: vf-window's frame is a full-size flex column (the body flexes,
 * the title bar and grow box don't), while vf-dialog's is a plain block that
 * the native `<dialog>` shrink-wraps.
 */
export const vfChromeFrame = css`
  .vf-frame {
    ${raisedSurfaceDecls}
  }
`

/**
 * The classic modal-dialog (dBoxProc) frame: 1px outer border, 2px white gap,
 * 2px inner band — and NO drop shadow, per the `Windows/modal dialog.png`
 * reference (`npm run extract:windows`). System 7's alert box drew the
 * *mirror* trace (2px outer, 2px gap, 1px inner rule, with the hard shadow) —
 * a different chrome the kit does not ship: an alert is a composition over
 * this frame, not a component.
 *
 * Apply `.vf-modal-frame` to the outer element and `.vf-modal-frame-inner` to
 * a wrapper inside it; content goes in the wrapper.
 */
export const vfModalFrame = css`
  .vf-modal-frame {
    background: var(--vf-white, #fff);
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-modal-frame-inner {
    margin: calc(var(--vf-scale, 1) * 2px);
    border: calc(var(--vf-scale, 1) * 2px) solid var(--vf-black, #000);
  }
`
