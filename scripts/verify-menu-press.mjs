/**
 * Verifies the System 7 **press-drag-release** gesture on the pull-down menus —
 * press a title, keep the button down, slide onto a command, release over it to
 * run it — which is the same mechanic `vf-select` uses for its popup and is now
 * shared through `MenuPressController` (src/menu-press.ts).
 *
 * Every check drives real mouse input (CDP `mouse.down`/`move`/`up`), because
 * the whole point is what happens *between* a press and its release: a
 * `.click()` can't express a drag, and the two interaction styles are
 * disambiguated by exactly that. Six groups:
 *
 *  - DRAG: a press that travels onto a row picks it, and only it.
 *  - TRACK: the row under the pointer inverts as the drag passes over it
 *    (`[active]`), disabled rows never do, and nothing stays lit afterwards.
 *  - CANCEL: releasing on a disabled row, a separator, the title or off the
 *    menu closes with nothing chosen — the classic "release outside".
 *  - TAP: the modern click-to-open style still works and still coexists — a
 *    quick in-place tap leaves the menu dropped for a second, independent
 *    click; a *held* in-place press closes it; pressing an open title closes.
 *  - BAR: one press walks the bar — sliding sideways onto another title
 *    switches menus mid-gesture, and the row released over there is the one
 *    that runs.
 *  - ONCE: exactly one `vf-menu-select` per pick, including under
 *    `prefers-reduced-motion` (where activation completes synchronously, so the
 *    blink guard is already down when the trailing `click` lands — the case the
 *    swallow guards exist for), plus the standalone-menu path, where the menu
 *    owns the gesture itself instead of the bar.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:menu-press
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

const MARKUP = `
  <vf-menu-bar>
    <vf-menu id="file" label="File">
      <vf-menu-item id="new" value="new-window" shortcut="⌘N">New Window</vf-menu-item>
      <vf-menu-item id="open" value="open" shortcut="⌘O">Open…</vf-menu-item>
      <vf-separator id="sep"></vf-separator>
      <vf-menu-item id="print" value="print" disabled shortcut="⌘P">Print</vf-menu-item>
      <vf-menu-item id="quit" value="quit" shortcut="⌘Q">Quit</vf-menu-item>
    </vf-menu>
    <vf-menu id="edit" label="Edit">
      <vf-menu-item id="undo" value="undo" shortcut="⌘Z">Undo</vf-menu-item>
      <vf-menu-item id="copy" value="copy" shortcut="⌘C">Copy</vf-menu-item>
    </vf-menu>
  </vf-menu-bar>
  <div style="margin-top:200px">
    <vf-menu id="lone" label="Options">
      <vf-menu-item id="lone-a" value="lone-a">Alpha</vf-menu-item>
      <vf-menu-item id="lone-b" value="lone-b">Beta</vf-menu-item>
    </vf-menu>
  </div>
`

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()

/** Markup FIRST, module SECOND — the upgrade order verify:scale depends on. */
async function build({ reducedMotion } = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${MARKUP}`)
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => {
    window.__log = []
    document.addEventListener('vf-menu-select', (e) => window.__log.push(e.detail.value))
  })
  return page
}

/** Viewport centre of an element — read live, since rows only exist while open. */
const centre = (page, selector) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, selector)

const log = (page) => page.evaluate(() => window.__log)
const clearLog = (page) => page.evaluate(() => (window.__log.length = 0))
const openMenus = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('vf-menu')].filter((m) => m.open).map((m) => m.id)
  )
const activeRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('vf-menu-item[active]')].map((i) => i.id)
  )

/** Painted colours of a row, so `[active]` is checked as ink and not just state. */
const rowInk = (page, id) =>
  page.evaluate((rowId) => {
    const cs = getComputedStyle(
      document.getElementById(rowId).shadowRoot.querySelector('[part=item]')
    )
    return `${cs.backgroundColor} / ${cs.color}`
  }, id)

/** Dismiss whatever is open and start the next scenario clean. */
async function reset(page) {
  await page.mouse.click(600, 600)
  await page.waitForTimeout(30)
  await clearLog(page)
}

/** Press `from`, slide through `via`, release over the last of them. */
async function pressDrag(page, from, via) {
  const start = await centre(page, from)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  let last = start
  for (const sel of via) {
    last = await centre(page, sel)
    await page.mouse.move(last.x, last.y)
  }
  await page.mouse.up()
  return last
}

const page = await build()

// ── DRAG ────────────────────────────────────────────────────────────────────
await pressDrag(page, '#file', ['#open'])
await page.waitForTimeout(400) // the ~250ms blink runs before the event
check(
  'press the title, drag onto a row, release → that row runs',
  JSON.stringify(await log(page)) === '["open"]',
  `log=${JSON.stringify(await log(page))}`
)
check('…and the menu closes behind it', (await openMenus(page)).length === 0)
check('…leaving no row still inverted', (await activeRows(page)).length === 0)

await reset(page)
await pressDrag(page, '#file', ['#new', '#quit'])
await page.waitForTimeout(400)
check(
  'a drag across several rows runs only the one released over',
  JSON.stringify(await log(page)) === '["quit"]',
  `log=${JSON.stringify(await log(page))}`
)

// ── TRACK ───────────────────────────────────────────────────────────────────
await reset(page)
{
  const title = await centre(page, '#file')
  await page.mouse.move(title.x, title.y)
  await page.mouse.down()
  const row = await centre(page, '#new')
  await page.mouse.move(row.x, row.y)
  check(
    'the row under a held pointer inverts',
    JSON.stringify(await activeRows(page)) === '["new"]',
    `active=${JSON.stringify(await activeRows(page))}`
  )
  check(
    '…as full-row inversion, not just an attribute',
    (await rowInk(page, 'new')) === 'rgb(0, 0, 0) / rgb(255, 255, 255)',
    await rowInk(page, 'new')
  )
  const next = await centre(page, '#quit')
  await page.mouse.move(next.x, next.y)
  check(
    '…and the inversion follows the drag, one row at a time',
    JSON.stringify(await activeRows(page)) === '["quit"]',
    `active=${JSON.stringify(await activeRows(page))}`
  )
  const off = await centre(page, '#print')
  await page.mouse.move(off.x, off.y)
  check(
    'a disabled row never lights up',
    (await activeRows(page)).length === 0,
    `active=${JSON.stringify(await activeRows(page))}`
  )
  await page.mouse.up()
  await page.waitForTimeout(400)
  // ── CANCEL (released over the disabled row) ──
  check(
    'releasing over a disabled row runs nothing',
    (await log(page)).length === 0,
    `log=${JSON.stringify(await log(page))}`
  )
  check('…and closes the menu', (await openMenus(page)).length === 0)
}

// ── CANCEL ──────────────────────────────────────────────────────────────────
await reset(page)
await pressDrag(page, '#file', ['#sep'])
await page.waitForTimeout(200)
check(
  'releasing over a separator runs nothing, and closes',
  (await log(page)).length === 0 && (await openMenus(page)).length === 0,
  `log=${JSON.stringify(await log(page))} open=${JSON.stringify(await openMenus(page))}`
)

await reset(page)
{
  const title = await centre(page, '#file')
  await page.mouse.move(title.x, title.y)
  await page.mouse.down()
  const row = await centre(page, '#new')
  await page.mouse.move(row.x, row.y)
  await page.mouse.move(600, 600) // off the menu entirely
  await page.mouse.up()
  await page.waitForTimeout(200)
  check(
    'releasing off the menu runs nothing, and closes',
    (await log(page)).length === 0 && (await openMenus(page)).length === 0,
    `log=${JSON.stringify(await log(page))} open=${JSON.stringify(await openMenus(page))}`
  )
}

// ── TAP ─────────────────────────────────────────────────────────────────────
await reset(page)
await page.click('#file')
await page.waitForTimeout(50)
check(
  'a quick in-place tap leaves the menu dropped (click-to-open)',
  JSON.stringify(await openMenus(page)) === '["file"]',
  `open=${JSON.stringify(await openMenus(page))}`
)
{
  const row = await centre(page, '#quit')
  await page.mouse.click(row.x, row.y)
  await page.waitForTimeout(400)
  check(
    '…and a second, independent click then picks a row',
    JSON.stringify(await log(page)) === '["quit"]',
    `log=${JSON.stringify(await log(page))}`
  )
}

await reset(page)
{
  const title = await centre(page, '#file')
  await page.mouse.move(title.x, title.y)
  await page.mouse.down()
  await page.waitForTimeout(320) // > PRESS_HOLD_MS: a completed System 7 press
  await page.mouse.up()
  await page.waitForTimeout(50)
  check(
    'a HELD in-place press closes again on release (no sticky menu)',
    (await openMenus(page)).length === 0,
    `open=${JSON.stringify(await openMenus(page))}`
  )
}

await reset(page)
await page.click('#file')
await page.waitForTimeout(50)
await page.click('#file')
await page.waitForTimeout(50)
check(
  'pressing an already-dropped title closes it (and the trailing click cannot reopen it)',
  (await openMenus(page)).length === 0,
  `open=${JSON.stringify(await openMenus(page))}`
)

// ── BAR ─────────────────────────────────────────────────────────────────────
await reset(page)
{
  const file = await centre(page, '#file')
  await page.mouse.move(file.x, file.y)
  await page.mouse.down()
  const edit = await centre(page, '#edit')
  await page.mouse.move(edit.x, edit.y)
  check(
    'sliding sideways with the button down switches menus mid-press',
    JSON.stringify(await openMenus(page)) === '["edit"]',
    `open=${JSON.stringify(await openMenus(page))}`
  )
  const row = await centre(page, '#copy')
  await page.mouse.move(row.x, row.y)
  await page.mouse.up()
  await page.waitForTimeout(400)
  check(
    '…and the row released over in the NEW menu is the one that runs',
    JSON.stringify(await log(page)) === '["copy"]',
    `log=${JSON.stringify(await log(page))}`
  )
}

// ── ONCE ────────────────────────────────────────────────────────────────────
await reset(page)
await pressDrag(page, '#lone', ['#lone-b'])
await page.waitForTimeout(400)
check(
  'a standalone vf-menu (no bar) drives the same press-drag itself',
  JSON.stringify(await log(page)) === '["lone-b"]',
  `log=${JSON.stringify(await log(page))}`
)

await page.close()

const reduced = await build({ reducedMotion: true })
await pressDrag(reduced, '#file', ['#open'])
await reduced.waitForTimeout(200)
check(
  'under prefers-reduced-motion a drag-pick still fires exactly once',
  JSON.stringify(await log(reduced)) === '["open"]',
  `log=${JSON.stringify(await log(reduced))}`
)
await reset(reduced)
await reduced.click('#file')
await reduced.waitForTimeout(50)
{
  const row = await centre(reduced, '#quit')
  await reduced.mouse.click(row.x, row.y)
  await reduced.waitForTimeout(200)
  check(
    '…as does an in-place click on a row (the trailing click is swallowed)',
    JSON.stringify(await log(reduced)) === '["quit"]',
    `log=${JSON.stringify(await log(reduced))}`
  )
}

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
