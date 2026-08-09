import { css, html, LitElement, nothing } from 'lit'
import {
  property,
  query,
  queryAssignedElements,
  state,
} from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { vfBase, vfFocusRing, vfScrollRail } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { ScrollStateController } from '../scroll-state.js'
import { ScrollRailController, renderScrollRail } from '../scroll-rail.js'
import { TypeAheadBuffer } from '../type-ahead.js'
import { emit } from '../events.js'
import type { VfListItem } from './vf-list-item.js'

const sameValues = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * `<vf-list>` — the classic System 7 list box.
 *
 * A white, black-bordered scrolling box of `<vf-list-item>` rows with the
 * kit-drawn System 7 scroll rail (dither trough, boxed arrow buttons, fixed
 * thumb — the shared `vfScrollRail` subtree, synced to the native scrolling
 * by {@link ScrollRailController}). The vertical rail is a permanent
 * placeholder — an empty white channel when the rows fit, filling in with
 * dither/thumb/arrows only on overflow (driven by
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
 * @cssprop [--vf-list-max-height=200px] - `vf-list` max height before its rail
 *   takes over (the host adds the 2px frame)
 * @cssprop --vf-scrollbar-thumb - scrollbar thumb/elevator (white)
 * @cssprop --vf-scrollbar-track - the scroll trough's base color under the
 *   dot-dither (white)
 */
@vfElement('vf-list')
export class VfList extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    vfScrollRail,
    css`
      :host {
        display: block;
      }
      /* Disabled: the item text dims to gray; the black box border stays. */
      :host([disabled]) {
        color: var(--vf-disabled, #c0c0c0);
      }
      /* The snapped wrapper: a real 1px frame (the rail's outer line), the
         [rows | rail] grid — the rail sizes itself to the 15px inside the
         frame — and everything riding the grid-snap offset as one. */
      .box {
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        background: var(--vf-white, #fff);
        display: grid;
        grid-template-columns: 1fr auto;
      }
      .list {
        grid-area: 1 / 1;
        min-width: 0;
        background: var(--vf-white, #fff);
        /* The clamp is the content box's — the .box border adds the 2px frame
           on top, keeping the clamped total where it always was. */
        max-height: calc(var(--vf-scale, 1) * var(--vf-list-max-height, 200px));
        /* Native scrolling; the bar itself is hidden by the recipe
           (.vf-scroll) and the reservation is the rail element, not a native
           gutter. The rows run to the rail on the right.

           The mod() padding is border-floor compensation: engines floor a
           fractional border-width to whole CSS px (1.5px renders 1px), which
           would put the rows a fraction of a system px inside the frame at
           scale 1.5 or 4/3 — and the rows are LIGHT-DOM components, so their
           origins are the page's device-pixel-grid contract, not just ours.
           Padding is stored exactly, so border + mod(border's fraction)
           restores the exact 1-system-px inset the borderless-scroller
           construction used to give them, at every scale (mod is 0 at whole
           ones). */
        padding: mod(calc(var(--vf-scale, 1) * 1px), 1px);
        padding-right: 0;
        overflow-y: auto;
      }
      .vf-rail--vertical {
        grid-area: 1 / 2;
      }
      /* The viewport is itself the Tab stop while the list is disabled (see
         render()); the ring keeps that stop visible, inset to stay in-box. */
      .list:focus-visible {
        --vf-focus-offset: -2px;
        ${vfFocusRing}
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
    () => this.content,
    (overflow) => {
      this._scrollable = overflow.x || overflow.y
    }
  )

  /** Syncs the drawn rail to the row viewport and drives its interactions. */
  private readonly rail = new ScrollRailController(this, {
    getScroll: () => this.viewport,
    getContent: () => this.content,
  })

  /** Whether the rows actually overflow the box (either axis). */
  @state() private _scrollable = false

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

  /** First-letter type-ahead over the rows; see src/type-ahead.ts. */
  readonly #typeAhead = new TypeAheadBuffer()

  /** The selection last pushed onto the rows; see {@link #applyIfStale}. */
  #appliedValues: string[] = []

  /**
   * ARIA goes through internals, never `setAttribute` on the host: internals
   * values are *defaults*, so a consumer's own `role`/`aria-*` on the tag wins
   * — the platform's own precedence, and the opposite of what a host
   * `setAttribute` gives. See SPEC §2.
   */
  readonly #internals = this.attachInternals()

  constructor() {
    super()
    this.#internals.role = 'listbox'
    this.addEventListener('click', this.#onClick)
    this.addEventListener('keydown', this.#onKeydown)
    // A row disabled in place may be the very row holding the roving tab
    // stop; re-sync so the stop moves somewhere reachable.
    this.addEventListener('vf-list-item-disabled-change', () => {
      this.#syncItems()
    })
  }

  /**
   * Moves keyboard focus to the row holding the roving tab stop — or, while
   * the list is disabled, to the scrolling viewport (the disabled list's own
   * Tab stop; the rows are all at -1 then). Overridden because the platform's
   * `focus()` is a silent no-op on this host — no `delegatesFocus`, no host
   * tabindex — so `vf-label for` (which calls `target.focus()`) never reached
   * the list.
   */
  override focus(options?: FocusOptions): void {
    if (this.disabled) {
      this.viewport?.focus(options)
      return
    }
    this._items?.find((i) => i.tabIndex === 0)?.focus(options)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#typeAhead.reset()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('multiple')) {
      this.#internals.ariaMultiSelectable = this.multiple ? 'true' : null
    }
    if (changed.has('disabled')) {
      this.#internals.ariaDisabled = this.disabled ? 'true' : null
      this.#syncItems()
    }
    // Written unconditionally: an empty label clears the internals default
    // rather than the host, so a consumer's own aria-label is never in reach
    // to be blown away and needs no first-update guard.
    if (changed.has('label')) this.#internals.ariaLabel = this.label || null
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
    // While the list is disabled every row goes to -1 and #onKeydown returns
    // early — but the rows stay rendered and readable (System 7 dims a list,
    // it doesn't hide it), and the box still clips at its max height. The
    // viewport itself becomes the Tab stop then, so a keyboard user can
    // scroll the dimmed rows the browser's own way; only when there is
    // actually something to scroll, matching vf-scroll-area.
    return html`
      <div class="box vf-snap">
        <div
          class="list vf-scroll"
          part="list"
          tabindex=${this.disabled && this._scrollable ? '0' : nothing}
        >
          <div class="list-content">
            <slot @slotchange=${this.#onSlotChange}></slot>
          </div>
        </div>
        ${renderScrollRail(this.rail, 'vertical')}
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
      // Discard a stale cursor BEFORE the fallbacks: `??` only falls through
      // on nullish, so a cursor resting on a row that has since been disabled
      // would otherwise win the chain here and then fail the enabled test
      // below — leaving every row at -1 and the listbox unreachable by Tab.
      const cursor =
        this.#activeIndex >= 0 ? items[this.#activeIndex] : undefined
      active =
        (cursor && !cursor.disabled ? cursor : undefined) ??
        items.find((i) => i.selected && !i.disabled) ??
        items.find((i) => !i.disabled)
      // Keep the cursor pointing at the row that actually holds the tab stop,
      // so the next keyboard move starts from where focus really is.
      this.#activeIndex = active ? items.indexOf(active) : -1
    }
    for (const item of items) {
      item.listDisabled = this.disabled
      item.tabIndex = item === active ? 0 : -1
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

    // Select-all, before the switch: `event.key` is the letter, so it would
    // otherwise fall into the type-ahead default and be dropped as modified.
    // Multiple mode only — single mode has no "all" to select, and the page
    // keeps its own select-all there.
    if (
      this.multiple &&
      (event.key === 'a' || event.key === 'A') &&
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault()
      this.#applySelection(
        enabled.map((i) => i.value),
        true
      )
      return
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const dir = event.key === 'ArrowDown' ? 1 : -1
        if (this.multiple && event.shiftKey) {
          // Extend the selection from the anchor to the moved-to row.
          this.#extendTo(this.#step(current, dir), current)
        } else if (this.multiple && (event.metaKey || event.ctrlKey)) {
          // Move the cursor without touching the selection (Space toggles).
          this.#cursorTo(this.#step(current, dir))
        } else {
          const anySelected = items.some((i) => i.selected)
          const next = anySelected ? this.#step(current, dir) : current
          this.#moveTo(next)
        }
        break
      }
      case 'Home':
      case 'End': {
        event.preventDefault()
        const index = items.indexOf(
          (event.key === 'Home'
            ? enabled[0]
            : enabled[enabled.length - 1]) as VfListItem
        )
        if (this.multiple && event.shiftKey) {
          // Shift(+Ctrl)+Home/End: extend the selection through to the end.
          this.#extendTo(index, current)
        } else if (this.multiple) {
          // A plain jump moves the cursor only. Selecting here would rewrite
          // a hand-built multi-selection with one keystroke (single mode has
          // nothing to lose — the selection IS the cursor and moves with it,
          // below). Finder's Home never selected either; it scrolled.
          this.#cursorTo(index)
        } else {
          this.#moveTo(index)
        }
        break
      }
      case ' ': {
        event.preventDefault()
        const item = items[current]
        if (!item) return
        if (this.multiple && event.shiftKey) {
          // Shift+Space: select the contiguous run from the anchor to the
          // cursor (the keyboard's Shift+click).
          this.#extendTo(current, current)
        } else if (this.multiple) {
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
        // Printable keys drive the shared first-letter type-ahead
        // (src/type-ahead.ts). Modified keys are the consumer's shortcuts,
        // and Space is the selection toggle handled above, so neither ever
        // joins the prefix.
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
        const index = this.#typeAhead.feed(
          event.key,
          current,
          items.map((i) => ({ text: i.textContent ?? '', disabled: i.disabled }))
        )
        if (index < 0) break
        // Single mode selects the row it lands on (as Finder does), so a
        // following Shift+Arrow extends from there. Multiple mode only moves
        // the cursor — the same jump would rewrite a hand-built selection —
        // and Space is how the reached row joins it.
        if (this.multiple) this.#cursorTo(index)
        else this.#moveTo(index)
        break
      }
    }
  }

  /**
   * Moves the keyboard cursor (roving tab stop + focus) to `index` without
   * touching the selection — the multiple-mode focus move (Ctrl+Arrow, plain
   * Home/End, type-ahead), where Space then acts on the row it reached.
   */
  #cursorTo(index: number): void {
    if (index < 0) return
    this.#activeIndex = index
    this.#syncItems()
    this.#focusTo(index)
  }

  /**
   * Selects exactly the contiguous run from the anchor to `index` — adopting
   * `from` as the anchor when none is set — and moves the cursor there. The
   * shape every Shift extension shares: Shift+Arrow, Shift(+Ctrl)+Home/End,
   * Shift+Space.
   */
  #extendTo(index: number, from: number): void {
    const items = this._items
    if (index < 0) return
    if (this.#anchorIndex < 0 || this.#anchorIndex >= items.length) {
      this.#anchorIndex = from
    }
    const start = Math.min(this.#anchorIndex, index)
    const end = Math.max(this.#anchorIndex, index)
    const vals = items
      .slice(start, end + 1)
      .filter((i) => !i.disabled)
      .map((i) => i.value)
    this.#activeIndex = index
    this.#applySelection(vals, true)
    this.#focusTo(index)
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
