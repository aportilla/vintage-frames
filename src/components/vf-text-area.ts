import { css, html, nothing } from 'lit'
import { property, query } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfField, vfScrollbars } from '../styles/base.js'
import { VfTextControlBase } from '../text-control.js'
import { ScrollStateController } from '../scroll-state.js'

/**
 * `<vf-text-area>` — a System 7 multi-line text entry field.
 *
 * Identical styling to `<vf-text-field>` but wrapping a native `<textarea>`.
 * No resize grip (`resize: none`) — System 7 fields don't resize. Wrapped
 * text sits on Chicago 12's native 16px line (the single-line well keeps its
 * 20px box — that is control geometry, not typesetting). The shared field
 * skin lives in `vfField`; the value/form scaffolding in
 * {@link VfTextControlBase}.
 *
 * The `.vf-field-well` wrapper is the one `vfField` hangs the focus rule from,
 * doing double duty here: it is also the positioned box the `.vf-scroll-frame`
 * overlay insets against, and the `vf-snap` element whose grid-snap offset the
 * field, the frame and the rule ride as one.
 *
 * The vertical scroll rail is a permanent System 7 placeholder: an empty white
 * channel sits in the field even when the text fits, filling in with the
 * dither/thumb/arrows only once the content overflows (driven by
 * {@link ScrollStateController}). The scrollbar wears the shared `vfScrollbars`
 * skin — the same one used by `vf-scroll-area` and `vf-list`.
 *
 * @fires vf-input - On every keystroke. `detail: { value: string }`.
 * @fires vf-change - On commit (native `change`). `detail: { value: string }`.
 * @fires input - The native keystroke event: the inner textarea's own,
 *   composed, so it crosses the shadow boundary and retargets to the host.
 * @fires change - The native commit event, re-dispatched from the host (the
 *   inner one is `composed: false` and never leaves the shadow root).
 *
 * The input-behavior attributes — `autocomplete`, `inputmode`, `enterkeyhint`,
 * `maxlength`, `spellcheck`, `autocapitalize` — are forwarded from the host
 * onto the inner textarea, where the platform actually honors them
 * (`pattern` is not: only an `<input>` takes it).
 *
 * @csspart textarea - The inner native `<textarea>` element.
 * @cssprop --vf-line-height-display - The display face's native line (default
 *   `16px`, Chicago 12's) — the pitch wrapped entry text sits on, shared with
 *   the static-text components so a display retheme moves them together.
 * @cssprop [--vf-field-width=180px] - default width of `vf-text-field` /
 *   `vf-text-area`
 * @cssprop [--vf-field-placeholder=#767676] - placeholder text in the editable
 *   fields — kept off `--vf-disabled`: a placeholder sits in an *enabled* well
 *   and holds AA contrast, where the disabled gray is exempt
 * @cssprop --vf-scrollbar-thumb - scrollbar thumb/elevator (white)
 * @cssprop --vf-scrollbar-track - scrollbar trough — **Firefox fallback only**;
 *   the WebKit path draws the dot-dither tile instead, and this is its flat
 *   25%-black average
 */
@vfElement('vf-text-area')
export class VfTextArea extends VfPositioned(VfTextControlBase) {
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
      /* textarea.vf-field so the border override out-ranks the vf-field skin's
         own border (a bare element selector would lose to the class). */
      textarea.vf-field {
        display: block;
        width: 100%;
        /* Borderless — the 1px frame is the .vf-scroll-frame overlay painted
           on top, so the scrollbar rect anchors on whole CSS px (WebKit snaps
           scrollbar rects to whole CSS px; the field's own border put them on
           half CSS px at dpr 2 and set Safari's rail a device pixel adrift —
           see the vfScrollbars recipe comment). The padding grows 1px per side
           over vf-text-field's 3px/6px, holding the text — and the outer box —
           exactly where the bordered field put them. */
        border: 0;
        padding: calc(var(--vf-scale, 1) * 4px) calc(var(--vf-scale, 1) * 7px);
        /* Wrapped entry copy on the display face's native line (editable
           text is display type) — the same face token the static-text
           components read, so a display retheme moves this well too. The
           vfField skin inherits the host's 1.25 ratio (a 20px box — what
           vf-text-field's 22px well is built on and keeps); a multi-line
           well is typesetting, and takes the strike's own pitch: rows buys
           one line each. */
        line-height: calc(var(--vf-scale, 1) * var(--vf-line-height-display, 16px));
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
      <div class=${this.wellClass}>
        <textarea
          part="textarea"
          class="vf-field vf-scroll"
          rows=${this.rows}
          aria-label=${this.label || this.hostLabel || nothing}
          aria-describedby=${this.describedBy}
          aria-required=${this.required ? 'true' : nothing}
          aria-invalid=${this.validity.valid ? nothing : 'true'}
          autocomplete=${this.forwardedAttr('autocomplete')}
          inputmode=${this.forwardedAttr('inputmode')}
          enterkeyhint=${this.forwardedAttr('enterkeyhint')}
          maxlength=${this.forwardedAttr('maxlength')}
          spellcheck=${this.forwardedAttr('spellcheck')}
          autocapitalize=${this.forwardedAttr('autocapitalize')}
          .value=${live(this.value)}
          placeholder=${this.placeholder}
          ?disabled=${this.isDisabled}
          ?readonly=${this.readonly}
          @input=${this.handleInput}
          @change=${this.handleChange}
        ></textarea>
        <div class="vf-scroll-frame" aria-hidden="true"></div>
      </div>
      ${this.renderDescription()}
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
