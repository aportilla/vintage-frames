import { css, html, LitElement } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { vfBase, vfFocusRing } from '../styles/base.js'
import { ScaleController } from '../scale.js'

/**
 * `<vf-list-item>` — a row inside a `<vf-list>` list box.
 *
 * A 20px-tall single-line row; when selected the entire row inverts
 * (white-on-black), the classic System 7 selection style. Selection and
 * keyboard focus are managed by the parent `<vf-list>`.
 *
 * @slot - The row's text/content.
 */
@customElement('vf-list-item')
export class VfListItem extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        height: calc(var(--vf-scale, 1) * 20px);
        line-height: calc(var(--vf-scale, 1) * 20px);
        padding: 0 calc(var(--vf-scale, 1) * 6px);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: default;
        background: transparent;
      }
      /* Plain :focus, not :focus-visible — vf-list drives a roving tabindex and
         moves the cursor with item.focus(), and programmatic focus that isn't
         preceded by a keyboard event doesn't match :focus-visible, so a
         mouse-clicked cursor row would show no ring until the next Arrow key.
         The roving tabindex guarantees only the cursor row is focusable, so
         :focus is exactly the cursor. Matches sibling vf-menu-item. (On a
         *selected* row the ring lands on the inverted black fill and reads as
         absent — correct: there the inversion is itself the indicator.) */
      :host(:focus) {
        --vf-focus-offset: -1px;
        ${vfFocusRing}
      }
      :host([selected]) {
        background: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
      }
      :host([disabled]) {
        color: var(--vf-disabled, #c0c0c0);
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** The value this row contributes to the list's `value`/`values`. */
  @property() value = ''

  /** Whether the row is selected (inverted). Managed by `<vf-list>`. */
  @property({ type: Boolean, reflect: true }) selected = false

  /** Disables the row: dimmed text, not selectable or focusable. */
  @property({ type: Boolean, reflect: true }) disabled = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('role', 'option')
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('selected')) {
      this.setAttribute('aria-selected', this.selected ? 'true' : 'false')
    }
    if (changed.has('disabled')) {
      if (this.disabled) this.setAttribute('aria-disabled', 'true')
      else this.removeAttribute('aria-disabled')
    }
  }

  protected override render() {
    return html`<slot></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-list-item': VfListItem
  }
}
