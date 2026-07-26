/**
 * Verifies the integration example's behavior — blog.html is the reference for
 * embedding the kit in an ordinary page, so its interactions are worth holding
 * still.
 *
 * Covers the things that only break outside a vf-desktop: the menu bar used as
 * page nav (roving tabindex = one Tab stop, Enter/arrows/Escape), two
 * independent components kept in sync by page state (Topics menu <-> sidebar
 * checkboxes), keyboard on the radio group / slider / list, a native <form>
 * reading the form-associated controls through FormData, dialog + alert in the
 * top layer, and no horizontal overflow when the column stacks.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:blog
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'
const DPR = Number(process.env.VF_BLOG_DPR ?? 2)

const failures = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`)
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} → ${JSON.stringify(actual)}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1320, height: 950 },
  deviceScaleFactor: DPR,
})

const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => {
  // Lit's dev-mode banner is expected off a source build.
  if (m.type() === 'error') pageErrors.push(m.text())
})

await page.goto(new URL('blog.html', ORIGIN).href, { waitUntil: 'networkidle' })
await page.waitForFunction(() => customElements.get('vf-button') !== undefined)
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(700)

console.log('\nupgrade + default scale')
check(
  'every vf-* host upgraded',
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')].filter((e) =>
      e.tagName.toLowerCase().startsWith('vf-')
    )
    return all.length > 0 && all.every((e) => e.shadowRoot) ? 'all' : 'incomplete'
  }),
  'all'
)
check(
  'page sets no --vf-scale; components self-scale to 3/dpr',
  await page.evaluate(() => {
    const root = document.documentElement.style.getPropertyValue('--vf-scale')
    const btn = getComputedStyle(document.querySelector('#subscribe')).getPropertyValue('--vf-scale')
    return { root: root || '(unset)', component: parseFloat(btn) * window.devicePixelRatio }
  }),
  { root: '(unset)', component: 3 }
)

console.log('\nmenu bar as page nav')
check(
  'bar is a single Tab stop',
  await page.evaluate(
    () => document.querySelectorAll('#nav vf-menu[tabindex="0"], #nav vf-menu').length &&
      [...document.querySelectorAll('#nav vf-menu')].filter((m) => m.barTabIndex === 0).length
  ),
  1
)
await page.evaluate(() => document.querySelector('#menu-topics').focusLabel())
await page.keyboard.press('Enter')
await page.waitForTimeout(200)
check('Enter opens the menu', await page.evaluate(() => document.querySelector('#menu-topics').open), true)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
check('keyboard pick filters the list', (await page.textContent('#status'))?.trim(), 'Showing 1 of 5 posts · topics: engineering')
check(
  'sidebar checkbox mirrored the menu',
  await page.evaluate(() => document.querySelector('vf-checkbox[value="engineering"]').checked),
  true
)

console.log('\nkeyboard on the sidebar controls')
await page.focus('vf-checkbox[value="craft"]')
await page.keyboard.press('Space')
await page.waitForTimeout(250)
check('Space toggles a checkbox', (await page.textContent('#status'))?.trim(), 'Showing 2 of 5 posts · topics: engineering, craft')
check(
  'menu item mirrored the checkbox',
  await page.evaluate(() => document.querySelector('#menu-topics vf-menu-item[value="craft"]').checked),
  true
)
await page.focus('vf-radio[value="newest"]')
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(250)
check('ArrowDown moves the radio group', await page.evaluate(() => document.querySelector('#sort').value), 'oldest')
await page.focus('#text-size')
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(200)
check('ArrowRight steps the slider', (await page.textContent('#text-size-readout'))?.trim(), '18px')
check(
  'slider drives whole-px leading (grid rule 2)',
  await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--article-leading')
  ),
  '29px'
)

console.log('\nlist')
await page.click('vf-list-item[value="post-boring"]')
await page.waitForTimeout(400)
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(400)
check('arrows move the list selection', await page.evaluate(() => document.querySelector('#archive').value), 'post-bitmap')
await page.keyboard.press('u')
await page.waitForTimeout(400)
check('first-letter type-ahead', await page.evaluate(() => document.querySelector('#archive').value), 'post-undo')

console.log('\nform + modals')
await page.evaluate(() => document.querySelector('.comments').scrollIntoView({ block: 'center' }))
await page.waitForTimeout(300)
await page.click('vf-button[type="submit"]')
await page.waitForTimeout(300)
check('empty note opens the alert', await page.evaluate(() => document.querySelector('#alert-note').open), true)
await page.click('#alert-ok')
await page.waitForTimeout(300)
await page.click('#note-name input')
await page.keyboard.type('Bethany')
await page.click('#note-body textarea')
await page.keyboard.type('Posted through FormData.')
await page.click('vf-checkbox[name="notify"]')
await page.click('vf-button[type="submit"]')
await page.waitForTimeout(300)
check(
  'FormData read the form-associated controls',
  (await page.textContent('#notes'))?.trim(),
  'Bethany · following repliesPosted through FormData.'
)
check('reset cleared the fields', await page.evaluate(() => document.querySelector('#note-name').value), '')

await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(300)
await page.click('#subscribe')
await page.waitForTimeout(300)
check('dialog opens', await page.evaluate(() => document.querySelector('#dlg-subscribe').open), true)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('Escape closes it', await page.evaluate(() => document.querySelector('#dlg-subscribe').open), false)

console.log('\nresponsive')
await page.setViewportSize({ width: 720, height: 900 })
await page.waitForTimeout(400)
check(
  'no horizontal overflow when stacked',
  await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth),
  true
)

console.log('')
check('no page errors', pageErrors, [])

await browser.close()

if (failures.length) {
  console.log(`\n${failures.length} failure(s):`)
  for (const f of failures) console.log(`  -  ${f}`)
  process.exitCode = 1
}
