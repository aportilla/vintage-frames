import { css, type CSSResult, type ReactiveController, type ReactiveControllerHost } from 'lit'
import { effectiveScale, onScaleChange } from './scale.js'
import { truePixelRatio } from './zoom.js'
import { tileRaster } from './styles/recipes/tile.js'
import { patternHex, patternMotif, type Pattern } from './patterns.js'

/** What a component hands the controller. */
export interface PatternFillOptions {
  /** The element whose background the pattern paints — a component's own
   *  snapped box, so the fill rides the grid-snap correction with it. */
  getBox: () => HTMLElement | null | undefined
  /** The resolved pattern, or null to paint nothing ({@link parsePattern}
   *  turns an attribute value into one). */
  getPattern: () => Pattern | null | undefined
}

/**
 * The repeating tile's side in system px. A whole number of every pattern's
 * motif (8 × 15), and a whole number of layout px in every engine at every
 * density and zoom: 120 × n device px over the engine's own ratio — 40n at
 * 3×, 60n at 2×. Small tiles fail on iOS even at exact lengths (WebKit on a
 * 3× display now and then draws one tile a device px narrow and resamples
 * it); at 120 that was never seen (docs/TILE-REPEAT-PLAN.md).
 */
const TILE = 120

/** Encoded tiles, one per pattern and density, shared by the whole page. */
const tiles = new Map<string, string>()

/** The pattern's tile drawn at `n` device px per system px, cached. */
function tileFor(pattern: Pattern, n: number): string {
  const key = `${patternHex(pattern)}|${n}`
  let image = tiles.get(key)
  if (!image) {
    const motif = patternMotif(pattern)
    image = tileRaster(motif.width, motif.height, motif.rects, TILE, TILE, n)
    tiles.set(key, image)
  }
  return image
}

/**
 * Paints a {@link Pattern} as a box's own background — the fill behind
 * `vf-container pattern="…"` and `vf-desktop pattern="…"`.
 *
 * The pattern is a CSS repeat of one tile, 120 system px square, drawn at
 * the device resolution it is shown at: each system px of the pattern is an
 * n × n block of image px, n = `--vf-scale × trueDpr` (whole by the scale
 * contract). The engine then copies the tile 1:1 and has no filtering to
 * choose, which is what keeps Safari's repeat 1-bit — it smooths a tile it
 * has to magnify whatever `image-rendering` says. `pixelated` stays on for
 * the frame after a zoom change, before the tile for the new n arrives.
 *
 * The tile depends on n and the pattern, never on the box's size: it is
 * encoded once per (pattern, n) for the whole page, and a resize re-encodes
 * nothing. A zoom or display change re-draws it ({@link onScaleChange}), and
 * each host update re-reads n, so a `--vf-scale` override set on an ancestor
 * after the fact is picked up on the next update.
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
 * What it writes, on the box's inline style and removed the moment there is
 * nothing to paint: `--_vf-pattern-image`, the tile. A custom-property
 * channel, not `background-image` itself, so the recipe's forced-colors rule
 * can out-cascade it without `!important`. The paper is the recipe's, a
 * token: `var(--vf-white)` behind ink that is literal black, like every kit
 * raster.
 *
 * Phase is anchored at the box's top-left — where the desktop, trough and
 * swatch anchor theirs. Two same-pattern boxes meeting at an offset that is
 * not a multiple of 8 show a phase seam; a port-anchored phase would be a
 * contained follow-up, not a change here.
 */
export class PatternFillController implements ReactiveController {
  readonly #opts: PatternFillOptions
  #stopScale?: () => void

  /** The box last written to, and what was written, so an unchanged update
   *  costs nothing and an unrelated render never re-asserts anything. */
  #box: HTMLElement | null = null
  #image = ''

  constructor(host: ReactiveControllerHost & HTMLElement, opts: PatternFillOptions) {
    this.#opts = opts
    host.addController(this)
  }

  hostConnected(): void {
    // Reader tier: the kit's own --vf-scale writers have run by the time
    // this reads the new scale back.
    this.#stopScale = onScaleChange(() => this.#apply())
  }

  hostDisconnected(): void {
    this.#stopScale?.()
    this.#stopScale = undefined
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
    const n = Math.max(1, Math.round(effectiveScale(box) * truePixelRatio()))
    const image = tileFor(pattern, n)
    if (image === this.#image) return
    this.#image = image
    box.style.setProperty('--_vf-pattern-image', image)
  }

  #clear(): void {
    if (!this.#image) return
    this.#image = ''
    this.#box?.style.removeProperty('--_vf-pattern-image')
  }
}

/**
 * The rules behind {@link PatternFillController}, for the box it paints:
 * give the box the `vf-pattern-fill` class always, and `vf-patterned` while
 * a pattern is resolved (the component's template knows).
 *
 * Painting: the tile the controller wrote, repeated from the padding box's
 * corner at 120 system px — a length every engine holds exactly (see the
 * controller) — nearest-neighbor. The paper and the pixelation ride the
 * `vf-patterned` state so an unpatterned box paints exactly nothing and
 * inherits nothing new. `image-rendering` inherits, so the slot hands `auto`
 * back to slotted content: a consumer's own `<img>` renders as it would
 * anywhere else, and a kit element that wants nearest-neighbor (`vf-img`, a
 * `vf-icon`) says so itself. A page that set `pixelated` on an ancestor gets
 * `auto` inside a patterned box — its own declaration on the child still
 * wins, as everywhere.
 *
 * Forced colors: the image goes, the paper is the remapped Canvas — the
 * desktop's posture, a backdrop being decoration.
 */
export const vfPatternFill: CSSResult = css`
  .vf-pattern-fill {
    background-image: var(--_vf-pattern-image, none);
    background-size: calc(var(--vf-scale, 1) * ${TILE}px) calc(var(--vf-scale, 1) * ${TILE}px);
    background-repeat: repeat;
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
