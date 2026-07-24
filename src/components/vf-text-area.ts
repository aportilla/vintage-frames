import { css, html, nothing } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfField, vfScrollbars } from '../styles/base.js'
import { VfTextControlBase } from '../text-control.js'
import { ScrollStateController } from '../scroll-state.js'

/**
 * `<vf-text-area>` — a System 7 multi-line text entry field.
 *
 * Identical styling to `<vf-text-field>` but wrapping a native `<textarea>`.
 * No resize grip (`resize: none`) — System 7 fields don't resize. The shared
 * field skin lives in `vfField`; the value/form scaffolding in
 * {@link VfTextControlBase}.
 *
 * The vertical scroll rail is a permanent System 7 placeholder: an empty white
 * channel sits in the field even when the text fits, filling in with the
 * dither/thumb/arrows only once the content overflows (driven by
 * {@link ScrollStateController}). The scrollbar wears the shared `vfScrollbars`
 * skin — the same one used by `vf-scroll-area` and `vf-list`.
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
    vfScrollbars,
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
        /* Reserve the vertical rail as a permanent placeholder: overflow-y:
           scroll keeps the styled track (and its divider) painted, and
           scrollbar-gutter: stable reserves the 16px channel (modern Chromium
           draws a zero-width overlay bar for a styled ::-webkit-scrollbar
           otherwise). ScrollStateController toggles data-overflow-y so it reads
           as a bare white rail until the text overflows. */
        overflow-y: scroll;
        scrollbar-gutter: stable;
      }
    `,
  ]

  /** Number of visible text rows (native `rows`). Default 4. */
  @property({ type: Number }) rows = 4

  @query('textarea') private textarea!: HTMLTextAreaElement | null

  /** Reserves the vertical rail and toggles it active on overflow. */
  private readonly scrollState = new ScrollStateController(
    this,
    () => this.textarea
  )

  protected override render() {
    return html`
      <textarea
        part="textarea"
        class="vf-field vf-scroll"
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

  /**
   * Re-measure overflow on each keystroke. A `<textarea>`'s scrollHeight grows
   * as the text wraps without resizing the element's box, so the controller's
   * ResizeObserver never fires — this is the imperative path it documents.
   */
  protected override handleInput(event: Event): void {
    super.handleInput(event)
    this.scrollState.measure()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-text-area': VfTextArea
  }
}
