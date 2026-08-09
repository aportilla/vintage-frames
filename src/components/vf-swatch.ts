import { css, html, unsafeCSS, type PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { styleMap } from 'lit/directives/style-map.js'
import { vfBase, vfFocusUnderline, vfHardShadowDecls } from '../styles/base.js'
import {
  tileImage,
  tileRects,
  tileSpan,
  vfTileSize,
  type TileRect,
} from '../styles/recipes/tile.js'
import {
  TileRasterCache,
  patternOverride,
  tileGrid,
  vfTileGrid,
} from '../tile-grid.js'
import { ScaleController, sysLength } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { VfShadowRoleControl } from '../form-control.js'

/**
 * The transparency checker: a 4-system-px motif of 2×2 checks, stated once as
 * rect data and derived into the SVG tile (the CSS-repeated underlay and the
 * `--vf-swatch-checker` documentation geometry) and the raster whole-surface
 * fill the swatch actually shows (src/tile-grid.ts). Above the class for the
 * same reason as vf-desktop's dither — `@vfElement` upgrades at module
 * evaluation, before a module-tail const is initialized.
 */
const CHECKER_MOTIF = 4
const CHECKER_RECTS: readonly TileRect[] = [
  [0, 0, 4, 4, '#ffffff'],
  [0, 0, 2, 2, '#c0c0c0'],
  [2, 2, 2, 2, '#c0c0c0'],
]
const CHECKER_TILE = tileImage(CHECKER_MOTIF, CHECKER_MOTIF, tileRects(CHECKER_RECTS))
const CHECKER_SPAN = tileSpan(CHECKER_MOTIF)

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
 *   a 4×4 motif of 2×2 white/`#c0c0c0` checks, on a 60-system-px tile
 *   (override the whole tile like `--vf-desktop-pattern` — consumer art
 *   renders as a placed tile grid at that same geometry)
 */
@vfElement('vf-swatch')
export class VfSwatch extends VfPositioned(VfShadowRoleControl) {
  static override shadowRootOptions: ShadowRootInit = {
    ...VfShadowRoleControl.shadowRootOptions,
    delegatesFocus: true,
  }

  static override styles = [
    vfBase,
    vfTileGrid,
    css`
      :host {
        display: inline-flex;
        cursor: var(--vf-cursor, default);
        /* The transparency checker: 2×2-system-px white/#c0c0c0 checks on a
           4×4 motif. Resolved into a private property once so the underlay
           rule and the tile grid's art channel below share one definition;
           override the public token to retheme the whole tile. What actually
           shows is the exact fill rendered into .fill (see src/tile-grid.ts):
           the whole-surface raster for the kit checker, or the placed tile
           grid at the token's documented 60-px tile geometry for a consumer
           override. */
        --_checker: var(--vf-swatch-checker, ${unsafeCSS(CHECKER_TILE)});
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
        /* The containing block for the exact fill and the tint. */
        position: relative;
        width: 100%;
        height: 100%;
        /* The CSS-repeated underlay, occluded by the (opaque) kit raster —
           belt-and-braces paint only, like vf-desktop's. */
        background-image: var(--_checker);
        ${vfTileSize(CHECKER_MOTIF)}
        /* Forced colors would delete the color layer and keep the checker,
           showing "transparent" for every color. The fill is CONTENT, not
           chrome — the color is the one thing the control exists to show,
           the case forced-color-adjust's own spec exempts (its example is a
           color picker). It inherits to the raster, tiles and tint. Frame,
           inset and press feedback stay on the forced palette like every
           other control's. */
        @media (forced-colors: active) {
          forced-color-adjust: none;
        }
      }
      /* A consumer checker token switches the fill to the placed tile grid;
         the underlay must not paint beneath it — a translucent consumer tile
         would show the underlay's drifting copy of itself. The grid's tiles
         resolve the token through the shared private property. */
      .fill.patterned {
        background-image: none;
        --_vf-tile-image: var(--_checker);
      }
      /* The color, painted over the checker so a translucent value reads as
         partial — the same compositing the two-layer background used to do. */
      .tint {
        position: absolute;
        inset: 0;
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

  /**
   * The consumer's `--vf-swatch-checker` override, or `''` for the kit
   * checker — which exact-fill path render() takes (src/tile-grid.ts).
   * Re-read every update; a runtime token swap wants a `requestUpdate()`.
   */
  private _pattern = ''

  /** The whole-surface checker raster, cached against the fill's size. */
  readonly #raster = new TileRasterCache()

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    this._pattern = patternOverride(this, '--vf-swatch-checker')
  }

  protected override render() {
    // The fill box inside the 1px border and 1px inset, in system px. The
    // raster overdraws it by one motif each way, sized explicitly in system
    // px rather than stretched to the fill: the button's floored border can
    // leave the fill box a fraction of a system px larger than its stated
    // size, and a stretched image would render irregular checker cells. The
    // fill's clip crops the overdraw; a placed tile overdraws the fill by
    // construction (its 60-px span exceeds any real swatch).
    const fillW = Math.max(1, (this.width ?? 24) - 4)
    const fillH = Math.max(1, (this.height ?? 18) - 4)
    const ceilTo = (v: number) => Math.ceil((v + CHECKER_MOTIF) / CHECKER_MOTIF) * CHECKER_MOTIF
    const fill = this._pattern
      ? tileGrid({
          cols: Math.ceil(fillW / CHECKER_SPAN),
          rows: Math.ceil(fillH / CHECKER_SPAN),
          tile: CHECKER_SPAN,
        })
      : html`<span
          class="vf-tile-raster"
          style="width:${sysLength(ceilTo(fillW))};height:${sysLength(
            ceilTo(fillH)
          )};background-image:${this.#raster.for(
            CHECKER_MOTIF,
            CHECKER_MOTIF,
            CHECKER_RECTS,
            ceilTo(fillW),
            ceilTo(fillH)
          )}"
        ></span>`
    // styleMap writes the color through CSSOM setProperty, which takes one
    // declaration and rejects a malformed value outright — a color string can
    // neither smuggle extra declarations onto the tint nor half-apply.
    const tint = this.color
      ? html`<span
          class="tint"
          style=${styleMap({ 'background-color': this.color })}
        ></span>`
      : null
    return html`
      <button
        part="button"
        class="vf-snap"
        type="button"
        style="width: ${sysLength(this.width)}; height: ${sysLength(this.height)}"
        aria-label=${this.label || this.hostLabel || this.color || 'transparent'}
        aria-describedby=${this.describedBy}
        ?disabled=${this.isDisabled}
      >
        <span
          class="fill vf-tile-grid${this._pattern ? ' patterned' : ''}"
          part="fill"
          >${fill}${tint}</span
        >
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
