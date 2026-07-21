import { css, html, LitElement } from 'lit'
import { customElement, property, queryAssignedElements } from 'lit/decorators.js'
import { vfBase } from '../styles/base.js'
import type { VfListItem } from './vf-list-item.js'

const sameValues = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * `<vf-list>` — the classic System 7 list box.
 *
 * A white, black-bordered scrolling box of `<vf-list-item>` rows with
 * System 7-styled scrollbars (dither track, boxed arrow buttons). Selection
 * inverts rows. Supports single and multiple selection, roving tabindex, and
 * arrow-key navigation.
 *
 * Max height defaults to 200px; override with `--vf-list-max-height`.
 *
 * @slot - `vf-list-item` elements.
 * @csspart list - The scrolling viewport around the slotted items.
 * @fires vf-change - When the user changes the selection.
 *   `detail: { value: string, values: string[] }`.
 */
@customElement('vf-list')
export class VfList extends LitElement {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        background: var(--vf-white, #fff);
        border: 1px solid var(--vf-black, #000);
      }
      /* Disabled: the item text dims to gray; the black box border stays. */
      :host([disabled]) {
        color: var(--vf-disabled, #808080);
      }
      .list {
        max-height: var(--vf-list-max-height, 200px);
        overflow-y: auto;
      }

      /* --- System 7 scrollbars (same recipe as vf-scroll-area) ----------- */
      .list::-webkit-scrollbar {
        width: 16px;
        height: 16px;
      }
      .list::-webkit-scrollbar-track {
        background: repeating-conic-gradient(
          var(--vf-white, #fff) 0% 25%,
          var(--vf-black, #000) 0% 50%
        );
        background-size: 2px 2px;
      }
      .list::-webkit-scrollbar-track:vertical {
        border-left: 1px solid var(--vf-black, #000);
      }
      .list::-webkit-scrollbar-track:horizontal {
        border-top: 1px solid var(--vf-black, #000);
      }
      .list::-webkit-scrollbar-thumb {
        background: var(--vf-scrollbar-thumb, #ffffff);
        border: 1px solid var(--vf-black, #000);
      }
      .list::-webkit-scrollbar-corner {
        background: var(--vf-white, #fff);
      }
      .list::-webkit-scrollbar-button {
        display: block;
        width: 16px;
        height: 16px;
        background-color: var(--vf-white, #fff);
        border: 1px solid var(--vf-black, #000);
        background-repeat: no-repeat;
        background-position: center;
      }
      /* Single arrow button at each end, classic style. */
      .list::-webkit-scrollbar-button:vertical:start:increment,
      .list::-webkit-scrollbar-button:vertical:end:decrement,
      .list::-webkit-scrollbar-button:horizontal:start:increment,
      .list::-webkit-scrollbar-button:horizontal:end:decrement {
        display: none;
      }
      /* Authentic System 7 scroll arrows (arrow + stem) from the Classic
         Macintosh UI Kit sprites: hollow at rest, filled solid while pressed. */
      .list::-webkit-scrollbar-button:vertical:decrement {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 3h2v1h-2zM6 4h1v1h-1zM9 4h1v1h-1zM5 5h1v1h-1zM10 5h1v1h-1zM4 6h1v1h-1zM11 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM2 8h4v1h-4zM10 8h4v1h-4zM5 9h1v1h-1zM10 9h1v1h-1zM5 10h1v1h-1zM10 10h1v1h-1zM5 11h1v1h-1zM10 11h1v1h-1zM5 12h6v1h-6z'/%3E%3C/svg%3E");
      }
      .list::-webkit-scrollbar-button:vertical:decrement:active {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 3h2v1h-2zM6 4h4v1h-4zM5 5h6v1h-6zM4 6h8v1h-8zM3 7h10v1h-10zM2 8h12v1h-12zM5 9h6v1h-6zM5 10h6v1h-6zM5 11h6v1h-6zM5 12h6v1h-6z'/%3E%3C/svg%3E");
      }
      .list::-webkit-scrollbar-button:vertical:increment {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M5 3h6v1h-6zM5 4h1v1h-1zM10 4h1v1h-1zM5 5h1v1h-1zM10 5h1v1h-1zM5 6h1v1h-1zM10 6h1v1h-1zM2 7h4v1h-4zM10 7h4v1h-4zM3 8h1v1h-1zM12 8h1v1h-1zM4 9h1v1h-1zM11 9h1v1h-1zM5 10h1v1h-1zM10 10h1v1h-1zM6 11h1v1h-1zM9 11h1v1h-1zM7 12h2v1h-2z'/%3E%3C/svg%3E");
      }
      .list::-webkit-scrollbar-button:vertical:increment:active {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M5 3h6v1h-6zM5 4h6v1h-6zM5 5h6v1h-6zM5 6h6v1h-6zM2 7h12v1h-12zM3 8h10v1h-10zM4 9h8v1h-8zM5 10h6v1h-6zM6 11h4v1h-4zM7 12h2v1h-2z'/%3E%3C/svg%3E");
      }
      .list::-webkit-scrollbar-button:horizontal:decrement {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M8 2h1v1h-1zM7 3h2v1h-2zM6 4h1v1h-1zM8 4h1v1h-1zM5 5h1v1h-1zM8 5h5v1h-5zM4 6h1v1h-1zM12 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM3 8h1v1h-1zM12 8h1v1h-1zM4 9h1v1h-1zM12 9h1v1h-1zM5 10h1v1h-1zM8 10h5v1h-5zM6 11h1v1h-1zM8 11h1v1h-1zM7 12h2v1h-2zM8 13h1v1h-1z'/%3E%3C/svg%3E");
      }
      .list::-webkit-scrollbar-button:horizontal:decrement:active {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M8 2h1v1h-1zM7 3h2v1h-2zM6 4h3v1h-3zM5 5h8v1h-8zM4 6h9v1h-9zM3 7h10v1h-10zM3 8h10v1h-10zM4 9h9v1h-9zM5 10h8v1h-8zM6 11h3v1h-3zM7 12h2v1h-2zM8 13h1v1h-1z'/%3E%3C/svg%3E");
      }
      .list::-webkit-scrollbar-button:horizontal:increment {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 2h1v1h-1zM7 3h2v1h-2zM7 4h1v1h-1zM9 4h1v1h-1zM3 5h5v1h-5zM10 5h1v1h-1zM3 6h1v1h-1zM11 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM3 8h1v1h-1zM12 8h1v1h-1zM3 9h1v1h-1zM11 9h1v1h-1zM3 10h5v1h-5zM10 10h1v1h-1zM7 11h1v1h-1zM9 11h1v1h-1zM7 12h2v1h-2zM7 13h1v1h-1z'/%3E%3C/svg%3E");
      }
      .list::-webkit-scrollbar-button:horizontal:increment:active {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 2h1v1h-1zM7 3h2v1h-2zM7 4h3v1h-3zM3 5h8v1h-8zM3 6h9v1h-9zM3 7h10v1h-10zM3 8h10v1h-10zM3 9h9v1h-9zM3 10h8v1h-8zM7 11h3v1h-3zM7 12h2v1h-2zM7 13h1v1h-1z'/%3E%3C/svg%3E");
      }
      @supports not selector(::-webkit-scrollbar) {
        .list {
          scrollbar-width: auto;
          scrollbar-color: var(--vf-scrollbar-thumb, #ffffff) #808080;
        }
      }
    `,
  ]

  /** Allows multiple selection (Shift extends, Cmd/Ctrl toggles). */
  @property({ type: Boolean, reflect: true }) multiple = false

  /** Value of the (first) selected item. Settable. */
  @property() value = ''

  /** Values of all selected items (multiple mode). Settable. */
  @property({ attribute: false }) values: string[] = []

  /** Disables the whole list: dimmed, no interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false

  @queryAssignedElements({ selector: 'vf-list-item', flatten: true })
  private _items!: VfListItem[]

  /** Index of the item that owns the roving tabindex / keyboard cursor. */
  #activeIndex = -1

  /** Index the next Shift+click extends from. */
  #anchorIndex = -1

  constructor() {
    super()
    this.addEventListener('click', this.#onClick)
    this.addEventListener('keydown', this.#onKeydown)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('role', 'listbox')
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('multiple')) {
      if (this.multiple) this.setAttribute('aria-multiselectable', 'true')
      else this.removeAttribute('aria-multiselectable')
    }
    if (changed.has('disabled')) {
      if (this.disabled) this.setAttribute('aria-disabled', 'true')
      else this.removeAttribute('aria-disabled')
      this.#syncTabIndexes()
    }
    // Programmatic value/values writes: push down into the items. On the
    // first update the class-field defaults themselves are recorded in
    // `changed` (with `undefined` as the old value); skip the push-down while
    // they are still the empty defaults so already-slotted items keep their
    // markup `selected` attributes for #onSlotChange to adopt.
    if (changed.has('values')) {
      if (changed.get('values') !== undefined || this.values.length > 0) {
        this.#applySelection(this.values, false)
      }
    } else if (changed.has('value')) {
      if (changed.get('value') !== undefined || this.value !== '') {
        this.#applySelection(this.value ? [this.value] : [], false)
      }
    }
  }

  protected override render() {
    return html`
      <div class="list" part="list">
        <slot @slotchange=${this.#onSlotChange}></slot>
      </div>
    `
  }

  #onSlotChange(): void {
    if (this.value || this.values.length > 0) {
      // Props win: push existing selection onto the (new) items.
      this.#applySelection(
        this.multiple ? this.values : this.value ? [this.value] : [],
        false
      )
    } else {
      // Otherwise adopt any `selected` attributes from the markup.
      const marked = this._items.filter((i) => i.selected).map((i) => i.value)
      this.#applySelection(marked, false)
    }
  }

  /**
   * Makes exactly `vals` the selected values, syncs `value`/`values`, and
   * (optionally) fires `vf-change` if the selection actually changed.
   */
  #applySelection(vals: string[], notify: boolean): void {
    const items = this._items
    const wanted = this.multiple ? vals : vals.slice(0, 1)
    const before = items.filter((i) => i.selected).map((i) => i.value)
    for (const item of items) {
      item.selected = wanted.includes(item.value) && !item.disabled
    }
    const selected = items.filter((i) => i.selected).map((i) => i.value)
    const nextValue = selected[0] ?? ''
    if (this.value !== nextValue) this.value = nextValue
    if (!sameValues(this.values, selected)) this.values = selected
    this.#syncTabIndexes()
    if (notify && !sameValues(before, selected)) {
      this.dispatchEvent(
        new CustomEvent('vf-change', {
          bubbles: true,
          composed: true,
          detail: { value: this.value, values: [...selected] },
        })
      )
    }
  }

  /** Roving tabindex: the active (or first selected/enabled) item gets 0. */
  #syncTabIndexes(): void {
    const items = this._items
    if (!items) return
    let active: VfListItem | undefined
    if (!this.disabled) {
      active =
        (this.#activeIndex >= 0 ? items[this.#activeIndex] : undefined) ??
        items.find((i) => i.selected && !i.disabled) ??
        items.find((i) => !i.disabled)
    }
    for (const item of items) {
      item.tabIndex = item === active && !item.disabled ? 0 : -1
    }
  }

  #onClick = (event: MouseEvent): void => {
    if (this.disabled) return
    const target = event.target as HTMLElement | null
    const item = target?.closest('vf-list-item') ?? null
    if (!item || item.disabled) return
    const items = this._items
    const index = items.indexOf(item)
    if (index < 0) return

    let vals: string[]
    if (
      this.multiple &&
      event.shiftKey &&
      this.#anchorIndex >= 0 &&
      this.#anchorIndex < items.length
    ) {
      const start = Math.min(this.#anchorIndex, index)
      const end = Math.max(this.#anchorIndex, index)
      vals = items
        .slice(start, end + 1)
        .filter((i) => !i.disabled)
        .map((i) => i.value)
    } else if (this.multiple && (event.metaKey || event.ctrlKey)) {
      const set = new Set(items.filter((i) => i.selected).map((i) => i.value))
      if (set.has(item.value)) set.delete(item.value)
      else set.add(item.value)
      vals = [...set]
      this.#anchorIndex = index
    } else {
      vals = [item.value]
      this.#anchorIndex = index
    }
    this.#activeIndex = index
    this.#applySelection(vals, true)
    item.focus()
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (this.disabled) return
    const items = this._items
    const enabled = items.filter((i) => !i.disabled)
    if (enabled.length === 0) return

    let current = this.#activeIndex
    if (current < 0 || current >= items.length || items[current]?.disabled) {
      current = items.findIndex((i) => i.selected && !i.disabled)
      if (current < 0) current = items.indexOf(enabled[0] as VfListItem)
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const dir = event.key === 'ArrowDown' ? 1 : -1
        if (this.multiple && event.shiftKey) {
          // Extend the selection from the anchor to the moved-to row.
          const next = this.#step(current, dir)
          if (this.#anchorIndex < 0 || this.#anchorIndex >= items.length) {
            this.#anchorIndex = current
          }
          const start = Math.min(this.#anchorIndex, next)
          const end = Math.max(this.#anchorIndex, next)
          const vals = items
            .slice(start, end + 1)
            .filter((i) => !i.disabled)
            .map((i) => i.value)
          this.#activeIndex = next
          this.#applySelection(vals, true)
          this.#focusTo(next)
        } else if (this.multiple && (event.metaKey || event.ctrlKey)) {
          // Move the cursor without touching the selection (Space toggles).
          this.#activeIndex = this.#step(current, dir)
          this.#syncTabIndexes()
          this.#focusTo(this.#activeIndex)
        } else {
          const anySelected = items.some((i) => i.selected)
          const next = anySelected ? this.#step(current, dir) : current
          this.#moveTo(next)
        }
        break
      }
      case 'Home': {
        event.preventDefault()
        this.#moveTo(items.indexOf(enabled[0] as VfListItem))
        break
      }
      case 'End': {
        event.preventDefault()
        this.#moveTo(items.indexOf(enabled[enabled.length - 1] as VfListItem))
        break
      }
      case ' ': {
        event.preventDefault()
        const item = items[current]
        if (!item) return
        if (this.multiple) {
          const set = new Set(
            items.filter((i) => i.selected).map((i) => i.value)
          )
          if (set.has(item.value)) set.delete(item.value)
          else set.add(item.value)
          this.#activeIndex = current
          this.#anchorIndex = current
          this.#applySelection([...set], true)
        } else {
          this.#moveTo(current)
        }
        break
      }
    }
  }

  /** Next enabled index from `from` in `dir`, without wrapping. */
  #step(from: number, dir: 1 | -1): number {
    const items = this._items
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
      const item = items[i]
      if (item && !item.disabled) return i
    }
    return from
  }

  /** Selects (replacing) and focuses the item at `index`. */
  #moveTo(index: number): void {
    const item = this._items[index]
    if (!item || item.disabled) return
    this.#activeIndex = index
    this.#anchorIndex = index
    this.#applySelection([item.value], true)
    this.#focusTo(index)
  }

  /** Focuses and scrolls to the item at `index` without selecting it. */
  #focusTo(index: number): void {
    const item = this._items[index]
    if (!item || item.disabled) return
    item.focus()
    item.scrollIntoView({ block: 'nearest' })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-list': VfList
  }
}
