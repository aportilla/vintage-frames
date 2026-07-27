import { css, html, LitElement } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { vfBase, vfFocusUnderline, vfHardShadowDecls } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

/**
 * `<vf-swatch>` — a color-swatch button: the hard-shadowed color well of a
 * palette cell.
 *
 * A solid rectangle with a 1px black border, a 1px white inset ring and the
 * kit's shared hard shadow, filled edge-to-edge with a solid color. Given no
 * `color` at all it shows the transparency checker instead — the "this cell
 * holds nothing" grid every paint program draws behind an empty fill.
 *
 * `width`/`height` state the border box in whole system pixels (the fill is
 * what remains inside the border and inset), multiplied by `--vf-scale` like
 * every other metric, so the swatch holds the device-pixel grid wherever a
 * palette puts it. The shadow is the shared `--vf-shadow-offset` token — the
 * same depth cue as windows, menus and alerts, painted outside the box like
 * theirs.
 *
 * It is "basically a button": a native `<button>` inside, so `click` retargets
 * to the host, Enter/Space activate it, and pressing inverts the white inset
 * to black — the inset counterpart of vf-button's face inversion. Keyboard
 * focus is marked with the kit's 1px dashed rule under the box
 * (`vfFocusUnderline`) rather than a ring around it. It is not
 * form-associated (a palette cell picks, it doesn't submit); `disabled` only
 * stops interaction, dimming nothing — the kit dims *labels* when disabled,
 * and a swatch's only label is its fill, which must keep reading as its color.
 *
 * @csspart button - The inner native `<button>` (border, inset and shadow).
 * @csspart fill - The color area inside the inset.
 */
@customElement('vf-swatch')
export class VfSwatch extends LitElement {
  static override shadowRootOptions: ShadowRootInit = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  }

  static override styles = [
    vfBase,
    css`
      :host {
        display: inline-flex;
        cursor: default;
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
      }
      /* The 1px black frame, and — as the button's own background showing
         through its 1px padding — the white inset ring around the fill. The
         shadow is the kit's one hard shadow, painted outside the border box
         like every raised surface's. */
      button {
        display: block;
        /* Also the anchor the focus rule below hangs from. */
        position: relative;
        padding: calc(var(--vf-scale, 1) * 1px);
        margin: 0;
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        ${vfHardShadowDecls}
        cursor: inherit;
        -webkit-appearance: none;
        appearance: none;
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
         the hard shadow, whose depth is a token a consumer can retheme, so it
         composes rather than assumes it. The ±1px sides widen the rule from
         that same padding box to the border box, the shape the swatch reads
         as (the shadow is a depth cue, not part of the silhouette). */
      button:focus-visible {
        outline: none;
      }
      button:focus-visible::after {
        --vf-focus-underline-offset: calc(-3px - var(--vf-shadow-offset, 2px));
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
   * Accessible name for the inner button — a swatch has no text of its own.
   * Defaults to the `color` value (or "transparent"). `vf-label`'s `for`
   * wiring writes this property, like every `vf-*` control's.
   */
  @property() label = ''

  /** Disables the control: it stops responding. Nothing dims (see class doc). */
  @property({ type: Boolean, reflect: true }) disabled = false

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
        aria-label=${this.label || this.color || 'transparent'}
        ?disabled=${this.disabled}
      >
        <span class="fill" part="fill" style=${fill}></span>
      </button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-swatch': VfSwatch
  }
}
