import { css, html, unsafeCSS } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { vfBase, vfDisplay, vfFocus } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { VfFormControl } from '../form-control.js'
import {
  BUTTON_FACE,
  BUTTON_FRAME,
  RING_FRAME,
  RING_HOLE,
  RING_INSET,
  steppedRectClip,
  steppedRingClip,
} from '../pixel-frame.js'

/**
 * The classic System 7 push button ("OK", "Cancel", "Install", …).
 *
 * A rounded-rectangle control with a 1px black border and white face that
 * inverts to white-on-black while pressed. `variant="default"` draws the
 * classic bold double ring around the button, marking it as the default
 * action of a dialog. `size="small"` renders the compact 16px button with a
 * body-face label.
 *
 * The rounded corners are not `border-radius` arcs: frame, face, and ring are
 * stepped `clip-path` silhouettes traced pixel-for-pixel from the kit's button
 * reference sheet (see `src/pixel-frame.ts`), so every corner renders as the
 * exact 1-bit staircase with no antialiasing.
 *
 * Form-associated: place it inside a `<form>` and `type="submit"` submits the
 * form (contributing its `name`/`value` to the submission), `type="reset"`
 * resets it. Enter and Space activate it via the inner native button.
 *
 * @slot - The button label.
 * @csspart button - The inner native `<button>` element.
 */
@customElement('vf-button')
export class VfButton extends VfFormControl {
  static override shadowRootOptions: ShadowRootInit = {
    ...VfFormControl.shadowRootOptions,
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
      /* Breathing room for the default-button ring drawn at inset -4 system px.
         A vf-button-group zeroes this (via --vf-button-ring-margin) and reserves
         the ring space itself, so grouped button *faces* align instead of their
         margin boxes — see src/components/vf-button-group.ts. */
      :host([variant='default']) {
        margin: calc(
          var(--vf-scale, 1) * var(--vf-button-ring-margin, ${RING_INSET}px)
        );
      }
      /* The default ring: a 3px stepped band with a transparent 1px gap to the
         button, clipped as an evenodd donut so the gap shows the surface
         behind it (the reference's gap pixels are alpha-0). */
      :host([variant='default'])::before {
        content: '';
        position: absolute;
        inset: calc(var(--vf-scale, 1) * -${RING_INSET}px);
        background: var(--vf-black, #000);
        clip-path: ${unsafeCSS(steppedRingClip(RING_FRAME, RING_HOLE))};
        pointer-events: none;
      }
      /* Disabled default: the fat outer ring dims to gray; the inner button
         border stays solid black (see button:disabled). */
      :host([variant='default'][disabled])::before {
        background: var(--vf-disabled, #c0c0c0);
      }
      /* The native button paints no box of its own — its frame and face are
         the stepped pseudo-element silhouettes below. Keeping the clip-paths
         off the button itself leaves the :focus-visible outline unclipped
         (clip-path would swallow it) and the hit area a plain rectangle. */
      button {
        position: relative;
        /* Own stacking context so the negative-z silhouettes stay inside the
           button: above everything behind it, below the label. */
        z-index: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: calc(var(--vf-scale, 1) * var(--vf-control-height, 22px));
        min-width: calc(var(--vf-scale, 1) * 64px);
        /* Fill the host so a vf-button-group can stretch this face to the
           shared column width. Standalone (shrink-wrapped host) it's a no-op. */
        flex: var(--vf-button-flex, 0 1 auto);
        padding: 0 calc(var(--vf-scale, 1) * 14px);
        background: none;
        border: none;
        color: var(--vf-black, #000);
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        line-height: inherit;
        white-space: nowrap;
        cursor: inherit;
      }
      /* Frame: the outer silhouette in solid black. The face below covers all
         but the outline, leaving the reference's exact border pixels — the
         QuickDraw difference-of-silhouettes, not a stroked border. */
      button::before,
      button::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
      }
      button::before {
        background: var(--vf-black, #000);
        clip-path: ${unsafeCSS(steppedRectClip(BUTTON_FRAME))};
      }
      /* Face: white fill inset one pixel, with its own traced corner steps. */
      button::after {
        background: var(--vf-white, #fff);
        clip-path: ${unsafeCSS(steppedRectClip(BUTTON_FACE))};
      }
      /* Pressed: instant white-on-black inversion. */
      button:active:not(:disabled) {
        color: var(--vf-white, #fff);
      }
      button:active:not(:disabled)::after {
        background: var(--vf-black, #000);
      }
      /* Small: the 16px button from the reference's third row. The corner
         traces are identical (verified against the 80×16 sample sheet row),
         so only the metrics change — and the label drops to the body face,
         matching the sheet's smaller Geneva-9-style labels. */
      :host([size='small']) {
        font-family: var(
          --vf-font-family,
          'FindersKeepers',
          'Geneva',
          'Helvetica Neue',
          Helvetica,
          Arial,
          sans-serif
        );
        font-size: calc(var(--vf-scale, 1) * var(--vf-font-size, 16px));
        -webkit-font-smoothing: var(--vf-font-smoothing, antialiased);
      }
      :host([size='small']) button {
        height: calc(var(--vf-scale, 1) * var(--vf-control-height-small, 16px));
        min-width: calc(var(--vf-scale, 1) * 48px);
        padding: 0 calc(var(--vf-scale, 1) * 14px);
      }
      /* Disabled: only the label dims to gray; the solid black border stays. */
      button:disabled {
        color: var(--vf-disabled, #c0c0c0);
      }
    `,
  ]

  /**
   * When set to `'default'`, draws the classic double ring that marks the
   * default button (activated by Return in real System 7 dialogs).
   */
  @property({ reflect: true }) variant?: 'default'

  /**
   * When set to `'small'`, renders the compact 16px button from the
   * reference sheet's third row: same pixel-traced corners, body-face label.
   */
  @property({ reflect: true }) size?: 'small'

  /**
   * Activation behavior, mirroring native `<button type>`:
   * `'submit'` submits the associated form, `'reset'` resets it and
   * `'button'` (the default) does nothing beyond the `click` event.
   */
  @property() type: 'button' | 'submit' | 'reset' = 'button'

  /** Form field name; submitted as `name=value` when `type="submit"`. */
  @property({ reflect: true }) name = ''

  /** Value submitted under `name` when `type="submit"`. */
  @property({ reflect: true }) value = ''

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  override render() {
    return html`
      <button
        part="button"
        class="vf-focus"
        type="button"
        ?disabled=${this.isDisabled}
        @click=${this.handleClick}
      >
        <slot></slot>
      </button>
    `
  }

  private handleClick = (event: MouseEvent): void => {
    if (this.isDisabled || this.type === 'button') return
    // Respect a click whose default was already prevented (e.g. cancelled in
    // the capture phase) before emulating the native submit/reset action.
    if (event.defaultPrevented) return
    const form = this.internals.form
    if (!form) return
    // A form-associated custom element can't be a form's native submitter, so
    // briefly insert a real native button, activate it — carrying submitter
    // identity and this button's name/value into the submission — then remove
    // it (the standard technique for a shadow-DOM form button).
    const proxy = document.createElement('button')
    proxy.type = this.type
    proxy.style.position = 'absolute'
    proxy.style.width = '0'
    proxy.style.height = '0'
    proxy.style.overflow = 'hidden'
    proxy.style.clipPath = 'inset(50%)'
    if (this.type === 'submit' && this.name) {
      proxy.name = this.name
      proxy.value = this.value
    }
    form.append(proxy)
    proxy.click()
    proxy.remove()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-button': VfButton
  }
}
