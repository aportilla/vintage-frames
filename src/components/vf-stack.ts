import { css, html, LitElement } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { PropertyValues } from 'lit'
import { vfBase } from '../styles/base.js'
import { ScaleController, sysLength, sysLengths } from '../scale.js'

/** Which axis the children run along. */
export type VfStackDirection = 'column' | 'row'

/**
 * Cross-axis placement. `auto` (the default) resolves per direction — see the
 * class doc.
 */
export type VfStackAlign =
  | 'auto'
  | 'start'
  | 'center'
  | 'end'
  | 'stretch'
  | 'baseline'

/** Main-axis distribution of any slack. */
export type VfStackJustify = 'start' | 'center' | 'end' | 'between'

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
 * <vf-stack gap="12">                                  <!-- a column -->
 *   <vf-stack direction="row" gap="8">                 <!-- a labeled field -->
 *     <vf-label for="name">Name:</vf-label>
 *     <vf-text-field id="name" grow></vf-text-field>
 *   </vf-stack>
 *   <vf-stack direction="row" justify="end" gap="12">  <!-- an action row -->
 *     <vf-button>Cancel</vf-button>
 *     <vf-button variant="default">Save</vf-button>
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
 * layout contract (README rule 2) stops being a rule to remember. Declaring
 * `width`/`height` covers the size half of rule 3 as well: a stack with a
 * declared width is whole, and so is everything stretched inside it.
 *
 * **Children don't shrink by default** (`flex: 0 0 auto`). System 7 boxes are
 * the size they are — a window is a fixed box whose overflow is clipped at the
 * frame, not a layout that squeezes its controls to fit. Mark the one child
 * that should take the slack with `grow`, the way `nosnap` opts an element out
 * of snapping:
 *
 * ```html
 * <vf-text-field grow></vf-text-field>
 * ```
 *
 * **`align` defaults per direction**, because the two axes want opposite
 * things and always did: a row of a caption beside a control wants its items
 * centered, while a column of fields wants them stretched to the panel width.
 * Rather than hide that in a default, the default value is *named* `auto`.
 *
 * **It paints nothing and means nothing.** No border, no background, no role,
 * no keyboard behavior — what it holds decides what it is, as with
 * {@link VfGrid}. It carries no `GridSnapController` either: with nothing of
 * its own on screen there is no ink to hold on the grid, and the slotted `vf-*`
 * children each correct their own origin.
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
 * @slot - The children to arrange. `grow` on any of them takes the slack.
 */
@customElement('vf-stack')
export class VfStack extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: flex;
        flex-direction: column;
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
      }
      /* Shrink-wrap in a line rather than filling the parent — a row of buttons
         parked in a corner, the way vf-button-group sits. */
      :host([inline]) {
        display: inline-flex;
      }
      :host([direction='row']) {
        flex-direction: row;
      }
      :host([wrap]) {
        flex-wrap: wrap;
      }

      /* --- Cross axis ------------------------------------------------- */
      /* auto: stretch down a column (a field fills the panel), center across
         a row (a caption sits beside its control). Written as :not([align])
         plus the explicit spelling so both say the same thing, and placed
         before the named values so those win on source order at equal
         specificity. */
      :host(:not([align])),
      :host([align='auto']) {
        align-items: stretch;
      }
      :host([direction='row']:not([align])),
      :host([direction='row'][align='auto']) {
        align-items: center;
      }
      :host([align='start']) {
        align-items: flex-start;
      }
      :host([align='center']) {
        align-items: center;
      }
      :host([align='end']) {
        align-items: flex-end;
      }
      :host([align='stretch']) {
        align-items: stretch;
      }
      /* The kit's faces carry ascent/descent overrides on the 16px design grid
         (12 above the baseline, 4 below), so a baseline shared between two
         chrome runs lands whole. Mixing in a page face is where it stops being
         a whole number. */
      :host([align='baseline']) {
        align-items: baseline;
      }
      /* ...but a control is never resized by the auto default. A push button
         is as wide as its label, a popup menu hugs its widest option, a swatch
         is a fixed well — that is the drawing, and a column that stretched
         them to its own width would invent full-bleed controls System 7 never
         had. So the kit's fixed-size components sit at the start of a
         stretching column while the things that genuinely fill a panel — a
         fieldset, a list, a scroll area, a separator, a rule of copy, a slider
         or progress bar whose track IS the width — go on stretching.

         Only the auto default is overridden. An author who writes
         align="stretch" has asked by name and gets it, on everything.

         max-width is the other half: these children don't shrink either
         (::slotted(*) below), and a control whose natural width exceeds the
         panel would hang out over the window frame — a text field defaults to
         180 system px and overflows a narrower column by construction. A
         ceiling of the panel's own width lets it fit without being stretched
         past its drawing when there is room to spare. */
      :host(:is(:not([align]), [align='auto']):not([direction='row']))
        ::slotted(
          :is(
              vf-button,
              vf-button-group,
              vf-swatch,
              vf-checkbox,
              vf-radio,
              vf-select,
              vf-text-field,
              vf-text-area,
              vf-number-field,
              vf-img
            )
        ) {
        align-self: flex-start;
        max-width: 100%;
      }

      /* --- Main axis -------------------------------------------------- */
      /* start is flexbox's own default, so it needs no rule. */
      :host([justify='center']) {
        justify-content: center;
      }
      :host([justify='end']) {
        justify-content: flex-end;
      }
      :host([justify='between']) {
        justify-content: space-between;
      }

      /* --- Children ---------------------------------------------------- */
      /* No shrinking (see the class doc); grow takes the slack, with the min
         sizes that let it actually shrink below its content — the flex-item
         min-width: auto default is what otherwise pins a text field to its
         value's width. A light-DOM declaration beats a ::slotted one, so a
         page can still override either of these on its own children. */
      ::slotted(*) {
        flex: 0 0 auto;
      }
      ::slotted([grow]) {
        flex: 1 1 0;
        min-width: 0;
        min-height: 0;
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
   * Cross-axis placement: `auto` (the default — stretch in a column, center in
   * a row), `start`, `center`, `end`, `stretch` or `baseline`.
   *
   * Note the one thing centering cannot do: land on a whole pixel by itself. A
   * 16px caption centered in a row set by the 25-system-px `vf-number-field`
   * sits at 4.5 system px, and no container can round that — it would have to
   * read each child's height. `applyGridSnap()` keeps the caption's own ink
   * crisp regardless (it corrects the origin inside the child's shadow root);
   * `align="start"` is the deterministic escape.
   */
  @property({ reflect: true }) align?: VfStackAlign

  /**
   * Main-axis distribution: `start` (the default), `center`, `end` or
   * `between`.
   *
   * `end` and `between` compute a child's origin as `edge − width`, so they
   * inherit README rule 3: with whole-width children (which every `vf-*`
   * control is) the result is whole, and with a text-sized `<span>` in the row
   * it is not.
   */
  @property({ reflect: true }) justify?: VfStackJustify

  /** Let the children wrap onto further lines instead of overflowing. */
  @property({ type: Boolean, reflect: true }) wrap = false

  /**
   * Shrink-wrap to the children (`inline-flex`) instead of filling the parent.
   */
  @property({ type: Boolean, reflect: true }) inline = false

  /**
   * Width in whole system px. Optional, and worth declaring on the outermost
   * stack of a panel: a stack with a declared width is on the device-pixel grid
   * by construction, and so is every child stretched to it — the size half of
   * README rule 3, which snapping deliberately doesn't cover.
   */
  @property({ type: Number }) width?: number

  /** Height in whole system px. Optional; see {@link width}. */
  @property({ type: Number }) height?: number

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  // No GridSnapController: the stack paints nothing, so it has no ink to hold
  // on the grid; the slotted components correct themselves (see grid-snap.ts).

  /**
   * The four measured properties go on the host's own inline style as
   * `calc(var(--vf-scale, 1) * Npx)`, the way `vf-window` writes its declared
   * size. Emitting the calc rather than a resolved number keeps each one live
   * against the display: the scale is read at paint time, so a stack follows a
   * monitor change exactly as the metrics in a component's stylesheet do.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('gap')) this.style.gap = sysLength(this.gap)
    if (changed.has('pad')) this.style.padding = sysLengths(this.pad)
    if (changed.has('width')) this.style.width = sysLength(this.width)
    if (changed.has('height')) this.style.height = sysLength(this.height)
  }

  protected override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-stack': VfStack
  }
}
