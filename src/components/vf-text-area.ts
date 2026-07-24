import { css, html, nothing } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfField } from '../styles/base.js'
import { VfTextControlBase } from '../text-control.js'

/**
 * `<vf-text-area>` — a System 7 multi-line text entry field.
 *
 * Identical styling to `<vf-text-field>` but wrapping a native `<textarea>`.
 * No resize grip (`resize: none`) — System 7 fields don't resize. The shared
 * field skin lives in `vfField`; the value/form scaffolding in
 * {@link VfTextControlBase}.
 *
 * @fires vf-input - On every keystroke. `detail: { value: string }`.
 * @fires vf-change - On commit (native `change`). `detail: { value: string }`.
 *
 * @csspart textarea - The inner native `<textarea>` element.
 */
@customElement('vf-text-area')
export class VfTextArea extends VfTextControlBase {
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
      textarea {
        display: block;
        width: 100%;
        padding: calc(var(--vf-scale, 1) * 3px) calc(var(--vf-scale, 1) * 6px);
        resize: none;
      }
    `,
  ]

  /** Number of visible text rows (native `rows`). Default 4. */
  @property({ type: Number }) rows = 4

  protected override render() {
    return html`
      <textarea
        part="textarea"
        class="vf-field"
        rows=${this.rows}
        aria-label=${this.label || nothing}
        .value=${live(this.value)}
        placeholder=${this.placeholder}
        ?disabled=${this.isDisabled}
        ?readonly=${this.readonly}
        @input=${this.handleInput}
        @change=${this.handleChange}
      ></textarea>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-text-area': VfTextArea
  }
}
