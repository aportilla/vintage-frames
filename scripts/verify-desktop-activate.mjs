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
    <vf-window id="w1" heading="One" top="60" left="20" width="200" height="100">one</vf-window>
    <vf-window id="w2" heading="Two" top="60" left="240" width="200" height="100">two</vf-window>
    <vf-window id="pal" heading="Pal" variant="utility" top="60" left="470" width="100" height="80">pal</vf-window>
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

await report(browser)
