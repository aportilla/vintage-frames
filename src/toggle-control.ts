import { LitElement, type PropertyValues } from 'lit'
import { ScaleController } from './scale.js'

type Constructor<T = object> = new (...args: any[]) => T
type AbstractConstructor<T = object> = abstract new (...args: any[]) => T

/**
 * The mixin's own surface: what a concrete toggle must supply, and what it
 * gets back. Spelled out as a `declare class` because TypeScript cannot name
 * the anonymous class a mixin returns when emitting declarations (TS4094) —
 * and that is unavoidable here rather than a consequence of our own members,
 * since LitElement's `render`/`updated`/`willUpdate`/`createRenderRoot` are
 * themselves protected. This is the shape Lit documents for typed mixins.
 *
 * Keep it in sync with the implementation below; it is the type half of one
 * declaration.
 */
export declare abstract class VfToggleControlInterface extends LitElement {
  abstract checked: boolean
  protected abstract get toggleInternals(): ElementInternals
  protected abstract get toggleDisabled(): boolean
  protected abstract activate(): void
  protected get externallyCoordinated(): boolean
  protected syncToggleState(): void
}

/**
 * The interaction skeleton shared by the kit's two toggle controls
 * (`vf-checkbox`, `vf-radio`) — everything they did identically apart from
 * their glyphs and their toggle-vs-select semantics:
 *
 * - the click / Space→activate wiring, including the `event.repeat` guard that
 *   stops a *held* Space from re-firing on every ~30ms tick;
 * - the single disabled guard every activation passes through, so "a disabled
 *   toggle never activates" is guaranteed in one place (the same shape as
 *   {@link VfFormControl.syncFormValue}'s disabled funnel for form values);
 * - `aria-checked` / `aria-disabled` mirroring in `updated()`;
 * - the self-managed host tabindex, and the ownership latch that keeps it
 *   honest across reconnects (see {@link consumerOwnsTabIndex}).
 *
 * It is a **mixin, not a plain base class**, because the two controls sit on
 * different bases and must stay there: `vf-checkbox` extends
 * {@link VfFormControl} (it submits a value under a name), while `vf-radio` is
 * deliberately *not* form-associated — a lone radio has no value to submit, and
 * its enclosing `vf-radio-group` is the form-associated surface. Unifying them
 * under one concrete base would mean making radio form-associated, which is a
 * behavior change (a bare `<vf-radio>` would start contributing to `FormData`),
 * not a refactor.
 *
 * A concrete control supplies four things: {@link checked}, its
 * {@link toggleInternals}, its {@link toggleDisabled} rule, and {@link activate}.
 *
 * @example
 * ```ts
 * class VfCheckbox extends VfToggleControl(VfFormControl) {
 *   \@property({ type: Boolean, reflect: true }) checked = false
 *   protected override get toggleInternals() { return this.internals }
 *   protected override get toggleDisabled() { return this.isDisabled }
 *   protected override activate() { ... }
 * }
 * ```
 */
export const VfToggleControl = <T extends Constructor<LitElement>>(Base: T) => {
  abstract class VfToggleControlElement extends Base {
    /**
     * Whether the toggle is on. Declared by the concrete control so it keeps
     * its own reactive-property options and its own documentation (a checkbox
     * is "checked", a radio is "selected by its group").
     */
    abstract checked: boolean

    /**
     * The control's `ElementInternals`. Supplied by the subclass rather than
     * attached here: `attachInternals()` throws on a second call, and
     * `vf-checkbox` already inherits a handle from {@link VfFormControl} while
     * `vf-radio` attaches its own.
     */
    protected abstract get toggleInternals(): ElementInternals

    /**
     * The control's effective disabled state — `disabled` OR whatever else
     * disables it (an ancestor `<fieldset disabled>` for the form-associated
     * checkbox, the enclosing group for a radio).
     */
    protected abstract get toggleDisabled(): boolean

    /**
     * Do the control's own thing in response to a click or Space: flip state,
     * take focus, dispatch `vf-change`. Only ever called on an enabled control
     * — the disabled guard lives in the shared skeleton.
     */
    protected abstract activate(): void

    /**
     * True while an ancestor coordinator owns this control's selection *and*
     * its tab stop — the `vf-radio-group` case, where the group runs a roving
     * tabindex and is the single source of truth for which child is checked.
     * A coordinated control neither self-manages its tabindex nor optimistically
     * self-checks. Always false for a standalone control.
     */
    protected get externallyCoordinated(): boolean {
      return false
    }

    /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
    private readonly scale = new ScaleController(this)

    /**
     * Whether the *consumer* authored a `tabindex`, latched on the *first*
     * connect only.
     *
     * It has to be latched: once we self-manage, `this.tabIndex = 0` writes a
     * `tabindex` attribute onto the host, so re-testing `hasAttribute` on a
     * later connect reads our own write back as the consumer's and stands down
     * forever — leaving a reconnected control that no longer drops out of the
     * tab order when disabled. Same trap, and the same fix, as `vf-menu-item`'s
     * `#ownsRole` latch.
     */
    #consumerOwnsTabIndex: boolean | null = null

    /**
     * True when this control currently owns its host tabindex: the consumer
     * didn't author one and no coordinator is running a roving tabindex.
     * Re-derived on every connect, because {@link externallyCoordinated} can
     * legitimately change when a control is re-parented into or out of a group.
     */
    private selfManagedTabIndex = false

    constructor(...args: any[]) {
      super(...args)
      this.addEventListener('click', this.#handleClick)
      this.addEventListener('keydown', this.#handleKeydown)
    }

    override connectedCallback(): void {
      super.connectedCallback()
      this.#consumerOwnsTabIndex ??= this.hasAttribute('tabindex')
      this.selfManagedTabIndex =
        !this.#consumerOwnsTabIndex && !this.externallyCoordinated
      if (this.selfManagedTabIndex) {
        this.tabIndex = this.toggleDisabled ? -1 : 0
      }
    }

    protected override updated(changed: PropertyValues): void {
      super.updated(changed)
      this.syncToggleState()
    }

    /**
     * Mirror the control's state into ARIA and keep its tab stop honest.
     * Separate from `updated()` so a subclass that gates its own work on
     * changed keys can still call it unconditionally.
     */
    protected syncToggleState(): void {
      const internals = this.toggleInternals
      const disabled = this.toggleDisabled
      internals.ariaChecked = this.checked ? 'true' : 'false'
      internals.ariaDisabled = disabled ? 'true' : 'false'
      if (this.selfManagedTabIndex) this.tabIndex = disabled ? -1 : 0
    }

    /** The one gate every activation passes through. */
    #interact(): void {
      if (this.toggleDisabled) return
      this.activate()
    }

    #handleClick = (): void => {
      this.#interact()
    }

    #handleKeydown = (event: KeyboardEvent): void => {
      if (event.key !== ' ') return
      event.preventDefault()
      // Ignore auto-repeat: holding Space must not re-activate on every tick.
      if (event.repeat) return
      this.#interact()
    }
  }

  return VfToggleControlElement as unknown as AbstractConstructor<VfToggleControlInterface> &
    T
}
