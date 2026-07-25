import { css, html, LitElement } from 'lit'
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from 'lit/decorators.js'
import { vfBase, vfScrollbars } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { ScrollStateController } from '../scroll-state.js'
import { emit } from '../events.js'
import type { VfListItem } from './vf-list-item.js'

const sameValues = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * How long a first-letter type-ahead prefix stays open before the buffer
 * resets, so the next keystroke starts a fresh search.
 */
const TYPEAHEAD_TIMEOUT_MS = 1000

/**
 * `<vf-list>` — the classic System 7 list box.
 *
 * A white, black-bordered scrolling box of `<vf-list-item>` rows with
 * System 7-styled scrollbars (dither track, boxed arrow buttons). The vertical
 * rail is a permanent placeholder — an empty white channel when the rows fit,
 * filling in with dither/thumb/arrows only on overflow (driven by
 * {@link ScrollStateController}). Selection inverts rows. Supports single and
 * multiple selection, roving tabindex, arrow-key navigation, and classic Finder
 * first-letter type-ahead.
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
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
      }
      /* Disabled: the item text dims to gray; the black box border stays. */
      :host([disabled]) {
        color: var(--vf-disabled, #c0c0c0);
      }
      .list {
        max-height: calc(var(--vf-scale, 1) * var(--vf-list-max-height, 200px));
        /* Reserve the vertical rail always. overflow-y: scroll keeps the styled
           track painted; scrollbar-gutter: stable reserves the 16px channel
           (modern Chromium draws a zero-width overlay bar otherwise, so overflow
           alone reserves nothing). ScrollStateController toggles data-overflow-y
           so it reads as a bare white rail until the rows overflow. */
        overflow-y: scroll;
        scrollbar-gutter: stable;
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  @query('.list') private viewport!: HTMLElement | null
  @query('.list-content') private content!: HTMLElement | null

  /** Reserves the vertical rail and toggles it active on overflow. */
  private readonly scrollState = new ScrollStateController(
    this,
    () => this.viewport,
    () => this.content
  )

  /** Allows multiple selection (Shift extends, Cmd/Ctrl toggles). */
  @property({ type: Boolean, reflect: true }) multiple = false

  /** Value of the (first) selected item. Settable. */
  @property() value = ''

  /** Values of all selected items (multiple mode). Settable. */
  @property({ attribute: false }) values: string[] = []

  /** Disables the whole list: dimmed, no interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /**
   * Accessible name for the list, applied as `aria-label` on the host (which
   * carries `role="listbox"`). Without it a caption-less list is announced
   * anonymously. A consumer-supplied `aria-label`/`aria-labelledby` attribute
   * is left alone.
   */
  @property() label = ''

  @queryAssignedElements({ selector: 'vf-list-item', flatten: true })
  private _items!: VfListItem[]

  /** Index of the item that owns the roving tabindex / keyboard cursor. */
  #activeIndex = -1

  /** Index the next Shift+click extends from. */
  #anchorIndex = -1

  /** Accumulated first-letter type-ahead prefix (lowercased). */
  #typeAhead = ''
  #typeAheadTimer?: number

  /** The selection last pushed onto the rows; see {@link #applyIfStale}. */
  #appliedValues: string[] = []

  constructor() {
    super()
    this.addEventListener('click', this.#onClick)
    this.addEventListener('keydown', this.#onKeydown)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('role', 'listbox')
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#resetTypeAhead()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('multiple')) {
      if (this.multiple) this.setAttribute('aria-multiselectable', 'true')
      else this.removeAttribute('aria-multiselectable')
    }
    if (changed.has('disabled')) {
      if (this.disabled) this.setAttribute('aria-disabled', 'true')
      else this.removeAttribute('aria-disabled')
      this.#syncItems()
    }
    // Only clear the attribute when a non-empty label is emptied — on the first
    // update `changed` carries the class-field default (old value `undefined`),
    // and blowing away a consumer's own aria-label there would be wrong.
    if (changed.has('label')) {
      if (this.label) this.setAttribute('aria-label', this.label)
      else if (changed.get('label')) this.removeAttribute('aria-label')
    }
    // Programmatic value/values writes: push down into the items. On the
    // first update the class-field defaults themselves are recorded in
    // `changed` (with `undefined` as the old value); skip the push-down while
    // they are still the empty defaults so already-slotted items keep their
    // markup `selected` attributes for #onSlotChange to adopt.
    if (changed.has('values')) {
      if (changed.get('values') !== undefined || this.values.length > 0) {
        this.#applyIfStale(this.values)
      }
    } else if (changed.has('value')) {
      if (changed.get('value') !== undefined || this.value !== '') {
        this.#applyIfStale(this.value ? [this.value] : [])
      }
    }
  }

  /**
   * Push `vals` onto the rows unless they already carry exactly that
   * selection.
   *
   * Every interactive path applies the selection synchronously and *then*
   * writes `value`/`values`, which re-enters `updated()` above — so without
   * this gate each click, arrow key and type-ahead jump ran a second,
   * byte-identical pass over every row. External writes still land: they reach
   * here with a selection the rows don't have yet.
   */
  #applyIfStale(vals: string[]): void {
    if (sameValues(vals, this.#appliedValues)) return
    this.#applySelection(vals, false)
  }

  protected override render() {
    return html`
      <div class="list vf-scroll" part="list">
        <div class="list-content">
          <slot @slotchange=${this.#onSlotChange}></slot>
        </div>
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
    this.#appliedValues = [...selected]
    const nextValue = selected[0] ?? ''
    if (this.value !== nextValue) this.value = nextValue
    if (!sameValues(this.values, selected)) this.values = selected
    this.#syncItems()
    if (notify && !sameValues(before, selected)) {
      emit(this, 'vf-change', { value: this.value, values: [...selected] })
    }
  }

  /**
   * Pushes list state down to the rows: the roving tabindex (the active — or
   * first selected/enabled — row gets 0) and the list-level disabled flag, so a
   * disabled listbox doesn't present enabled-looking options to a screen reader.
   * `listDisabled` stays separate from each row's own `disabled`, so
   * re-enabling the list doesn't un-disable individually disabled rows.
   * Mirrors `vf-radio-group.syncRadios()`.
   */
  #syncItems(): void {
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
      item.listDisabled = this.disabled
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
          this.#syncItems()
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
      default: {
        // Printable keys drive first-letter type-ahead. Modified keys are the
        // consumer's shortcuts, and Space is the selection toggle handled above,
        // so neither ever joins the prefix.
        if (
          event.key.length !== 1 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        ) {
          break
        }
        // Consumed either way, so a stray letter can't trigger the browser's
        // own quick-find while the list has focus.
        event.preventDefault()
        this.#typeAheadTo(event.key, current)
        break
      }
    }
  }

  /**
   * Classic Finder first-letter type-ahead. Keystrokes accumulate into a prefix
   * that jumps to the next row whose text starts with it; the prefix resets
   * after {@link TYPEAHEAD_TIMEOUT_MS} of silence. The search wraps, skips
   * disabled rows, and selects the row it lands on (as Finder does), so a
   * following Shift+Arrow extends from there.
   */
  #typeAheadTo(key: string, current: number): void {
    const items = this._items
    if (items.length === 0) return

    this.#typeAhead += key.toLowerCase()
    if (this.#typeAheadTimer !== undefined) {
      window.clearTimeout(this.#typeAheadTimer)
    }
    this.#typeAheadTimer = window.setTimeout(
      () => this.#resetTypeAhead(),
      TYPEAHEAD_TIMEOUT_MS
    )

    const prefix = this.#typeAhead
    // Repeating one character cycles the rows starting with it, rather than
    // hunting for a literal "aaa" that no label has.
    const cycling =
      prefix.length > 1 && [...prefix].every((c) => c === prefix[0])
    const needle = cycling ? (prefix[0] as string) : prefix
    // A fresh prefix (or a cycle step) looks past the cursor; a growing prefix
    // re-tests the current row so it can keep matching as the user types.
    const from = prefix.length === 1 || cycling ? current + 1 : current

    for (let i = 0; i < items.length; i++) {
      const index = (from + i) % items.length
      const item = items[index]
      if (!item || item.disabled) continue
      if ((item.textContent ?? '').trim().toLowerCase().startsWith(needle)) {
        this.#moveTo(index)
        return
      }
    }
  }

  #resetTypeAhead(): void {
    if (this.#typeAheadTimer !== undefined) {
      window.clearTimeout(this.#typeAheadTimer)
    }
    this.#typeAheadTimer = undefined
    this.#typeAhead = ''
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

  /**
   * Focuses and scrolls to the item at `index` without selecting it.
   *
   * `block: 'nearest'` is the conventional minimal-scroll listbox pattern and is
   * kept deliberately, with one known consequence: scrollIntoView walks the
   * whole scrollable-ancestor chain, so a list sitting near a viewport edge can
   * nudge the page as well as its own `.list` viewport. Reviewed and accepted —
   * replacing it with hand-computed `scrollTop` math against the internal
   * viewport would trade a well-understood primitive for bespoke geometry.
   */
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
