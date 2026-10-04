/**
 * Verifies vf-desktop's application-activation model — the Finder-style
 * deactivation layer over the single-active invariant:
 *
 *  - CLEARACTIVE: `clearActive()` clears `active` from the whole document
 *    tier — the page's "the user clicked the Finder" handler. Zero active
 *    windows is a legal state; utility windows keep their `active` (their
 *    dots stay drawn). The desktop never takes the decision itself: a press
 *    on its own bare dither changes nothing, active or deactivated.
 *  - VF-ACTIVATE: every change of holder — window to window, window to
 *    none, none to window — fires exactly one `vf-activate` with
 *    `{ window }` in the detail; re-asserting the current holder is silent.
 *  - ACTIVEWINDOW: the getter tracks the holder through every change.
 *  - SLOT CHANGES: a deliberate deactivation survives background-window
 *    removal (no survivor promotion), a newly slotted document window
 *    activates (opening a window brings its application forward), and
 *    removing the *holder* promotes the topmost survivor.
 *  - HIDDEN: a hidden window never holds the active state — slotted hidden it
 *    waits, `bringToFront()` restacks it and activates nothing, the holder
 *    hiding (the attribute or `hide()`) promotes the topmost shown window or
 *    none, and a window shown into an empty tier takes the state unless the
 *    tier was deliberately deactivated.
 *  - SCRIPTED: a utility window made by script — `variant` set as a
 *    property, appended in the same task, slotted before the attribute
 *    reflects — still stacks in the floating tier and keeps `active`.
 *  - STACKING: `stackingOrder` is the stack as it stands, bottom-most first,
 *    the floating tier last — after a focus raise too, which moves no node.
 *  - ⌘-DRAG: a ⌘-press on a background window's title bar drags it without
 *    raising or activating it.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:desktop-activate
 */
import { check, launch, makeBuild, report } from './harness.mjs'

const browser = await launch()
const build = makeBuild(browser)

/** dpr 1: scale 1, so system px and CSS px coincide and clicks are bare. */
const PAGE = `
  <vf-desktop id="desk" width="600" height="450">
    <vf-window closable id="w1" heading="One" top="60" left="20" width="200" height="100">one</vf-window>
    <vf-window closable id="w2" heading="Two" top="60" left="240" width="200" height="100">two</vf-window>
    <vf-window closable id="pal" heading="Pal" variant="utility" top="60" left="470" width="100" height="80">pal</vf-window>
  </vf-desktop>
`

/** Instrument AFTER boot: the log holds only the interactions under test. */
const instrument = (page) =>
  page.evaluate(() => {
    window.vfEvents = []
    document.getElementById('desk').addEventListener('vf-activate', (event) => {
      window.vfEvents.push(event.detail.window ? event.detail.window.id : null)
    })
  })

const state = (page) =>
  page.evaluate(() => {
    const desk = document.getElementById('desk')
    return {
      active: [...desk.querySelectorAll('vf-window')]
        .filter((w) => w.hasAttribute('active'))
        .map((w) => w.id),
      holder: desk.activeWindow ? desk.activeWindow.id : null,
      events: [...window.vfEvents],
    }
  })

/** Two frames: slotchange + Lit's update queue + reflection settle. */
const settle = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )

{
  const page = await build(PAGE)
  await instrument(page)

  // ── boot ──
  let s = await state(page)
  check(
    'boot: the last-slotted document window is active and tracked',
    s.active.length === 2 &&
      s.active.includes('w2') &&
      s.active.includes('pal') &&
      s.holder === 'w2',
    `active = [${s.active}], activeWindow = ${s.holder}`
  )

  // ── a press on the bare dither is not the desktop's decision ──
  await page.mouse.click(300, 350)
  s = await state(page)
  check(
    'a press on the bare dither deactivates nothing (the page decides)',
    s.holder === 'w2' && s.active.includes('w2') && s.events.length === 0,
    `activeWindow = ${s.holder}, events = ${JSON.stringify(s.events)}`
  )

  // ── clearActive() deactivates the document tier ──
  await page.evaluate(() => document.getElementById('desk').clearActive())
  s = await state(page)
  check(
    'clearActive() clears the document tier (zero active is legal)',
    !s.active.includes('w1') && !s.active.includes('w2') && s.holder === null,
    `active = [${s.active}], activeWindow = ${s.holder}`
  )
  check(
    '…the utility window keeps its active state (dots stay drawn)',
    s.active.includes('pal'),
    `active = [${s.active}]`
  )
  check(
    '…and exactly one vf-activate fired, with a null window',
    s.events.length === 1 && s.events[0] === null,
    `events = ${JSON.stringify(s.events)}`
  )

  // ── a repeat clearActive() is silent (no holder change) ──
  await page.evaluate(() => document.getElementById('desk').clearActive())
  s = await state(page)
  check(
    'a repeat clearActive() fires nothing (no change of holder)',
    s.events.length === 1,
    `events = ${JSON.stringify(s.events)}`
  )

  // ── a dither press while deactivated reactivates nothing either ──
  await page.mouse.click(320, 350)
  s = await state(page)
  check(
    'a dither press while deactivated changes nothing',
    s.holder === null && s.events.length === 1,
    `activeWindow = ${s.holder}, events = ${JSON.stringify(s.events)}`
  )

  // ── a utility press while deactivated leaves the tier deactivated ──
  await page.locator('#pal').click({ position: { x: 50, y: 40 } })
  s = await state(page)
  check(
    'a utility press never re-activates the document tier',
    s.holder === null && s.events.length === 1,
    `activeWindow = ${s.holder}, events = ${JSON.stringify(s.events)}`
  )

  // ── a press in a document window reactivates ──
  await page.locator('#w1').click({ position: { x: 100, y: 50 } })
  s = await state(page)
  check(
    'a press in a document window ends the deactivation',
    s.holder === 'w1' && s.active.includes('w1'),
    `activeWindow = ${s.holder}`
  )
  check(
    '…firing one vf-activate for w1',
    s.events.length === 2 && s.events[1] === 'w1',
    `events = ${JSON.stringify(s.events)}`
  )

  // ── re-asserting the holder is silent ──
  await page.locator('#w1').click({ position: { x: 120, y: 60 } })
  s = await state(page)
  check(
    'clicking inside the already-active window fires nothing',
    s.events.length === 2,
    `events = ${JSON.stringify(s.events)}`
  )

  // ── clearActive() + bringToFront() are the programmatic pair ──
  await page.evaluate(() => document.getElementById('desk').clearActive())
  await page.evaluate(() =>
    document
      .getElementById('desk')
      .bringToFront(document.getElementById('w2'))
  )
  s = await state(page)
  check(
    'clearActive() then bringToFront(w2): null then w2, tracked and fired',
    s.holder === 'w2' &&
      s.events.length === 4 &&
      s.events[2] === null &&
      s.events[3] === 'w2',
    `events = ${JSON.stringify(s.events)}, activeWindow = ${s.holder}`
  )

  // ── slot changes: deactivation survives a background removal ──
  await page.evaluate(() => document.getElementById('desk').clearActive())
  await page.evaluate(() => document.getElementById('w1').remove())
  await settle(page)
  s = await state(page)
  check(
    'removing a window while deactivated promotes no survivor',
    s.holder === null && !s.active.includes('w2'),
    `activeWindow = ${s.holder}, active = [${s.active}]`
  )

  // ── slot changes: a newly slotted document window activates ──
  await page.evaluate(() => {
    const win = document.createElement('vf-window')
    win.id = 'w3'
    win.heading = 'Three'
    win.top = 200
    win.left = 100
    win.width = 200
    win.height = 100
    document.getElementById('desk').append(win)
  })
  await settle(page)
  s = await state(page)
  check(
    'a newly slotted document window activates (opening brings the app forward)',
    s.holder === 'w3' && s.active.includes('w3') && s.events.at(-1) === 'w3',
    `activeWindow = ${s.holder}, events = ${JSON.stringify(s.events)}`
  )

  // ── slot changes: removing the holder promotes the topmost survivor ──
  await page.evaluate(() => document.getElementById('w3').remove())
  await settle(page)
  s = await state(page)
  check(
    'removing the holder promotes the topmost surviving document window',
    s.holder === 'w2' && s.active.includes('w2') && s.events.at(-1) === 'w2',
    `activeWindow = ${s.holder}, events = ${JSON.stringify(s.events)}`
  )

  await page.close()
}

// ── HIDDEN: a hidden window never holds the active state ───────────────────
{
  const page = await build(PAGE)
  await instrument(page)
  const desk = (fn, arg) => page.evaluate(fn, arg)

  // Slotted hidden: it waits to be shown.
  await desk(() => {
    const win = document.createElement('vf-window')
    win.id = 'w4'
    win.heading = 'Four'
    Object.assign(win, { top: 200, left: 100, width: 200, height: 100 })
    win.hidden = true
    document.getElementById('desk').append(win)
  })
  await settle(page)
  let s = await state(page)
  check(
    'HIDDEN  a window slotted hidden does not activate',
    s.holder === 'w2' && !s.active.includes('w4') && s.events.length === 0,
    `activeWindow = ${s.holder}, active = [${s.active}], events = ${JSON.stringify(s.events)}`
  )

  // bringToFront on a hidden window gives it its place and nothing else.
  await desk(() => {
    const d = document.getElementById('desk')
    d.bringToFront(document.getElementById('w4'))
  })
  s = await state(page)
  const order = () => desk(() => document.getElementById('desk').stackingOrder.map((w) => w.id))
  check(
    'HIDDEN  bringToFront() on a hidden window restacks it and activates nothing',
    s.holder === 'w2' && s.events.length === 0 && (await order()).join() === 'w1,w2,w4,pal',
    `activeWindow = ${s.holder}, order = ${await order()}, events = ${JSON.stringify(s.events)}`
  )

  // Shown while another window holds: the holder keeps it until a raise.
  await desk(() => {
    document.getElementById('w4').hidden = false
  })
  await settle(page)
  s = await state(page)
  check(
    'HIDDEN  a window shown while another holds leaves the holder',
    s.holder === 'w2' && s.events.length === 0,
    `activeWindow = ${s.holder}, events = ${JSON.stringify(s.events)}`
  )
  await desk(() => document.getElementById('desk').bringToFront(document.getElementById('w4')))
  s = await state(page)
  check(
    'HIDDEN  …and raising it then activates it',
    s.holder === 'w4' && s.events.join() === 'w4',
    `activeWindow = ${s.holder}, events = ${JSON.stringify(s.events)}`
  )

  // The holder hidden by the attribute: the topmost shown window inherits.
  await desk(() => {
    document.getElementById('w4').hidden = true
  })
  await settle(page)
  s = await state(page)
  check(
    'HIDDEN  the holder hiding hands the state to the topmost shown window',
    s.holder === 'w2' && s.active.includes('w2') && !s.active.includes('w4') && s.events.at(-1) === 'w2',
    `activeWindow = ${s.holder}, active = [${s.active}], events = ${JSON.stringify(s.events)}`
  )

  // …through hide() too, down to none: the tier goes empty, the palette stays.
  await desk(async () => {
    await document.getElementById('w2').hide()
    await document.getElementById('w1').hide()
  })
  await settle(page)
  s = await state(page)
  check(
    'HIDDEN  hide() on the holder does the same, and the last shown window hiding leaves none',
    s.holder === null && s.active.join() === 'pal' && s.events.slice(-2).join() === 'w1,',
    `activeWindow = ${s.holder}, active = [${s.active}], events = ${JSON.stringify(s.events)}`
  )

  // A window shown into a tier with none active takes the state.
  await desk(() => {
    document.getElementById('w1').hidden = false
  })
  await settle(page)
  s = await state(page)
  check(
    'HIDDEN  a window shown into a tier with none active takes the state',
    s.holder === 'w1' && s.active.includes('w1') && s.events.at(-1) === 'w1',
    `activeWindow = ${s.holder}, events = ${JSON.stringify(s.events)}`
  )

  // …but a deliberate deactivation holds through a show.
  await desk(() => {
    document.getElementById('desk').clearActive()
    document.getElementById('w2').hidden = false
  })
  await settle(page)
  s = await state(page)
  check(
    'HIDDEN  a deliberate deactivation holds through a window being shown',
    s.holder === null && !s.active.includes('w1') && !s.active.includes('w2'),
    `activeWindow = ${s.holder}, active = [${s.active}]`
  )
  check(
    'HIDDEN  a hidden window never wears active',
    (await desk(() => document.getElementById('w4').hasAttribute('active'))) === false
  )
  await page.close()
}

// ── STACKING: the desktop exposes its stacking order ────────────────────────
{
  const page = await build(PAGE)
  const read = () =>
    page.evaluate(() => {
      const desk = document.getElementById('desk')
      return {
        order: desk.stackingOrder.map((w) => w.id),
        dom: [...desk.querySelectorAll(':scope > vf-window')].map((w) => w.id),
      }
    })
  let r = await read()
  check(
    'STACKING  stackingOrder lists the windows bottom-most first, the floating tier last',
    r.order.join() === 'w1,w2,pal',
    `order = ${r.order}`
  )
  // A raise by keyboard focus restacks and moves no node: the order is the
  // stack's, not the DOM's.
  await page.evaluate(() => {
    const close = document.getElementById('w1').shadowRoot.querySelector('.close')
    close.focus()
  })
  r = await read()
  check(
    'STACKING  …the stack as it stands after a focus raise, which moves no node',
    r.order.join() === 'w2,w1,pal' && r.dom.join() === 'w1,w2,pal',
    `order = ${r.order}, DOM = ${r.dom}`
  )
  check(
    'STACKING  …and a copy: changing it changes nothing',
    await page.evaluate(() => {
      const desk = document.getElementById('desk')
      desk.stackingOrder.reverse()
      return desk.stackingOrder[0].id === 'w2'
    })
  )
  await page.close()
}

// ── SCRIPTED: a palette made by script lands in the floating tier ───────────
{
  const page = await build(PAGE)
  // `variant` set as a property and the window appended in the same task:
  // slotted before the attribute reflects. One shown at once, one appended
  // hidden and shown later, as a page does with a palette whose
  // application is in the background.
  const made = await page.evaluate(async () => {
    const desk = document.getElementById('desk')
    const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const palette = (id, hidden) => {
      const pal = document.createElement('vf-window')
      pal.id = id
      pal.variant = 'utility'
      pal.heading = id
      pal.left = 300
      pal.top = 200
      pal.width = 100
      pal.height = 60
      pal.hidden = hidden
      desk.append(pal)
      return pal
    }
    const shown = palette('made', false)
    await frames()
    const first = {
      holder: desk.activeWindow?.id ?? null,
      active: shown.active,
      order: desk.stackingOrder.map((w) => w.id).join(),
    }
    const later = palette('later', true)
    await frames()
    later.hidden = false
    desk.bringToFront(later)
    await frames()
    return { ...first, laterActive: later.active }
  })
  check(
    'SCRIPTED  a utility window made by script stacks in the floating tier and takes no active state from the document windows',
    made.holder === 'w2' && made.order === 'w1,w2,pal,made',
    `activeWindow = ${made.holder}, order = ${made.order}`
  )
  check(
    'SCRIPTED  …and keeps its own active state, shown at once or later',
    made.active === true && made.laterActive === true,
    `active = ${made.active}, later = ${made.laterActive}`
  )
  await page.close()
}

// ── ⌘-DRAG: a background window moves without coming forward ───────────────
{
  const page = await build(`
    <vf-desktop id="desk" width="600" height="450">
      <vf-window closable movable id="w1" heading="One" top="60" left="20" width="200" height="100">one</vf-window>
      <vf-window closable movable id="w2" heading="Two" top="60" left="240" width="200" height="100">two</vf-window>
    </vf-desktop>
  `)
  await instrument(page)
  const bar = await page.evaluate(() => {
    const r = document.getElementById('w1').shadowRoot.querySelector('[part=title-bar]').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.keyboard.down('Meta')
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 40, bar.y + 100, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.up('Meta')
  await settle(page)
  const w1 = await page.evaluate(() => {
    const one = document.getElementById('w1')
    return { left: one.left, top: one.top, below: Number(one.style.zIndex) < Number(document.getElementById('w2').style.zIndex) }
  })
  const s = await state(page)
  check(
    '⌘-DRAG  a ⌘-press on a background window’s title bar drags it, neither raised nor activated',
    w1.left === 60 && w1.top === 160 && w1.below && s.holder === 'w2' && s.events.length === 0,
    `${JSON.stringify(w1)} holder ${s.holder}, events ${JSON.stringify(s.events)}`
  )
  await page.close()
}

await report(browser)
