/**
 * Verifies the display face's baseline sits on the System 7 grid: in the
 * vf-select pill the label's ink must show exactly 3 system px above the cap
 * and 4 below it (the canonical Chicago 12/4 em in the 16px content box).
 *
 * The shipped WOFF2s carry converter-artifact hhea metrics (ascender 682 of
 * 1024 upm = 10.66px at 16px — off the 64-unit design-pixel grid), which put
 * every baseline ~0.5px high; rasterization snapped that to a whole device
 * pixel and all text sat one device px above its System 7 position. The
 * PIXEL_GRID_METRICS overrides in register-embedded-font.ts pin the em to the
 * grid-clean OS/2 typo values (12/4/0). This asserts the rendered pixels.
 *
 * Chrome snaps aliased text baselines to whole ABSOLUTE CSS px, so at scale
 * 1.5 (dpr 2) the result depends on the host's half-CSS-px phase: a host at a
 * half-px position renders canonically, a whole-px one misses by 1 device px
 * (⅓ system px, the closest reachable). Both cases are asserted so a change
 * in either the metrics or Chrome's snapping shows up here.
 *
 * The small pill (`size="small"`) sets the body face in 10 content rows: 1
 * blank above a 7-row capital, 2 below the baseline, and descenders that fill
 * those 2 rows exactly; its 9×5 ▼ sits 3 rows down, centered on the x-height.
 * Its cases run at display density (`browserAt`), where
 * they are exact at every dpr and host phase: the misses asserted above are
 * emulation's (a deviceScaleFactor page floors the 1-system-px border to a
 * whole CSS px — KNOWN-BUGS #3), and at dpr 3 emulation moves the small label
 * further than the regular pill's 1-device-px tolerance.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:baseline
 */
import { ORIGIN, browserAt, check, decodePng, launch, report } from './harness.mjs'

const isInk = (png, x, y) => {
  const i = (y * png.width + x) * png.bpp
  return png.data[i] < 128 && png.data[i + 1] < 128 && png.data[i + 2] < 128
}

const browser = await launch()

/**
 * Renders one closed pill with its border-box top at `hostTop` (CSS px) and
 * measures the label's ink gaps against the content box, in system px.
 * `capHeight` is the height of all the label's ink, descenders included.
 */
async function measure(dpr, hostTop, { size = 'regular', label = 'RGB', real = false } = {}) {
  const page = real
    ? await (await browserAt(dpr)).newPage({ viewport: null })
    : await browser.newPage({
        deviceScaleFactor: dpr,
        viewport: { width: 800, height: 400 },
      })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(`
    <div style="position: relative; background: #fff; height: 300px">
      <div style="position: absolute; left: 40px; top: ${hostTop}px">
        <vf-select id="pop" size="${size}" value="${label}">
          <vf-option value="${label}">${label}</vf-option>
        </vf-select>
      </div>
    </div>
  `)
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(['vf-select', 'vf-option'].map((t) => customElements.whenDefined(t)))
  )
  await page.evaluate(() =>
    Promise.all([...document.querySelectorAll('vf-select, vf-option')].map((e) => e.updateComplete))
  )
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  const geo = await page.evaluate(() => {
    const host = document.getElementById('pop')
    const control = host.shadowRoot.querySelector('.control')
    const label = host.shadowRoot.querySelector('.label')
    const arrow = host.shadowRoot.querySelector('.arrow')
    const r = control.getBoundingClientRect()
    const l = label.getBoundingClientRect()
    const a = arrow.getBoundingClientRect()
    return {
      control: { x: r.x, y: r.y, w: r.width, h: r.height },
      labelX0: l.x - r.x,
      labelX1: l.x + l.width - r.x,
      arrowX0: a.x - r.x,
      arrowX1: a.x + a.width - r.x,
      scale: parseFloat(getComputedStyle(host).getPropertyValue('--vf-scale')),
    }
  })

  const shot = await page.screenshot({
    clip: { x: geo.control.x, y: geo.control.y, width: geo.control.w, height: geo.control.h },
  })
  await page.close()

  const png = decodePng(shot)
  const sysPx = geo.scale * dpr // device px per system px
  const border = Math.round(sysPx) // the pill's 1 system px border
  const x0 = Math.round(geo.labelX0 * dpr)
  const x1 = Math.round(geo.labelX1 * dpr)
  // Ink rows inside the content box only (the border spans the label's x-range).
  const rows = []
  for (let y = border; y < png.height - border; y++) {
    let ink = false
    for (let x = x0; x < x1 && !ink; x++) ink = isInk(png, x, y)
    if (ink) rows.push(y)
  }
  // The ▼'s ink box, the same way, in the arrow's own x-range.
  const ax0 = Math.round(geo.arrowX0 * dpr)
  const ax1 = Math.round(geo.arrowX1 * dpr)
  const arrowRows = []
  const arrowCols = new Set()
  for (let y = border; y < png.height - border; y++) {
    let ink = false
    for (let x = ax0; x < ax1; x++) {
      if (!isInk(png, x, y)) continue
      ink = true
      arrowCols.add(x)
    }
    if (ink) arrowRows.push(y)
  }
  return {
    above: (rows[0] - border) / sysPx,
    below: (png.height - border - (rows[rows.length - 1] + 1)) / sysPx,
    capHeight: (rows[rows.length - 1] + 1 - rows[0]) / sysPx,
    arrow: {
      above: (arrowRows[0] - border) / sysPx,
      below: (png.height - border - (arrowRows[arrowRows.length - 1] + 1)) / sysPx,
      height: arrowRows.length / sysPx,
      width: arrowCols.size / sysPx,
    },
  }
}

const fmt = (m) => `above=${m.above} below=${m.below} cap=${m.capHeight} syspx`
const fmtArrow = ({ arrow: a }) =>
  `▼ ${a.width}×${a.height}, above=${a.above} below=${a.below} syspx`

// dpr 1: --vf-scale is 1, so a whole CSS px IS a whole system px and the
// placement must be exactly canonical.
{
  const m = await measure(1, 48)
  check(
    'dpr 1: label ink sits 3 above / 4 below the cap (canonical)',
    m.above === 3 && m.below === 4 && m.capHeight === 9,
    fmt(m)
  )
  check(
    'dpr 1: the ▼ is 11×6, centered: 5 rows above and 5 below',
    m.arrow.width === 11 && m.arrow.height === 6 && m.arrow.above === 5 && m.arrow.below === 5,
    fmtArrow(m)
  )
}

// dpr 3: a true 3× device derives --vf-scale 4/3, which Chromium's 1/64-CSS-px
// layout grid cannot hold, so the font size and the ascent it is a fraction of
// both quantize and the run lands one device px (¼ system px) off canonical —
// the same class of miss as the dpr-2 whole-px host below, and the same
// reasoning: the cap is intact, the ink is crisp, and this is the closest the
// engine can place it. It was exact under the old fixed target only because
// that made this display's scale exactly 1.
{
  const m = await measure(3, 48)
  const devicePx = 1 / 4 // one system px is 4 device px here, so one device px is ¼
  check(
    'dpr 3: within 1 device px of canonical (4/3 is not a holdable scale)',
    Math.abs(m.above - 3) <= devicePx + 1e-9 &&
      Math.abs(m.below - 4) <= devicePx + 1e-9 &&
      m.capHeight === 9,
    fmt(m)
  )
}

// dpr 2: a half-CSS-px host (device-aligned) is canonical…
const half = await measure(2, 48.5)
check(
  'dpr 2, half-px host: label ink sits 3 above / 4 below (canonical)',
  half.above === 3 && half.below === 4 && half.capHeight === 9,
  fmt(half)
)
// …a whole-CSS-px host misses by exactly 1 device px (⅓ system px), the
// closest Chrome's whole-CSS-px baseline snapping can reach. If this starts
// reading 3/4, the snapping changed — celebrate and tighten the check.
const whole = await measure(2, 48)
check(
  'dpr 2, whole-px host: within 1 device px of canonical (known Chrome limit)',
  Math.abs(whole.above - 3) <= 1 / 3 + 1e-9 &&
    Math.abs(whole.below - 4) <= 1 / 3 + 1e-9 &&
    whole.capHeight === 9,
  fmt(whole)
)

// ── The small pill, at display density ──
// Every host phase a density can put the pill on: whole CSS px, and the
// half (dpr 2) and quarter/half (dpr 3) device-aligned ones.
const PHASES = [
  [1, 48],
  [2, 48],
  [2, 48.5],
  [3, 48],
  [3, 48.25],
  [3, 48.5],
]
for (const [dpr, top] of PHASES) {
  const m = await measure(dpr, top, { size: 'small', real: true })
  check(
    `small, dpr ${dpr}, host at ${top}: label ink sits 1 above / 2 below a 7-row cap`,
    m.above === 1 && m.below === 2 && m.capHeight === 7,
    fmt(m)
  )
  // 9×5, pinned 3 rows down: its middle row (row 5) is the x-height's (rows 3–7).
  check(
    `small, dpr ${dpr}, host at ${top}: the ▼ is 9×5, 3 rows above and 2 below`,
    m.arrow.width === 9 && m.arrow.height === 5 && m.arrow.above === 3 && m.arrow.below === 2,
    fmtArrow(m)
  )
}
// Descenders: a capital's top on row 1 and a descender's foot on row 9 is
// 1 + 9 + 0 — every row of the descender inside the content. A baseline one
// row lower would read 2 above and 8 rows of ink, its foot on the border.
for (const [dpr, top] of PHASES) {
  const m = await measure(dpr, top, { size: 'small', label: 'Type', real: true })
  check(
    `small, dpr ${dpr}, host at ${top}: descenders end on the last content row, whole`,
    m.above === 1 && m.below === 0 && m.capHeight === 9,
    fmt(m)
  )
}

await report(browser)
