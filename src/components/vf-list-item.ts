import { css, html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { vfBase, vfFocusRing } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { emit } from '../events.js'

/**
 * `<vf-list-item>` — a row inside a `<vf-list>` list box.
 *
 * A 20px-tall single-line row; when selected the entire row inverts
 * (white-on-black), the classic System 7 selection style. Selection and
 * keyboard focus are managed by the parent `<vf-list>`.
 *
 * @slot - The row's text/content.
 * @slot icon - A leading graphic — usually a `vf-img` holding a 16×16 System 7
 *   small icon, but any element rides here. The row lays it out as the icon
 *   gutter: flex-centered vertically (keep the difference between the row
 *   height and the icon height even, so the centering offset stays a whole
 *   pixel — 16 in a 20px row is a whole 2px), with the reference art's 4px gap
 *   to the text. Contributes no text, so first-letter type-ahead still reads
 *   the row's words. On a selected row the graphic rides the inverted bar
 *   as-is — System 7 left color icons unfiltered on the highlight.
 * @csspart text - The text span beside the icon gutter (ellipsizes).
 */
@vfElement('vf-list-item')
export class VfListItem extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: flex;
        align-items: center;
        /* Icon-to-text gap, per the reference art (Menus.png's icon-gutter
           popup: 16px icon cell, 4px to the first glyph). Collapses to
           nothing when the icon slot is empty — no icon, no flex item. */
        gap: calc(var(--vf-scale, 1) * 4px);
        height: calc(var(--vf-scale, 1) * 20px);
        line-height: calc(var(--vf-scale, 1) * 20px);
        padding: 0 calc(var(--vf-scale, 1) * 6px);
        cursor: var(--vf-cursor, default);
        background: transparent;
      }
      ::slotted([slot='icon']) {
        flex: none;
      }
      .text {
        /* min-width lets the span shrink below its content so the ellipsis
           can happen (flex items otherwise floor at min-content). */
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Plain :focus, not :focus-visible — vf-list drives a roving tabindex and
         moves the cursor with item.focus(), and programmatic focus that isn't
         preceded by a keyboard event doesn't match :focus-visible, so a
         mouse-clicked cursor row would show no ring until the next Arrow key.
         The roving tabindex guarantees only the cursor row is focusable, so
         :focus is exactly the cursor. Matches sibling vf-menu-item. On a
         *selected* row the ring rides currentColor (see vfFocusRing) and
         inverts to white on the highlight bar — it has to stay legible there,
         because in multiple mode Ctrl+Arrow deliberately moves the cursor
         across selected rows while Space still acts on it. */
      :host(:focus) {
        --vf-focus-offset: -1px;
        ${vfFocusRing}
      }
      :host([selected]) {
        background: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
        /* Forced colors: both tokens already remap to the user's
           Highlight/HighlightText pair (vfBase), but the mode also paints an
           opaque Canvas READABILITY BACKPLATE behind any text run whose
           backdrop it doesn't consider a flat opaque color — and Chromium's
           Highlight carries alpha, so the plate lands ON the highlight bar
           and the row's text drowns in it (measured: the bar renders as a
           Canvas slab under HighlightText ink). Opting the inverted row out
           of forced adjustments drops the backplate; every color in play is
           a system pair anyway, so this changes nothing else. The same
           exemption rides every 1-bit inversion in the kit — vf-option,
           vf-menu-item, vf-menu's open label, vf-icon's plate. */
        @media (forced-colors: active) {
          forced-color-adjust: none;
        }
      }
      :host([disabled]) {
        color: var(--vf-disabled, #c0c0c0);
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  // No GridSnapController: a row lives inside its vf-list's corrected
  // scroller, so it rides the list's snap offset (see src/grid-snap.ts).

  /** The value this row contributes to the list's `value`/`values`. */
  @property() value = ''

  /** Whether the row is selected (inverted). Managed by `<vf-list>`. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Disables the row: dimmed text, not selectable or focusable. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /**
   * True while the containing `<vf-list>` is disabled. Managed by the list —
   * not intended to be set by consumers. Kept distinct from `disabled` so
   * re-enabling the list doesn't clear rows that are disabled in their own
   * right. (The dimming already arrives by inheritance: the list host sets
   * `color: var(--vf-disabled)` and rows inherit it.) Mirrors
   * `vf-radio.groupDisabled`.
   */
  @property({ attribute: false }) listDisabled = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('role', 'option')
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('selected')) {
      this.setAttribute('aria-selected', this.selected ? 'true' : 'false')
    }
    if (changed.has('disabled') || changed.has('listDisabled')) {
      if (this.disabled || this.listDisabled) {
        this.setAttribute('aria-disabled', 'true')
      } else this.removeAttribute('aria-disabled')
    }
    // Internal coordination event: the parent list's roving tab stop may be
    // resting on this very row, so it has to re-sync or the stop goes stale
    // (or vanishes entirely — see VfList.#syncItems). First update excluded:
    // the old value is the class-field default there, and the list's own
    // slotchange sync already covers newly arrived rows.
    if (changed.has('disabled') && changed.get('disabled') !== undefined) {
      emit(this, 'vf-list-item-disabled-change', { item: this }, { composed: false })
    }
  }

  protected override render() {
    return html`<slot name="icon"></slot
      ><span class="text" part="text"><slot></slot></span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-list-item': VfListItem
  }
}
