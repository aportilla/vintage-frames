/**
 * Verifies the Finder drag — what a `vf-icon` drag reports and what the page
 * can do with it — plus `vf-icon-field`, `target`, `placementAt` and the
 * re-measure a moved child triggers.
 *
 * Groups:
 *
 *  - EVENTS: a press with no lattice step fires nothing; the first step past
 *    the drag slop fires vf-drag-start then vf-drag; the release fires one cancelable vf-drop
 *    with the pointer, whole system px on the lattice, and the outline's
 *    origin (the frame's box plus the delta); a drop cancelled with
 *    preventDefault() leaves left/top untouched; uncancelled, the position is
 *    the proposal, clamped whole when it ran past the edge.
 *  - CANCEL: Escape mid-drag fires vf-drag-cancel, no vf-drop, and writes
 *    nothing; pointercancel the same; the Escape never reaches an enclosing
 *    dialog.
 *  - REPARENT: an icon filed into another field inside the vf-drop handler
 *    is still selected, and a press outside then deselects it — the
 *    outside-press listener survives the re-parent.
 *  - TOUCH: the frame's computed touch-action is none when movable, and
 *    manipulation otherwise.
 *  - SLOP: a drag begins past the drag slop, CSS px from the press — the
 *    mouse's the narrower, a finger's and a pen's the wider. Inside it a
 *    wobbling press fires nothing, moves nothing and leaves an armed rename
 *    armed; past it the proposal is the whole travel from the press.
 *  - FIELD: through the accessibility tree, a vf-icon-field is a
 *    multiselectable listbox named from `label`, its selectable icons are
 *    options with aria-selected, a consumer role on the tag wins, `size` on
 *    the field drives every icon's art, an unplaced field is a zero-height
 *    block whose placed icons anchor to the desktop's raster, and a placed
 *    and sized field is the anchor.
 *  - TARGET: the art's filter with and without `color`, the plate untouched,
 *    no aria-selected, and a press elsewhere clears nothing.
 *  - PLACEMENT AT: a scrolled `scrollbars="both"` window, a plain window, a
 *    bezeled desktop and a bare scroll area each convert a child's own rect
 *    corner back into that child's `left`/`top`.
 *  - RE-MEASURE: a placed icon in a `scrollbars="both"` window nudged (and
 *    set) past the viewport flips the viewport's data-overflow-y with no box
 *    resizing; `vf-window.measure()` reaches the same attribute.
 *  - OUTLINE: the icon's rect is unchanged mid-drag; the desktop's drag
 *    surface holds one canvas whose box is the frame's plus the delta, one
 *    image px per system px, on whole device px at dpr 1/2/3, painted with
 *    the XOR pen one tier above the menu bar and never a hit;
 *    elementFromPoint at the outline returns what is under it; over a white
 *    body the ring reads as a dotted black line with the interior untouched,
 *    over the dither its dots fall on the dither's white pixels and the ring
 *    reads as a black line, as the Finder's did; past the raster's
 *    edge nothing paints; a cancel removes the canvas; with no desktop the
 *    canvas lives in the icon's shadow and the drop still lands; a plate
 *    wider than `width` widens the canvas and keeps its own sides; a 45°
 *    edge is drawn at either parity of the pen.
 *  - BAND: the rubber band on a filled field — a press on the bare field
 *    with no travel draws nothing and clears the selection as any outside
 *    press does; a drag draws the dotted rectangle from the press to the
 *    pointer, fixed against the viewport in the field's own shadow, and
 *    selects the icons it crosses live, each reporting vf-select, deselecting
 *    one it leaves again; Shift keeps the existing selection and adds; Escape
 *    and pointercancel put the selection back and drop the rectangle; the
 *    rectangle reaches no further than the field inside its clips; a press
 *    on an icon is the icon's drag, not a band; the band's top edge over a
 *    white window body is a dotted line, and over the dither a black line
 *    whatever the field's own offset on the screen; an unfilled field draws
 *    none.
 *  - GROUP: the selection travels — a drag beginning on a selected icon
 *    carries every other selected, movable icon of its field: one outline
 *    each on the surface, `icons` in every event with the leader first, the
 *    drop moving each by one delta clamped for the group as a whole, a
 *    cancel or a cancelled drop writing nothing for any of them, a handler
 *    filing the whole set; an unselected icon drags alone, a Shift press
 *    that deselects the pressed icon drags it alone, a selected icon in
 *    another field stays, and a selected icon that cannot move stays.
 *  - WALK: the page moves an icon the way a drag does — `moveTo` clamps
 *    whole at the raster, snaps, announces one vf-placement-change and works
 *    on a non-movable icon; `dragTo` puts one canvas on the desktop's
 *    surface at whole system px between the origin and the landing while the
 *    icon stays put, takes it down and lands the icon at the end, announces
 *    once and fires no drag event; a target past the raster travels to and
 *    lands at the clamped landing; `dragIcons` walks three icons one at a
 *    time in the array's order with never more than one outline up; a press
 *    or Escape mid-walk lands every icon at once; a second call finishes the
 *    first; an icon removed before its turn is skipped; a move to where the
 *    icon already is shows nothing and settles at once; `moveTo` mid-travel
 *    finishes it; under reduced motion everything lands at once with no
 *    outline; with no desktop the canvas draws in the icon's frame. In a
 *    scrolling plane (a window body under `scrollbars`) only the origin
 *    holds: `moveTo` past the window's box lands there and the viewport
 *    reports the overflow, a negative pair lands at the origin, a hand drag
 *    of a two-icon group past the bottom lands past it, and `dragTo` walks
 *    there; in a plain window body the icon still lands whole.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:icon-drag
 */
import {
  check,
  decodePng,
  finger,
  gridTolerance,
  isBlack,
  isWhite,
  launch,
  makeBuild,
  pen,
  report,
  rgb,
} from './harness.mjs'

/** A solid 32×32 square stands in for art: the cell is reserved, not measured. */
const ART32 =
  'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27%3E%3Crect width=%2732%27 height=%2732%27 fill=%27%23000%27/%3E%3C/svg%3E'
const ART16 =
  'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27%3E%3Crect width=%2716%27 height=%2716%27 fill=%27%23000%27/%3E%3C/svg%3E'
/**
 * A folder silhouette, 32×32: a tab on rows 4–6 widening by one pixel a side
 * (45° sides) over a body on rows 7–27 — one rect per row, so nothing
 * anti-aliases. For the diagonal check.
 */
const FOLDER32 = (() => {
  const rows = [
    [4, 3, 11],
    [5, 2, 12],
    [6, 1, 13],
  ]
  for (let y = 7; y <= 27; y++) rows.push([y, 0, 31])
  const rects = rows
    .map(
      ([y, x0, x1]) =>
        `%3Crect x=%27${x0}%27 y=%27${y}%27 width=%27${x1 - x0 + 1}%27 height=%271%27 fill=%27%23000%27/%3E`
    )
    .join('')
  return `data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 shape-rendering=%27crispEdges%27%3E${rects}%3C/svg%3E`
})()

const browser = await launch()
const build = makeBuild(browser, { bodyStyle: 'margin:0;padding:40px' })

const icon = (attrs = '', label = 'Read Me') =>
  `<vf-icon label="${label}" ${attrs}>
     <vf-img slot="large"><img src="${ART32}" alt=""></vf-img>
     <vf-img slot="small"><img src="${ART16}" alt=""></vf-img>
   </vf-icon>`

/** Record every drag event reaching the document, in order. */
const record = (page) =>
  page.evaluate(() => {
    globalThis.__log = []
    for (const type of ['vf-drag-start', 'vf-drag', 'vf-drop', 'vf-drag-cancel']) {
      document.addEventListener(type, (e) => {
        // The detail's `icons` are elements; keep their ids for the record.
        const { icons, ...rest } = e.detail ?? {}
        globalThis.__log.push({
          type,
          id: e.target.id,
          detail: rest,
          icons: icons?.map((i) => i.id),
          cancelable: e.cancelable,
          bubbles: e.bubbles,
          composed: e.composed,
        })
      })
    }
  })
const log = (page) => page.evaluate(() => globalThis.__log)
const clearLog = (page) => page.evaluate(() => void (globalThis.__log = []))

/** The icon's placement, its frame box in CSS px, and the scale in force. */
const state = (page, id) =>
  page.evaluate((i) => {
    const el = document.getElementById(i)
    const f = el.shadowRoot.querySelector('.frame').getBoundingClientRect()
    return {
      left: el.left,
      top: el.top,
      x: f.x,
      y: f.y,
      w: f.width,
      h: f.height,
      scale: parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale')),
    }
  }, id)

const near = (a, b) => Math.abs(a - b) < 0.001
const settle = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/** Press on the icon's art, travel by (dx, dy) CSS px in steps, hold. */
async function pressAndMove(page, id, dx, dy, steps = 4) {
  const s = await state(page, id)
  await page.mouse.move(s.x + 10, s.y + 10)
  await page.mouse.down()
  await page.mouse.move(s.x + 10 + dx, s.y + 10 + dy, { steps })
  return s
}

// ── EVENTS ──────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
     </div>`
  )
  await record(page)
  const before = await state(page, 'ico')
  const scale = before.scale

  // A press that wiggles inside its lattice cell: never a drag.
  await page.mouse.move(before.x + 10, before.y + 10)
  await page.mouse.down()
  await page.mouse.move(before.x + 10.3, before.y + 10.2)
  await page.mouse.up()
  const still = await state(page, 'ico')
  check(
    'EVENTS  a press that never leaves its lattice cell fires nothing',
    (await log(page)).length === 0,
    JSON.stringify((await log(page)).map((e) => e.type))
  )
  check(
    'EVENTS  …and writes nothing',
    still.left === 20 && still.top === 20,
    `${still.left},${still.top}`
  )

  // A drag: 60 right, 30 down, in four steps, held before the release.
  await clearLog(page)
  await pressAndMove(page, 'ico', 60, 30)
  const mid = await log(page)
  check(
    'EVENTS  the first step fires vf-drag-start, then vf-drag on each changed step',
    mid.length >= 2 &&
      mid[0].type === 'vf-drag-start' &&
      mid.slice(1).every((e) => e.type === 'vf-drag'),
    mid.map((e) => e.type).join(',')
  )
  check(
    'EVENTS  vf-drag-start carries the seed origin in the container',
    mid[0]?.detail.left === 20 && mid[0]?.detail.top === 20,
    JSON.stringify(mid[0]?.detail)
  )
  check(
    'EVENTS  every event bubbles and composes, and no drop fires before the release',
    mid.every((e) => e.bubbles && e.composed && e.id === 'ico') &&
      !mid.some((e) => e.type === 'vf-drop')
  )
  await page.mouse.up()
  const all = await log(page)
  const drops = all.filter((e) => e.type === 'vf-drop')
  const drop = drops[0]
  check(
    'EVENTS  the release fires exactly one vf-drop, cancelable',
    drops.length === 1 && drop.cancelable && all[all.length - 1].type === 'vf-drop',
    all.map((e) => e.type).join(',')
  )
  check(
    'EVENTS  clientX/clientY is the pointer at the release',
    near(drop?.detail.clientX, before.x + 70) && near(drop?.detail.clientY, before.y + 40),
    `${drop?.detail.clientX},${drop?.detail.clientY} vs ${before.x + 70},${before.y + 40}`
  )
  const dx = 60 / scale
  const dy = 30 / scale
  check(
    'EVENTS  left/top is the proposal in the container: whole system px, origin plus the delta',
    Number.isInteger(drop?.detail.left) &&
      Number.isInteger(drop?.detail.top) &&
      drop?.detail.left === 20 + dx &&
      drop?.detail.top === 20 + dy,
    `${drop?.detail.left},${drop?.detail.top} (want ${20 + dx},${20 + dy})`
  )
  check(
    "EVENTS  x/y is the frame's box at the press plus the delta, in CSS px",
    near(drop?.detail.x, before.x + 60) && near(drop?.detail.y, before.y + 30),
    `${drop?.detail.x},${drop?.detail.y} vs ${before.x + 60},${before.y + 30}`
  )
  const after = await state(page, 'ico')
  check(
    'EVENTS  uncancelled, the icon lands on the proposal',
    after.left === drop?.detail.left && after.top === drop?.detail.top,
    `${after.left},${after.top}`
  )
  check(
    'EVENTS  …placed as a live system-px length',
    await page.evaluate(() => document.getElementById('ico').style.left.includes('--vf-scale'))
  )

  // A cancelled drop: the page takes the gesture, the kit writes nothing.
  await page.evaluate(() => {
    document.addEventListener('vf-drop', (e) => {
      if (globalThis.__cancelDrop) e.preventDefault()
    })
    globalThis.__cancelDrop = true
  })
  await clearLog(page)
  await pressAndMove(page, 'ico', 30, 20)
  await page.mouse.up()
  const cancelledDrop = (await log(page)).find((e) => e.type === 'vf-drop')
  const held = await state(page, 'ico')
  check(
    'EVENTS  a drop cancelled with preventDefault() still reports the proposal',
    cancelledDrop?.detail.left === after.left + 30 / scale &&
      cancelledDrop?.detail.top === after.top + 20 / scale,
    JSON.stringify(cancelledDrop?.detail)
  )
  check(
    'EVENTS  …and leaves left/top untouched',
    held.left === after.left && held.top === after.top,
    `${held.left},${held.top} (was ${after.left},${after.top})`
  )
  await page.evaluate(() => void (globalThis.__cancelDrop = false))

  // Past the far edge: the proposal keeps going, the write is clamped whole.
  await clearLog(page)
  await pressAndMove(page, 'ico', 4000, 4000)
  await page.mouse.up()
  const far = (await log(page)).find((e) => e.type === 'vf-drop')
  const pinned = await state(page, 'ico')
  const desk = await page.evaluate(() => {
    const d = document.getElementById('desk').getBoundingClientRect()
    return { right: d.right, bottom: d.bottom, w: d.width, h: d.height }
  })
  const maxLeft = (desk.w - pinned.w) / scale
  const maxTop = (desk.h - pinned.h) / scale
  check(
    'EVENTS  dragged past the edge, the write is the proposal clamped whole in the container',
    pinned.left === Math.min(far?.detail.left, maxLeft) &&
      pinned.top === Math.min(far?.detail.top, maxTop) &&
      pinned.x + pinned.w <= desk.right + 0.001 &&
      pinned.y + pinned.h <= desk.bottom + 0.001,
    `landed ${pinned.left},${pinned.top}; proposal ${far?.detail.left},${far?.detail.top}; max ${maxLeft},${maxTop}`
  )
  await page.close()
}

// ── CANCEL ──────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
     </div>`
  )
  await record(page)

  const s0 = await state(page, 'ico')
  await pressAndMove(page, 'ico', 50, 30, 3)
  await page.keyboard.press('Escape')
  const afterEsc = await state(page, 'ico')
  await page.mouse.up()
  const esc = await log(page)
  check(
    'CANCEL  Escape mid-drag fires vf-drag-cancel and no vf-drop',
    esc.some((e) => e.type === 'vf-drag-cancel') && !esc.some((e) => e.type === 'vf-drop'),
    esc.map((e) => e.type).join(',')
  )
  const afterUp = await state(page, 'ico')
  check(
    'CANCEL  …and writes nothing, before the release or after it',
    afterEsc.left === s0.left &&
      afterEsc.top === s0.top &&
      afterUp.left === s0.left &&
      afterUp.top === s0.top,
    `${afterEsc.left},${afterEsc.top} then ${afterUp.left},${afterUp.top} (was ${s0.left},${s0.top})`
  )

  // pointercancel — the platform abandoning the gesture — the same way. The
  // mouse pointer's id is 1, so a synthesized cancel with it is the one the
  // controller is waiting on.
  await clearLog(page)
  await pressAndMove(page, 'ico', 50, 30, 3)
  await page.evaluate(() => {
    document
      .getElementById('ico')
      .shadowRoot.querySelector('.frame')
      .dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true, composed: true }))
  })
  await page.mouse.up()
  const pc = await log(page)
  const afterPc = await state(page, 'ico')
  check(
    'CANCEL  pointercancel fires vf-drag-cancel, no vf-drop, and writes nothing',
    pc.some((e) => e.type === 'vf-drag-cancel') &&
      !pc.some((e) => e.type === 'vf-drop') &&
      afterPc.left === s0.left &&
      afterPc.top === s0.top,
    `${pc.map((e) => e.type).join(',')} at ${afterPc.left},${afterPc.top}`
  )

  // The gesture machinery is clean afterwards: the next drag lands.
  await clearLog(page)
  await pressAndMove(page, 'ico', 30, 30, 3)
  await page.mouse.up()
  const next = await state(page, 'ico')
  check(
    'CANCEL  the next drag after a cancel lands normally',
    (await log(page)).some((e) => e.type === 'vf-drop') &&
      next.left === s0.left + 30 / s0.scale &&
      next.top === s0.top + 30 / s0.scale,
    `${next.left},${next.top}`
  )
  await page.close()
}

{
  // Inside a modal: the Escape that cancels the drag never reaches the
  // dialog, which would otherwise read it as a dismissal.
  const page = await build(
    `<vf-dialog id="dlg" heading="Files" width="340" height="220" open>
       ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
     </vf-dialog>`
  )
  await record(page)
  await page.evaluate(() => {
    globalThis.__closes = 0
    document.addEventListener('vf-close', () => globalThis.__closes++)
  })
  await pressAndMove(page, 'ico', 40, 20, 3)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(40)
  const still = await page.evaluate(() => ({
    open: document.getElementById('dlg').open,
    closes: globalThis.__closes,
  }))
  check(
    'CANCEL  Escape mid-drag cancels the drag and leaves an enclosing dialog open',
    still.open && still.closes === 0 && (await log(page)).some((e) => e.type === 'vf-drag-cancel'),
    JSON.stringify(still)
  )
  await page.close()
}

// ── REPARENT ────────────────────────────────────────────────────────────────
// Filing at the drop: the handler cancels the default action, moves the icon
// into another field and places it there. The icon stays selected, and —
// the fault this fixes — a press elsewhere still clears it afterwards.
{
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       <vf-icon-field id="a" label="A">
         ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
       </vf-icon-field>
       <vf-icon-field id="b" label="B"></vf-icon-field>
       <div id="elsewhere" style="position:absolute;left:400px;top:300px;width:120px;height:60px">outside</div>
     </div>`
  )
  await record(page)
  await page.locator('#ico').click()
  check(
    'REPARENT  the press selected the icon',
    await page.evaluate(() => document.getElementById('ico').selected)
  )
  await page.evaluate(() => {
    document.addEventListener(
      'vf-drop',
      (e) => {
        e.preventDefault()
        document.getElementById('b').append(e.target)
        e.target.left = e.detail.left + 100
        e.target.top = e.detail.top
      },
      { once: true }
    )
  })
  await pressAndMove(page, 'ico', 40, 20)
  await page.mouse.up()
  await page.evaluate(() => document.getElementById('ico').updateComplete)
  const filed = await page.evaluate(() => {
    const el = document.getElementById('ico')
    return { parent: el.parentElement.id, selected: el.selected, left: el.left, top: el.top }
  })
  check(
    'REPARENT  the handler filed the icon into the other field, still selected',
    filed.parent === 'b' && filed.selected && filed.left === 160 && filed.top === 40,
    JSON.stringify(filed)
  )
  // No click was lost to the re-insert: the icon is not double-selected or
  // stuck — a press elsewhere clears it, through the re-attached listener.
  await page.locator('#elsewhere').click()
  check(
    'REPARENT  …and a press outside then deselects it (the listener survived the move)',
    (await page.evaluate(() => document.getElementById('ico').selected)) === false
  )
  await page.close()
}

// ── TOUCH ───────────────────────────────────────────────────────────────────
{
  const page = await build(
    `${icon('id="m" width="64" movable left="0" top="0"')}${icon('id="s" width="64" selectable')}`
  )
  const touch = await page.evaluate(() =>
    ['m', 's'].map(
      (id) =>
        getComputedStyle(document.getElementById(id).shadowRoot.querySelector('.frame'))
          .touchAction
    )
  )
  check(
    'TOUCH  a movable frame is touch-action: none, so a touch drags instead of panning',
    touch[0] === 'none',
    touch[0]
  )
  check(
    'TOUCH  a frame that cannot be dragged gives up the double-tap zoom and nothing else',
    touch[1] === 'manipulation',
    touch[1]
  )
  await page.close()
}

// ── SLOP ────────────────────────────────────────────────────────────────────
// A drag begins once the pointer has left its press by the drag slop — CSS
// px, narrow for the mouse and wider for a finger or pen. Inside it the press
// is a click or a tap: nothing fires, nothing moves, an armed rename stays
// armed. Past it the delta is still the whole travel from the press.
{
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       ${icon('id="ico" width="64" selectable movable editable left="20" top="20"')}
     </div>`
  )
  await record(page)
  const { fine, coarse, renameDelay } = await page.evaluate(() =>
    import('/src/index.js').then((m) => ({
      fine: m.DRAG_SLOP_PX,
      coarse: m.DRAG_SLOP_COARSE_PX,
      renameDelay: m.RENAME_DELAY_MS,
    }))
  )
  check('SLOP  the mouse has the narrower slop', fine > 1 && fine < coarse, `${fine} vs ${coarse}`)
  const s = await state(page, 'ico')
  const at = { x: s.x + 10, y: s.y + 10 }
  // A travel the mouse reads as a drag and a finger or pen as a wobble.
  const between = (fine + coarse) / 2
  const still = async () => {
    const now = await state(page, 'ico')
    return (await log(page)).length === 0 && now.left === 20 && now.top === 20
  }
  await page.evaluate(() => {
    globalThis.__moves = 0
    document.addEventListener('pointermove', () => globalThis.__moves++, true)
  })
  const moves = () => page.evaluate(() => globalThis.__moves)

  // The mouse: more than a system px of travel, less than the slop.
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x + fine / 2, at.y + fine / 2)
  await page.mouse.up()
  check(
    'SLOP  a mouse press that wobbles inside the slop fires nothing and moves nothing',
    await still(),
    JSON.stringify((await log(page)).map((e) => e.type))
  )
  await page.waitForTimeout(renameDelay + 150)

  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x + between, at.y)
  const started = await log(page)
  await page.mouse.up()
  check(
    'SLOP  past it the drag starts, and the proposal is the whole travel from the press',
    started[0]?.type === 'vf-drag-start' &&
      started[1]?.type === 'vf-drag' &&
      started[1].detail.left === 20 + Math.round(between / s.scale) &&
      started[1].detail.top === 20,
    JSON.stringify(started.map((e) => [e.type, e.detail.left, e.detail.top]))
  )
  await page.evaluate(() => {
    const el = document.getElementById('ico')
    el.left = 20
    el.top = 20
  })
  await settle(page)
  await clearLog(page)
  await page.waitForTimeout(renameDelay + 150)

  // A pen, over the same travel the mouse just dragged by: a wobble.
  const stylus = await pen(page)
  await stylus.down(at.x, at.y)
  await stylus.move(at.x + between, at.y)
  await stylus.up(at.x + between, at.y)
  check(
    'SLOP  the same travel under a pen is still a tap',
    await still(),
    JSON.stringify((await log(page)).map((e) => e.type))
  )
  await stylus.down(at.x, at.y)
  await stylus.move(at.x + coarse + 2, at.y)
  const penLog = await log(page)
  await stylus.up(at.x + coarse + 2, at.y)
  check(
    'SLOP  …and past the wider slop the pen drags',
    penLog[0]?.type === 'vf-drag-start' && (await log(page)).at(-1)?.type === 'vf-drop',
    JSON.stringify((await log(page)).map((e) => e.type))
  )
  await page.evaluate(() => {
    const el = document.getElementById('ico')
    el.left = 20
    el.top = 20
  })
  await settle(page)
  await clearLog(page)
  await page.waitForTimeout(renameDelay + 150)

  // A finger: real touch input, several moves inside the slop.
  const touch = await finger(page)
  const before = await moves()
  await touch.down(at.x, at.y)
  for (const [dx, dy] of [[3, 2], [6, 4], [4, -5], [1, 1]]) await touch.move(at.x + dx, at.y + dy)
  await touch.up()
  check(
    'SLOP  a finger tap that wobbles fires nothing and moves nothing',
    await still(),
    `${(await moves()) - before} pointermoves, ${JSON.stringify((await log(page)).map((e) => e.type))}`
  )
  await touch.down(at.x, at.y)
  for (let i = 1; i <= 4; i++) await touch.move(at.x + i * 12, at.y + i * 6)
  await touch.up()
  const dropped = (await log(page)).at(-1)
  check(
    'SLOP  …and a finger that travels drags, the drop the whole travel from the press',
    (await log(page))[0]?.type === 'vf-drag-start' &&
      dropped?.type === 'vf-drop' &&
      dropped.detail.left === 20 + Math.round(48 / s.scale) &&
      dropped.detail.top === 20 + Math.round(24 / s.scale),
    JSON.stringify([dropped?.type, dropped?.detail.left, dropped?.detail.top])
  )
  await page.evaluate(() => {
    const el = document.getElementById('ico')
    el.left = 20
    el.top = 20
  })
  await settle(page)
  await page.waitForTimeout(renameDelay + 150)

  // The wobble is not a drag, so it calls off nothing: a tap on the name of
  // the selected icon still renames.
  const plate = await page.evaluate(() => {
    const b = document
      .getElementById('ico')
      .shadowRoot.querySelector('.label')
      .getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  })
  await touch.down(plate.x, plate.y)
  await touch.move(plate.x + 4, plate.y + 3)
  await touch.up()
  await page.waitForTimeout(renameDelay + 150)
  check(
    'SLOP  a wobbling tap on a selected name still opens the rename box',
    await page.evaluate(
      () => !!document.getElementById('ico').shadowRoot.querySelector('input')
    )
  )
  await page.close()
}

// ── FIELD ───────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342">
       <vf-icon-field id="field" label="Desktop">
         ${icon('id="owned" width="64" selectable left="20" top="30"', 'Macintosh HD')}
         ${icon('id="second" width="64" selectable left="100" top="30"', 'Trash')}
       </vf-icon-field>
       <vf-icon-field id="custom" role="group" label="Custom"></vf-icon-field>
       <vf-icon-field id="boxed" label="Boxed" left="200" top="100" width="200" height="120">
         ${icon('id="inbox" width="64" selectable left="10" top="10"', 'Boxed')}
       </vf-icon-field>
       <div id="elsewhere" style="position:absolute;left:400px;top:280px;width:100px;height:40px">outside</div>
     </vf-desktop>`
  )
  // Computed, not attribute-read: the field writes ARIA through internals,
  // so nothing lands on the tag.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('Accessibility.enable')
  const ax = async (id) => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${id}` })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const n = nodes[0]
    const prop = (name) => n?.properties?.find((p) => p.name === name)?.value?.value ?? null
    return {
      role: n?.role?.value ?? null,
      name: n?.name?.value ?? '',
      multiselectable: prop('multiselectable'),
      selected: prop('selected'),
    }
  }

  const field = await ax('field')
  check(
    'FIELD  a vf-icon-field is a multiselectable listbox named from label',
    field.role === 'listbox' && field.name === 'Desktop' && field.multiselectable === true,
    JSON.stringify(field)
  )
  const owned = await ax('owned')
  check(
    'FIELD  a selectable icon inside it is an option with aria-selected',
    owned.role === 'option' && owned.name === 'Macintosh HD' && owned.selected === false,
    JSON.stringify(owned)
  )
  const custom = await ax('custom')
  check('FIELD  a consumer role on the tag wins', custom.role === 'group', JSON.stringify(custom))
  check(
    'FIELD  the field writes no role attribute of its own',
    await page.evaluate(() => !document.getElementById('field').hasAttribute('role'))
  )

  // size is the view's: one attribute on the field, every icon follows.
  const artWidth = (id) =>
    page.evaluate((i) => {
      const el = document.getElementById(i)
      const s = parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale'))
      return el.shadowRoot.querySelector('.art').getBoundingClientRect().width / s
    }, id)
  await page.evaluate(async () => {
    const f = document.getElementById('field')
    f.size = 'small'
    await f.updateComplete
    await Promise.all([...f.querySelectorAll('vf-icon')].map((i) => i.updateComplete))
  })
  check(
    'FIELD  size="small" on the field paints every icon in the 16×16 cell',
    (await artWidth('owned')) === 16 && (await artWidth('second')) === 16,
    `${await artWidth('owned')}, ${await artWidth('second')}`
  )
  await page.evaluate(async () => {
    const f = document.getElementById('field')
    f.size = 'large'
    await f.updateComplete
    await Promise.all([...f.querySelectorAll('vf-icon')].map((i) => i.updateComplete))
  })
  check(
    'FIELD  …and a later change follows',
    (await artWidth('owned')) === 32 && (await artWidth('second')) === 32
  )
  // An icon arriving later takes the view's size too.
  await page.evaluate(async () => {
    const f = document.getElementById('field')
    f.size = 'small'
    await f.updateComplete
    const late = document.createElement('vf-icon')
    late.id = 'late'
    late.label = 'Late'
    f.append(late)
    await late.updateComplete
  })
  await page.waitForTimeout(30)
  check(
    'FIELD  an icon slotted later takes the field’s size',
    (await page.evaluate(() => document.getElementById('late').size)) === 'small'
  )
  check(
    'FIELD  an icon outside any field keeps its own size',
    (await page.evaluate(() => document.getElementById('inbox').size)) === 'large'
  )
  // The late icon was never placed, so it sits in flow and would give the
  // field a line box of its own height — take it out before measuring the
  // field's neutrality.
  await page.evaluate(() => document.getElementById('late').remove())

  // Layout-neutral: a field of placed icons is a zero-height block, and the
  // icons anchor to the desktop's raster as if the field weren't there.
  const geometry = await page.evaluate(() => {
    const desk = document.getElementById('desk')
    const screen = desk.shadowRoot.querySelector('.screen').getBoundingClientRect()
    const field = document.getElementById('field').getBoundingClientRect()
    const owned = document.getElementById('owned').getBoundingClientRect()
    const boxed = document.getElementById('boxed').getBoundingClientRect()
    const inbox = document.getElementById('inbox').getBoundingClientRect()
    const s = parseFloat(getComputedStyle(desk).getPropertyValue('--vf-scale'))
    return {
      fieldHeight: field.height,
      fieldPosition: getComputedStyle(document.getElementById('field')).position,
      ownedFromScreen: [(owned.left - screen.left) / s, (owned.top - screen.top) / s],
      boxedFromScreen: [(boxed.left - screen.left) / s, (boxed.top - screen.top) / s],
      boxedSize: [boxed.width / s, boxed.height / s],
      inboxFromBoxed: [(inbox.left - boxed.left) / s, (inbox.top - boxed.top) / s],
    }
  })
  check(
    'FIELD  an unplaced field of placed icons is a zero-height in-flow block',
    geometry.fieldHeight === 0 && geometry.fieldPosition === 'static',
    `${geometry.fieldHeight}px, ${geometry.fieldPosition}`
  )
  check(
    "FIELD  …so its placed icons anchor to the desktop's raster",
    near(geometry.ownedFromScreen[0], 20) && near(geometry.ownedFromScreen[1], 30),
    geometry.ownedFromScreen.join(',')
  )
  check(
    'FIELD  a placed and sized field is a box at its stated rectangle',
    near(geometry.boxedFromScreen[0], 200) &&
      near(geometry.boxedFromScreen[1], 100) &&
      near(geometry.boxedSize[0], 200) &&
      near(geometry.boxedSize[1], 120),
    `${geometry.boxedFromScreen.join(',')} ${geometry.boxedSize.join('×')}`
  )
  check(
    '  …and the anchor its icons place against',
    near(geometry.inboxFromBoxed[0], 10) && near(geometry.inboxFromBoxed[1], 10),
    geometry.inboxFromBoxed.join(',')
  )

  // Moved between two fields: still an option, and still cleared by a press
  // outside once selected.
  await page.locator('#owned').click()
  await page.evaluate(async () => {
    document.getElementById('boxed').append(document.getElementById('owned'))
    await document.getElementById('owned').updateComplete
  })
  const moved = await ax('owned')
  check(
    'FIELD  an icon moved between two fields keeps option, and its selection',
    moved.role === 'option' && moved.selected === true,
    JSON.stringify(moved)
  )
  await page.locator('#elsewhere').click()
  check(
    'FIELD  …and a press outside still clears it after the move',
    (await page.evaluate(() => document.getElementById('owned').selected)) === false
  )
  await page.close()
}

// ── TARGET ──────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<vf-icon-field label="Desktop">
       ${icon('id="t" width="64" selectable target', 'Folder')}
       ${icon('id="tc" width="64" selectable color target', 'Color')}
       ${icon('id="plain" width="64" selectable', 'Plain')}
     </vf-icon-field>
     <div id="elsewhere" style="height:60px">outside</div>`
  )
  const look = (id) =>
    page.evaluate((i) => {
      const el = document.getElementById(i)
      const art = getComputedStyle(el.shadowRoot.querySelector('.art'))
      const plate = getComputedStyle(el.shadowRoot.querySelector('.name'))
      return { filter: art.filter, bg: plate.backgroundColor, color: plate.color }
    }, id)
  const t = await look('t')
  const tc = await look('tc')
  const plain = await look('plain')
  check('TARGET  the art inverts under target', t.filter === 'invert(1)', t.filter)
  check('TARGET  …and darkens under target with color', tc.filter === 'brightness(0.5)', tc.filter)
  check('TARGET  without it the art is untouched', plain.filter === 'none', plain.filter)
  check(
    'TARGET  the plate keeps its colors — no selection semantics',
    t.bg === 'rgb(255, 255, 255)' && t.color === 'rgb(0, 0, 0)',
    `${t.bg} on ${t.color}`
  )
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('Accessibility.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#t' })
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
  const selected = nodes[0]?.properties?.find((p) => p.name === 'selected')?.value?.value ?? null
  check('TARGET  no aria-selected comes with it', selected === false, String(selected))
  await page.evaluate(() => {
    globalThis.__selects = 0
    document.addEventListener('vf-select', () => globalThis.__selects++)
  })
  await page.locator('#elsewhere').click()
  const after = await page.evaluate(() => ({
    t: document.getElementById('t').target,
    tc: document.getElementById('tc').target,
    selects: globalThis.__selects,
  }))
  check(
    'TARGET  a press elsewhere clears nothing and fires nothing',
    after.t && after.tc && after.selects === 0,
    JSON.stringify(after)
  )
  await page.close()
}

// ── PLACEMENT AT ────────────────────────────────────────────────────────────
{
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342" bezel="5">
       ${icon('id="di" width="64" left="40" top="60"', 'Disk')}
       <vf-window id="win" heading="Docs" width="300" height="200" scrollbars="both" left="100" top="40">
         ${icon('id="wi" width="64" left="30" top="250"', 'Deep')}
       </vf-window>
       <vf-window id="plain" heading="Plain" width="200" height="120" left="150" top="200">
         ${icon('id="pi" width="64" left="12" top="8"', 'Flat')}
       </vf-window>
     </vf-desktop>
     <vf-scroll-area id="sa" style="width:300px;height:200px">
       <div style="height:800px">${icon('id="si" width="64" left="24" top="300"', 'Rider')}</div>
     </vf-scroll-area>`
  )
  // Scroll the document window and the bare area partway, so the offset is
  // in play for both.
  await page.evaluate(() => {
    document
      .getElementById('win')
      .shadowRoot.querySelector('vf-scroll-area')
      .shadowRoot.querySelector('.viewport').scrollTop = 120
    document.getElementById('sa').shadowRoot.querySelector('.viewport').scrollTop = 150
  })
  await settle(page)
  const probe = (container, child) =>
    page.evaluate(
      ([c, k]) => {
        const r = document.getElementById(k).getBoundingClientRect()
        const at = document.getElementById(c).placementAt(r.left, r.top)
        const el = document.getElementById(k)
        return { at, want: { left: el.left, top: el.top } }
      },
      [container, child]
    )
  const cases = [
    ['a scrolled scrollbars="both" window', 'win', 'wi'],
    ['a plain window body', 'plain', 'pi'],
    ['a bezeled desktop', 'desk', 'di'],
    ['a bare scroll area, scrolled', 'sa', 'si'],
  ]
  for (const [what, container, child] of cases) {
    const r = await probe(container, child)
    check(
      `PLACEMENT AT  ${what} converts a child's own corner back into its left/top`,
      r.at.left === r.want.left && r.at.top === r.want.top,
      `${r.at.left},${r.at.top} (want ${r.want.left},${r.want.top})`
    )
  }
  // The result is whole system px on the lattice even from a fractional point.
  const fractional = await page.evaluate(() => {
    const r = document.getElementById('di').getBoundingClientRect()
    return document.getElementById('desk').placementAt(r.left + 0.4, r.top + 0.3)
  })
  check(
    'PLACEMENT AT  a fractional point still lands on whole system px',
    Number.isInteger(fractional.left) && Number.isInteger(fractional.top),
    JSON.stringify(fractional)
  )
  await page.close()
}

// ── RE-MEASURE ──────────────────────────────────────────────────────────────
{
  const page = await build(
    `<vf-desktop width="512" height="342">
       <vf-window id="win" heading="Docs" width="300" height="200" scrollbars="both" left="20" top="20">
         ${icon('id="ico" width="64" selectable movable left="20" top="20"', 'Doc')}
       </vf-window>
     </vf-desktop>`
  )
  const overflow = () =>
    page.evaluate(() =>
      document
        .getElementById('win')
        .shadowRoot.querySelector('vf-scroll-area')
        .shadowRoot.querySelector('.viewport')
        .getAttribute('data-overflow-y')
    )
  const planeHeight = () =>
    page.evaluate(
      () =>
        document
          .getElementById('win')
          .shadowRoot.querySelector('vf-scroll-area')
          .shadowRoot.querySelector('.content')
          .getBoundingClientRect().height
    )
  check('RE-MEASURE  the icon fits at first', (await overflow()) === 'false', await overflow())
  const planeBefore = await planeHeight()

  // Nudge it past the viewport with the keyboard: 30 × 8 = 240 system px.
  await page.evaluate(() => document.getElementById('ico').focus())
  for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowDown')
  await page.evaluate(() => document.getElementById('ico').updateComplete)
  check(
    'RE-MEASURE  nudged past the viewport, the rail goes live with no box resizing',
    (await overflow()) === 'true' && (await planeHeight()) === planeBefore,
    `${await overflow()}, plane ${planeBefore} → ${await planeHeight()}`
  )

  // Set from code: the same funnel.
  await page.evaluate(async () => {
    const el = document.getElementById('ico')
    el.top = 20
    await el.updateComplete
  })
  check('RE-MEASURE  a top set from code re-measures too (back to fitting)', (await overflow()) === 'false')

  // measure(): a move the kit cannot see (an inline style, not the property)
  // is stale until the window is asked.
  await page.evaluate(() => {
    document.getElementById('ico').style.top = 'calc(var(--vf-scale, 1) * 400px)'
  })
  await settle(page)
  const stale = await overflow()
  await page.evaluate(() => document.getElementById('win').measure())
  check(
    'RE-MEASURE  vf-window.measure() reaches the built-in area',
    stale === 'false' && (await overflow()) === 'true',
    `${stale} → ${await overflow()}`
  )
  check(
    'RE-MEASURE  measure() is a no-op on a window without scrollbars',
    await page.evaluate(() => {
      const w = document.createElement('vf-window')
      w.measure()
      return true
    })
  )
  await page.close()
}

// ── OUTLINE ─────────────────────────────────────────────────────────────────
// The drag draws the classic dotted outline on the desktop's drag surface and
// the icon stays put until the drop. The art is a solid 32×32 square, so the
// ring is its one-pixel border, and the top row of that border is where the
// pixels are read.
const OUTLINE_DESK = `
  <vf-desktop id="desk" width="512" height="342">
    <vf-icon-field label="Desktop">
      ${icon('id="ico" width="64" selectable movable left="40" top="60"', 'Disk')}
    </vf-icon-field>
    <vf-window id="win" heading="Docs" width="300" height="200" left="150" top="40"></vf-window>
  </vf-desktop>`

/** The outline canvas on the desktop's surface, and the icon's frame. */
const outline = (page) =>
  page.evaluate(() => {
    const desk = document.getElementById('desk')
    const ico = document.getElementById('ico')
    const surface = desk.shadowRoot.querySelector('.drag-surface')
    const canvases = surface.querySelectorAll('canvas')
    const c = canvases[0]
    const r = c?.getBoundingClientRect()
    const f = ico.shadowRoot.querySelector('.frame').getBoundingClientRect()
    const art = ico.shadowRoot.querySelector('.art').getBoundingClientRect()
    const plate = ico.shadowRoot.querySelector('.name')?.getBoundingClientRect()
    const cs = c ? getComputedStyle(c) : null
    const screen = desk.shadowRoot.querySelector('.screen').getBoundingClientRect()
    return {
      count: canvases.length,
      canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      frame: { x: f.x, y: f.y, w: f.width, h: f.height },
      art: { dx: art.x - f.x, dy: art.y - f.y, w: art.width, h: art.height },
      plate: plate ? { dx: plate.x - f.x, dy: plate.y - f.y, w: plate.width, h: plate.height } : null,
      raster: c ? [c.width, c.height] : null,
      blend: cs?.mixBlendMode,
      filter: cs?.filter,
      pointer: cs?.pointerEvents,
      z: cs?.zIndex,
      surfacePointer: getComputedStyle(surface).pointerEvents,
      inFrame: !!ico.shadowRoot.querySelector('canvas.drag-outline'),
      screen: { x: screen.x, y: screen.y, right: screen.right, bottom: screen.bottom },
    }
  })

{
  // A gray page, so paint that leaks past the raster's edge would show.
  const page = await build(OUTLINE_DESK, {
    settle: true,
    bodyStyle: 'margin:0;padding:40px;background:#8f8f8f',
  })
  await record(page)
  const before = await state(page, 'ico')
  const scale = before.scale

  // Over the window body: a drag by (160, 40) puts the outline at (200, 100)
  // on the screen, inside the 300×200 window at (150, 40).
  await pressAndMove(page, 'ico', 160, 40)
  const mid = await outline(page)
  check(
    'OUTLINE  the icon stays put mid-drag',
    near(mid.frame.x, before.x) && near(mid.frame.y, before.y),
    `${mid.frame.x},${mid.frame.y} (was ${before.x},${before.y})`
  )
  check(
    "OUTLINE  the desktop's surface holds one canvas: the frame's box plus the delta",
    mid.count === 1 &&
      !mid.inFrame &&
      near(mid.canvas?.x, before.x + 160) &&
      near(mid.canvas?.y, before.y + 40) &&
      near(mid.canvas?.w, before.w) &&
      near(mid.canvas?.h, before.h),
    JSON.stringify({ count: mid.count, canvas: mid.canvas, frame: before })
  )
  check(
    'OUTLINE  the raster is one image px per system px of the frame',
    mid.raster?.[0] === Math.round(before.w / scale) && mid.raster?.[1] === Math.round(before.h / scale),
    `${mid.raster} for a ${before.w / scale}×${before.h / scale} frame`
  )
  check(
    'OUTLINE  the XOR pen, never a hit, one tier above the menu bar',
    mid.blend === 'difference' &&
      mid.filter === 'invert(1)' &&
      mid.pointer === 'none' &&
      mid.surfacePointer === 'none' &&
      Number(mid.z) === 2_000_001,
    JSON.stringify({ blend: mid.blend, filter: mid.filter, pointer: mid.pointer, z: mid.z })
  )
  const under = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.localName,
    [mid.canvas.x + 20, mid.canvas.y + 20]
  )
  check('OUTLINE  elementFromPoint at the outline returns what is under it', under === 'vf-window', under)

  // The ring's top row over the white body: ink and paper alternating, and
  // the row inside it untouched.
  const png = decodePng(await page.screenshot())
  const rowY = Math.round(mid.canvas.y + mid.art.dy)
  const x0 = Math.round(mid.canvas.x + mid.art.dx)
  const classify = (x, y) => (isBlack(png, x, y) ? 'B' : isWhite(png, x, y) ? 'W' : '.')
  let row = ''
  for (let i = 0; i < 12; i++) row += classify(x0 + i, rowY)
  check(
    'OUTLINE  over a white body the ring is a dotted black line',
    row === 'BWBWBWBWBWBW' || row === 'WBWBWBWBWBWB',
    row
  )
  let inside = ''
  for (let i = 2; i < 12; i++) inside += classify(x0 + i, rowY + 2)
  check('OUTLINE  …with the interior untouched', inside === 'WWWWWWWWWW', inside)

  // The art fills its cell and the plate sits directly under it, narrower.
  // The Finder framed the mask united with the name's rect as one region,
  // so the outline wraps around the two: no edge runs between them — the
  // art's bottom row above the plate and the plate's top row under the art
  // are untouched — while the art's bottom edge is still drawn beside the
  // plate, where it is the shape's boundary.
  const plateX = Math.round(mid.canvas.x + mid.plate.dx)
  const plateY = Math.round(mid.canvas.y + mid.plate.dy)
  const artBottom = plateY - 1
  let above = ''
  let below = ''
  let beside = ''
  for (let x = plateX + 1; x < plateX + mid.plate.w - 1; x++) {
    above += classify(x, artBottom)
    below += classify(x, plateY)
  }
  for (let x = x0; x < plateX; x++) beside += classify(x, artBottom)
  const alternating = (s) =>
    s.includes('B') && [...s].every((ch, i) => i === 0 || ch !== s[i - 1]) && !s.includes('.')
  check(
    'OUTLINE  the art and the plate abut, and the outline wraps them as one shape — no edge between them',
    mid.plate.dy === mid.art.dy + mid.art.h &&
      mid.plate.w < mid.art.w &&
      /^W+$/.test(above) &&
      /^W+$/.test(below) &&
      alternating(beside),
    `above ${above}, below ${below}, beside ${beside}`
  )

  // A cancel takes the canvas with it — and keeps the icon out from under
  // the window, where the next press could not reach it.
  await page.keyboard.press('Escape')
  const cancelled = await outline(page)
  await page.mouse.up()
  check(
    'OUTLINE  a cancel removes the canvas',
    cancelled.count === 0 && (await log(page)).some((e) => e.type === 'vf-drag-cancel'),
    `${cancelled.count} left`
  )

  // Over the dither: a drag by (0, 150) puts the outline at (40, 210) on the
  // screen, left of the window. The dots land on the dither's white pixels
  // and flip them, the dither's own ink fills in between, so the ring's row
  // reads as a black line while the dither a few rows up still alternates.
  await pressAndMove(page, 'ico', 0, 150)
  const over = await outline(page)
  const png2 = decodePng(await page.screenshot())
  const y2 = Math.round(over.canvas.y + over.art.dy)
  const x2 = Math.round(over.canvas.x + over.art.dx)
  const c2 = (x, y) => (isBlack(png2, x, y) ? 'B' : isWhite(png2, x, y) ? 'W' : '.')
  let ring = ''
  let dither = ''
  for (let i = 0; i < 12; i++) {
    ring += c2(x2 + i, y2)
    dither += c2(x2 + i, y2 - 3)
  }
  check(
    "OUTLINE  over the dither the ring's dots fall between the dither's ink — the row reads as a black line",
    ring === 'BBBBBBBBBBBB' && (dither === 'BWBWBWBWBWBW' || dither === 'WBWBWBWBWBWB'),
    `ring ${ring}, dither three rows up ${dither}`
  )
  await page.mouse.up()
  const after = await state(page, 'ico')
  const left = (await outline(page)).count
  check(
    'OUTLINE  the drop lands the icon where the outline was',
    after.left === 40 && after.top === 60 + 150 / scale,
    `${after.left},${after.top}`
  )
  check('OUTLINE  …and the canvas leaves the surface', left === 0, `${left} left`)

  // Past the raster's edge: the outline straddles the screen's right edge and
  // nothing paints beyond it — the gray page stays gray on the ring's row.
  const toEdge = over.screen.right - 20 - after.x // the frame's left lands 20px short of the edge
  await pressAndMove(page, 'ico', toEdge, 0)
  const edge = await outline(page)
  const png3 = decodePng(await page.screenshot())
  const y3 = Math.round(edge.canvas.y + edge.art.dy)
  const beyond = []
  for (let i = 2; i < 10; i++) beyond.push(rgb(png3, Math.round(edge.screen.right) + i, y3).join(','))
  check(
    "OUTLINE  past the raster's edge the visible box ends at the screen",
    edge.canvas.x + edge.canvas.w > edge.screen.right && beyond.every((p) => p === '143,143,143'),
    `canvas to ${edge.canvas.x + edge.canvas.w} vs screen ${edge.screen.right}; beyond: ${beyond[0]}…`
  )
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.close()
}

// Whole device px at every density: the outline's box is a whole count of
// system px from the screen's origin, so it lands on the device grid.
for (const dpr of [2, 3]) {
  const page = await build(OUTLINE_DESK, { dpr, settle: true })
  const before = await state(page, 'ico')
  await pressAndMove(page, 'ico', 30, 18)
  const mid = await outline(page)
  const tol = gridTolerance(before.scale, dpr)
  const whole = (v) => Math.abs(v * dpr - Math.round(v * dpr)) <= tol
  check(
    `OUTLINE dpr${dpr}  the canvas box lands on whole device px`,
    mid.count === 1 && [mid.canvas.x, mid.canvas.y, mid.canvas.w, mid.canvas.h].every(whole),
    `${[mid.canvas?.x, mid.canvas?.y, mid.canvas?.w, mid.canvas?.h].map((v) => v * dpr).join(', ')} device px`
  )
  await page.mouse.up()
  await page.close()
}

// Without a desktop: the request goes unanswered and the canvas lives in the
// icon's own frame, translated by the delta; the drop still lands.
{
  const page = await build(
    `<div id="box" style="position:relative;width:400px;height:300px;overflow:hidden;background:#fff">
       ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
     </div>`,
    { settle: true }
  )
  await record(page)
  const before = await state(page, 'ico')
  await pressAndMove(page, 'ico', 50, 30)
  const mid = await page.evaluate(() => {
    const ico = document.getElementById('ico')
    const c = ico.shadowRoot.querySelector('canvas.drag-outline')
    const r = c?.getBoundingClientRect()
    const f = ico.shadowRoot.querySelector('.frame').getBoundingClientRect()
    return { has: !!c, canvas: r ? { x: r.x, y: r.y } : null, frame: { x: f.x, y: f.y } }
  })
  check(
    'OUTLINE  with no desktop the canvas lives in the icon’s shadow, translated by the delta',
    mid.has &&
      near(mid.frame.x, before.x) &&
      near(mid.frame.y, before.y) &&
      near(mid.canvas?.x, before.x + 50) &&
      near(mid.canvas?.y, before.y + 30),
    JSON.stringify(mid)
  )
  await page.mouse.up()
  const after = await state(page, 'ico')
  const left = await page.evaluate(
    () => !!document.getElementById('ico').shadowRoot.querySelector('canvas.drag-outline')
  )
  check(
    'OUTLINE  …and the drop still lands',
    after.left === 20 + 50 / before.scale && after.top === 20 + 30 / before.scale && !left,
    `${after.left},${after.top}; canvas left: ${left}`
  )
  await page.close()
}

// A name wider than a declared `width` overhangs the frame on both sides, and
// the outline's canvas is the frame widened to the plate: the plate's own
// sides are drawn, not cut off at the frame's edges.
{
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342">
       <vf-icon-field label="Desktop">
         ${icon('id="ico" width="64" selectable movable left="40" top="60"', 'untitled folder')}
       </vf-icon-field>
       <vf-window id="win" heading="Docs" width="300" height="200" left="150" top="40"></vf-window>
     </vf-desktop>`,
    { settle: true }
  )
  const before = await state(page, 'ico')
  const plate = await page.evaluate(() => {
    const r = document.getElementById('ico').shadowRoot.querySelector('.name').getBoundingClientRect()
    return { x: r.x, w: r.width, h: r.height }
  })
  // Over the window body, as above: the outline lands inside the 300×200
  // window at (150, 40).
  await pressAndMove(page, 'ico', 160, 40)
  const mid = await outline(page)
  check(
    'OUTLINE  a plate wider than `width` overhangs the frame, and the canvas is the frame widened to it',
    plate.x < before.x &&
      plate.x + plate.w > before.x + before.w &&
      mid.count === 1 &&
      near(mid.canvas?.x, plate.x + 160) &&
      near(mid.canvas?.w, plate.w) &&
      near(mid.canvas?.y, before.y + 40) &&
      near(mid.canvas?.h, before.h),
    JSON.stringify({ canvas: mid.canvas, frame: before, plate })
  )
  // The plate's left and right columns over the white body: dotted lines,
  // where a frame-sized canvas had nothing.
  const png = decodePng(await page.screenshot())
  const classify = (x, y) => (isBlack(png, x, y) ? 'B' : isWhite(png, x, y) ? 'W' : '.')
  const plateTop = Math.round(mid.canvas.y + mid.canvas.h - plate.h)
  const x0 = Math.round(mid.canvas.x)
  const x1 = Math.round(mid.canvas.x + mid.canvas.w) - 1
  let leftCol = ''
  let rightCol = ''
  for (let i = 0; i < 12; i++) {
    leftCol += classify(x0, plateTop + i)
    rightCol += classify(x1, plateTop + i)
  }
  const dotted = (s) => s === 'BWBWBWBWBWBW' || s === 'WBWBWBWBWBWB'
  check(
    "OUTLINE  …and the plate's own sides are drawn: dotted columns over the white body",
    dotted(leftCol) && dotted(rightCol),
    `left ${leftCol}, right ${rightCol}`
  )
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.close()
}

// A 45° edge — a folder tab's slanted sides. A one-pixel diagonal is all one
// parity of the checker, so the pen would keep all of it or none, and over
// the dither "none" is the dither's own ink diagonal, no line at all. The
// ring is a region inset (the 3×3 box, FrameRgn's), which makes a diagonal
// two pixels wide, and one full diagonal of dots survives at either phase.
// Read over the white body at two origins of opposite parity.
{
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342">
       <vf-icon-field label="Desktop">
         <vf-icon id="ico" label="Disk" width="64" selectable movable left="40" top="60">
           <vf-img slot="large"><img src="${FOLDER32}" alt=""></vf-img>
         </vf-icon>
       </vf-icon-field>
       <vf-window id="win" heading="Docs" width="300" height="200" left="150" top="40"></vf-window>
     </vf-desktop>`,
    { settle: true }
  )
  const results = []
  for (const [dx, dy] of [
    [160, 40],
    [161, 40],
  ]) {
    await pressAndMove(page, 'ico', dx, dy)
    const mid = await outline(page)
    const png = decodePng(await page.screenshot())
    const x0 = Math.round(mid.canvas.x + mid.art.dx)
    const y0 = Math.round(mid.canvas.y + mid.art.dy)
    // On rows 5 and 6 the tab's sides are pure diagonal: the ring holds the
    // step pixel and the one inside it, and the dots keep one of the two.
    const pairs = {
      left: [
        [
          [2, 5],
          [3, 5],
        ],
        [
          [1, 6],
          [2, 6],
        ],
      ],
      right: [
        [
          [11, 5],
          [12, 5],
        ],
        [
          [12, 6],
          [13, 6],
        ],
      ],
    }
    const ink = (pair) => pair.map(([x, y]) => (isBlack(png, x0 + x, y0 + y) ? 'B' : 'W')).join('')
    results.push({
      dx,
      left: pairs.left.map(ink),
      right: pairs.right.map(ink),
    })
    await page.keyboard.press('Escape')
    await page.mouse.up()
  }
  const drawn = (rows) => rows.every((pair) => pair.includes('B'))
  check(
    "OUTLINE  a 45° edge is drawn at either parity — the tab's sides carry ink at both origins",
    results.every((r) => drawn(r.left) && drawn(r.right)),
    JSON.stringify(results)
  )
  await page.close()
}

// ── BAND ────────────────────────────────────────────────────────────────────
// The rubber band: a press on a field's own background dragged across it.
// The field fills the desktop's screen, so a press on the bare dither is a
// press on the field.
const BAND_DESK = `
  <vf-desktop id="desk" width="512" height="342">
    <vf-icon-field id="field" label="Desktop" fill-width fill-height>
      ${icon('id="a" width="64" selectable movable left="20" top="20"', 'A')}
      ${icon('id="b" width="64" selectable movable left="120" top="20"', 'B')}
      ${icon('id="c" width="64" selectable movable left="20" top="200"', 'C')}
    </vf-icon-field>
    <vf-window id="win" heading="Docs" width="200" height="120" left="280" top="160"></vf-window>
  </vf-desktop>`

/** The band's canvas in a field's shadow, and who is selected. */
const band = (page, fieldId = 'field') =>
  page.evaluate((f) => {
    const field = document.getElementById(f)
    const c = field.shadowRoot.querySelector('canvas.selection-rect')
    const r = c?.getBoundingClientRect()
    const cs = c ? getComputedStyle(c) : null
    return {
      has: !!c,
      canvas: r ? { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } : null,
      position: cs?.position,
      blend: cs?.mixBlendMode,
      pointer: cs?.pointerEvents,
      selected: Object.fromEntries(
        [...document.querySelectorAll('vf-icon')].map((i) => [i.id, i.selected])
      ),
    }
  }, fieldId)

/** Record vf-select on the document as {id, selected}. */
const recordSelects = (page) =>
  page.evaluate(() => {
    globalThis.__selects = []
    document.addEventListener('vf-select', (e) =>
      globalThis.__selects.push({ id: e.target.id, selected: e.detail.selected })
    )
  })
const selects = (page) => page.evaluate(() => globalThis.__selects)
const clearSelects = (page) => page.evaluate(() => void (globalThis.__selects = []))

{
  const page = await build(BAND_DESK, { settle: true })
  await recordSelects(page)
  const geo = await page.evaluate(() => {
    const desk = document.getElementById('desk')
    const screen = desk.shadowRoot.querySelector('.screen').getBoundingClientRect()
    const field = document.getElementById('field')
    const f = field.getBoundingClientRect()
    const a = document.getElementById('a').getBoundingClientRect()
    return {
      screen: { x: screen.x, y: screen.y, w: screen.width, h: screen.height, right: screen.right, bottom: screen.bottom },
      field: { x: f.x, y: f.y, w: f.width, h: f.height },
      position: getComputedStyle(field).position,
      aFromScreen: [a.x - screen.x, a.y - screen.y],
      scale: parseFloat(getComputedStyle(field).getPropertyValue('--vf-scale')),
    }
  })
  const S = geo.screen
  const scale = geo.scale
  check(
    "BAND  a filled field is the screen's box, static, its icons still anchored to the raster",
    near(geo.field.x, S.x) && near(geo.field.y, S.y) && near(geo.field.w, S.w) && near(geo.field.h, S.h) &&
      geo.position === 'static' && near(geo.aFromScreen[0], 20 * scale) && near(geo.aFromScreen[1], 20 * scale),
    JSON.stringify(geo)
  )

  // A stationary press on the bare field: no band, and the press clears the
  // selection the way any press outside an icon does.
  await page.locator('#a').click()
  check('BAND  a click selected A first', (await band(page)).selected.a === true)
  await page.mouse.move(S.x + 10, S.y + 10)
  await page.mouse.down()
  const pressed = await band(page)
  await page.mouse.up()
  check(
    'BAND  a stationary press on the bare field draws nothing and clears the selection',
    !pressed.has && pressed.selected.a === false && !(await band(page)).has,
    JSON.stringify(pressed)
  )

  // The band: from (10,10) to (200,80) on the screen crosses A and B, not C.
  await clearSelects(page)
  await page.mouse.move(S.x + 10, S.y + 10)
  await page.mouse.down()
  await page.mouse.move(S.x + 200, S.y + 80, { steps: 4 })
  const mid = await band(page)
  check(
    'BAND  a drag draws the rectangle from the press to the pointer, fixed in the field’s shadow',
    mid.has &&
      mid.position === 'fixed' &&
      mid.blend === 'difference' &&
      mid.pointer === 'none' &&
      near(mid.canvas.x, S.x + 10) &&
      near(mid.canvas.y, S.y + 10) &&
      near(mid.canvas.w, 190) &&
      near(mid.canvas.h, 70),
    JSON.stringify({ position: mid.position, canvas: mid.canvas })
  )
  // The band's top edge over the bare dither: the pen's dots fall on the
  // dither's white pixels, so the row reads as a black line while the dither
  // three rows up still alternates.
  {
    const png = decodePng(await page.screenshot())
    const x = Math.round(mid.canvas.x)
    const y = Math.round(mid.canvas.y)
    const c = (px, py) => (isBlack(png, px, py) ? 'B' : isWhite(png, px, py) ? 'W' : '.')
    let edge = ''
    let dither = ''
    for (let i = 0; i < 12; i++) {
      edge += c(x + i, y)
      dither += c(x + i, y - 3)
    }
    check(
      'BAND  over the dither the band’s edge reads as a black line',
      edge === 'BBBBBBBBBBBB' && (dither === 'BWBWBWBWBWBW' || dither === 'WBWBWBWBWBWB'),
      `edge ${edge}, dither three rows up ${dither}`
    )
  }
  check(
    'BAND  …and selects the icons it crosses, live',
    mid.selected.a === true && mid.selected.b === true && mid.selected.c === false,
    JSON.stringify(mid.selected)
  )
  const first = await selects(page)
  check(
    'BAND  each selection reports vf-select on the icon',
    first.some((e) => e.id === 'a' && e.selected) && first.some((e) => e.id === 'b' && e.selected),
    JSON.stringify(first)
  )
  // Shrinking it back off B deselects B.
  await page.mouse.move(S.x + 100, S.y + 80, { steps: 3 })
  const shrunk = await band(page)
  check(
    'BAND  an icon the rectangle leaves again deselects, and says so',
    shrunk.selected.a === true &&
      shrunk.selected.b === false &&
      near(shrunk.canvas.w, 90) &&
      (await selects(page)).some((e) => e.id === 'b' && e.selected === false),
    JSON.stringify(shrunk.selected)
  )
  await page.mouse.up()
  const released = await band(page)
  check(
    'BAND  the release keeps the selection and drops the rectangle',
    !released.has && released.selected.a === true && released.selected.b === false,
    JSON.stringify(released)
  )

  // The rectangle counts an icon it TOUCHES — the art cell or the plate —
  // not the empty cell beside them: A's art sits 16px in from its 64px cell,
  // so a band through the cell's left margin selects nothing, and one that
  // reaches the art does.
  await page.mouse.move(S.x + 10, S.y + 10)
  await page.mouse.down()
  await page.mouse.move(S.x + 30, S.y + 80, { steps: 3 })
  const margin = await band(page)
  await page.mouse.move(S.x + 40, S.y + 80, { steps: 2 })
  const art = await band(page)
  await page.mouse.up()
  check(
    "BAND  the rectangle counts an icon it touches — the art or the plate, not the cell's empty margin",
    margin.has && margin.selected.a === false && art.selected.a === true,
    `margin ${JSON.stringify(margin.selected)}, art ${JSON.stringify(art.selected)}`
  )

  // Shift: the selection survives the press and the rectangle TOGGLES against
  // it. C by click first (which clears A); a Shift-band over A adds A.
  await page.locator('#c').click()
  await page.keyboard.down('Shift')
  await page.mouse.move(S.x + 10, S.y + 10)
  await page.mouse.down()
  await page.mouse.move(S.x + 100, S.y + 80, { steps: 3 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  const shifted = await band(page)
  check(
    'BAND  with Shift the existing selection survives the press and the band adds what it touches',
    shifted.selected.a === true && shifted.selected.c === true && shifted.selected.b === false,
    JSON.stringify(shifted.selected)
  )
  // …and a Shift-band over an already-selected icon deselects it while it
  // covers it, gives it back when it leaves, and the release keeps the last
  // state. A and C are selected; B is not.
  await page.keyboard.down('Shift')
  await page.mouse.move(S.x + 10, S.y + 10)
  await page.mouse.down()
  await page.mouse.move(S.x + 200, S.y + 80, { steps: 3 }) // over A and B
  const covered = await band(page)
  await page.mouse.move(S.x + 200, S.y + 5, { steps: 2 }) // off both again, a sliver
  const uncovered = await band(page)
  await page.mouse.move(S.x + 200, S.y + 80, { steps: 2 }) // back over A and B
  await page.mouse.up()
  await page.keyboard.up('Shift')
  const toggled = await band(page)
  check(
    'BAND  a Shift-band toggles: a selected icon it covers deselects, an unselected one selects',
    covered.selected.a === false && covered.selected.b === true && covered.selected.c === true,
    JSON.stringify(covered.selected)
  )
  check(
    'BAND  …the toggle is live: leaving the icon gives its anchor state back',
    uncovered.selected.a === true && uncovered.selected.b === false && uncovered.selected.c === true,
    JSON.stringify(uncovered.selected)
  )
  check(
    'BAND  …and the release keeps the toggled result',
    !toggled.has && toggled.selected.a === false && toggled.selected.b === true && toggled.selected.c === true,
    JSON.stringify(toggled.selected)
  )

  // Escape mid-band: the selection goes back to the anchor (here: nothing,
  // the plain press having cleared B and C), the rectangle goes.
  await page.mouse.move(S.x + 10, S.y + 10)
  await page.mouse.down()
  await page.mouse.move(S.x + 100, S.y + 80, { steps: 3 })
  const before = await band(page)
  await page.keyboard.press('Escape')
  const escaped = await band(page)
  await page.mouse.up()
  const afterUp = await band(page)
  check(
    'BAND  Escape mid-band puts the anchor back and drops the rectangle',
    before.selected.a === true &&
      !escaped.has &&
      escaped.selected.a === false &&
      !afterUp.has &&
      afterUp.selected.a === false,
    JSON.stringify({ before: before.selected, escaped: escaped.selected })
  )
  // …and with Shift held, back to the anchor the press kept — a covered,
  // toggled-off icon included.
  await page.locator('#c').click()
  await page.keyboard.down('Shift')
  await page.mouse.move(S.x + 10, S.y + 10)
  await page.mouse.down()
  await page.mouse.move(S.x + 100, S.y + 230, { steps: 3 }) // over A and C
  await page.keyboard.up('Shift')
  const mid2 = await band(page)
  await page.evaluate(() =>
    document
      .getElementById('field')
      .dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true, composed: true }))
  )
  const cancelled = await band(page)
  await page.mouse.up()
  check(
    'BAND  pointercancel puts the anchor back — a toggled-off icon comes back selected',
    mid2.selected.a === true &&
      mid2.selected.c === false &&
      !cancelled.has &&
      cancelled.selected.c === true &&
      cancelled.selected.a === false,
    JSON.stringify({ mid: mid2.selected, cancelled: cancelled.selected })
  )

  // The band reaches no further than the field: dragged far past every
  // edge, it stops at the screen.
  await page.mouse.move(S.x + 10, S.y + 10)
  await page.mouse.down()
  await page.mouse.move(S.x - 500, S.y - 500, { steps: 3 })
  const upLeft = await band(page)
  await page.mouse.move(S.x + 5000, S.y + 5000, { steps: 3 })
  const downRight = await band(page)
  await page.mouse.up()
  check(
    "BAND  the rectangle reaches no further than the field's box",
    near(upLeft.canvas.x, S.x) &&
      near(upLeft.canvas.y, S.y) &&
      near(upLeft.canvas.w, 10) &&
      near(upLeft.canvas.h, 10) &&
      near(downRight.canvas.right, S.right) &&
      near(downRight.canvas.bottom, S.bottom),
    JSON.stringify({ upLeft: upLeft.canvas, downRight: downRight.canvas })
  )

  // A press on an icon is the icon's own drag, never a band — and the band
  // just selected all three, so the drag carries the whole selection: three
  // outlines on the surface, no rectangle in the field.
  const a = await state(page, 'a')
  await page.mouse.move(a.x + 10, a.y + 10)
  await page.mouse.down()
  await page.mouse.move(a.x + 60, a.y + 40, { steps: 3 })
  const onIcon = await page.evaluate(() => ({
    band: !!document.getElementById('field').shadowRoot.querySelector('canvas.selection-rect'),
    outline: document.getElementById('desk').shadowRoot.querySelectorAll('.drag-surface canvas').length,
  }))
  await page.keyboard.press('Escape')
  await page.mouse.up()
  check(
    "BAND  a press on an icon is the icon's drag, not a band — carrying the selection the band made",
    !onIcon.band && onIcon.outline === 3,
    JSON.stringify(onIcon)
  )
  await page.close()
}

{
  // Inside a window: the field is placed larger than the body, and the band
  // is held inside the body's clip; over the white body its top edge is a
  // dotted line.
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342">
       <vf-window id="win" heading="Docs" width="240" height="150" left="20" top="20">
         <vf-icon-field id="wf" label="Docs" top="0" left="0" width="400" height="300">
           ${icon('id="d" width="64" selectable movable left="10" top="10"', 'D')}
         </vf-icon-field>
       </vf-window>
     </vf-desktop>`,
    { settle: true }
  )
  const body = await page.evaluate(() => {
    const r = document.getElementById('win').shadowRoot.querySelector('.body').getBoundingClientRect()
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }
  })
  await page.mouse.move(body.x + 100, body.y + 60)
  await page.mouse.down()
  await page.mouse.move(body.x + 180, body.y + 110, { steps: 3 })
  const inWin = await band(page, 'wf')
  const png = decodePng(await page.screenshot())
  const y = Math.round(body.y + 60)
  let row = ''
  for (let i = 0; i < 12; i++) {
    const x = Math.round(body.x + 100) + i
    row += isBlack(png, x, y) ? 'B' : isWhite(png, x, y) ? 'W' : '.'
  }
  check(
    'BAND  over a white window body the band’s edge is a dotted black line',
    inWin.has && (row === 'BWBWBWBWBWBW' || row === 'WBWBWBWBWBWB'),
    row
  )
  await page.mouse.move(body.x + 2000, body.y + 2000, { steps: 3 })
  const clipped = await band(page, 'wf')
  await page.mouse.up()
  check(
    "BAND  in a window the band is held inside the body's clip, not the field's larger box",
    near(clipped.canvas.right, body.right) && near(clipped.canvas.bottom, body.bottom),
    JSON.stringify({ canvas: clipped.canvas, body })
  )
  await page.close()
}

{
  // A placed field at an odd offset on the screen: the pen's phase is the
  // screen's, not the field's, so the band still reads as a black line over
  // the dither — a field-relative phase would flip it to paper here.
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342">
       <vf-icon-field id="pf" label="Odd" left="21" top="40" width="200" height="200">
         ${icon('id="e" width="64" selectable movable left="10" top="10"', 'E')}
       </vf-icon-field>
     </vf-desktop>`,
    { settle: true }
  )
  const geo = await page.evaluate(() => {
    const s = document.getElementById('desk').shadowRoot.querySelector('.screen').getBoundingClientRect()
    const f = document.getElementById('pf').getBoundingClientRect()
    return { x: f.x, y: f.y, offset: Math.round(f.x - s.x) + Math.round(f.y - s.y) }
  })
  await page.mouse.move(geo.x + 5, geo.y + 5)
  await page.mouse.down()
  await page.mouse.move(geo.x + 100, geo.y + 100, { steps: 3 })
  const odd = await band(page, 'pf')
  const png = decodePng(await page.screenshot())
  const x = Math.round(odd.canvas.x)
  const y = Math.round(odd.canvas.y)
  const c = (px, py) => (isBlack(png, px, py) ? 'B' : isWhite(png, px, py) ? 'W' : '.')
  let edge = ''
  let dither = ''
  for (let i = 0; i < 12; i++) {
    edge += c(x + i, y)
    dither += c(x + i, y - 3)
  }
  await page.mouse.up()
  check(
    "BAND  in a field at an odd offset on the screen the band's edge still reads as a black line — the phase is the screen's",
    geo.offset % 2 === 1 &&
      edge === 'BBBBBBBBBBBB' &&
      (dither === 'BWBWBWBWBWBW' || dither === 'WBWBWBWBWBWB'),
    `field offset ${geo.offset}, edge ${edge}, dither three rows up ${dither}`
  )
  await page.close()
}

{
  // An unfilled, unplaced field has no box: a press on the desktop there is
  // the desktop's, and no band ever draws.
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342">
       <vf-icon-field id="bare" label="Desktop">
         ${icon('id="e" width="64" selectable movable left="20" top="20"', 'E')}
       </vf-icon-field>
     </vf-desktop>`,
    { settle: true }
  )
  const S = await page.evaluate(() => {
    const r = document.getElementById('desk').shadowRoot.querySelector('.screen').getBoundingClientRect()
    return { x: r.x, y: r.y }
  })
  await page.mouse.move(S.x + 200, S.y + 200)
  await page.mouse.down()
  await page.mouse.move(S.x + 10, S.y + 10, { steps: 3 })
  const none = await band(page, 'bare')
  await page.mouse.up()
  check(
    'BAND  an unfilled field of placed icons has no surface, so no band',
    !none.has && none.selected.e === false,
    JSON.stringify(none)
  )
  await page.close()
}

// ── GROUP ───────────────────────────────────────────────────────────────────
// The selection travels. A, B and C are movable; D is selectable but cannot
// move; `other` is a second field.
{
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342">
       <vf-icon-field id="field" label="Desktop" fill-width fill-height>
         ${icon('id="a" width="64" selectable movable left="20" top="20"', 'A')}
         ${icon('id="b" width="64" selectable movable left="120" top="20"', 'B')}
         ${icon('id="c" width="64" selectable movable left="20" top="200"', 'C')}
         ${icon('id="d" width="64" selectable left="220" top="20"', 'D')}
       </vf-icon-field>
       <vf-icon-field id="other" label="Other"></vf-icon-field>
     </vf-desktop>`,
    { settle: true }
  )
  await record(page)
  const S = await page.evaluate(() => {
    const r = document.getElementById('desk').shadowRoot.querySelector('.screen').getBoundingClientRect()
    return { x: r.x, y: r.y, right: r.right }
  })
  const where = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('vf-icon')].map((i) => [
          i.id,
          { left: i.left, top: i.top, selected: i.selected, field: i.parentElement.id },
        ])
      )
    )
  const outlines = () =>
    page.evaluate(() =>
      [...document.getElementById('desk').shadowRoot.querySelectorAll('.drag-surface canvas')].map(
        (c) => {
          const r = c.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }
      )
    )
  const iconsOf = async (type) => (await log(page)).find((e) => e.type === type)?.icons

  // Select A, B and D (Shift adds), then drag A by (30, 40) and hold.
  await page.locator('#a').click()
  await page.locator('#b').click({ modifiers: ['Shift'] })
  await page.locator('#d').click({ modifiers: ['Shift'] })
  const start = await where()
  const aRect = await state(page, 'a')
  const bRect = await state(page, 'b')
  await clearLog(page)
  await pressAndMove(page, 'a', 30, 40)
  const mid = await outlines()
  check(
    'GROUP  a drag on a selected icon outlines every selected movable icon of its field',
    mid.length === 2 &&
      mid.some((o) => near(o.x, aRect.x + 30) && near(o.y, aRect.y + 40)) &&
      mid.some((o) => near(o.x, bRect.x + 30) && near(o.y, bRect.y + 40)),
    JSON.stringify(mid)
  )
  check(
    'GROUP  vf-drag-start and vf-drag carry the set, the leader first, the immovable one left out',
    JSON.stringify(await iconsOf('vf-drag-start')) === '["a","b"]' &&
      JSON.stringify(await iconsOf('vf-drag')) === '["a","b"]',
    `${await iconsOf('vf-drag-start')} / ${await iconsOf('vf-drag')}`
  )
  await page.mouse.up()
  const dropped = await where()
  check(
    'GROUP  the drop moves each member by the same delta and nothing else',
    dropped.a.left === start.a.left + 30 &&
      dropped.a.top === start.a.top + 40 &&
      dropped.b.left === start.b.left + 30 &&
      dropped.b.top === start.b.top + 40 &&
      dropped.c.left === start.c.left &&
      dropped.d.left === start.d.left &&
      dropped.a.selected &&
      dropped.b.selected &&
      (await outlines()).length === 0,
    JSON.stringify(dropped)
  )
  check(
    'GROUP  vf-drop carries the set too',
    JSON.stringify(await iconsOf('vf-drop')) === '["a","b"]'
  )

  // A plain press on a member keeps the selection (that is what let the drag
  // carry it); a click released with no drag collapses it to that icon.
  const aNow0 = await state(page, 'a')
  await page.mouse.move(aNow0.x + 10, aNow0.y + 10)
  await page.mouse.down()
  const pressed = await where()
  await page.mouse.up()
  const clicked = await where()
  check(
    'GROUP  a plain press on a selected member keeps the selection; the click’s release collapses it to that icon',
    pressed.a.selected &&
      pressed.b.selected &&
      pressed.d.selected &&
      clicked.a.selected &&
      clicked.b.selected === false &&
      clicked.d.selected === false,
    JSON.stringify({ pressed: [pressed.a.selected, pressed.b.selected], clicked: [clicked.a.selected, clicked.b.selected] })
  )
  await page.locator('#b').click({ modifiers: ['Shift'] })

  // The group clamps as a whole: dragged hard right, it stops when B meets
  // the edge, and A keeps its distance from B.
  await pressAndMove(page, 'a', 4000, 0)
  await page.mouse.up()
  const clamped = await where()
  const bMax = 512 - 64
  check(
    'GROUP  the drop clamps the delta for the group as a whole — the outermost member meets the edge, the arrangement is kept',
    clamped.b.left === bMax && clamped.a.left === bMax - (start.b.left - start.a.left),
    `a ${clamped.a.left}, b ${clamped.b.left} (b max ${bMax})`
  )

  // Escape mid-drag: every outline goes, nothing moves.
  await pressAndMove(page, 'a', -100, 50)
  await page.keyboard.press('Escape')
  const afterEsc = await outlines()
  await page.mouse.up()
  const held = await where()
  check(
    'GROUP  Escape takes every outline down and writes nothing for anyone',
    afterEsc.length === 0 && held.a.left === clamped.a.left && held.b.left === clamped.b.left,
    JSON.stringify({ outlines: afterEsc.length, a: held.a, b: held.b })
  )

  // A cancelled drop writes nothing for any member.
  await page.evaluate(() => document.addEventListener('vf-drop', (e) => e.preventDefault(), { once: true }))
  await pressAndMove(page, 'a', -100, 50)
  await page.mouse.up()
  const kept = await where()
  check(
    'GROUP  a drop cancelled with preventDefault() writes nothing for any member',
    kept.a.left === clamped.a.left && kept.b.left === clamped.b.left && kept.a.top === clamped.a.top,
    JSON.stringify({ a: kept.a, b: kept.b })
  )

  // A handler files the whole set.
  await page.evaluate(() =>
    document.addEventListener(
      'vf-drop',
      (e) => {
        e.preventDefault()
        const other = document.getElementById('other')
        e.detail.icons.forEach((icon, i) => {
          other.append(icon)
          icon.left = 8 + i * 80
          icon.top = 8
        })
      },
      { once: true }
    )
  )
  await pressAndMove(page, 'a', -100, 50)
  await page.mouse.up()
  await page.evaluate(() => Promise.all([...document.querySelectorAll('vf-icon')].map((i) => i.updateComplete)))
  const filed = await where()
  check(
    'GROUP  a handler files the whole set, each still selected',
    filed.a.field === 'other' &&
      filed.b.field === 'other' &&
      filed.a.selected &&
      filed.b.selected &&
      filed.a.left === 8 &&
      filed.b.left === 88 &&
      filed.c.field === 'field',
    JSON.stringify(filed)
  )

  // A press on an unselected icon makes it the selection, so it drags alone.
  await clearLog(page)
  const cBefore = (await where()).c
  await pressAndMove(page, 'c', 30, 30)
  const alone = await outlines()
  await page.mouse.up()
  const cAfter = await where()
  check(
    'GROUP  an unselected icon pressed becomes the selection and drags alone',
    alone.length === 1 &&
      JSON.stringify(await iconsOf('vf-drop')) === '["c"]' &&
      cAfter.c.left === cBefore.left + 30 &&
      cAfter.a.left === filed.a.left &&
      cAfter.a.selected === false,
    JSON.stringify({ outlines: alone.length, icons: await iconsOf('vf-drop'), a: cAfter.a })
  )

  // A selected icon in ANOTHER field stays: Shift-click A (C stays selected,
  // in its own field), drag A — only A travels.
  await page.locator('#a').click({ modifiers: ['Shift'] })
  await clearLog(page)
  const both = await where()
  await pressAndMove(page, 'a', 20, 20)
  await page.mouse.up()
  const perField = await where()
  check(
    'GROUP  the set is the field’s: a selected icon in another field stays where it is',
    both.a.selected &&
      both.c.selected &&
      JSON.stringify(await iconsOf('vf-drop')) === '["a"]' &&
      perField.a.left === both.a.left + 20 &&
      perField.c.left === both.c.left,
    JSON.stringify({ icons: await iconsOf('vf-drop'), c: perField.c })
  )

  // A Shift press that deselects the pressed icon drags it alone; the rest
  // of the selection stays. B is selected beside A in `other`.
  await page.locator('#b').click({ modifiers: ['Shift'] })
  await clearLog(page)
  const pre = await where()
  const aNow = await state(page, 'a')
  await page.keyboard.down('Shift')
  await page.mouse.move(aNow.x + 10, aNow.y + 10)
  await page.mouse.down()
  await page.keyboard.up('Shift')
  await page.mouse.move(aNow.x + 40, aNow.y + 30, { steps: 3 })
  const shiftMid = await outlines()
  await page.mouse.up()
  const post = await where()
  check(
    'GROUP  a Shift press that deselects the pressed icon drags it alone — the rest stay',
    pre.a.selected &&
      pre.b.selected &&
      shiftMid.length === 1 &&
      JSON.stringify(await iconsOf('vf-drop')) === '["a"]' &&
      post.a.selected === false &&
      post.a.left === pre.a.left + 30 &&
      post.b.left === pre.b.left &&
      post.b.selected,
    JSON.stringify({ outlines: shiftMid.length, icons: await iconsOf('vf-drop'), a: post.a, b: post.b })
  )
  await page.close()
}

// ── WALK ────────────────────────────────────────────────────────────────────
// A page moves an icon the way a drag moves it: the outline travels on the
// desktop's surface to where the icon will land, and the icon lands when it
// arrives. A field walks its icons one at a time.
const WALK_DESK = `
  <vf-desktop id="desk" width="512" height="342">
    <vf-icon-field id="field" label="Desktop" fill-width fill-height>
      ${icon('id="a" width="64" selectable movable left="16" top="24"', 'A')}
      ${icon('id="b" width="64" selectable movable left="16" top="104"', 'B')}
      ${icon('id="c" width="64" selectable left="16" top="184"', 'C')}
    </vf-icon-field>
  </vf-desktop>`

/** Placement and drag events reaching the document, in order. */
const recordWalk = (page) =>
  page.evaluate(() => {
    globalThis.__walk = []
    for (const type of ['vf-placement-change', 'vf-drag-start', 'vf-drag', 'vf-drop', 'vf-drag-cancel']) {
      document.addEventListener(type, (e) => globalThis.__walk.push({ type, id: e.target.id }))
    }
  })
const walkLog = (page) => page.evaluate(() => globalThis.__walk)
const clearWalkLog = (page) => page.evaluate(() => void (globalThis.__walk = []))
const placements = (log, id) =>
  log.filter((e) => e.type === 'vf-placement-change' && e.id === id).length
const dragEvents = (log) => log.filter((e) => e.type !== 'vf-placement-change').length

/**
 * One sample of the walk: the canvases on the desktop's surface as offsets
 * from it in system px, the three icons' stated pairs and frame x, and
 * whether the page's `__p` has settled.
 */
const walkSample = (page) =>
  page.evaluate(() => {
    const desk = document.getElementById('desk')
    const surface = desk.shadowRoot.querySelector('.drag-surface')
    const r = surface.getBoundingClientRect()
    const scale = parseFloat(getComputedStyle(desk).getPropertyValue('--vf-scale'))
    const canvases = [...surface.querySelectorAll('canvas')].map((c) => {
      const b = c.getBoundingClientRect()
      return { x: (b.x - r.x) / scale, y: (b.y - r.y) / scale }
    })
    const where = Object.fromEntries(
      ['a', 'b', 'c'].map((id) => {
        const el = document.getElementById(id)
        return [
          id,
          el
            ? { left: el.left, top: el.top, x: el.shadowRoot.querySelector('.frame').getBoundingClientRect().x }
            : null,
        ]
      })
    )
    return { settled: globalThis.__settled, result: globalThis.__result, canvases, where }
  })

/** Sample every ~15 ms until the page's walk settles (or a deadline). */
async function sampleWalk(page, ms = 5000) {
  const samples = []
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const s = await walkSample(page)
    samples.push(s)
    if (s.settled) break
    await page.waitForTimeout(15)
  }
  return samples
}

/** Put the three icons back at the fixture's pairs. */
const resetWalk = (page) =>
  page.evaluate(() => {
    const at = { a: [16, 24], b: [16, 104], c: [16, 184] }
    for (const [id, [left, top]] of Object.entries(at)) {
      const el = document.getElementById(id)
      el.left = left
      el.top = top
    }
  })

const whole = (v) => Math.abs(v - Math.round(v)) < 1e-6

{
  const page = await build(WALK_DESK, { settle: true })
  await recordWalk(page)
  const scale = (await state(page, 'a')).scale

  // moveTo: the drop's write, on an icon that is not movable.
  const c = await page.evaluate(() => {
    const el = document.getElementById('c')
    el.moveTo(600, 400)
    return { left: el.left, top: el.top, w: el.offsetWidth, h: el.offsetHeight }
  })
  await settle(page)
  const cLog = await walkLog(page)
  check(
    'WALK  moveTo clamps whole at the raster, announces once, and needs no movable',
    c.left === 512 - Math.round(c.w / scale) &&
      c.top === 342 - Math.round(c.h / scale) &&
      placements(cLog, 'c') === 1 &&
      dragEvents(cLog) === 0,
    JSON.stringify({ c, log: cLog })
  )
  await resetWalk(page)
  await settle(page)
  await clearWalkLog(page)

  // dragTo: a long move, sampled while it travels.
  await page.evaluate(() => {
    globalThis.__settled = false
    globalThis.__result = undefined
    globalThis.__p = document
      .getElementById('a')
      .dragTo(400, 24)
      .then((v) => {
        globalThis.__settled = true
        globalThis.__result = v
      })
  })
  const a0 = await state(page, 'a')
  const travel = await sampleWalk(page)
  const mid = travel.filter((s) => !s.settled)
  const shown = mid.filter((s) => s.canvases.length === 1)
  const last = travel[travel.length - 1]
  const xs = shown.map((s) => s.canvases[0].x)
  check(
    'WALK  dragTo: one canvas on the surface mid-travel, whole system px from it, from the origin toward the landing',
    shown.length >= 3 &&
      mid.every((s) => s.canvases.length <= 1) &&
      xs.every((x) => whole(x) && x >= 16 && x <= 400) &&
      xs.every((x, i) => i === 0 || x >= xs[i - 1]) &&
      xs[xs.length - 1] >= 400 - 16 &&
      shown.every((s) => whole(s.canvases[0].y) && s.canvases[0].y === 24),
    JSON.stringify({ samples: travel.length, xs })
  )
  check(
    'WALK  …the icon stays put until it lands',
    mid.every((s) => s.where.a.left === 16 && near(s.where.a.x, a0.x)),
    JSON.stringify(mid.map((s) => [s.where.a.left, s.where.a.x]))
  )
  const aLog = await walkLog(page)
  check(
    'WALK  …then the canvas is gone, the icon is at the landing, one announce, no drag event, resolved true',
    last.settled &&
      last.result === true &&
      last.canvases.length === 0 &&
      last.where.a.left === 400 &&
      last.where.a.top === 24 &&
      placements(aLog, 'a') === 1 &&
      dragEvents(aLog) === 0,
    JSON.stringify({ last, log: aLog })
  )

  // A target past the raster: the outline travels to the clamped landing.
  await clearWalkLog(page)
  await page.evaluate(() => {
    globalThis.__settled = false
    globalThis.__result = undefined
    globalThis.__p = document
      .getElementById('a')
      .dragTo(600, 24)
      .then((v) => {
        globalThis.__settled = true
        globalThis.__result = v
      })
  })
  const past = await sampleWalk(page)
  const pastXs = past.filter((s) => !s.settled && s.canvases.length === 1).map((s) => s.canvases[0].x)
  const pastLast = past[past.length - 1]
  check(
    'WALK  a target past the raster travels to the clamped landing and lands there',
    pastXs.length >= 2 &&
      pastXs.every((x) => x <= 448) &&
      pastXs[pastXs.length - 1] >= 448 - 16 &&
      pastLast.where.a.left === 448 &&
      pastLast.canvases.length === 0,
    JSON.stringify({ pastXs, a: pastLast.where.a })
  )
  await resetWalk(page)
  await settle(page)

  // dragIcons: three icons, one at a time, in the array's order.
  await page.evaluate(() => {
    globalThis.__settled = false
    globalThis.__result = undefined
    const at = (id) => document.getElementById(id)
    globalThis.__p = document
      .getElementById('field')
      .dragIcons([
        { icon: at('a'), left: 300, top: 24 },
        { icon: at('b'), left: 300, top: 104 },
        { icon: at('c'), left: 300, top: 184 },
      ])
      .then(() => {
        globalThis.__settled = true
      })
  })
  const walk = await sampleWalk(page)
  const walkMid = walk.filter((s) => !s.settled)
  const walkLast = walk[walk.length - 1]
  const moved = (s, id) => s.where[id].left !== 16
  check(
    'WALK  dragIcons walks the icons one at a time in the order given — never two outlines up, B after A has landed, C after B',
    walkMid.every((s) => s.canvases.length <= 1) &&
      walkMid.some((s) => moved(s, 'a') && !moved(s, 'b')) &&
      walkMid.some((s) => moved(s, 'b') && !moved(s, 'c')) &&
      !walkMid.some((s) => moved(s, 'b') && !moved(s, 'a')) &&
      !walkMid.some((s) => moved(s, 'c') && !moved(s, 'b')) &&
      walkLast.settled &&
      walkLast.canvases.length === 0 &&
      ['a', 'b', 'c'].every((id) => walkLast.where[id].left === 300),
    JSON.stringify({
      samples: walk.length,
      trail: walkMid.map((s) => [s.canvases.length, s.where.a.left, s.where.b.left, s.where.c.left]),
    })
  )

  // A press mid-walk finishes it: every icon at its target at once.
  await page.evaluate(() => {
    globalThis.__settled = false
    const at = (id) => document.getElementById(id)
    globalThis.__p = document
      .getElementById('field')
      .dragIcons([
        { icon: at('a'), left: 16, top: 24 },
        { icon: at('b'), left: 16, top: 104 },
        { icon: at('c'), left: 16, top: 184 },
      ])
      .then(() => {
        globalThis.__settled = true
      })
  })
  await page.waitForTimeout(80)
  const beforePress = await walkSample(page)
  await page.mouse.move(600, 60)
  await page.mouse.down()
  await page.mouse.up()
  const afterPress = await walkSample(page)
  check(
    'WALK  a press mid-walk lands every icon at once and resolves',
    !beforePress.settled &&
      beforePress.canvases.length === 1 &&
      afterPress.settled &&
      afterPress.canvases.length === 0 &&
      ['a', 'b', 'c'].every((id) => afterPress.where[id].left === 16),
    JSON.stringify({ beforePress, afterPress })
  )

  // Escape the same.
  await page.evaluate(() => {
    globalThis.__settled = false
    const at = (id) => document.getElementById(id)
    globalThis.__p = document
      .getElementById('field')
      .dragIcons([
        { icon: at('a'), left: 300, top: 24 },
        { icon: at('b'), left: 300, top: 104 },
      ])
      .then(() => {
        globalThis.__settled = true
      })
  })
  await page.waitForTimeout(80)
  const beforeEsc = await walkSample(page)
  await page.keyboard.press('Escape')
  const afterEsc = await walkSample(page)
  check(
    'WALK  Escape mid-walk lands every icon at once and resolves',
    !beforeEsc.settled &&
      beforeEsc.canvases.length === 1 &&
      afterEsc.settled &&
      afterEsc.canvases.length === 0 &&
      afterEsc.where.a.left === 300 &&
      afterEsc.where.b.left === 300,
    JSON.stringify({ beforeEsc, afterEsc })
  )

  // A second call finishes the first.
  const second = await page.evaluate(async () => {
    const field = document.getElementById('field')
    const a = document.getElementById('a')
    const b = document.getElementById('b')
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p1 = field.dragIcons([
      { icon: a, left: 16, top: 24 },
      { icon: b, left: 16, top: 104 },
    ])
    await sleep(60)
    const p2 = field.dragIcons([
      { icon: a, left: 100, top: 24 },
      { icon: b, left: 100, top: 104 },
    ])
    const first = await Promise.race([p1.then(() => 'first'), sleep(20).then(() => 'late')])
    const atOnce = { a: a.left, b: b.left }
    await p2
    return { first, atOnce, a: a.left, b: b.left }
  })
  check(
    "WALK  a second dragIcons finishes the first — its icons at their targets, its promise resolved — then runs",
    second.first === 'first' &&
      second.atOnce.a === 16 &&
      second.atOnce.b === 16 &&
      second.a === 100 &&
      second.b === 100,
    JSON.stringify(second)
  )

  // An icon removed before its turn is skipped.
  const removed = await page.evaluate(async () => {
    const field = document.getElementById('field')
    const [a, b, c] = ['a', 'b', 'c'].map((id) => document.getElementById(id))
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = field.dragIcons([
      { icon: a, left: 16, top: 24 },
      { icon: b, left: 16, top: 104 },
      { icon: c, left: 16, top: 184 },
    ])
    await sleep(30)
    const bBefore = b.left
    b.remove()
    await p
    const result = { a: a.left, b: b.left, bBefore, c: c.left }
    field.append(b)
    return result
  })
  check(
    'WALK  an icon removed before its turn is skipped; the rest land',
    removed.a === 16 && removed.c === 16 && removed.b === removed.bBefore && removed.b !== 16,
    JSON.stringify(removed)
  )
  await resetWalk(page)
  await settle(page)

  // A move to where the icon already is shows nothing and settles at once.
  const tidy = await page.evaluate(async () => {
    const field = document.getElementById('field')
    const desk = document.getElementById('desk')
    const a = document.getElementById('a')
    const b = document.getElementById('b')
    const p = field.dragIcons([
      { icon: a, left: a.left, top: a.top },
      { icon: b, left: b.left, top: b.top },
    ])
    const canvases = desk.shadowRoot.querySelector('.drag-surface').querySelectorAll('canvas').length
    const outcome = await Promise.race([
      p.then(() => 'settled'),
      new Promise((r) => setTimeout(() => r('late'), 10)),
    ])
    return { canvases, outcome }
  })
  check(
    'WALK  a tidy field shows nothing and settles at once',
    tidy.canvases === 0 && tidy.outcome === 'settled',
    JSON.stringify(tidy)
  )

  // moveTo mid-travel finishes the travel.
  const cut = await page.evaluate(async () => {
    const a = document.getElementById('a')
    const desk = document.getElementById('desk')
    const canvases = () => desk.shadowRoot.querySelector('.drag-surface').querySelectorAll('canvas').length
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = a.dragTo(400, 24)
    await sleep(60)
    const during = canvases()
    a.moveTo(100, 24)
    const after = canvases()
    const shown = await Promise.race([p, sleep(20).then(() => 'late')])
    return { during, after, shown, left: a.left }
  })
  check(
    'WALK  moveTo mid-travel finishes it: outline down, the new pair written, the promise resolved',
    cut.during === 1 && cut.after === 0 && cut.shown === true && cut.left === 100,
    JSON.stringify(cut)
  )
  await page.close()
}

{
  // Reduced motion: everything lands at once, no outline, no beat.
  const page = await build(WALK_DESK, { settle: true, reducedMotion: true })
  const reduced = await page.evaluate(async () => {
    const field = document.getElementById('field')
    const desk = document.getElementById('desk')
    const a = document.getElementById('a')
    const b = document.getElementById('b')
    const canvases = () => desk.shadowRoot.querySelector('.drag-surface').querySelectorAll('canvas').length
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = field.dragIcons([
      { icon: a, left: 300, top: 24 },
      { icon: b, left: 300, top: 104 },
    ])
    const during = canvases()
    const outcome = await Promise.race([p.then(() => 'settled'), sleep(5).then(() => 'late')])
    const landed = { a: a.left, b: b.left }
    const shown = await a.dragTo(100, 24)
    return { during, outcome, ...landed, shown, aAfter: a.left, canvases: canvases() }
  })
  check(
    'WALK  under reduced motion every icon lands at once, no outline, no beat, dragTo resolves false',
    reduced.during === 0 &&
      reduced.outcome === 'settled' &&
      reduced.a === 300 &&
      reduced.b === 300 &&
      reduced.shown === false &&
      reduced.aAfter === 100 &&
      reduced.canvases === 0,
    JSON.stringify(reduced)
  )
  await page.close()
}

{
  // No desktop: the canvas draws in the icon's own frame, and the icon lands.
  const page = await build(
    `<div style="position:relative;width:600px;height:400px">
       ${icon('id="solo" width="64" selectable movable left="20" top="20"')}
     </div>`,
    { settle: true }
  )
  const solo = await page.evaluate(async () => {
    const el = document.getElementById('solo')
    const inFrame = () => !!el.shadowRoot.querySelector('canvas.drag-outline')
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = el.dragTo(300, 20)
    await sleep(60)
    const during = inFrame()
    const leftDuring = el.left
    const shown = await p
    return { during, leftDuring, shown, after: inFrame(), left: el.left, top: el.top }
  })
  check(
    "WALK  with no desktop the canvas draws in the icon's frame and the icon still lands",
    solo.during && solo.leftDuring === 20 && solo.shown === true && !solo.after && solo.left === 300 && solo.top === 20,
    JSON.stringify(solo)
  )
  await page.close()
}

// A scrolling plane holds only the origin; any other box holds the icon whole.
const WALK_WIN = `
  <vf-desktop id="desk" width="512" height="342">
    <vf-icon-field label="Desktop"></vf-icon-field>
    <vf-window id="scroller" heading="Scrolls" width="300" height="180" scrollbars="both" left="20" top="40">
      <vf-icon-field id="sf" label="Scrolls" fill-width height="120">
        ${icon('id="s" width="64" selectable movable left="16" top="16"', 'S')}
        ${icon('id="t" width="64" selectable movable left="96" top="16"', 'T')}
      </vf-icon-field>
    </vf-window>
    <vf-window id="plain" heading="Plain" width="180" height="120" left="320" top="40">
      <vf-icon-field label="Plain">
        ${icon('id="p" width="64" selectable movable left="16" top="16"', 'P')}
      </vf-icon-field>
    </vf-window>
  </vf-desktop>`

{
  const page = await build(WALK_WIN, { settle: true })
  const scale = (await state(page, 's')).scale
  const overflowY = () =>
    page.evaluate(() => {
      const win = document.getElementById('scroller')
      const viewport = win.shadowRoot.querySelector('vf-scroll-area')?.shadowRoot.querySelector('.viewport')
      return viewport?.dataset.overflowY ?? null
    })
  const held = await page.evaluate(() => {
    const s = document.getElementById('s')
    const p = document.getElementById('p')
    s.moveTo(-5, -9)
    const origin = { left: s.left, top: s.top }
    s.moveTo(176, 300)
    const past = { left: s.left, top: s.top }
    p.moveTo(400, 400)
    return { origin, past, plain: { left: p.left, top: p.top, w: p.offsetWidth, h: p.offsetHeight } }
  })
  await settle(page)
  check(
    'WALK  in a scrolling plane moveTo holds the origin and nothing else: past the window lands past it, and the viewport overflows',
    held.origin.left === 0 &&
      held.origin.top === 0 &&
      held.past.left === 176 &&
      held.past.top === 300 &&
      (await overflowY()) === 'true',
    JSON.stringify({ held, overflowY: await overflowY() })
  )
  check(
    'WALK  in a plain window body the icon still lands whole',
    held.plain.left === 180 - Math.round(held.plain.w / scale) &&
      held.plain.top === 120 - Math.round(held.plain.h / scale),
    JSON.stringify(held.plain)
  )

  // The hand: a two-icon group dragged past the window's bottom lands past it.
  await page.evaluate(() => {
    const s = document.getElementById('s')
    s.left = 16
    s.top = 16
  })
  await settle(page)
  await page.locator('#s').click()
  await page.locator('#t').click({ modifiers: ['Shift'] })
  await pressAndMove(page, 's', 0, 390)
  await page.mouse.up()
  const group = await page.evaluate(() => {
    const at = (id) => document.getElementById(id)
    return { s: [at('s').left, at('s').top], t: [at('t').left, at('t').top] }
  })
  // 390 CSS px of travel in system px at this page's scale — past the box's
  // bottom (180 − 44 = 136) at any scale the suite runs at.
  const travelled = 16 + Math.round(390 / scale)
  check(
    'WALK  …and so does a hand drag of a group: both members the whole travel past their origin, below the window',
    travelled > 136 &&
      group.s[0] === 16 &&
      group.s[1] === travelled &&
      group.t[0] === 96 &&
      group.t[1] === travelled,
    JSON.stringify({ group, travelled, scale })
  )

  // The walk: dragTo past the box travels there and lands there.
  const walked = await page.evaluate(async () => {
    const s = document.getElementById('s')
    const shown = await s.dragTo(16, 260)
    return { shown, left: s.left, top: s.top }
  })
  check(
    'WALK  …and dragTo walks an icon below the fold',
    walked.shown === true && walked.left === 16 && walked.top === 260,
    JSON.stringify(walked)
  )
  await page.close()
}

await report(browser)
