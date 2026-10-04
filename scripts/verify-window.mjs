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
 *  - OPEN: `show({ from })` opens the window from a box — the zoom rects on
 *    the desktop's drag surface, the window laid out, focusable and a hit
 *    target but painting nothing until they drain. Every frame of the run is
 *    matched against the eighteen trail states computed here from the rects'
 *    numbers (each edge its fraction of the way, four up at a time, XOR, dots
 *    on the screen's odd diagonal), so the geometry, the trail and the drain
 *    are read off the rects' canvases themselves, the visible ones XORed as
 *    the screen composites them; a screenshot shows the rings as black lines
 *    over the dither. Then the ways a run ends: drained, a press (which lands
 *    on the window), Escape (consumed), a second `show()`, a removal — and a
 *    move, which is not one. Reduced motion, no desktop and no `from` show at
 *    once.
 *  - CLOSE: `hide({ to })` closes the window to a box — hidden in the call's
 *    task, the same rects running the other way, every frame matched against
 *    the trail states in closing order. A press finishes them, a removal
 *    leaves them running, a `show()` finishes them and shows the window, and
 *    a `hide()` on a window still opening takes the opening down. A hidden
 *    window, no `to`, reduced motion and no desktop hide at once.
 *  - DRAG OUTLINE: `outline-drag` moves a dotted outline of the window on the
 *    desktop's drag surface instead of the window — a one-pixel ring at the
 *    frame's size, dotted on the screen's odd diagonal, held where the
 *    window can land — and the release writes the window there once; Escape
 *    writes nothing; a capture lost before the release lands it the same
 *    way. Unset, or with no desktop, the window moves live.
 *  - PLACEMENT EVENT: a listener on the desktop hears a title-bar drag's
 *    release as `vf-placement-change` carrying the window's new pair.
 *  - CHROME: `windowChrome()` matches the insets measured between a rendered
 *    window's outer box and its body or scrolled viewport, for seven option
 *    sets at dpr 1 and 2; `sizeLimits` is the 80×54 floor by default and a
 *    window's own min and max where stated.
 *  - WORK AREA: on a desktop with a menu bar a window dragged up stops with
 *    its title bar under the bar, outline or live, or at `window-top`; the
 *    floor rounds up to the placement lattice; on a bezeled desktop the
 *    clamp's box is the screen, bezel excluded.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:window
 */
import {
  buttonlessMove,
  check,
  decodePng,
  devicePxPerSystemPxAt,
  isBlack,
  isWhite,
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
    <vf-window closable id="win" heading="Grow" top="20" left="20"
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
    <vf-window closable id="strip" heading="Strip" top="20" left="20"
               width="272" height="67" min-height="67" max-height="67"
               resizable></vf-window>
    <vf-window closable id="rect" heading="Rect" top="20" left="400"
               width="240" height="176"
               min-width="200" max-width="300" min-height="150" max-height="200"
               resizable></vf-window>
    <vf-window closable id="under" heading="Under" top="300" left="20"
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
      <vf-window closable id="bare" heading="Bare" top="10" left="10"
                 width="240" height="176"></vf-window>
      <vf-window closable id="doc" heading="Doc" top="10" left="300"
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
        // The rule is a stroke: the padding it holds, or a border under
        // forced colors.
        rule: parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth),
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
    geo.doc.rule === 1 &&
      geo.doc.background === 'rgb(255, 255, 255)' &&
      geo.doc.lineHeight === '12px',
    `rule ${geo.doc.rule}px, bg ${geo.doc.background}, line ${geo.doc.lineHeight}`
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
      <vf-window closable id="bare" heading="Bare" top="10" left="10"
                 width="240" height="176"></vf-window>
      <vf-window closable id="auto" heading="Auto" top="10" left="300"
                 width="240" height="176">
        <div id="strip-content" slot="header" style="height:24px"></div>
        <vf-button id="placed" slot="header" left="8" top="2">OK</vf-button>
      </vf-window>
      <vf-window closable id="stated" heading="Stated" top="200" left="10"
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
        // The rule is a stroke: the padding it holds, or a border under
        // forced colors.
        ruleBottom: parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth),
        ruleTop: parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth),
      }
    }
    const placed = document.getElementById('placed').getBoundingClientRect()
    const flowed = document.getElementById('strip-content').getBoundingClientRect()
    const strip = document
      .getElementById('auto')
      .shadowRoot.querySelector('[part=header]')
      .getBoundingClientRect()
    return {
      bare: measure('bare'),
      auto: measure('auto'),
      stated: measure('stated'),
      placed: { dx: placed.left - strip.left, dy: placed.top - strip.top },
      flowed: { dx: flowed.left - strip.left, dy: flowed.top - strip.top },
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
    'no inset, and a positioning anchor: flow content and a placed child measure from the strip corner',
    near(geo.flowed.dx, 0) &&
      near(geo.flowed.dy, 0) &&
      near(geo.placed.dx, 8) &&
      near(geo.placed.dy, 2),
    `flow at ${geo.flowed.dx} × ${geo.flowed.dy}, placed at ${geo.placed.dx} × ${geo.placed.dy}`
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
      <vf-window closable id="windoid" heading="3D View" variant="utility"
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

/* ── OPEN ─────────────────────────────────────────────────────────────────
   show({ from }): the window opens from a box, the zoom rects running
   from it toward the frame on the desktop's drag surface. dpr 1,
   scale 1: system px, CSS px and device px coincide, and the desktop sits
   at the page's corner, so screen coordinates are client coordinates. The
   union of the box and the window lies on bare dither — the window paints
   nothing while it opens, and the other window stays clear of it. */

const OPEN_DESK = `
  <vf-desktop id="desk" width="512" height="342">
    <vf-window closable id="win" heading="Folder" width="200" height="120" left="100" top="60" hidden>
      <vf-button id="inside" left="16" top="16">OK</vf-button>
    </vf-window>
    <vf-window closable id="other" heading="Other" width="140" height="80" left="340" top="250"></vf-window>
  </vf-desktop>
`

/** Where the rects start: a 32×32 box at (40, 200) on the screen, system px. */
const FROM = { x: 40, y: 200, w: 32, h: 32 }

/**
 * The in-page probe. `__screenBox` turns a system-px box on the screen into
 * a viewport rect. `__expect` computes, from the rects' numbers and
 * independently of the kit's painter, the union the rects cover and the
 * eighteen states it can show — each rect's frame, every edge its fraction
 * of the way, four up at a time, XOR where they share a pixel, ink only on
 * the screen's odd diagonal.
 * `__openRun` calls show(), samples every animation frame until it settles,
 * and matches each frame against those states: the canvases visible on the
 * surface, XORed together over the union where each sits — what the screen
 * composites, since each one inverts what is under it. `__closeRun` does the
 * same for hide(), against the states in closing order.
 */
const installRectsProbe = (page) =>
  page.evaluate(() => {
    const desk = () => document.getElementById('desk')
    const surfaceOf = () => desk().shadowRoot.querySelector('.drag-surface')
    const scaleOf = (el) => parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale'))

    globalThis.__screenBox = ({ x, y, w, h }) => {
      const s = surfaceOf().getBoundingClientRect()
      const k = scaleOf(desk())
      return {
        left: s.left + x * k,
        top: s.top + y * k,
        right: s.left + (x + w) * k,
        bottom: s.top + (y + h) * k,
      }
    }

    globalThis.__expect = (from, winRect, closing = false) => {
      const STEPS = 14
      const VISIBLE = 4
      const s = surfaceOf().getBoundingClientRect()
      const k = scaleOf(desk())
      const on = (r) => ({
        l: Math.round((r.left - s.left) / k),
        t: Math.round((r.top - s.top) / k),
        r: Math.round((r.right - s.left) / k),
        b: Math.round((r.bottom - s.top) / k),
      })
      const small = on(from)
      const big = on(winRect)
      const L = Math.max(0, Math.min(small.l, big.l))
      const T = Math.max(0, Math.min(small.t, big.t))
      const R = Math.min(Math.round(s.width / k), Math.max(small.r, big.r))
      const B = Math.min(Math.round(s.height / k), Math.max(small.b, big.b))
      const W = R - L
      const H = B - T
      const edge = (a, b, t) => a + Math.trunc((b - a) * t)
      const ring = (i) => {
        const t = 0.7 ** (STEPS - i)
        const l = edge(small.l, big.l, t)
        const top = edge(small.t, big.t, t)
        const w = Math.max(1, edge(small.r, big.r, t) - l)
        const h = Math.max(1, edge(small.b, big.b, t) - top)
        const px = []
        for (let x = l; x < l + w; x++) {
          px.push([x, top])
          if (h > 1) px.push([x, top + h - 1])
        }
        for (let y = top + 1; y < top + h - 1; y++) {
          px.push([l, y])
          if (w > 1) px.push([l + w - 1, y])
        }
        return px
      }
      const rings = Array.from({ length: STEPS }, (_, i) => ring(i))
      const states = []
      for (let step = 0; step < STEPS + VISIBLE; step++) {
        const bits = new Uint8Array(W * H)
        for (let i = Math.max(0, step - VISIBLE + 1); i <= Math.min(step, STEPS - 1); i++) {
          // Closing, the order runs from the rect nearest the frame in.
          for (const [x, y] of rings[closing ? STEPS - 1 - i : i]) {
            const cx = x - L
            const cy = y - T
            if (cx >= 0 && cy >= 0 && cx < W && cy < H) bits[cy * W + cx] ^= 1
          }
        }
        for (let cy = 0; cy < H; cy++) {
          for (let cx = 0; cx < W; cx++) {
            if (((L + cx + T + cy) & 1) === 0) bits[cy * W + cx] = 0
          }
        }
        states.push(bits)
      }
      return { union: { x: L, y: T, w: W, h: H }, states }
    }

    /**
     * What the visible canvases show over the union, XORed together where
     * each sits, and each one's box in system px on the screen with its
     * raster size.
     */
    const composeOf = (canvases, union) => {
      const sr = surfaceOf().getBoundingClientRect()
      const k = scaleOf(desk())
      const bits = new Uint8Array(union.w * union.h)
      const boxes = []
      for (const c of canvases) {
        if (getComputedStyle(c).visibility !== 'visible') continue
        const b = c.getBoundingClientRect()
        const box = { x: (b.x - sr.x) / k, y: (b.y - sr.y) / k, w: b.width / k, h: b.height / k }
        boxes.push({ ...box, raster: [c.width, c.height] })
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        const ox = Math.round(box.x) - union.x
        const oy = Math.round(box.y) - union.y
        for (let py = 0; py < c.height; py++) {
          for (let px = 0; px < c.width; px++) {
            if (data[(py * c.width + px) * 4 + 3] === 0) continue
            const cx = ox + px
            const cy = oy + py
            if (cx >= 0 && cy >= 0 && cx < union.w && cy < union.h) bits[cy * union.w + cx] ^= 1
          }
        }
      }
      return { bits, boxes }
    }

    /** Which of the states the bits are, or -1. */
    const matchOf = (bits, states) =>
      states.findIndex((s) => {
        if (s.length !== bits.length) return false
        for (let i = 0; i < bits.length; i++) if (s[i] !== bits[i]) return false
        return true
      })

    /**
     * Every animation frame until `settled()` holds: the canvases on the
     * surface, the window's state, and which expected state the visible
     * canvases show.
     */
    const sampleFrames = (settled, expected) =>
      new Promise((resolve) => {
        const win = document.getElementById('win')
        const surface = surfaceOf()
        const frames = []
        const sample = () => {
          const canvases = [...surface.querySelectorAll('canvas')]
          const r = win.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          const done = settled()
          const f = {
            count: canvases.length,
            hidden: win.hidden,
            opening: win.matches(':state(opening)'),
            opacity: getComputedStyle(win).opacity,
            hit: !!hit?.closest('#win'),
            settled: done,
            match: null,
            boxes: null,
          }
          if (canvases.length > 0 && expected) {
            const { bits, boxes } = composeOf(canvases, expected.union)
            f.boxes = boxes
            f.match = matchOf(bits, expected.states)
          }
          frames.push(f)
          if (done) resolve(frames)
          else requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })

    globalThis.__openRun = async ({ from = null, move = null } = {}) => {
      const win = document.getElementById('win')
      let settled = false
      let result
      const promise = win.show({ from: from && __screenBox(from) }).then((v) => {
        settled = true
        result = v
      })
      const sync = {
        hidden: win.hidden,
        opening: win.matches(':state(opening)'),
        opacity: getComputedStyle(win).opacity,
      }
      if (move) {
        win.left = move.left
        win.top = move.top
      }
      await win.updateComplete
      const expected = from ? __expect(__screenBox(from), win.getBoundingClientRect()) : null
      globalThis.__lastExpected = expected
      const frames = await sampleFrames(() => settled, expected)
      await promise
      return { sync, frames, result, union: expected?.union ?? null }
    }

    /** hide() from a shown window, sampled the same way against the closing states. */
    globalThis.__closeRun = async ({ to = null } = {}) => {
      const win = document.getElementById('win')
      const frame = win.getBoundingClientRect()
      let settled = false
      let result
      const promise = win.hide({ to: to && __screenBox(to) }).then((v) => {
        settled = true
        result = v
      })
      const sync = { hidden: win.hidden, canvases: surfaceOf().querySelectorAll('canvas').length }
      const expected = to ? __expect(__screenBox(to), frame, true) : null
      globalThis.__lastExpected = expected
      const frames = await sampleFrames(() => settled, expected)
      await promise
      return { sync, frames, result, union: expected?.union ?? null }
    }
  })

/** Hide the window again, and let any run it had settle. */
const resetOpen = (page) =>
  page.evaluate(async () => {
    const win = document.getElementById('win')
    win.hidden = true
    await win.updateComplete
  })

const sameBox = (a, b) =>
  !!a && !!b && near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h)

/** Frames of a run while it ran, and those with the canvas up. */
const partsOf = (run) => {
  const live = run.frames.filter((f) => !f.settled)
  const shown = live.filter((f) => f.count > 0)
  return { live, shown, matches: shown.map((f) => f.match), last: run.frames.at(-1) }
}

{
  const page = await build(OPEN_DESK, { settle: true })
  await installRectsProbe(page)

  // The run, frame by frame.
  const run = await page.evaluate((from) => __openRun({ from }), FROM)
  const { live, shown, matches, last } = partsOf(run)
  check(
    'OPEN  show({ from }) clears hidden and conceals the window in the same task',
    run.sync.hidden === false && run.sync.opening && run.sync.opacity === '0',
    JSON.stringify(run.sync)
  )
  check(
    'OPEN  while the rects run the window paints nothing, and stays a hit target',
    live.length > 0 && live.every((f) => f.opening && f.opacity === '0' && f.hit),
    `${live.length} frames: ${JSON.stringify(live.map((f) => [f.opening, f.opacity, f.hit]))}`
  )
  check(
    "OPEN  a canvas per rect on the desktop's surface, four up at most, one image px per system px",
    shown.length >= 5 &&
      sameBox(run.union, { x: 40, y: 60, w: 260, h: 172 }) &&
      shown.every(
        (f) =>
          f.count === 14 &&
          f.boxes.length <= 4 &&
          f.boxes.every((b) => b.raster[0] === Math.round(b.w) && b.raster[1] === Math.round(b.h))
      ),
    JSON.stringify({ frames: shown.length, union: run.union, counts: shown.map((f) => f.count), boxes: shown[1]?.boxes })
  )
  check(
    'OPEN  every frame shows one of the eighteen trail states: the rects\' frames, four up, XOR, dots on the odd diagonal',
    shown.length > 0 && matches.every((m) => m >= 0),
    JSON.stringify(matches)
  )
  check(
    'OPEN  …in order, from the box outward and through the drain',
    matches.every((m, i) => i === 0 || m >= matches[i - 1]) &&
      Math.min(...matches) <= 3 &&
      Math.max(...matches) >= 14,
    JSON.stringify(matches)
  )
  check(
    'OPEN  …then the canvases are gone, the window drawn, and show() resolved true',
    last.settled && run.result === true && last.count === 0 && !last.opening && last.opacity === '1',
    JSON.stringify({ result: run.result, last })
  )

  // The look: early in a run, the screen over the union is the dither with
  // one trail state XORed in — each ring's dots land on the pixels the
  // dither leaves white, so every ring reads as a black line.
  await resetOpen(page)
  await page.evaluate((from) => {
    globalThis.__looked = document.getElementById('win').show({ from: __screenBox(from) })
  }, FROM)
  await page.waitForTimeout(40)
  const png = decodePng(await page.screenshot())
  const u = { x: 40, y: 60, w: 260, h: 172 }
  const oddInk = new Array(u.w * u.h).fill(0)
  let dither = 0
  let impure = 0
  for (let cy = 0; cy < u.h; cy++) {
    for (let cx = 0; cx < u.w; cx++) {
      const x = u.x + cx
      const y = u.y + cy
      const black = isBlack(png, x, y)
      if (!black && !isWhite(png, x, y)) impure++
      if (((x + y) & 1) === 0) dither += black ? 0 : 1
      else if (black) oddInk[cy * u.w + cx] = 1
    }
  }
  const seen = await page.evaluate(
    (bits) =>
      globalThis.__lastExpected.states.findIndex(
        (s) => s.length === bits.length && s.every((v, i) => v === bits[i])
      ),
    oddInk
  )
  check(
    'OPEN  over the dither every ring reads as a black line: the screen is the dither with one trail state in it',
    impure === 0 && dither === 0 && seen >= 0 && seen < 17,
    `state ${seen}, ${dither} dither pixels lost, ${impure} gray`
  )
  await page.evaluate(() => globalThis.__looked)

  // Same-task writes land first: the rects end on the frame the page set.
  await resetOpen(page)
  const movedRun = await page.evaluate(
    (from) => __openRun({ from, move: { left: 240, top: 100 } }),
    FROM
  )
  const moved = partsOf(movedRun)
  check(
    'OPEN  a left/top write in the show() task lands first: the rects run to the new frame',
    sameBox(movedRun.union, { x: 40, y: 100, w: 400, h: 132 }) &&
      moved.shown.length > 0 &&
      moved.matches.every((m) => m >= 0) &&
      movedRun.result === true,
    JSON.stringify({ union: movedRun.union, matches: moved.matches })
  )
  await page.evaluate(() => {
    const win = document.getElementById('win')
    win.left = 100
    win.top = 60
  })

  // A press finishes the rects and lands on the window.
  await resetOpen(page)
  await page.evaluate((from) => {
    globalThis.__clicks = 0
    document.getElementById('inside').addEventListener('click', () => globalThis.__clicks++)
    globalThis.__done = null
    document
      .getElementById('win')
      .show({ from: __screenBox(from) })
      .then((v) => (globalThis.__done = v))
  }, FROM)
  await page.waitForTimeout(40)
  const button = await page.evaluate(() => {
    const r = document.getElementById('inside').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.click(button.x, button.y)
  const openState = () =>
    page.evaluate(() => {
      const win = document.getElementById('win')
      return {
        done: globalThis.__done,
        canvases: document
          .getElementById('desk')
          .shadowRoot.querySelectorAll('.drag-surface canvas').length,
        opening: win.matches(':state(opening)'),
        opacity: getComputedStyle(win).opacity,
      }
    })
  const pressed = { ...(await openState()), clicks: await page.evaluate(() => globalThis.__clicks) }
  check(
    'OPEN  a press finishes the rects at once and lands on the window: the button in it gets the click',
    pressed.done === true &&
      pressed.clicks === 1 &&
      pressed.canvases === 0 &&
      !pressed.opening &&
      pressed.opacity === '1',
    JSON.stringify(pressed)
  )

  // Escape finishes them too, and goes no further.
  await resetOpen(page)
  await page.evaluate((from) => {
    globalThis.__escapes = 0
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') globalThis.__escapes++
    })
    globalThis.__done = null
    document
      .getElementById('win')
      .show({ from: __screenBox(from) })
      .then((v) => (globalThis.__done = v))
  }, FROM)
  await page.waitForTimeout(40)
  await page.keyboard.press('Escape')
  const escaped = { ...(await openState()), escapes: await page.evaluate(() => globalThis.__escapes) }
  check(
    'OPEN  Escape finishes the rects and is consumed there',
    escaped.done === true && escaped.escapes === 0 && escaped.canvases === 0 && !escaped.opening,
    JSON.stringify(escaped)
  )

  // A second show() finishes the run in flight, then runs its own.
  await resetOpen(page)
  const twice = await page.evaluate(async (from) => {
    const win = document.getElementById('win')
    const surface = document.getElementById('desk').shadowRoot.querySelector('.drag-surface')
    let first = null
    win.show({ from: __screenBox(from) }).then((v) => (first = v))
    await new Promise((r) => setTimeout(r, 40))
    const second = win.show({ from: __screenBox(from) })
    await new Promise((r) => setTimeout(r, 0))
    const during = { first, canvases: surface.querySelectorAll('canvas').length }
    const v = await second
    return { during, v, after: surface.querySelectorAll('canvas').length }
  }, FROM)
  check(
    'OPEN  a second show() finishes the run in flight — resolved true — and runs its own',
    twice.during.first === true && twice.during.canvases === 14 && twice.v === true && twice.after === 0,
    JSON.stringify(twice)
  )

  // A page can focus into the window while it opens.
  await resetOpen(page)
  const focus = await page.evaluate(async (from) => {
    const win = document.getElementById('win')
    const inside = document.getElementById('inside')
    const p = win.show({ from: __screenBox(from) })
    inside.focus()
    await win.updateComplete
    const during = document.activeElement === inside && win.matches(':state(opening)')
    await p
    return { during, after: document.activeElement === inside }
  }, FROM)
  check(
    'OPEN  a page can focus into the window while it opens, and the focus stays',
    focus.during && focus.after,
    JSON.stringify(focus)
  )

  // Appended and shown in one task: never painted ahead of the rects.
  const appended = await page.evaluate(async (from) => {
    const desk = document.getElementById('desk')
    const fresh = document.createElement('vf-window')
    fresh.id = 'fresh'
    fresh.heading = 'Fresh'
    fresh.width = 160
    fresh.height = 100
    fresh.left = 200
    fresh.top = 150
    desk.append(fresh)
    const p = fresh.show({ from: __screenBox(from) })
    const first = await new Promise((r) =>
      requestAnimationFrame(() => r(getComputedStyle(fresh).opacity))
    )
    const v = await p
    const after = getComputedStyle(fresh).opacity
    fresh.remove()
    return { first, v, after }
  }, FROM)
  check(
    'OPEN  appended and shown in one task, the window never paints ahead of the rects',
    appended.first === '0' && appended.v === true && appended.after === '1',
    JSON.stringify(appended)
  )

  // A removal takes the rects down.
  await resetOpen(page)
  const removed = await page.evaluate(async (from) => {
    const desk = document.getElementById('desk')
    const win = document.getElementById('win')
    const p = win.show({ from: __screenBox(from) })
    await new Promise((r) => setTimeout(r, 40))
    win.remove()
    const v = await p
    const result = {
      v,
      canvases: desk.shadowRoot.querySelectorAll('.drag-surface canvas').length,
      opening: win.matches(':state(opening)'),
    }
    // Back, first in the DOM, for the move below.
    win.hidden = true
    desk.prepend(win)
    return result
  }, FROM)
  check(
    'OPEN  removing the window mid-run takes the rects down, and show() resolves false',
    removed.v === false && removed.canvases === 0 && !removed.opening,
    JSON.stringify(removed)
  )

  // A move is not a removal: the desktop re-inserts a raised window to keep
  // the DOM in stacking order, and the rects keep running through it — the
  // press that finishes them still heard afterwards.
  const move = await page.evaluate(async (from) => {
    const desk = document.getElementById('desk')
    const win = document.getElementById('win')
    const other = document.getElementById('other')
    await win.updateComplete
    const before = !!(win.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING)
    globalThis.__done = null
    win.show({ from: __screenBox(from) }).then((v) => (globalThis.__done = v))
    desk.bringToFront(win)
    await new Promise((r) => setTimeout(r, 40))
    return {
      before,
      after: !!(win.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_PRECEDING),
      canvases: desk.shadowRoot.querySelectorAll('.drag-surface canvas').length,
      opening: win.matches(':state(opening)'),
      done: globalThis.__done,
    }
  }, FROM)
  check(
    'OPEN  a raise that re-inserts the window mid-run is a move: the rects keep running',
    move.before && move.after && move.canvases === 14 && move.opening && move.done === null,
    JSON.stringify(move)
  )
  await page.mouse.click(5, 330)
  const afterMove = await openState()
  check(
    '…and a press after the move still finishes them',
    afterMove.done === true && afterMove.canvases === 0 && !afterMove.opening,
    JSON.stringify(afterMove)
  )
  await page.close()
}

// The rects on the device grid, at display density.
for (const dpr of [2, 3]) {
  const page = await build(OPEN_DESK, { settle: true, dpr, real: true })
  await installRectsProbe(page)
  const run = await page.evaluate((from) => __openRun({ from }), FROM)
  const { shown, matches } = partsOf(run)
  const whole = (v) => Math.abs(v - Math.round(v)) < 1e-3
  check(
    `OPEN dpr${dpr}  the canvases sit on whole system px and show the same trail states`,
    shown.length > 0 &&
      shown.every((f) =>
        f.boxes.every((b) => whole(b.x) && whole(b.y) && whole(b.w) && whole(b.h))
      ) &&
      sameBox(run.union, { x: 40, y: 60, w: 260, h: 172 }) &&
      matches.every((m) => m >= 0) &&
      run.result === true,
    JSON.stringify({ boxes: shown[1]?.boxes, matches })
  )
  await page.close()
}

// Reduced motion: the window shows at once, with nothing concealed.
{
  const page = await build(OPEN_DESK, { settle: true, reducedMotion: true })
  await installRectsProbe(page)
  const run = await page.evaluate((from) => __openRun({ from }), FROM)
  check(
    'OPEN  under reduced motion the window shows at once: no rects, nothing concealed, resolved false',
    run.result === false &&
      run.sync.hidden === false &&
      !run.sync.opening &&
      run.frames.every((f) => f.count === 0 && !f.opening && f.opacity === '1'),
    JSON.stringify({ sync: run.sync, frames: run.frames })
  )
  const closed = await page.evaluate(async (to) => {
    const win = document.getElementById('win')
    const v = await win.hide({ to: __screenBox(to) })
    const surface = document.getElementById('desk').shadowRoot.querySelector('.drag-surface')
    return { v, hidden: win.hidden, canvases: surface.querySelectorAll('canvas').length }
  }, FROM)
  check(
    'CLOSE  under reduced motion the window hides at once: no rects, resolved false',
    closed.v === false && closed.hidden && closed.canvases === 0,
    JSON.stringify(closed)
  )
  await page.close()
}

// No desktop on the path, and no box: shown at once.
{
  const page = await build(`
    <div style="position:relative;width:900px;height:700px">
      <vf-window closable id="plain" heading="Plain" width="200" height="120" left="100" top="60" hidden></vf-window>
    </div>
  `)
  const res = await page.evaluate(async () => {
    const win = document.getElementById('plain')
    const v = await win.show({ from: { left: 10, top: 10, right: 42, bottom: 42 } })
    return {
      v,
      hidden: win.hidden,
      opening: win.matches(':state(opening)'),
      opacity: getComputedStyle(win).opacity,
      canvases: document.querySelectorAll('canvas').length,
    }
  })
  check(
    'OPEN  with no desktop on its path the window shows at once and resolves false',
    res.v === false && !res.hidden && !res.opening && res.opacity === '1' && res.canvases === 0,
    JSON.stringify(res)
  )
  const bare = await page.evaluate(async () => {
    const win = document.getElementById('plain')
    win.hidden = true
    const v = await win.show()
    return { v, hidden: win.hidden }
  })
  check(
    'OPEN  without from, show() clears hidden and resolves false',
    bare.v === false && !bare.hidden,
    JSON.stringify(bare)
  )
  const plainClose = await page.evaluate(async () => {
    const win = document.getElementById('plain')
    const v = await win.hide({ to: { left: 10, top: 10, right: 42, bottom: 42 } })
    return { v, hidden: win.hidden, canvases: document.querySelectorAll('canvas').length }
  })
  check(
    'CLOSE  with no desktop on its path the window hides at once and resolves false',
    plainClose.v === false && plainClose.hidden && plainClose.canvases === 0,
    JSON.stringify(plainClose)
  )
  await page.close()
}

/* ── CLOSE ────────────────────────────────────────────────────────────────
   hide({ to }): the window closes to a box — the opening's rects run the
   other way, from where its frame was in toward the box, the window gone
   from the first step. The OPEN page and probe; the window shown at once
   before each run. */

{
  const page = await build(OPEN_DESK, { settle: true })
  await installRectsProbe(page)
  const surfaceCount = () =>
    page.evaluate(
      () => document.getElementById('desk').shadowRoot.querySelectorAll('.drag-surface canvas').length
    )
  const showAtOnce = () =>
    page.evaluate(async () => {
      await document.getElementById('win').show()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    })

  // The run, frame by frame.
  await showAtOnce()
  const run = await page.evaluate((to) => __closeRun({ to }), FROM)
  const { live, shown, matches, last } = partsOf(run)
  check(
    'CLOSE  hide({ to }) sets hidden in the same task, the rects already on the surface',
    run.sync.hidden === true && run.sync.canvases === 14,
    JSON.stringify(run.sync)
  )
  check(
    'CLOSE  every frame shows one of the eighteen trail states in closing order, the window hidden throughout',
    shown.length >= 5 && matches.every((m) => m >= 0) && live.every((f) => f.hidden),
    JSON.stringify(matches)
  )
  check(
    'CLOSE  …in order, from the frame in toward the box and draining into it',
    matches.every((m, i) => i === 0 || m >= matches[i - 1]) &&
      Math.min(...matches) <= 3 &&
      Math.max(...matches) >= 14,
    JSON.stringify(matches)
  )
  check(
    'CLOSE  …then the canvases are gone and hide() resolved true',
    last.settled && run.result === true && last.count === 0 && last.hidden,
    JSON.stringify({ result: run.result, last })
  )

  // A press finishes the rects.
  await showAtOnce()
  await page.evaluate((to) => {
    globalThis.__done = null
    document
      .getElementById('win')
      .hide({ to: __screenBox(to) })
      .then((v) => (globalThis.__done = v))
  }, FROM)
  await page.waitForTimeout(40)
  await page.mouse.click(5, 330)
  const pressed = {
    done: await page.evaluate(() => globalThis.__done),
    canvases: await surfaceCount(),
  }
  check(
    'CLOSE  a press finishes the rects at once: hide() resolves true, the canvases gone',
    pressed.done === true && pressed.canvases === 0,
    JSON.stringify(pressed)
  )

  // A removal leaves them running: they are the desktop's, and the window is gone.
  await showAtOnce()
  const removed = await page.evaluate(async (to) => {
    const desk = document.getElementById('desk')
    const win = document.getElementById('win')
    const surface = desk.shadowRoot.querySelector('.drag-surface')
    const p = win.hide({ to: __screenBox(to) })
    win.remove()
    await new Promise((r) => setTimeout(r, 40))
    const during = surface.querySelectorAll('canvas').length
    const v = await p
    const after = surface.querySelectorAll('canvas').length
    desk.prepend(win)
    return { during, v, after }
  }, FROM)
  check(
    'CLOSE  removing the window leaves the rects running to the end: hide() resolves true',
    removed.during === 14 && removed.v === true && removed.after === 0,
    JSON.stringify(removed)
  )

  // show() during the rects finishes them and shows the window.
  await showAtOnce()
  const reopened = await page.evaluate(async (to) => {
    const win = document.getElementById('win')
    let closed = null
    win.hide({ to: __screenBox(to) }).then((v) => (closed = v))
    await new Promise((r) => setTimeout(r, 40))
    const shownAtOnce = await win.show()
    await new Promise((r) => setTimeout(r, 0))
    const surface = document.getElementById('desk').shadowRoot.querySelector('.drag-surface')
    return { closed, shownAtOnce, hidden: win.hidden, canvases: surface.querySelectorAll('canvas').length }
  }, FROM)
  check(
    'CLOSE  a show() during the rects finishes them — hide() resolves true — and shows the window',
    reopened.closed === true &&
      reopened.shownAtOnce === false &&
      !reopened.hidden &&
      reopened.canvases === 0,
    JSON.stringify(reopened)
  )

  // hide() while the window is still opening: nothing drawn to close from.
  await resetOpen(page)
  const crossed = await page.evaluate(async (box) => {
    const win = document.getElementById('win')
    const opened = win.show({ from: __screenBox(box) })
    await new Promise((r) => setTimeout(r, 40))
    const closed = await win.hide({ to: __screenBox(box) })
    const surface = document.getElementById('desk').shadowRoot.querySelector('.drag-surface')
    return {
      opened: await opened,
      closed,
      hidden: win.hidden,
      opening: win.matches(':state(opening)'),
      canvases: surface.querySelectorAll('canvas').length,
    }
  }, FROM)
  check(
    'CLOSE  a hide() while the window is still opening takes it down — show() resolves false — and hides at once',
    crossed.opened === false &&
      crossed.closed === false &&
      crossed.hidden &&
      !crossed.opening &&
      crossed.canvases === 0,
    JSON.stringify(crossed)
  )

  // Nothing to close from, or nowhere to close to.
  const bare = await page.evaluate(async (to) => {
    const win = document.getElementById('win')
    const already = await win.hide({ to: __screenBox(to) })
    await win.show()
    const noBox = await win.hide()
    const surface = document.getElementById('desk').shadowRoot.querySelector('.drag-surface')
    return { already, noBox, hidden: win.hidden, canvases: surface.querySelectorAll('canvas').length }
  }, FROM)
  check(
    'CLOSE  on a hidden window, or without to, hide() hides at once and resolves false',
    bare.already === false && bare.noBox === false && bare.hidden && bare.canvases === 0,
    JSON.stringify(bare)
  )
  await page.close()
}

/* ── DRAG OUTLINE ─────────────────────────────────────────────────────────
   outline-drag: the title-bar drag moves an outline, and the release moves
   the window. dpr 1, scale 1, the desktop at the page's corner. */

const OUTLINE_DESK = (attrs) => `
  <vf-desktop id="desk" width="512" height="342">
    <vf-window closable id="win" heading="Outline" width="200" height="120" left="100" top="60" ${attrs}></vf-window>
  </vf-desktop>
`

/** The window's pair, placement writes so far, and the outline if there is one. */
const outlineOf = (page) =>
  page.evaluate(() => {
    const win = document.getElementById('win')
    const surface = document.getElementById('desk')?.shadowRoot.querySelector('.drag-surface')
    const canvases = surface ? [...surface.querySelectorAll('canvas')] : []
    const out = { left: win.left, top: win.top, writes: globalThis.__writes, count: canvases.length }
    const c = canvases[0]
    if (c) {
      const b = c.getBoundingClientRect()
      const sr = surface.getBoundingClientRect()
      const cs = getComputedStyle(c)
      out.box = { x: b.x - sr.x, y: b.y - sr.y, w: b.width, h: b.height }
      out.pen = { filter: cs.filter, blend: cs.mixBlendMode, pointer: cs.pointerEvents, z: cs.zIndex }
      // Ink exactly on the one-pixel border, and there only where x + y is
      // odd on the screen.
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let wrong = 0
      let inked = 0
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const ink = data[(y * c.width + x) * 4 + 3] > 0
          const ring = x === 0 || y === 0 || x === c.width - 1 || y === c.height - 1
          const odd = ((Math.round(out.box.x) + x + Math.round(out.box.y) + y) & 1) === 1
          if (ink !== (ring && odd)) wrong++
          if (ink) inked++
        }
      }
      out.ring = { raster: [c.width, c.height], wrong, inked }
    }
    return out
  })

const countWrites = (page) =>
  page.evaluate(() => {
    globalThis.__writes = 0
    document.addEventListener('vf-placement-change', (e) => {
      if (e.target.id === 'win') globalThis.__writes++
    })
  })

const titleBarPoint = (page) =>
  page.evaluate(() => {
    const r = document
      .getElementById('win')
      .shadowRoot.querySelector('[part=title-bar]')
      .getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })

{
  const page = await build(OUTLINE_DESK('movable outline-drag'), { settle: true })
  await countWrites(page)

  // A drag by (60, 40): the outline goes, the window stays.
  let bar = await titleBarPoint(page)
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 60, bar.y + 40, { steps: 6 })
  const mid = await outlineOf(page)
  check(
    'DRAG OUTLINE  the window stays put mid-drag, and nothing is written',
    mid.left === 100 && mid.top === 60 && mid.writes === 0,
    JSON.stringify(mid)
  )
  check(
    "DRAG OUTLINE  one canvas on the desktop's surface: the window's box moved by the drag",
    mid.count === 1 && sameBox(mid.box, { x: 160, y: 100, w: 200, h: 120 }),
    JSON.stringify(mid.box)
  )
  check(
    'DRAG OUTLINE  the XOR pen, never a hit, one tier above the menu bar',
    mid.pen?.filter === 'invert(1)' &&
      mid.pen.blend === 'difference' &&
      mid.pen.pointer === 'none' &&
      Number(mid.pen.z) === 2_000_001,
    JSON.stringify(mid.pen)
  )
  check(
    "DRAG OUTLINE  a one-pixel ring at the frame's size, dotted on the screen's odd diagonal",
    mid.ring?.raster[0] === 200 && mid.ring.raster[1] === 120 && mid.ring.wrong === 0 && mid.ring.inked > 0,
    JSON.stringify(mid.ring)
  )
  await page.mouse.up()
  const released = await outlineOf(page)
  check(
    'DRAG OUTLINE  the release moves the window to where the outline was, in one write',
    released.left === 160 && released.top === 100 && released.writes === 1 && released.count === 0,
    JSON.stringify(released)
  )

  // Escape cancels: the outline goes, nothing is written, now or at the release.
  bar = await titleBarPoint(page)
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x - 40, bar.y + 30, { steps: 4 })
  const before = await outlineOf(page)
  await page.keyboard.press('Escape')
  const escaped = await outlineOf(page)
  await page.mouse.move(bar.x - 60, bar.y + 50, { steps: 2 })
  await page.mouse.up()
  const after = await outlineOf(page)
  check(
    'DRAG OUTLINE  Escape takes the outline down and nothing is written',
    before.count === 1 &&
      escaped.count === 0 &&
      after.count === 0 &&
      after.left === 160 &&
      after.top === 100 &&
      after.writes === 1,
    JSON.stringify({ before: before.count, escaped: escaped.count, after })
  )

  // A mouse move with no button down just before the release drops the
  // capture, and the release lands on the window's body, not the bar. The
  // lost capture is the release: the window lands, the outline goes.
  bar = await titleBarPoint(page)
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 60, bar.y + 40, { steps: 6 })
  await buttonlessMove(page, bar.x + 60, bar.y + 40)
  await page.mouse.up()
  const lost = await outlineOf(page)
  check(
    'DRAG OUTLINE  a capture lost before the release lands the window there, and the outline goes',
    lost.left === 220 && lost.top === 140 && lost.writes === 2 && lost.count === 0,
    JSON.stringify(lost)
  )

  // Held where the window can land: pushed past the top-left, the outline
  // stops where the clamp holds the window — a grabbable strip in, the title
  // bar never above the screen — and the window lands there.
  bar = await titleBarPoint(page)
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x - 600, bar.y - 400, { steps: 6 })
  const pushed = await outlineOf(page)
  await page.mouse.up()
  const landed = await outlineOf(page)
  check(
    'DRAG OUTLINE  the outline is held where the window can land, and the window lands there',
    sameBox(pushed.box, { x: 24 - 200, y: 0, w: 200, h: 120 }) &&
      landed.left === 24 - 200 &&
      landed.top === 0,
    JSON.stringify({ outline: pushed.box, landed: [landed.left, landed.top] })
  )
  await page.close()
}

// The release is announced: a listener on the desktop hears the drag's end
// as vf-placement-change with the window's new pair — one write for an
// outline drag, the last of the steps' writes for a live one.
for (const [label, attrs] of [
  ['an outline drag', 'movable outline-drag'],
  ['a live drag', 'movable'],
]) {
  const page = await build(OUTLINE_DESK(attrs), { settle: true })
  await page.evaluate(() => {
    globalThis.__heard = []
    document.getElementById('desk').addEventListener('vf-placement-change', (e) => {
      if (e.target.id === 'win') globalThis.__heard.push(`${e.detail.left},${e.detail.top}`)
    })
  })
  const bar = await titleBarPoint(page)
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 60, bar.y + 40, { steps: 6 })
  await page.mouse.up()
  const heard = await page.evaluate(() => globalThis.__heard)
  check(
    `PLACEMENT EVENT  the desktop hears ${label}'s release as vf-placement-change, with the new pair`,
    heard.at(-1) === '160,100' && (attrs.includes('outline') ? heard.length === 1 : heard.length > 1),
    heard.join(' ')
  )
  await page.close()
}

/* ── WORK AREA ────────────────────────────────────────────────────────────
   A window dragged up on a desktop with a menu bar stops with its title bar
   under the bar, outline or live; `window-top` holds it deeper. The clamp's
   box is the screen, bezel excluded, and its floor rounds up to the
   placement lattice (21 on a lattice of 3, at dpr 3). */

const BAR = `<vf-menu-bar><vf-menu label="File"><vf-menu-item value="x">X</vf-menu-item></vf-menu></vf-menu-bar>`
for (const [label, desk, attrs, dpr, want] of [
  ['an outline drag', 'width="512" height="342"', 'movable outline-drag', 1, '100,20'],
  ['a live drag', 'width="512" height="342"', 'movable', 1, '100,20'],
  ['window-top="56"', 'width="512" height="342" window-top="56"', 'movable outline-drag', 1, '100,56'],
  ['on a lattice of 3 (dpr 3)', 'width="512" height="342"', 'movable outline-drag', 3, '99,21'],
]) {
  const page = await build(
    `<vf-desktop id="desk" ${desk}>${BAR}
       <vf-window closable id="win" heading="Up" width="200" height="120" left="100" top="150" ${attrs}></vf-window>
     </vf-desktop>`,
    { settle: true, dpr }
  )
  const bar = await titleBarPoint(page)
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x, bar.y - 400, { steps: 6 })
  await page.mouse.up()
  const at = await page.evaluate(() => {
    const w = document.getElementById('win')
    return `${w.left},${w.top}`
  })
  check(`WORK AREA  ${label}: a window dragged up stops under the menu bar`, at === want, at)
  await page.close()
}
{
  // A bezeled screen: the clamp's box is the screen, so a window pushed right
  // keeps its grabbable strip on the screen, not under the bezel.
  const page = await build(
    `<vf-desktop id="desk" width="502" height="332" bezel="5">${BAR}
       <vf-window closable id="win" heading="Right" width="200" height="120" left="100" top="150" movable></vf-window>
     </vf-desktop>`,
    { settle: true }
  )
  const bar = await titleBarPoint(page)
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 600, bar.y, { steps: 6 })
  await page.mouse.up()
  const left = await page.evaluate(() => document.getElementById('win').left)
  check('WORK AREA  on a bezeled desktop the clamp is the screen’s, bezel excluded', left === 502 - 24, String(left))
  await page.close()
}

/* ── CHROME ───────────────────────────────────────────────────────────────
   windowChrome() states the insets between a window's outer box and its
   content region — the body, or the scrolled plane's viewport under
   `scrollbars` — for its declared options; each case is measured off a
   rendered window at dpr 1 and 2 and compared, in system px. sizeLimits
   reads the sizeRect as it applies. */

{
  const CASES = [
    ['a document window', '', {}],
    ['a utility window', 'variant="utility"', { variant: 'utility' }],
    [
      'a folder window (both rails, a 20px header)',
      'scrollbars="both" header-height="20"',
      { scrollbars: 'both', headerHeight: 20 },
      '<vf-label slot="header">3 items</vf-label>',
    ],
    [
      'a palette (utility, vertical rail, status strip)',
      'variant="utility" scrollbars="vertical" resizable',
      { variant: 'utility', scrollbars: 'vertical', status: true },
      '<vf-label slot="status">2 colors</vf-label>',
    ],
    [
      'a horizontal rail over a status strip',
      'scrollbars="horizontal" resizable',
      { scrollbars: 'horizontal', status: true },
      '<vf-label slot="status">ready</vf-label>',
    ],
    ['a resizable window with one rail (the corner cell kept)', 'scrollbars="vertical" resizable', { scrollbars: 'vertical' }],
    [
      'a header and a status strip, no rails',
      'header-height="24"',
      { headerHeight: 24, status: true },
      '<vf-label slot="header">head</vf-label><vf-label slot="status">foot</vf-label>',
    ],
  ]
  for (const dpr of [1, 2]) {
    const markup = CASES.map(
      ([, attrs, , slots = ''], i) =>
        `<vf-window closable id="c${i}" heading="C" width="240" height="160" left="${8 + (i % 3) * 250}" top="${8 + Math.floor(i / 3) * 170}" ${attrs}>${slots}</vf-window>`
    ).join('')
    const page = await build(`<div style="position:relative;width:1100px;height:600px">${markup}</div>`, {
      dpr,
      settle: true,
    })
    const got = await page.evaluate((cases) => {
      return import('/src/index.js').then((m) =>
        cases.map(([, , options], i) => {
          const win = document.getElementById(`c${i}`)
          const scale = parseFloat(getComputedStyle(win).getPropertyValue('--vf-scale'))
          const area = win.shadowRoot.querySelector('vf-scroll-area')
          const content = area
            ? area.shadowRoot.querySelector('[part="viewport"]')
            : win.shadowRoot.querySelector('.body')
          const o = win.getBoundingClientRect()
          const c = content.getBoundingClientRect()
          const sys = (v) => Math.round((v / scale) * 1000) / 1000
          return {
            measured: {
              top: sys(c.top - o.top),
              right: sys(o.right - c.right),
              bottom: sys(o.bottom - c.bottom),
              left: sys(c.left - o.left),
            },
            stated: m.windowChrome(options),
          }
        })
      )
    }, CASES)
    got.forEach(({ measured, stated }, i) => {
      check(
        `CHROME  dpr ${dpr}: windowChrome() is ${CASES[i][0]}'s insets, as rendered`,
        JSON.stringify(measured) === JSON.stringify(stated),
        `measured ${JSON.stringify(measured)}, stated ${JSON.stringify(stated)}`
      )
    })
    await page.close()
  }

  const page = await build(
    `<div style="position:relative;width:900px;height:600px">
       <vf-window closable id="d" heading="D" width="240" height="160" resizable></vf-window>
       <vf-window closable id="e" heading="E" width="240" height="160" resizable min-width="185" min-height="160" max-height="300"></vf-window>
     </div>`
  )
  const limits = await page.evaluate(() =>
    ['d', 'e'].map((id) => JSON.stringify(document.getElementById(id).sizeLimits))
  )
  check(
    'CHROME  sizeLimits: the 80×54 floor and no max by default, a window’s own min and max where stated',
    limits[0] === '{"minWidth":80,"minHeight":54,"maxWidth":null,"maxHeight":null}' &&
      limits[1] === '{"minWidth":185,"minHeight":160,"maxWidth":null,"maxHeight":300}',
    limits.join(' ')
  )
  await page.close()
}

// Unset, and with no desktop to draw on, the window moves live.
for (const [label, markup] of [
  ['without outline-drag', OUTLINE_DESK('movable')],
  [
    'with no desktop',
    `<div style="position:relative;width:900px;height:700px">
       <vf-window closable id="win" heading="Outline" width="200" height="120" left="100" top="60" movable outline-drag></vf-window>
     </div>`,
  ],
]) {
  const page = await build(markup, { settle: true })
  await countWrites(page)
  const bar = await titleBarPoint(page)
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 60, bar.y + 40, { steps: 6 })
  const mid = await outlineOf(page)
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length)
  await page.mouse.up()
  const end = await outlineOf(page)
  check(
    `DRAG OUTLINE  ${label} the window moves live, with no outline`,
    mid.left === 160 && mid.top === 100 && mid.writes > 1 && mid.count === 0 && canvases === 0 &&
      end.left === 160 && end.top === 100,
    JSON.stringify({ mid, end, canvases })
  )
  await page.close()
}

/* ── CLOSE BOX KEYS ───────────────────────────────────────────────────────
   The close box's vf-close carries the modifier keys held on its click. */
{
  const page = await build(
    `<div style="position:relative;width:600px;height:400px">
       <vf-window closable id="win" heading="Keys" width="200" height="120" left="40" top="40"></vf-window>
     </div>`
  )
  await page.evaluate(() => {
    window.__closes = []
    document.getElementById('win').addEventListener('vf-close', (e) => window.__closes.push(e.detail))
  })
  const box = await page.evaluate(() => {
    const r = document.getElementById('win').shadowRoot.querySelector('[part=close-box]').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.click(box.x, box.y)
  await page.keyboard.down('Alt')
  await page.mouse.click(box.x, box.y)
  await page.keyboard.up('Alt')
  const closes = await page.evaluate(() => window.__closes)
  check(
    'CLOSE BOX KEYS  a click fires vf-close with no keys held; an Option-click with altKey',
    closes.length === 2 && closes[0].reason === 'close' && closes[0].altKey === false && closes[1].altKey === true,
    JSON.stringify(closes)
  )
  await page.close()
}

await report(browser)
