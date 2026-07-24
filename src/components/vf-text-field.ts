import { css, html, nothing } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfField } from '../styles/base.js'
import { VfTextControlBase } from '../text-control.js'

/**
 * `<vf-text-field>` — a System 7 single-line text entry field.
 *
 * A form-associated wrapper around a native `<input>`: white well, 1px solid
 * black border, no corner radius. Focus thickens the border (no dotted
 * outline, per SPEC §1/§5). The shared field skin lives in `vfField`; the
 * value/form scaffolding in {@link VfTextControlBase}.
 *
 * @fires vf-input - On every keystroke. `detail: { value: string }`.
 * @fires vf-change - On commit (native `change`). `detail: { value: string }`.
 *
 * @csspart input - The inner native `<input>` element.
 */
@customElement('vf-text-field')
export class VfTextField extends VfTextControlBase {
  static override styles = [
    vfBase,
    vfField,
    css`
      :host {
        display: inline-block;
        /* A sensible default width (authored system px, scaled) so a bare field
           doesn't collapse; the inner control fills it. Override with a width
           on the host or the --vf-field-width token. */
        width: calc(var(--vf-scale, 1) * var(--vf-field-width, 180px));
      }
      input {
        display: block;
        width: 100%;
        height: calc(var(--vf-scale, 1) * var(--vf-control-height, 22px));
        padding: 0 calc(var(--vf-scale, 1) * 6px);
      }
    `,
  ]

  /** Input type, passed through to the native input (e.g. `password`). */
  @property() type = 'text'

  /**
   * Enter in a single-line field triggers the associated form's implicit
   * submission. The native `<input>` is shadow-encapsulated, so its form owner
   * is null and the browser won't do this itself.
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (this.isSubmitEnter(event)) this.internals.form?.requestSubmit()
  }

  protected override render() {
    return html`
      <input
        part="input"
        class="vf-field"
        type=${this.type}
        aria-label=${this.label || nothing}
        .value=${live(this.value)}
        placeholder=${this.placeholder}
        ?disabled=${this.isDisabled}
        ?readonly=${this.readonly}
        @keydown=${this.handleKeydown}
        @input=${this.handleInput}
        @change=${this.handleChange}
      />
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-text-field': VfTextField
  }
}
