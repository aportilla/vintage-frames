/**
 * Verifies vf-menu-item's selection event is `vf-menu-select`, and that it no
 * longer collides with the `<vf-select>` popup.
 *
 * Both events bubble and compose, so the old `vf-select` name meant a delegated
 * ancestor listener fired for menu activations — while the actual `<vf-select>`
 * component commits with `vf-change`. This asserts the separation from the
 * ancestor's point of view, which is where the clash was observable.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:menu-select
 */
import { ORIGIN, check, launch, report } from './harness.mjs'

const MARKUP = `
  <div id="host">
    <vf-menu-bar>
      <vf-menu id="menu" label="File">
        <vf-menu-item id="item" value="new-window" shortcut="⌘N">New Window</vf-menu-item>
      </vf-menu>
    </vf-menu-bar>
    <vf-select id="popup" value="hd">
      <vf-option value="hd">Macintosh HD</vf-option>
      <vf-option value="fd">Floppy</vf-option>
    </vf-select>
  </div>
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
await page.evaluate(() => customElements.whenDefined('vf-menu-item'))
await page.evaluate(() =>
  Promise.all(
    [...document.querySelectorAll('vf-menu-bar, vf-menu, vf-menu-item, vf-select, vf-option')].map(
      (e) => e.updateComplete
    )
  )
)

// One delegated listener per name on the COMMON ANCESTOR — exactly the wiring
// the old shared name broke.
await page.evaluate(() => {
  window.__log = []
  const host = document.getElementById('host')
  for (const name of ['vf-menu-select', 'vf-select', 'vf-change']) {
    host.addEventListener(name, (e) =>
      window.__log.push({
        name,
        value: e.detail?.value ?? null,
        // The detail must still identify the originating item.
        item: e.detail?.item?.id ?? null,
        composed: e.composed,
        bubbles: e.bubbles,
      })
    )
  }
})

const log = () => page.evaluate(() => window.__log)

// ── Activate the menu item (it blinks ~250ms before dispatching) ──
// The @click lives on the shadow `.item` row, so target that rather than the
// host; the panel is closed, so a real mouse click has nothing visible to hit.
await page.evaluate(() =>
  document.getElementById('item').shadowRoot.querySelector('.item').click()
)
await page.waitForFunction(() => window.__log.length > 0, null, { timeout: 2000 })
await page.waitForTimeout(100)

let entries = await log()
const menuEvents = entries.filter((e) => e.name === 'vf-menu-select')
check(
  'activating a menu item fires vf-menu-select on the ancestor',
  menuEvents.length === 1,
  `got ${JSON.stringify(entries.map((e) => e.name))}`
)
check(
  'the detail still carries { value, item }',
  menuEvents[0]?.value === 'new-window' && menuEvents[0]?.item === 'item',
  `value=${menuEvents[0]?.value} item=${menuEvents[0]?.item}`
)
check(
  'it still bubbles and composes out of the shadow root',
  menuEvents[0]?.bubbles === true && menuEvents[0]?.composed === true
)
check(
  'the menu no longer fires the colliding vf-select name',
  entries.filter((e) => e.name === 'vf-select').length === 0
)

// ── The popup commits independently, on its own event ──
await page.evaluate(() => (window.__log.length = 0))
// vf-select listens for click on its host, so both the control and the slotted
// option bubble up to it.
await page.evaluate(() =>
  document.getElementById('popup').shadowRoot.querySelector('.control').click()
)
await page.waitForTimeout(50)
await page.evaluate(() =>
  document.getElementById('popup').querySelector('vf-option[value="fd"]').click()
)
await page.waitForTimeout(500)

entries = await log()
check(
  'the popup commits on its own vf-change',
  entries.some((e) => e.name === 'vf-change' && e.value === 'fd'),
  `got ${JSON.stringify(entries.map((e) => `${e.name}:${e.value}`))}`
)
check(
  'a vf-select popup commit does NOT fire vf-menu-select',
  entries.filter((e) => e.name === 'vf-menu-select').length === 0,
  `got ${JSON.stringify(entries.map((e) => e.name))}`
)

await report(browser)
