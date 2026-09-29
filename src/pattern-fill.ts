import { css, type CSSResult, type ReactiveControllerHost } from 'lit'
import { RepeatTileController, vfRepeatTileSize } from './tile-grid.js'
import { patternMotif, type Pattern, type PatternMotif } from './patterns.js'

/** What a component hands the controller. */
export interface PatternFillOptions {
  /** The element whose background the pattern paints — a component's own
   *  snapped box, so the fill rides the grid-snap correction with it. */
  getBox: () => HTMLElement | null | undefined
  /** The resolved pattern, or null to paint nothing ({@link parsePattern}
   *  turns an attribute value into one). */
  getPattern: () => Pattern | null | undefined
}

/** Each pattern's motif, derived once per resolved pattern. */
const motifs = new WeakMap<Pattern, PatternMotif>()

const motifOf = (pattern: Pattern): PatternMotif => {
  let motif = motifs.get(pattern)
  if (!motif) {
    motif = patternMotif(pattern)
    motifs.set(pattern, motif)
  }
  return motif
}

/**
 * Paints a {@link Pattern} as a box's own background — the fill behind
 * `vf-container pattern="…"` and `vf-desktop pattern="…"`: the pattern's
 * motif as a repeating tile drawn at the display's resolution
 * ({@link RepeatTileController}, src/tile-grid.ts), 1-bit at every density
 * and zoom, and the same cost for a box of any size — a resize encodes
 * nothing.
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
 * nothing to paint: `--_vf-pattern-image`, the tile. The paper is the
 * recipe's, a token: `var(--vf-white)` behind ink that is literal black,
 * like every kit raster.
 *
 * Phase is anchored at the box's top-left — where the desktop, trough and
 * swatch anchor theirs. Two same-pattern boxes meeting at an offset that is
 * not a multiple of 8 show a phase seam; a port-anchored phase would be a
 * contained follow-up, not a change here.
 */
export class PatternFillController extends RepeatTileController {
  constructor(host: ReactiveControllerHost & HTMLElement, opts: PatternFillOptions) {
    super(host, {
      getBox: opts.getBox,
      getArt: () => {
        const pattern = opts.getPattern()
        return pattern ? motifOf(pattern) : null
      },
      property: '--_vf-pattern-image',
    })
  }
}

/**
 * The rules behind {@link PatternFillController}, for the box it paints:
 * give the box the `vf-pattern-fill` class always, and `vf-patterned` while
 * a pattern is resolved (the component's template knows).
 *
 * Painting: the tile the controller wrote, repeated from the padding box's
 * corner at {@link vfRepeatTileSize}, nearest-neighbor. The paper and the
 * pixelation ride the `vf-patterned` state so an unpatterned box paints
 * exactly nothing and inherits nothing new. `image-rendering` inherits, so
 * the slot hands `auto` back to slotted content: a consumer's own `<img>`
 * renders as it would anywhere else, and a kit element that wants
 * nearest-neighbor (`vf-img`, a `vf-icon`) says so itself. A page that set
 * `pixelated` on an ancestor gets `auto` inside a patterned box — its own
 * declaration on the child still wins, as everywhere.
 *
 * Forced colors: the image goes, the paper is the remapped Canvas — the
 * desktop's posture, a backdrop being decoration.
 */
export const vfPatternFill: CSSResult = css`
  .vf-pattern-fill {
    background-image: var(--_vf-pattern-image, none);
    ${vfRepeatTileSize}
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
