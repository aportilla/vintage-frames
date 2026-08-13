import { css, html, LitElement, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { styleMap } from 'lit/directives/style-map.js'
import { vfBase } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

/** Every line the grid draws is the kit's one hairline: 1 system px. */
const RULE = 1

/**
 * The dashed pen's period in system px — 1 on, 1 off. The same rhythm as the
 * kit's other dashed 1-bit lines (the focus rule, the title bar's stripes),
 * because a 1-bit line has only one way to be half there.
 */
const DASH = 2

/** How `vf-grid` draws a cell boundary. */
export type VfGridRules = 'solid' | 'dashed' | 'none'

/**
 * A `w × h` 1-bit tile carrying single pixels at the given coordinates.
 *
 * Tiled at the lattice pitch, this is how the rules are drawn: a mask over the
 * rule color, so the color stays `--vf-black` and the SVG only says *where*
 * (SPEC §2: no hardcoded colors). Crisp SVG rects rather than gradient hard
 * stops, for the same reason as the windoid dither and the swatch checker —
 * gradient stops feather at scale, rects don't.
 */
const tile = (w: number, h: number, pixels: Array<[number, number]>): string => {
  const rects = pixels
    .map(([x, y]) => `%3Crect x='${x}' y='${y}' width='1' height='1'/%3E`)
    .join('')
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' shape-rendering='crispEdges'%3E${rects}%3C/svg%3E")`
}

/**
 * The two rule tiles for a lattice of `pitchX × pitchY` cells drawn with a
 * `dash`-period pen (1 = solid, 2 = one on, one off).
 *
 * Each tile is one pixel wide (or tall) at the line's own pitch and repeats
 * along it, so one mask layer draws every vertical rule and the other every
 * horizontal one.
 *
 * **Why each tile spans two pitches.** A dashed pen has to decide which of the
 * two phases each line starts on, and the only choice that behaves is
 * "ink where x + y is even" — the diagonal phase of a 50% dither. It is the one
 * rule under which the two layers always *agree* at a crossing: either both
 * draw that pixel (a clean cross) or neither does. Phase the lines
 * independently and a crossing where one layer inks and the other doesn't puts
 * a stray pixel beside a dash, and the "1px dashed" rule renders 2 and 3 px
 * clumps at half its intersections. Carrying it takes a tile two pitches long,
 * whose second line starts on the phase `pitch` steps away — `pitch % dash`,
 * which is 0 for a solid pen and for an odd cell, 1 for the even ones.
 */
const ruleTiles = (
  pitchX: number,
  pitchY: number,
  dash: number,
): { x: string; y: string } => ({
  x: tile(2 * pitchX, dash, [
    [0, 0],
    [pitchX, pitchX % dash],
  ]),
  y: tile(dash, 2 * pitchY, [
    [0, 0],
    [pitchY % dash, pitchY],
  ]),
})

/** A whole, positive system-px count — every grid metric is one. */
const whole = (value: number, fallback: number): number => {
  const n = Math.trunc(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** A system-px length in CSS px, scaled like every other metric in the kit. */
const scaled = (systemPx: number): string =>
  `calc(var(--vf-scale, 1) * ${systemPx}px)`

/**
 * `<vf-grid>` — a lattice of equal cells separated by 1px rules.
 *
 * The reference screens are full of these: the Figure 5-6 tool palette's 3×3
 * of desk accessories, a color picker's swatch table, a pattern or icon
 * chooser. They are all the same drawing — fixed-size cells butted together
 * with a hairline between them — and every one of them used to be hand-rolled
 * page CSS: a `display: grid` with a 1px gap over a black background, so the
 * background showed through as the rules. That trick only draws *solid*
 * interior rules, has to restate the cell size in three places, and puts the
 * kit's own artwork in the consumer's stylesheet.
 *
 * This draws it instead. State the cell count and cell size in whole system px
 * and slot the cells in; the component owns the track geometry and the rules:
 *
 * ```html
 * <vf-grid columns="3" rows="3" cell-width="26" cell-height="26">
 *   <button>…</button>  <!-- nine of them, one per cell -->
 * </vf-grid>
 * ```
 *
 * **The rules are a masked lattice, not gaps.** The grid's 1px gaps make the
 * room; a single overlay paints `--vf-black` through two tiled masks — one
 * column of pixels at the horizontal pitch, one row at the vertical — so the
 * pen switches from `solid` to `dashed` (1 on, 1 off) without the layout
 * moving a pixel. It paints *under* the cells (`z-index: -1` inside the grid's
 * own stacking context, above its surface), so an item that spans two cells
 * covers the boundary it swallowed, and a cell's own ink — a pressed face, a
 * focus rule, a hard shadow — is never crossed by a line.
 *
 * **Cells are centered in their wells.** What a palette holds is normally
 * smaller than the well it sits in — a 16px icon in a 26px cell — so a slotted
 * item is centered on both axes rather than parked in the corner, which is
 * where grid's own `stretch` default leaves anything carrying its own size. A
 * cell that means to fill its well — a tool button that inverts black when
 * selected, a tile whose border merges with the lattice — says
 * `place-self: stretch` and gets the whole track. (Under `collapse` that is
 * already the default: those cells exist to meet the lines.)
 *
 * **The perimeter is part of the lattice**, and drawn by default: the box
 * carries the 1px the outer lines need, and one uninterrupted pitch runs from
 * edge to edge. `frameless` drops it, for a grid inside something that already
 * draws that line — the desk-accessory palette is a `vf-window[flush]`, whose
 * frame *is* the grid's outer border, and a doubled one would read as 2px.
 *
 * **`collapse` puts an item's own border on the rule.** A cell that draws its
 * own 1px border — a bordered tile, a 16×16 swatch — otherwise sets that border
 * *beside* the lattice line, and every boundary reads 2px thick. `collapse`
 * pulls each cell back one pixel on all four sides, so the two become one line:
 * the `border-collapse: collapse` of a table, in system px. Size the cells at
 * *item − 2px* — `cell-width="14"` for a 16px item — and each item then spans
 * lattice line to lattice line, sharing one with each neighbor:
 *
 * ```html
 * <vf-grid columns="8" rows="4" cell-width="14" cell-height="14" collapse>
 * ```
 *
 * The frame is what gives the outermost borders a line of their own to land on,
 * and it ends the box exactly at the last item's outer edge; go `frameless` and
 * they paint a pixel outside the grid's box instead.
 *
 * `rules="none"` is the pen, not the lattice: nothing is drawn, the gaps close
 * up, and the cells butt directly together (there is then no perimeter and
 * nothing for `collapse` to collapse onto, so it goes inert).
 *
 * **Semantics are the consumer's.** The grid is layout — it takes no role, no
 * keyboard behavior and no selection, so what it holds decides what it is: put
 * `role="group"`/`aria-label` on the host for a tool palette, `role="radiogroup"`
 * for a picker, or nothing at all for a plain tiling. Slotted cells stay in the
 * light DOM with their own semantics intact.
 *
 * @slot - The cells, in order — one element per cell.
 * @csspart grid - The grid box itself (surface, tracks, frame padding).
 * @csspart rules - The lattice overlay painting the rules.
 * @cssprop --vf-surface - The surface behind the cells (default white).
 */
@vfElement('vf-grid')
export class VfGrid extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
      }
      .grid {
        display: grid;
        /* A cell is a fixed box and its contents are usually smaller than it —
           a 16px icon in a 26px well is the palette this component was drawn
           for — so center them. Grid's own default (stretch) behaves as
           start for anything with a size of its own, which parks every icon in
           the top-left corner of its cell. A cell that wants the whole well
           (a tool button that inverts when selected, a bordered tile under
           collapse) asks for it with place-self: stretch. */
        place-items: center;
        /* Shrink-wrap to the cells. The host is block-level (a palette sits in
           normal flow, and an inline-level box would hang a line-box descender
           under it inside a flush window), so without this a wider parent would
           stretch the grid and the lattice would tile on across the empty
           space. */
        width: max-content;
        background: var(--vf-surface, var(--vf-white, #fff));
        /* .vf-snap already makes this the positioned ancestor; isolating it
           makes it the stacking context too, so the rule overlay's negative
           z-index lands above this surface and below the cells rather than
           behind the whole component. */
        isolation: isolate;
      }
      /* The perimeter needs a pixel of its own to land on. */
      :host(:not([frameless]):not([rules='none'])) .grid {
        padding: calc(var(--vf-scale, 1) * ${RULE}px);
      }
      /* The cells are the grid's items, not the slot. */
      slot {
        display: contents;
      }
      /* collapse: every cell pulled back onto the lattice, so a cell drawing
         its own 1px border lands it ON the rule rather than beside it (see the
         class doc). A consumer's own margin still wins, since a light-DOM
         declaration beats a ::slotted one. With no rules there is nothing to
         collapse onto, so it stays inert.

         These cells are the ones that mean to fill their well, so they keep
         grid's stretch rather than the centering above: a sized tile lands
         where it did before (stretch is start for a definite size, and the
         -1px margins already center it), and an auto-sized one is resized to
         the well — a 14px track with -1px margins makes a 16px item. */
      :host([collapse]:not([rules='none'])) ::slotted(*) {
        margin: calc(var(--vf-scale, 1) * -${RULE}px);
        place-self: stretch;
      }
      .rules {
        position: absolute;
        inset: 0;
        /* Under the cells, above the surface — see the class doc. */
        z-index: -1;
        background: var(--vf-black, #000);
        mask-image: var(--_rules-x), var(--_rules-y);
        mask-size: var(--_rules-size-x), var(--_rules-size-y);
        mask-repeat: repeat;
        /* Framed (the default): the lattice starts at the box's own edge, so
           the perimeter is simply its first and last lines — one pitch,
           unbroken, all the way across. */
        mask-position: 0 0;
        pointer-events: none;
      }
      /* frameless: interior boundaries only. Pulling the lattice back one pixel
         puts its first line on the first gap instead of the left/top edge, and
         drops the last one just outside the box. */
      :host([frameless]) .rules {
        mask-position: calc(var(--vf-scale, 1) * -${RULE}px)
          calc(var(--vf-scale, 1) * -${RULE}px);
      }
    `,
  ]

  /** Cells across the x axis. */
  @property({ type: Number }) columns = 1

  /**
   * Cells down the y axis. Left unset the grid takes as many rows as the
   * slotted cells need; set, it reserves that many — an unfilled cell still
   * gets its rules, the way a palette keeps its empty wells.
   */
  @property({ type: Number }) rows?: number

  /** Cell width in whole system px. */
  @property({ type: Number, attribute: 'cell-width' }) cellWidth = 16

  /** Cell height in whole system px. */
  @property({ type: Number, attribute: 'cell-height' }) cellHeight = 16

  /**
   * The pen every rule is drawn with: `solid` (default), `dashed` (1 system px
   * on, 1 off), or `none` — no rules at all, and the cells butt together.
   */
  @property({ reflect: true }) rules: VfGridRules = 'solid'

  /**
   * Drop the outer border, leaving only the boundaries between cells. For a
   * grid inside something that already draws that line — a `vf-window[flush]`,
   * a `vf-fieldset` — where a second one would read as 2px.
   */
  @property({ type: Boolean, reflect: true }) frameless = false

  /**
   * Collapse each cell's own 1px border onto the grid's rules instead of
   * setting it beside them (see the class doc). Size the cells at *item − 2px*;
   * the frame is what gives the outermost borders a line to land on, so a
   * `frameless` grid lets them paint a pixel outside its box.
   */
  @property({ type: Boolean, reflect: true }) collapse = false

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  protected override render() {
    const columns = whole(this.columns, 1)
    const cellWidth = whole(this.cellWidth, 16)
    const cellHeight = whole(this.cellHeight, 16)
    const rows = this.rows === undefined ? 0 : whole(this.rows, 0)

    const drawn = this.rules !== 'none'
    // The gap is the rule's own pixel: the lattice paints into it, so with no
    // rules to draw there is nothing to leave room for.
    const gap = drawn ? RULE : 0
    // One boundary every pitch, in both axes.
    const pitchX = cellWidth + gap
    const pitchY = cellHeight + gap
    const dash = this.rules === 'dashed' ? DASH : RULE
    const tiles = ruleTiles(pitchX, pitchY, dash)

    return html`
      <div
        class="grid vf-snap"
        part="grid"
        style=${styleMap({
          'grid-template-columns': `repeat(${columns}, ${scaled(cellWidth)})`,
          'grid-template-rows': rows
            ? `repeat(${rows}, ${scaled(cellHeight)})`
            : null,
          // Cells past an explicit row count (or all of them, with none) keep
          // the same track height, so the lattice still lines up.
          'grid-auto-rows': scaled(cellHeight),
          gap: scaled(gap),
          '--_rules-x': tiles.x,
          '--_rules-y': tiles.y,
          '--_rules-size-x': `${scaled(2 * pitchX)} ${scaled(dash)}`,
          '--_rules-size-y': `${scaled(dash)} ${scaled(2 * pitchY)}`,
        })}
      >
        ${drawn ? html`<div class="rules" part="rules"></div>` : nothing}
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-grid': VfGrid
  }
}
