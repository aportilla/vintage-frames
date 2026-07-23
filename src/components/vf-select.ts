import { css, html, nothing } from 'lit'
import type { PropertyValues } from 'lit'
import { customElement, property, query, queryAssignedElements, state } from 'lit/decorators.js'
import { vfBase, vfDisplay, vfFocus, vfPanel } from '../styles/base.js'
import { CARET_DOWN, glyphSvg } from '../glyphs.js'
import { VfOption } from './vf-option.js'
import { ScaleController, sys } from '../scale.js'
import { prefersReducedMotion } from '../motion.js'
import { VfFormControl } from '../form-control.js'

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
 * in-place release) whether it was a quick tap or a held press.
 *
 * Keyboard: Space/Enter/ArrowDown open; while open ArrowUp/ArrowDown move the
 * highlight, Home/End jump, Enter/Space select, Escape cancels. Selecting an
 * item plays the classic inversion blink (~250 ms) before closing.
 *
 * Form-associated: submits `value` under `name`.
 *
 * @fires vf-change - After a selection commits. `detail: { value: string }`.
 *
 * @slot - `<vf-option>` elements.
 *
 * @csspart control - The closed popup control box.
 * @csspart label - The selected-option label inside the control.
 * @csspart arrow - The black ▼ triangle.
 * @csspart panel - The popup panel (listbox).
 */
@customElement('vf-select')
export class VfSelect extends VfFormControl {
  /**
   * Height of one option row — the pill's *content* height (`--vf-control-height`
   * 22px minus its two 1px borders). Used to overlay the selected row's white
   * cell exactly on the closed pill. Must match `vf-option`'s row height.
   */
  private static readonly ITEM_HEIGHT = 20

  /**
   * In-place press+release shorter than this (ms) reads as a modern
   * click-to-open — the list stays open for a second click; a longer in-place
   * hold-then-release reads as a completed System 7 press and closes. Only the
   * *in-place* case consults time: any press that travels to another item is a
   * drag-pick regardless of duration.
   */
  private static readonly PRESS_HOLD_MS = 200

  static override styles = [
    vfBase,
    vfDisplay,
    vfPanel,
    vfFocus,
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
        display: flex;
        align-items: center;
        gap: calc(var(--vf-scale, 1) * 8px);
        /* No intrinsic min-width: the control hugs the WIDEST option (via the
           label sizer below). Authors wanting a floor set min-width on the host,
           or grow it in their own layout (e.g. flex: 1). */
        width: 100%;
        height: calc(var(--vf-scale, 1) * var(--vf-control-height, 22px));
        /* Left inset = the checkmark gutter (--vf-select-gutter), so the selected
           label sits at the SAME x it will occupy in the open list (where the ✓
           fills that gutter). The right inset stays the small 8px. */
        padding: 0 calc(var(--vf-scale, 1) * 8px) 0
          calc(var(--vf-scale, 1) * var(--vf-select-gutter, 22px));
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        border-radius: 0;
        box-shadow: calc(var(--vf-scale, 1) * 1px) calc(var(--vf-scale, 1) * 1px)
          0 0 var(--vf-black, #000);
        /* The press-drag gesture owns pointer moves while the button is held;
           suppress the browser's own touch panning/scrolling so a touch drag
           tracks the list instead of scrolling the page. */
        touch-action: none;
        cursor: default;
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
        overflow-y: auto;
      }
      .panel.open {
        display: block;
      }
    `,
  ]

  /** Value of the selected option. Adopts the first enabled option if unset. */
  @property() value = ''

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /**
   * Accessible name for the combobox control (`aria-label`). Without it the
   * control is announced by its contents, i.e. the selected value.
   */
  @property() label = ''

  /** Whether the popup panel is open. */
  @state() private open = false

  @query('.control') private controlEl!: HTMLDivElement | null

  @query('.panel') private panelEl!: HTMLDivElement | null

  @queryAssignedElements({ selector: 'vf-option' })
  private assignedOptions!: VfOption[]

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Index of the highlighted option while the panel is open. */
  private activeIndex = -1

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

  private blinkTimer: number | undefined

  /** Value restored by `formResetCallback`; captured on first slot change. */
  private defaultValue = ''
  private defaultCaptured = false

  constructor() {
    super()
    this.addEventListener('pointerdown', this.handleHostPointerDown)
    this.addEventListener('click', this.handleHostClick)
    this.addEventListener('keydown', this.handleHostKeyDown)
    this.addEventListener('pointerover', this.handleHostPointerOver)
    this.addEventListener('focusout', this.handleHostFocusOut)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.cancelBlink()
    this.endPress()
    this.open = false
    this.removeDocumentListeners()
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
    this.value = this.defaultValue
  }

  private get optionItems(): VfOption[] {
    return this.assignedOptions ?? []
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
    // Adopt the first enabled option when no value was authored, like a
    // native <select>.
    if (this.value === '') {
      const first = this.optionItems.find((o) => !o.disabled)
      if (first) this.value = this.optionValue(first)
    }
    if (!this.defaultCaptured) {
      this.defaultCaptured = true
      this.defaultValue = this.value
    }
    this.applySelection()
    this.requestUpdate() // the closed-control label mirrors option content
  }

  // ---------------------------------------------------------------- opening

  private async openPanel(): Promise<void> {
    if (this.open || this.isDisabled) return
    this.open = true
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
    window.addEventListener('scroll', this.handleWindowScroll, true)
    window.addEventListener('resize', this.handleWindowResize)
    await this.updateComplete
    const options = this.optionItems
    let index = options.findIndex((o) => o.selected && !o.disabled)
    if (index === -1) index = this.firstEnabledIndex()
    this.positionPanel(Math.max(index, 0))
    if (index !== -1) this.setActive(index)
  }

  /**
   * Positions the fixed-position panel so the selected item sits directly
   * over the closed control (classic popup behavior), clamped to the
   * viewport with a 4px margin.
   */
  private positionPanel(selectedIndex: number): void {
    const control = this.controlEl
    const panel = this.panelEl
    if (!control || !panel) return
    const rect = control.getBoundingClientRect()
    // getBoundingClientRect is in real (already-scaled) CSS px, so the system-px
    // constants (item height, borders, viewport margins) are converted with sys().
    // The panel is exactly the control's width — which already hugs the widest
    // option — so the open list lines up with the closed pill.
    panel.style.minWidth = `${rect.width}px`
    panel.style.maxHeight = `${window.innerHeight - sys(8, this)}px`
    const panelRect = panel.getBoundingClientRect()
    // Overlay the selected row's white cell directly on the pill's white content,
    // so its text and whitespace match the closed pill and the list grows down.
    // With the row height = the pill's content height, the panel's own top border
    // then lands exactly on the pill's top border (no ±1px compensation needed).
    let top = rect.top - selectedIndex * sys(VfSelect.ITEM_HEIGHT, this)
    top = Math.max(sys(4, this), Math.min(top, window.innerHeight - panelRect.height - sys(4, this)))
    let left = rect.left
    left = Math.max(sys(4, this), Math.min(left, window.innerWidth - panelRect.width - sys(4, this)))
    // Both coordinates come straight from the control's rect (unsnapped): the
    // panel is the pill's own width and overlays it, so it must share the pill's
    // exact edges and its selected row must sit exactly on the pill's label.
    // Snapping to the device grid here would translate the panel off the pill
    // whenever it sits at a fractional position (it follows variable-width content
    // in a flex row) — the panel instead inherits the pill's own pixel phase.
    panel.style.top = `${top}px`
    panel.style.left = `${left}px`
  }

  private closePanel(refocusControl: boolean): void {
    if (!this.open) return
    this.open = false
    this.cancelBlink()
    this.endPress()
    this.clearActive()
    this.removeDocumentListeners()
    if (refocusControl) this.controlEl?.focus()
  }

  private removeDocumentListeners(): void {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    window.removeEventListener('scroll', this.handleWindowScroll, true)
    window.removeEventListener('resize', this.handleWindowResize)
  }

  // ------------------------------------------------------------- highlight

  private setActive(index: number, focusOption = true): void {
    this.activeIndex = index
    this.optionItems.forEach((option, i) => {
      option.active = i === index
    })
    if (focusOption) {
      const option = this.optionItems[index]
      option?.focus({ preventScroll: true })
      // Keep the highlighted option visible inside the scrollable panel.
      option?.scrollIntoView({ block: 'nearest' })
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
    this.activeIndex = index
    this.optionItems.forEach((o, i) => {
      o.active = i === index
    })
    // Reduced motion: skip the ~250ms blink and commit immediately.
    if (prefersReducedMotion()) {
      this.commit(option)
      return
    }
    this.blinking = true
    let ticks = 0
    this.blinkTimer = window.setInterval(() => {
      ticks += 1
      option.active = ticks % 2 === 0
      if (ticks >= 6) {
        this.cancelBlink()
        this.commit(option)
      }
    }, 42)
  }

  private cancelBlink(): void {
    if (this.blinkTimer !== undefined) {
      window.clearInterval(this.blinkTimer)
      this.blinkTimer = undefined
    }
    this.blinking = false
  }

  private commit(option: VfOption): void {
    this.closePanel(true)
    const value = this.optionValue(option)
    this.value = value
    this.dispatchEvent(
      new CustomEvent('vf-change', {
        detail: { value },
        bubbles: true,
        composed: true,
      })
    )
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
    this.pressDownTime = event.timeStamp
    this.pressDownX = event.clientX
    this.pressDownY = event.clientY
    this.pressOpenedPanel = !this.open
    // We drive focus and highlight ourselves; block the browser's text-range
    // selection / default focus so a drag doesn't select the labels.
    event.preventDefault()
    document.addEventListener('pointermove', this.handlePressPointerMove, true)
    document.addEventListener('pointerup', this.handlePressPointerUp, true)
    document.addEventListener('pointercancel', this.handlePressCancel, true)
    if (this.pressOpenedPanel) {
      this.controlEl?.focus()
      // openPanel lays the selected row over the pill; capture the row actually
      // under the pointer once it has, so a viewport-clamped panel (whose
      // selected row is NOT under the pointer) still measures movement from the
      // true origin.
      void this.openPanel().then(() => {
        if (this.pressing && this.pressStartOption === null) {
          this.pressStartOption = this.optionAtPoint(this.pressDownX, this.pressDownY)
        }
      })
    } else {
      this.pressStartOption = this.optionAtPoint(event.clientX, event.clientY)
    }
  }

  private handlePressPointerMove = (event: PointerEvent): void => {
    if (!this.pressing) return
    event.preventDefault()
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
    const option = this.optionAtPoint(event.clientX, event.clientY)
    const openedByThisPress = this.pressOpenedPanel
    const inPlace = !this.pressMoved
    const quick = event.timeStamp - this.pressDownTime < VfSelect.PRESS_HOLD_MS
    this.endPress()
    // Modern click-to-open: a quick in-place tap on the closed pill leaves the
    // list open for a second, independent click.
    if (openedByThisPress && inPlace && quick) return
    // Otherwise it's a completed pick/dismiss — a drag onto an item, a held
    // in-place press, or a press on the already-open list.
    this.resolveRelease(option)
  }

  private handlePressCancel = (): void => {
    // Pointer interrupted (e.g. a cancelled touch). Stop tracking but leave the
    // list as-is — the click-to-open state; the user can retry or dismiss it.
    this.endPress()
  }

  private endPress(): void {
    if (!this.pressing) return
    this.pressing = false
    this.pressStartOption = null
    document.removeEventListener('pointermove', this.handlePressPointerMove, true)
    document.removeEventListener('pointerup', this.handlePressPointerUp, true)
    document.removeEventListener('pointercancel', this.handlePressCancel, true)
  }

  /** The option whose row currently contains the viewport point, if any. */
  private optionAtPoint(x: number, y: number): VfOption | null {
    if (!this.open) return null
    for (const option of this.optionItems) {
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
      default:
        break
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

  private handleWindowScroll = (event: Event): void => {
    if (this.blinking) return
    if (event.target === this.panelEl) return // the panel's own scrolling
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
        class="control vf-focus ${disabled ? 'disabled' : ''}"
        part="control"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-disabled=${disabled ? 'true' : 'false'}
        aria-controls="listbox"
        aria-label=${this.label || nothing}
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
        aria-label=${this.label || nothing}
        aria-hidden=${this.open ? 'false' : 'true'}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-select': VfSelect
  }
}
