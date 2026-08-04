import { css, html, LitElement, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { vfBase } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

/**
 * `<vf-img>` — a raster image on the kit's pixel grid.
 *
 * The reference art is full of small pixel graphics that are *pictures*, not
 * glyphs: the Apple menu's logo, desk-accessory and document icons, the
 * about-box machine portrait. This component displays one — a slotted native
 * `<img>` — at the kit's own magnification, treating **one image pixel as one
 * system pixel**:
 *
 * - the image is sized to `naturalWidth × naturalHeight` system px, multiplied
 *   by `--vf-scale` in `calc()` like every other metric, so a source pixel
 *   covers exactly `scale × dpr` device pixels (a whole number, per layout
 *   contract rule 1);
 * - `image-rendering: pixelated` keeps the resampling nearest-neighbor, and on
 *   a whole-device-pixel box that is bit-exact magnification — no smoothing,
 *   no half-covered edge rows;
 * - its own {@link GridSnapController}, so the image's origin holds the device
 *   grid wherever the page puts it (a fractional origin would slide the whole
 *   box across device pixels and shear every source pixel's coverage).
 *
 * The graphic stays a real `<img>` in the consumer's light DOM — it keeps
 * native loading, `alt` text (use `alt=""` for a decorative icon) and the
 * consumer's own asset URLs; the kit ships no raster files. `width`/`height`
 * (in system px, whole numbers) state the box up front so the page doesn't
 * shift when the file lands — until a size is known the box is 0×0, never a
 * flash of the image at some other scale. They also override the natural size
 * deliberately: a whole multiple (`width="32"` on 16-px art) magnifies on the
 * same grid.
 *
 * @slot - The image: a single `<img>` element.
 * @csspart frame - The sized box the image fills.
 */
@vfElement('vf-img')
export class VfImg extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    css`
      :host {
        display: inline-block;
      }
      .frame {
        display: block;
      }
      ::slotted(img) {
        display: block;
        width: 100%;
        height: 100%;
        /* Nearest-neighbor: the whole point. The box is whole device px, so
           magnification is bit-exact and no edge row is half-covered. */
        image-rendering: pixelated;
        /* Chrome, not content: System 7 icons don't drag out of the UI. */
        -webkit-user-drag: none;
      }
      /* A failed, undeclared image (see render()): released from the stretch
         so the browser renders it as a native broken <img> — alt text at its
         own size — instead of scaling it into a 0×0 frame. */
      .frame.failed ::slotted(img) {
        width: auto;
        height: auto;
      }
    `,
  ]

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * The displayed width in system px — a whole number. Defaults to the slotted
   * image's `naturalWidth` (one image px = one system px); state it explicitly
   * to reserve the box before the file loads, or a whole multiple to magnify.
   */
  @property({ type: Number }) width?: number

  /** The displayed height in system px; see {@link width}. */
  @property({ type: Number }) height?: number

  /** The slotted image's intrinsic size, 0 until it has one. */
  @state() private _naturalWidth = 0
  @state() private _naturalHeight = 0

  /** True when the slotted image has settled with no natural size (a failed
   *  load); see {@link #measure}. */
  @state() private _failed = false

  /** The image whose load we're watching, so a rehome moves the listener. */
  #img: HTMLImageElement | null = null

  protected override render() {
    const w = this.width ?? this._naturalWidth
    const h = this.height ?? this._naturalHeight
    // A failed load leaves no natural size, and clamping an undeclared box to
    // the 0×0 fallback erased the one thing still worth rendering: a native
    // <img alt="…"> that fails shows its alt text. Release the box instead so
    // the text can occupy it. Declared dimensions still hold — a sized native
    // <img> reserves its box around the alt text the same way.
    const released = this._failed && this.width == null && this.height == null
    return html`<span
      class="frame vf-snap ${released ? 'failed' : ''}"
      part="frame"
      style=${released
        ? nothing
        : `width: calc(var(--vf-scale, 1) * ${w}px); height: calc(var(--vf-scale, 1) * ${h}px)`}
      ><slot @slotchange=${this.#onSlotChange}></slot
    ></span>`
  }

  #onSlotChange = (event: Event): void => {
    const slot = event.target as HTMLSlotElement
    const img =
      slot
        .assignedElements({ flatten: true })
        .find((el): el is HTMLImageElement => el instanceof HTMLImageElement) ??
      null
    if (img !== this.#img) {
      // The listener stays attached while the img remains slotted (`load`
      // refires on a src swap, which changes the natural size); it lives on an
      // element inside this host's own light DOM, so it can't outlive us.
      this.#img?.removeEventListener('load', this.#onImgSettled)
      this.#img?.removeEventListener('error', this.#onImgSettled)
      this.#img = img
      img?.addEventListener('load', this.#onImgSettled)
      img?.addEventListener('error', this.#onImgSettled)
    }
    this.#measure()
  }

  #onImgSettled = (): void => {
    this.#measure()
  }

  /** Natural size if the image has one; 0×0 (an empty box) otherwise. */
  #measure(): void {
    const img = this.#img
    this._naturalWidth = img?.naturalWidth ?? 0
    this._naturalHeight = img?.naturalHeight ?? 0
    // `complete` with a src but no natural size is the settled-failed state.
    // Derived here rather than from the `error` event alone, because an image
    // that failed before it was slotted fires no further event to catch.
    this._failed =
      img != null && img.complete && img.naturalWidth === 0 && img.src !== ''
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-img': VfImg
  }
}
