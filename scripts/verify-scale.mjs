/**
 * Verifies ScaleController's ownership contract: a consumer/ancestor
 * `--vf-scale` always wins, and true-size rendering stays the default when
 * nothing is in scope.
 *
 * The bug this suite exists for: Lit attaches a shadow root synchronously on
 * connect but renders its `<slot>`s on the first update, so during the
 * `customElements.define` sweep a light-DOM child whose parent upgraded first
 * is assigned to no slot. Such an element is outside the flat tree — it reports
 * a computed style (its own rules apply) but inherits nothing, so `--vf-scale`
 * reads back empty whether or not the page set one, and the controller took
 * over on that false negative. Which components were hit was pure
 * module-evaluation order (3 of 18: vf-menu, vf-menu-item, vf-list-item).
 *
 * Every scenario therefore builds its page the way a consumer would — markup
 * first, module afterwards, so elements upgrade at define time. Elements
 * created at runtime were never affected, which is why the other suites (which
 * build their markup after the import) all passed while this was broken.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:scale
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

/** Headless Chromium runs at dpr 1, so the default scale is 3/1. */
const DEFAULT_SCALE = 3

const COMPONENTS = `
  <vf-button id="btn">Button</vf-button>
  <vf-checkbox>Check</vf-checkbox>
  <vf-radio-group name="r"><vf-radio value="a">A</vf-radio></vf-radio-group>
  <vf-text-field value="abc"></vf-text-field>
  <vf-number-field value="5"></vf-number-field>
  <vf-slider value="50"></vf-slider>
  <vf-progress-bar value="50"></vf-progress-bar>
  <vf-select value="a"><vf-option value="a">Menu item</vf-option></vf-select>
  <vf-list><vf-list-item id="row" value="a">Row</vf-list-item></vf-list>
  <vf-menu-bar><vf-menu id="menu" label="File" open><vf-menu-item id="item">Menu item</vf-menu-item></vf-menu></vf-menu-bar>
  <vf-fieldset legend="Group"><vf-button>Inner</vf-button></vf-fieldset>
  <vf-scroll-area><p>Body</p></vf-scroll-area>
  <vf-window heading="Win"><vf-button>In window</vf-button></vf-window>
`

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()

/** A page built the parse-time way: markup first, module second. */
async function build(markup) {
  const page = await browser.newPage()
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(markup)
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  return page
}

/** Per-tag inline + computed --vf-scale, first instance of each tag. */
const scales = (page) =>
  page.evaluate(() => {
    const out = {}
    for (const el of document.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase()
      if (!tag.startsWith('vf-') || tag in out) continue
      out[tag] = {
        inline: el.style.getPropertyValue('--vf-scale') || null,
        computed: getComputedStyle(el).getPropertyValue('--vf-scale').trim() || null,
      }
    }
    return out
  })

const heights = (page, ids) =>
  page.evaluate(
    (list) =>
      Object.fromEntries(
        list.map((id) => [id, document.getElementById(id)?.getBoundingClientRect().height ?? -1])
      ),
    ids
  )

// ── 1. An inherited override wins for every component (the bug) ──
{
  const page = await build(`<style>:root { --vf-scale: 1; }</style>${COMPONENTS}`)
  const s = await scales(page)
  const tags = Object.keys(s)
  const tookOver = tags.filter((t) => s[t].inline !== null)
  const wrong = tags.filter((t) => s[t].computed !== '1')

  check(
    'every component honors an inherited --vf-scale: 1',
    tookOver.length === 0,
    `${tags.length} components, took over: [${tookOver}]`
  )
  check('every component computes --vf-scale: 1', wrong.length === 0, `wrong: [${wrong}]`)
  // The three the bug actually hit — named so a regression is legible.
  for (const tag of ['vf-menu', 'vf-menu-item', 'vf-list-item']) {
    check(`${tag} (previously pinned at 3x) is dormant`, s[tag]?.inline === null, `inline=${s[tag]?.inline}`)
  }
  await page.close()
}

// ── 2. True-size rendering is still the default with nothing in scope ──
{
  const page = await build(COMPONENTS)
  const s = await scales(page)
  const tags = Object.keys(s)
  const wrong = tags.filter((t) => s[t].computed !== String(DEFAULT_SCALE))

  check(
    `every component computes the display scale (${DEFAULT_SCALE}) by default`,
    wrong.length === 0,
    `wrong: [${wrong}]`
  )
  check(
    'top-level components own the write themselves',
    s['vf-button'].inline === String(DEFAULT_SCALE) && s['vf-list'].inline === String(DEFAULT_SCALE),
    `button=${s['vf-button'].inline} list=${s['vf-list'].inline}`
  )
  // A nested component inherits its parent's value instead of re-writing it —
  // the multiplier must never compound.
  check(
    'nested components inherit rather than re-write',
    s['vf-option'].inline === null && s['vf-option'].computed === String(DEFAULT_SCALE),
    `option inline=${s['vf-option'].inline} computed=${s['vf-option'].computed}`
  )
  await page.close()
}

// ── 3. The scale reaches actual rendered pixels, not just the property ──
// The end-to-end form of the bug: menu rows drew at 3x on a 1x page.
{
  const ids = ['btn', 'row', 'item', 'menu']
  const one = await build(`<style>:root { --vf-scale: 1; }</style>${COMPONENTS}`)
  const scaled = await build(COMPONENTS)
  const atOne = await heights(one, ids)
  const atThree = await heights(scaled, ids)

  for (const id of ids) {
    const ratio = atOne[id] > 0 ? atThree[id] / atOne[id] : 0
    check(
      `#${id} renders exactly ${DEFAULT_SCALE}x larger unscaled than at --vf-scale: 1`,
      Math.abs(ratio - DEFAULT_SCALE) < 0.001,
      `${atOne[id]}px vs ${atThree[id]}px, ratio ${ratio.toFixed(4)}`
    )
  }
  await one.close()
  await scaled.close()
}

// ── 4. A scoped override applies per subtree ──
{
  const page = await build(`
    <style>.dense { --vf-scale: 1.25; }</style>
    <div class="dense"><vf-button id="inside">In</vf-button></div>
    <vf-button id="outside">Out</vf-button>
  `)
  const s = await page.evaluate(() =>
    Object.fromEntries(
      ['inside', 'outside'].map((id) => {
        const el = document.getElementById(id)
        return [
          id,
          {
            inline: el.style.getPropertyValue('--vf-scale') || null,
            computed: getComputedStyle(el).getPropertyValue('--vf-scale').trim() || null,
          },
        ]
      })
    )
  )
  check(
    'a wrapper override wins inside its subtree',
    s.inside.inline === null && s.inside.computed === '1.25',
    `inline=${s.inside.inline} computed=${s.inside.computed}`
  )
  check(
    'a sibling outside the subtree still gets the display scale',
    s.outside.computed === String(DEFAULT_SCALE),
    `computed=${s.outside.computed}`
  )
  await page.close()
}

// ── 5. A consumer's own inline value is never overwritten ──
{
  const page = await build(`<vf-button id="pinned" style="--vf-scale: 2">Pinned</vf-button>`)
  const inline = await page.evaluate(
    () => document.getElementById('pinned').style.getPropertyValue('--vf-scale')
  )
  check('an inline consumer override survives connect', inline === '2', `inline=${inline}`)
  await page.close()
}

// ── 6. Reconnect resumes the scale the controller already owns ──
{
  const page = await build(`<vf-button id="btn">Button</vf-button>`)
  const after = await page.evaluate(async () => {
    const el = document.getElementById('btn')
    const parent = el.parentElement
    el.remove()
    parent.appendChild(el)
    await el.updateComplete
    return el.style.getPropertyValue('--vf-scale') || null
  })
  check(
    'a re-appended component resumes owning its scale',
    after === String(DEFAULT_SCALE),
    `inline=${after}`
  )
  await page.close()
}

// ── 7. A host that is never slotted stays dormant rather than guessing ──
// The defensive half of the fix: an unresolvable read must never be decided on.
{
  const page = await build(`<style>:root { --vf-scale: 1; }</style><div id="holder"></div>`)
  const inline = await page.evaluate(async () => {
    const holder = document.getElementById('holder')
    holder.attachShadow({ mode: 'open' }) // no <slot>, so the child never renders
    const btn = document.createElement('vf-button')
    holder.appendChild(btn)
    await btn.updateComplete
    return btn.style.getPropertyValue('--vf-scale') || null
  })
  check('an unslotted host does not take over on an unresolvable read', inline === null, `inline=${inline}`)
  await page.close()
}

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
