/**
 * Verifies the three control-height tokens against the 1x reference sheets.
 *
 * `--vf-control-height: 22px` once drove buttons, popups AND fields, but the
 * sheets disagree with each other about what that height is. Black-ink bounding
 * boxes, measured with the stdlib PNG reader in scripts/extract-button-pixels.py
 * (`Buttons Exact 1x pixel Refrence.png` + `Controls.png`, which agree):
 *
 *   button face      80 × 20   (no shadow; the default ring's inner box, and the
 *                               ring traces in pixel-frame.ts assume it)
 *   small button     80 × 16
 *   text field      170 × 22, 215 × 22   (no shadow — 22 IS the border box)
 *   popup pill      157 × 19  → border box 156 × 18 plus its 1px hard shadow
 *                               (`ui-sprites/Pop-up menu REFERENCE.png` shows
 *                               the shadow row/column outside the border)
 *   little arrows    15 × 25
 *
 * So the token split: --vf-control-height stays the *field* height, with
 * --vf-button-height (20) and --vf-popup-height (18) alongside it, and the
 * vf-option row derived as the pill's content height (--vf-popup-height - 2px).
 *
 * Also covers the original vf-number-field regression this file was written for:
 * the host used to be `align-items: stretch` with the 15×25 stepper as the only
 * fixed-height child, so the <input> stretched to 25px and ignored the token.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:control-heights
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

/** Native sprite size from `ui-sprites/Little arrows.png`. */
const STEPPER_H = 25
/** --vf-control-height: the text-field height. */
const CONTROL_H = 22
/** --vf-button-height: the button face. */
const BUTTON_H = 20
/** --vf-popup-height: the vf-select pill's border box. */
const POPUP_H = 18
/** --vf-control-height-small: the compact button. */
const SMALL_H = 16
/** Derived: the option row = the pill's content height. */
const OPTION_H = POPUP_H - 2
/** How far the default ring outsets the button box (RING_INSET, pixel-frame.ts). */
const RING_INSET = 4

const OPTIONS = `
  <vf-option value="a">Alpha</vf-option>
  <vf-option value="b">Bravo</vf-option>
  <vf-option value="c">Charlie</vf-option>
`

const MARKUP = `
  <vf-text-field id="text" value="abc"></vf-text-field>
  <vf-number-field id="num" value="5"></vf-number-field>
  <vf-number-field id="themed" value="5" style="--vf-control-height: 30px"></vf-number-field>

  <vf-button id="btn">OK</vf-button>
  <vf-button id="def" variant="default">Install</vf-button>
  <vf-button id="small" size="small">Small</vf-button>

  <div id="scope" style="--vf-button-height: 30px">
    <vf-button id="btn-themed">Themed</vf-button>
    <vf-text-field id="text-in-scope" value="abc"></vf-text-field>
  </div>

  <div style="height: 160px"></div>
  <vf-select id="pop" value="b">${OPTIONS}</vf-select>
  <vf-select id="pop-themed" value="c" style="--vf-popup-height: 26px">${OPTIONS}</vf-select>
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
await page.evaluate(() =>
  Promise.all(
    ['vf-number-field', 'vf-button', 'vf-select', 'vf-option'].map((t) =>
      customElements.whenDefined(t)
    )
  )
)
await page.evaluate(() =>
  Promise.all(
    [...document.querySelectorAll('vf-text-field, vf-number-field, vf-button, vf-select, vf-option')]
      .map((e) => e.updateComplete)
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

// ── vf-number-field: the well follows the token, not the sprite ──
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

// ── vf-button: the face is 20, not the fields' 22 ──
const face = (id) =>
  page.evaluate((elId) => {
    const host = document.getElementById(elId)
    const btn = host.shadowRoot.querySelector('button')
    const ring = getComputedStyle(host, '::before')
    return {
      host: host.getBoundingClientRect().height,
      face: btn.getBoundingClientRect().height,
      // The default ring is drawn by ::before at inset:-RING_INSET.
      ringTop: ring.content === 'none' ? null : parseFloat(ring.top),
    }
  }, id)

const btn = await face('btn')
const def = await face('def')
const small = await face('small')

check(
  'the button face is --vf-button-height (20), not the 22px field height',
  btn.face === BUTTON_H * s,
  `face=${btn.face} expected=${BUTTON_H * s} (the old shared token would be ${CONTROL_H * s})`
)
check(
  'the button is genuinely shorter than a text field — the split is real',
  btn.face === text.well - 2 * s,
  `button=${btn.face} field=${text.well}`
)
check(
  'the default button uses the same 20px face',
  def.face === BUTTON_H * s,
  `face=${def.face} expected=${BUTTON_H * s}`
)
check(
  'the default ring outsets that face by RING_INSET, giving the reference 28',
  def.ringTop === -RING_INSET * s && def.host + 2 * RING_INSET * s === 28 * s,
  `ringTop=${def.ringTop} ringBox=${def.host + 2 * RING_INSET * s} expected=${28 * s}`
)
check(
  'the small button is untouched at 16',
  small.face === SMALL_H * s,
  `face=${small.face} expected=${SMALL_H * s}`
)
check(
  'the button face lands on whole device pixels',
  Number.isInteger(btn.face * num.dpr),
  `face=${btn.face * num.dpr}device`
)

// ── The tokens are independent: retheming buttons must not move fields ──
const btnThemed = await face('btn-themed')
const textInScope = await geom('text-in-scope')
check(
  'retheming --vf-button-height resizes the button',
  btnThemed.face === 30 * s,
  `face=${btnThemed.face} expected=${30 * s}`
)
check(
  'retheming --vf-button-height leaves a text field in the same scope alone',
  textInScope.well === CONTROL_H * s,
  `well=${textInScope.well} expected=${CONTROL_H * s}`
)

// ── vf-select: the pill is 18, its rows the 16px content height ──
// The rows must be measured with the panel OPEN: a closed `.panel` is
// display:none, so its slotted options have zero-size rects.
const openSelect = async (id) => {
  const box = await page.evaluate((elId) => {
    const r = document
      .getElementById(elId)
      .shadowRoot.querySelector('.control')
      .getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top }
  }, id)
  await page.mouse.move(box.x, box.y)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForFunction(
    (elId) => {
      const panel = document.getElementById(elId).shadowRoot.querySelector('.panel')
      return getComputedStyle(panel).display !== 'none'
    },
    id,
    { timeout: 2000 }
  )
  return box
}

const popup = (id) =>
  page.evaluate((elId) => {
    const host = document.getElementById(elId)
    const control = host.shadowRoot.querySelector('.control')
    const option = host.querySelector('vf-option')
    return {
      pill: control.getBoundingClientRect().height,
      row: option.getBoundingClientRect().height,
    }
  }, id)

/** Where the selected row landed relative to its panel, with the list open. */
const overlayOf = (id, value) =>
  page.evaluate(
    ({ elId, val }) => {
      const host = document.getElementById(elId)
      const selected = host.querySelector(`vf-option[value="${val}"]`)
      return {
        index: [...host.querySelectorAll('vf-option')].indexOf(selected),
        rowTop: selected.getBoundingClientRect().top,
        panelTop: host.shadowRoot.querySelector('.panel').getBoundingClientRect().top,
      }
    },
    { elId: id, val: value }
  )

const pillBox = await openSelect('pop')
const pop = await popup('pop')
const overlay = await overlayOf('pop', 'b')
await page.keyboard.press('Escape')
const themedBox = await openSelect('pop-themed')
const popThemed = await popup('pop-themed')
const themedOverlay = await overlayOf('pop-themed', 'c')
await page.keyboard.press('Escape')

check(
  'the popup pill is --vf-popup-height (18), not the 22px field height',
  pop.pill === POPUP_H * s,
  `pill=${pop.pill} expected=${POPUP_H * s} (the old shared token would be ${CONTROL_H * s})`
)
check(
  'the option row is the pill CONTENT height (18 - 2 borders = 16)',
  pop.row === OPTION_H * s,
  `row=${pop.row} expected=${OPTION_H * s}`
)
check(
  'the option row is derived from the pill, not a stale literal',
  pop.row === pop.pill - 2 * s,
  `row=${pop.row} pill=${pop.pill}`
)
check(
  'both popup metrics land on whole device pixels',
  Number.isInteger(pop.pill * num.dpr) && Number.isInteger(pop.row * num.dpr),
  `pill=${pop.pill * num.dpr}device row=${pop.row * num.dpr}device`
)
check(
  'retheming --vf-popup-height resizes the pill',
  popThemed.pill === 26 * s,
  `pill=${popThemed.pill} expected=${26 * s}`
)
check(
  'retheming --vf-popup-height carries the rows with it (derived, not hardcoded)',
  popThemed.row === 24 * s,
  `row=${popThemed.row} expected=${24 * s}`
)

// ── The overlay invariant the row height exists to serve ──
// The panel lays the SELECTED row's white cell directly over the pill's white
// content, so the selected row's top must land on the pill's content top —
// pill.top + 1px border — whatever the selected index is. That only holds if
// positionPanel offsets by the row's true rendered height.
check(
  'the panel opens with a non-zero selected index (the case that can drift)',
  overlay.index > 0 && themedOverlay.index > 0,
  `default=${overlay.index} themed=${themedOverlay.index}`
)
check(
  'the selected row lays exactly on the pill content top',
  Math.abs(overlay.rowTop - (pillBox.top + s)) < 0.5,
  `row=${overlay.rowTop} pillContent=${pillBox.top + s} panel=${overlay.panelTop}`
)
// The payoff of positionPanel reading the row's RENDERED height: with the old
// hardcoded ITEM_HEIGHT this drifts by index × (themed row − constant).
check(
  'a re-themed popup still lays its selected row on the pill content top',
  Math.abs(themedOverlay.rowTop - (themedBox.top + s)) < 0.5,
  `row=${themedOverlay.rowTop} pillContent=${themedBox.top + s} ` +
    `(a constant row height would miss by ${themedOverlay.index * (24 - OPTION_H) * s})`
)

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
