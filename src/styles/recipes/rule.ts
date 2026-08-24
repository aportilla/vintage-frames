import { css, unsafeCSS } from 'lit'

/**
 * The four edges a rule can sit on, in CSS shorthand order.
 */
export const RULE_EDGES = ['top', 'right', 'bottom', 'left'] as const
export type RuleEdge = (typeof RULE_EDGES)[number]

const RULE = unsafeCSS('calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000)')

/**
 * The 1px rule — the single black line that is the 1-bit art's only edge —
 * drawn on one side of a box. One class per edge, composable: the menu bar's
 * floor is `.vf-rule-bottom`, a window's status strip's ceiling is
 * `.vf-rule-top`, and `vf-container rule="…"` takes the edges by name.
 *
 * A border, not a pseudo-element or a painted line, so it lives inside the
 * box's own `border-box` size (vfBase) and insets the padding box the way
 * FrameRect insets a rectangle's interior: content, percentage fills and
 * children placed against the box all begin inside the rule. Scales with
 * `--vf-scale`, so it is one system px at every density, and paints in
 * `--vf-black`, so it remaps under forced colors with the rest of the ink.
 *
 * One declaration per edge, so the kit cannot grow two rules — the
 * {@link vfHardShadowDecls} principle, applied to the line.
 *
 * Being a border, it shares the kit's border-floor residual
 * (docs/THREE-X-DISPLAYS.md): Chromium floors a fractional border-width to
 * whole CSS px, so above 1× the line paints thinner than a system px (2
 * device px of 3 at 2×) and the padding box begins that much inside — the
 * same as every kit frame, and the same line the menu bar always drew.
 * `npm run verify:rule` asserts a container's rule against the menu bar's.
 */
export const vfRule = css`
  .vf-rule-top {
    border-top: ${RULE};
  }
  .vf-rule-right {
    border-right: ${RULE};
  }
  .vf-rule-bottom {
    border-bottom: ${RULE};
  }
  .vf-rule-left {
    border-left: ${RULE};
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
