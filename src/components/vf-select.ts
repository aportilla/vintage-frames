import { css, html, LitElement, nothing } from 'lit'
import type { PropertyValues } from 'lit'
import { customElement, property, query, queryAssignedElements, state } from 'lit/decorators.js'
import { vfBase, vfDisplay, vfFocus, vfPanel } from '../styles/base.js'
import { CARET_DOWN, glyphSvg } from '../glyphs.js'
import { VfOption } from './vf-option.js'
import { ScaleController, snapToDevicePx, sys } from '../scale.js'
import { prefersReducedMotion } from '../motion.js'

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
export class VfSelect extends LitElement {
  /** Participate in native forms via ElementInternals. */
  static formAssociated = true

  /** Height of one option row, used to align the popup over the control. */
  private static readonly ITEM_HEIGHT = 22

  static override styles = [
    vfBase,
    vfDisplay,
    vfPanel,
    vfFocus,
    css`
      :host {
        display: inline-block;
      }
      .control {
        display: flex;
        align-items: center;
        gap: calc(var(--vf-scale, 1) * 8px);
        width: 100%;
        min-width: calc(var(--vf-scale, 1) * 120px);
        height: calc(var(--vf-scale, 1) * var(--vf-control-height, 22px));
        padding: 0 calc(var(--vf-scale, 1) * 8px);
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        border-radius: 0;
        box-shadow: calc(var(--vf-scale, 1) * 1px) calc(var(--vf-scale, 1) * 1px)
          0 0 var(--vf-black, #000);
        cursor: default;
      }
      .label {
        flex: 1 1 auto;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        text-align: left;
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
        min-width: calc(var(--vf-scale, 1) * 120px);
        overflow-y: auto;
      }
      .panel.open {
        display: block;
      }
    `,
  ]

  /** Value of the selected option. Adopts the first enabled option if unset. */
  @property() value = ''

  /** Disables the control: gray label; box, arrow and shadow stay black; no interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Form field name used when submitting the associated form. */
  @property({ reflect: true }) name = ''

  /**
   * Accessible name for the combobox control (`aria-label`). Without it the
   * control is announced by its contents, i.e. the selected value.
   */
  @property() label = ''

  /** Whether the popup panel is open. */
  @state() private open = false

  /** True while an ancestor `<fieldset disabled>` disables this control. */
  @state() private formDisabled = false

  @query('.control') private controlEl!: HTMLDivElement | null

  @query('.panel') private panelEl!: HTMLDivElement | null

  @queryAssignedElements({ selector: 'vf-option' })
  private assignedOptions!: VfOption[]

  private readonly internals: ElementInternals = this.attachInternals()

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Index of the highlighted option while the panel is open. */
  private activeIndex = -1

  /** True while the classic selection blink is playing (input is ignored). */
  private blinking = false

  private blinkTimer: number | undefined

  /** Value restored by `formResetCallback`; captured on first slot change. */
  private defaultValue = ''
  private defaultCaptured = false

  constructor() {
    super()
    this.addEventListener('click', this.handleHostClick)
    this.addEventListener('keydown', this.handleHostKeyDown)
    this.addEventListener('pointerover', this.handleHostPointerOver)
    this.addEventListener('focusout', this.handleHostFocusOut)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.cancelBlink()
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
      this.internals.setFormValue(this.isDisabled ? null : this.value)
    }
    if (changed.has('disabled') && this.disabled && this.open) {
      this.closePanel(false)
    }
  }

  /** Effective disabled state: the `disabled` prop or fieldset disabling. */
  private get isDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  /**
   * Form-associated lifecycle: called when an ancestor (e.g.
   * `<fieldset disabled>`) disables or re-enables this control. Tracked
   * separately from the public `disabled` prop so re-enabling the fieldset
   * restores the control instead of leaving its own attribute stamped.
   */
  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
    this.internals.setFormValue(this.isDisabled ? null : this.value)
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
    panel.style.minWidth = `${Math.max(rect.width, sys(120))}px`
    panel.style.maxHeight = `${window.innerHeight - sys(8)}px`
    const panelRect = panel.getBoundingClientRect()
    // sys(1) = the panel border above the first item.
    let top = rect.top - sys(1) - selectedIndex * sys(VfSelect.ITEM_HEIGHT)
    top = Math.max(sys(4), Math.min(top, window.innerHeight - panelRect.height - sys(4)))
    let left = rect.left
    left = Math.max(sys(4), Math.min(left, window.innerWidth - panelRect.width - sys(4)))
    // The control's rect is wherever layout put it — snap the fixed panel
    // onto the device grid so its 1px chrome stays fringe-free (scale.ts).
    panel.style.top = `${snapToDevicePx(top)}px`
    panel.style.left = `${snapToDevicePx(left)}px`
  }

  private closePanel(refocusControl: boolean): void {
    if (!this.open) return
    this.open = false
    this.cancelBlink()
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

  private handleHostClick = (event: MouseEvent): void => {
    if (this.isDisabled || this.blinking) return
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
    if (!this.open || this.blinking) return
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
        <span class="label" part="label">${selectedLabel}</span>
        <span class="arrow" part="arrow" aria-hidden="true"
          >${glyphSvg(CARET_DOWN, 'caret')}</span
        >
      </div>
      <div
        id="listbox"
        class="panel vf-panel ${this.open ? 'open' : ''}"
        part="panel"
        role="listbox"
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
