/**
 * The Finder "open" ghost — an icon's art redrawn as outline plus dither,
 * derived from the art itself in the client — and, on the same terms, the
 * dotted outline an icon drags as ({@link deriveDragOutline}).
 *
 * When a folder or application is open, the Finder redraws its icon as a
 * ghost: the outline stays, and everything inside it becomes pattern. The kit
 * ships no second raster for that state and asks the consumer for none — a
 * System 7 icon's alpha channel IS its mask resource, so both halves of the
 * ghost are derivable from the art already slotted: the outline is the mask's
 * boundary, the fill is the mask's interior.
 *
 * Everything here is draw-and-composite — never `getImageData`, deliberately.
 * A canvas that has drawn a cross-origin image is *tainted*, which forbids
 * reading pixels back but not drawing or displaying them, so a pipeline built
 * purely from `drawImage` and `globalCompositeOperation` behaves identically
 * for data URIs, same-origin files and CORS-less CDN images. Taint propagates
 * through the layers below and none of it matters: the result is only ever
 * displayed. (`ctx.filter` is avoided the same way — compositing operators
 * are universal where canvas filters are Safari's shaky corner.)
 *
 * The one "smart" step, finding the outline, is a 1px erosion, and erosion is
 * expressible as compositing: `destination-in` keeps the destination only
 * where the source is opaque, so intersecting the silhouette with itself
 * shifted one pixel each way leaves exactly the pixels whose neighbors are
 * all opaque — the interior. The ring the erosion removes is the outline.
 */

/** A canvas the size of the art, with the settings every layer shares. */
interface Layer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

const makeLayer = (width: number, height: number): Layer | null => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Whole-pixel draws of same-size rasters never resample; this is a belt.
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

/**
 * The ghost's fill: the same loose 25% dot lattice as the scrollbar trough —
 * a 4×2 tile with a dot at (0,0) and (2,1), the trace in
 * `styles/recipes/scrollbars.ts` — anchored at the art's own top-left. Both
 * cells (32 and 16) are whole multiples of the tile, so a field of icons on a
 * cell pitch shares one phase. Literal ink rather than the `--vf-black` pair:
 * a canvas raster can no more follow a custom property than the slotted PNG
 * it is derived from can, and the two have to agree.
 */
let tile: HTMLCanvasElement | null = null

const ditherTile = (): HTMLCanvasElement | null => {
  if (!tile) {
    const layer = makeLayer(4, 2)
    if (!layer) return null
    layer.ctx.fillStyle = '#000'
    layer.ctx.fillRect(0, 0, 1, 1)
    layer.ctx.fillRect(2, 1, 1, 1)
    tile = layer.canvas
  }
  return tile
}

/**
 * Derive the open ghost from an icon's art: a canvas at the art's natural
 * size holding its outline in solid black over an interior of dither on
 * opaque white, with the transparent surround untouched.
 *
 * Opaque white matters as much as the black: it keeps the ghost exactly the
 * shape selection expects — ink and opaque fill on a transparent surround —
 * so `filter: invert(1)` produces the selected-open appearance with no
 * second treatment.
 *
 * Returns null when there is nothing to derive: art with no pixels yet, or
 * an environment refusing a 2d context.
 */
export function deriveOpenArt(
  art: HTMLImageElement | HTMLCanvasElement
): HTMLCanvasElement | null {
  const width = art instanceof HTMLImageElement ? art.naturalWidth : art.width
  const height =
    art instanceof HTMLImageElement ? art.naturalHeight : art.height
  if (!width || !height) return null

  const silhouette = makeLayer(width, height)
  const interior = makeLayer(width, height)
  const pattern = ditherTile()
  if (!silhouette || !interior || !pattern) return null

  // The silhouette: the art's alpha, inked solid. `source-in` keeps the fill
  // only where the destination is opaque — it re-colors the mask.
  silhouette.ctx.drawImage(art, 0, 0)
  silhouette.ctx.globalCompositeOperation = 'source-in'
  silhouette.ctx.fillStyle = '#000'
  silhouette.ctx.fillRect(0, 0, width, height)

  // The interior: the silhouette eroded by one pixel. Each `destination-in`
  // draw keeps only the pixels opaque in BOTH layers, so four draws of the
  // silhouette shifted one pixel each way leave exactly the pixels whose four
  // neighbors are all opaque. Off-canvas composites as transparent, so the
  // raster's own edge erodes too — the icon sits on a transparent desktop,
  // and its edge is a real boundary — and an interior hole is a boundary the
  // same way, ringing itself in outline.
  interior.ctx.drawImage(silhouette.canvas, 0, 0)
  interior.ctx.globalCompositeOperation = 'destination-in'
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    interior.ctx.drawImage(silhouette.canvas, dx, dy)
  }

  // …then turned into the fill in place: `source-in` re-inks it opaque white,
  // and `source-atop` lands the lattice only on it.
  interior.ctx.globalCompositeOperation = 'source-in'
  interior.ctx.fillStyle = '#fff'
  interior.ctx.fillRect(0, 0, width, height)
  const dither = interior.ctx.createPattern(pattern, 'repeat')
  if (dither) {
    interior.ctx.globalCompositeOperation = 'source-atop'
    interior.ctx.fillStyle = dither
    interior.ctx.fillRect(0, 0, width, height)
  }

  // Compose: the fill covers all of the silhouette but the one-pixel ring the
  // erosion removed, and that ring is the outline.
  silhouette.ctx.globalCompositeOperation = 'source-over'
  silhouette.ctx.drawImage(interior.canvas, 0, 0)
  return silhouette.canvas
}

/** A box inside an icon's frame, in system px. */
export interface DragOutlineBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where an icon's parts sit inside its frame, in system px — measured by the
 * icon, so the outline lands on the same pixels the frame paints.
 */
export interface DragOutlineGeometry {
  /** The frame. */
  width: number
  height: number
  /**
   * The art's own box, where it paints. Null when the pipeline has nothing
   * to draw — nothing slotted, a failed load, an inline `<svg>` — and the
   * cell's rectangle stands in.
   */
  art: DragOutlineBox | null
  /** The reserved art cell. */
  cell: DragOutlineBox
  /** The name plate, or null with no name. */
  plate: DragOutlineBox | null
}

/**
 * The 2×2 checker the outline is dotted with: ink where `x + y` is even in
 * the canvas's own coordinates. Which diagonal of the screen that is, the
 * caller decides ({@link penPhase}).
 */
let checker: HTMLCanvasElement | null = null

const checkerTile = (): HTMLCanvasElement | null => {
  if (!checker) {
    const layer = makeLayer(2, 2)
    if (!layer) return null
    layer.ctx.fillStyle = '#000'
    layer.ctx.fillRect(0, 0, 1, 1)
    layer.ctx.fillRect(1, 1, 1, 1)
    checker = layer.canvas
  }
  return checker
}

/** A one-pixel rectangle outline, as fills: a 1px stroke straddles the pixel. */
const inkBox = (ctx: CanvasRenderingContext2D, box: DragOutlineBox): void => {
  if (box.width <= 0 || box.height <= 0) return
  ctx.fillStyle = '#000'
  ctx.fillRect(box.x, box.y, box.width, box.height)
  if (box.width > 2 && box.height > 2) {
    ctx.clearRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2)
  }
}

/**
 * Derive the outline an icon drags as: the mask's boundary — the same
 * one-pixel ring the open ghost finds, by the same erosion — and the name
 * plate's rectangle, solid black on transparent, one canvas the size of the
 * icon's frame at one image px per system px. Not yet dotted: the ring is
 * derived once per drag, and {@link dotOutline} re-applies the checker at
 * each step's phase.
 *
 * Art the pipeline cannot draw falls back to the cell's rectangle — the
 * ghost's rule: never a blank where a state cannot show. Compositing only,
 * never a readback, so cross-origin art derives too.
 *
 * Returns null for a frame with no size, or an environment refusing a 2d
 * context.
 */
export function deriveDragOutline(
  art: HTMLImageElement | HTMLCanvasElement | null,
  geometry: DragOutlineGeometry
): HTMLCanvasElement | null {
  const { width, height } = geometry
  if (!width || !height) return null
  const out = makeLayer(width, height)
  if (!out) return null

  const box = art ? geometry.art : null
  if (art && box && box.width > 0 && box.height > 0) {
    const silhouette = makeLayer(width, height)
    const interior = makeLayer(width, height)
    if (!silhouette || !interior) return null
    // The silhouette at the art's own box: drawn at the size it paints, so a
    // magnified art outlines at its magnified size, then inked solid.
    silhouette.ctx.drawImage(art, box.x, box.y, box.width, box.height)
    silhouette.ctx.globalCompositeOperation = 'source-in'
    silhouette.ctx.fillStyle = '#000'
    silhouette.ctx.fillRect(0, 0, width, height)
    // The erosion deriveOpenArt performs, on a frame-sized layer: the frame
    // is transparent around the art, so the art's own edge erodes exactly as
    // the off-canvas edge did there.
    interior.ctx.drawImage(silhouette.canvas, 0, 0)
    interior.ctx.globalCompositeOperation = 'destination-in'
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      interior.ctx.drawImage(silhouette.canvas, dx, dy)
    }
    // The ring is the silhouette minus its interior.
    out.ctx.drawImage(silhouette.canvas, 0, 0)
    out.ctx.globalCompositeOperation = 'destination-out'
    out.ctx.drawImage(interior.canvas, 0, 0)
    out.ctx.globalCompositeOperation = 'source-over'
  } else {
    inkBox(out.ctx, geometry.cell)
  }
  if (geometry.plate) inkBox(out.ctx, geometry.plate)
  return out.canvas
}

/**
 * The XOR pen's dot phase for a ring whose top-left lands at (`x`, `y`) on
 * the screen, whole system px, for {@link dotOutline}: the dots take the
 * diagonal the desktop dither leaves white — `x + y` odd on the screen — the
 * way the Finder's did. Over the dither each dot flips a white pixel black
 * and the dither's own ink fills the gaps, so the ring reads as a solid
 * black line; over paper it is a dotted black line. The other diagonal
 * would flip the dither's ink to paper, and the ring would read white.
 */
export function penPhase(x: number, y: number): number {
  return (((x + y) % 2) + 2) % 2 === 0 ? 1 : 0
}

/**
 * Paint a selection rectangle — the rubber band `vf-icon-field` drags on its
 * background — into `into`: a one-pixel outline `width` × `height` system px,
 * dotted at `phase` the way the drag outline is. A degenerate axis paints as
 * a one-pixel line rather than nothing.
 */
export function paintSelectionRect(
  into: HTMLCanvasElement,
  width: number,
  height: number,
  phase: number
): void {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const ring = makeLayer(w, h)
  if (!ring) return
  inkBox(ring.ctx, { x: 0, y: 0, width: w, height: h })
  dotOutline(ring.canvas, into, phase)
}

/**
 * Paint `ring` into `into` dotted with the checker at `phase` — 0 keeps the
 * dots where `x + y` is even in the canvas's own coordinates, 1 where it is
 * odd. The caller takes the phase from where the outline lands on the
 * screen ({@link penPhase}), so the dots sit between the desktop dither's
 * ink wherever the outline goes, as QuickDraw's screen-anchored pattern pen
 * did. Sizing `into` to the ring clears it, so each step is a fresh paint.
 */
export function dotOutline(
  ring: HTMLCanvasElement,
  into: HTMLCanvasElement,
  phase: number
): void {
  const tile = checkerTile()
  const ctx = into.getContext('2d')
  if (!tile || !ctx) return
  into.width = ring.width
  into.height = ring.height
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(ring, 0, 0)
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return
  // `destination-in` keeps the ring only under the checker's ink; shifting
  // the pattern's origin by one pixel swaps which diagonal that is.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = pattern
  ctx.translate(phase & 1, 0)
  ctx.fillRect(-2, 0, ring.width + 2, ring.height)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
}
