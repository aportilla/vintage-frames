import { css, html, LitElement } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { vfBase, vfDisplay, vfFocus } from '../styles/base.js'
import { ScaleController } from '../scale.js'

/**
 * The classic System 7 push button ("OK", "Cancel", "Install", …).
 *
 * A rounded-rectangle control with a 1px black border and white face that
 * inverts to white-on-black while pressed. `variant="default"` draws the
 * classic bold double ring around the button, marking it as the default
 * action of a dialog.
 *
 * Form-associated: place it inside a `<form>` and `type="submit"` submits the
 * form, `type="reset"` resets it — just like a native `<button>`. Enter and
 * Space activate it via the inner native button.
 *
 * @slot - The button label.
 * @csspart button - The inner native `<button>` element.
 */
@customElement('vf-button')
export class VfButton extends LitElement {
  /** Participates in native forms via ElementInternals. */
  static formAssociated = true

  static override shadowRootOptions: ShadowRootInit = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  }

  static override styles = [
    vfBase,
    vfDisplay,
    vfFocus,
    css`
      :host {
        display: inline-flex;
        position: relative;
        cursor: default;
        /* Display scaling: metrics are authored in *system pixels* and
           multiplied by --vf-scale (default 1 = today's rendering). Opt a
           subtree into true 72dpi size via applyScale()/--vf-scale — see
           src/scale.ts. The chrome font scales with the control. */
        font-size: calc(var(--vf-scale, 1) * var(--vf-font-size-display, 16px));
      }
      /* Breathing room for the default-button ring drawn at inset -5 system px. */
      :host([variant='default']) {
        margin: calc(var(--vf-scale, 1) * 5px);
      }
      :host([variant='default'])::before {
        content: '';
        position: absolute;
        inset: calc(var(--vf-scale, 1) * -5px);
        border: calc(var(--vf-scale, 1) * 3px) solid var(--vf-black, #000);
        border-radius: calc(var(--vf-scale, 1) * (var(--vf-radius, 6px) + 4px));
        pointer-events: none;
      }
      /* Disabled default: the fat outer ring dims to gray; the inner button
         border stays solid black (see button:disabled). */
      :host([variant='default'][disabled])::before {
        border-color: var(--vf-disabled, #808080);
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: calc(var(--vf-scale, 1) * var(--vf-control-height, 22px));
        min-width: calc(var(--vf-scale, 1) * 64px);
        padding: 0 calc(var(--vf-scale, 1) * 14px);
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        border-radius: calc(var(--vf-scale, 1) * var(--vf-radius, 6px));
        color: var(--vf-black, #000);
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        line-height: inherit;
        white-space: nowrap;
        cursor: inherit;
      }
      /* Pressed: instant white-on-black inversion. */
      button:active:not(:disabled) {
        background: var(--vf-black, #000);
        color: var(--vf-white, #fff);
      }
      /* Disabled: only the label dims to gray; the solid black border stays. */
      button:disabled {
        color: var(--vf-disabled, #808080);
      }
    `,
  ]

  /**
   * When set to `'default'`, draws the classic double ring that marks the
   * default button (activated by Return in real System 7 dialogs).
   */
  @property({ reflect: true }) variant?: 'default'

  /** Disables the button: gray label, solid black border stays, no interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /**
   * Activation behavior, mirroring native `<button type>`:
   * `'submit'` submits the associated form, `'reset'` resets it and
   * `'button'` (the default) does nothing beyond the `click` event.
   */
  @property() type: 'button' | 'submit' | 'reset' = 'button'

  /** True while an ancestor `<fieldset disabled>` disables this control. */
  @state() private formDisabled = false

  private readonly internals: ElementInternals

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  constructor() {
    super()
    this.internals = this.attachInternals()
  }

  override render() {
    return html`
      <button
        part="button"
        class="vf-focus"
        type="button"
        ?disabled=${this.disabled || this.formDisabled}
        @click=${this.handleClick}
      >
        <slot></slot>
      </button>
    `
  }

  /**
   * Form-associated lifecycle: called by the browser when the element is
   * disabled or re-enabled by an ancestor (e.g. `<fieldset disabled>`).
   */
  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled
  }

  /**
   * Form-associated lifecycle: buttons carry no submission state, so there
   * is nothing to restore when the form resets.
   */
  formResetCallback(): void {}

  private handleClick = (): void => {
    if (this.disabled || this.formDisabled) return
    if (this.type === 'submit') {
      this.internals.form?.requestSubmit()
    } else if (this.type === 'reset') {
      this.internals.form?.reset()
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-button': VfButton
  }
}
