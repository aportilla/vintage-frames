/**
 * Behavioral regression suite for the LOW bug sweep (hit-list, 2026-07-24).
 *
 * Covers the fixes that are only observable at runtime — ARIA state that has to
 * survive a reconnect, a blink timer that has to be cancelled, a pointer capture
 * that goes missing, non-finite geometry, and the scale controller's ownership
 * of an inline custom property. Each check is written so it FAILS against the
 * pre-fix code; see the hit-list note for the confirmed failure counts.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:low-sweep
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()
// The blink must actually run: under reduced motion runSelectionBlink()
// short-circuits and there is no in-flight timer left to cancel.
const page = await browser.newPage({ reducedMotion: 'no-preference' })

async function load(markup, tags) {
  await page.route(ORIGIN, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8">',
    })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(markup)
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate((t) => customElements.whenDefined(t), tags[0])
  await page.evaluate(
    (sel) =>
      Promise.all(
        [...document.querySelectorAll(sel)].map((e) => e.updateComplete)
      ),
    tags.join(', ')
  )
}

// ═══════════════════════════════════════════════ vf-menu-item: role + blink
await load(
  `
  <div id="host">
    <vf-menu-bar>
      <vf-menu label="File">
        <vf-menu-item id="on" checked>Show Ruler</vf-menu-item>
        <vf-menu-item id="off" checkable>Show Grid</vf-menu-item>
        <vf-menu-item id="plain">New Window</vf-menu-item>
        <vf-menu-item id="authored" role="menuitemradio">By Name</vf-menu-item>
        <vf-menu-item id="blinker" value="blink">Blink Me</vf-menu-item>
      </vf-menu>
    </vf-menu-bar>
  </div>
`,
  ['vf-menu-item', 'vf-menu', 'vf-menu-bar']
)

const aria = (id) =>
  page.evaluate((i) => {
    const el = document.getElementById(i)
    return { role: el.getAttribute('role'), checked: el.getAttribute('aria-checked') }
  }, id)

check(
  'an initially-off `checkable` item announces as a toggle from the start',
  await aria('off').then((a) => a.role === 'menuitemcheckbox' && a.checked === 'false'),
  JSON.stringify(await aria('off'))
)
check(
  'a plain command item stays role=menuitem with no aria-checked',
  await aria('plain').then((a) => a.role === 'menuitem' && a.checked === null),
  JSON.stringify(await aria('plain'))
)
check(
  'an author-supplied role is left alone (no aria-checked forced on)',
  await aria('authored').then((a) => a.role === 'menuitemradio' && a.checked === null),
  JSON.stringify(await aria('authored'))
)

// Re-parent every item: connectedCallback re-runs but updated() does not, which
// is what used to strand a checkable item on role=menuitem.
await page.evaluate(async () => {
  const host = document.getElementById('host')
  const bar = host.firstElementChild
  const parked = document.createElement('div')
  document.body.append(parked)
  parked.append(bar)
  host.append(bar)
  await Promise.all(
    [...document.querySelectorAll('vf-menu-item')].map((e) => e.updateComplete)
  )
})

check(
  'a checked item keeps menuitemcheckbox + aria-checked across a reconnect',
  await aria('on').then((a) => a.role === 'menuitemcheckbox' && a.checked === 'true'),
  JSON.stringify(await aria('on'))
)
check(
  'a `checkable` item keeps its toggle role across a reconnect',
  await aria('off').then((a) => a.role === 'menuitemcheckbox' && a.checked === 'false'),
  JSON.stringify(await aria('off'))
)
check(
  'an author-supplied role also survives the reconnect',
  await aria('authored').then((a) => a.role === 'menuitemradio'),
  JSON.stringify(await aria('authored'))
)

// ── Disabling mid-blink drops the pending vf-menu-select ──
await page.evaluate(() => {
  window.__sel = []
  document
    .getElementById('host')
    .addEventListener('vf-menu-select', (e) => window.__sel.push(e.detail?.value))
})
await page.evaluate(() =>
  document.getElementById('blinker').shadowRoot.querySelector('.item').click()
)
// Well inside the ~250ms blink (6 flips × 42ms).
await page.waitForTimeout(60)
await page.evaluate(async () => {
  const el = document.getElementById('blinker')
  el.disabled = true
  await el.updateComplete
})
await page.waitForTimeout(400)
check(
  'disabling an item mid-blink cancels it — no vf-menu-select fires',
  await page.evaluate(() => window.__sel.length === 0),
  `sel=${JSON.stringify(await page.evaluate(() => window.__sel))}`
)
check(
  'the cancelled blink leaves no stuck inverted row',
  await page.evaluate(() => {
    const item = document.getElementById('blinker').shadowRoot.querySelector('.item')
    return !item.classList.contains('blink-on') && !item.classList.contains('blink-off')
  })
)

// Regression: a normal activation must still dispatch (guard against over-cancelling).
await page.evaluate(async () => {
  const el = document.getElementById('blinker')
  el.disabled = false
  await el.updateComplete
  window.__sel.length = 0
  el.shadowRoot.querySelector('.item').click()
})
await page.waitForFunction(() => window.__sel.length > 0, null, { timeout: 2000 })
check(
  'an enabled item still completes its blink and fires vf-menu-select',
  await page.evaluate(() => window.__sel[0] === 'blink')
)

// ═══════════════════════════════════════════ vf-window: lost pointer capture
await load(
  `<div style="position:relative;width:600px;height:600px">
     <vf-window id="win" heading="Resize Me" resizable movable
       style="position:absolute;left:20px;top:20px;width:200px;height:150px"></vf-window>
   </div>`,
  ['vf-window']
)

const size = () =>
  page.evaluate(() => {
    const r = document.getElementById('win').getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  })

// Record the real pointerId the browser assigns, so the synthetic
// lostpointercapture below matches the in-flight gesture.
await page.evaluate(() => {
  window.__pid = null
  document
    .getElementById('win')
    .shadowRoot.querySelector('.grow')
    .addEventListener('pointerdown', (e) => (window.__pid = e.pointerId))
})

// Re-read each time: the grow box is pinned to the bottom-right corner, so it
// MOVES as soon as the window resizes. Reusing a stale centre would silently
// aim the next gesture at empty space (and pass for the wrong reason).
const growCentre = () =>
  page.evaluate(() => {
    const r = document
      .getElementById('win')
      .shadowRoot.querySelector('.grow')
      .getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })

const grow = await growCentre()

const before = await size()
await page.mouse.move(grow.x, grow.y)
await page.mouse.down()
await page.mouse.move(grow.x + 40, grow.y + 40)
const dragged = await size()
check(
  'the grow box resizes on drag (baseline)',
  dragged.w > before.w && dragged.h > before.h,
  `${before.w}×${before.h} → ${dragged.w}×${dragged.h}`
)

// Capture is stolen: the event fires but pointermove keeps arriving, because the
// grow div is still in the DOM and still has the real capture.
await page.evaluate(() => {
  const g = document.getElementById('win').shadowRoot.querySelector('.grow')
  g.dispatchEvent(
    new PointerEvent('lostpointercapture', { pointerId: window.__pid, bubbles: true })
  )
})
check(
  'losing the capture clears the resize state',
  await page.evaluate(() => document.getElementById('win')._resizeState === null)
)
await page.mouse.move(grow.x + 160, grow.y + 160)
const after = await size()
check(
  'a pointermove after the lost capture no longer resizes',
  after.w === dragged.w && after.h === dragged.h,
  `${dragged.w}×${dragged.h} → ${after.w}×${after.h}`
)
await page.mouse.up()

// Disconnect during a gesture must not leave a live resize behind.
const grow2 = await growCentre()
await page.mouse.move(grow2.x, grow2.y)
await page.mouse.down()
await page.mouse.move(grow2.x + 20, grow2.y + 20)
check(
  'a fresh gesture arms the resize state (guards the check below)',
  await page.evaluate(() => document.getElementById('win')._resizeState !== null)
)
check(
  'disconnecting mid-resize clears the resize state',
  await page.evaluate(() => {
    const win = document.getElementById('win')
    const parent = win.parentElement
    win.remove()
    parent.append(win)
    return win._resizeState === null
  })
)
await page.mouse.up()

// ═════════════════════════════════ numeric: exponential step + NaN geometry
await load(
  `<form id="f">
     <vf-number-field id="num" name="n" value="1" step="1e-7"></vf-number-field>
     <vf-slider id="sl" name="vol" min="0" max="100" step="1" value="50"></vf-slider>
   </form>`,
  ['vf-number-field', 'vf-slider']
)

await page.evaluate(() =>
  document.getElementById('num').shadowRoot.querySelector('input').focus()
)
await page.keyboard.press('ArrowUp')
await page.evaluate(() => document.getElementById('num').updateComplete)
check(
  'a 1e-7 step keeps its precision instead of rounding to an integer',
  await page.evaluate(() => document.getElementById('num').value) === '1.0000001',
  `value=${await page.evaluate(() => document.getElementById('num').value)}`
)

// A conventional fractional step must still behave (the shared helper's other branch).
await page.evaluate(async () => {
  const el = document.getElementById('num')
  el.step = 0.25
  el.value = '1'
  await el.updateComplete
  el.shadowRoot.querySelector('input').focus()
})
await page.keyboard.press('ArrowUp')
await page.evaluate(() => document.getElementById('num').updateComplete)
check(
  'a 0.25 step still rounds to 2 decimals',
  await page.evaluate(() => document.getElementById('num').value) === '1.25',
  `value=${await page.evaluate(() => document.getElementById('num').value)}`
)

const thumbLeft = () =>
  page.evaluate(
    () => document.getElementById('sl').shadowRoot.querySelector('.thumb').style.left
  )
const formValue = (name) =>
  page.evaluate((n) => new FormData(document.getElementById('f')).get(n), name)

check(
  'the slider positions its thumb from a finite value (baseline)',
  /^[\d.]+px$/.test(await thumbLeft()),
  `left=${await thumbLeft()}`
)
await page.evaluate(async () => {
  const el = document.getElementById('sl')
  el.value = NaN
  await el.updateComplete
})
check(
  'a NaN slider value falls back to min instead of writing left:NaNpx',
  (await thumbLeft()) === '0px',
  `left=${JSON.stringify(await thumbLeft())}`
)
check(
  'a NaN slider value submits as min, not the string "NaN"',
  (await formValue('vol')) === '0',
  `FormData=${JSON.stringify(await formValue('vol'))}`
)
await page.evaluate(async () => {
  const el = document.getElementById('sl')
  el.value = Infinity
  await el.updateComplete
})
check(
  'an Infinity slider value is also coerced',
  (await formValue('vol')) === '0',
  `FormData=${JSON.stringify(await formValue('vol'))}`
)

// ═══════════════════════════════════════════ vf-list: disabled propagation
await load(
  `<vf-list id="list" disabled label="Fonts">
     <vf-list-item value="chicago">Chicago</vf-list-item>
     <vf-list-item value="geneva" disabled>Geneva</vf-list-item>
     <vf-list-item value="monaco">Monaco</vf-list-item>
   </vf-list>`,
  ['vf-list', 'vf-list-item']
)
const rowAria = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('vf-list-item')].map((i) =>
      i.getAttribute('aria-disabled')
    )
  )
check(
  'a disabled list marks every row aria-disabled',
  await rowAria().then((a) => a.every((v) => v === 'true')),
  JSON.stringify(await rowAria())
)
await page.evaluate(async () => {
  const list = document.getElementById('list')
  list.disabled = false
  await list.updateComplete
  await Promise.all(
    [...document.querySelectorAll('vf-list-item')].map((i) => i.updateComplete)
  )
})
check(
  're-enabling the list clears the rows but keeps a row disabled in its own right',
  await rowAria().then((a) => a[0] === null && a[1] === 'true' && a[2] === null),
  JSON.stringify(await rowAria())
)

// ══════════════════════════════════ ScaleController: consumer inline override
await load(
  `<vf-button id="pinned" style="--vf-scale: 1">Pinned</vf-button>
   <vf-button id="auto">Auto</vf-button>`,
  ['vf-button']
)
const inlineScale = (id) =>
  page.evaluate(
    (i) => document.getElementById(i).style.getPropertyValue('--vf-scale').trim(),
    id
  )
check(
  "a consumer's inline --vf-scale is not overwritten on first connect",
  (await inlineScale('pinned')) === '1',
  `--vf-scale=${JSON.stringify(await inlineScale('pinned'))}`
)
check(
  'an unset component still gets default-on true-size scaling',
  parseFloat(await inlineScale('auto')) > 0,
  `--vf-scale=${JSON.stringify(await inlineScale('auto'))}`
)
await page.evaluate(async () => {
  for (const id of ['pinned', 'auto']) {
    const el = document.getElementById(id)
    const parent = el.parentElement
    el.remove()
    parent.append(el)
    await el.updateComplete
  }
})
check(
  "the consumer's value still wins after a reconnect",
  (await inlineScale('pinned')) === '1',
  `--vf-scale=${JSON.stringify(await inlineScale('pinned'))}`
)
check(
  'a controller-owned value resumes syncing after a reconnect',
  parseFloat(await inlineScale('auto')) > 0,
  `--vf-scale=${JSON.stringify(await inlineScale('auto'))}`
)

// ═══════════════════════════════════════ vf-button: reset respects cancellation
await load(
  `<form id="f">
     <vf-text-field id="tf" name="t" value="orig"></vf-text-field>
     <vf-button id="rb" type="reset">Revert</vf-button>
   </form>`,
  ['vf-button', 'vf-text-field']
)
const fieldValue = () => page.evaluate(() => document.getElementById('tf').value)

await page.evaluate(async () => {
  const tf = document.getElementById('tf')
  tf.value = 'edited'
  await tf.updateComplete
  // Capture phase: reaches vf-button's shadow-internal handler before it acts.
  window.__cancel = (e) => e.preventDefault()
  document.getElementById('f').addEventListener('click', window.__cancel, true)
})
await page.evaluate(() =>
  document.getElementById('rb').shadowRoot.querySelector('button').click()
)
await page.evaluate(() => document.getElementById('tf').updateComplete)
check(
  'a cancelled click suppresses the reset',
  (await fieldValue()) === 'edited',
  `value=${JSON.stringify(await fieldValue())}`
)

await page.evaluate(() =>
  document.getElementById('f').removeEventListener('click', window.__cancel, true)
)
await page.evaluate(() =>
  document.getElementById('rb').shadowRoot.querySelector('button').click()
)
await page.evaluate(() => document.getElementById('tf').updateComplete)
check(
  'an uncancelled click still resets the form',
  (await fieldValue()) === 'orig',
  `value=${JSON.stringify(await fieldValue())}`
)

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
