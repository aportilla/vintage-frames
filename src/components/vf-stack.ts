import { css, html, LitElement } from 'lit'
import { property, query } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { VfSized } from '../size.js'
import type { PropertyValues } from 'lit'
import { vfBase } from '../styles/base.js'
import { ScaleController, sysLength, sysLengths } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { CrossCenterController } from '../cross-center.js'

/** Which axis the children run along. */
export type VfStackDirection = 'column' | 'row'

/**
 * Where the children sit across the stack. Defaults per direction — `start`
 * down a column, `center` across a row.
 */
export type VfStackPlace = 'start' | 'center' | 'end'

/**
 * `<vf-stack>` — arrange things inside a window, in system pixels.
 *
 * A window body is the one place the kit stopped short: every control inside it
 * is authored in system px, but the *spaces between* them were the consumer's
 * problem, written by hand as `calc(var(--vf-scale, 1) * 12px)`. This is that
 * calculation, as a component — a flexbox whose `gap`, `pad`, `width` and
 * `height` are declared in whole system px and converted internally:
 *
 * ```html
 * <vf-stack gap="12">                            <!-- a column -->
 *   <vf-stack fill-width direction="row" gap="8">   <!-- a labeled field -->
 *     <vf-label width="80" for="name">Name:</vf-label>
 *     <vf-text-field id="name" fill-width></vf-text-field>
 *   </vf-stack>
 *   <vf-stack fill-width place="end">                <!-- an action row -->
 *     <vf-button-group>
 *       <vf-button>Cancel</vf-button>
 *       <vf-button variant="default">Save</vf-button>
 *     </vf-button-group>
 *   </vf-stack>
 * </vf-stack>
 * ```
 *
 * **Why this can't just be page CSS.** Scaling is default-on and *per
 * component*: `ScaleController` sets `--vf-scale` on the component's own host,
 * not on the document. So `var(--vf-scale, 1)` in a consumer's stylesheet
 * resolves only where the rule's element happens to sit inside a `vf-*`
 * ancestor and inherit it — true inside a window body, false for a plain
 * `<div>` holding two buttons on an ordinary page, where the fallback `1` wins
 * and the gap renders at 8px around 3×-sized buttons with no warning. A page
 * that hasn't called `applyScale()` has no way to write "8 system px" at all.
 * A component always can, because it *is* the scope — which is also why this
 * one carries a {@link ScaleController} of its own: without it a lone stack
 * would resolve its own gap against that same fallback while its children each
 * self-scaled around it.
 *
 * **Whole system px is the only expressible value**, so the gap half of the
 * layout contract (docs/SIZING.md rule 2) stops being a rule to remember. Declaring
 * `width`/`height` covers the size half of rule 3 as well.
 *
 * **The geometry is governed by the content.** A column is as wide as its
 * widest child and a row as tall as its tallest; children keep the size they
 * drew themselves at (`flex: 0 0 auto` — no growing, no shrinking). System 7
 * boxes are the size they are: a push button is as wide as its label, a popup
 * menu hugs its widest option, and a window is a fixed box whose overflow is
 * clipped at the frame, not a layout that squeezes its controls to fit. The
 * stack distributes; it does not resize. That is why the box shrink-wraps
 * (`fit-content`) rather than claiming its parent's whole width — a layout box
 * that did would be inventing a size nobody declared.
 *
 * **`fill-width` / `fill-height` are how a child asks for more**, as bare
 * attributes on consumer DOM the way `nosnap` opts an element out of snapping:
 *
 * ```html
 * <vf-text-field fill-width></vf-text-field>
 * ```
 *
 * Each names the *outcome*, not the axis, so the markup means the same thing
 * wherever it lands; the stack does the flexbox translation, which is the whole
 * reason to have a component. One rule to learn, about geometry rather than
 * vocabulary: **the cross axis always has a size, the main axis only has slack
 * if you declared one.** So `fill-width` always works in a column (the width is
 * the widest child's) and needs a declared `width` in a row; `fill-height` is
 * exactly the other way round. A fill with nothing to take is inert, not an
 * error. Two children filling along the main axis end up *equal* — the zeroed
 * flex basis is what lets them divide the slack rather than keep their natural
 * sizes — and a child that declares its own size shouldn't also ask to fill it.
 *
 * A stack reads the same two attributes about *itself*, for the parents that
 * aren't stacks: a window body, a fieldset, a scroll well, a grid cell. That is
 * where a panel's width enters the tree, and from there `fill-width` hands it
 * down a level at a time.
 *
 * **It paints nothing and means nothing.** No border, no background, no role,
 * no keyboard behavior — what it holds decides what it is, as with
 * {@link VfGrid}.
 *
 * **It holds its box on the device-pixel grid** — the `vf-container`
 * arrangement, adopted here after first shipping without it. The original
 * reasoning ("no ink of its own, and slotted `vf-*` children correct their own
 * origins") accounted only for kit children: a stack is a positioned ancestor
 * and a layout box for *anything*, and consumer content inside it — a div, an
 * `<img>`, a run of text — has no controller of its own. So the flex
 * container, the placed-child anchor and the `vf-snap` class live on one
 * shadow box, and under `applyGridSnap()` the correction moves the stack's
 * whole coordinate system; children (kit or not) ride it, and the sweep's
 * outermost-first order means the kit children then find nothing left to
 * correct. What this deliberately does not fix: a text-governed child width
 * mid-row still shifts later siblings fractionally (their own controllers
 * cover that).
 *
 * **Centering lands on whole system px as well** — halving an odd count of free
 * system px gives a half, which no container can round in CSS. See
 * {@link CrossCenterController}.
 *
 * It is also the kit's one **typographically transparent** component: `vfBase`'s
 * chrome face, ratio line box, color and non-selectability are all reset to
 * `inherit` on the host. Wrapping content in a layout box must not change how
 * that content reads — inside a window it goes on inheriting the window's face
 * exactly as before, and on a plain page it leaves the page's typography (and
 * its whole-pixel line boxes) alone.
 *
 * What it deliberately does **not** do: equalize its children's widths. A row of
 * buttons still belongs in a `vf-button-group`, which sizes them all to the
 * widest and aligns their *faces* rather than the `variant="default"` ring
 * boxes a plain flex row would line up.
 *
 * @slot - The children to arrange. `fill-width` / `fill-height` on any of them.
 */
@vfElement('vf-stack')
export class VfStack extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    css`
      :host {
        /* Shrink to the content, but stay BLOCK-level while doing it: the stack
           is exactly as big as what it holds, so it can't hand a size it never
           declared to the things inside it — and it takes no part in its
           parent's inline formatting while doing it.

           fit-content, not inline-level, and the difference is 2 system px. An
           inline-level box sits on a line box, and a line box can never be
           shorter than the parent's strut: a stack shorter than the line-height
           around it silently gains the difference as leading (the showcase's
           swatch panel, an 18px row inside a 20px line box, grew by exactly
           that). vertical-align: top removes the descender half of it; nothing
           inside a component can shrink its parent's strut. So the box stays
           block-level and shrink-wraps instead — same geometry, no line box, no
           whitespace between two adjacent stacks, and the typographic
           transparency below stops having an exception.

           The flex machinery itself lives one element down, on .box — the host
           is a plain block shell, so the grid-snap correction has an interior
           element to land on while the host's own layout stays untouched. */
        display: block;
        width: fit-content;
        /* Typographic transparency — see the class doc. vfBase dresses a host
           as chrome (body face, 1.25 line box, black, unselectable); a stack
           holds no text of its own, so imposing any of that on what it wraps
           would make a layout box change how content reads. In particular a
           ratio line-height landing on slotted prose is the exact rule-2 fault
           the kit warns pages about. */
        /* font is a shorthand, so it carries the line box back to inherit with
           the family, size and weight; smoothing and color are their own
           inherited properties and need saying. */
        font: inherit;
        -webkit-font-smoothing: inherit;
        color: inherit;
        /* inherit, not auto: a stack inside a window has to keep the window's
           chrome rule (SPEC §1 — chrome text isn't selectable), and one on an
           ordinary page has to keep the page's. auto would be a third answer
           of its own. */
        user-select: inherit;
        -webkit-user-select: inherit;
        /* text-align is on that list because of a trap this component walked
           into: align is a LEGACY HTML PRESENTATION ATTRIBUTE. Blink maps the
           align content attribute on any HTML element to text-align — "left" /
           "right" / "center" by name, anything else verbatim — so the cross-axis
           attribute, back when it was spelled align, silently right-aligned
           every run of copy inside an action row. It is spelled place now, but
           the reset stays: it costs nothing, it keeps old markup harmless, and
           a layout box changing how content reads is the one thing this
           component promises not to do. */
        text-align: inherit;
      }

      /* The flex container, the positioning anchor for children placed with
         top/left (src/position.ts), and the grid-snap target — one shadow box
         coinciding with the host box, the vf-container arrangement. vf-snap
         (vfBase) gives it position: relative plus the controller's
         --vf-snap-dx/-dy offset, so one element owns the coordinate system
         and its correction: corrected, it takes every child with it, kit or
         not. It carries no padding of its own until pad writes some, so its
         padding box IS the host box and the placed-child anchor ignores pad
         exactly as before (pad, like any padding, is flow-only).

         height: 100% hands a declared (or filled) host height to the flex
         layout — against an undeclared height it computes to auto and the
         content governs, as always. Width needs no saying: a block-level box
         fills the host, and the host shrink-wraps from its content. */
      .box {
        display: flex;
        height: 100%;
        flex-direction: column;
        align-items: flex-start;
      }

      /* The same two words a child uses, read by the stack about itself — for
         the parents that aren't stacks and have no ::slotted rule to give: a
         window body, a fieldset, a scroll well, a grid cell, a plain div. A
         percentage is the one fill a page can always express, needing no
         system px, so this is the boundary where the chain would otherwise
         break. Inside a stack both rules apply and agree: 100% of a column's
         content box is what stretch resolves to anyway, and along a row the
         zeroed flex basis outranks a width. A declared width/height lands on
         the host's inline style and beats both, which is the resolution of
         "don't declare a size and ask to fill it". */
      :host([fill-width]) {
        width: 100%;
      }
      :host([fill-height]) {
        height: 100%;
      }

      /* --- Cross axis --------------------------------------------------- */
      /* The two directions want opposite things and always did: a column of
         fields starts at the panel's left edge, while a row of a caption beside
         a control centers on it. Both are stated as the direction's default
         rather than as an "auto" value, so an unrecognized place (a stale
         place="stretch", say) lands on the sane one instead of on flexbox's
         own "normal", which stretches. The named values come after, and win at
         equal specificity on source order. */
      :host([direction='row']) .box {
        flex-direction: row;
        align-items: center;
      }
      :host([place='start']) .box {
        align-items: flex-start;
      }
      :host([place='center']) .box {
        align-items: center;
      }
      :host([place='end']) .box {
        align-items: flex-end;
      }

      /* The centering tie: CrossCenterController steps a centered child onto
         whole system px through these variables (src/cross-center.ts has the
         why). Keyed off the marker because a ::slotted rule outranks a slotted
         element's own :host — a blanket position would restyle vf-window and
         vf-menu. */
      :host(:not([direction='row'])) ::slotted([data-vf-tie]) {
        position: relative;
        left: var(--vf-stack-dx, 0px);
      }
      :host([direction='row']) ::slotted([data-vf-tie]) {
        position: relative;
        top: var(--vf-stack-dy, 0px);
      }

      /* --- Children ----------------------------------------------------- */
      /* Neither grow nor shrink: the content governs the box, not the other way
         round (see the class doc). A light-DOM declaration beats a ::slotted
         one, so a page can still override any of this on its own children —
         align-self: stretch is the escape hatch for the cross-axis fill a
         direction doesn't offer, and needs no system px to write. */
      ::slotted(*) {
        flex: 0 0 auto;
      }
      /* fill-width / fill-height name the outcome, so each one compiles to the
         main axis or the cross axis depending on which way the stack runs. The
         min-* that rides the main-axis form is what lets a filled child shrink
         below its content: the flex-item min-width: auto default is what
         otherwise pins a text field to its value's width. */
      :host(:not([direction='row'])) ::slotted([fill-width]) {
        align-self: stretch;
      }
      :host(:not([direction='row'])) ::slotted([fill-height]) {
        flex: 1 1 0;
        min-height: 0;
      }
      :host([direction='row']) ::slotted([fill-width]) {
        flex: 1 1 0;
        min-width: 0;
      }
      :host([direction='row']) ::slotted([fill-height]) {
        align-self: stretch;
      }
    `,
  ]

  /**
   * Which axis the children run along — `column` (the default) or `row`.
   *
   * A stack is vertical unless it says otherwise, the way the word is used
   * everywhere else; a row is the one that reads as a deliberate choice in the
   * markup.
   */
  @property({ reflect: true }) direction: VfStackDirection = 'column'

  /**
   * The space between children, in whole system px. `0` by default: a layout
   * box that spaced things out on its own would be exactly the kind of
   * surprise SPEC §2 rules out when it says a component renders nothing
   * unexpected outside its box.
   */
  @property({ type: Number }) gap = 0

  /**
   * Padding inside the stack, in whole system px — one to four values in the
   * usual CSS shorthand order (`pad="12"`, `pad="10 12"`, `pad="14 12 10"`).
   *
   * Leave it off inside a `vf-window` body, which already carries its own 12px
   * inset; a stack that means to own that inset goes inside `<vf-window flush>`.
   */
  @property() pad?: string | number

  /**
   * Where the children sit across the stack — `start`, `center` or `end`.
   * Unset resolves per direction: `start` down a column, `center` across a row.
   *
   * Named `place` rather than `align` for a reason worth keeping in the source:
   * `align` is a legacy HTML presentation attribute, and Blink maps it to
   * `text-align` on any element, so the cross-axis switch used to re-align every
   * run of copy inside the stack (see the `text-align` reset above).
   *
   * Centering divides the free space in two, so an odd count of system px would
   * land a child on a half — a 16px caption centered in a row set by the
   * 25-system-px `vf-number-field` sits at 4.5. {@link CrossCenterController}
   * steps that back onto whole system px, the exact half going toward the start
   * the way QuickDraw's `div 2` did; `place="start"` is still the way to ask
   * for no centering at all.
   */
  @property({ reflect: true }) place?: VfStackPlace

  // `width`/`height` come from VfSized — worth declaring on the outermost
  // stack of a panel: a declared width is on the grid by construction, and in
  // a row it is what creates the slack a child's `fill-width` divides.

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /**
   * Hold the box on the device-pixel grid under `applyGridSnap()` — see the
   * class doc for why the original no-controller decision was reversed. The
   * host is what gets measured; `.box` (vf-snap) is where the correction
   * lands, taking the whole coordinate system with it.
   */
  private readonly gridSnap = new GridSnapController(this)

  /** The shadow flex box `gap`/`pad` write to; exists from the first render. */
  @query('.box') private readonly box!: HTMLDivElement

  /** The slot the children arrive through. (`slot` itself is HTMLElement's.) */
  @query('slot') private readonly childSlot!: HTMLSlotElement

  /**
   * Keeps cross-axis centering on whole system px (src/cross-center.ts).
   * A null axis is the inert state — no observers, nothing held — which is
   * every column that starts its children, i.e. the default.
   */
  private readonly crossCenter = new CrossCenterController(this, () => ({
    box: this.box,
    slot: this.childSlot,
    axis: this.centersChildren
      ? this.direction === 'row'
        ? 'y'
        : 'x'
      : null,
  }))

  /**
   * Mirrors the stylesheet's alignment selectors: a row centers unless `place`
   * names something else, a column only when it says `center`, and an
   * unrecognized value lands on the direction's default in both places.
   */
  private get centersChildren(): boolean {
    if (this.place === 'center') return true
    if (this.place === 'start' || this.place === 'end') return false
    return this.direction === 'row'
  }

  /**
   * `gap` and `pad` go on the shadow box's inline style as
   * `calc(var(--vf-scale, 1) * Npx)`, the way VfSized writes the declared
   * size. Emitting the calc rather than a resolved number keeps each one live
   * against the display: the scale is read at paint time (the var resolves
   * against the host's own --vf-scale by inheritance), so a stack follows a
   * monitor change exactly as the metrics in a component's stylesheet do.
   * A real property on a real element, not a custom property — a token would
   * inherit, and a nested stack would silently pick up its parent's spacing.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('gap')) this.box.style.gap = sysLength(this.gap)
    if (changed.has('pad')) this.box.style.padding = sysLengths(this.pad)
  }

  protected override render() {
    return html`<div class="vf-snap box"><slot></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-stack': VfStack
  }
}
