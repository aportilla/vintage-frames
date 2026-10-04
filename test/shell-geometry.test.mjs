// The shell's geometry (src/shell/geometry.ts): the cascade, the nine-slice
// pin and the icon lattices — the union of system-online's and
// sprite-machine's tests, and portill.io's lattice tests rewritten against
// the parametric lattice (its 96px columns and insets).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  BAND,
  CASCADE_SLOTS,
  CASCADE_STEP,
  ICON_CELL,
  NEAR,
  cascadedBox,
  cascadeFrom,
  cascadeSlot,
  centeredBox,
  cleanUp,
  collisions,
  desktopLattice,
  fieldExtent,
  fillOrder,
  folderLattice,
  frameOf,
  isPin,
  latticeCell,
  latticeSlot,
  nearBox,
  nextFreeCell,
  pinOf,
  pinTo,
  trashCell,
  windowOrigin,
} from '../scripts/.tmp/unit/shell/pure.js'

// No reserve and 100px bands. On R the middle is x ∈ [100, 900), y ∈ [100, 700).
const F = frameOf(0)
const R = { width: 1000, height: 800 }
const box = (left, top, width, height) => ({ left, top, width, height })
const roundTrip = (b, from, to, frame = F, policy) => pinTo(pinOf(b, from, frame), to, frame, policy)

/** A screen with a 20px menu bar: its work area. */
const MENU_BAR = 20
const areaOf = (width, height, top = MENU_BAR) => ({ left: 0, top, width, height: height - top })

// ── the cascade ──────────────────────────────────────────────────────────

test('cascade: each further open steps down-right, and a freed slot is reused', () => {
  const base = { left: 100, top: 100 }
  assert.deepEqual(cascadeFrom(base, []), { left: 100, top: 100, slot: 0 })
  const one = [{ left: 100, top: 100 }]
  assert.deepEqual(cascadeFrom(base, one), { left: 100 + CASCADE_STEP, top: 100 + CASCADE_STEP, slot: 1 })
  const two = [...one, { left: 100 + CASCADE_STEP, top: 100 + CASCADE_STEP }]
  assert.deepEqual(cascadeFrom(base, two).slot, 2)
  // Slot 0's window moved away and slot 1 is held, so the next open takes slot 0.
  assert.deepEqual(
    cascadeFrom(base, [
      { left: 400, top: 300 },
      { left: 100 + CASCADE_STEP, top: 100 + CASCADE_STEP },
    ]),
    { left: 100, top: 100, slot: 0 }
  )
  // A window a pixel or two off its slot still holds it; half a step away does not.
  assert.equal(cascadeFrom(base, [{ left: 102, top: 99 }]).slot, 1)
  assert.equal(cascadeFrom(base, [{ left: 100 + CASCADE_STEP / 2, top: 100 }]).slot, 0)
})

test('cascade: every slot held wraps instead of walking off the raster; a slot re-expresses on any base', () => {
  const base = { left: 100, top: 100 }
  const all = Array.from({ length: CASCADE_SLOTS }, (_, i) => cascadeSlot(base, i))
  assert.equal(cascadeFrom(base, all).slot, 0)
  assert.equal(cascadeFrom(base, [...all, cascadeSlot(base, 0)]).slot, 1)
  assert.deepEqual(cascadeSlot(base, CASCADE_SLOTS + 1), cascadeSlot(base, 1))
  const b = { left: 58, top: 64 }
  assert.deepEqual(cascadeSlot(b, 2), { left: 58 + 2 * CASCADE_STEP, top: 64 + 2 * CASCADE_STEP, slot: 2 })
  // The step and the slot count are options.
  assert.deepEqual(cascadeSlot(b, 4, { step: 10, slots: 3 }), { left: 68, top: 74, slot: 1 })
})

test('cascade: a cascaded box is pulled in to fit its area, never past its top-left', () => {
  const area = areaOf(600, 400)
  const origin = windowOrigin(area)
  assert.deepEqual(origin, { left: 40, top: MENU_BAR + 20 })
  assert.deepEqual(cascadedBox(area, { width: 200, height: 100 }, origin, 1), box(64, 64, 200, 100))
  // Too wide to fit from its slot: pulled left to the area's right edge.
  assert.deepEqual(cascadedBox(area, { width: 590, height: 100 }, origin, 0), box(10, 40, 590, 100))
  // Wider than the area: held at its left edge, and below the menu bar.
  assert.deepEqual(cascadedBox(area, { width: 700, height: 500 }, origin, 0), box(0, MENU_BAR, 700, 500))
})

test('centered: a box centered in its area, its top-left held at the area’s', () => {
  const area = areaOf(600, 400)
  assert.deepEqual(centeredBox(area, { width: 200, height: 100 }), box(200, 160, 200, 100))
  assert.deepEqual(centeredBox(area, { width: 800, height: 600 }), box(0, MENU_BAR, 800, 600))
})

test('near: a box reads at its target while every edge is within the tolerance — the far edges too', () => {
  const t = box(300, 40, 520, 700)
  assert.ok(nearBox(t, t))
  assert.ok(nearBox(box(302, 38, 520, 700), t))
  assert.ok(nearBox(box(300, 40, 520 + NEAR, 700 - NEAR), t))
  assert.ok(!nearBox(box(300 + NEAR + 1, 40, 520, 700), t))
  assert.ok(!nearBox(box(300, 40, 520, 700 - NEAR - 1), t))
})

// ── the nine-slice pin ───────────────────────────────────────────────────

test('frame: the bands are at least BAND, any of them wider, below the reserve', () => {
  assert.deepEqual(frameOf(20), { reserve: 20, bands: { left: BAND, top: BAND, right: BAND, bottom: BAND } })
  assert.deepEqual(frameOf(56, { left: 300, top: 40 }).bands, { left: 300, top: BAND, right: BAND, bottom: BAND })
})

test('pin: a strut keeps its offset from its edge, a spring its fraction of the middle', () => {
  assert.deepEqual(roundTrip(box(30, 40, 50, 30), R, { width: 600, height: 500 }), box(30, 40, 50, 30))
  for (const to of [
    { width: 600, height: 500 },
    { width: 300, height: 250 },
  ]) {
    const want = box(to.width - 60, to.height - 60, 40, 40)
    assert.deepEqual(roundTrip(box(940, 740, 40, 40), R, to), want)
    assert.deepEqual(roundTrip(box(940, 740, 40, 40), R, to, F, { size: { width: 40, height: 40 } }), want)
  }
  assert.deepEqual(roundTrip(box(50, 50, 900, 700), R, { width: 1400, height: 1200 }), box(50, 50, 1300, 1100))
  assert.deepEqual(roundTrip(box(300, 250, 400, 300), R, { width: 1400, height: 1200 }), box(400, 350, 600, 500))
  assert.deepEqual(roundTrip(box(300, 250, 400, 300), R, { width: 600, height: 500 }), box(200, 175, 200, 150))
  assert.deepEqual(roundTrip(box(300, 250, 400, 300), R, R), box(300, 250, 400, 300))
  // The reserve is the frame's y = 0: a box at it stays there at any height.
  const under = box(14, MENU_BAR, 30, 187)
  for (const h of [400, 2000]) {
    assert.equal(roundTrip(under, { width: 1000, height: 830 }, { width: 1000, height: h }, frameOf(MENU_BAR)).top, MENU_BAR)
  }
})

test('pin: continuous across every seam — no pop where a strut meets the spring', () => {
  for (const to of [
    { width: 600, height: 800 },
    { width: 1400, height: 800 },
  ]) {
    for (const seam of [100, 900]) {
      let prev = null
      for (let v = seam - 2; v <= seam + 2; v++) {
        const { left } = roundTrip(box(v, 300, 0, 10), R, to)
        if (prev !== null) assert.ok(left >= prev && left - prev <= 2, `seam ${seam}, v ${v}: ${prev} → ${left}`)
        prev = left
      }
    }
  }
})

test('pin: an edge outside the raster is a strut with a negative offset — it hangs the same', () => {
  assert.equal(roundTrip(box(-30, 50, 100, 40), R, { width: 600, height: 500 }).left, -30)
  assert.deepEqual(roundTrip(box(960, 50, 80, 40), R, { width: 600, height: 500 }), box(560, 50, 80, 40))
})

test('pin: a fixed-size box resolves through the anchor rule', () => {
  assert.deepEqual(
    roundTrip(box(50, 250, 200, 100), R, { width: 1000, height: 1400 }, F, { size: { width: 200, height: 100 } }),
    box(50, 450, 200, 100)
  )
  assert.deepEqual(
    roundTrip(box(700, 50, 250, 40), R, { width: 600, height: 800 }, F, { size: { width: 250, height: 40 } }),
    box(300, 50, 250, 40)
  )
  assert.deepEqual(
    roundTrip(box(50, 50, 900, 40), R, { width: 600, height: 800 }, F, { size: { width: 900, height: 40 } }),
    box(50, 50, 900, 40)
  )
  assert.deepEqual(
    roundTrip(box(30, 30, 50, 100), R, { width: 600, height: 500 }, F, { size: { width: 50, height: 150 } }),
    box(30, 30, 50, 150)
  )
})

test('pin: a resizable box floors its size around the mapped center', () => {
  assert.deepEqual(
    roundTrip(box(300, 250, 400, 300), R, { width: 400, height: 400 }, F, { min: { width: 164, height: 160 } }),
    box(118, 120, 164, 160)
  )
})

test('pin: a degenerate span collapses the middle to a seam, and grows back exactly', () => {
  const tiny = { width: 150, height: 120 }
  const spring = box(300, 250, 400, 300)
  const pin = pinOf(spring, R, F)
  assert.deepEqual(pinTo(pin, tiny, F, { min: { width: 80, height: 54 } }), box(60, 73, 80, 54))
  assert.deepEqual(pinTo(pin, R, F), spring)
  const corner = box(940, 740, 40, 40)
  const cpin = pinOf(corner, R, F)
  assert.deepEqual(pinTo(cpin, tiny, F), box(90, 60, 40, 40))
  assert.deepEqual(pinTo(cpin, R, F), corner)
})

test('pin: a desktop column and a centered window ride a resize and come back exactly', () => {
  const home = { width: 1200, height: 740 }
  const cell = { width: 64, height: 64 }
  const items = [
    ...[16, 88, 160].map((top) => [box(1120, top, 64, 64), cell]),
    [box(464, 286, 272, 168), { width: 272, height: 168 }],
  ]
  const pins = items.map(([b]) => pinOf(b, home, F))
  for (const [i, [, size]] of items.slice(0, 3).entries()) {
    assert.equal(pinTo(pins[i], { width: 700, height: 740 }, F, { size }).left, 700 - 80)
  }
  for (const [i, [b, size]] of items.entries()) {
    let at = null
    for (const r of [{ width: 640, height: 480 }, { width: 1920, height: 1080 }, home]) {
      at = pinTo(pins[i], r, F, { size })
    }
    assert.deepEqual(at, b)
  }
})

test('pin: what pinOf reads is a pin — stored and parsed back too — and a garbled record is not', () => {
  const pin = pinOf(box(300, 250, 400, 300), R, F)
  assert.ok(isPin(pin))
  assert.ok(isPin(JSON.parse(JSON.stringify(pin))))
  for (const bad of [
    null,
    { left: 1, top: 2 },
    { x: [], y: [] },
    { x: pin.x, y: [pin.y[0], { kind: 'sideways', v: 1 }] },
    { x: pin.x, y: [pin.y[0], { kind: 'near', v: NaN }] },
  ]) {
    assert.equal(isPin(bad), false, JSON.stringify(bad))
  }
})

// ── the icon lattices ────────────────────────────────────────────────────

const W = 980
const H = 830
const CELL = { width: ICON_CELL, height: ICON_CELL }
const iconRoundTrip = (b, from, to) =>
  pinTo(pinOf(b, from, frameOf(MENU_BAR)), to, frameOf(MENU_BAR), { size: CELL })

test('icon pin: the right-edge column keeps its offset, its rows spread, and the menu bar holds', () => {
  const home = { width: W, height: H }
  const icon = { ...latticeSlot(desktopLattice(areaOf(W, H)), 2), ...CELL }
  for (const w of [500, 1400]) {
    assert.deepEqual(iconRoundTrip(icon, home, { width: w, height: H }), {
      ...latticeSlot(desktopLattice(areaOf(w, H)), 2),
      ...CELL,
    })
  }
  assert.ok(iconRoundTrip(icon, home, { width: W, height: 500 }).top < icon.top)
  assert.ok(iconRoundTrip(icon, home, { width: W, height: 1400 }).top > icon.top)
  const high = { left: 16, top: MENU_BAR, ...CELL }
  for (const h of [300, 2000]) assert.equal(iconRoundTrip(high, home, { width: W, height: h }).top, MENU_BAR)
})

test('icon pin: a deeper window frame holds a box the icon frame lets spring', () => {
  // sprite-machine's windows sit below a 56px reserve with a wide top band;
  // its icons in the frame below the menu bar alone.
  const windowFrame = frameOf(56, { top: 260 })
  const top = windowFrame.reserve + windowFrame.bands.top - 1
  const b = { left: 16, top, ...CELL }
  const wide = { width: 1000, height: 820 }
  const tall = { width: 1000, height: 1620 }
  assert.equal(pinTo(pinOf(b, wide, windowFrame), tall, windowFrame, { size: CELL }).top, top)
  assert.ok(iconRoundTrip(b, wide, tall).top > top)
})

test('lattice: the desktop fills down its right edge below the menu bar, a folder across its rows', () => {
  const desk = desktopLattice(areaOf(W, H))
  const first = latticeSlot(desk, 0)
  assert.deepEqual(first, { left: W - 16 - ICON_CELL, top: MENU_BAR + 16 })
  assert.deepEqual(latticeSlot(desk, 1), { left: first.left, top: first.top + desk.dy })
  assert.deepEqual(latticeSlot(desk, desk.rows), { left: first.left + desk.dx, top: first.top })
  const folder = folderLattice(400)
  assert.deepEqual(latticeSlot(folder, folder.cols), latticeCell(folder, 0, 1))
})

test('lattice: portill.io’s 96px columns — the home column first, each cell whole on the raster', () => {
  const grid = { column: 96, inset: { top: 16, bottom: 0 } }
  const lattice = desktopLattice(areaOf(1200, 740, 0), grid)
  assert.deepEqual([latticeSlot(lattice, 0), latticeSlot(lattice, 1)], [
    { left: 1120, top: 16 },
    { left: 1120, top: 88 },
  ])
  // Ten rows fit in 740 (the tenth ends at 728), so the next column starts at
  // slot 10, one column pitch left.
  assert.equal(lattice.rows, 10)
  assert.deepEqual(latticeSlot(lattice, 10), { left: 1024, top: 16 })
  for (let s = 0; s < lattice.rows * lattice.cols; s++) {
    const c = latticeSlot(lattice, s)
    assert.ok(c.left >= 0 && c.left + 64 <= 1184 && c.top + 64 <= 740, JSON.stringify(c))
  }
  // Below a menu bar, the rows move down and fewer fit.
  const below = desktopLattice(areaOf(1200, 740), grid)
  assert.deepEqual(latticeSlot(below, 0), { left: 1120, top: 36 })
  assert.equal(below.rows, 9)
  assert.deepEqual(latticeSlot(below, 9), { left: 1024, top: 36 })
})

test('lattice: a folder’s rows from the top left, wrapping at the width, insets on both sides', () => {
  const grid = folderLattice(303, { column: 96, inset: { right: 16 } })
  assert.equal(grid.cols, 3)
  assert.deepEqual(
    Array.from({ length: 6 }, (_, s) => latticeSlot(grid, s)).map((c) => [c.left, c.top]),
    [
      [16, 16],
      [112, 16],
      [208, 16],
      [16, 88],
      [112, 88],
      [208, 88],
    ]
  )
  // Too narrow for one whole column still has one.
  assert.equal(folderLattice(40, { column: 96, inset: { right: 16 } }).cols, 1)
})

test('the Trash: the bottom-right cell, inset as the lattice is, held below the menu bar', () => {
  assert.deepEqual(trashCell(areaOf(W, H)), { left: W - 16 - ICON_CELL, top: H - 16 - ICON_CELL })
  // The lattice's first column, whatever its rows.
  assert.equal(trashCell(areaOf(W, H)).left, latticeSlot(desktopLattice(areaOf(W, H)), 0).left)
  assert.deepEqual(trashCell(areaOf(1200, 740), { inset: { right: 32, bottom: 0 } }), { left: 1104, top: 676 })
  // A screen too short for it holds it at the work area's top.
  assert.equal(trashCell(areaOf(300, 60)).top, MENU_BAR)
})

test('fill order: column by column on the desktop, row by row in a folder, a pixel of drift no matter', () => {
  const desk = desktopLattice(areaOf(W, H))
  const a = latticeCell(desk, 0, 2)
  const b = latticeCell(desk, 1, 0)
  assert.ok(fillOrder(desk, a, b) < 0)
  assert.equal(fillOrder(desk, a, { left: a.left + 3, top: a.top - 2 }), 0)
  const folder = folderLattice(400)
  assert.ok(fillOrder(folder, latticeCell(folder, 2, 0), latticeCell(folder, 0, 1)) < 0)
})

test('next free cell: the first no icon covers, an icon off the lattice blocking every cell it touches', () => {
  const grid = folderLattice(303, { column: 96, inset: { right: 16 } })
  assert.deepEqual(nextFreeCell(grid, []), { left: 16, top: 16 })
  // On the first cell, and straddling the second and third.
  assert.deepEqual(
    nextFreeCell(grid, [
      { left: 16, top: 16 },
      { left: 150, top: 20 },
    ]),
    { left: 16, top: 88 }
  )
  // A bounded lattice with every cell taken: the home cell.
  const desk = desktopLattice(areaOf(200, 200))
  const all = Array.from({ length: desk.cols * desk.rows }, (_, s) => latticeSlot(desk, s))
  assert.deepEqual(nextFreeCell(desk, all), latticeSlot(desk, 0))
})

test('clean up: every icon on a cell, one icon per cell, a tidy set held', () => {
  for (const grid of [desktopLattice(areaOf(W, H)), folderLattice(400)]) {
    const onCell = (p) =>
      Number.isInteger((p.left - grid.left) / grid.dx) && Number.isInteger((p.top - grid.top) / grid.dy)
    const cells = [latticeCell(grid, 0, 0), latticeCell(grid, 1, 0), latticeCell(grid, 0, 1), latticeCell(grid, 1, 1)]
    const nudged = cells.map((c, i) => ({ left: c.left + 7 * i, top: c.top - 5 * i }))
    nudged.push({ left: cells[0].left + 3, top: cells[0].top + 2 }) // onto a taken cell
    const out = cleanUp(grid, nudged)
    assert.equal(out.length, nudged.length)
    for (const p of out) assert.ok(onCell(p), `off the lattice: ${JSON.stringify(p)}`)
    assert.equal(new Set(out.map((p) => `${p.left},${p.top}`)).size, out.length)
    assert.deepEqual(cleanUp(grid, cells), cells)
  }
})

test('clean up: a column cramped by a shrink walks back apart, and the collisions say so first', () => {
  const grid = { column: 96, inset: { top: 16, bottom: 0 } }
  const home = { width: 1200, height: 740 }
  const short = { width: 640, height: 480 }
  const column = [16, 88, 160].map((top) => pinTo(pinOf(box(1120, top, 64, 64), home, F), short, F, { size: CELL }))
  assert.deepEqual(
    column.map((b) => b.top),
    [16, 88, 116]
  )
  assert.deepEqual(collisions(column), new Set(['1,2']))
  const cells = cleanUp(desktopLattice(areaOf(640, 480, 0), grid), column)
  assert.deepEqual(cells, [
    { left: 560, top: 16 },
    { left: 560, top: 88 },
    { left: 560, top: 160 },
  ])
  assert.equal(collisions(cells.map((c) => ({ ...c, ...CELL }))).size, 0)
})

test('collisions: overlapping boxes pair up, boxes sharing an edge do not', () => {
  const b64 = (left, top) => box(left, top, 64, 64)
  assert.deepEqual(collisions([b64(0, 0), b64(0, 64), b64(0, 100), b64(64, 0)]), new Set(['1,2']))
})

test('field extent: at least the viewport, grown to hold every icon and the inset past it', () => {
  const viewport = { width: 300, height: 200 }
  assert.deepEqual(fieldExtent([], viewport), viewport)
  assert.deepEqual(fieldExtent([{ left: 400, top: 16 }], viewport), { width: 400 + 64 + 16, height: 200 })
})
