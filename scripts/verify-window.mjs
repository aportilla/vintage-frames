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
 *  - SIZE RECT: `min-width`/`max-width`/`min-height`/`max-height` clamp the
 *    grow box per axis, after the lattice snap — a bound lands exactly, an
 *    odd one at dpr 2 included; a min equal to its max locks the axis, so a
 *    diagonal drag moves the other alone and a drag along it fires nothing;
 *    the max wins where the two cross, so a window authored under the floor
 *    and held there never jumps; a programmatic write ignores the rect.
 *  - STATUS BAR: the `status` slot renders the classic bottom strip — 15px
 *    total (1px rule over a 14px white interior, the grow box's own height,
 *    so the grow box sits flush in its right end), body-face text on its
 *    native 12px line — and takes no space at all until the slot is
 *    populated, collapsing again when it empties.
 *  - HEADER: the `header` slot renders a band between the title bar and the
 *    body, the full width of the window, a white interior over a 1px rule;
 *    as tall as its content plus the rule, or `header-height` (rule
 *    included); no inset, a positioning anchor; no space until populated,
 *    collapsing again when it empties.
 *  - WINDOID COMPOSITION: `variant="utility"` composes with `resizable` and
 *    the `status` slot — the windoid bar (11px interior + 1px rule) over a
 *    working grow box and the same 15px strip. The variant restyles the
 *    title bar and widgets only; a resizable windoid with a status readout
 *    is a legal archetype (a satellite view window), not just the classic
 *    fixed palette.
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

const growCenter = (page, id = 'win') =>
  page.evaluate((id) => {
    const box = document
      .getElementById(id)
      .shadowRoot.querySelector('[part=grow-box]')
      .getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  }, id)

async function dragGrow(page, dx, dy, { steps = 5, id = 'win' } = {}) {
  const grow = await growCenter(page, id)
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

/* ── SIZE RECT ────────────────────────────────────────────────────────────
   dpr 1, scale 1: system px and CSS px coincide. Three windows: a strip
   with its height locked (min == max), a window bounded on both axes, and
   one authored under the 80×54 floor with a max holding it there. */

const RECT_PAGE = `
  <div style="position:relative;width:900px;height:700px">
    <vf-window id="strip" heading="Strip" top="20" left="20"
               width="272" height="67" min-height="67" max-height="67"
               resizable></vf-window>
    <vf-window id="rect" heading="Rect" top="20" left="400"
               width="240" height="176"
               min-width="200" max-width="300" min-height="150" max-height="200"
               resizable></vf-window>
    <vf-window id="under" heading="Under" top="300" left="20"
               width="120" height="40" max-width="120" max-height="40"
               resizable></vf-window>
  </div>
`

const sizeOf = (page, id) =>
  page.evaluate((id) => {
    const win = document.getElementById(id)
    return { width: win.width, height: win.height }
  }, id)

{
  const page = await build(RECT_PAGE)
  await page.evaluate(() => {
    window.vfEvents = []
    document.addEventListener('vf-resize', (event) =>
      window.vfEvents.push({ ...event.detail, target: event.target.id })
    )
  })

  await dragGrow(page, 45, 30, { id: 'strip' })
  let size = await sizeOf(page, 'strip')
  check(
    'min == max locks the height: a diagonal drag changes the width alone',
    size.width === 272 + 45 && size.height === 67,
    `${size.width}×${size.height}, expected 317×67`
  )
  const commit = await page.evaluate(() => window.vfEvents.at(-1))
  check(
    '…and the commit carries the locked height',
    commit?.commit === true && commit.width === 317 && commit.height === 67,
    JSON.stringify(commit)
  )

  await page.evaluate(() => (window.vfEvents = []))
  await dragGrow(page, 0, 40, { id: 'strip' })
  const alongLock = await page.evaluate(() => window.vfEvents.length)
  size = await sizeOf(page, 'strip')
  check(
    'a drag along the locked axis changes nothing and fires nothing',
    alongLock === 0 && size.width === 317 && size.height === 67,
    `${alongLock} events, ${size.width}×${size.height}`
  )

  await dragGrow(page, 100, 60, { id: 'rect' })
  size = await sizeOf(page, 'rect')
  check(
    'a drag past the max clamps both axes at it',
    size.width === 300 && size.height === 200,
    `${size.width}×${size.height}, expected 300×200`
  )
  await dragGrow(page, -200, -100, { id: 'rect' })
  size = await sizeOf(page, 'rect')
  check(
    'a drag under the min clamps both axes at it',
    size.width === 200 && size.height === 150,
    `${size.width}×${size.height}, expected 200×150`
  )

  await dragGrow(page, 30, 30, { id: 'under' })
  size = await sizeOf(page, 'under')
  check(
    'a max under the 80×54 floor wins: the window never jumps to the floor',
    size.width === 120 && size.height === 40,
    `${size.width}×${size.height}, expected 120×40`
  )

  const programmatic = await page.evaluate(async () => {
    const win = document.getElementById('strip')
    win.height = 100
    await win.updateComplete
    return win.getBoundingClientRect().height
  })
  check(
    'the rect bounds the gesture only: a programmatic write lands as declared',
    near(programmatic, 100),
    `${programmatic}px`
  )
  await page.close()
}

/* ── SIZE RECT, dpr 2 ─────────────────────────────────────────────────────
   The drag lattice is 2 system px and 67 is not on it: the lock must hold
   the authored number, not the nearest lattice step. */

{
  const page = await build(RECT_PAGE, { dpr: 2 })
  await dragGrow(page, 60, 30, { id: 'strip' })
  const size = await sizeOf(page, 'strip')
  check(
    'dpr 2: an off-lattice lock holds exactly (67 stays 67, width +40)',
    size.width === 272 + 40 && size.height === 67,
    `${size.width}×${size.height}, expected 312×67`
  )
  await page.close()
}

/* ── STATUS BAR ───────────────────────────────────────────────────────────
   dpr 1, scale 1: system px and CSS px coincide. */

{
  const page = await build(`
    <div style="position:relative;width:900px;height:700px">
      <vf-window id="bare" heading="Bare" top="10" left="10"
                 width="240" height="176"></vf-window>
      <vf-window id="doc" heading="Doc" top="10" left="300"
                 width="240" height="176" resizable>
        <span id="readout" slot="status">40px x 40px</span>
      </vf-window>
    </div>
  `)

  const geo = await page.evaluate(() => {
    const measure = (id) => {
      const root = document.getElementById(id).shadowRoot
      const frame = root.querySelector('[part=frame]').getBoundingClientRect()
      const body = root.querySelector('[part=body]').getBoundingClientRect()
      const strip = root.querySelector('[part=status-bar]')
      const style = getComputedStyle(strip)
      const stripBox = strip.getBoundingClientRect()
      return {
        bodyToFrameBottom: frame.bottom - body.bottom,
        display: style.display,
        stripHeight: stripBox.height,
        stripToFrameBottom: frame.bottom - stripBox.bottom,
        rule: style.borderTopWidth,
        background: style.backgroundColor,
        lineHeight: style.lineHeight,
      }
    }
    return { bare: measure('bare'), doc: measure('doc') }
  })

  check(
    'no status content: the strip takes no space (body reaches the frame)',
    geo.bare.display === 'none' && near(geo.bare.bodyToFrameBottom, 1),
    `display ${geo.bare.display}, body ends ${geo.bare.bodyToFrameBottom}px above frame bottom`
  )
  check(
    'populated: the strip is the 15px band over the frame bottom',
    near(geo.doc.stripHeight, 15) && near(geo.doc.stripToFrameBottom, 1),
    `strip ${geo.doc.stripHeight}px tall, ${geo.doc.stripToFrameBottom}px above frame bottom`
  )
  check(
    '…1px rule, white interior, body-face 12px line',
    geo.doc.rule === '1px' &&
      geo.doc.background === 'rgb(255, 255, 255)' &&
      geo.doc.lineHeight === '12px',
    `rule ${geo.doc.rule}, bg ${geo.doc.background}, line ${geo.doc.lineHeight}`
  )

  const grow = await page.evaluate(() => {
    const root = document.getElementById('doc').shadowRoot
    const grow = root.querySelector('[part=grow-box]').getBoundingClientRect()
    const strip = root.querySelector('[part=status-bar]').getBoundingClientRect()
    return { dTop: grow.top - strip.top, dRight: strip.right - grow.right, dBottom: strip.bottom - grow.bottom }
  })
  check(
    'the grow box sits flush in the strip\'s right end',
    near(grow.dTop, 0) && near(grow.dRight, 0) && near(grow.dBottom, 0),
    JSON.stringify(grow)
  )

  const emptied = await page.evaluate(async () => {
    document.getElementById('readout').remove()
    // slotchange dispatches async — give it a frame, then the re-render.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const win = document.getElementById('doc')
    await win.updateComplete
    return getComputedStyle(win.shadowRoot.querySelector('[part=status-bar]'))
      .display
  })
  check('emptying the slot collapses the strip again', emptied === 'none', emptied)

  await page.close()
}

/* ── HEADER ───────────────────────────────────────────────────────────────
   The `header` slot: a band between the title bar and the body across the
   whole window. dpr 1, scale 1: system px and CSS px coincide. */

{
  const page = await build(`
    <div style="position:relative;width:900px;height:700px">
      <vf-window id="bare" heading="Bare" top="10" left="10"
                 width="240" height="176"></vf-window>
      <vf-window id="auto" heading="Auto" top="10" left="300"
                 width="240" height="176">
        <div id="strip-content" slot="header" style="height:24px"></div>
        <vf-button id="placed" slot="header" left="8" top="2">OK</vf-button>
      </vf-window>
      <vf-window id="stated" heading="Stated" top="200" left="10"
                 width="240" height="176" header-height="20">
        <span id="readout" slot="header">7 items</span>
        <div id="flow"></div>
      </vf-window>
    </div>
  `)

  const geo = await page.evaluate(() => {
    const measure = (id) => {
      const root = document.getElementById(id).shadowRoot
      const bar = root.querySelector('.vf-title-bar').getBoundingClientRect()
      const body = root.querySelector('[part=body]').getBoundingClientRect()
      const frame = root.querySelector('[part=frame]').getBoundingClientRect()
      const strip = root.querySelector('[part=header]')
      const style = getComputedStyle(strip)
      const box = strip.getBoundingClientRect()
      return {
        display: style.display,
        barBottomToBody: body.top - bar.bottom,
        stripTop: box.top - bar.bottom,
        stripHeight: box.height,
        stripWidth: box.width,
        frameInnerWidth: frame.width - 2,
        stripBottomToBody: body.top - box.bottom,
        ruleBottom: parseFloat(style.borderBottomWidth),
        ruleTop: parseFloat(style.borderTopWidth),
        padding: style.padding,
        position: style.position,
      }
    }
    const placed = document.getElementById('placed').getBoundingClientRect()
    const strip = document
      .getElementById('auto')
      .shadowRoot.querySelector('[part=header]')
      .getBoundingClientRect()
    return {
      bare: measure('bare'),
      auto: measure('auto'),
      stated: measure('stated'),
      placed: { dx: placed.left - strip.left, dy: placed.top - strip.top },
    }
  })

  check(
    'no header content: the strip takes no space (body starts under the bar)',
    geo.bare.display === 'none' && near(geo.bare.barBottomToBody, 0),
    `display ${geo.bare.display}, body ${geo.bare.barBottomToBody}px under the bar`
  )
  check(
    'populated: the strip sits between the title bar and the body, full width',
    geo.auto.display !== 'none' &&
      near(geo.auto.stripTop, 0) &&
      near(geo.auto.stripBottomToBody, 0) &&
      near(geo.auto.stripWidth, geo.auto.frameInnerWidth),
    `strip ${geo.auto.stripTop}px under the bar, body ${geo.auto.stripBottomToBody}px under the strip, ${geo.auto.stripWidth} wide in a ${geo.auto.frameInnerWidth} frame`
  )
  check(
    'unstated height: as tall as the content plus the 1px rule beneath',
    near(geo.auto.stripHeight, 25) && geo.auto.ruleBottom === 1 && geo.auto.ruleTop === 0,
    `${geo.auto.stripHeight}px, rule ${geo.auto.ruleTop}/${geo.auto.ruleBottom}`
  )
  check(
    'header-height states the height, rule included',
    near(geo.stated.stripHeight, 20) && geo.stated.ruleBottom === 1,
    `${geo.stated.stripHeight}px`
  )
  check(
    'no inset, and a positioning anchor: a placed child measures from the strip corner',
    geo.auto.padding === '0px' &&
      geo.auto.position === 'relative' &&
      near(geo.placed.dx, 8) &&
      near(geo.placed.dy, 2),
    `padding ${geo.auto.padding}, ${geo.auto.position}, placed at ${geo.placed.dx} × ${geo.placed.dy}`
  )

  const emptied = await page.evaluate(async () => {
    document.getElementById('readout').remove()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const win = document.getElementById('stated')
    await win.updateComplete
    return getComputedStyle(win.shadowRoot.querySelector('[part=header]')).display
  })
  check('emptying the header slot collapses the strip again', emptied === 'none', emptied)

  await page.close()
}

/* ── WINDOID COMPOSITION ──────────────────────────────────────────────────
   variant="utility" × resizable × status: the satellite-view archetype.
   dpr 1, scale 1: system px and CSS px coincide. */

{
  const page = await build(`
    <div style="position:relative;width:900px;height:700px">
      <vf-window id="windoid" heading="3D View" variant="utility"
                 top="20" left="20" width="240" height="176" resizable>
        <span slot="status">12×5×30 · 402 tris</span>
      </vf-window>
    </div>
  `)

  const geo = await page.evaluate(() => {
    const root = document.getElementById('windoid').shadowRoot
    const bar = root.querySelector('.vf-title-bar').getBoundingClientRect()
    const strip = root.querySelector('[part=status-bar]')
    const stripBox = strip.getBoundingClientRect()
    const grow = root.querySelector('[part=grow-box]')
    const growBox = grow ? grow.getBoundingClientRect() : null
    return {
      barHeight: bar.height,
      stripDisplay: getComputedStyle(strip).display,
      stripHeight: stripBox.height,
      grow: growBox
        ? { dTop: growBox.top - stripBox.top, dRight: stripBox.right - growBox.right }
        : null,
    }
  })
  check(
    'windoid + status: the bar is the 12px windoid bar, the strip the 15px band',
    near(geo.barHeight, 12) &&
      geo.stripDisplay !== 'none' &&
      near(geo.stripHeight, 15),
    `bar ${geo.barHeight}px, strip ${geo.stripDisplay} ${geo.stripHeight}px`
  )
  check(
    'windoid + resizable: the grow box renders flush in the strip',
    geo.grow !== null && near(geo.grow.dTop, 0) && near(geo.grow.dRight, 0),
    JSON.stringify(geo.grow)
  )

  // instrument() targets #win; log the windoid's own resize stream instead.
  await page.evaluate(() => {
    window.vfEvents = []
    document.addEventListener('vf-resize', (event) => {
      if (event.target.id === 'windoid') window.vfEvents.push(event.detail)
    })
  })
  const grow = await page.evaluate(() => {
    const box = document
      .getElementById('windoid')
      .shadowRoot.querySelector('[part=grow-box]')
      .getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await page.mouse.move(grow.x, grow.y)
  await page.mouse.down()
  await page.mouse.move(grow.x + 40, grow.y + 24, { steps: 4 })
  await page.mouse.up()
  const resized = await page.evaluate(() => {
    const win = document.getElementById('windoid')
    return { width: win.width, height: win.height, events: window.vfEvents.length }
  })
  check(
    'windoid + resizable: the grow box drag resizes and streams vf-resize',
    resized.width === 240 + 40 && resized.height === 176 + 24 && resized.events > 0,
    `${resized.width}×${resized.height}, ${resized.events} events`
  )

  await page.close()
}

await report(browser)
