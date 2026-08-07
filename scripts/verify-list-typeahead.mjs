/**
 * Verifies vf-list's classic Finder first-letter type-ahead.
 *
 * The prefix buffer is time-dependent (it resets after a pause) and the feature
 * exists to respond to real keystrokes, so this needs Playwright's keyboard
 * rather than synthetic dispatch: the timing between keys is the behavior.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:list-typeahead
 */
import { ORIGIN, check, launch, report } from './harness.mjs'

/** Longer than TYPEAHEAD_TIMEOUT_MS in vf-list.ts, so the prefix resets. */
const AFTER_RESET = 1200

const MARKUP = `
  <vf-list id="list" label="Fonts" style="width: 200px">
    <vf-list-item id="i0" value="a">Alpha</vf-list-item>
    <vf-list-item id="i1" value="b">Bravo</vf-list-item>
    <vf-list-item id="i2" value="c">Charlie</vf-list-item>
    <vf-list-item id="i3" value="d">Delta</vf-list-item>
    <vf-list-item id="i4" value="dp">Delphi</vf-list-item>
    <vf-list-item id="i5" value="ec" disabled>Echo</vf-list-item>
    <vf-list-item id="i6" value="ed">Echidna</vf-list-item>
  </vf-list>
  <vf-list id="multi" multiple label="Multi" style="width: 200px">
    <vf-list-item id="m0" value="x">Xanadu</vf-list-item>
    <vf-list-item id="m1" value="y">Yankee</vf-list-item>
  </vf-list>
`

const browser = await launch()
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
  Promise.all(
    [...document.querySelectorAll('vf-list, vf-list-item')].map((e) => e.updateComplete)
  )
)

// Record every vf-change so we can assert type-ahead commits a real selection.
await page.evaluate(() => {
  window.__changes = []
  document
    .getElementById('list')
    .addEventListener('vf-change', (e) => window.__changes.push(e.detail.value))
})

/** The list's current selection + where the roving cursor sits. */
const state = () =>
  page.evaluate(() => ({
    value: document.getElementById('list').value,
    focused: document.activeElement?.id ?? null,
    changes: window.__changes.length,
  }))

// Establish a cursor with a real click, as a user would.
await page.locator('#i0').click()
check('click seeds the cursor on Alpha', (await state()).value === 'a')
// Count only the type-ahead jumps below, not this seeding click.
await page.evaluate(() => (window.__changes.length = 0))

// ── A single letter jumps to the next match ──
await page.keyboard.press('c')
let s = await state()
check('typing "c" selects Charlie', s.value === 'c', `value=${s.value}`)
check('type-ahead moves the roving cursor too', s.focused === 'i2', `focus=${s.focused}`)

// ── Distinct letters typed *within* the window narrow one prefix, not two ──
await page.keyboard.press('d')
s = await state()
check(
  'a quick "c" then "d" is the prefix "cd", which matches nothing',
  s.value === 'c',
  `value=${s.value}`
)

// ── Repeating one character cycles the rows starting with it ──
await page.waitForTimeout(AFTER_RESET)
await page.keyboard.press('d')
check('after the prefix resets, "d" selects Delta', (await state()).value === 'd')
await page.keyboard.press('d')
s = await state()
check('repeating "d" cycles on to Delphi', s.value === 'dp', `value=${s.value}`)

// ── The search skips disabled rows ──
await page.waitForTimeout(AFTER_RESET)
await page.keyboard.press('e')
s = await state()
check(
  'typing "e" skips the disabled Echo and lands on Echidna',
  s.value === 'ed',
  `value=${s.value}`
)

// ── An accumulating prefix narrows within the timeout, and wraps ──
await page.waitForTimeout(AFTER_RESET)
await page.keyboard.type('delp', { delay: 50 })
s = await state()
check(
  'a fast "delp" wraps past the end and narrows to Delphi',
  s.value === 'dp',
  `value=${s.value}`
)

// ── Every jump so far was a real committed selection ──
// Charlie, Delta, Delphi, Echidna, then "delp"'s two moves (Delta, then Delphi).
const beforeNoise = (await state()).changes
check('type-ahead fired vf-change for each jump', beforeNoise === 6, `changes=${beforeNoise}`)

// ── Keys that must NOT search ──
await page.waitForTimeout(AFTER_RESET)
await page.keyboard.press('z')
s = await state()
check(
  'a non-matching key leaves the selection alone',
  s.value === 'dp' && s.changes === beforeNoise,
  `value=${s.value} changes=${s.changes}`
)
await page.keyboard.press('Meta+a')
s = await state()
check(
  'a modified key is left to the consumer, not consumed as a prefix',
  s.value === 'dp' && s.changes === beforeNoise,
  `value=${s.value} changes=${s.changes}`
)

// ── Space stays the multiple-mode toggle, it never joins the prefix ──
await page.locator('#m0').click()
await page.keyboard.press(' ')
const multi = await page.evaluate(() => document.getElementById('multi').values)
check(
  'Space still toggles in multiple mode (not swallowed by type-ahead)',
  multi.length === 0,
  `values=[${multi}]`
)

await report(browser)
