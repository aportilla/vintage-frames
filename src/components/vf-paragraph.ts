import { css, html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { VfSized } from '../size.js'
import { vfBase, vfStaticText } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

/**
 * `<vf-paragraph>` — a paragraph of copy on the kit's body face and grid.
 *
 * The installer's welcome text, a dialog's explanation, an article's prose:
 * anything a page would otherwise set with a `<p>` and hope the leading landed
 * somewhere sensible. What it adds over that `<p>`:
 *
 * - the **Geneva body face** by default (`face="display"` switches to
 *   the Chicago-style chrome face);
 * - a **whole-system-pixel line box** — `--vf-paragraph-line-height`, 20px, the
 *   same row pitch as `vf-list-item`. This is the point of the component:
 *   line boxes are the single biggest source of off-grid layout, because a
 *   ratio resolves to whatever it resolves to (`1.65 × 17px = 28.05px`) and
 *   every line of prose nudges everything after it further off the device-pixel
 *   grid, smearing 1-bit borders and bitmap glyph stems (README, layout
 *   contract rule 2). A whole-pixel line box accumulates whole offsets;
 * - its own {@link GridSnapController}, so it holds its own origin once the
 *   page opts in with `applyGridSnap()`;
 * - a **declared box** when the layout wants one — `width`/`height` in whole
 *   system px ({@link VfSized}). In flow a paragraph takes its container's
 *   width, which is usually right; a *placed* one (`top`/`left`) shrink-wraps
 *   its longest line instead — a fractional glyph-run width, wrapped wherever
 *   the parent's edge happens to fall — so a DITL-style layout states the
 *   measure the copy wraps to, whole and on the grid.
 *
 * The shadow root renders a real `<p>`, so the copy keeps paragraph semantics
 * for assistive tech, and — unlike the kit's chrome — the text is selectable.
 * There is no margin: per SPEC §2 a component adds nothing outside its own box,
 * so paragraph spacing is the page's (a `gap` on the column, or a margin on the
 * host — kept a whole number of pixels, like everything else in the contract).
 *
 * @slot - The paragraph copy.
 * @csspart paragraph - The inner `<p>`.
 * @cssprop --vf-paragraph-line-height - Line box, in system px (default `20px`).
 *   Keep it a whole number — a ratio is what puts a page off the grid in the
 *   first place.
 */
@vfElement('vf-paragraph')
export class VfParagraph extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    vfStaticText,
    css`
      :host {
        display: block;
        /* The body face is already vfBase's host default (vfStaticText's
           face="display" overrides it); what this component fixes is the line
           box — in whole system px, never a ratio. */
        line-height: calc(
          var(--vf-scale, 1) * var(--vf-paragraph-line-height, 20px)
        );
        /* Prose, not chrome: put back the text selection vfBase suppresses. */
        user-select: text;
        -webkit-user-select: text;
      }
      p {
        margin: 0;
      }
    `,
  ]

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * Which embedded face to set the copy in — `'body'` (Geneva, the
   * default) or `'display'` (the Chicago-style chrome face, for copy that is
   * really dialog chrome). Applied by `vfStaticText`; declared here so it types
   * and reflects.
   */
  @property({ reflect: true }) face?: 'display' | 'body'

  /** Greys the copy to `--vf-disabled` — System 7's dimmed static text. */
  @property({ type: Boolean, reflect: true }) dim = false

  protected override render() {
    return html`<p class="vf-snap" part="paragraph"><slot></slot></p>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-paragraph': VfParagraph
  }
}
