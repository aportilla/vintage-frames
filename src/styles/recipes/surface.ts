import { css, unsafeCSS } from 'lit'
import { vfHardShadow } from './shadow.js'
import { vfStrokeDecls, vfStrokeInset } from './stroke.js'

/**
 * The raised white surface shared by panels and chrome frames: white face, 1px
 * black frame, hard offset shadow. Kept as a private fragment behind the two
 * public classes below — a menu panel and a window frame are different things
 * in the art that currently happen to share a skin, so each keeps its own class
 * name and a future divergence is a one-line edit rather than an unpick.
 *
 * The frame is a stroke ({@link vfStrokeDecls}): 1px of padding on each edge
 * with the black painted by an inset shadow, the drop shadow after it in the
 * same list. The recipe owns the element's padding and box-shadow; an inset
 * goes on a child.
 */
const raisedSurfaceDecls = unsafeCSS(`
  background: var(--vf-white, #fff);
  ${vfStrokeDecls({ shadows: vfHardShadow })}
`)

/**
 * Panel recipe for menus and popups: white face, 1px black frame, hard
 * offset shadow.
 */
export const vfPanel = css`
  .vf-panel {
    ${raisedSurfaceDecls}
  }
`

/**
 * Chrome-frame recipe for the desktop window (vf-window): the same white
 * face, 1px black frame and hard offset shadow as {@link vfPanel}. Apply
 * `.vf-frame` to the outer frame element.
 *
 * Skin only — the component adds its own layout (a full-size flex column: the
 * body flexes, the title bar and grow box don't). vf-dialog does not use it:
 * both of its chromes are {@link vfModalFrame}, which casts no shadow.
 */
export const vfChromeFrame = css`
  .vf-frame {
    ${raisedSurfaceDecls}
  }
`

/**
 * The classic modal-dialog (dBoxProc) frame: 1px outer rule, 2px white gap,
 * 2px inner band — and NO drop shadow, per the `Windows/modal dialog.png`
 * reference. System 7's alert box drew the
 * *mirror* trace (2px outer, 2px gap, 1px inner rule, with the hard shadow) —
 * a different chrome the kit does not ship: an alert is a composition over
 * this frame, not a component.
 *
 * Apply `.vf-modal-frame` to the outer element and `.vf-modal-frame-inner` to
 * a wrapper inside it; content goes in the wrapper.
 *
 * **The movable modal (movableDBoxProc) is this same frame with the striped
 * title bar set into it** — traced from a 2× capture of a System 7 movable
 * modal: the standard 18px bar (`vfTitleBar`, 17-row interior, 3 white rows /
 * six stripes / 3 white rows, the title patch's 7px margins) sits directly
 * under the outer rule, inset 2px at either end so its stripes keep the same
 * 2px of white from the outer rule that the inner band keeps; the bar's own
 * 1px rule plus the inner box's 1px top stroke make the 2px band its floor,
 * which then continues down both sides and along the bottom as the band
 * around the body. No shadow anywhere. Put the `.vf-title-bar` between the
 * two elements, as the first child of `.vf-modal-frame`, and the three rules
 * below do the rest.
 *
 * Both lines are strokes ({@link vfStrokeDecls}): padding holds their space
 * and an inset shadow paints them, so the recipe owns both elements' padding
 * and box-shadow.
 */
export const vfModalFrame = css`
  .vf-modal-frame {
    background: var(--vf-white, #fff);
    ${vfStrokeDecls()}
  }
  .vf-modal-frame-inner {
    margin: calc(var(--vf-scale, 1) * 2px);
    ${vfStrokeDecls({ width: 2 })}
  }
  /* The bar set into the frame: 2px in from the outer rule at either end, its
     stripes flush to the bar's own edge (vfStripes' 1px side inset is the
     window frame's buffer — here the frame's gap is that buffer). The bottom
     inset counts the bar's rule, which is padding (vfTitleBar). */
  .vf-modal-frame > .vf-title-bar {
    margin: 0 calc(var(--vf-scale, 1) * 2px);
  }
  .vf-modal-frame > .vf-title-bar .vf-stripes {
    inset: calc(var(--vf-scale, 1) * 3px) 0 ${vfStrokeInset(3)};
  }
  /* Under a bar, the inner box's top stroke is the second row of the band —
     the bar's 1px rule is the first — and there is no gap row between. */
  .vf-modal-frame > .vf-title-bar + .vf-modal-frame-inner {
    margin-top: 0;
    ${vfStrokeDecls({ width: [1, 2, 2, 2] })}
  }
`
