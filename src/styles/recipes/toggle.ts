import { css } from 'lit'

/**
 * Shared layout for the two toggle controls (vf-checkbox, vf-radio): the
 * box-and-label row, the host focus suppressed (each control draws
 * {@link vfFocusUnderline} under its own well instead), and the classic "dim
 * the label, not the control" disabled treatment. The Chicago display face
 * comes from {@link vfDisplay} (both controls compose it), so no font is set
 * here. Each component adds only its own well (`.box`/`.circle`), glyphs,
 * press feedback and focus rule.
 */
export const vfToggle = css`
  :host {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--vf-scale, 1) * 6px);
    cursor: var(--vf-cursor, default);
  }
  /* The well PAINTS 3 system px below the row top. Centering the 13px well
     in the 20px row is the layout — kept, because the host's height and its
     exported baseline are consumer-visible (moving them off the well's
     centered bottom reflowed every line holding a toggle) — but centering
     lands on 3.5, an exact tie, half a system px off the pixel grid at every
     density where 3.5 system px isn't whole device px. So the paint steps
     back half a pixel through the same relative "top" the grid-snap
     correction rides (this rule overrides vfBase's .vf-snap, so it must
     compose the variable), landing the ink on row 3: ties resolve toward the
     start, as QuickDraw's "div 2" did — the title-bar and vf-stack
     convention. The half-pixel gap between layout box and painted box is the
     documented snap idiom, not a fault. */
  .box,
  .circle {
    top: calc(var(--vf-snap-dy, 0px) - var(--vf-scale, 1) * 0.5px);
  }
  /* The focus rule is drawn under the box/circle, not around the host. */
  :host(:focus-visible) {
    outline: none;
  }
  /* An empty slot still generates the label flex item, and the host gap with
     it — a bare (label-less) control would carry 6px of phantom trailing
     width. Each control marks the wrapper from its slotchange; display: none
     removes the item from the gap math. The slot stays in the DOM so content
     added later still assigns and re-fires slotchange. */
  .label.empty {
    display: none;
  }
  /* Disabled dims the label only; the box/circle glyphs stay solid black. */
  .label.dim {
    color: var(--vf-disabled, #c0c0c0);
  }
`
