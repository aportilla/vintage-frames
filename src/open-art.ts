/**
 * The Finder "open" ghost — an icon's art redrawn as outline plus dither,
 * derived from the art itself in the client.
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
