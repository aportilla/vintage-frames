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
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:baseline
 */
import { chromium } from 'playwright'
import { inflateSync } from 'node:zlib'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

// ── minimal PNG decode (Playwright PNGs: 8-bit RGBA/RGB, non-interlaced) ──
function decodePng(buf) {
  let pos = 8
  let ihdr
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    if (type === 'IHDR') ihdr = buf.subarray(pos + 8, pos + 8 + len)
    else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len))
    pos += 12 + len
  }
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const bpp = ihdr[9] === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = x >= bpp && prev ? prev[x - bpp] : 0
      let v = row[x]
      switch (filter) {
        case 1: v += a; break
        case 2: v += b; break
        case 3: v += (a + b) >> 1; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, bpp, data: out }
}

const isInk = (png, x, y) => {
  const i = (y * png.width + x) * png.bpp
  return png.data[i] < 128 && png.data[i + 1] < 128 && png.data[i + 2] < 128
}

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()

/**
 * Renders one closed pill with its border-box top at `hostTop` (CSS px) and
 * measures the label's ink gaps against the content box, in system px.
 */
async function measure(dpr, hostTop) {
  const page = await browser.newPage({
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
        <vf-select id="pop" value="RGB">
          <vf-option value="RGB">RGB</vf-option>
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
    const r = control.getBoundingClientRect()
    const l = label.getBoundingClientRect()
    return {
      control: { x: r.x, y: r.y, w: r.width, h: r.height },
      labelX0: l.x - r.x,
      labelX1: l.x + l.width - r.x,
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
  return {
    above: (rows[0] - border) / sysPx,
    below: (png.height - border - (rows[rows.length - 1] + 1)) / sysPx,
    capHeight: (rows[rows.length - 1] + 1 - rows[0]) / sysPx,
  }
}

const fmt = (m) => `above=${m.above} below=${m.below} cap=${m.capHeight} syspx`

// Whole-CSS-px placements — dpr 1 and 3 must be exactly canonical.
for (const dpr of [1, 3]) {
  const m = await measure(dpr, 48)
  check(
    `dpr ${dpr}: label ink sits 3 above / 4 below the cap (canonical)`,
    m.above === 3 && m.below === 4 && m.capHeight === 9,
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

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
