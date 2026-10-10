/**
 * The shell's geometry, pure and DOM-free: boxes in whole system px, the
 * window cascade, the nine-slice pin that carries windows and icons through
 * a raster resize, and the icon lattices that new items and Clean Up place
 * on. Every function takes the area it works in — a desktop's work area, a
 * folder's plane — so nothing here knows a menu bar's height.
 */

/** A point in whole system px. */
export interface Point {
  left: number
  top: number
}

/** A size in whole system px. */
export interface Size {
  width: number
  height: number
}

/** A box in whole system px. */
export interface Box extends Point, Size {}

/* ── The cascade ────────────────────────────────────────────────────────── */

/** How far each cascaded window steps down and right, system px. */
export const CASCADE_STEP = 24

/** How many slots a cascade has before it wraps. */
export const CASCADE_SLOTS = 5

/** A cascade's step and slot count. */
export interface CascadeOptions {
  step?: number
  slots?: number
}

/** Where a desktop's first window opens: this far in from its window area's corner. */
export const WINDOW_ORIGIN: Point = { left: 40, top: 20 }

/** The first cascade slot in a window area: {@link WINDOW_ORIGIN} in from its corner. */
export function windowOrigin(area: Box): Point {
  return { left: area.left + WINDOW_ORIGIN.left, top: area.top + WINDOW_ORIGIN.top }
}

/** Cascade slot `i` from `base`, wrapping past the slot count. */
export function cascadeSlot(
  base: Point,
  i: number,
  { step = CASCADE_STEP, slots = CASCADE_SLOTS }: CascadeOptions = {}
): Point & { slot: number } {
  const slot = ((i % slots) + slots) % slots
  return { left: base.left + step * slot, top: base.top + step * slot, slot }
}

/**
 * The first cascade slot from `base` that no window in `occupied` (their
 * top-lefts) holds. A window within half a step of a slot holds it, which
 * absorbs snapping and clamping. Every slot held wraps rather than walking
 * off the screen.
 */
export function cascadeFrom(
  base: Point,
  occupied: readonly Point[],
  options: CascadeOptions = {}
): Point & { slot: number } {
  const { step = CASCADE_STEP, slots = CASCADE_SLOTS } = options
  const near = step / 2
  for (let i = 0; i < slots; i++) {
    const s = cascadeSlot(base, i, options)
    const held = occupied.some(
      (o) => Math.abs(o.left - s.left) < near && Math.abs(o.top - s.top) < near
    )
    if (!held) return s
  }
  return cascadeSlot(base, occupied.length % slots, options)
}

/** A box of `size` centered in `area`, its top-left held at the area's. */
export function centeredBox(area: Box, size: Size): Box {
  return {
    left: Math.max(area.left, area.left + Math.floor((area.width - size.width) / 2)),
    top: Math.max(area.top, area.top + Math.floor((area.height - size.height) / 2)),
    width: size.width,
    height: size.height,
  }
}

/**
 * A box of `size` on cascade slot `n` from `origin`, pulled in to fit `area`
 * but never past its top-left.
 */
export function cascadedBox(
  area: Box,
  size: Size,
  origin: Point,
  n = 0,
  options: CascadeOptions = {}
): Box {
  const slot = cascadeSlot(origin, n, options)
  return {
    left: Math.max(area.left, Math.min(slot.left, area.left + area.width - size.width)),
    top: Math.max(area.top, Math.min(slot.top, area.top + area.height - size.height)),
    width: size.width,
    height: size.height,
  }
}

/** {@link nearBox}'s tolerance: more than a lattice snap, less than a real move. */
export const NEAR = 10

/** Whether every edge of `box` is within `tol` of `target`'s. */
export function nearBox(box: Box, target: Box, tol = NEAR): boolean {
  return (
    Math.abs(box.left - target.left) <= tol &&
    Math.abs(box.top - target.top) <= tol &&
    Math.abs(box.left + box.width - (target.left + target.width)) <= tol &&
    Math.abs(box.top + box.height - (target.top + target.height)) <= tol
  )
}

/* ── The nine-slice pin ─────────────────────────────────────────────────── */
/*
 * A frame is the raster below a reserve band, cut by four outer bands into
 * nine slices. An edge in an outer band is a strut and keeps its offset from
 * that raster edge; an edge in the middle is a spring and keeps its fraction
 * of the middle. Nothing clamps, so the same pin always maps back exactly —
 * growing a raster back restores every place. Keep the unrounded pin between
 * resizes: re-reading it from snapped geometry every time ratchets boxes
 * across the screen.
 */

/** The least thickness of an outer slice, system px. The middle is the remainder. */
export const BAND = 100

/** Each outer slice's thickness, system px. */
export interface Bands {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The frame a pin is read in: `reserve` is the band above the open area — a
 * desktop's work area top, the pin's y = 0 line — and `bands` each outer
 * slice's thickness.
 */
export interface Frame {
  reserve: number
  bands: Bands
}

/** A frame below `reserve`, its bands at least {@link BAND}, any of them wider. */
export function frameOf(reserve = 0, bands: Partial<Bands> = {}): Frame {
  const band = (v: number | undefined) => Math.max(BAND, v ?? BAND)
  return {
    reserve,
    bands: {
      left: band(bands.left),
      top: band(bands.top),
      right: band(bands.right),
      bottom: band(bands.bottom),
    },
  }
}

/**
 * A resize policy per axis ({@link pinTo}): `size` fixes an axis at a size,
 * `min` floors a resizable one.
 */
export interface Policy {
  size?: { width?: number; height?: number }
  min?: { width?: number; height?: number }
}

/**
 * One edge's pin. `near`: the offset from the span's start; `far`: from its
 * end; `spring`: the unrounded fraction of the middle.
 */
export interface EdgePin {
  kind: 'near' | 'far' | 'spring'
  v: number
}

/** A box's pin: per axis, the near edge (left or top), then the far edge. */
export interface Pin {
  x: [EdgePin, EdgePin]
  y: [EdgePin, EdgePin]
}

/** Whether `p` has a pin's shape — a stored or garbled record reads as none, so pinTo never throws. */
export function isPin(p: unknown): p is Pin {
  const edge = (e: unknown): boolean => {
    const x = e as EdgePin | null
    return (
      !!x &&
      (x.kind === 'near' || x.kind === 'far' || x.kind === 'spring') &&
      Number.isFinite(x.v)
    )
  }
  const axis = (a: unknown): boolean =>
    Array.isArray(a) && a.length === 2 && edge(a[0]) && edge(a[1])
  const q = p as Pin | null
  return !!q && typeof q === 'object' && axis(q.x) && axis(q.y)
}

/** Edge `v` on a span `s` with near band `n` and far band `f`. Near is tested first. */
function edgePin(v: number, s: number, n: number, f: number): EdgePin {
  if (v < n) return { kind: 'near', v }
  if (v >= s - f) return { kind: 'far', v: s - v }
  return { kind: 'spring', v: (v - n) / Math.max(1, s - n - f) }
}

/** An edge pin on a span `s`: continuous at both slice boundaries. */
function edgeTo(pin: EdgePin, s: number, n: number, f: number): number {
  if (pin.kind === 'near') return pin.v
  if (pin.kind === 'far') return s - pin.v
  return n + pin.v * Math.max(0, s - n - f)
}

/**
 * One axis. A fixed `size`, or a mapped size below `min`, is placed by the
 * anchor rule: a near strut holds, else a far strut, else the center.
 */
function resolveAxis(
  pins: [EdgePin, EdgePin],
  s: number,
  n: number,
  f: number,
  { size, min = 0 }: { size?: number; min?: number }
): { a: number; size: number } {
  const a = edgeTo(pins[0], s, n, f)
  const b = edgeTo(pins[1], s, n, f)
  let fixed = size
  if (fixed == null) {
    if (b - a >= min) return { a, size: b - a }
    fixed = min
  }
  if (pins[0].kind !== 'spring') return { a, size: fixed }
  if (pins[1].kind !== 'spring') return { a: b - fixed, size: fixed }
  return { a: (a + b) / 2 - fixed / 2, size: fixed }
}

/** A box's pin on `raster` in `frame`: each edge a strut or a spring. */
export function pinOf(box: Box, raster: Size, frame: Frame): Pin {
  const { reserve, bands } = frame
  const sw = raster.width
  const sh = raster.height - reserve
  const top = box.top - reserve
  return {
    x: [
      edgePin(box.left, sw, bands.left, bands.right),
      edgePin(box.left + box.width, sw, bands.left, bands.right),
    ],
    y: [
      edgePin(top, sh, bands.top, bands.bottom),
      edgePin(top + box.height, sh, bands.top, bands.bottom),
    ],
  }
}

/**
 * A pin back on `raster` as a box, in the frame it was read in, rounded to
 * whole system px. The policy applies per axis: `size` fixes it, `min`
 * floors it. Callers snap to their lattice and cap an oversize box.
 */
export function pinTo(pin: Pin, raster: Size, frame: Frame, { size, min }: Policy = {}): Box {
  const { reserve, bands } = frame
  const x = resolveAxis(pin.x, raster.width, bands.left, bands.right, {
    size: size?.width,
    min: min?.width,
  })
  const y = resolveAxis(pin.y, raster.height - reserve, bands.top, bands.bottom, {
    size: size?.height,
    min: min?.height,
  })
  return {
    left: Math.round(x.a),
    top: Math.round(reserve + y.a),
    width: Math.round(x.size),
    height: Math.round(y.size),
  }
}

/* ── The icon lattices ──────────────────────────────────────────────────── */

/** An icon's cell, system px: the 64px plate, name included. Two icons collide where their cells overlap. */
export const ICON_CELL = 64

/** The lattice's pitches and its inset from the container, system px. */
export const ICON_ROW = 72
export const ICON_COLUMN = 80
export const ICON_INSET = 16

/**
 * A container's icon grid. `left`/`top` locate cell (0,0); `dx` is negative
 * where columns run left; `cols` or `rows` is `Infinity` when unbounded;
 * `down` fills a column at a time, otherwise a row at a time.
 */
export interface Lattice {
  left: number
  top: number
  dx: number
  dy: number
  cols: number
  rows: number
  down: boolean
}

/** A lattice's cell, pitches and inset from its container's edges, system px. */
export interface LatticeOptions {
  cell?: number
  column?: number
  row?: number
  inset?: Partial<{ top: number; right: number; bottom: number; left: number }>
}

/**
 * The desktop's lattice in its work area: cell (0,0) at the top right, rows
 * running down to the bottom inset, columns running left. At least one row
 * and one column. Insets default to 16 on the top, right and bottom.
 */
export function desktopLattice(area: Box, options: LatticeOptions = {}): Lattice {
  const { cell = ICON_CELL, column = ICON_COLUMN, row = ICON_ROW } = options
  const inset = { top: ICON_INSET, right: ICON_INSET, bottom: ICON_INSET, left: 0, ...options.inset }
  const bottom = area.top + area.height
  const left = Math.max(area.left + inset.left, area.left + area.width - inset.right - cell)
  const top = area.top + inset.top
  return {
    left,
    top,
    dx: -column,
    dy: row,
    cols: Math.floor((left - area.left - inset.left) / column) + 1,
    rows: Math.max(1, Math.floor((bottom - inset.bottom - cell - top) / row) + 1),
    down: true,
  }
}

/**
 * The Trash's place in a desktop's work area: the bottom-right cell, inset
 * as the desktop's lattice is, held inside the area's top-left.
 */
export function trashCell(area: Box, options: LatticeOptions = {}): Point {
  const { cell = ICON_CELL } = options
  const inset = { right: ICON_INSET, bottom: ICON_INSET, left: 0, ...options.inset }
  return {
    left: Math.max(area.left + inset.left, area.left + area.width - inset.right - cell),
    top: Math.max(area.top, area.top + area.height - inset.bottom - cell),
  }
}

/**
 * A folder plane's lattice for a plane `width` wide: rows from the top left,
 * wrapping at the width, unbounded downward. At least one column. Insets
 * default to 16 on the top and left.
 */
export function folderLattice(width: number, options: LatticeOptions = {}): Lattice {
  const { cell = ICON_CELL, column = ICON_COLUMN, row = ICON_ROW } = options
  const inset = { top: ICON_INSET, right: 0, bottom: 0, left: ICON_INSET, ...options.inset }
  return {
    left: inset.left,
    top: inset.top,
    dx: column,
    dy: row,
    cols: Math.max(1, Math.floor((width - inset.left - inset.right - cell) / column) + 1),
    rows: Infinity,
    down: false,
  }
}

/** The top-left of cell (`col`, `row`), whether or not the lattice reaches it. */
export function latticeCell(grid: Lattice, col: number, row: number): Point {
  return { left: grid.left + col * grid.dx, top: grid.top + row * grid.dy }
}

/** Cell number `slot` in the lattice's fill order. */
export function latticeSlot(grid: Lattice, slot: number): Point {
  const major = grid.down ? grid.rows : grid.cols
  const a = Math.floor(slot / major)
  const b = slot % major
  return grid.down ? latticeCell(grid, a, b) : latticeCell(grid, b, a)
}

/**
 * Two positions in the lattice's fill order, negative when `a` comes first.
 * Each rounds to its nearest cell, so a pixel of drift still sorts right.
 */
export function fillOrder(grid: Lattice, a: Point, b: Point): number {
  const col = (p: Point) => Math.round((p.left - grid.left) / grid.dx)
  const row = (p: Point) => Math.round((p.top - grid.top) / grid.dy)
  return grid.down ? col(a) - col(b) || row(a) - row(b) : row(a) - row(b) || col(a) - col(b)
}

/** `v` rounded to a cell index in [0, n − 1]. */
const cellIndex = (v: number, n: number) => Math.min(Math.max(Math.round(v), 0), n - 1)

/**
 * Clean Up: each position's cell on the lattice. Each icon takes the free
 * cell nearest it, searching square rings outward from its own rounded,
 * clamped cell; icons past the last free cell share their own. One position
 * per input, in input order.
 */
export function cleanUp(grid: Lattice, positions: readonly Point[]): Point[] {
  const { cols, rows } = grid
  const ideal = positions.map((p) => ({
    col: cellIndex((p.left - grid.left) / grid.dx, cols),
    row: cellIndex((p.top - grid.top) / grid.dy, rows),
  }))
  const at = (i: number) => ideal[i]!
  const order = positions
    .map((_, i) => i)
    .sort((a, b) => at(a).row - at(b).row || at(a).col - at(b).col || a - b)
  const taken = new Set<string>()
  // The search radius: bounded by the lattice and by the icon count.
  const reach = Math.min(cols, positions.length + 1) + Math.min(rows, positions.length + 1)
  const out: Point[] = []
  for (const i of order) {
    const want = at(i)
    const pos = positions[i]!
    let best = want
    for (let r = 0; r <= reach; r++) {
      let found: { col: number; row: number } | null = null
      let nearest = Infinity
      for (let col = want.col - r; col <= want.col + r; col++) {
        for (let row = want.row - r; row <= want.row + r; row++) {
          if (Math.max(Math.abs(col - want.col), Math.abs(row - want.row)) !== r) continue
          if (col < 0 || row < 0 || col >= cols || row >= rows) continue
          if (taken.has(`${col},${row}`)) continue
          const cell = latticeCell(grid, col, row)
          const d = (cell.left - pos.left) ** 2 + (cell.top - pos.top) ** 2
          if (d < nearest) {
            nearest = d
            found = { col, row }
          }
        }
      }
      if (found) {
        best = found
        break
      }
    }
    taken.add(`${best.col},${best.row}`)
    out[i] = latticeCell(grid, best.col, best.row)
  }
  return out
}

/**
 * The first cell, in fill order, that no icon at `taken` overlaps — an icon
 * off the lattice blocks every cell its own cell touches. The home cell when
 * a bounded lattice is full.
 */
export function nextFreeCell(grid: Lattice, taken: readonly Point[], cell = ICON_CELL): Point {
  const count = grid.cols * grid.rows
  // An unbounded lattice always has one: an icon straddles at most four cells.
  const slots = Number.isFinite(count) ? count : 4 * taken.length + 1
  for (let slot = 0; slot < slots; slot++) {
    const p = latticeSlot(grid, slot)
    const blocked = taken.some(
      (t) => Math.abs(t.left - p.left) < cell && Math.abs(t.top - p.top) < cell
    )
    if (!blocked) return p
  }
  return latticeSlot(grid, 0)
}

/**
 * The free cell nearest `at`: square rings out from its rounded, clamped
 * cell, as Clean Up searches, a cell free where no icon at `taken` overlaps
 * it. Of two as near, the later in fill order. The next free cell when the
 * rings find none.
 */
export function freeCellNear(grid: Lattice, at: Point, taken: readonly Point[], cell = ICON_CELL): Point {
  const want = {
    col: cellIndex((at.left - grid.left) / grid.dx, grid.cols),
    row: cellIndex((at.top - grid.top) / grid.dy, grid.rows),
  }
  const free = (p: Point) => !taken.some((t) => Math.abs(t.left - p.left) < cell && Math.abs(t.top - p.top) < cell)
  // An icon blocks at most four cells, so the free one is no further out than this.
  const reach = Math.min(grid.cols, 2 * taken.length + 1) + Math.min(grid.rows, 2 * taken.length + 1)
  for (let r = 0; r <= reach; r++) {
    let found: Point | null = null
    let nearest = Infinity
    for (let col = want.col - r; col <= want.col + r; col++) {
      for (let row = want.row - r; row <= want.row + r; row++) {
        if (Math.max(Math.abs(col - want.col), Math.abs(row - want.row)) !== r) continue
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue
        const p = latticeCell(grid, col, row)
        const d = (p.left - at.left) ** 2 + (p.top - at.top) ** 2
        if ((d < nearest || (d === nearest && fillOrder(grid, p, found!) > 0)) && free(p)) {
          nearest = d
          found = p
        }
      }
    }
    if (found) return found
  }
  return nextFreeCell(grid, taken, cell)
}

/**
 * A folder's field: at least its viewport, grown to hold every icon at
 * `positions` (their top-lefts) plus the inset past it. The field's size is
 * the window's scroll range.
 */
export function fieldExtent(
  positions: readonly Point[],
  viewport: Size,
  { cell = ICON_CELL, inset = ICON_INSET }: { cell?: number; inset?: number } = {}
): Size {
  let width = viewport.width
  let height = viewport.height
  for (const p of positions) {
    width = Math.max(width, p.left + cell + inset)
    height = Math.max(height, p.top + cell + inset)
  }
  return { width, height }
}

/** The pairs of `boxes` that overlap, as `"i,j"` with i < j. Boxes sharing only an edge do not. */
export function collisions(boxes: readonly Box[]): Set<string> {
  const pairs = new Set<string>()
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      if (
        a.left < b.left + b.width &&
        b.left < a.left + a.width &&
        a.top < b.top + b.height &&
        b.top < a.top + a.height
      ) {
        pairs.add(`${i},${j}`)
      }
    }
  }
  return pairs
}
