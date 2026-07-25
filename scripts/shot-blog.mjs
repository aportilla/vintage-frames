/**
 * Screenshots blog.html at each display density, so the effect of the
 * components' default self-scaling is visible side by side.
 *
 * The page sets no --vf-scale, so each component picks `3 / devicePixelRatio`:
 * 3 on a 1× monitor, 1.5 on a retina laptop, 1 on a 3× display. The controls
 * therefore reproduce the same *physical* size everywhere while the page's own
 * 17px copy stays put, which is exactly what these shots are for.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run shot:blog  # → shots/blog-dpr{1,2,3}.png
 *
 * VF_SHOT_DPR overrides the densities, VF_SHOT_FULL=1 captures the full page.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'
const DENSITIES = (process.env.VF_SHOT_DPR ?? '1,2,3').split(',').map(Number)
const FULL = process.env.VF_SHOT_FULL === '1'

await mkdir('shots', { recursive: true })

const browser = await chromium.launch()

for (const dpr of DENSITIES) {
  const page = await browser.newPage({
    viewport: { width: 1320, height: 950 },
    deviceScaleFactor: dpr,
  })
  await page.goto(new URL('blog.html', ORIGIN).href, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => customElements.get('vf-button') !== undefined)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800)

  const readout = await page.textContent('#scale-readout')
  console.log(`dpr ${dpr}: ${readout?.trim()}`)

  await page.screenshot({
    path: `shots/blog-dpr${dpr}.png`,
    ...(FULL ? { fullPage: true } : { clip: { x: 0, y: 0, width: 1320, height: 640 } }),
  })
  await page.close()
}

await browser.close()
