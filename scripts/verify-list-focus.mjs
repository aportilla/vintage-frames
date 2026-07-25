/**
 * Verifies the vf-list-item focus ring tracks the list's roving cursor.
 *
 * vf-list moves the cursor with a programmatic item.focus(); focus that isn't
 * preceded by a keyboard event does NOT match :focus-visible, so the ring has
 * to key off plain :focus. That's a real browser-modality behavior, so it can
 * only be verified with real input events — hence Playwright rather than a
 * static assertion.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:list-focus
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

const MARKUP = `
  <vf-list id="list" multiple style="width: 200px">
    <vf-list-item id="r0" value="a">Alpha</vf-list-item>
    <vf-list-item id="r1" value="b">Bravo</vf-list-item>
    <vf-list-item id="r2" value="c">Charlie</vf-list-item>
    <vf-list-item id="r3" value="d">Delta</vf-list-item>
  </vf-list>
`

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

/** Rows whose computed outline actually paints, in document order. */
const ringed = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('vf-list-item')]
      .filter((el) => {
        const s = getComputedStyle(el)
        return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
      })
      .map((el) => el.id)
  )

const focused = (page) => page.evaluate(() => document.activeElement?.id ?? null)

const browser = await chromium.launch()
const page = await browser.newPage()

await page.route(ORIGIN, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
)
await page.goto(ORIGIN)
await page.unroute(ORIGIN)
await page.setContent(MARKUP)
await page.evaluate(() => import('/src/index.js'))
await page.evaluate(() => customElements.whenDefined('vf-list-item'))
await page.evaluate(() =>
  Promise.all([...document.querySelectorAll('vf-list, vf-list-item')].map((e) => e.updateComplete))
)

check('no ring before any interaction', (await ringed(page)).length === 0)

// ── A real mouse click: the regression under test ──
// Pointer modality means the programmatic item.focus() that follows does not
// match :focus-visible, so this is exactly where the old rule drew nothing.
await page.locator('#r1').click()
check('after a mouse click, the clicked row has focus', (await focused(page)) === 'r1')
const afterClick = await ringed(page)
check(
  'after a mouse click, the cursor row draws its ring',
  afterClick.length === 1 && afterClick[0] === 'r1',
  `ringed = [${afterClick}]`
)

// ── Cmd+Arrow moves the cursor without selecting: the case the ring exists for ──
await page.keyboard.press('Meta+ArrowDown')
const afterArrow = await ringed(page)
const arrowState = await page.evaluate(() => ({
  focused: document.activeElement?.id ?? null,
  selected: document.getElementById('r2').selected,
}))
check(
  'Cmd+ArrowDown moves the cursor to an UNSELECTED row',
  arrowState.focused === 'r2' && arrowState.selected === false,
  `focus=${arrowState.focused} selected=${arrowState.selected}`
)
check(
  'the unselected cursor row draws the ring (its only indicator)',
  afterArrow.length === 1 && afterArrow[0] === 'r2',
  `ringed = [${afterArrow}]`
)

// ── The ring is the cursor, so it leaves with focus ──
await page.evaluate(() => document.getElementById('r2').blur())
check('blurring the list clears every ring', (await ringed(page)).length === 0)

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
