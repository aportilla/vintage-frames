import { css } from 'lit'

/**
 * The dotted focus outline's two declarations, for composing inside any focus
 * selector whose shape (`:host(:focus-visible) .box`, `.viewport:focus-visible`,
 * a JS-toggled `.focus-ring`, …) is too varied to share a whole rule. Interpolate
 * it into the component's own selector: `.box { ${vfFocusRing} }`.
 *
 * The offset defaults to +2px (ring sits just outside the box); set
 * `--vf-focus-offset` in the same rule to inset it (negative, to stay in-box) or
 * widen it. Keeps the outline default (`--vf-focus-outline`) authoritative in one
 * place so a ring-style change is a single edit.
 *
 * Drawn in `currentColor` — the same mechanism as {@link vfFocusUnderline} —
 * so the ring inverts with the ink it sits on. This is load-bearing for
 * `vf-list-item` in a `multiple` list: Ctrl+Arrow deliberately walks the
 * cursor across already-selected rows, and a hard-coded black ring on the
 * inverted black selection bar left that cursor genuinely invisible while
 * Space still acted on it. On the highlight bar `currentColor` is
 * `--vf-highlight-text`, so the ring reads white there and black everywhere
 * else — no unselected artwork changes.
 */
export const vfFocusRing = css`
  outline: var(--vf-focus-outline, 1px dotted currentColor);
  outline-offset: calc(var(--vf-scale, 1) * var(--vf-focus-offset, 2px));
`

/**
 * Focus ring for non-text controls where focus and ring share one element.
 * Apply to the focusable element:
 *   .control:focus-visible { ... }
 * or compose this class name onto it.
 */
export const vfFocus = css`
  .vf-focus:focus-visible {
    ${vfFocusRing}
  }
`

/**
 * The kit's focus indicator for a control that can carry the mark on its own
 * face: a 1px dashed rule beneath it — 1 system px on, 1 off — instead of a
 * ring around it. It has two placements, both out of this one recipe:
 *
 * - *Inside* the control, under the ink it marks: the button underlines its
 *   label, the two toggles their box and circle.
 * - *Below* the control, under its whole box and clear of its hard shadow, for
 *   a control with no interior to give: vf-select's one line is shared by the
 *   label and the ▼, and a vf-swatch is nothing but fill.
 *
 * It is why none of those compose {@link vfFocus}.
 *
 * Keyboard focus is one of the modern requirements the kit adds rather than
 * emulates (SPEC §1): System 7 predates full keyboard access and drew no such
 * indicator at all. So the job is to render an affordance it never had in a
 * 1-bit vocabulary it would recognize — a hairline dashed rule on the pixel
 * grid, which reads on a white face and inside a control's tight silhouette
 * where an offset ring has nowhere to go.
 *
 * Interpolate into an `::after` rule on the element being underlined (which
 * needs `position: relative`), gated on whatever focus selector the component
 * uses — and suppress the UA outline in the same rule set:
 *
 *   button:focus-visible { outline: none; }
 *   button:focus-visible .label::after { ${vfFocusUnderline} }
 *
 * The rule spans that element's own box and leaves ONE blank system px row
 * between itself and the ink above, which is what `--vf-focus-underline-offset`
 * places — measured from the element's bottom edge up to the rule's, so
 * positive insets it and negative drops it below. A negative one counts every
 * row of ink between the two, since an absolutely positioned pseudo-element
 * sizes to the PADDING box and the ink can carry on past it:
 *
 * - `4px` (the default) is a text box, where the ink stops at the baseline and
 *   the box continues 6px past it (2px half-leading from vfBase's 1.25 line box
 *   over the 16px em, plus the face's 4px descent): 6 − 2 = 4.
 * - `-2px` is a well whose ink runs to its own bottom edge — the radio's circle,
 *   a field's wrapper — putting the rule in the second row below it.
 * - `-3px` adds a 1px border the pseudo-element sits inside of (vf-checkbox).
 * - past that, the rule also clears a hard shadow, which is ink no box the
 *   pseudo-element can size to contains: `-4px` for vf-select's 1px one, and
 *   for vf-swatch an offset that composes `--vf-shadow-offset` rather than
 *   hard-coding a depth its consumer can retheme.
 *
 * Drawn in `currentColor`, so it inverts with the label on a pressed face.
 */
export const vfFocusUnderline = css`
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--vf-scale, 1) * var(--vf-focus-underline-offset, 4px));
  height: calc(var(--vf-scale, 1) * 1px);
  background: repeating-linear-gradient(
    to right,
    currentColor 0 calc(var(--vf-scale, 1) * 1px),
    transparent calc(var(--vf-scale, 1) * 1px) calc(var(--vf-scale, 1) * 2px)
  );
  pointer-events: none;
`
