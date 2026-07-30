import { css, html, LitElement } from 'lit'
import type { PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import { CHECKMARK, glyphSvg } from '../glyphs.js'
import { ScaleController } from '../scale.js'

/**
 * `<vf-option>` — a single choice inside a `<vf-select>` popup menu.
 *
 * A light-DOM child of `<vf-select>` (slotted into the popup panel). Renders
 * its slotted label at menu-item metrics (16px row — the pill's content height,
 * so a selected option overlays the closed pill exactly; the left checkmark gutter is
 * `--vf-select-gutter`, shared with the closed control's left inset so the value
 * doesn't shift on open). The parent select manages `selected` and the transient
 * `active` highlight, and slots this element into its popup panel.
 *
 * The host carries `role="option"` with `aria-selected`/`aria-disabled`.
 *
 * @csspart check - The ✓ checkmark shown in the left gutter when selected.
 * @cssprop [--vf-popup-height=18px] - `vf-select` pill (border box; its 1px
 *   hard shadow makes the sheet's 157×19 ink box)
 * @cssprop [--vf-select-gutter=16px] - checkmark column: `vf-select` left inset
 *   / `vf-option` + `vf-menu-item` ✓ column (shared so the value doesn't shift
 *   on open)
 */
@vfElement('vf-option')
export class VfOption extends LitElement {
  static override styles = [
    vfBase,
    vfDisplay,
    css`
      :host {
        position: relative;
        display: flex;
        align-items: center;
        /* Row height = the pill's CONTENT height (--vf-popup-height 18px minus
           its two 1px borders), so the selected row's text and whitespace match
           the closed pill exactly when the open list overlays it. Derived, not
           a literal, so re-theming the pill height moves the rows with it. */
        height: calc(var(--vf-scale, 1) * (var(--vf-popup-height, 18px) - 2px));
        /* Lock the line box to the row box. vfDisplay's 1.25 line-height is
           taller than a 16px row (20px), and align-items:center splits the
           excess above AND below — so every row's text spilled 2px past its
           own box and the LAST row's spill pushed the panel into overflow,
           putting a scrollbar on every popup that should never have one. The
           ink doesn't move: a 16px line box centred in a 16px row has the same
           centre as a 20px one. Derived from the same expression as the height
           above so a re-themed pill can't reintroduce the mismatch. */
        line-height: calc(var(--vf-scale, 1) * (var(--vf-popup-height, 18px) - 2px));
        /* Left gutter (--vf-select-gutter) holds the ✓ and matches the closed
           vf-select control's left inset, so a selected option's text lands at
           the same x whether the popup is closed or open. */
        padding: 0 calc(var(--vf-scale, 1) * 20px) 0
          calc(var(--vf-scale, 1) * var(--vf-select-gutter, 16px));
        background: var(--vf-white, #fff);
        color: var(--vf-black, #000);
        white-space: nowrap;
        cursor: default;
        outline: none;
      }
      /* Hover/keyboard highlight — classic full-row inversion. The parent
         vf-select drives [active] for both pointer and keyboard so only one
         row is ever highlighted at a time. */
      :host([active]) {
        background: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
      }
      :host([disabled]) {
        background: var(--vf-white, #fff);
        color: var(--vf-disabled, #c0c0c0);
      }
      /* The ✓ is pinned a whole 3px in from the row's left and top rather than
         centred in the gutter. Centring a 9px glyph in the 16px column (and in
         the 16px row) lands it on a half pixel — 3.5 authored px, i.e. 10.5
         device px at the default 3× — which fringes at every scale. Menus.png
         biases it up-left exactly this way: ink 3px inside the row on both
         axes, leaving the wider gap on the right/bottom. */
      .check {
        position: absolute;
        left: calc(var(--vf-scale, 1) * 3px);
        top: calc(var(--vf-scale, 1) * 3px);
        display: block;
        visibility: hidden;
        color: inherit;
      }
      /* Native 9×9 (1:1, crisp). */
      .check svg {
        display: block;
        width: calc(var(--vf-scale, 1) * 9px);
        height: calc(var(--vf-scale, 1) * 9px);
      }
      :host([selected]) .check {
        visibility: visible;
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  // No GridSnapController: an option lives inside vf-select's panel, which is
  // JS-positioned on the device grid already (see src/grid-snap.ts).

  /**
   * Submitted/compared value of this option. Falls back to the trimmed text
   * content when empty (like a native `<option>`).
   */
  @property() value = ''

  /** Disables the option: gray text, not selectable. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Whether this option is the select's current value. Managed by the parent. */
  @property({ type: Boolean, reflect: true }) selected = false

  /**
   * Transient highlight (hover / keyboard cursor) — full-row inversion.
   * Managed by the parent `<vf-select>`; not part of the authoring API.
   */
  @property({ type: Boolean, reflect: true }) active = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('role', 'option')
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '-1')
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('selected')) {
      this.setAttribute('aria-selected', this.selected ? 'true' : 'false')
    }
    if (changed.has('disabled')) {
      if (this.disabled) {
        this.setAttribute('aria-disabled', 'true')
      } else {
        this.removeAttribute('aria-disabled')
      }
    }
  }

  protected override render() {
    return html`
      <span class="check" part="check" aria-hidden="true"
        >${glyphSvg(CHECKMARK, 'checkmark')}</span
      >
      <slot></slot>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-option': VfOption
  }
}
