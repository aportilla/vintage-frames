import { css, type CSSResult, type ReactiveController, type ReactiveControllerHost } from 'lit'
import { sysLength, toSys } from './scale.js'
import { TileRasterCache } from './tile-grid.js'
import { TrackWidthController } from './track-width.js'
import { PATTERN_SIZE, patternHex, patternMotif, type Pattern } from './patterns.js'

/** What a component hands the controller. */
export interface PatternFillOptions {
  /** The element whose background the pattern paints — a component's own
   *  snapped box, so the fill rides the grid-snap correction with it. */
  getBox: () => HTMLElement | null | undefined
  /** The resolved pattern, or null to paint nothing ({@link parsePattern}
   *  turns an attribute value into one). */
  getPattern: () => Pattern | null | undefined
  /**
   * The box's declared size in system px, per axis. A declared axis is used
   * as it is — exact, and free of any measurement; an axis left `null` or
   * `undefined` is measured off the box instead (a `ResizeObserver`,
   * `toSys`-rounded). Omit the whole option to measure both.
   */
  getSize?: () => { width?: number | null; height?: number | null } | null | undefined
}

/**
 * Paints a {@link Pattern} as a box's own background — the fill behind
 * `vf-container pattern="…"` and `vf-desktop pattern="…"`.
 *
 * It is the exact-fill idiom (src/tile-grid.ts) in its background form: the
 * motif is encoded as one raster at one image px per system px
 * (`tileRaster`, cached by pattern and size), sized in system px to the box
 * ceiled up to whole pattern cells plus one cell of overdraw, and stretched
 * onto that stated size under `image-rendering: pixelated`. Nearest-neighbor
 * sampling can only emit source colors and one image has no interior seams,
 * so the fill is 1-bit at every density and zoom — the same argument the
 * desktop dither rests on. A `background-size` stated in system px is one
 * stored length quantized once over the whole image (≤ 1/128 CSS px), not a
 * repeat, and the box's background painting area crops the overdraw.
 *
 * A background rather than a child element, on purpose: it paints below all
 * content by definition — no `isolation: isolate` + `z-index: -1`, so a
 * patterned box never becomes a stacking context that traps a slotted
 * control's drop-open panel under a later sibling — and it clips itself, so
 * the box keeps `overflow: visible` (a container's outgrowing content
 * overflows by contract). The one thing a background costs is that
 * `image-rendering` is an inherited property: {@link vfPatternFill} sets it
 * on the box only while patterned and hands `auto` back to the slot, so
 * slotted content renders as it did.
 *
 * What it writes, all on the box's inline style and removed together the
 * moment there is nothing to paint: `--_vf-pattern-image` (the raster) and
 * `--_vf-pattern-size` (two live `sysLength`s). Custom-property channels,
 * not `background-image` itself, so the recipe's forced-colors rule can
 * out-cascade them without `!important` — an inline `background-image`
 * could not be overridden from a stylesheet. The paper is the recipe's, a
 * token: `var(--vf-white)` behind ink that is literal black, like every kit
 * raster. Density and zoom re-encode nothing: the raster is keyed on system
 * px, and the stated lengths are live against `--vf-scale`.
 *
 * Phase is anchored at the box's top-left — where the desktop, trough and
 * swatch anchor theirs. Two same-pattern boxes meeting at an offset that is
 * not a multiple of 8 show a phase seam; a port-anchored phase would be a
 * contained follow-up, not a change here.
 */
export class PatternFillController implements ReactiveController {
  readonly #host: ReactiveControllerHost & HTMLElement
  readonly #opts: PatternFillOptions
  readonly #raster = new TileRasterCache()

  /**
   * The measurer for an undeclared axis. Always constructed (so it registers
   * ahead of this controller and measures before it reads), but it observes
   * nothing until an axis actually needs measuring: its target callback
   * hands it the box only then.
   */
  readonly #measure: TrackWidthController

  /** The box last written to, and what was written, so an unchanged update
   *  costs nothing and an unrelated render never re-asserts anything. */
  #box: HTMLElement | null = null
  #image = ''
  #stated = ''
  #size: { width: number; height: number } | null = null

  constructor(host: ReactiveControllerHost & HTMLElement, opts: PatternFillOptions) {
    this.#host = host
    this.#opts = opts
    this.#measure = new TrackWidthController(host, () => {
      if (!opts.getPattern()) return null
      const declared = opts.getSize?.()
      const needs = declared == null || declared.width == null || declared.height == null
      return needs ? opts.getBox() : null
    })
    host.addController(this)
  }

  /** The raster's current box in system px (overdraw included), or null
   *  while nothing is painted. */
  get size(): { width: number; height: number } | null {
    return this.#size
  }

  hostUpdated(): void {
    this.#apply()
  }

  #apply(): void {
    const box = this.#opts.getBox() ?? null
    if (box !== this.#box) {
      // A different box (a re-rendered template) — never leave the old one
      // painted.
      this.#clear()
      this.#box = box
    }
    const pattern = this.#opts.getPattern() ?? null
    if (!box || !pattern) {
      this.#clear()
      return
    }

    const declared = this.#opts.getSize?.() ?? null
    const width = whole(declared?.width) ?? this.#measured(this.#measure.width)
    const height = whole(declared?.height) ?? this.#measured(this.#measure.height)
    if (!width || !height) {
      // Not measured yet (the observer's first callback requests an update),
      // or a box with no extent: nothing to paint.
      this.#clear()
      return
    }

    // Whole cells plus one of overdraw: a floored border or a fractional
    // measured box overshoots rather than stretches, and the background
    // painting area crops the rest.
    const cells = (n: number): number =>
      Math.ceil((n + PATTERN_SIZE) / PATTERN_SIZE) * PATTERN_SIZE
    const rasterWidth = cells(width)
    const rasterHeight = cells(height)
    const motif = patternMotif(pattern)
    const image = this.#raster.for(
      motif.width,
      motif.height,
      motif.rects,
      rasterWidth,
      rasterHeight,
      patternHex(pattern)
    )
    const stated = `${sysLength(rasterWidth)} ${sysLength(rasterHeight)}`
    this.#size = { width: rasterWidth, height: rasterHeight }
    if (image === this.#image && stated === this.#stated) return
    this.#image = image
    this.#stated = stated
    box.style.setProperty('--_vf-pattern-image', image)
    box.style.setProperty('--_vf-pattern-size', stated)
  }

  /** A measured CSS-px extent as whole system px; 0 while unmeasured. */
  #measured(cssPx: number): number {
    return cssPx > 0 ? toSys(cssPx, this.#host) : 0
  }

  #clear(): void {
    this.#size = null
    if (!this.#image && !this.#stated) return
    this.#image = ''
    this.#stated = ''
    this.#box?.style.removeProperty('--_vf-pattern-image')
    this.#box?.style.removeProperty('--_vf-pattern-size')
  }
}

/** A declared extent: a positive whole number of system px, else null. */
const whole = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null

/**
 * The rules behind {@link PatternFillController}, for the box it paints:
 * give the box the `vf-pattern-fill` class always, and `vf-patterned` while
 * a pattern is resolved (the component's template knows).
 *
 * Painting: the raster the controller wrote, at the size it stated, once
 * (`no-repeat` — the overdraw is the repeat), nearest-neighbor. The paper
 * and the pixelation ride the `vf-patterned` state so an unpatterned box
 * paints exactly nothing and inherits nothing new. `image-rendering`
 * inherits, so the slot hands `auto` back to slotted content: a consumer's
 * own `<img>` renders as it would anywhere else, and a kit element that
 * wants nearest-neighbor (`vf-img`, a `vf-icon`) says so itself. A page
 * that set `pixelated` on an ancestor gets `auto` inside a patterned box —
 * its own declaration on the child still wins, as everywhere.
 *
 * Forced colors: the image goes, the paper is the remapped Canvas — the
 * desktop's posture, a backdrop being decoration.
 */
export const vfPatternFill: CSSResult = css`
  .vf-pattern-fill {
    background-image: var(--_vf-pattern-image, none);
    background-size: var(--_vf-pattern-size, auto);
    background-repeat: no-repeat;
  }
  .vf-pattern-fill.vf-patterned {
    background-color: var(--vf-white, #fff);
    image-rendering: pixelated;
  }
  .vf-pattern-fill.vf-patterned > slot {
    image-rendering: auto;
  }
  @media (forced-colors: active) {
    .vf-pattern-fill {
      background-image: none;
    }
  }
`
