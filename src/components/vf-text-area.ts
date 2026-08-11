import { css, html, nothing } from 'lit'
import { property, query } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { live } from 'lit/directives/live.js'
import { vfBase, vfField, vfScrollRail } from '../styles/base.js'
import { VfTextControlBase } from '../text-control.js'
import { ScrollStateController } from '../scroll-state.js'
import { ScrollRailController, renderScrollRail } from '../scroll-rail.js'

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
 * doing double duty here: it is the field's framed box — it carries the 1px
 * frame the single-line field draws on the well itself, and lays the drawn
 * scroll rail beside the borderless inner `<textarea>` — and the `vf-snap`
 * element whose grid-snap offset the field, the frame and the rule ride as
 * one.
 *
 * The vertical scroll rail is a permanent System 7 placeholder: arrows on an
 * empty white channel sit in the field even when the text fits, the dither
 * and thumb filling in only once the content overflows (driven by
 * {@link ScrollStateController}). The rail is the shared `vfScrollRail`
 * subtree — the kit-drawn rail every scroll surface wears — synced to the
 * textarea's own native scrolling by {@link ScrollRailController}; the native
 * bar itself is hidden.
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
 * @cssprop --vf-scrollbar-track - the scroll trough's base color under the
 *   dot-dither (white)
 */
@vfElement('vf-text-area')
export class VfTextArea extends VfPositioned(VfTextControlBase) {
  static override styles = [
    vfBase,
    vfField,
    vfScrollRail,
    css`
      :host {
        display: inline-block;
        /* A sensible default width (authored system px, scaled) so a bare field
           doesn't collapse; the inner control fills it. Override with a width
           on the host or the --vf-field-width token. */
        width: calc(var(--vf-scale, 1) * var(--vf-field-width, 180px));
      }
      /* The well is the field's framed box: it carries the 1px frame (the
         single-line field draws it on the input itself, but here the drawn
         scroll rail has to sit inside the frame beside the text), and lays
         out [textarea | rail] — the rail sizes itself to the 15px inside the
         frame. */
      .vf-field-well {
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        background: var(--vf-white, #fff);
        display: grid;
        grid-template-columns: 1fr auto;
      }
      /* The focus rule anchors to the well's PADDING box, and this well —
         unlike the single-line field's borderless wrapper — carries the 1px
         frame: −3 is the documented bordered-carrier offset (see
         vfFocusUnderline), keeping the rule one blank row under the frame,
         and the −1px insets span it across the border box edge to edge. */
      .vf-field-well.vf-focus-rule::after {
        --vf-focus-underline-offset: -3px;
        left: calc(var(--vf-scale, 1) * -1px);
        right: calc(var(--vf-scale, 1) * -1px);
      }
      /* textarea.vf-field so the border override out-ranks the vf-field skin's
         own border (a bare element selector would lose to the class). */
      textarea.vf-field {
        display: block;
        width: 100%;
        min-width: 0;
        /* Borderless — the frame is the well's (above). vf-text-field's own
           3px/6px padding plus that border holds the text exactly where the
           bordered field puts it; the mod() term is border-floor
           compensation (engines floor the fractional border to whole CSS px;
           this is exactly what they floored away), keeping the text on the
           4px/7px system-px inset from the frame box at every scale. */
        border: 0;
        padding: calc(
            var(--vf-scale, 1) * 3px + mod(var(--vf-scale, 1) * 1px, 1px)
          )
          calc(var(--vf-scale, 1) * 6px + mod(var(--vf-scale, 1) * 1px, 1px));
        /* Wrapped entry copy on the display face's native line (editable
           text is display type) — the same face token the static-text
           components read, so a display retheme moves this well too. The
           vfField skin inherits the host's 1.25 ratio (a 20px box — what
           vf-text-field's 22px well is built on and keeps); a multi-line
           well is typesetting, and takes the strike's own pitch: rows buys
           one line each. */
        line-height: calc(var(--vf-scale, 1) * var(--vf-line-height-display, 16px));
        resize: none;
        /* Native scrolling; the bar itself is hidden by the recipe
           (.vf-scroll) and the reservation is the rail element beside the
           text. */
        overflow-y: auto;
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

  /** Syncs the drawn rail to the textarea and drives its interactions. */
  private readonly rail = new ScrollRailController(this, {
    getScroll: () => this.textarea,
  })

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
        ${renderScrollRail(this.rail, 'vertical')}
      </div>
      ${this.renderDescription()}
    `
  }

  /**
   * Re-measure overflow on each keystroke. A `<textarea>`'s scrollHeight grows
   * as the text wraps without resizing the element's box, so the controllers'
   * ResizeObservers never fire — this is the imperative path both document
   * (the state controller keeps the rail's active state honest, the rail
   * controller its thumb).
   */
  protected override handleInput(event: Event): void {
    super.handleInput(event)
    this.scrollState.measure()
    this.rail.sync()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-text-area': VfTextArea
  }
}
