import { css, html, LitElement } from 'lit'
import { customElement, property, queryAssignedElements } from 'lit/decorators.js'
import { vfBase, vfScrollbars } from '../styles/base.js'
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
    vfScrollbars,
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
      <div class="list vf-scroll" part="list">
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
