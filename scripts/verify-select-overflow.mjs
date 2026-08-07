/**
 * Verifies `vf-select`'s clamped popup overflow — the System 7 answer to a menu
 * taller than the screen (src/popup-overflow.ts).
 *
 * A popup that doesn't fit is CLIPPED, never scrolled: the panel is drawn once
 * at a whole number of row slots, the edge slot with items beyond it shows a
 * solid arrow instead of a row, and resting the pointer on that arrow rolls the
 * list through the panel one row at a time. The clamp is quantized to the pill
 * lattice, so a clipped popup still opens with its selected row over the closed
 * pill — the thing the old pixel clamp lost. Groups:
 *
 *  - REGRESSION: a list that fits is untouched — no arrows, selected row over
 *    the pill, width hugging the widest option.
 *  - BOTTOM / TOP / BOTH: the clamped geometry in each direction, including
 *    the R ≥ 3 floor on a viewport too short for anything else.
 *  - MECHANICS: hovering an arrow steps immediately then paces itself, the
 *    opposite arrow appears, the arrow retires at the bound — and the panel box
 *    never moves or resizes through any of it.
 *  - GRID: one step moves a row by exactly one row height at dpr 1/2/3.
 *  - PRESS-DRAG: dragging into an arrow zone scrolls and drops the highlight,
 *    the zone reaches past the panel edge, releasing on an arrow commits
 *    nothing, releasing on a revealed row commits it.
 *  - CLICK: an independent click on an arrow does not dismiss; outside does.
 *  - KEYBOARD: the highlight rolls the list at the pickable boundary, End/Home
 *    jump to the ends, type-ahead reaches a clipped row — and focus never
 *    native-scrolls the clip.
 *  - INSETS: --vf-popup-inset-top keeps a clamped panel clear of a menu bar.
 *  - NO SCROLLBAR: the panel computes overflow:hidden and carries no rail.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:select-overflow
 */
import { ORIGIN, check, launch, results } from './harness.mjs'

/** Matches src/motion.ts — the pace a held arrow rolls the list at. */
const MENU_SCROLL_INTERVAL_MS = 66

const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol

const browser = await launch()

const options = (n) =>
  Array.from({ length: n }, (_, i) => `<vf-option value="o${i}">Option ${i}</vf-option>`).join('')

/**
 * A page holding one absolutely-placed popup, so the pill's y is a number the
 * expected geometry can be computed from rather than measured back out of it.
 */
async function build({ count, selected = 0, top = 200, height = 900, dpr = 1, style = '' }) {
  const page = await browser.newPage({
    viewport: { width: 600, height },
    deviceScaleFactor: dpr,
  })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <body style="margin:0;${style}">
       <div style="position:absolute;top:${top}px;left:100px">
         <vf-select id="sel" value="o${selected}">${options(count)}</vf-select>
       </div>`
  )
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  await page.evaluate(() => {
    window.__changes = []
    document
      .getElementById('sel')
      .addEventListener('vf-change', (e) => window.__changes.push(e.detail.value))
  })
  return page
}

const state = (page) =>
  page.evaluate(() => {
    const sel = document.getElementById('sel')
    const sr = sel.shadowRoot
    const panel = sr.querySelector('.panel')
    const rows = sr.querySelector('.rows')
    const up = sr.querySelector('.arrow-slot.up')
    const down = sr.querySelector('.arrow-slot.down')
    const cs = getComputedStyle(panel)
    const r = panel.getBoundingClientRect()
    const pill = sr.querySelector('.control').getBoundingClientRect()
    const opts = [...sel.querySelectorAll('vf-option')]
    return {
      open: panel.classList.contains('open'),
      panel: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom },
      pill: { top: pill.top, left: pill.left, width: pill.width, height: pill.height },
      border: parseFloat(cs.borderTopWidth),
      overflow: cs.overflow,
      scrollTop: panel.scrollTop,
      transform: getComputedStyle(rows).transform,
      up: getComputedStyle(up).display !== 'none',
      down: getComputedStyle(down).display !== 'none',
      scrollClass: panel.className.includes('vf-scroll'),
      rowHeight: opts[0] ? opts[0].getBoundingClientRect().height : 0,
      optionTops: opts.map((o) => o.getBoundingClientRect().top),
      // The scroll integer, read back off the rendered geometry: slot i shows
      // row scroll + i, so a NEGATIVE value is blank rows above the first item.
      scroll: opts[0]
        ? Math.round(
            (r.top + parseFloat(cs.borderTopWidth) - opts[0].getBoundingClientRect().top) /
              opts[0].getBoundingClientRect().height
          )
        : 0,
      active: opts.findIndex((o) => o.hasAttribute('active')),
      value: sel.value,
      changes: window.__changes.slice(),
    }
  })

/** Opens the popup with a quick click on the pill (click-to-open mode). */
async function open(page) {
  const box = await page.evaluate(() => {
    const r = document.getElementById('sel').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.click(box.x, box.y)
  await page.waitForTimeout(50)
  return box
}

/** The centre of a shown arrow slot, in viewport coords. */
const arrowPoint = (page, which) =>
  page.evaluate((w) => {
    const r = document
      .getElementById('sel')
      .shadowRoot.querySelector(`.arrow-slot.${w}`)
      .getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, which)

/* ── REGRESSION: a fitting list is exactly what it always was ─────────────── */
{
  const page = await build({ count: 4, selected: 1 })
  await open(page)
  const s = await state(page)
  check('fitting list: no arrows', !s.up && !s.down)
  check('fitting list: rows are not rolled', s.transform === 'none', s.transform)
  check(
    'fitting list: the selected row still overlays the pill',
    near(s.optionTops[1], s.pill.top + s.border),
    `row ${s.optionTops[1]} vs pill content ${s.pill.top + s.border}`
  )
  check(
    'fitting list: panel is exactly N rows plus both borders',
    near(s.panel.height, 4 * s.rowHeight + 2 * s.border),
    `${s.panel.height} vs ${4 * s.rowHeight + 2 * s.border}`
  )
  check(
    'fitting list: panel hugs the pill (same left, same width)',
    near(s.panel.left, s.pill.left) && near(s.panel.width, s.pill.width)
  )
  check('panel is a clip, never a scroll surface', s.overflow === 'hidden', s.overflow)
  check('panel carries no scrollbar recipe class', !s.scrollClass)
  await page.close()
}

/* ── RESERVED TRAVEL: the blank a slid-up panel opens with ────────────────── */
{
  // The Find File case, to scale: 12 options, the pill low enough that the
  // whole list still fits the screen band but not below the pill. dpr 1 →
  // scale 3 → 48px rows. The panel must keep all 12 slots and slide UP,
  // leaving blank rows above `Option 0` — the exact travel the roll consumes.
  const page = await build({ count: 12, selected: 0, top: 700, height: 900 })
  await open(page)
  const s = await state(page)
  const slots = Math.round((s.panel.height - 2 * s.border) / s.rowHeight)
  check(
    'reserved travel: the panel keeps every slot the list asked for',
    slots === 12,
    `${slots} slots for 12 options`
  )
  check('reserved travel: down arrow only — nothing is hidden above', s.down && !s.up)
  const blank = Math.round((s.optionTops[0] - (s.panel.top + s.border)) / s.rowHeight)
  check(
    'reserved travel: the first item opens below the panel top, leaving blank rows',
    blank > 0,
    `${blank} blank rows`
  )
  check(
    'reserved travel: the selected row still overlays the pill',
    near(s.optionTops[0], s.pill.top + s.border),
    `${s.optionTops[0]} vs ${s.pill.top + s.border}`
  )
  check(
    'reserved travel: the blank is exactly the rows hidden below',
    blank === 12 - (slots - blank),
    `${blank} blank vs ${12 - (slots - blank)} hidden`
  )

  // Roll it all the way: the blank is consumed, the list fills the panel
  // exactly, and BOTH arrows retire — the property the blank exists for.
  const dn = await arrowPoint(page, 'down')
  await page.mouse.move(dn.x, dn.y)
  await page.waitForTimeout(MENU_SCROLL_INTERVAL_MS * (blank + 4) + 300)
  const full = await state(page)
  check(
    'reserved travel: scrolling to the end fills the panel exactly',
    near(full.optionTops[0], full.panel.top + full.border) &&
      near(full.optionTops[11] + full.rowHeight, full.panel.bottom - full.border),
    `first ${full.optionTops[0]} vs ${full.panel.top + full.border}, last ` +
      `${full.optionTops[11] + full.rowHeight} vs ${full.panel.bottom - full.border}`
  )
  check(
    'reserved travel: …and then no arrow is needed at all',
    !full.up && !full.down
  )
  check(
    'reserved travel: the panel box never moved through any of it',
    near(full.panel.top, s.panel.top, 0.0001) &&
      near(full.panel.height, s.panel.height, 0.0001)
  )
  await page.close()
}

/* ── RESERVED TRAVEL, mirrored: the pill high, the blank BELOW ────────────── */
{
  // The same list with a late item selected and the pill near the TOP: the
  // panel now has to slide DOWN, so the strip doesn't reach the last slots and
  // the blank is reserved at the bottom. Rolling UP consumes it. Nothing about
  // the treatment may differ from the other direction.
  const page = await build({ count: 12, selected: 11, top: 60, height: 900 })
  await open(page)
  const s = await state(page)
  const slots = Math.round((s.panel.height - 2 * s.border) / s.rowHeight)
  check(
    'mirrored travel: the panel keeps every slot the list asked for',
    slots === 12,
    `${slots} slots for 12 options`
  )
  check('mirrored travel: up arrow only — nothing is hidden below', s.up && !s.down)
  const blankBelow = Math.round(
    (s.panel.bottom - s.border - (s.optionTops[11] + s.rowHeight)) / s.rowHeight
  )
  check(
    'mirrored travel: the last item opens above the panel bottom, leaving blank rows',
    blankBelow > 0,
    `${blankBelow} blank rows below`
  )
  check(
    'mirrored travel: the selected row still overlays the pill',
    near(s.optionTops[11], s.pill.top + s.border),
    `${s.optionTops[11]} vs ${s.pill.top + s.border}`
  )
  check(
    'mirrored travel: the blank is exactly the rows hidden above',
    blankBelow === s.scroll,
    `${blankBelow} blank vs ${s.scroll} hidden`
  )

  const upPt = await arrowPoint(page, 'up')
  await page.mouse.move(upPt.x, upPt.y)
  await page.waitForTimeout(MENU_SCROLL_INTERVAL_MS * (blankBelow + 4) + 300)
  const full = await state(page)
  check(
    'mirrored travel: scrolling to the start fills the panel exactly',
    near(full.optionTops[0], full.panel.top + full.border) &&
      near(full.optionTops[11] + full.rowHeight, full.panel.bottom - full.border),
    `first ${full.optionTops[0]} vs ${full.panel.top + full.border}, last ` +
      `${full.optionTops[11] + full.rowHeight} vs ${full.panel.bottom - full.border}`
  )
  check('mirrored travel: …and then no arrow is needed at all', !full.up && !full.down)
  check(
    'mirrored travel: the panel box never moved through any of it',
    near(full.panel.top, s.panel.top, 0.0001) &&
      near(full.panel.height, s.panel.height, 0.0001)
  )
  check(
    'mirrored travel: the reserved blank is not somewhere to scroll back to',
    full.scroll === 0,
    `scroll ${full.scroll}, opened at ${s.scroll}`
  )
  await page.close()
}

/* ── BOTTOM overflow: a list too long for the band at all ─────────────────── */
{
  // dpr 1 → scale 3 → 48px rows, 3px border, 12px insets. 60 rows want 2886px
  // against an 876px band, so the panel settles at the band's capacity and
  // keeps a down arrow no matter how far it is rolled.
  const page = await build({ count: 60, selected: 0, top: 200, height: 900 })
  await open(page)
  const s = await state(page)
  const slots = Math.round((s.panel.height - 2 * s.border) / s.rowHeight)
  check('bottom overflow: down arrow only', s.down && !s.up)
  check(
    'bottom overflow: the panel fills the band it was given',
    slots === 17 || slots === 18,
    `${slots} slots`
  )
  check(
    'bottom overflow: the panel sits inside the band',
    s.panel.top >= 12 - 0.01 && s.panel.bottom <= 888 + 0.01,
    `[${s.panel.top}, ${s.panel.bottom}] in [12, 888]`
  )
  check(
    'bottom overflow: the selected row still overlays the pill',
    near(s.optionTops[0], s.pill.top + s.border),
    `${s.optionTops[0]} vs ${s.pill.top + s.border}`
  )
  // The arrow covers the row in its slot, so that row is not pickable and a
  // pointer resting there highlights nothing at all.
  check('bottom overflow: the selected row opens highlighted', s.active === 0)
  const dn = await arrowPoint(page, 'down')
  await page.mouse.move(dn.x, dn.y)
  await page.waitForTimeout(20)
  const covered = await state(page)
  check(
    'bottom overflow: a pointer on the arrow highlights nothing',
    covered.active === -1,
    `active ${covered.active}`
  )
  await page.close()
}

/* ── TOP overflow ─────────────────────────────────────────────────────────── */
{
  // Selecting the last of 20 with the pill low on the screen pulls the ideal
  // top far above the band; the clamp gives ground three WHOLE rows.
  const page = await build({ count: 20, selected: 19, top: 800, height: 900 })
  await open(page)
  const s = await state(page)
  check('top overflow: up arrow only', s.up && !s.down)
  check(
    'top overflow: panel top clears the inset',
    s.panel.top >= 12 - 0.01 && s.panel.top < 12 + s.rowHeight,
    `top ${s.panel.top}`
  )
  check(
    'top overflow: the clamp landed on the lattice — the selected row still overlays the pill',
    near(s.optionTops[19], s.pill.top + s.border),
    `row ${s.optionTops[19]} vs pill content ${s.pill.top + s.border}`
  )
  check(
    'top overflow: the list opens rolled, not re-anchored',
    s.transform !== 'none',
    s.transform
  )
  await page.close()
}

/* ── BOTH arrows, and the R ≥ 3 floor ─────────────────────────────────────── */
{
  const page = await build({ count: 20, selected: 10, top: 150, height: 300 })
  await open(page)
  const s = await state(page)
  check('short viewport: both arrows at once', s.up && s.down)
  check(
    'short viewport: the selected row is still over the pill',
    near(s.optionTops[10], s.pill.top + s.border),
    `row ${s.optionTops[10]} vs pill content ${s.pill.top + s.border}`
  )
  check(
    'short viewport: the selected row is pickable, not under an arrow',
    s.active === 10,
    `active ${s.active}`
  )
  await page.close()
}
{
  // A band with room for one row: the floor takes three anyway, so there is
  // always something between the two arrows to pick.
  const page = await build({ count: 20, selected: 0, top: 100, height: 200 })
  await open(page)
  const s = await state(page)
  check(
    'degenerate viewport: R floors at 3 slots even past the inset',
    near((s.panel.height - 2 * s.border) / s.rowHeight, 3),
    `${(s.panel.height - 2 * s.border) / s.rowHeight} slots`
  )
  await page.close()
}

/* ── MECHANICS: the roll, and the box that never moves ────────────────────── */
{
  const page = await build({ count: 60, selected: 0, top: 200, height: 900 })
  await open(page)
  const before = await state(page)
  const slots = Math.round((before.panel.height - 2 * before.border) / before.rowHeight)
  // The whole travel: from wherever it opened, up to the last row in the last
  // slot. With reserved blank above, the opening scroll is negative, so this is
  // MORE than the naive N − R.
  const travel = 60 - slots - before.scroll

  const dn = await arrowPoint(page, 'down')
  await page.mouse.move(dn.x, dn.y)
  await page.waitForTimeout(20)
  const first = await state(page)
  check(
    'hovering the down arrow steps immediately',
    near(first.optionTops[0], before.optionTops[0] - before.rowHeight),
    `moved ${before.optionTops[0] - first.optionTops[0]} of ${before.rowHeight}`
  )
  check(
    'the panel box did not move or resize',
    near(first.panel.top, before.panel.top) && near(first.panel.height, before.panel.height)
  )
  check(
    'the up arrow stays away until a row is genuinely hidden above',
    first.up === (first.scroll > 0),
    `scroll ${first.scroll}, up ${first.up}`
  )

  await page.waitForTimeout(MENU_SCROLL_INTERVAL_MS * 3 + 40)
  const paced = await state(page)
  const stepsSoFar = paced.scroll - before.scroll
  check(
    'it keeps stepping while the pointer rests, one row at a time',
    stepsSoFar >= 3 && stepsSoFar <= 7 && near(paced.optionTops[0] % 1, before.optionTops[0] % 1),
    `${stepsSoFar} steps`
  )

  // Rest until the bound.
  await page.waitForTimeout(MENU_SCROLL_INTERVAL_MS * (travel + 4) + 400)
  const end = await state(page)
  check(
    'at the bound the down arrow retires and the last row is in view',
    !end.down && end.up && near(end.optionTops[59], end.panel.bottom - end.border - end.rowHeight),
    `down=${end.down}`
  )
  check(
    'the roll stopped exactly at the end of its travel',
    end.scroll === 60 - slots,
    `scroll ${end.scroll} of ${60 - slots} (travelled ${end.scroll - before.scroll} of ${travel})`
  )
  check(
    'the panel box is byte-identical to where it opened',
    near(end.panel.top, before.panel.top, 0.0001) &&
      near(end.panel.left, before.panel.left, 0.0001) &&
      near(end.panel.height, before.panel.height, 0.0001) &&
      near(end.panel.width, before.panel.width, 0.0001),
    `${JSON.stringify(end.panel)} vs ${JSON.stringify(before.panel)}`
  )
  check('the panel never natively scrolled', end.scrollTop === 0, `scrollTop ${end.scrollTop}`)

  // …and back up the other way. It stops at row 0 in slot 0, NOT back at the
  // opening blank: the up arrow means "rows are hidden above", and once the
  // list has rolled out of its reserved travel there are none.
  const upPt = await arrowPoint(page, 'up')
  await page.mouse.move(upPt.x, upPt.y)
  await page.waitForTimeout(MENU_SCROLL_INTERVAL_MS * (travel + 8) + 400)
  const home = await state(page)
  check(
    'the up arrow rolls back to the top and retires there',
    !home.up && home.down && near(home.optionTops[0], home.panel.top + home.border),
    `up=${home.up} scroll=${home.scroll} row0=${home.optionTops[0]} vs ${home.panel.top + home.border}`
  )
  check(
    'the reserved blank is a starting position, not somewhere to scroll back to',
    home.scroll === 0,
    `scroll ${home.scroll}, opened at ${before.scroll}`
  )
  await page.close()
}

/* ── GRID: a step is exactly one row at every density ─────────────────────── */
// 60 options, because a higher density means a SMALLER row: at dpr 3 the scale
// is 1 and 20 rows would fit the viewport with room to spare, testing nothing.
for (const dpr of [1, 2, 3]) {
  const page = await build({ count: 60, selected: 0, top: 200, height: 900, dpr })
  await open(page)
  const before = await state(page)
  check(`dpr ${dpr}: the list overflows (the premise of the two checks below)`, before.down)
  const dn = await arrowPoint(page, 'down')
  await page.mouse.move(dn.x, dn.y)
  await page.waitForTimeout(20)
  const after = await state(page)
  const moved = before.optionTops[3] - after.optionTops[3]
  check(
    `dpr ${dpr}: one step moves a row by exactly one row height`,
    near(moved, before.rowHeight, 0.001),
    `${moved} vs ${before.rowHeight}`
  )
  check(
    `dpr ${dpr}: rolled rows stay on the device grid`,
    near((moved * dpr) % 1, 0, 0.001) || near((moved * dpr) % 1, 1, 0.001),
    `${moved * dpr} device px`
  )
  await page.close()
}

/* ── PRESS-DRAG ───────────────────────────────────────────────────────────── */
{
  const page = await build({ count: 20, selected: 0, top: 200, height: 900 })
  const pill = await open(page)
  const start = await state(page)
  const dn = await arrowPoint(page, 'down')

  // Press the pill, drag down onto a row, then into the arrow zone.
  await page.mouse.move(pill.x, pill.y)
  await page.mouse.down()
  await page.mouse.move(pill.x, start.optionTops[2] + start.rowHeight / 2)
  await page.waitForTimeout(20)
  const onRow = await state(page)
  check('press-drag: a row under the pointer highlights', onRow.active === 2, `active ${onRow.active}`)

  await page.mouse.move(dn.x, dn.y)
  await page.waitForTimeout(20)
  const inZone = await state(page)
  check(
    'press-drag into the arrow zone scrolls and drops the highlight',
    inZone.active === -1 && inZone.optionTops[0] < onRow.optionTops[0],
    `active ${inZone.active}`
  )

  // Past the panel's own edge, still scrolling — the screen-edge slam.
  const beyond = await state(page)
  await page.mouse.move(dn.x, beyond.panel.bottom + 40)
  await page.waitForTimeout(MENU_SCROLL_INTERVAL_MS * 2 + 40)
  const past = await state(page)
  check(
    'press-drag: the arrow zone reaches past the panel edge',
    past.optionTops[0] < inZone.optionTops[0]
  )

  // Back onto a row: tracking resumes. Aim for the panel's middle — near the
  // top a slot may still be reserved blank or under the up arrow.
  await page.mouse.move(pill.x, past.panel.top + past.panel.height / 2)
  await page.waitForTimeout(20)
  const back = await state(page)
  check('press-drag: coming back onto a row re-highlights', back.active !== -1, `active ${back.active}`)

  // Release over the down arrow: no pick.
  const dn2 = await arrowPoint(page, 'down')
  await page.mouse.move(dn2.x, dn2.y)
  await page.waitForTimeout(20)
  await page.mouse.up()
  await page.waitForTimeout(60)
  const released = await state(page)
  check(
    'press-drag: releasing over an arrow closes with no change',
    !released.open && released.changes.length === 0,
    `changes ${JSON.stringify(released.changes)}`
  )
  await page.close()
}
{
  // A drag that ends on a row REVEALED by the arrow commits that row.
  const page = await build({ count: 20, selected: 0, top: 200, height: 900 })
  const pill = await open(page)
  const dn = await arrowPoint(page, 'down')
  await page.mouse.move(pill.x, pill.y)
  await page.mouse.down()
  await page.mouse.move(dn.x, dn.y)
  await page.waitForTimeout(MENU_SCROLL_INTERVAL_MS * 4 + 60)
  const rolled = await state(page)
  await page.mouse.move(pill.x, rolled.panel.top + rolled.panel.height / 2)
  await page.waitForTimeout(20)
  const target = (await state(page)).active
  await page.mouse.up()
  await page.waitForTimeout(400)
  const done = await state(page)
  check(
    'press-drag: releasing on a revealed row commits it',
    done.changes.length === 1 && done.value === `o${target}` && target > 0,
    `target ${target}, changes ${JSON.stringify(done.changes)}`
  )
  await page.close()
}

/* ── CLICK MODE ───────────────────────────────────────────────────────────── */
{
  // The arrow drawn UNDER the click that opened the panel. A pill within a row
  // of a screen edge lands one there routinely, and a pointer that never moved
  // gets no `pointerenter` — so without the pointerup hand-off the list would
  // just sit there while the user waits on an arrow that looks live.
  const page = await build({ count: 12, selected: 11, top: 36, height: 900 })
  const pill = await open(page)
  const opened = await state(page)
  const onArrow = await page.evaluate((p) => {
    const r = document
      .getElementById('sel')
      .shadowRoot.querySelector('.arrow-slot.up')
      .getBoundingClientRect()
    return p.y >= r.top && p.y < r.bottom && p.x >= r.left && p.x < r.right
  }, pill)
  check(
    'the opening click landed on the up arrow (the premise of the check below)',
    onArrow && opened.up,
    `onArrow ${onArrow}, up ${opened.up}`
  )
  await page.waitForTimeout(MENU_SCROLL_INTERVAL_MS * 3 + 60)
  const rolling = await state(page)
  check(
    'an arrow drawn under a motionless pointer still starts rolling',
    rolling.scroll < opened.scroll,
    `scroll ${rolling.scroll}, opened at ${opened.scroll}`
  )
  await page.close()
}
{
  const page = await build({ count: 20, selected: 0, top: 200, height: 900 })
  await open(page)
  const dn = await arrowPoint(page, 'down')
  await page.mouse.click(dn.x, dn.y)
  await page.waitForTimeout(60)
  const s = await state(page)
  check('click mode: clicking an arrow does not dismiss the list', s.open)
  check('click mode: clicking an arrow commits nothing', s.changes.length === 0)
  await page.mouse.click(20, 20)
  await page.waitForTimeout(60)
  check('click mode: an outside click still dismisses', !(await state(page)).open)
  await page.close()
}

/* ── KEYBOARD ─────────────────────────────────────────────────────────────── */
{
  const page = await build({ count: 20, selected: 0, top: 200, height: 900 })
  await page.evaluate(() => document.getElementById('sel').focus())
  await page.keyboard.press('ArrowDown') // opens
  await page.waitForTimeout(60)
  const opened = await state(page)
  const slots = Math.round((opened.panel.height - 2 * opened.border) / opened.rowHeight)
  // The last row the panel can highlight without rolling: the slot before the
  // down arrow, counted from wherever the list opened (which may be inside its
  // reserved blank, i.e. a negative scroll).
  const lastPickable = opened.scroll + slots - 2

  // Walk to it: no roll yet.
  for (let i = 0; i < lastPickable; i += 1) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(40)
  const atEdge = await state(page)
  check(
    'keyboard: walking within the pickable rows does not roll the list',
    near(atEdge.optionTops[0], opened.optionTops[0]) && atEdge.active === lastPickable,
    `active ${atEdge.active}, wanted ${lastPickable}`
  )
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(40)
  const rolled = await state(page)
  check(
    'keyboard: the next step past the boundary rolls one row',
    near(rolled.optionTops[0], opened.optionTops[0] - opened.rowHeight) &&
      rolled.active === lastPickable + 1,
    `moved ${opened.optionTops[0] - rolled.optionTops[0]}, active ${rolled.active}`
  )
  check('keyboard: the panel box held still', near(rolled.panel.top, opened.panel.top))

  await page.keyboard.press('End')
  await page.waitForTimeout(40)
  const end = await state(page)
  check(
    'keyboard: End lands on the last row with the down arrow retired',
    end.active === 19 && !end.down && end.up,
    `active ${end.active}, up ${end.up}, down ${end.down}`
  )
  await page.keyboard.press('Home')
  await page.waitForTimeout(40)
  const home = await state(page)
  check(
    'keyboard: Home mirrors it — first row, up arrow retired, list rolled home',
    home.active === 0 && !home.up && home.down && home.transform === 'none',
    `active ${home.active}, up ${home.up}, transform ${home.transform}`
  )
  check('keyboard: focus never native-scrolled the clip', home.scrollTop === 0)
  await page.close()
}
{
  // Type-ahead to a row that is off-panel must roll it into a pickable slot.
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  const letters = 'abcdefghijklmnopqrst'
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><body style="margin:0">
     <div style="position:absolute;top:200px;left:100px">
       <vf-select id="sel" value="a">${[...letters]
         .map((c) => `<vf-option value="${c}">${c.toUpperCase()}ption</vf-option>`)
         .join('')}</vf-select>
     </div>`
  )
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => {
    window.__changes = []
  })
  await page.evaluate(() => document.getElementById('sel').focus())
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(60)
  await page.keyboard.press('t') // the 20th option, well past the clip
  await page.waitForTimeout(60)
  const s = await state(page)
  check(
    'keyboard: type-ahead rolls a clipped row into a pickable slot',
    s.active === 19 &&
      s.optionTops[19] >= s.panel.top + s.border - 0.01 &&
      s.optionTops[19] + s.rowHeight <= s.panel.bottom - s.border + 0.01,
    `active ${s.active}, row top ${s.optionTops[19]} in [${s.panel.top}, ${s.panel.bottom}]`
  )
  await page.close()
}

/* ── INSETS ───────────────────────────────────────────────────────────────── */
{
  // 24 system px of top reserve — a page with a vf-menu-bar. At scale 3 that is
  // 72 CSS px, and no clamped panel may start above it.
  const page = await build({
    count: 20,
    selected: 19,
    top: 800,
    height: 900,
    style: '--vf-popup-inset-top:24px',
  })
  await open(page)
  const s = await state(page)
  check(
    '--vf-popup-inset-top keeps a clamped panel clear of the reserve',
    s.panel.top >= 72 - 0.01,
    `top ${s.panel.top}, reserve 72`
  )
  check(
    'the inset clamp is still quantized — the selected row stays on the pill',
    near(s.optionTops[19], s.pill.top + s.border),
    `${s.optionTops[19]} vs ${s.pill.top + s.border}`
  )
  await page.close()
}
{
  // The open-time corner: the pill sits close enough to the reserve that the
  // selected row would open *under* the up arrow. ensureVisible gives one row,
  // trading the pill overlay for a row the user can actually see and pick.
  // Opened from the keyboard so no pointer is resting anywhere — this is about
  // the geometry, not the hover contract.
  const page = await build({
    count: 20,
    selected: 4,
    top: 200,
    height: 900,
    style: '--vf-popup-inset-top:60px',
  })
  await page.evaluate(() => document.getElementById('sel').focus())
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(80)
  const s = await state(page)
  check(
    'open-time corner: the selected row lands in a pickable slot, not under an arrow',
    s.active === 4 && s.optionTops[4] >= s.panel.top + s.border + (s.up ? s.rowHeight : 0) - 0.01,
    `active ${s.active}, row ${s.optionTops[4]}, panel ${s.panel.top}, up ${s.up}`
  )
  await page.close()
}

/* ── ACCESSIBILITY: the clip is presentation, the list is not ─────────────── */
{
  // Clipping an option is a visual fact. The rolling strip that does it must
  // not stand between the listbox and the options it owns (hence its
  // role="presentation"), and the rows scrolled out of view must stay in the
  // tree — a native <select> exposes its whole option list too.
  const page = await build({ count: 20, selected: 0, top: 200, height: 900 })
  await open(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const listbox = nodes.find((n) => n.role?.value === 'listbox')
  const childIds = listbox?.childIds ?? []
  const options = nodes.filter((n) => n.role?.value === 'option')
  check(
    'a11y: all 20 options are in the tree, clipped ones included',
    options.length === 20,
    `${options.length} options`
  )
  check(
    'a11y: the rolling strip does not come between the listbox and its options',
    options.length > 0 && options.every((o) => childIds.includes(o.nodeId)),
    `${childIds.length} direct children`
  )
  check(
    'a11y: the aria-hidden arrow slots add nothing to the listbox',
    childIds.length === 20,
    `${childIds.length} direct children`
  )
  await page.close()
}

await browser.close()
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
