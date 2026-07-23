import { css, html, LitElement } from 'lit'
import type { PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import { CHECKMARK, glyphSvg } from '../glyphs.js'
import { ScaleController } from '../scale.js'

/**
 * `<vf-option>` — a single choice inside a `<vf-select>` popup menu.
 *
 * A light-DOM child of `<vf-select>` (slotted into the popup panel). Renders
 * its slotted label at menu-item metrics (20px row — the pill's content height,
 * so a selected option overlays the closed pill exactly; the left checkmark gutter is
 * `--vf-select-gutter`, shared with the closed control's left inset so the value
 * doesn't shift on open). The parent select manages `selected` and the transient
 * `active` highlight, and slots this element into its popup panel.
 *
 * The host carries `role="option"` with `aria-selected`/`aria-disabled`.
 *
 * @csspart check - The ✓ checkmark shown in the left gutter when selected.
 */
@customElement('vf-option')
export class VfOption extends LitElement {
  static override styles = [
    vfBase,
    vfDisplay,
    css`
      :host {
        position: relative;
        display: flex;
        align-items: center;
        /* Row height = the pill's CONTENT height (--vf-control-height 22px minus
           its two 1px borders), so the selected row's text and whitespace match
           the closed pill exactly when the open list overlays it. */
        height: calc(var(--vf-scale, 1) * 20px);
        /* Left gutter (--vf-select-gutter) holds the ✓ and matches the closed
           vf-select control's left inset, so a selected option's text lands at
           the same x whether the popup is closed or open. */
        padding: 0 calc(var(--vf-scale, 1) * 20px) 0
          calc(var(--vf-scale, 1) * var(--vf-select-gutter, 22px));
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
      .check {
        position: absolute;
        left: 0;
        top: 0;
        width: calc(var(--vf-scale, 1) * var(--vf-select-gutter, 22px));
        height: calc(var(--vf-scale, 1) * 20px);
        display: flex;
        align-items: center;
        justify-content: center;
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
