/**
 * Verifies live menu key equivalents — the MenuKey() half of
 * `vf-menu-item.shortcut`, granted by `shortcuts` on `vf-menu-bar`/`vf-menu`.
 *
 *  - GRANT: with `shortcuts` on the bar, a matching keydown activates the item
 *    from anywhere (menu closed), fires `vf-menu-select`, claims the stroke
 *    with preventDefault, opens nothing and moves no focus. Without the
 *    grant, the same stroke is untouched.
 *  - MATCH: modifiers are exact (⌘S ≠ ⌘⇧S); a bare printable shortcut renders
 *    but never matches, so typing can't be hijacked; a disabled item claims
 *    nothing and the stroke falls through.
 *  - PRECEDENCE: a page handler that preventDefault()ed first keeps its key;
 *    auto-repeat strokes are claimed but activate only once.
 *  - FLASH: a closed menu answers its key with the title flash (skipped, with
 *    the blink, under prefers-reduced-motion); an open menu closes after the
 *    item's visible blink.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:menu-keys
 */
import { check, launch, makeBuild, report } from './harness.mjs'

const MARKUP = `
  <vf-menu-bar id="bar" label="Site" shortcuts>
    <vf-menu id="file" label="File">
      <vf-menu-item id="save" value="save" shortcut="⌘S">Save</vf-menu-item>
      <vf-menu-item id="save-as" value="save-as" shortcut="⌘⇧S">Save As…</vf-menu-item>
      <vf-menu-item id="print" value="print" shortcut="⌘P" disabled>Print…</vf-menu-item>
      <vf-menu-item id="bare" value="bare" shortcut="S">Bare Letter</vf-menu-item>
      <vf-menu-item id="find" value="find" shortcut="⌘G">Find Again</vf-menu-item>
    </vf-menu>
  </vf-menu-bar>
  <vf-menu id="lone" label="Actions" shortcuts>
    <vf-menu-item id="dup" value="duplicate" shortcut="⌘D">Duplicate</vf-menu-item>
  </vf-menu>
  <vf-menu id="ungranted" label="Mock">
    <vf-menu-item id="mock" value="mock" shortcut="⌘E">Export</vf-menu-item>
  </vf-menu>
  <input id="field">
`

const browser = await launch()
const build = makeBuild(browser)

/**
 * Log every vf-menu-select plus, per keydown reaching the window (after the
 * kit's document-level ear), whether the stroke was claimed.
 */
const instrument = (page) =>
  page.evaluate(() => {
    window.__selects = []
    window.__keys = []
    document.addEventListener('vf-menu-select', (e) =>
      window.__selects.push(e.detail.value)
    )
    window.addEventListener('keydown', (e) =>
      window.__keys.push({ key: e.key, claimed: e.defaultPrevented })
    )
  })

const selects = (page) => page.evaluate(() => window.__selects)
const lastKey = (page) => page.evaluate(() => window.__keys.at(-1) ?? null)

/* ── GRANT + MATCH (reduced motion: activation is synchronous) ──────────── */
{
  const page = await build(MARKUP, { reducedMotion: true })
  await instrument(page)

  // The granted bar answers ⌘S with the menu closed.
  await page.evaluate(() => document.getElementById('field').focus())
  await page.keyboard.press('Meta+s')
  let got = await selects(page)
  let key = await lastKey(page)
  check(
    'granted bar: ⌘S fires vf-menu-select through the closed menu',
    got.length === 1 && got[0] === 'save',
    JSON.stringify(got)
  )
  check('…and the stroke is claimed (preventDefault)', key?.claimed === true)
  const state = await page.evaluate(() => ({
    open: document.getElementById('file').hasAttribute('open'),
    active: document.activeElement?.id ?? null,
  }))
  check('…the menu never opens', state.open === false)
  check(
    '…and focus never moves (still in the field)',
    state.active === 'field',
    `activeElement: ${state.active}`
  )

  // Exact modifiers: ⌘⇧S is the OTHER item, never a loose ⌘S match.
  await page.keyboard.press('Meta+Shift+s')
  got = await selects(page)
  check(
    'modifiers are exact: ⌘⇧S fires Save As, not Save',
    got.length === 2 && got[1] === 'save-as',
    JSON.stringify(got)
  )

  // A disabled item claims nothing — the stroke falls through untouched.
  await page.keyboard.press('Meta+p')
  got = await selects(page)
  key = await lastKey(page)
  check(
    'a disabled item does not activate on its key',
    got.length === 2,
    JSON.stringify(got)
  )
  check('…and does not claim the stroke', key?.claimed === false)

  // A bare printable shortcut renders but never matches: typing stays typing.
  await page.evaluate(() => document.getElementById('field').focus())
  await page.keyboard.type('s')
  got = await selects(page)
  const typed = await page.evaluate(() => document.getElementById('field').value)
  check(
    'a bare-letter shortcut never hijacks typing',
    got.length === 2 && typed === 's',
    `selects ${JSON.stringify(got)}, field "${typed}"`
  )

  // The standalone granted menu answers too; the ungranted one stays inert.
  await page.keyboard.press('Meta+d')
  await page.keyboard.press('Meta+e')
  got = await selects(page)
  key = await lastKey(page)
  check(
    'a standalone vf-menu[shortcuts] answers its item',
    got.length === 3 && got[2] === 'duplicate',
    JSON.stringify(got)
  )
  check(
    'no grant, no claim: the ungranted menu ignores its shortcut',
    got.length === 3 && key?.claimed === false,
    JSON.stringify(key)
  )

  // A page handler that claimed the stroke first keeps it.
  await page.evaluate(() => {
    document.addEventListener('keydown', (e) => {
      if (e.metaKey && e.key === 'g') e.preventDefault()
    }, true)
  })
  await page.keyboard.press('Meta+g')
  got = await selects(page)
  check(
    "a consumer's earlier preventDefault keeps the key",
    got.length === 3,
    JSON.stringify(got)
  )

  // Auto-repeat: claimed, but only the first stroke activates.
  const repeat = await page.evaluate(() => {
    window.__selects.length = 0
    const stroke = (repeat) => {
      const e = new KeyboardEvent('keydown', {
        key: 's', metaKey: true, repeat,
        bubbles: true, cancelable: true, composed: true,
      })
      document.body.dispatchEvent(e)
      return e.defaultPrevented
    }
    const first = stroke(false)
    const second = stroke(true)
    return { first, second, selects: window.__selects }
  })
  check(
    'auto-repeat strokes are claimed but activate once',
    repeat.first && repeat.second && repeat.selects.length === 1,
    JSON.stringify(repeat)
  )

  await page.close()
}

/* ── FLASH (full motion: the closed menu's title acknowledges the key) ──── */
{
  const page = await build(MARKUP)
  await instrument(page)

  await page.keyboard.press('Meta+s')
  // The flash inverts the label on the blink cadence (~250ms, on-phases from
  // +42ms); poll for one inverted frame.
  const flashed = await page
    .waitForFunction(() => {
      const label = document
        .getElementById('file')
        .shadowRoot.querySelector('.label')
      return getComputedStyle(label).backgroundColor === 'rgb(0, 0, 0)'
    }, null, { timeout: 2000 })
    .then(() => true, () => false)
  check('the closed menu flashes its title (MenuKey acknowledgment)', flashed === true)
  const settled = await page
    .waitForFunction(() => window.__selects.length > 0, null, { timeout: 2000 })
    .then(() => true, () => false)
  check('…and vf-menu-select lands after the blink', settled === true)
  const after = await page.evaluate(() => ({
    open: document.getElementById('file').hasAttribute('open'),
    inverted:
      getComputedStyle(
        document.getElementById('file').shadowRoot.querySelector('.label')
      ).backgroundColor === 'rgb(0, 0, 0)',
  }))
  check('…the flash ends un-inverted with the menu still closed',
    after.open === false && after.inverted === false,
    JSON.stringify(after))

  // An OPEN menu skips the flash and closes through the normal path.
  await page.evaluate(() => {
    window.__selects.length = 0
    document.getElementById('file').open = true
  })
  await page.evaluate(() =>
    document.getElementById('file').updateComplete
  )
  await page.keyboard.press('Meta+s')
  const closed = await page
    .waitForFunction(
      () =>
        window.__selects.length === 1 &&
        !document.getElementById('file').hasAttribute('open'),
      null,
      { timeout: 2000 }
    )
    .then(() => true, () => false)
  check('an open menu: the key still selects, and the menu closes', closed === true)

  await page.close()
}

await report(browser)
