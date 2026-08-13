import { css, html, nothing } from 'lit'
import type { PropertyValues } from 'lit'
import { property, query, queryAssignedElements, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay, vfFocusUnderline, vfPanel } from '../styles/base.js'
import { CARET_DOWN, CARET_UP, glyphSvg } from '../glyphs.js'
import { VfOption } from './vf-option.js'
import { ScaleController, sys } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { DocumentListenersController } from '../document-listeners.js'
import {
  runSelectionBlink,
  MENU_SCROLL_INTERVAL_MS,
  PRESS_HOLD_MS,
  type BlinkHandle,
} from '../motion.js'
import {
  clampScroll,
  ensureVisibleScroll,
  firstPickableRow,
  lastPickableRow,
  layoutClampedPopup,
} from '../popup-overflow.js'
import { VfShadowRoleControl } from '../form-control.js'
import { FocusRuleController } from '../focus-modality.js'
import { TypeAheadBuffer } from '../type-ahead.js'
import { emit, emitNative } from '../events.js'

/**
 * `<vf-select>` — the classic System 7 popup menu control ("Macintosh HD ▼").
 *
 * Children are `<vf-option>` elements in the default slot. The closed control
 * is a white box with a 1px black border, the small 1px hard shadow, the
 * selected option's label on the left and a solid black ▼ triangle on the
 * right. The open panel uses the shared `.vf-panel` recipe and is positioned
 * `position: fixed` (computed from `getBoundingClientRect()`) so it escapes
 * clipping containers; when possible the currently-selected item opens
 * directly over the control, like the real popup menu.
 *
 * Pointer — two interaction styles are supported and disambiguated by the
 * gesture itself, resolved at the first pointer release:
 *   - System 7 press-drag-release: press the pill (the list appears under the
 *     pointer), drag onto an item, release over it to pick — one continuous
 *     press. Releasing over the current item or off the list closes with no
 *     change.
 *   - Modern click-to-open: a quick in-place click (no drag, released within
 *     {@link PRESS_HOLD_MS}) leaves the list open; a second, independent click
 *     then picks an item.
 * The two share one opening trigger (pointerdown) and diverge only on how the
 * press ends — whether the pointer travelled to another item, and (for an
 * in-place release) whether it was a quick tap or a held press. The pull-down
 * menus drive themselves the same way, on the same threshold; that half lives
 * in src/menu-press.ts, because one menu press may travel across a whole bar.
 *
 * A list too tall for the screen is **clipped**, never scrolled: the edge slot
 * with items beyond it shows a solid arrow instead of a row, which rolls the
 * list one row at a time while the pointer rests on it. The clamp is quantized
 * to the pill lattice, so a clipped popup still opens with its selected row
 * over the closed pill — and the panel keeps every slot the list asked for, so
 * a box that had to slide to fit the screen opens with *blank rows* at whichever
 * end the list no longer reaches: the exact travel it will roll through, in
 * either direction. See src/popup-overflow.ts.
 *
 * Keyboard: Space/Enter/ArrowDown open; while open ArrowUp/ArrowDown move the
 * highlight, Home/End jump, Enter/Space select, Escape cancels. Selecting an
 * item plays the classic inversion blink (~250 ms) before closing. Keyboard
 * focus is marked with the kit's 1px dashed rule under the closed pill
 * (`vfFocusUnderline`) rather than a ring around it — keyboard only, which
 * here means the page's input modality rather than `:focus-visible` (the pill
 * drives its own focus, and Blink reads that as visible either way).
 *
 * Form-associated: submits `value` under `name`.
 *
 * @fires vf-change - After a selection commits. `detail: { value: string }`.
 * @fires input - Native event, dispatched from the host per committed pick
 *   (with `change`, the pair a native `<select>` fires). A programmatic
 *   `value` set fires nothing.
 * @fires change - Native event, dispatched from the host per committed pick
 *   so form delegation and framework bindings hear it.
 *
 * @slot - `<vf-option>` elements.
 *
 * @csspart control - The closed popup control box.
 * @csspart label - The selected-option label inside the control.
 * @csspart arrow - The black ▼ triangle.
 * @csspart panel - The popup panel (listbox).
 * @csspart scroll-arrow - Either of the two scroll arrows a clipped panel shows
 *   in its edge row slots.
 * @cssprop [--vf-popup-height=18px] - `vf-select` pill (border box; its 1px
 *   hard shadow makes the sheet's 157×19 ink box)
 * @cssprop [--vf-popup-inset-top=4px] - room a clipped popup panel keeps clear
 *   at the TOP screen edge — set it once on `:root` (or the `vf-desktop`) to
 *   clear a `vf-menu-bar`: `24px` is the 20px bar plus the default 4
 * @cssprop [--vf-popup-inset-bottom=4px] - room a clipped popup panel keeps
 *   clear at the BOTTOM screen edge
 * @cssprop [--vf-select-gutter=16px] - checkmark column: `vf-select` left inset
 *   / `vf-option` + `vf-menu-item` ✓ column (shared so the value doesn't shift
 *   on open)
 */
@vfElement('vf-select')
export class VfSelect extends VfPositioned(VfShadowRoleControl) {
  /**
   * Fallback height of one option row — the pill's *content* height
   * (`--vf-popup-height` 18px minus its two 1px borders). Used to overlay the
   * selected row's white cell exactly on the closed pill. `positionPanel`
   * prefers the row's *rendered* height so a re-themed `--vf-popup-height`
   * keeps the overlay aligned; this is the no-options fallback and must match
   * `vf-option`'s default row height.
   */
  private static readonly ITEM_HEIGHT = 16

  static override styles = [
    vfBase,
    vfDisplay,
    vfPanel,
    css`
      :host {
        /* A popup menu is sized to its widest option — never stretched to fill
           its container. fit-content holds that intrinsic width even inside a
           stretching flex/grid parent (align-items / justify-items: stretch act
           only on auto sizes), while still shrinking if the container is genuinely
           too narrow. Authors opt into filling via flex:1 / width / align-self. */
        display: inline-block;
        width: fit-content;
      }
      .control {
        /* Also the anchor the focus rule below hangs from. */
        position: relative;
        display: flex;
        align-items: center;
        gap: calc(var(--vf-scale, 1) * 8px);
        /* No intrinsic min-width: the control hugs the WIDEST option (via the
           label sizer below). Authors wanting a floor set min-width on the host,
           or grow it in their own layout (e.g. flex: 1). */
        width: 100%;
        /* 18px, not the 22px fields: the reference pill measures 156×18 plus
           its 1px hard shadow (the 157×19 ink box on the sheet). */
        height: calc(var(--vf-scale, 1) * var(--vf-popup-height, 18px));
        /* Left inset = the checkmark gutter (--vf-select-gutter), so the selected
           label sits at the SAME x it will occupy in the open list (where the ✓
           fills that gutter). The right inset stays the small 8px. */
        padding: 0 calc(var(--vf-scale, 1) * 8px) 0
          calc(var(--vf-scale, 1) * var(--vf-select-gutter, 16px));
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        border-radius: 0;
        box-shadow: calc(var(--vf-scale, 1) * 1px) calc(var(--vf-scale, 1) * 1px)
          0 0 var(--vf-black, #000);
        /* The press-drag gesture owns pointer moves while the button is held;
           suppress the browser's own touch panning/scrolling so a touch drag
           tracks the list instead of scrolling the page. */
        touch-action: none;
        cursor: var(--vf-cursor, default);
      }
      /* Keyboard focus is the kit's dashed rule under the pill, not a ring
         around it (see vfFocusUnderline). It goes BELOW the whole box rather
         than inside the face the way vf-button underlines its label: the pill
         has one line and the label already shares it with the ▼.

         The offset counts every row of ink below the pseudo-element's padding
         box before the blank row and the rule itself — the 1px border, then
         the 1px hard shadow: −(1 + 1 + 1 + 1). The ±1px sides widen it from
         that same padding box to the border box, which is the shape the pill
         reads as (the shadow is a depth cue, not part of the silhouette).

         Gated on a class, not :focus-visible — the same problem the editable
         fields have, arrived at from the other direction. The pill suppresses
         the browser's own mouse focus (the press-drag gesture owns it) and
         calls focus() itself: on pointerdown to open, and again when a release
         closes the list. Blink reads a scripted focus as a visible one, so
         :focus-visible is TRUE after a pure mouse round-trip through the menu,
         where on a button it is false. FocusRuleController consults the page's
         last input modality instead (see src/focus-modality.ts), and render()
         holds the class off while the list is open — see there. */
      .control:focus-visible {
        outline: none;
      }
      .control.vf-focus-rule::after {
        --vf-focus-underline-offset: -4px;
        ${vfFocusUnderline}
        left: calc(var(--vf-scale, 1) * -1px);
        right: calc(var(--vf-scale, 1) * -1px);
      }
      /* The label is a 1×1 grid: the visible value and an invisible stack of
         every option's text share the one cell, so the cell — and thus the
         control and the open panel — is sized to the WIDEST option. The closed
         pill and the open list are therefore always exactly the same width, and
         the value never shifts as the selection changes. */
      .label {
        flex: 1 1 auto;
        display: grid;
        min-width: 0;
        text-align: left;
      }
      .label > .value,
      .label > .sizer {
        grid-area: 1 / 1;
        min-width: 0;
        white-space: nowrap;
      }
      .value {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Sizer contributes width only: collapsed to zero height and clipped so it
         never adds a row, but its widest line still drives the grid cell width. */
      .sizer {
        display: flex;
        flex-direction: column;
        height: 0;
        overflow: hidden;
        visibility: hidden;
        pointer-events: none;
      }
      .arrow {
        flex: none;
        display: flex;
        align-items: center;
        /* Stays solid black even when disabled — only the label dims. */
        color: var(--vf-black, #000);
      }
      .arrow svg {
        display: block;
        width: calc(var(--vf-scale, 1) * 11px);
        height: calc(var(--vf-scale, 1) * 6px);
      }
      /* Disabled: only the value label dims; the box, hard shadow and ▼ arrow
         stay solid black (System 7 dims the label, not the control). */
      :host([disabled]) .label,
      .control.disabled .label {
        color: var(--vf-disabled, #c0c0c0);
      }
      .panel {
        display: none;
        position: fixed;
        z-index: 10000;
        margin: 0;
        padding: 0;
        /* Match the closed pill's 1px hard shadow — the shared .vf-panel recipe
           defaults to the 2px menu shadow, which would overhang the pill's shadow
           by 1px on the right and bottom. */
        --vf-shadow-offset: 1px;
        /* A CLIP, never a scroll surface: positionPanel gives the panel a whole
           number of row slots and the rows are rolled by transform inside it.
           System 7 put no scrollbar on a menu, and an un-quantized native scroll
           would break the row lattice the pill overlay is built on. */
        overflow: hidden;
        /* The screen-edge reserve, resolved here and read back by
           positionPanel: the clamp is JS geometry, so the tokens can't be spent
           in a declaration, but their defaults and the cascade still belong in
           the stylesheet with every other token. Authored (unscaled) system px,
           like --vf-popup-height. Internal names — the knobs are
           --vf-popup-inset-top / --vf-popup-inset-bottom. */
        --vf-popup-clamp-top: var(--vf-popup-inset-top, 4px);
        --vf-popup-clamp-bottom: var(--vf-popup-inset-bottom, 4px);
      }
      .panel.open {
        display: block;
      }
      /* The rolling strip — a box for the options to ride, whose translateY
         positionPanel and the arrow timer write. Transform rather than
         scrollTop: both keep
         getBoundingClientRect() truthful for hit-testing, but a transform can't
         be hijacked — the browser will scroll an overflow:hidden box on its own
         initiative (focus without preventScroll, find-in-page, an outside
         scrollIntoView), and any un-quantized scroll lands the rows off the
         lattice. The offset is a whole count of rows, and a row is a whole count
         of device px by the layout contract, so rolled rows stay on the grid. */
      .rows {
        display: block;
      }
      /* An arrow OVERLAYS the edge slot — an opaque white row covering the item
         beneath, which is the mechanism rather than a side effect: the row is
         still there, still in the accessibility tree, just not pickable while
         the arrow is on it. */
      .arrow-slot {
        display: none;
        position: absolute;
        left: 0;
        right: 0;
        height: calc(var(--vf-scale, 1) * (var(--vf-popup-height, 18px) - 2px));
        background: var(--vf-white, #fff);
        color: var(--vf-black, #000);
        cursor: var(--vf-cursor, default);
      }
      .arrow-slot.shown {
        display: block;
      }
      .arrow-slot.up {
        top: 0;
      }
      .arrow-slot.down {
        bottom: 0;
      }
      /* Pinned at whole offsets rather than centred, the way vf-option pins its
         ✓ at 3,3. Traced from a real System 7 popup clipped at the screen edge
         (Find File's criteria menu under Infinite Mac, 2×): the 11×6 triangle's
         ink sits 13px in from the panel's content edge and 5px down its 16px row
         — which is the row's exact vertical centre, and 5 is whole, so the
         centring costs nothing. Whole px at every scale is the point; a glyph
         centred in an odd-width panel would land on a half pixel and fringe. */
      .arrow-slot svg {
        position: absolute;
        left: calc(var(--vf-scale, 1) * 13px);
        top: calc(var(--vf-scale, 1) * 5px);
        display: block;
        width: calc(var(--vf-scale, 1) * 11px);
        height: calc(var(--vf-scale, 1) * 6px);
      }
    `,
  ]

  /** Value of the selected option. Adopts the first enabled option if unset. */
  @property() value = ''

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /**
   * Accessible name for the combobox control (`aria-label`). Left empty, the
   * name falls back to whatever the host carries — `aria-labelledby`,
   * `aria-label` or an associated `<label for>` — via
   * {@link VfShadowRoleControl.hostLabel}; with neither, the control is announced by
   * its contents, i.e. the selected value.
   */
  @property() label = ''

  /** No option committed — the state `required` calls a missing value. */
  protected override get valueMissing(): boolean {
    return this.value === ''
  }

  /** The message a native `<select required>` reports. */
  protected override get valueMissingMessage(): string {
    return 'Please select an item in the list.'
  }

  /** Whether the popup panel is open. */
  @state() private open = false

  @query('.control') private controlEl!: HTMLDivElement | null

  @query('.panel') private panelEl!: HTMLDivElement | null

  @query('.rows') private rowsEl!: HTMLDivElement | null

  @query('.arrow-slot.up') private upArrowEl!: HTMLDivElement | null

  @query('.arrow-slot.down') private downArrowEl!: HTMLDivElement | null

  @queryAssignedElements({ selector: 'vf-option' })
  private assignedOptions!: VfOption[]

  /**
   * Assigned options, cached from the last slotchange. `render()` reads this
   * reactive state (via {@link optionItems}) instead of the live query above,
   * which is empty on the first paint — the source of the empty-label /
   * zero-width-sizer flash.
   */
  @state() private cachedOptions: VfOption[] = []

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * Whether the closed pill wears the kit's dashed focus rule — keyboard focus
   * only, which this control can't read off `:focus-visible` (see the CSS).
   */
  private readonly focusRule = new FocusRuleController(this)

  /** While the panel is open: outside dismissal, and closing when a scroll or
   *  resize would strand the fixed-position panel away from the pill. */
  private readonly panelListeners = new DocumentListenersController(this, () => [
    [document, 'pointerdown', this.handleDocumentPointerDown, true],
    [window, 'scroll', this.handleWindowScroll, true],
    [window, 'resize', this.handleWindowResize],
  ])

  /** While a press gesture is in flight: track it to its release anywhere. */
  private readonly pressListeners = new DocumentListenersController(this, () => [
    [document, 'pointermove', this.handlePressPointerMove, true],
    [document, 'pointerup', this.handlePressPointerUp, true],
    [document, 'pointercancel', this.handlePressCancel, true],
  ])

  /** Index of the highlighted option while the panel is open. */
  private activeIndex = -1

  /**
   * Overflow state for the open panel, all three settled by
   * {@link positionPanel} and only the scroll moving afterwards. `rowScroll` is
   * how many rows the strip is rolled up past the panel's top edge, so slot `i`
   * shows option `rowScroll + i` — and it deliberately leaves the range that
   * would fill every slot, which is the reserved blank the list rolls through:
   * negative for blank above, past `rowCount − visibleSlots` for blank below.
   * See src/popup-overflow.ts. (Named for the rows and not just `scroll`
   * because `HTMLElement.scroll()` already owns that word.)
   */
  private rowScroll = 0
  /** Row slots the open panel was drawn with (`R`). */
  private visibleSlots = 0
  /** Measured height of one option row, CSS px — the roll's own step. */
  private rowHeight = 0

  /** Whether rows are hidden above / below what the panel shows. */
  private get showUpArrow(): boolean {
    return this.rowScroll > 0
  }

  private get showDownArrow(): boolean {
    return this.rowScroll < this.optionItems.length - this.visibleSlots
  }

  /**
   * The one arrow-scroll timer, with the direction it is rolling. A single
   * owner for both entry paths (a resting pointer, and a press-drag into the
   * arrow's zone) so the two can't stack two intervals on one arrow.
   */
  private arrowScroll: { dir: 1 | -1; timer: number } | null = null

  /** Set when a press *began* in an arrow zone — that press is not a pick. */
  private pressStartArrow: 'up' | 'down' | null = null

  /**
   * Pointer press-gesture state. A press starts on `pointerdown` and is
   * resolved on the matching `pointerup`/`pointercancel`; see the class doc.
   */
  private pressing = false
  /** True when *this* press is the one that opened the panel. */
  private pressOpenedPanel = false
  /** Set once the pointer leaves the option it pressed on (a drag-pick). */
  private pressMoved = false
  /** The option the press started over — origin for {@link pressMoved}. */
  private pressStartOption: VfOption | null = null
  /** `event.timeStamp` of the opening pointerdown (for the hold threshold). */
  private pressDownTime = 0
  private pressDownX = 0
  private pressDownY = 0
  /**
   * Swallows the one `click` the browser synthesises after a pointer press
   * (pointerdown+pointerup), so the pointer handlers — not
   * {@link handleHostClick} — own mouse/touch input. A `click` with no
   * preceding pointerdown (keyboard / assistive-tech activation) still reaches
   * the click handler.
   */
  private swallowClick = false

  /** True while the classic selection blink is playing (input is ignored). */
  private blinking = false

  private blinkHandle: BlinkHandle | undefined

  /** First-letter type-ahead over the open list; see src/type-ahead.ts. */
  private readonly typeAhead = new TypeAheadBuffer()

  constructor() {
    super()
    this.addEventListener('pointerdown', this.handleHostPointerDown)
    this.addEventListener('click', this.handleHostClick)
    this.addEventListener('keydown', this.handleHostKeyDown)
    this.addEventListener('pointerover', this.handleHostPointerOver)
    this.addEventListener('focusout', this.handleHostFocusOut)
  }

  override disconnectedCallback(): void {
    // super's controller teardown already detached both listener sets.
    super.disconnectedCallback()
    this.cancelBlink()
    this.stopArrowScroll()
    // Clear any stamped `active` flags on the options: a select disconnected
    // mid-open/mid-blink otherwise keeps an inverted highlight row when
    // reconnected (closePanel's clearActive() only runs on a normal close).
    this.clearActive()
    this.endPress()
    this.open = false
  }

  /** Focuses the popup control. */
  override focus(options?: FocusOptions): void {
    this.controlEl?.focus(options)
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('value')) {
      this.applySelection()
    }
    if (changed.has('value') || changed.has('disabled')) {
      this.syncFormValue(this.value)
    }
    if (changed.has('disabled') && this.disabled && this.open) {
      this.closePanel(false)
    }
  }

  /**
   * Form-associated lifecycle: also re-syncs the form value immediately (the
   * gated `updated()` doesn't run on a `formDisabled` change) and closes an open
   * panel when an ancestor `<fieldset disabled>` disables us.
   */
  override formDisabledCallback(disabled: boolean): void {
    super.formDisabledCallback(disabled)
    this.syncFormValue(this.value)
    if (disabled && this.open) this.closePanel(false)
  }

  /** Restores the initial value when the associated form resets. */
  formResetCallback(): void {
    this.value = this.formDefault('')
  }

  private get optionItems(): VfOption[] {
    return this.cachedOptions
  }

  /** Resolved value of an option (falls back to its text, like `<option>`). */
  private optionValue(option: VfOption): string {
    return option.value !== '' ? option.value : (option.textContent ?? '').trim()
  }

  /** Marks the option matching `value` as selected. */
  private applySelection(): void {
    for (const option of this.optionItems) {
      option.selected = this.optionValue(option) === this.value
    }
  }

  private handleSlotChange = (): void => {
    // Cache the assigned options so render() reads reactive @state rather than
    // the live query (empty on first paint). Reassigning the array drives the
    // update — the closed-control label mirrors option content — so no explicit
    // requestUpdate() is needed.
    this.cachedOptions = this.assignedOptions ?? []
    // Adopt the first enabled option when no value was authored, like a
    // native <select>.
    if (this.value === '') {
      const first = this.optionItems.find((o) => !o.disabled)
      if (first) this.value = this.optionValue(first)
    }
    // Latch the reset default only once options actually exist, so an
    // async-populated menu doesn't capture the empty pre-population value and
    // then reset to '' instead of the first-option default.
    if (this.optionItems.length) this.latchFormDefault(this.value)
    this.applySelection()
  }

  // ---------------------------------------------------------------- opening

  private async openPanel(): Promise<void> {
    if (this.open || this.isDisabled) return
    this.open = true
    this.panelListeners.attach()
    await this.updateComplete
    const options = this.optionItems
    let index = options.findIndex((o) => o.selected && !o.disabled)
    if (index === -1) index = this.firstEnabledIndex()
    this.positionPanel(Math.max(index, 0))
    if (index !== -1) this.setActive(index)
  }

  /**
   * Positions the fixed-position panel so the selected item sits directly over
   * the closed control (classic popup behavior), clipped to the usable screen
   * band at a whole number of row slots.
   */
  private positionPanel(selectedIndex: number): void {
    const control = this.controlEl
    const panel = this.panelEl
    if (!control || !panel) return
    // Batch both reads before any style writes: a write between the two rect
    // reads would invalidate layout and force the second read to reflow. The
    // panel is display:block by now (openPanel awaited updateComplete) and its
    // width already hugs the same widest option as the control, so we measure it
    // once and clamp horizontally with the control's own width.
    // getBoundingClientRect is in real (already-scaled) CSS px, so the system-px
    // constants (item height, borders, viewport margins) are converted with sys().
    const rect = control.getBoundingClientRect()
    // Further reads, still before any write (consecutive reads don't re-reflow):
    // the row's rendered height, so a consumer who re-themes --vf-popup-height
    // keeps the selected-row overlay aligned instead of drifting by index; the
    // panel's own border, which the clamp has to fit around; and the two screen-
    // edge insets, parked on the panel by the stylesheet in authored system px.
    const rowRect = this.optionItems[0]?.getBoundingClientRect()
    const rowHeight = rowRect?.height || sys(VfSelect.ITEM_HEIGHT, this)
    const panelStyle = getComputedStyle(panel)
    const border = parseFloat(panelStyle.borderTopWidth) || 0
    const inset = (name: string): number =>
      sys(parseFloat(panelStyle.getPropertyValue(name)) || 0, this)
    // Overlay the selected row's white cell directly on the pill's white content,
    // so its text and whitespace match the closed pill and the list grows down.
    // With the row height = the pill's content height, the panel's own top border
    // then lands exactly on the pill's top border (no ±1px compensation needed).
    // Where the list doesn't fit, the clamp gives ground a whole ROW at a time
    // off this same lattice, so the overlay survives it — see popup-overflow.ts.
    const layout = layoutClampedPopup({
      idealTop: rect.top - selectedIndex * rowHeight,
      rowHeight,
      border,
      rowCount: this.optionItems.length,
      viewTop: inset('--vf-popup-clamp-top'),
      viewBottom: window.innerHeight - inset('--vf-popup-clamp-bottom'),
    })
    // NO horizontal clamp: the panel is the pill's own width, positioned at the
    // pill's own left, so it is on-screen exactly when the pill is — a viewport
    // margin here can only ever break the closed↔open alignment, never rescue
    // it. The old `Math.max(sys(4), …)` fired for any pill within 4 system px
    // (12 CSS px at the default 3×) of the left edge and shoved the panel right,
    // so the label jumped on open — the exact thing the shared gutter exists to
    // prevent. If the pill itself is off-screen the panel follows it off-screen,
    // which is correct: the panel tracks its pill.
    const left = rect.left
    // Both coordinates come straight from the control's rect (unsnapped): the
    // panel is the pill's own width and overlays it, so it must share the pill's
    // exact edges and its selected row must sit exactly on the pill's label.
    // Snapping to the device grid here would translate the panel off the pill
    // whenever it sits at a fractional position (it follows variable-width content
    // in a flex row) — the panel instead inherits the pill's own pixel phase.
    panel.style.minWidth = `${rect.width}px`
    panel.style.top = `${layout.panelTop}px`
    panel.style.left = `${left}px`
    // Stated, not left to the content: the panel is drawn ONCE at its clamped
    // height and never moves or resizes for the rest of the open — scrolling
    // rolls the rows inside it.
    panel.style.height = `${layout.panelHeight}px`
    // (The panel is as tall as the LIST asked for, capped by the band — not as
    // tall as the rows it can show yet. A box that had to slide to fit the
    // screen therefore opens with blank slots at whichever end the strip no
    // longer reaches — above when it slid up, below when it slid down — and
    // that blank is exactly the travel the roll consumes: scrolling to that
    // end lands the strip flush with the panel, precisely full.)
    this.rowHeight = rowHeight
    this.visibleSlots = layout.visibleSlots
    this.rowScroll = layout.initialScroll
    this.applyScroll()
  }

  private closePanel(refocusControl: boolean): void {
    if (!this.open) return
    this.open = false
    this.cancelBlink()
    this.stopArrowScroll()
    this.endPress()
    this.clearActive()
    // A type-ahead prefix doesn't survive the panel it was typed into.
    this.typeAhead.reset()
    this.panelListeners.detach()
    if (refocusControl) this.controlEl?.focus()
  }

  // --------------------------------------------------------------- overflow

  /**
   * Writes the current scroll state to the panel: the strip's offset, and which
   * arrows are showing. Both are imperative rather than rendered — an arrow
   * step has to be visible to the very next hit-test in a drag, and nothing
   * else re-renders this component while the panel is open.
   */
  private applyScroll(): void {
    const offset = this.rowScroll * this.rowHeight
    if (this.rowsEl) {
      this.rowsEl.style.transform = offset ? `translateY(${-offset}px)` : ''
    }
    this.upArrowEl?.classList.toggle('shown', this.showUpArrow)
    this.downArrowEl?.classList.toggle('shown', this.showDownArrow)
  }

  /** Rolls the list so row `index` sits in a pickable slot (no-op if it does). */
  private revealRow(index: number): void {
    const next = ensureVisibleScroll(
      index,
      this.rowScroll,
      this.optionItems.length,
      this.visibleSlots
    )
    if (next === this.rowScroll) return
    this.rowScroll = next
    this.applyScroll()
  }

  /** One row toward `dir`; returns false at the bound (nothing left to roll). */
  private stepArrowScroll(dir: 1 | -1): boolean {
    const next = clampScroll(
      this.rowScroll + dir,
      this.rowScroll,
      this.optionItems.length,
      this.visibleSlots
    )
    if (next === this.rowScroll) return false
    this.rowScroll = next
    this.applyScroll()
    return true
  }

  /**
   * Starts rolling the list while the pointer holds an arrow. Steps once
   * immediately — a brief touch of the arrow must do *something* — then once
   * per {@link MENU_SCROLL_INTERVAL_MS} until the bound or {@link
   * stopArrowScroll}. Idempotent per direction, so the hover path and the
   * press-drag path can both claim the same arrow without stacking timers.
   */
  private startArrowScroll(dir: 1 | -1): void {
    if (this.arrowScroll?.dir === dir) return
    this.stopArrowScroll()
    if (!this.stepArrowScroll(dir)) return
    const timer = window.setInterval(() => {
      if (!this.stepArrowScroll(dir)) this.stopArrowScroll()
    }, MENU_SCROLL_INTERVAL_MS)
    this.arrowScroll = { dir, timer }
  }

  private stopArrowScroll(): void {
    if (!this.arrowScroll) return
    window.clearInterval(this.arrowScroll.timer)
    this.arrowScroll = null
  }

  /**
   * Which arrow's zone the viewport point falls in, for the press-drag path.
   *
   * The zone is the arrow's row **extended past the panel edge** in its own
   * direction — the classic ergonomics of slamming the pointer to the screen
   * edge to keep a menu scrolling. Hover entry doesn't use this (it rides
   * `pointerenter` on the slot itself); a pointer that has left the panel
   * entirely is only scrolling because a press is dragging it there.
   */
  private arrowZoneAtPoint(x: number, y: number): 'up' | 'down' | null {
    const panel = this.panelEl
    if (!this.open || !panel) return null
    const r = panel.getBoundingClientRect()
    if (x < r.left || x >= r.right) return null
    const border = (r.height - this.visibleSlots * this.rowHeight) / 2
    if (this.showUpArrow && y < r.top + border + this.rowHeight) return 'up'
    if (this.showDownArrow && y >= r.bottom - border - this.rowHeight) return 'down'
    return null
  }

  /**
   * Which arrow *slot* the point is inside — the drawn row itself, with none of
   * {@link arrowZoneAtPoint}'s reach past the panel edge. This is the plain
   * "is the pointer on the arrow" question the hover contract asks.
   */
  private arrowSlotAtPoint(x: number, y: number): 'up' | 'down' | null {
    const slots = [
      ['up', this.upArrowEl],
      ['down', this.downArrowEl],
    ] as const
    for (const [dir, el] of slots) {
      if (!el || !el.classList.contains('shown')) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return dir
    }
    return null
  }

  /** Apply the hover contract at a point: on an arrow it rolls, off one it stops. */
  private hoverArrowAt(x: number, y: number): void {
    const slot = this.arrowSlotAtPoint(x, y)
    if (!slot) {
      this.stopArrowScroll()
      return
    }
    this.startArrowScroll(slot === 'up' ? -1 : 1)
    // One rule, every entry path: a pointer on an arrow means nothing is
    // highlighted. The arrow row is not an item, and leaving the old highlight
    // lit would strand it — the row it marks is on its way out of the panel.
    if (this.activeIndex !== -1) this.clearActive()
  }

  /**
   * `pointerenter` **and** `pointermove` on the slots: a pointer that was
   * already still where the arrow appeared never gets an enter event, and it
   * is exactly the pointer most likely to be there — an arrow shows up under
   * the very click that opened the panel whenever the pill sits near a screen
   * edge. `pointerup` covers the wholly motionless case (see
   * {@link handlePressPointerUp}); this covers the first twitch after it.
   */
  private handleArrowEnter = (event: PointerEvent): void => {
    // While a press is in flight handlePressPointerMove owns the timer (its
    // zones reach past the panel edge, where enter/leave say nothing).
    if (!this.open || this.blinking || this.pressing) return
    this.hoverArrowAt(event.clientX, event.clientY)
  }

  private handleArrowLeave = (): void => {
    if (this.pressing) return
    this.stopArrowScroll()
  }

  // ------------------------------------------------------------- highlight

  private setActive(index: number, focusOption = true): void {
    this.activeIndex = index
    this.optionItems.forEach((option, i) => {
      option.active = i === index
    })
    // Roll a clipped list until the highlight is on a pickable slot. Every
    // keyboard path (arrows, Home/End, type-ahead) and the open-time placement
    // funnel through here, so all of them scroll correctly for free.
    this.revealRow(index)
    if (focusOption) {
      // preventScroll is what keeps the browser from natively scrolling the
      // clipped panel out from under the transform.
      this.optionItems[index]?.focus({ preventScroll: true })
    }
  }

  private clearActive(): void {
    this.activeIndex = -1
    for (const option of this.optionItems) option.active = false
  }

  /** Moves the highlight by `delta`, skipping disabled options. No wrap. */
  private moveActive(delta: number): void {
    const options = this.optionItems
    let i = this.activeIndex
    for (let step = 0; step < options.length; step += 1) {
      i += delta
      if (i < 0 || i >= options.length) return
      const option = options[i]
      if (option && !option.disabled) {
        this.setActive(i)
        return
      }
    }
  }

  private firstEnabledIndex(): number {
    return this.optionItems.findIndex((o) => !o.disabled)
  }

  private lastEnabledIndex(): number {
    const options = this.optionItems
    for (let i = options.length - 1; i >= 0; i -= 1) {
      const option = options[i]
      if (option && !option.disabled) return i
    }
    return -1
  }

  // ------------------------------------------------------------- selection

  /** Plays the classic selection blink, then commits and closes. */
  private selectOption(option: VfOption): void {
    if (option.disabled || this.blinking) return
    const index = this.optionItems.indexOf(option)
    // Highlight without moving focus — the same activation setActive() applies
    // (blink keeps focus on the control), so reuse it instead of re-looping.
    this.setActive(index, false)
    this.blinking = true
    // Shared primitive owns the timing + reduced-motion short-circuit; under
    // reduced motion it commits synchronously (no blink), clearing the flag
    // before we retain the handle.
    const handle = runSelectionBlink(
      (on) => {
        option.active = on
      },
      () => {
        this.commit(option)
      }
    )
    if (this.blinking) this.blinkHandle = handle
  }

  private cancelBlink(): void {
    this.blinkHandle?.cancel()
    this.blinkHandle = undefined
    this.blinking = false
  }

  private commit(option: VfOption): void {
    this.closePanel(true)
    const value = this.optionValue(option)
    this.value = value
    emit(this, 'vf-change', { value })
    emitNative(this, 'input')
    emitNative(this, 'change')
  }

  // ---------------------------------------------------------------- events

  private optionFromEvent(event: Event): VfOption | undefined {
    return event.composedPath().find((n): n is VfOption => n instanceof VfOption)
  }

  /**
   * `click` handler for *synthesised* activation — keyboard/assistive-tech
   * clicks that arrive with no preceding pointerdown. Real mouse/touch clicks
   * are swallowed here (their {@link swallowClick} flag was set on pointerdown)
   * because the pointer handlers already resolved the gesture.
   */
  private handleHostClick = (event: MouseEvent): void => {
    if (this.isDisabled) return
    if (this.swallowClick) {
      this.swallowClick = false
      return
    }
    if (this.blinking) return
    const option = this.optionFromEvent(event)
    if (option) {
      if (this.open) this.selectOption(option)
      return
    }
    if (this.open) {
      this.closePanel(true)
    } else {
      this.controlEl?.focus()
      void this.openPanel()
    }
  }

  // ------------------------------------------------------- pointer gesture

  /**
   * Starts a press: opens the list if closed, then tracks the press to its
   * release. Both interaction styles begin here; the gesture is classified in
   * {@link handlePressPointerUp}.
   */
  private handleHostPointerDown = (event: PointerEvent): void => {
    if (this.isDisabled || this.blinking) return
    // Primary button / single touch / pen only — ignore right/middle and extra
    // touch points so a secondary press can't hijack an in-flight gesture.
    if (event.button > 0 || !event.isPrimary) return
    // The pointer handlers own this gesture; neutralise the trailing click.
    this.swallowClick = true
    this.pressing = true
    this.pressMoved = false
    this.pressStartOption = null
    this.pressStartArrow = null
    this.pressDownTime = event.timeStamp
    this.pressDownX = event.clientX
    this.pressDownY = event.clientY
    this.pressOpenedPanel = !this.open
    // We drive focus and highlight ourselves; block the browser's text-range
    // selection / default focus so a drag doesn't select the labels.
    event.preventDefault()
    this.pressListeners.attach()
    if (this.pressOpenedPanel) {
      this.controlEl?.focus()
      // openPanel lays the selected row over the pill; capture the row actually
      // under the pointer once it has, so a viewport-clamped panel (whose
      // selected row is NOT under the pointer) still measures movement from the
      // true origin.
      void this.openPanel().then(() => {
        if (this.pressing && this.pressStartOption === null) {
          this.pressStartArrow = this.arrowZoneAtPoint(this.pressDownX, this.pressDownY)
          this.pressStartOption = this.optionAtPoint(this.pressDownX, this.pressDownY)
        }
      })
    } else {
      this.pressStartArrow = this.arrowZoneAtPoint(event.clientX, event.clientY)
      this.pressStartOption = this.optionAtPoint(event.clientX, event.clientY)
    }
  }

  private handlePressPointerMove = (event: PointerEvent): void => {
    if (!this.pressing) return
    event.preventDefault()
    // An arrow outranks the row hit-test: while the pointer is in a zone the
    // list is rolling and nothing is highlighted — the arrow row is not an item.
    const zone = this.arrowZoneAtPoint(event.clientX, event.clientY)
    if (zone) {
      this.startArrowScroll(zone === 'up' ? -1 : 1)
      if (this.activeIndex !== -1) this.clearActive()
      return
    }
    this.stopArrowScroll()
    const option = this.optionAtPoint(event.clientX, event.clientY)
    if (this.pressStartOption === null) {
      // Opening not settled yet (see handleHostPointerDown): adopt the first
      // resolved row as the origin rather than counting it as movement.
      this.pressStartOption = option
    } else if (!this.pressMoved && option !== this.pressStartOption) {
      this.pressMoved = true
    }
    this.trackHighlight(option)
  }

  private handlePressPointerUp = (event: PointerEvent): void => {
    if (!this.pressing) return
    const zone = this.arrowZoneAtPoint(event.clientX, event.clientY)
    const option = zone ? null : this.optionAtPoint(event.clientX, event.clientY)
    const startedOnArrow = this.pressStartArrow !== null
    const openedByThisPress = this.pressOpenedPanel
    const inPlace = !this.pressMoved
    const quick = event.timeStamp - this.pressDownTime < PRESS_HOLD_MS
    this.endPress()
    // Two releases leave the list up: a press that BEGAN on an arrow (the arrow
    // is not an item, so clicking one is neither a pick nor a dismissal — its
    // trailing `click` is already neutralised by swallowClick, so
    // handleHostClick needs no carve-out of its own), and the modern
    // click-to-open tap. Both hand the pointer back to the hover contract,
    // which is also how an arrow drawn *under* a motionless pointer starts
    // rolling at all: the panel was placed a moment ago, so no `pointerenter`
    // was ever coming for it.
    if (startedOnArrow || (openedByThisPress && inPlace && quick)) {
      this.hoverArrowAt(event.clientX, event.clientY)
      return
    }
    this.stopArrowScroll()
    // Otherwise it's a completed pick/dismiss — a drag onto an item, a held
    // in-place press, or a press on the already-open list. A release over an
    // arrow zone lands here with `option` null and closes with no change, the
    // same as any release on a non-item.
    this.resolveRelease(option)
  }

  private handlePressCancel = (): void => {
    // Pointer interrupted (e.g. a cancelled touch). Stop tracking but leave the
    // list as-is — the click-to-open state; the user can retry or dismiss it.
    this.stopArrowScroll()
    this.endPress()
  }

  private endPress(): void {
    if (!this.pressing) return
    this.pressing = false
    this.pressStartOption = null
    this.pressStartArrow = null
    this.pressListeners.detach()
  }

  /**
   * The option whose row currently contains the viewport point, if any.
   *
   * Two guards keep a clipped panel honest. The point must be inside the
   * panel's own box — rows rolled out of view keep truthful rects *outside* the
   * clip, so without this a drag above the panel would highlight a hidden row.
   * And only the pickable range is searched: a row lying under a shown arrow is
   * covered, and covered is not clickable.
   */
  private optionAtPoint(x: number, y: number): VfOption | null {
    const panel = this.panelEl
    if (!this.open || !panel) return null
    const p = panel.getBoundingClientRect()
    if (x < p.left || x >= p.right || y < p.top || y >= p.bottom) return null
    const first = firstPickableRow(this.rowScroll)
    const last = lastPickableRow(this.rowScroll, this.optionItems.length, this.visibleSlots)
    for (let i = first; i <= last; i += 1) {
      const option = this.optionItems[i]
      if (!option) continue
      const r = option.getBoundingClientRect()
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return option
    }
    return null
  }

  /** Live highlight during a press-drag; never moves DOM focus off the control. */
  private trackHighlight(option: VfOption | null): void {
    if (option && !option.disabled) {
      const index = this.optionItems.indexOf(option)
      if (index !== -1 && index !== this.activeIndex) this.setActive(index, false)
    } else if (this.activeIndex !== -1) {
      this.clearActive()
    }
  }

  /**
   * Resolves a press that ended as a pick/dismiss (not a click-to-open): commit
   * a different, enabled option (with the blink); otherwise close with no change
   * — released on the current item, a disabled item, or off the list (the
   * classic "release outside" cancel).
   */
  private resolveRelease(option: VfOption | null): void {
    if (!option || option.disabled || this.optionValue(option) === this.value) {
      this.closePanel(true)
      return
    }
    this.selectOption(option)
  }

  private handleHostKeyDown = (event: KeyboardEvent): void => {
    if (this.isDisabled) return
    if (this.blinking) {
      event.preventDefault()
      return
    }
    if (!this.open) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault()
        void this.openPanel()
      }
      return
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.moveActive(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        this.moveActive(-1)
        break
      case 'Home': {
        event.preventDefault()
        const first = this.firstEnabledIndex()
        if (first !== -1) this.setActive(first)
        break
      }
      case 'End': {
        event.preventDefault()
        const last = this.lastEnabledIndex()
        if (last !== -1) this.setActive(last)
        break
      }
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const option = this.optionItems[this.activeIndex]
        if (option) this.selectOption(option)
        break
      }
      case 'Escape':
        event.preventDefault()
        this.closePanel(true)
        break
      case 'Tab':
        // Let focus move on; close without cancelling the tab.
        this.closePanel(false)
        break
      default: {
        // Printable keys run the shared Finder type-ahead over the open list
        // (src/type-ahead.ts), moving the highlight to the matched option —
        // native <select> and the APG select-only combobox both do. Space
        // never reaches here (it commits, above); modified keys stay the
        // consumer's shortcuts.
        if (
          event.key.length !== 1 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        ) {
          break
        }
        event.preventDefault()
        const index = this.typeAhead.feed(
          event.key,
          this.activeIndex,
          this.optionItems.map((o) => ({
            text: o.textContent ?? '',
            disabled: o.disabled,
          }))
        )
        if (index !== -1) this.setActive(index)
        break
      }
    }
  }

  private handleHostPointerOver = (event: PointerEvent): void => {
    // While a press is in flight, handlePressPointerMove owns the highlight
    // (coordinate hit-testing that also works under touch's implicit capture);
    // this hover tracker only runs for a mouse hovering the already-open list.
    if (!this.open || this.blinking || this.pressing) return
    const option = this.optionFromEvent(event)
    if (option && !option.disabled) {
      const index = this.optionItems.indexOf(option)
      if (index !== -1 && index !== this.activeIndex) this.setActive(index)
    }
  }

  private handleHostFocusOut = (event: FocusEvent): void => {
    if (!this.open || this.blinking) return
    const next = event.relatedTarget
    if (next instanceof Node && (this.contains(next) || this.renderRoot.contains(next))) {
      return
    }
    this.closePanel(false)
  }

  private handleDocumentPointerDown = (event: Event): void => {
    if (this.blinking) return
    if (!event.composedPath().includes(this)) this.closePanel(false)
  }

  /**
   * Any scroll strands a `position: fixed` panel away from the pill it was
   * placed against, so the popup closes. That now includes a scroll of the
   * panel itself: it is a clip, not a scroll surface, and nothing in the
   * component ever scrolls it — but an `overflow: hidden` box is still
   * programmatically scrollable, and a browser that decides to scroll one
   * (find-in-page, an outside `scrollIntoView`) would slide the rows off the
   * lattice. Closing is the safe read of a scroll that can't legitimately
   * happen.
   */
  private handleWindowScroll = (): void => {
    if (this.blinking) return
    this.closePanel(false)
  }

  /** Close on viewport resize: the fixed panel was placed from the control's
   *  rect when it opened and would otherwise drift out of alignment. */
  private handleWindowResize = (): void => {
    if (this.blinking) return
    this.closePanel(false)
  }

  // ---------------------------------------------------------------- render

  protected override render() {
    // Derive the label from `value` (the reactive source of truth), not from
    // each option's `selected` flag. Those flags are refreshed by
    // applySelection() in updated(), which runs *after* render(), so reading
    // them here paints the previously-selected label for a cycle — and because
    // flipping a child's flag doesn't re-render this host, it stays stale.
    const selected = this.optionItems.find((o) => this.optionValue(o) === this.value)
    const selectedLabel = selected ? (selected.textContent ?? '').trim() : ''
    const disabled = this.isDisabled
    return html`
      <div
        class=${classMap({
          control: true,
          'vf-snap': true,
          // Closed only: an open list is itself where focus is, and a panel
          // short enough not to cover the rule (a one-option menu overlays the
          // pill exactly) would otherwise leave a dashed line hanging under it.
          'vf-focus-rule': this.focusRule.marked && !this.open,
          disabled,
        })}
        part="control"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-disabled=${disabled ? 'true' : 'false'}
        aria-controls="listbox"
        aria-label=${this.label || this.hostLabel || nothing}
        aria-describedby=${this.describedBy}
        aria-required=${this.required ? 'true' : nothing}
        aria-invalid=${this.validity.valid ? nothing : 'true'}
        tabindex=${disabled ? '-1' : '0'}
      >
        <span class="label" part="label">
          <span class="value">${selectedLabel}</span>
          <span class="sizer" aria-hidden="true">
            ${this.optionItems.map(
              (o) => html`<span>${(o.textContent ?? '').trim()}</span>`
            )}
          </span>
        </span>
        <span class="arrow" part="arrow" aria-hidden="true"
          >${glyphSvg(CARET_DOWN, 'caret')}</span
        >
      </div>
      <div
        id="listbox"
        class="panel vf-panel ${this.open ? 'open' : ''}"
        part="panel"
        role="listbox"
        aria-label=${this.label || this.hostLabel || nothing}
        aria-hidden=${this.open ? 'false' : 'true'}
      >
        <!-- role="presentation" so the strip that carries the roll doesn't
             stand between the listbox and the options it owns. -->
        <div class="rows" role="presentation">
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
        <!-- Pointer affordances only, hence aria-hidden: the clipped options
             stay in the accessibility tree un-hidden (clipping is presentation,
             and a native <select> exposes its whole list too), and keyboard and
             AT users reach every row with the arrows, Home/End and type-ahead. -->
        <div
          class="arrow-slot up"
          part="scroll-arrow"
          aria-hidden="true"
          @pointerenter=${this.handleArrowEnter}
          @pointermove=${this.handleArrowEnter}
          @pointerleave=${this.handleArrowLeave}
        >
          ${glyphSvg(CARET_UP, 'caret')}
        </div>
        <div
          class="arrow-slot down"
          part="scroll-arrow"
          aria-hidden="true"
          @pointerenter=${this.handleArrowEnter}
          @pointermove=${this.handleArrowEnter}
          @pointerleave=${this.handleArrowLeave}
        >
          ${glyphSvg(CARET_DOWN, 'caret')}
        </div>
      </div>
      ${this.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-select': VfSelect
  }
}
