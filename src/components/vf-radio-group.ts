import { css, html } from 'lit'
import type { PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { ScaleController } from '../scale.js'
import { vfBase } from '../styles/base.js'
import { VfFormControl } from '../form-control.js'
import { emit } from '../events.js'
import { VfRadio } from './vf-radio.js'

/**
 * Groups `vf-radio` children, owning selection, keyboard navigation and the
 * form value. Renders no chrome of its own; directly slotted radios stack
 * vertically with a 6px gap (override with your own layout if needed —
 * arbitrary markup containing radios also works).
 *
 * Form-associated: submits `value` under `name`, restores the initial value
 * on form reset. Keeps children in sync — the child whose `value` matches
 * the group's `value` is checked, all others unchecked.
 *
 * Keyboard (classic Mac behavior): the group is one tab stop (roving
 * tabindex on the selected radio); ArrowUp/ArrowLeft and
 * ArrowDown/ArrowRight move the selection AND select it, wrapping around
 * and skipping disabled radios.
 *
 * @slot - `vf-radio` elements, or arbitrary markup containing them.
 * @fires vf-change - When the selection changes via user interaction. `detail: { value: string }`.
 */
@vfElement('vf-radio-group')
export class VfRadioGroup extends VfFormControl {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
      }
      ::slotted(vf-radio) {
        display: flex;
      }
      ::slotted(vf-radio:not(:first-child)) {
        margin-top: calc(var(--vf-scale, 1) * 6px);
      }
    `,
  ]

  /**
   * The value of the selected radio. An empty string means no selection
   * (and nothing is submitted with the form).
   */
  @property() value = ''

  /** Form field name used when submitting. */
  @property({ reflect: true }) name = ''

  /**
   * Accessible name for the group, exposed as the `radiogroup`'s `aria-label`.
   * Without it a caption-less group is announced anonymously.
   */
  @property() label = ''

  private readonly scale = new ScaleController(this)

  // No GridSnapController: the group paints nothing of its own; the slotted
  // radios correct themselves (see src/grid-snap.ts).

  /**
   * Re-syncs the group when its radios change structurally or by value —
   * covers radios added/removed inside arbitrary wrapper markup (no top-level
   * slotchange fires) and a child radio's value/disabled changing at runtime.
   */
  private mutationObserver: MutationObserver | null = null

  constructor() {
    super()
    this.internals.role = 'radiogroup'
    this.addEventListener('keydown', this.handleKeydown)
    this.addEventListener('vf-change', this.handleRadioChange)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // An authored value is the reset default; an empty one stays unlatched so
    // a pre-checked radio adopted on slotchange can claim the default instead.
    if (this.value !== '') this.latchFormDefault(this.value)
    // Filtered to value/disabled so syncRadios()'s own checked/tabindex
    // writes on the children can't re-trigger the observer (no feedback loop).
    // A subtree observer also reports the *host's* own attributes, and both
    // filtered names are reflected on the group itself — so its own `disabled`
    // (or a `value` attribute write) arrives here as well, after `updated()`
    // has already synced for exactly that change. Only child mutations need a
    // pass of their own.
    this.mutationObserver ??= new MutationObserver((records) => {
      if (records.every((r) => r.type === 'attributes' && r.target === this)) return
      this.syncRadios()
    })
    this.mutationObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['value', 'disabled'],
    })
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.mutationObserver?.disconnect()
  }

  override render() {
    return html`<slot @slotchange=${this.handleSlotChange}></slot>`
  }

  protected override willUpdate(): void {
    // Parse-time pre-checked radios must be adopted BEFORE the first update
    // finishes: updated()'s child sync runs ahead of the initial slotchange
    // dispatch, and with no value it unchecks the very radio the slotchange
    // adoption would have looked for.
    if (!this.hasUpdated) this.adoptPreChecked()
  }

  protected override updated(changed: PropertyValues<this>): void {
    const disabled = this.disabledChanged(changed)
    if (changed.has('value') || disabled) {
      this.syncFormValue(this.value === '' ? null : this.value)
    }
    if (changed.has('label')) this.internals.ariaLabel = this.label || null
    if (disabled) this.internals.ariaDisabled = this.isDisabled ? 'true' : 'false'
    // Skip the child loop when the children already carry this exact state —
    // an interactive selection synced them synchronously (see selectRadio), so
    // running it again here would push down an identical result.
    if (this.syncedKey !== this.syncKey) this.syncRadios()
  }

  /** Form-associated lifecycle: restores the initial value. */
  formResetCallback(): void {
    this.value = this.formDefault('')
  }

  /** All descendant radios belonging to this group (nested groups excluded). */
  private get radios(): VfRadio[] {
    return [...this.querySelectorAll<VfRadio>('vf-radio')].filter(
      (radio) => radio.closest('vf-radio-group') === this
    )
  }

  /**
   * Identity of the state {@link syncRadios} pushes down, and the value it
   * last pushed. Everything the children receive derives from these two, so
   * comparing them tells `updated()` whether a sync would be a no-op.
   *
   * It intentionally doesn't track the children themselves: a structural or
   * value/disabled change reaches `syncRadios()` directly (via the mutation
   * observer or slotchange), never through this gate.
   */
  private get syncKey(): string {
    return `${this.isDisabled ? 'd' : 'e'}:${this.value}`
  }

  private syncedKey: string | null = null

  /**
   * Push group state down to the children: checked flags, group-disabled
   * dimming, and the roving tabindex (the checked radio is the tab stop;
   * with no selection, the first enabled radio is).
   */
  private syncRadios(): void {
    const radios = this.radios
    const disabled = this.isDisabled
    this.syncedKey = this.syncKey
    const checked =
      this.value === ''
        ? undefined
        : radios.find((radio) => radio.value === this.value)
    let tabStop = checked && !checked.disabled ? checked : undefined
    if (!tabStop) tabStop = radios.find((radio) => !radio.disabled)
    for (const radio of radios) {
      radio.checked = radio === checked
      radio.groupDisabled = disabled
      radio.tabIndex = !disabled && radio === tabStop ? 0 : -1
    }
  }

  /**
   * Select a radio, sync everything, and fire `vf-change` if value changed.
   *
   * The sync stays synchronous — a `vf-change` listener must see the children
   * already carrying the new selection, not the state of a pending update —
   * and `updated()` then skips its own pass via the sync key.
   */
  private selectRadio(radio: VfRadio, focus: boolean): void {
    const changed = this.value !== radio.value
    this.value = radio.value
    this.syncRadios()
    if (focus) radio.focus()
    if (changed) emit(this, 'vf-change', { value: this.value })
  }

  /** A child radio was clicked or Space-selected: adopt it. */
  private handleRadioChange = (event: Event): void => {
    const radio = event.target
    if (radio === this || !(radio instanceof VfRadio)) return
    if (radio.closest('vf-radio-group') !== this) return
    if (this.isDisabled || radio.disabled) return
    this.selectRadio(radio, false)
  }

  /** Arrow keys move the selection AND select (classic Mac behavior). */
  private handleKeydown = (event: KeyboardEvent): void => {
    if (this.isDisabled) return
    const key = event.key
    let delta = 0
    if (key === 'ArrowDown' || key === 'ArrowRight') delta = 1
    else if (key === 'ArrowUp' || key === 'ArrowLeft') delta = -1
    else return
    event.preventDefault()
    const enabled = this.radios.filter((radio) => !radio.disabled)
    if (enabled.length === 0) return
    const current =
      event.target instanceof VfRadio
        ? event.target
        : this.radios.find((radio) => radio.checked)
    const index = current ? enabled.indexOf(current) : -1
    const nextIndex =
      index === -1
        ? delta > 0
          ? 0
          : enabled.length - 1
        : (index + delta + enabled.length) % enabled.length
    const next = enabled[nextIndex]
    if (next) this.selectRadio(next, true)
  }

  /**
   * With no value of its own, adopt a pre-checked radio's value — and treat
   * it as the form-reset default.
   */
  private adoptPreChecked(): void {
    if (this.value !== '') return
    const preChecked = this.radios.find((radio) => radio.checked)
    if (preChecked && preChecked.value !== '') {
      this.value = preChecked.value
      this.latchFormDefault(this.value)
    }
  }

  private handleSlotChange = (): void => {
    // Radios slotted in after first render: adopt a pre-checked one here (the
    // parse-time case is handled in willUpdate, before the first child sync
    // can uncheck it).
    this.adoptPreChecked()
    this.syncRadios()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-radio-group': VfRadioGroup
  }
}
