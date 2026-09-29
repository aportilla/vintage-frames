import { css, unsafeCSS } from 'lit'
import {
  STROKE_FORCED_COLORS,
  strokeBorder,
  strokeEdgeShadow,
  strokePadding,
} from './stroke.js'

/**
 * The four edges a rule can sit on, in CSS shorthand order.
 */
export const RULE_EDGES = ['top', 'right', 'bottom', 'left'] as const
export type RuleEdge = (typeof RULE_EDGES)[number]

/** One edge's rule: its padding, its forced-colors border, its shadow. */
const ruleEdge = (edge: RuleEdge) =>
  unsafeCSS(`
    --_vf-rule-${edge}: ${strokeEdgeShadow(edge, 1)};
    padding-${edge}: ${strokePadding(0, 1)};
    border-${edge}: ${strokeBorder(1)};
  `)

/**
 * The 1px rule — the single black line that is the 1-bit art's only edge —
 * drawn on one side of a box. One class per edge, composable: the menu bar's
 * floor is `.vf-rule-bottom`, a window's status strip's ceiling is
 * `.vf-rule-top`, and `vf-container rule="…"` takes the edges by name.
 *
 * A stroke (see {@link vfStrokeDecls}), inside the box's own `border-box`
 * size (vfBase): the rule's row is padding and an inset shadow paints it
 * black, so it is one system px at every density and zoom, and in-flow
 * content begins inside it. Children placed against the box, and percentage
 * fills, measure from the box's outer edge; a component whose contract puts
 * them inside the rule gives them an inner box to lay out in (vf-container
 * uses its slot). Paints in `--vf-black`, and under forced colors turns back
 * into a border, so it remaps with the rest of the ink.
 *
 * The classes compose on one element: each edge's shadow goes through its
 * own private property and one rule paints all four, so the classes own the
 * element's `box-shadow`, and its padding on their edges.
 *
 * `npm run verify:rule` asserts a container's rule against the menu bar's.
 */
export const vfRule = css`
  .vf-rule-top,
  .vf-rule-right,
  .vf-rule-bottom,
  .vf-rule-left {
    --_vf-stroke-ink: var(--vf-black, #000);
    --_vf-rule-top: 0 0 transparent;
    --_vf-rule-right: 0 0 transparent;
    --_vf-rule-bottom: 0 0 transparent;
    --_vf-rule-left: 0 0 transparent;
    box-shadow: var(--_vf-rule-top), var(--_vf-rule-right), var(--_vf-rule-bottom),
      var(--_vf-rule-left);
    ${unsafeCSS(STROKE_FORCED_COLORS)}
  }
  .vf-rule-top {
    ${ruleEdge('top')}
  }
  .vf-rule-right {
    ${ruleEdge('right')}
  }
  .vf-rule-bottom {
    ${ruleEdge('bottom')}
  }
  .vf-rule-left {
    ${ruleEdge('left')}
  }
`

/**
 * The `rule` attribute grammar: edge names separated by whitespace, in any
 * order (`"bottom"`, `"top bottom"`, all four for a framed box). Returns the
 * edges in top/right/bottom/left order with repeats dropped; an empty array
 * for an unset or blank value; and `null` for a value carrying any token that
 * is not an edge name — the whole value is refused, not the one token, as
 * `parsePattern` refuses an unrecognized pattern. Case-sensitive, like the
 * pattern names.
 */
export function parseRule(value: string | null | undefined): RuleEdge[] | null {
  if (value == null) return []
  const tokens = value.trim().split(/\s+/).filter(Boolean)
  const wanted = new Set<string>(tokens)
  for (const token of wanted) {
    if (!(RULE_EDGES as readonly string[]).includes(token)) return null
  }
  return RULE_EDGES.filter((edge) => wanted.has(edge))
}

/** The classes a resolved rule puts on its box: `vf-rule-top vf-rule-bottom`. */
export function ruleClasses(edges: readonly RuleEdge[]): string {
  return edges.map((edge) => `vf-rule-${edge}`).join(' ')
}
