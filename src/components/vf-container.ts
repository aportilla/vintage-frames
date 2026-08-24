import { css, html, LitElement, type PropertyValues } from 'lit'
import { property, query } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { VfSized } from '../size.js'
import { parseRule, ruleClasses, vfBase, vfRule, type RuleEdge } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { parsePattern, type Pattern } from '../patterns.js'
import { PatternFillController, vfPatternFill } from '../pattern-fill.js'

/**
 * `<vf-container>` — a box that is nothing but its declared size.
 *
 * The kit's positioned-placement story (src/position.ts) ends with one line of
 * CSS it can't write for you: children placed with `top`/`left` need a
 * positioned ancestor, and while every kit container is one — a window body, a
 * stack, a fieldset — a region of *your own* needs `position: relative` in a
 * stylesheet. This component is that region as an element: declare `width` and
 * `height` in whole system px, slot anything into it, place children against
 * its origin. A DITL's enclosing rectangle, with nothing drawn in it.
 *
 * ```html
 * <vf-container width="200" height="120">
 *   <vf-icon label="System" width="64" top="8" left="12">…</vf-icon>
 *   <vf-icon label="Finder" width="64" top="8" left="104">…</vf-icon>
 * </vf-container>
 * ```
 *
 * The rectangle is the whole API — `width`/`height` here, plus the `top`/`left`
 * pair nearly every component takes ({@link VfPositioned}), so a container is
 * itself placeable: inside a window, a desktop, or another container, at whole
 * system px that keep its box on the device-pixel grid by construction.
 *
 * **It is not a `vf-stack`.** The stack is a flexbox with opinions — it
 * distributes children along an axis, compiles `fill-width`/`fill-height` into
 * flex, defaults a cross-axis alignment. This box has no layout opinion at
 * all: in-flow children get normal flow, placed children get a coordinate
 * system, and that is the whole API. Reach for it when the stack's opinions
 * are the thing in the way — a field of placed icons, a fixed stage for
 * absolutely-positioned art, a consumer's own composition that brings its
 * layout with it.
 *
 * **The declared size is the layout.** `width`/`height` land on the host as a
 * live `calc(var(--vf-scale, 1) * Npx)` ({@link VfSized}), so the box scales
 * with the display and sits on the device-pixel grid by construction. Content
 * that outgrows the box overflows it rather than growing it — the number is
 * the layout, and content that doesn't fit is a number to raise. Leave a
 * dimension off and that axis shrink-wraps: `fit-content`, not the parent's
 * width, because a layout box that silently claimed a size nobody declared
 * would be inventing one (the `vf-stack` rule, held here too).
 *
 * **It paints nothing and means nothing** — unless `pattern` or `rule` say
 * what to paint. No role, keyboard behavior or selection; what it holds
 * decides what it is.
 *
 * **`rule` draws the 1px rule on the edges it names** — `rule="bottom"` is
 * the menu bar's anatomy (the box's rows over one row of ink), `rule="top"`
 * a status strip's, all four a framed box. The rule is the box's own border
 * ({@link vfRule}), inside the declared size, so a 24px `rule="bottom"`
 * strip is 23 rows of box over the line; content, `fill-width` children and
 * placed children begin inside it, as a rectangle's interior begins inside
 * FrameRect's line.
 *
 * **`pattern` fills the box with a 1-bit pattern**: one of the 38 standard
 * MacPaint patterns by name (`pattern="bricks"`, `pattern="gray-50"` —
 * docs/PATTERNS.md has the table), or sixteen hex digits stating a custom
 * 8×8 pattern row by row, the way a PAT resource did. It is painted as the
 * box's own background — black ink on a `--vf-white` ground, anchored at
 * the box's top-left corner, under the content — by the same whole-surface
 * raster mechanism as the desktop dither, so it is 1-bit at every density
 * and zoom (src/pattern-fill.ts). A declared `width`/`height` sizes the
 * raster exactly; an undeclared axis (`fill-width`, a shrink-wrapped
 * height) is measured. Under forced colors the pattern goes flat Canvas.
 *
 * **It holds its box on the device-pixel grid** — with a `GridSnapController`.
 * A container's box is itself the consumer's coordinate system, including for
 * non-`vf` content that cannot correct itself, so the box is the thing to
 * hold on the grid. The shadow box below owns the `position: relative` anchor
 * and the `vf-snap` class together, so the correction
 * moves the whole coordinate system — everything placed against it rides
 * along instead of being re-corrected child by child. (`vf-stack` shipped
 * without a controller on the theory that slotted `vf-*` children correct
 * their own origins; this component is where that theory's gap — consumer
 * content — became visible, and the stack has since adopted the same
 * arrangement.)
 *
 * Like the stack it is **typographically transparent**: `vfBase`'s chrome
 * dress is returned to `inherit` on the host, so wrapping content in a sized
 * box changes nothing about how that content reads.
 *
 * `fill-width` / `fill-height` work here the way they do everywhere: read
 * about the host (be as big as *its* parent allows), and compiled for slotted
 * children — `width: 100%` in normal flow, so a child filling the cross of a
 * declared box needs no stylesheet. A height fill needs a declared `height`
 * to resolve against; with none it is inert, not an error.
 *
 * @slot - The content. In flow by default; `top`/`left` on a kit child places
 *   it against this box's origin. `fill-width` / `fill-height` on a child
 *   fills it to the declared box.
 */
@vfElement('vf-container')
export class VfContainer extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    vfPatternFill,
    vfRule,
    css`
      :host {
        display: block;
        /* Shrink-wrap an undeclared axis rather than claim the parent's
           width — the vf-stack rule: a layout box must not hand out a size
           nobody declared. A declared width/height lands on the host's inline
           style (VfSized) and beats this. */
        width: fit-content;
        /* Typographic transparency — the same reset vf-stack carries, for the
           same reason: vfBase dresses a host as chrome (body face, ratio line
           box, black, unselectable), and a box that holds no text of its own
           must not change how slotted content reads. font is a shorthand, so
           it carries the line box back with the family, size and weight. */
        font: inherit;
        -webkit-font-smoothing: inherit;
        color: inherit;
        user-select: inherit;
        -webkit-user-select: inherit;
        text-align: inherit;
      }

      /* The coordinate system, as one shadow box coinciding with the host box.
         vf-snap (vfBase) gives it position: relative plus the controller's
         --vf-snap-dx/-dy offset — so it is BOTH the positioning anchor for
         children placed with top/left (src/position.ts) AND the element the
         grid-snap correction lands on. One element owning both is the point:
         corrected, it takes every placed child with it, kit or not. */
      .box {
        /* flow-root: contain slotted margins, so the box's top edge — the
           origin placed children measure from — stays glued to the host's
           corner instead of being pushed down by a first child's margin
           collapsing through. */
        display: flow-root;
        /* Coincide with a declared height (100% of a definite host height;
           against an undeclared one it computes to auto and wraps content),
           so slotted percentage fills resolve against the stated box. */
        height: 100%;
      }

      /* The same two words a child uses, read about the host itself — for the
         parents that can give this box a size: a window body, a filled stack
         column, a grid cell. A percentage is the one fill a page can always
         express; a declared width/height on the inline style beats it. */
      :host([fill-width]) {
        width: 100%;
      }
      :host([fill-height]) {
        height: 100%;
      }

      /* And compiled for slotted children. Normal flow has no flex axes to
         translate onto, so both fills are the percentage form: width resolves
         against the box always, height only against a declared height —
         percentage-against-auto computes to auto, so a fill with nothing to
         take is inert, not an error (the vf-stack wording, kept true here). A
         light-DOM declaration beats a ::slotted one, so a page can still
         override either on its own children. */
      ::slotted([fill-width]) {
        width: 100%;
      }
      ::slotted([fill-height]) {
        height: 100%;
      }
    `,
  ]

  // `width`/`height` come from VfSized, `top`/`left` from VfPositioned — the
  // DITL rectangle; `pattern` and `rule` are the two things drawn in it.

  /**
   * A 1-bit fill for the box: a library pattern by name (`bricks`,
   * `gray-50`, … — the 38 standard MacPaint patterns, docs/PATTERNS.md) or
   * sixteen hex digits stating a custom 8×8 pattern row by row, bit 7 the
   * leftmost pixel, 1 = ink (`"DD 77 DD 77 DD 77 DD 77"`). Painted in black
   * on a `--vf-white` ground under the content, anchored at the box's
   * top-left. Unset, the container paints nothing; an unrecognized value
   * paints nothing and warns once.
   */
  @property() pattern?: string | null

  /** `pattern`, resolved — what the fill paints; null paints nothing. */
  private _pattern: Pattern | null = null

  /** One warning per element for an unrecognized `pattern`, not per render. */
  #warnedPattern = false

  /**
   * The 1px rule on the box's edges: edge names separated by spaces —
   * `"bottom"`, `"top bottom"`, up to all four in any order. Drawn as the
   * box's own border inside the declared size, in `--vf-black`, scaled with
   * the display like every kit frame's border; content and placed children
   * begin inside it.
   * Unset, no rule; a value naming anything but an edge draws none and
   * warns once.
   */
  @property() rule?: string | null

  /** `rule`, resolved — the edges drawn; empty draws nothing. */
  private _rule: RuleEdge[] = []

  /** One warning per element for an unrecognized `rule`, not per render. */
  #warnedRule = false

  /** The shadow box the fill paints on; exists from the first render. */
  @query('.box') private readonly box!: HTMLDivElement

  /**
   * Default-on display scaling (true 72dpi size); see src/scale.ts. Without
   * one, a lone container on a plain page would resolve its declared size
   * against the `var(--vf-scale, 1)` fallback while its slotted children each
   * self-scaled around it — the vf-stack reasoning, inherited with the rest.
   */
  private readonly scale = new ScaleController(this)

  /**
   * Hold the box on the device-pixel grid — see the
   * class doc. The host is what gets measured; `.box` (vf-snap) is where the
   * correction lands.
   */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * The pattern fill, painted on `.box` so it rides the snap correction with
   * the coordinate system. A declared axis sizes the raster exactly; an
   * undeclared one is measured (src/pattern-fill.ts).
   */
  private readonly patternFill = new PatternFillController(this, {
    getBox: () => this.box,
    getPattern: () => this._pattern,
    getSize: () => ({ width: this.width, height: this.height }),
  })

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    if (changed.has('pattern')) {
      this._pattern = parsePattern(this.pattern)
      if (this._pattern === null && this.pattern?.trim() && !this.#warnedPattern) {
        this.#warnedPattern = true
        console.warn(
          `vf-container: unknown pattern "${this.pattern}" — a library name ` +
            '(docs/PATTERNS.md) or sixteen hex digits. Painting nothing.'
        )
      }
    }
    if (changed.has('rule')) {
      const edges = parseRule(this.rule)
      this._rule = edges ?? []
      if (edges === null && !this.#warnedRule) {
        this.#warnedRule = true
        console.warn(
          `vf-container: unknown rule "${this.rule}" — edge names ` +
            '(top, right, bottom, left) separated by spaces. Drawing none.'
        )
      }
    }
  }

  protected override render() {
    // vf-patterned rides the resolved pattern, so the recipe's paper and
    // pixelation apply only while there is a pattern to paint — an
    // unpatterned container paints nothing and inherits nothing new. The
    // rule classes ride the resolved edges the same way: an unruled box
    // carries none. Both on the snapped box, so the paint rides the
    // correction with the coordinate system.
    const rule = ruleClasses(this._rule)
    return html`<div
      class="vf-snap box vf-pattern-fill${this._pattern ? ' vf-patterned' : ''}${
        rule ? ` ${rule}` : ''
      }"
    >
      <slot></slot>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-container': VfContainer
  }
}
