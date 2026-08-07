/**
 * Verifies vf-desktop's single-active-window model survives a *late* vf-window
 * upgrade — the case where a consumer imports only vf-desktop, so the slotted
 * <vf-window> elements are still unknown elements when slotchange fires and
 * only upgrade later (their reflected `active = true` default then tries to
 * re-add the attribute the desktop just cleared).
 *
 * Needs the vite dev server, because the point of the test is importing
 * vf-desktop.js *without* vf-window.js — the built bundle defines both at once.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:desktop
 */
import { ORIGIN, check, launch, report } from './harness.mjs'

const MARKUP = `
  <vf-desktop id="desk" style="height: 400px">
    <vf-window id="w1" heading="One" width="200" height="80">one</vf-window>
    <vf-window id="w2" heading="Two" width="200" height="80">two</vf-window>
    <vf-window id="w3" heading="Three" width="200" height="80">three</vf-window>
  </vf-desktop>
  <vf-window id="lone" heading="Standalone" width="200" height="80">lone</vf-window>
`

/** Which windows carry the `active` attribute, in document order. */
const activeAttrs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('vf-desktop vf-window')]
      .filter((w) => w.hasAttribute('active'))
      .map((w) => w.id)
  )

/** Let slotchange + Lit's update queue + reflection settle. */
const settle = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )

const browser = await launch()
const page = await browser.newPage()

// The demo index.html imports src/index.ts, which defines *every* component —
// serve a bare stub at the origin instead so the registry starts empty while
// /src/... module requests still hit the dev server.
await page.route(ORIGIN, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
)
await page.goto(ORIGIN)
await page.unroute(ORIGIN)
await page.setContent(MARKUP)

// ── Phase 1: only vf-desktop defined; windows are still unknown elements ──
await page.evaluate(() => import('/src/components/vf-desktop.js'))
await page.evaluate(() => customElements.whenDefined('vf-desktop'))
await settle(page)

const defined = await page.evaluate(() => !!customElements.get('vf-window'))
check('vf-window is NOT yet defined (the scenario under test)', defined === false)

const before = await activeAttrs(page)
check(
  'pre-upgrade: exactly the topmost window is active',
  before.length === 1 && before[0] === 'w3',
  `active = [${before}]`
)

// ── Phase 2: vf-window upgrades late ──
await page.evaluate(() => import('/src/components/vf-window.js'))
await page.evaluate(() => customElements.whenDefined('vf-window'))
await page.evaluate(() =>
  Promise.all([...document.querySelectorAll('vf-window')].map((w) => w.updateComplete))
)
await settle(page)

const after = await activeAttrs(page)
check(
  'post-upgrade: still exactly one active window, unchanged',
  after.length === 1 && after[0] === 'w3',
  `active = [${after}]`
)

const props = await page.evaluate(() =>
  ['w1', 'w2', 'w3'].map((id) => document.getElementById(id).active)
)
check(
  'post-upgrade: the `active` *property* agrees with the attribute',
  JSON.stringify(props) === JSON.stringify([false, false, true]),
  `[w1, w2, w3] = [${props}]`
)

// The inactive chrome is driven by `:host(:not([active])) .vf-stripes
// { display: none }` — so this asserts the attribute actually reached CSS,
// not just the DOM.
const stripesVisible = await page.evaluate(() =>
  ['w1', 'w3'].map((id) => {
    const stripes = document.getElementById(id).shadowRoot.querySelector('.vf-stripes')
    return stripes ? getComputedStyle(stripes).display !== 'none' : null
  })
)
check(
  'post-upgrade: background window renders no title-bar stripes',
  stripesVisible[0] === false && stripesVisible[1] === true,
  `[w1, w3] stripes = [${stripesVisible}]`
)

// ── Phase 3: the standalone default the fix deliberately preserves ──
const lone = await page.evaluate(() => {
  const el = document.getElementById('lone')
  return { attr: el.hasAttribute('active'), prop: el.active }
})
check(
  'a standalone vf-window (no desktop) is still active by default',
  lone.attr === true && lone.prop === true,
  `attr=${lone.attr} prop=${lone.prop}`
)

// ── Phase 4: normal activation still works after the upgrade path ──
await page.locator('#w1').click({ position: { x: 20, y: 40 } })
await settle(page)
const clicked = await activeAttrs(page)
check(
  'clicking a background window activates it alone',
  clicked.length === 1 && clicked[0] === 'w1',
  `active = [${clicked}]`
)

await report(browser)
