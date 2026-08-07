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
import { ORIGIN, check, launch, report, results } from './harness.mjs'
import {
  DEVICE_PX_PER_SYSTEM_PX,
  ZOOM_LADDER,
  devicePxPerSystemPx,
  quantizeZoom,
} from './.tmp/zoom.js'

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
  [0.85, 3], // Safari's step below 100%: ties round up, so it holds size
  [0.9, 3],
  [1, 3],
  [1.1, 3],
  [1.15, 3], // Safari's step above 100%: inside the do-nothing band
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

const browser = await launch()

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

  // A window-edge drag at its worst: the outer size is stubbed still (a
  // stale or dead outer signal), and one coalesced resize event shrinks one
  // axis by ~2.5% — the exact shape that used to pass axis agreement, miss
  // the ladder, and ship the raw ratio as zoom, shrinking every component
  // into fractional device coverage. One axis alone must never move the scale.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 965,
    height: 950,
    deviceScaleFactor: dpr,
    mobile: false,
    screenWidth: 2560,
    screenHeight: 1440,
  })
  const dragged = await measure(page)
  check(
    `dpr ${dpr}: a width-only edge drag never moves the scale`,
    dragged.zoom === 1 && dragged.scale === 3 / dpr,
    `zoom ${dragged.zoom}, --vf-scale ${dragged.scale}`
  )

  // Both axes shrinking by a factor that is no browser zoom level (a corner
  // drag, a window-manager tile): rebase, never zoom — the old path accepted
  // this raw.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 919, // 965 / 1.05, both axes — off every ladder rung
    height: 905,
    deviceScaleFactor: dpr,
    mobile: false,
    screenWidth: 2560,
    screenHeight: 1440,
  })
  const tiled = await measure(page)
  check(
    `dpr ${dpr}: an off-ladder both-axes change is not zoom`,
    tiled.zoom === 1 && tiled.scale === 3 / dpr,
    `zoom ${tiled.zoom}, --vf-scale ${tiled.scale}`
  )

  // …and that rebase kept a later real zoom measurable from the new viewport.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 613, // 919 / 1.5, 905 / 1.5
    height: 603,
    deviceScaleFactor: dpr,
    mobile: false,
    screenWidth: 2560,
    screenHeight: 1440,
  })
  const rezoomed = await measure(page)
  check(
    `dpr ${dpr}: a real zoom after the rebase still lands`,
    rezoomed.zoom === 1.5 &&
      Math.abs(rezoomed.scale - devicePxPerSystemPx(1.5) / (dpr * 1.5)) < 1e-9,
    `zoom ${rezoomed.zoom}, --vf-scale ${rezoomed.scale}`
  )

  // Safari's own 115% — a ladder entry Chrome doesn't offer; path 2 must
  // accept it now that acceptance is ladder-only.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 799, // 919 / 1.15, 905 / 1.15
    height: 787,
    deviceScaleFactor: dpr,
    mobile: false,
    screenWidth: 2560,
    screenHeight: 1440,
  })
  const safariStep = await measure(page)
  check(
    `dpr ${dpr}: Safari's 115% step is recognized`,
    safariStep.zoom === 1.15 &&
      Math.abs(safariStep.trueDpr - dpr * 1.15) < 1e-9 &&
      Math.abs(safariStep.scale - devicePxPerSystemPx(1.15) / (dpr * 1.15)) < 1e-9,
    `zoom ${safariStep.zoom}, trueDpr ${safariStep.trueDpr}, --vf-scale ${safariStep.scale}`
  )

  // Back to 100%: the drag noise along the way cost nothing.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 919,
    height: 905,
    deviceScaleFactor: dpr,
    mobile: false,
    screenWidth: 2560,
    screenHeight: 1440,
  })
  const restored = await measure(page)
  check(
    `dpr ${dpr}: back to 100% is exactly the launch scale`,
    restored.zoom === 1 && restored.scale === 3 / dpr,
    `zoom ${restored.zoom}, --vf-scale ${restored.scale}`
  )
  await page.close()
}

{
  // The same edge drag with a LIVE outer signal (headless Chromium reports
  // outerWidth = innerWidth, so the outer branch sees it move): classified as
  // a window resize outright. Belt to the stubbed worst case above.
  const { page, cdp } = await build(browser, {
    dpr: 1,
    screen: { width: 2560, height: 1440 },
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1290,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 2560,
    screenHeight: 1440,
  })
  const m = await measure(page)
  check(
    'an edge drag with the outer size tracking is a window resize, not zoom',
    m.zoom === 1 && m.scale === 3,
    `zoom ${m.zoom}, --vf-scale ${m.scale}`
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

/* ── (e) a moved thing stays where it was dropped ───────────────────────────
   The kit's own metrics follow the zoom (a–d). A window a user DRAGGED, an
   icon they moved and a window they grew have to follow it the same way, and
   for a while they did not: the gesture wrote its result as resolved CSS px,
   which `--vf-scale` then moved out from under, so every moved thing slid by
   `3z / round(3z)` of its coordinate at each step. 110% is the sharpest case —
   round(3 × 1.1) is still 3, so NOTHING else on the page changes size, and the
   old code slid a dragged window 10% away from the corner anyway. 200% is the
   control: the factor is exactly 1 there, so it looked correct at 200% and
   wrong at 110%, which is what makes the CSS-px freeze the diagnosis. */

console.log('\n— (e) a dragged window / moved icon / grown window holds its system px —')

{
  const page = await browser.newPage({
    viewport: { width: 1320, height: 950 },
    deviceScaleFactor: 2,
    screen: { width: 2560, height: 1440 },
  })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(`
    <body style="margin: 0">
      <vf-desktop id="desk" width="380" height="280">
        <vf-window id="win" heading="Alpha" movable resizable
          width="200" height="120" left="20" top="20"></vf-window>
        <vf-icon id="ico" label="Disk" movable left="12" top="180"></vf-icon>
      </vf-desktop>
    </body>`)
  await page.evaluate(() => import('/src/index.ts'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('vf-desktop, vf-window, vf-icon')].map(
        (el) => el.updateComplete
      )
    )
  )
  const cdp = await page.context().newCDPSession(page)

  // Drag the window's title bar, move the icon, and grow the window — three
  // separate gestures, each of which used to freeze a CSS-px constant.
  const bar = await page.evaluate(() => {
    const b = document
      .getElementById('win')
      .shadowRoot.querySelector('[part=title-bar]')
      .getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 63, bar.y + 42, { steps: 5 })
  await page.mouse.up()

  const ico = await page.evaluate(() => {
    const b = document.getElementById('ico').getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.move(ico.x, ico.y)
  await page.mouse.down()
  await page.mouse.move(ico.x + 30, ico.y - 24, { steps: 4 })
  await page.mouse.up()

  const grow = await page.evaluate(() => {
    const b = document
      .getElementById('win')
      .shadowRoot.querySelector('.grow')
      .getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.move(grow.x, grow.y)
  await page.mouse.down()
  await page.mouse.move(grow.x + 45, grow.y + 30, { steps: 4 })
  await page.mouse.up()

  /** The placement as the kit stores it, plus what it resolves to right now. */
  const placement = () =>
    page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const win = document.getElementById('win')
      const ico = document.getElementById('ico')
      const scale = parseFloat(getComputedStyle(win).getPropertyValue('--vf-scale'))
      const used = (el) => {
        const s = getComputedStyle(el)
        return { left: parseFloat(s.left), top: parseFloat(s.top) }
      }
      return {
        scale,
        trueDpr: (await import('/src/index.ts')).truePixelRatio(),
        win: { left: win.left, top: win.top, width: win.width, height: win.height },
        ico: { left: ico.left, top: ico.top },
        winUsed: used(win),
        icoUsed: used(ico),
      }
    })

  const dropped = await placement()
  check(
    'the three gestures state whole system px',
    [
      dropped.win.left,
      dropped.win.top,
      dropped.win.width,
      dropped.win.height,
      dropped.ico.left,
      dropped.ico.top,
    ].every(Number.isInteger),
    `win ${dropped.win.left},${dropped.win.top} ${dropped.win.width}×${dropped.win.height}, ` +
      `icon ${dropped.ico.left},${dropped.ico.top}`
  )
  // The gestures must have actually moved things, or the rest proves nothing.
  check(
    '…and actually moved from the authored placement',
    dropped.win.left !== 20 && dropped.win.top !== 20 && dropped.ico.left !== 12,
    `win left ${dropped.win.left} (authored 20), icon left ${dropped.ico.left} (authored 12)`
  )

  for (const Z of [1.1, 1.25, 1.5, 2, 0.8]) {
    await chromeZoom(cdp, 2, Z)
    const now = await placement()
    check(
      `zoom ${Z * 100}%: the dropped origin is unchanged in system px`,
      now.win.left === dropped.win.left &&
        now.win.top === dropped.win.top &&
        now.ico.left === dropped.ico.left &&
        now.ico.top === dropped.ico.top,
      `win ${now.win.left},${now.win.top} icon ${now.ico.left},${now.ico.top} ` +
        `(dropped at win ${dropped.win.left},${dropped.win.top} icon ${dropped.ico.left},${dropped.ico.top})`
    )
    check(
      `zoom ${Z * 100}%: …and the grown size with it`,
      now.win.width === dropped.win.width && now.win.height === dropped.win.height,
      `${now.win.width}×${now.win.height} vs ${dropped.win.width}×${dropped.win.height}`
    )
    // Whole system px IS whole device px — the scale contract — so the moved
    // hosts stay fringe-free at every rung without anything re-snapping them.
    const deviceOrigin = [
      now.winUsed.left, now.winUsed.top, now.icoUsed.left, now.icoUsed.top,
    ].map((css) => css * now.trueDpr)
    check(
      `zoom ${Z * 100}%: …and every moved origin is still whole device px`,
      deviceOrigin.every(
        (d) => Math.abs(d - Math.round(d)) < layoutTolerance(now.trueDpr)
      ),
      deviceOrigin.map((d) => d.toFixed(3)).join(', ')
    )
  }
  await page.close()
}

await report(browser)
