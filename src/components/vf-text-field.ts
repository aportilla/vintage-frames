import { css, html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfField } from '../styles/base.js'
import { VfTextControlBase } from '../text-control.js'

/**
 * `<vf-text-field>` — a System 7 single-line text entry field.
 *
 * A form-associated wrapper around a native `<input>`: white well, 1px solid
 * black border, no corner radius. Keyboard focus draws the kit's dashed rule
 * one blank row under the well; a click leaves it unmarked (no dotted outline
 * either, per SPEC §1/§5). The shared field skin lives in `vfField`; the
 * value/form scaffolding — and the focus rule's modality gate — in
 * {@link VfTextControlBase}.
 *
 * @fires vf-input - On every keystroke. `detail: { value: string }`.
 * @fires vf-change - On commit (native `change`). `detail: { value: string }`.
 * @fires input - The native keystroke event: the inner input's own, composed,
 *   so it crosses the shadow boundary and retargets to the host by itself.
 * @fires change - The native commit event, re-dispatched from the host (the
 *   inner one is `composed: false` and never leaves the shadow root), so form
 *   delegation and framework bindings hear it.
 *
 * The input-behavior attributes — `autocomplete`, `inputmode`, `enterkeyhint`,
 * `maxlength`, `pattern`, `spellcheck`, `autocapitalize` — are forwarded from
 * the host onto the inner input, where the platform actually honors them.
 *
 * @csspart input - The inner native `<input>` element.
 * @cssprop [--vf-control-height=22px] - text fields — `vf-text-field`,
 *   `vf-text-area`, the `vf-number-field` well
 * @cssprop [--vf-field-width=180px] - default width of `vf-text-field` /
 *   `vf-text-area`
 * @cssprop [--vf-field-placeholder=#767676] - placeholder text in the editable
 *   fields — kept off `--vf-disabled`: a placeholder sits in an *enabled* well
 *   and holds AA contrast, where the disabled gray is exempt
 */
@vfElement('vf-text-field')
export class VfTextField extends VfPositioned(VfTextControlBase) {
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
        /* min-, not height: the default line box exactly fills the 22px well,
           so nothing moves — but a user stylesheet raising line-height (the
           WCAG 1.4.12 text-spacing condition) grows the well instead of
           clipping the text inside a pinned one. */
        min-height: calc(var(--vf-scale, 1) * var(--vf-control-height, 22px));
        padding: 0 calc(var(--vf-scale, 1) * 6px);
      }
    `,
  ]

  /** Input type, passed through to the native input (e.g. `password`). */
  @property() type = 'text'

  /** The shared forwarded set plus `pattern`, which only an `<input>` takes. */
  protected static override readonly forwardedAttributes: readonly string[] = [
    ...VfTextControlBase.forwardedAttributes,
    'pattern',
  ]

  /**
   * Enter in a single-line field triggers the associated form's implicit
   * submission. The native `<input>` is shadow-encapsulated, so its form owner
   * is null and the browser won't do this itself.
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (this.isSubmitEnter(event)) this.requestImplicitSubmit()
  }

  protected override render() {
    return html`
      <div class=${this.wellClass}>
        <input
          part="input"
          class="vf-field"
          type=${this.type}
          aria-label=${this.label || this.hostLabel || nothing}
          aria-describedby=${this.describedBy}
          aria-required=${this.required ? 'true' : nothing}
          aria-invalid=${this.validity.valid ? nothing : 'true'}
          autocomplete=${this.forwardedAttr('autocomplete')}
          inputmode=${this.forwardedAttr('inputmode')}
          enterkeyhint=${this.forwardedAttr('enterkeyhint')}
          maxlength=${this.forwardedAttr('maxlength')}
          pattern=${this.forwardedAttr('pattern')}
          spellcheck=${this.forwardedAttr('spellcheck')}
          autocapitalize=${this.forwardedAttr('autocapitalize')}
          .value=${live(this.value)}
          placeholder=${this.placeholder}
          ?disabled=${this.isDisabled}
          ?readonly=${this.readonly}
          @keydown=${this.handleKeydown}
          @input=${this.handleInput}
          @change=${this.handleChange}
        />
      </div>
      ${this.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-text-field': VfTextField
  }
}
