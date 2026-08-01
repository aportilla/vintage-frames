/**
 * Verifies the zoom half of the display-scale model (src/zoom.ts + the
 * scale.ts wiring). Four parts:
 *
 *   (a) the pure zoom→target math, in Node with no browser — the whole
 *       zoom→device-px quantization table, the clamps, and the ladder
 *       snapping that keeps round(3z) from fluttering at z = 1.5.
 *   (b) Chromium end-to-end via CDP. Playwright has no page-zoom API, but
 *       `Emulation.setDeviceMetricsOverride` reproduces exactly the signals
 *       Chrome-style zoom produces — deviceScaleFactor × Z with the CSS
 *       viewport shrunk by Z — and the module reads nothing else.
 *   (c) Safari-shaped signals: deviceScaleFactor held at the baseline while
 *       the viewport shrinks, outer size stubbed still. The only automated
 *       coverage Safari's path gets.
 *   (d) The display-change guard, both directions: a dpr change with the
 *       screen geometry moving is a monitor move (physical size must hold,
 *       zoom must stay 1), a dpr change with the screen held is zoom (size
 *       must follow). One test each way keeps the classifier honest — testing
 *       only the zoom direction would pass with the classifier deleted.
 *
 *   npm run dev          # in another shell (port 5173) — parts b/c/d
 *   npm run verify:zoom  # compiles src/zoom.ts to scripts/.tmp first
 */
import { chromium } from 'playwright'
import {
  DEVICE_PX_PER_SYSTEM_PX,
  ZOOM_LADDER,
  devicePxPerSystemPx,
  quantizeZoom,
} from './.tmp/zoom.js'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

/* ── (a) pure functions ─────────────────────────────────────────────────── */

console.log('— (a) pure zoom→target math —')

// The quantization table (README, "Following the user's zoom"): identical on
// every display, stepping only at the zoom levels where round(3z) moves.
const TABLE = [
  [0.25, 1],
  [0.33, 1],
  [0.5, 2],
  [0.67, 2],
  [0.75, 2],
  [0.8, 2],
  [0.9, 3],
  [1, 3],
  [1.1, 3],
  [1.25, 4],
  [1.5, 5], // ties round UP: 4.5 → 5, erring toward larger
  [1.75, 5],
  [2, 6],
  [2.5, 8], // 7.5 → 8, same rule
  [3, 9],
  [4, 12],
  [5, 15],
]
check(
  'the whole quantization table',
  TABLE.every(([z, target]) => devicePxPerSystemPx(z) === target),
  TABLE.map(([z, t]) => `${z}→${devicePxPerSystemPx(z)}${devicePxPerSystemPx(z) === t ? '' : '≠' + t}`).join(' ')
)
check('zoom 1 is exactly today', devicePxPerSystemPx(1) === DEVICE_PX_PER_SYSTEM_PX)
check(
  'the floor: art never drops below 1 device px per system px',
  devicePxPerSystemPx(0.1) === 1 && devicePxPerSystemPx(0) === 1
)
check(
  'the ceiling guards a mis-measured zoom',
  devicePxPerSystemPx(50) === 24,
  `50 → ${devicePxPerSystemPx(50)}`
)
check(
  'measured zoom snaps to the ladder across the 1.5 threshold',
  quantizeZoom(1.4998) === 1.5 && quantizeZoom(1.5001) === 1.5,
  `${quantizeZoom(1.4998)}, ${quantizeZoom(1.5001)}`
)
check(
  'off-ladder zoom passes through raw',
  quantizeZoom(1.37) === 1.37,
  String(quantizeZoom(1.37))
)
check(
  'every ladder entry is its own fixed point',
  ZOOM_LADDER.every((z) => quantizeZoom(z) === z)
)
check(
  'garbage reads as 100%',
  quantizeZoom(0) === 1 && quantizeZoom(-2) === 1 && quantizeZoom(NaN) === 1
)

/* ── shared browser harness ─────────────────────────────────────────────── */

// VF_ZOOM_PURE=1 stops after (a) — the one-second regression catch, no dev
// server or browser needed.
if (process.env.VF_ZOOM_PURE) {
  const failed = results.filter((r) => !r).length
  console.log(`\n${results.length - failed}/${results.length} checks passed (pure only)`)
  process.exit(failed ? 1 : 0)
}

const PAGE = `
  <body style="margin: 0; padding: 8px">
    <vf-button id="btn">Button</vf-button>
  </body>`

/**
 * A page built the consumer way — markup first, module second — with the CDP
 * session that stands in for the browser's zoom control. The screen geometry
 * is emulated from launch and every later override restates it, so the
 * tracker's baseline signature (sampled at module import) and the signature it
 * reads during a change only differ when a test *means* them to.
 */
async function build(browser, { dpr, screen, stubOuter = false }) {
  const page = await browser.newPage({
    viewport: { width: 1320, height: 950 },
    deviceScaleFactor: dpr,
    screen,
  })
  if (stubOuter) {
    // Safari's outer size is in screen px and never moves under zoom; headless
    // Chromium reports outerWidth = innerWidth, which would read every zoom as
    // a window resize. Pin it the way a real macOS window is pinned.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'outerWidth', { get: () => 1320 })
      Object.defineProperty(window, 'outerHeight', { get: () => 950 })
    })
  }
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(PAGE)
  await page.evaluate(() => import('/src/index.ts'))
  await page.evaluate(() => document.getElementById('btn').updateComplete)
  const cdp = await page.context().newCDPSession(page)
  return { page, cdp }
}

/** Everything the assertions need, read in one evaluate. */
const measure = (page) =>
  page.evaluate(async () => {
    const mod = await import('/src/index.ts')
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const btn = document.getElementById('btn')
    await btn.updateComplete
    return {
      zoom: mod.getZoom(),
      trueDpr: mod.truePixelRatio(),
      scale: parseFloat(getComputedStyle(btn).getPropertyValue('--vf-scale')),
      height: btn.getBoundingClientRect().height,
      dpr: window.devicePixelRatio,
    }
  })

/**
 * Chrome-style zoom Z on a baseline-dpr display: dpr multiplies by Z, the CSS
 * viewport shrinks by Z, the screen geometry holds (the working hypothesis for
 * Blink — screen.* in DIPs, unaffected by page zoom; zoom-probe.html is how
 * each real engine's hypothesis gets confirmed, and the tracker accepts both).
 */
const chromeZoom = (cdp, dpr, Z) =>
  cdp.send('Emulation.setDeviceMetricsOverride', {
    width: Math.round(1320 / Z),
    height: Math.round(950 / Z),
    deviceScaleFactor: dpr * Z,
    mobile: false,
    screenWidth: 2560,
    screenHeight: 1440,
  })

/* ── (b) Chrome-shaped zoom, end to end ─────────────────────────────────── */

const browser = await chromium.launch()

console.log('\n— (b) Chromium via CDP: dpr folds the zoom in —')

// Chromium lays out in 1/64 CSS px, so a size assertion is only good to
// one layout unit per edge — trueDpr/64 device px across a height.
const layoutTolerance = (trueDpr) => Math.max(1e-6, trueDpr / 64)

for (const dpr of [1, 2, 3]) {
  const { page, cdp } = await build(browser, {
    dpr,
    screen: { width: 2560, height: 1440 },
  })
  const base = await measure(page)
  check(
    `dpr ${dpr}: zoom 1 is bit-identical to today`,
    base.zoom === 1 && base.scale === 3 / dpr && base.trueDpr === dpr,
    `scale ${base.scale}, trueDpr ${base.trueDpr}`
  )

  for (const Z of ZOOM_LADDER) {
    await chromeZoom(cdp, dpr, Z)
    const m = await measure(page)
    const target = devicePxPerSystemPx(Z)
    const devices = m.height * m.trueDpr
    // CDP stores deviceScaleFactor as float32, so the page reports e.g.
    // 0.33000001311302185 for 0.33. The module must treat the *reported* dpr
    // as the truth (quantizeZoom absorbs the wobble); the ideal value is only
    // a sanity bound on the harness itself.
    const ok =
      m.zoom === Z &&
      Math.abs(m.dpr - dpr * Z) / (dpr * Z) < 1e-6 &&
      Math.abs(m.trueDpr - m.dpr) < 1e-9 &&
      Math.abs(m.scale - target / m.trueDpr) < 1e-9 &&
      Math.abs(devices - 20 * target) <= layoutTolerance(m.trueDpr)
    check(
      `dpr ${dpr} zoom ${Z}: 20 sys px → ${20 * target} device px`,
      ok,
      `zoom ${m.zoom}, trueDpr ${m.trueDpr}, --vf-scale ${m.scale}, ${devices.toFixed(3)} device px`
    )
    // The table's last column: physical size relative to 100%.
    const physical = (m.height * m.trueDpr) / (base.height * base.trueDpr)
    check(
      `dpr ${dpr} zoom ${Z}: physical size is ${target}/3 of 100%`,
      Math.abs(physical - target / 3) < 0.01,
      physical.toFixed(4)
    )
  }

  // Back to 100%: no error accumulated across the whole ladder.
  await chromeZoom(cdp, dpr, 1)
  const back = await measure(page)
  check(
    `dpr ${dpr}: returning to 100% returns to exactly the launch state`,
    back.zoom === 1 && back.scale === 3 / dpr && back.height === base.height,
    `zoom ${back.zoom}, scale ${back.scale}`
  )
  await page.close()
}

/* ── (c) Safari-shaped zoom: dpr holds, the viewport shrinks ────────────── */

console.log('\n— (c) Safari-shaped signals: path 2 in isolation —')

for (const dpr of [1, 2]) {
  const { page, cdp } = await build(browser, {
    dpr,
    screen: { width: 2560, height: 1440 },
    stubOuter: true,
  })
  for (const Z of [1.5, 2, 3, 1]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: Math.round(1320 / Z),
      height: Math.round(950 / Z),
      deviceScaleFactor: dpr, // Safari: pinned to the hardware
      mobile: false,
      screenWidth: 2560,
      screenHeight: 1440,
    })
    const m = await measure(page)
    const target = devicePxPerSystemPx(Z)
    // The tracker must arrive at the same --vf-scale as (b) did for this Z:
    // scale = target / (dpr × Z) — even though devicePixelRatio never moved.
    // The ladder values here survive float32 exactly, so the compare is exact.
    check(
      `dpr ${dpr} Safari-zoom ${Z}: same scale as the Chrome path`,
      m.zoom === Z &&
        Math.abs(m.trueDpr - dpr * Z) < 1e-9 &&
        Math.abs(m.scale - target / (dpr * Z)) < 1e-9,
      `zoom ${m.zoom}, trueDpr ${m.trueDpr}, --vf-scale ${m.scale}, dPR ${m.dpr}`
    )
  }

  // Devtools-shaped: one axis changes, the other holds — must NOT read as zoom.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 990,
    height: 950,
    deviceScaleFactor: dpr,
    mobile: false,
    screenWidth: 2560,
    screenHeight: 1440,
  })
  const docked = await measure(page)
  check(
    `dpr ${dpr}: a one-axis viewport change (devtools dock) is not zoom`,
    docked.zoom === 1,
    `zoom ${docked.zoom}`
  )
  await page.close()
}

/* ── (d) the display-change guard ───────────────────────────────────────── */

console.log('\n— (d) a monitor move is not a zoom —')

{
  // A window dragged from a 2× display to a 1× one: dpr halves AND the screen
  // geometry changes to the new display's. Physical size must hold — this is
  // the behavior that works today and must not regress.
  const { page, cdp } = await build(browser, {
    dpr: 2,
    screen: { width: 1728, height: 1117 },
  })
  const before = await measure(page)

  // A pure deviceScaleFactor change dispatches NO events under CDP emulation —
  // no resize, no media-query change (probed; real engines re-evaluate
  // resolution queries on a density change). The 10-px width nudge makes the
  // emulation deliver the signal the way a real monitor move would.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1310,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1920, // neither unchanged nor scaled by 1/r = 2 — a new display
    screenHeight: 1080,
  })
  const after = await measure(page)
  check(
    'getZoom() is still 1 after the move',
    after.zoom === 1,
    `zoom ${after.zoom}`
  )
  check(
    'physical size held across the move',
    Math.abs(before.height * before.trueDpr - after.height * after.trueDpr) <
      layoutTolerance(2),
    `${(before.height * before.trueDpr).toFixed(3)} → ${(after.height * after.trueDpr).toFixed(3)} device px`
  )
  check(
    '--vf-scale × trueDpr is still 3',
    Math.abs(after.scale * after.trueDpr - 3) < 1e-9,
    `${after.scale} × ${after.trueDpr}`
  )

  // The inverse: the same dpr change with every screen metric held IS zoom.
  // Only testing the display direction would pass with the classifier deleted.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 660,
    height: 475,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 1920,
    screenHeight: 1080,
  })
  const zoomed = await measure(page)
  check(
    'the same ratio with the screen held reads as zoom',
    zoomed.zoom === 2 && Math.abs(zoomed.scale * zoomed.trueDpr - 6) < 1e-9,
    `zoom ${zoomed.zoom}, scale ${zoomed.scale}, trueDpr ${zoomed.trueDpr}`
  )
  await page.close()
}

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
