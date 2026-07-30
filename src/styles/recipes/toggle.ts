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
    cursor: default;
  }
  /* The focus rule is drawn under the box/circle, not around the host. */
  :host(:focus-visible) {
    outline: none;
  }
  /* Disabled dims the label only; the box/circle glyphs stay solid black. */
  .label.dim {
    color: var(--vf-disabled, #c0c0c0);
  }
`
