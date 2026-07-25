/**
 * Verifies vf-number-field's well is sized by --vf-control-height, not by the
 * little-arrows sprite.
 *
 * The host is `inline-flex`; it used to be `align-items: stretch` with the 15×25
 * stepper as the only fixed-height child, so the <input> stretched to 25px —
 * 3px taller than every sibling field, and completely deaf to the token. The
 * reference sheets measure text fields at 22 and the arrows at 25, so the two
 * are authentically different heights: the well follows the token, the sprite
 * keeps its native size, and the odd remainder is biased a whole pixel so the
 * well never lands on a half pixel.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:control-heights
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

/** Native sprite size from `ui-sprites/Little arrows.png`. */
const STEPPER_H = 25
/** --vf-control-height's default, measured off the reference sheets. */
const CONTROL_H = 22

const MARKUP = `
  <vf-text-field id="text" value="abc"></vf-text-field>
  <vf-number-field id="num" value="5"></vf-number-field>
  <vf-number-field id="themed" value="5" style="--vf-control-height: 30px"></vf-number-field>
`

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()

await page.route(ORIGIN, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
)
await page.goto(ORIGIN)
await page.unroute(ORIGIN)
await page.setContent(MARKUP)
await page.evaluate(() => import('/src/index.js'))
await page.evaluate(() => customElements.whenDefined('vf-number-field'))
await page.evaluate(() =>
  Promise.all(
    [...document.querySelectorAll('vf-text-field, vf-number-field')].map((e) => e.updateComplete)
  )
)

/** Rendered geometry of one field, in CSS px, plus the page's effective scale. */
const geom = (id) =>
  page.evaluate((elId) => {
    const host = document.getElementById(elId)
    const inner = host.shadowRoot.querySelector('input')
    const stepper = host.shadowRoot.querySelector('.stepper')
    const hostRect = host.getBoundingClientRect()
    const innerRect = inner.getBoundingClientRect()
    return {
      scale: parseFloat(getComputedStyle(host).getPropertyValue('--vf-scale')),
      dpr: window.devicePixelRatio,
      host: hostRect.height,
      well: innerRect.height,
      stepper: stepper ? stepper.getBoundingClientRect().height : null,
      // Where the well sits inside the host box — the biased remainder.
      offsetTop: innerRect.top - hostRect.top,
    }
  }, id)

const text = await geom('text')
const num = await geom('num')
const themed = await geom('themed')
const s = num.scale

check('page is at the default 3-device-px-per-system-px scale', s === 3 / num.dpr, `scale=${s}`)

// ── The regression under test ──
check(
  'the number-field well matches the token, not the sprite',
  num.well === CONTROL_H * s,
  `well=${num.well} expected=${CONTROL_H * s} (sprite would be ${STEPPER_H * s})`
)
check(
  'the number-field well is exactly as tall as a vf-text-field well',
  num.well === text.well,
  `number=${num.well} text=${text.well}`
)

// ── The sprite keeps its authentic 1:1 size, and drives the host box ──
check(
  'the stepper still renders at its native 15×25',
  num.stepper === STEPPER_H * s,
  `stepper=${num.stepper} expected=${STEPPER_H * s}`
)
check(
  'the taller sprite sets the host height',
  num.host === STEPPER_H * s,
  `host=${num.host} expected=${STEPPER_H * s}`
)

// ── The odd remainder must not put the well on a half pixel ──
const offsetDevicePx = num.offsetTop * num.dpr
check(
  'the well is biased one whole pixel, not centered on a half pixel',
  offsetDevicePx === Math.round(offsetDevicePx) && num.offsetTop === s,
  `offsetTop=${num.offsetTop}css / ${offsetDevicePx}device (centering would be ${(1.5 * s).toFixed(1)}css)`
)
check(
  'both well edges land on whole device pixels',
  Number.isInteger((num.offsetTop + num.well) * num.dpr),
  `bottom=${(num.offsetTop + num.well) * num.dpr}device`
)

// ── The token is live again (it previously had zero effect here) ──
check(
  'retheming --vf-control-height resizes the well',
  themed.well === 30 * s,
  `well=${themed.well} expected=${30 * s}`
)
check(
  'retheming the well does not rescale the sprite',
  themed.stepper === STEPPER_H * s,
  `stepper=${themed.stepper} expected=${STEPPER_H * s}`
)
check(
  'a well taller than the sprite drives the host height itself',
  themed.host === 30 * s + s,
  `host=${themed.host} expected=${30 * s + s}`
)

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
