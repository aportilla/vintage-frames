import { css } from 'lit'
import { vfDisplayDecls } from './display-face.js'
import { vfFocusUnderline } from './focus.js'

/**
 * The System 7 editable-field skin (SPEC §1/§5): a white well with a 1px black
 * border, no corner radius, Chicago-style display type, and the kit's dashed
 * keyboard-focus rule under the well (no dotted ring). Add the `vf-field`
 * class to the inner native `<input>`/`<textarea>` and wrap it in a
 * `.vf-field-well` element; the host supplies layout (width, height, padding)
 * around it, and `VfTextControlBase` supplies the `.vf-focus-rule` class that
 * turns the rule on. Shared by vf-text-field, vf-text-area and
 * vf-number-field so the well, focus and disabled treatment stay identical
 * across all three.
 *
 * Why the wrapper: the rule is a pseudo-element, and a replaced element
 * generates none — neither `<input>` nor `<textarea>` can draw its own
 * `::after`. Hanging it off the host instead would leave it behind when grid
 * snapping moves the field, since the correction lands on `.vf-snap` inside the
 * shadow root and never on the host. The wrapper is both anchors at once: it
 * carries `vf-snap`, and it boxes the well exactly, so the rule spans the well
 * and measures its offset from the well's own bottom edge.
 */
export const vfField = css`
  .vf-field {
    background: var(--vf-white, #fff);
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
    border-radius: 0;
    /* Editable text is set in the Chicago-style display face. */
    ${vfDisplayDecls}
    font-weight: var(--vf-font-weight, 700);
    line-height: inherit;
    color: var(--vf-black, #000);
    user-select: text;
    -webkit-user-select: text;
    outline: none;
  }
  /* The wrapper boxing the well: the positioned anchor the focus rule hangs
     from, and the element grid snapping moves (see the note above). */
  .vf-field-well {
    position: relative;
  }
  /* Keyboard focus is the kit's dashed rule one blank row under the well — not
     a ring around it, and not a thickened border (see vfFocusUnderline). The
     offset counts that blank row and the rule itself down from the well's
     bottom edge: −(1 + 1).

     Gated on a class rather than :focus-visible, which cannot express this for
     a field: the selector matches any focus of an element that takes keyboard
     input, so it is already true for a mouse click (see focus-modality.ts).
     VfTextControlBase adds .vf-focus-rule for a keyboard focus only. */
  .vf-field-well.vf-focus-rule::after {
    --vf-focus-underline-offset: -2px;
    ${vfFocusUnderline}
  }
  .vf-field::placeholder {
    color: var(--vf-disabled, #c0c0c0);
    font-weight: inherit;
    opacity: 1;
  }
  /* Disabled: the text dims to gray; the solid black box border stays. */
  .vf-field:disabled {
    color: var(--vf-disabled, #c0c0c0);
  }
  /* Selected text inverts to solid black-on-white — the 1-bit System 7
     selection, not the browser's translucent blue. Reuses the list's highlight
     tokens so every selection in the kit shares one color. */
  .vf-field::selection {
    background-color: var(--vf-highlight, #000);
    color: var(--vf-highlight-text, #fff);
  }
`
