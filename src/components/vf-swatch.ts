import { css, html } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { styleMap } from 'lit/directives/style-map.js'
import { vfBase, vfFocusUnderline, vfHardShadowDecls } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { VfShadowRoleControl } from '../form-control.js'

/**
 * `<vf-swatch>` — a color-swatch button: the color well of a palette cell.
 *
 * A solid rectangle with a 1px black border and a 1px white inset ring, filled
 * edge-to-edge with a solid color. Given no `color` at all it shows the
 * transparency checker instead — the "this cell holds nothing" grid every
 * paint program draws behind an empty fill.
 *
 * `width`/`height` state the border box in whole system pixels (the fill is
 * what remains inside the border and inset), multiplied by `--vf-scale` like
 * every other metric, so the swatch holds the device-pixel grid wherever a
 * palette puts it.
 *
 * `shadow` opts into the kit's hard drop shadow — the shared
 * `--vf-shadow-offset` token, the same depth cue as windows, menus and alerts,
 * painted outside the box like theirs. It is off by default because the
 * swatch's usual home is a table of them (a `vf-grid`, a picker row), where
 * every cell shadowing its neighbour reads as noise rather than depth; a lone
 * well standing in for a current color — the one a dialog asks you to click —
 * is the case that wants it.
 *
 * It is "basically a button": a native `<button>` inside, so `click` retargets
 * to the host, Enter/Space activate it, and pressing inverts the white inset
 * to black — the inset counterpart of vf-button's face inversion. Keyboard
 * focus is marked with the kit's 1px dashed rule under the box
 * (`vfFocusUnderline`) rather than a ring around it. It is form-associated
 * for the *disabled* contract alone — an ancestor `<fieldset disabled>` must
 * reach a palette the way it reaches every other control, and only the
 * form-associated lifecycle delivers that across the shadow boundary — but it
 * submits nothing (a palette cell picks, it doesn't submit; no `name`, no
 * value, no `FormData` entry). `disabled` only stops interaction, dimming
 * nothing — the kit dims *labels* when disabled, and a swatch's only label is
 * its fill, which must keep reading as its color.
 *
 * @csspart button - The inner native `<button>` (border, inset and, with
 *   `shadow`, the drop shadow).
 * @csspart fill - The color area inside the inset.
 * @cssprop --vf-swatch-checker - `vf-swatch`'s no-color transparency checker —
 *   a 4×4 tile of 2×2 white/`#c0c0c0` checks (override the whole pattern like
 *   `--vf-desktop-pattern`)
 */
@vfElement('vf-swatch')
export class VfSwatch extends VfPositioned(VfShadowRoleControl) {
  static override shadowRootOptions: ShadowRootInit = {
    ...VfShadowRoleControl.shadowRootOptions,
    delegatesFocus: true,
  }

  static override styles = [
    vfBase,
    css`
      :host {
        display: inline-flex;
        cursor: var(--vf-cursor, default);
        /* The transparency checker: 2×2-system-px white/#c0c0c0 checks on a
           4×4 SVG tile — crisp 1-bit rects for the same reason as vf-desktop's
           dither (gradient hard stops feather at scale). Resolved into a
           private property once so the .fill rule below and render()'s
           translucent-color layering share one definition; override the
           public token to retheme the whole pattern. */
        --_checker: var(
          --vf-swatch-checker,
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'%3E%3Crect width='4' height='4' fill='%23ffffff'/%3E%3Crect width='2' height='2' fill='%23c0c0c0'/%3E%3Crect x='2' y='2' width='2' height='2' fill='%23c0c0c0'/%3E%3C/svg%3E")
        );
        /* How deep a shadow this swatch actually casts — nothing unless the
           shadow attribute is set. Resolved here once so the focus rule below
           can compose the real depth rather than assume one, and so a consumer
           retheming --vf-shadow-offset still moves both together. */
        --_shadow-depth: 0px;
      }
      :host([shadow]) {
        --_shadow-depth: var(--vf-shadow-offset, 2px);
      }
      /* The 1px black frame, and — as the button's own background showing
         through its 1px padding — the white inset ring around the fill. */
      button {
        display: block;
        /* Also the anchor the focus rule below hangs from. */
        position: relative;
        padding: calc(var(--vf-scale, 1) * 1px);
        margin: 0;
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        cursor: inherit;
        -webkit-appearance: none;
        appearance: none;
      }
      /* Opt-in depth: the kit's one hard shadow, painted outside the border
         box like every raised surface's. */
      :host([shadow]) button {
        ${vfHardShadowDecls}
      }
      /* Pressed: the white inset inverts to black — instant 1-bit feedback. */
      button:active:not(:disabled) {
        background: var(--vf-black, #000);
      }
      /* Keyboard focus is the kit's dashed rule under the swatch, not a ring
         around it (see vfFocusUnderline). It goes BELOW the whole box rather
         than inside it the way vf-button underlines its label: a swatch has no
         interior to lend — every pixel inside the inset is the color it exists
         to show, and a rule drawn over the fill would read as part of it.

         The offset counts every row of ink below the pseudo-element's padding
         box before the blank row and the rule itself — the 1px border, then
         whatever shadow this swatch is casting — none by default, a rethemeable
         token under the shadow attribute — so it composes --_shadow-depth
         rather than assuming a depth. The ±1px sides widen the rule from that
         same padding box to the border box, the shape the swatch reads as (the
         shadow is a depth cue, not part of the silhouette). */
      button:focus-visible {
        outline: none;
      }
      button:focus-visible::after {
        --vf-focus-underline-offset: calc(-3px - var(--_shadow-depth));
        ${vfFocusUnderline}
        left: calc(var(--vf-scale, 1) * -1px);
        right: calc(var(--vf-scale, 1) * -1px);
      }
      .fill {
        display: block;
        width: 100%;
        height: 100%;
        background-image: var(--_checker);
        /* One checker tile per 4 system px; with a color layered on in
           render() the single size repeats across both layers, which is
           harmless — a uniform gradient tiles invisibly. */
        background-size: calc(var(--vf-scale, 1) * 4px)
          calc(var(--vf-scale, 1) * 4px);
        /* Forced colors would delete the color layer (a gradient) and keep
           the checker, showing "transparent" for every color. The fill is
           CONTENT, not chrome — the color is the one thing the control
           exists to show, the case forced-color-adjust's own spec exempts
           (its example is a color picker). Frame, inset and press feedback
           stay on the forced palette like every other control's. */
        @media (forced-colors: active) {
          forced-color-adjust: none;
        }
      }
    `,
  ]

  /**
   * The fill — a CSS color, typically the hex the palette calls for. Unset,
   * the swatch shows the transparency checker; a translucent value (an
   * 8-digit hex) layers over that same checker, so partial opacity reads as
   * partial. An unparseable value falls back to the checker too.
   */
  @property() color?: string

  /** The swatch's border box width in whole system px. */
  @property({ type: Number }) width = 24

  /** The swatch's border box height in whole system px. */
  @property({ type: Number }) height = 18

  /**
   * Cast the kit's hard drop shadow (`--vf-shadow-offset`). Off by default:
   * the plain black-bordered well is what a table of swatches wants, and the
   * depth cue is for the lone well that stands in for a current color.
   */
  @property({ type: Boolean, reflect: true }) shadow = false

  /**
   * Accessible name for the inner button — a swatch has no text of its own.
   * Left empty, the name falls back to whatever the host carries
   * (`aria-labelledby`, `aria-label`, an associated `<label for>` — see
   * {@link VfShadowRoleControl.hostLabel}), then to the `color` value (or
   * "transparent") as a last resort, so a palette is never nameless — but a
   * hex literal announced as "number f f six six zero zero" is a fallback to
   * name past, not a name. `vf-label`'s `for` wiring writes this property,
   * like every `vf-*` control's.
   */
  @property() label = ''

  /** Disables the control: it stops responding. Nothing dims (see class doc). */
  @property({ type: Boolean, reflect: true }) override disabled = false

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  protected override render() {
    // styleMap writes the color through CSSOM setProperty, which takes one
    // declaration and rejects a malformed value outright — a color string can
    // neither smuggle extra declarations onto the fill nor half-apply.
    const fill = styleMap(
      this.color
        ? {
            'background-image': `linear-gradient(${this.color}, ${this.color}), var(--_checker)`,
          }
        : {},
    )
    return html`
      <button
        part="button"
        class="vf-snap"
        type="button"
        style="width: calc(var(--vf-scale, 1) * ${this.width}px); height: calc(var(--vf-scale, 1) * ${this.height}px)"
        aria-label=${this.label || this.hostLabel || this.color || 'transparent'}
        aria-describedby=${this.describedBy}
        ?disabled=${this.isDisabled}
      >
        <span class="fill" part="fill" style=${fill}></span>
      </button>
      ${this.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-swatch': VfSwatch
  }
}
