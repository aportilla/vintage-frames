/**
 * Verifies vf-window behavior — the promises the shell makes to the page
 * around it, beyond what the geometry (verify:archetypes) and a11y
 * (verify:window-a11y) scripts cover.
 *
 *  - RESIZE EVENT: dragging the grow box streams `vf-resize` (detail
 *    `{ width, height, commit }`, whole system px) — one event per size the
 *    drag actually writes, each fired *after* the new box is applied so a
 *    handler that measures reads the resized layout; then exactly one
 *    `commit: true` as the gesture settles, only when it changed the size.
 *    A press that never resizes fires nothing; a programmatic
 *    `width`/`height` write fires nothing. Details stay in system px at
 *    every density (the CSS-px pointer delta is converted, not passed
 *    through).
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:window
 */
import {
  check,
  devicePxPerSystemPxAt,
  launch,
  makeBuild,
  report,
} from './harness.mjs'

const browser = await launch()
const build = makeBuild(browser)

const near = (a, b) => Math.abs(a - b) < 0.001

/** A resizable window in a sized positioning parent, listener on document. */
const PAGE = `
  <div style="position:relative;width:900px;height:700px">
    <vf-window id="win" heading="Grow" top="20" left="20"
               width="240" height="176" resizable></vf-window>
  </div>
`

/**
 * Wire the log: every vf-resize lands in window.vfEvents, with the box the
 * host measured DURING the handler — the "fired after the size is applied"
 * contract is only visible from inside the dispatch.
 */
const instrument = (page) =>
  page.evaluate(() => {
    window.vfEvents = []
    document.addEventListener('vf-resize', (event) => {
      const box = document.getElementById('win').getBoundingClientRect()
      window.vfEvents.push({
        width: event.detail.width,
        height: event.detail.height,
        commit: event.detail.commit,
        measuredW: box.width,
        measuredH: box.height,
        target: event.target.id,
      })
    })
  })

const growCenter = (page) =>
  page.evaluate(() => {
    const box = document
      .getElementById('win')
      .shadowRoot.querySelector('[part=grow-box]')
      .getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })

async function dragGrow(page, dx, dy, steps = 5) {
  const grow = await growCenter(page)
  await page.mouse.move(grow.x, grow.y)
  await page.mouse.down()
  await page.mouse.move(grow.x + dx, grow.y + dy, { steps })
  await page.mouse.up()
}

/* ── RESIZE EVENT ─────────────────────────────────────────────────────────
   dpr 1: scale is 1, so CSS px and system px coincide and the arithmetic in
   the assertions is bare. The dpr-2 pass below is the one that proves the
   detail's unit. */

{
  const page = await build(PAGE)
  await instrument(page)
  await dragGrow(page, 45, 30)

  const events = await page.evaluate(() => window.vfEvents)
  const streams = events.filter((e) => !e.commit)
  const commits = events.filter((e) => e.commit)

  check(
    'grow drag streams vf-resize while it writes sizes',
    streams.length >= 2,
    `${streams.length} stream events for a 5-step drag`
  )
  check(
    'the gesture settles with exactly one commit: true, last',
    commits.length === 1 && events.at(-1)?.commit === true,
    `${commits.length} commits in ${JSON.stringify(events.map((e) => e.commit))}`
  )
  const last = events.at(-1) ?? {}
  check(
    'the final detail is the drag delta in system px',
    last.width === 240 + 45 && last.height === 176 + 30,
    `${last.width}×${last.height}, expected 285×206`
  )
  const props = await page.evaluate(() => {
    const win = document.getElementById('win')
    return { width: win.width, height: win.height }
  })
  check(
    '…and matches the width/height properties the drag wrote',
    props.width === last.width && props.height === last.height,
    `properties ${props.width}×${props.height}`
  )
  check(
    'every event fires after the box is applied (a handler can measure)',
    events.every(
      (e) => near(e.measuredW, e.width) && near(e.measuredH, e.height)
    ),
    events
      .map((e) => `${e.width}×${e.height} measured ${e.measuredW}×${e.measuredH}`)
      .join(', ')
  )
  check(
    'details are whole system px',
    events.every((e) => Number.isInteger(e.width) && Number.isInteger(e.height))
  )
  check(
    'consecutive stream events always differ (no-change moves fire nothing)',
    streams.every(
      (e, i) =>
        i === 0 ||
        e.width !== streams[i - 1].width ||
        e.height !== streams[i - 1].height
    )
  )
  check(
    'the event bubbles composed to the document from the host',
    events.every((e) => e.target === 'win')
  )

  // A press that never changes the size: no stream, no commit.
  await page.evaluate(() => (window.vfEvents = []))
  const grow = await growCenter(page)
  await page.mouse.move(grow.x, grow.y)
  await page.mouse.down()
  await page.mouse.up()
  const idle = await page.evaluate(() => window.vfEvents.length)
  check('a press without a resize fires nothing', idle === 0, `${idle} events`)

  // A programmatic size write: the properties are the API, the event is the
  // gesture's — native semantics, like a value set firing no vf-change.
  const programmatic = await page.evaluate(async () => {
    window.vfEvents = []
    const win = document.getElementById('win')
    win.width = 300
    win.height = 220
    await win.updateComplete
    return window.vfEvents.length
  })
  check(
    'a programmatic width/height write fires nothing',
    programmatic === 0,
    `${programmatic} events`
  )
  await page.close()
}

/* ── RESIZE EVENT, dpr 2 ──────────────────────────────────────────────────
   Scale is 1.5: a 60×30 CSS-px drag is a 40×20 system-px resize, and the
   snap lattice is 2 system px. The detail must arrive converted — a pass at
   dpr 1 alone cannot tell system px from CSS px. */

{
  const dpr = 2
  const scale = devicePxPerSystemPxAt(dpr) / dpr
  const page = await build(PAGE, { dpr })
  await instrument(page)
  await dragGrow(page, 60, 30)

  const events = await page.evaluate(() => window.vfEvents)
  const last = events.at(-1) ?? {}
  check(
    `dpr 2: the detail is in system px (60×30 CSS px reads +40×+20)`,
    last.commit === true && last.width === 240 + 40 && last.height === 176 + 20,
    `${last.width}×${last.height}, expected 280×196`
  )
  check(
    'dpr 2: measuring in the handler reads the applied box, in CSS px',
    events.every(
      (e) =>
        near(e.measuredW, e.width * scale) && near(e.measuredH, e.height * scale)
    ),
    events
      .map((e) => `${e.width}sys measured ${e.measuredW}css`)
      .join(', ')
  )
  await page.close()
}

await report(browser)
