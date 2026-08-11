/**
 * Diagnostic for the parse-time --vf-scale takeover.
 *
 * The documented contract (docs/SIZING.md, SPEC §2) is that a
 * consumer/ancestor `--vf-scale` always wins and leaves ScaleController
 * dormant. This builds a page the way a consumer would — markup first, module
 * afterwards, so every element upgrades at `customElements.define` time — with
 * `:root { --vf-scale: 1 }` set, and reports which components honored it.
 *
 * A component that reports inline=3 took over despite the inherited 1, i.e.
 * it renders at 3x inside a 1x page.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run probe:menus
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

const MARKUP = `
  <style>:root { --vf-scale: 1; }</style>
  <vf-button>Button</vf-button>
  <vf-checkbox>Check</vf-checkbox>
  <vf-radio-group name="r"><vf-radio value="a">A</vf-radio></vf-radio-group>
  <vf-text-field value="abc"></vf-text-field>
  <vf-number-field value="5"></vf-number-field>
  <vf-slider value="50"></vf-slider>
  <vf-progress-bar value="50"></vf-progress-bar>
  <vf-select value="a"><vf-option value="a">Menu item</vf-option></vf-select>
  <vf-list><vf-list-item value="a">Row</vf-list-item></vf-list>
  <vf-menu-bar><vf-menu label="File"><vf-menu-item>Menu item</vf-menu-item></vf-menu></vf-menu-bar>
  <vf-menu label="Edit" open><vf-menu-item id="standalone">Menu item</vf-menu-item></vf-menu>
  <vf-fieldset legend="Group"><vf-button>Inner</vf-button></vf-fieldset>
  <vf-scroll-area><p>Body</p></vf-scroll-area>
  <vf-window heading="Win" width="200" height="120"><vf-button>In window</vf-button></vf-window>
`

const browser = await chromium.launch()
const page = await browser.newPage()

await page.route(ORIGIN, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
)
await page.goto(ORIGIN)
await page.unroute(ORIGIN)
await page.setContent(MARKUP)
await page.evaluate(() => import('/src/index.js'))
await page.waitForTimeout(1000)

const rows = await page.evaluate(() => {
  const out = []
  const seen = new Set()
  for (const el of document.querySelectorAll('*')) {
    if (!el.tagName.toLowerCase().startsWith('vf-')) continue
    const tag = el.tagName.toLowerCase()
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push({
      tag,
      inline: el.style.getPropertyValue('--vf-scale') || '(none)',
      computed: getComputedStyle(el).getPropertyValue('--vf-scale').trim() || '(empty)',
    })
  }
  return out
})

const bad = rows.filter((r) => r.inline !== '(none)')
console.log(`:root sets --vf-scale: 1 — components that IGNORED it and took over:\n`)
for (const r of rows) {
  const flag = r.inline !== '(none)' ? '  <-- TOOK OVER' : ''
  console.log(`  ${r.tag.padEnd(18)} inline=${String(r.inline).padEnd(8)} computed=${String(r.computed).padEnd(6)}${flag}`)
}
console.log(`\n${bad.length} of ${rows.length} components ignored the inherited override`)

await browser.close()
