/**
 * Verifies that every component on a page lands on the device-pixel grid.
 *
 * A component is built from whole system px, so every edge inside it is on the
 * grid *relative to its own origin*. Put that origin — or its size — on a
 * fractional device pixel and the whole 1-bit interior rasterizes wrong: corner
 * staircases step asymmetrically, hairlines and glyph stems smear across two
 * device rows. It is the single most common way an integration looks "almost
 * right but muddy".
 *
 * Three ways it breaks, and this script tells them apart:
 *
 *   ORIGIN  the page put the host at a fractional position. Nearly always a
 *           line box: `line-height: 1.65` on 17px type is 28.05px, and every
 *           such line pushes what follows further off. Fix with whole-px
 *           line-height / padding / margin / gap.
 *   SIZE    `--vf-scale × devicePixelRatio` is not a whole number, so the
 *           component's own `N × scale` metrics can't land on the grid at any
 *           position. Fix by choosing a valid scale — that product is why
 *           getScale() returns 3 / dpr.
 *   BOTH    usually SIZE: an invalid scale knocks positions out too.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:grid
 *
 * Override the pages with VF_GRID_PAGES (comma-separated paths) and the
 * densities with VF_GRID_DPR.
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'
// ?nosnap: blog.html turns applyGridSnap() on itself, which would quietly
// paper over exactly the ORIGIN faults this script exists to catch.
const PAGES = (process.env.VF_GRID_PAGES ?? '/,/blog.html?nosnap').split(',')
const DENSITIES = (process.env.VF_GRID_DPR ?? '1,2,3').split(',').map(Number)

const audit = async (page) =>
  page.evaluate(async () => {
    // trueDpr, not devicePixelRatio: the same number at zoom 1 (all this
    // harness runs), but the correct lattice if the audit is ever pointed at
    // a zoomed Safari page. Same module instance as the components'.
    const { truePixelRatio } = await import('/src/index.ts')
    const dpr = truePixelRatio()
    // Sub-device-pixel error we treat as noise rather than a fault: one
    // 1/64-CSS-px layout unit, the best the engine can represent (under zoom
    // the scale can be a ratio like 5/3, where exactness is unrepresentable).
    const eps = Math.max(1e-6, dpr / 128)
    /** Signed device-pixel error of a CSS-px measurement. */
    const err = (css) => {
      const d = css * dpr
      const e = d - Math.round(d)
      return Math.abs(e) < eps ? 0 : e
    }

    const faults = []
    let total = 0
    for (const host of document.querySelectorAll('*')) {
      const tag = host.tagName.toLowerCase()
      if (!tag.startsWith('vf-')) continue
      const rect = host.getBoundingClientRect()
      if (!rect.width && !rect.height) continue
      total++

      // Each component carries its own --vf-scale, so read it from the host
      // rather than the root: a page may scale subtrees independently.
      const scale =
        parseFloat(getComputedStyle(host).getPropertyValue('--vf-scale')) || 1

      const origin = { x: err(rect.left), y: err(rect.top) }
      const size = { w: err(rect.width), h: err(rect.height) }
      if (!origin.x && !origin.y && !size.w && !size.h) continue

      const label = `${tag}${host.id ? '#' + host.id : ''}`
      faults.push({
        label,
        kind: (size.w || size.h) ? ((origin.x || origin.y) ? 'BOTH' : 'SIZE') : 'ORIGIN',
        scale,
        product: Math.round(scale * dpr * 1000) / 1000,
        detail: [
          origin.x && `x=${rect.left.toFixed(3)}`,
          origin.y && `y=${rect.top.toFixed(3)}`,
          size.w && `w=${rect.width.toFixed(3)}`,
          size.h && `h=${rect.height.toFixed(3)}`,
        ].filter(Boolean).join(' '),
      })
    }
    return { total, faults, dpr }
  })

const browser = await chromium.launch()
let failed = false

for (const path of PAGES) {
  for (const dpr of DENSITIES) {
    const page = await browser.newPage({
      viewport: { width: 1320, height: 950 },
      deviceScaleFactor: dpr,
    })
    const url = new URL(path, ORIGIN).href
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => customElements.get('vf-button') !== undefined)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(600)

    const { total, faults } = await audit(page)
    const clean = total - faults.length
    const ok = faults.length === 0
    if (!ok) failed = true
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${path.padEnd(12)} dpr ${dpr}   ${clean}/${total} on grid`
    )
    for (const f of faults) {
      console.log(
        `       ${f.kind.padEnd(6)} ${f.label.padEnd(26)} ${f.detail}` +
          (f.kind === 'ORIGIN' ? '' : `   (--vf-scale ${f.scale} × dpr ${dpr} = ${f.product})`)
      )
    }
    await page.close()
  }
}

await browser.close()

if (failed) {
  console.log('\nSee the layout contract in README — "Staying on the device-pixel grid".')
  process.exitCode = 1
}
