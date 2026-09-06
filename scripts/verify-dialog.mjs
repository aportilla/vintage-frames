/**
 * Verifies vf-dialog's light dismiss — the opt-in `light-dismiss` attribute
 * (`VfModalDialog.lightDismiss`): a click outside the frame closes the modal
 * with `vf-close` reason 'outside', and nothing else does.
 *
 *  - OFF BY DEFAULT: without the attribute an outside click leaves the dialog
 *    open and fires nothing — the classic modal ignored it.
 *  - OUTSIDE: press + release on the backdrop closes it; `open` reconciles,
 *    the reason is 'outside', focus returns to the invoker, and the page under
 *    the press never sees the click — a modal's backdrop consumes it, which is
 *    what lets a consumer dismiss an About box without also selecting the
 *    icon that was under the pointer.
 *  - TWO HALVES: a press that starts on the frame and releases outside — or
 *    starts outside and releases on the frame — does not dismiss, and neither
 *    does a title-bar drag. That is the platform's own light-dismiss rule
 *    (`closedby="any"`), and it is why the `click` event is not the trigger:
 *    UI Events dispatches a press-drag-release click at the common ancestor of
 *    the two targets, which for a press on the frame released outside is the
 *    dialog itself.
 *  - EDGE: the first pixel column inside the frame is inside; the one past it
 *    is out. The frame fills the dialog's box, so target identity is the whole
 *    test — no rect arithmetic that could be off by a pixel. Probed at WHOLE
 *    CSS px on purpose: Blink hit-tests a pointer as a 1×1 CSS-px rect
 *    anchored at the point, so a fractional coordinate bleeds one pixel left
 *    and up (measured: x = 439.25 on a box starting at 440 hits the box;
 *    x = 439 hits the backdrop; the right and bottom edges are exact).
 *  - LIVE: the property toggled on an open dialog takes effect at the next
 *    press (and reflects); Escape and close() keep their reasons; the plain
 *    frame dismisses the same way.
 *  - KEYBOARD: the classic Dialog Manager rules (`VfModalDialog`). On open,
 *    focus lands in the first text-entry control — or, with none, on the
 *    default button — never on Cancel or a link in the body, which is where
 *    `showModal()`'s own flat-tree pick put it. Return/Enter activates the
 *    default button from anywhere: a focused Cancel included (Space is what
 *    presses the focused control), a text field, and a multi-line editor
 *    on the keypad's Enter only (Return inserts the newline there). A link
 *    keeps its own Enter; `autofocus` names the initial control; a form's
 *    implicit submission runs once, not twice.
 *
 *   npm run dev            # in another shell (port 5173)
 *   npm run verify:dialog
 */
import { check, launch, makeBuild, report } from './harness.mjs'

const browser = await launch()
const build = makeBuild(browser, { viewport: { width: 1200, height: 700 } })

/** A page with one dialog, an opener, and a button the backdrop covers. */
const PAGE = (attrs) => `
  <button id="under" style="position:fixed;left:0;top:0;width:60px;height:30px">Under</button>
  <button id="opener" style="position:fixed;left:100px;top:0">Open</button>
  <vf-dialog id="dlg" heading="About" width="320" height="160" ${attrs}>
    <vf-paragraph>Body</vf-paragraph>
    <vf-button slot="buttons" variant="default">OK</vf-button>
  </vf-dialog>
`

/** Wire the counters once, then open via the opener so focus has somewhere to return. */
const OPEN = async () => {
  const dlg = document.getElementById('dlg')
  if (!window.__events) {
    window.__events = []
    window.__underClicks = 0
    dlg.addEventListener('vf-close', (e) => window.__events.push(e.detail.reason))
    document.getElementById('under').addEventListener('click', () => window.__underClicks++)
  }
  window.__events.length = 0
  document.getElementById('opener').focus()
  dlg.show()
  await dlg.updateComplete
  const r = dlg.shadowRoot.querySelector('dialog').getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

/** Everything a check reads, after the queued native close has had its turn. */
const STATE = async () => {
  await new Promise((res) => setTimeout(res, 50))
  const dlg = document.getElementById('dlg')
  return {
    open: dlg.open,
    attr: dlg.hasAttribute('open'),
    nativeOpen: dlg.shadowRoot.querySelector('dialog').open,
    events: [...window.__events],
    focusOnOpener: document.activeElement === document.getElementById('opener'),
    underClicks: window.__underClicks,
    left: dlg.left ?? null,
    top: dlg.top ?? null,
  }
}

const stillOpen = (s) => s.open && s.attr && s.nativeOpen && s.events.length === 0
const closedWith = (s, reason) =>
  !s.open && !s.attr && !s.nativeOpen && s.events.length === 1 && s.events[0] === reason

/** Press at one point, release at another (or the same one). */
async function gesture(page, from, to = from) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  if (to !== from) await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
}

/* ────────────────────────────────────────────────────────────────────────────
   1. OFF BY DEFAULT — an outside click is ignored without the attribute
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(PAGE(''))
  const rect = await page.evaluate(OPEN)
  const outside = { x: rect.left - 40, y: rect.top - 40 }

  await gesture(page, outside)
  const s = await page.evaluate(STATE)
  check('default: an outside click leaves the dialog open, nothing fired', stillOpen(s), JSON.stringify(s.events))

  // The escape hatch is unchanged.
  await page.keyboard.press('Escape')
  const e = await page.evaluate(STATE)
  check("default: Escape still closes with reason 'escape'", closedWith(e, 'escape'), JSON.stringify(e.events))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2. OUTSIDE — press + release on the backdrop dismisses
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(PAGE('light-dismiss'))
  let rect = await page.evaluate(OPEN)
  const outside = { x: rect.left - 40, y: rect.top - 40 }
  const inside = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
  const bar = { x: (rect.left + rect.right) / 2, y: rect.top + 10 }

  check(
    'light-dismiss: the attribute reflects to the property',
    await page.evaluate(() => document.getElementById('dlg').lightDismiss === true)
  )

  // Over the page button the backdrop covers: (30, 15) is inside #under.
  await gesture(page, { x: 30, y: 15 })
  let s = await page.evaluate(STATE)
  check("light-dismiss: an outside click closes with reason 'outside'", closedWith(s, 'outside'), JSON.stringify(s))
  check('light-dismiss: focus returned to the invoker', s.focusOnOpener)
  check('light-dismiss: the page under the press never saw the click', s.underClicks === 0, `${s.underClicks} clicks on #under`)

  // Two halves: press on the frame, release outside.
  rect = await page.evaluate(OPEN)
  await gesture(page, inside, outside)
  s = await page.evaluate(STATE)
  check('two halves: press on the body, release outside — stays open', stillOpen(s), JSON.stringify(s.events))

  // …and the mirror: press outside, release on the frame.
  await gesture(page, outside, inside)
  s = await page.evaluate(STATE)
  check('two halves: press outside, release on the body — stays open', stillOpen(s), JSON.stringify(s.events))

  // A click wholly inside is a click on the content, never a dismissal.
  await gesture(page, inside)
  s = await page.evaluate(STATE)
  check('inside: a click on the body stays open', stillOpen(s), JSON.stringify(s.events))

  // A title-bar drag moves the dialog and never dismisses it (the bar holds
  // pointer capture, so its release targets the bar wherever it lands).
  await gesture(page, bar, { x: bar.x + 100, y: bar.y + 50 })
  s = await page.evaluate(STATE)
  check(
    'drag: a title-bar drag moves the dialog and stays open',
    stillOpen(s) && s.left === rect.left + 100 && s.top === rect.top + 50,
    `left ${s.left} top ${s.top} (from ${rect.left}, ${rect.top}) ${JSON.stringify(s.events)}`
  )

  // Now that it has been dragged, the stated origin survives a dismissal and
  // the next open lands where it was left (a dragged modal keeps its spot).
  const moved = { left: rect.left + 100, top: rect.top + 50 }
  await gesture(page, outside)
  s = await page.evaluate(STATE)
  check("after a drag: an outside click still closes with 'outside'", closedWith(s, 'outside'), JSON.stringify(s.events))
  check('after a drag: the stated origin survives the close', s.left === moved.left && s.top === moved.top, `${s.left}, ${s.top}`)

  await page.evaluate(() => {
    const dlg = document.getElementById('dlg')
    dlg.left = null
    dlg.top = null
  })
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   3. EDGE — the frame's first pixel is inside, the next one out
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(PAGE('light-dismiss'))
  let rect = await page.evaluate(OPEN)
  const midY = (rect.top + rect.bottom) / 2
  check(
    'edge: the centered dialog lands on whole CSS px (so the edge is a real column)',
    Number.isInteger(rect.left) && Number.isInteger(rect.top),
    `left ${rect.left} top ${rect.top}`
  )

  // The first column inside the outer rule — a click on the frame itself.
  await gesture(page, { x: rect.left, y: midY })
  let s = await page.evaluate(STATE)
  check('edge: a click on the outer rule (first column in) stays open', stillOpen(s), JSON.stringify(s.events))

  // One column out: the backdrop.
  await gesture(page, { x: rect.left - 1, y: midY })
  s = await page.evaluate(STATE)
  check('edge: a click one column out closes', closedWith(s, 'outside'), JSON.stringify(s.events))

  // The same on the bottom edge (rect.bottom is exclusive: the last row in
  // is bottom − 1, and bottom itself is the first row of backdrop).
  rect = await page.evaluate(OPEN)
  const midX = (rect.left + rect.right) / 2
  await gesture(page, { x: midX, y: rect.bottom - 1 })
  s = await page.evaluate(STATE)
  check('edge: a click on the bottom rule stays open', stillOpen(s), JSON.stringify(s.events))
  await gesture(page, { x: midX, y: rect.bottom })
  s = await page.evaluate(STATE)
  check('edge: a click one row below closes', closedWith(s, 'outside'), JSON.stringify(s.events))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4. LIVE — toggled on an open dialog; the other reasons; the plain frame
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(PAGE(''))
  let rect = await page.evaluate(OPEN)
  const outside = { x: rect.left - 40, y: rect.top - 40 }

  await page.evaluate(() => {
    document.getElementById('dlg').lightDismiss = true
  })
  await page.evaluate(() => document.getElementById('dlg').updateComplete)
  check(
    'live: the property reflects to the attribute',
    await page.evaluate(() => document.getElementById('dlg').hasAttribute('light-dismiss'))
  )
  await gesture(page, outside)
  let s = await page.evaluate(STATE)
  check('live: set on an open dialog, the next outside click closes', closedWith(s, 'outside'), JSON.stringify(s.events))

  await page.evaluate(() => {
    document.getElementById('dlg').lightDismiss = false
  })
  rect = await page.evaluate(OPEN)
  await gesture(page, outside)
  s = await page.evaluate(STATE)
  check('live: cleared again, the outside click is ignored', stillOpen(s), JSON.stringify(s.events))

  await page.evaluate(() => document.getElementById('dlg').close())
  s = await page.evaluate(STATE)
  check("live: close() still reports 'close'", closedWith(s, 'close'), JSON.stringify(s.events))
  await page.close()
}

{
  const page = await build(PAGE('light-dismiss frame="plain"'))
  const rect = await page.evaluate(OPEN)
  await gesture(page, { x: rect.right + 40, y: rect.bottom + 40 })
  const s = await page.evaluate(STATE)
  check("plain frame: an outside click closes with 'outside'", closedWith(s, 'outside'), JSON.stringify(s.events))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. KEYBOARD — initial focus and the Return/Enter rule
   ──────────────────────────────────────────────────────────────────────── */
const KEYS = (body, buttons = ROW) => `
  <button id="opener">Open</button>
  <vf-dialog id="dlg" heading="Keys" width="360" height="220">
    ${body}
    ${buttons}
  </vf-dialog>
`
const ROW = `
  <vf-button slot="buttons" id="cancel">Cancel</vf-button>
  <vf-button slot="buttons" id="ok" variant="default">OK</vf-button>
`

/** Count every button/link activation once, open, and report where focus is. */
const OPEN_KEYS = async () => {
  const dlg = document.getElementById('dlg')
  if (!window.__clicks) {
    window.__clicks = []
    for (const el of document.querySelectorAll('vf-button, a')) {
      el.addEventListener('click', (e) => {
        window.__clicks.push(el.id)
        if (el.localName === 'a') e.preventDefault()
      })
    }
  }
  window.__clicks.length = 0
  document.getElementById('opener').focus()
  dlg.show()
  await dlg.updateComplete
  return document.activeElement?.id ?? ''
}
const CLICKS = () => [...window.__clicks]
const FOCUS = (id) => document.getElementById(id).focus()
const CLOSE = () => document.getElementById('dlg').close()

async function keys(page, key) {
  await page.evaluate(() => (window.__clicks.length = 0))
  await page.keyboard.press(key)
  await page.waitForTimeout(30)
  return page.evaluate(CLICKS)
}

// Buttons only: OK, not Cancel, takes focus; Return presses it from a focused
// Cancel too, and Space is what presses Cancel.
{
  const page = await build(KEYS('<vf-paragraph>Body</vf-paragraph>'))
  const focused = await page.evaluate(OPEN_KEYS)
  check('keys: with no text field, the default button takes focus on open', focused === 'ok', focused)
  let clicks = await keys(page, 'Enter')
  check('keys: Enter activates the default button once', clicks.join() === 'ok', clicks.join())

  await page.evaluate(FOCUS, 'cancel')
  clicks = await keys(page, 'Enter')
  check('keys: Enter on a focused Cancel still activates the default button', clicks.join() === 'ok', clicks.join())
  clicks = await keys(page, 'Space')
  check('keys: Space presses the focused Cancel', clicks.join() === 'cancel', clicks.join())
  await page.close()
}

// A link in the body: never the initial focus; once focused, Enter is its own.
{
  const page = await build(
    KEYS('<vf-paragraph>See <a id="link" href="#more">more</a></vf-paragraph>')
  )
  const focused = await page.evaluate(OPEN_KEYS)
  check('keys: a link in the body does not take the initial focus', focused === 'ok', focused)
  await page.evaluate(FOCUS, 'link')
  const clicks = await keys(page, 'Enter')
  check('keys: Enter on a focused link follows the link, not the default button', clicks.join() === 'link', clicks.join())
  await page.close()
}

// A text field: the insertion point goes there, and Return means OK.
{
  const page = await build(
    KEYS('<vf-text-field id="field" label="Name" value="Untitled"></vf-text-field>')
  )
  const focused = await page.evaluate(OPEN_KEYS)
  check('keys: the first text field takes focus on open', focused === 'field', focused)
  const clicks = await keys(page, 'Enter')
  check('keys: Enter in a text field activates the default button', clicks.join() === 'ok', clicks.join())
  await page.close()
}

// A multi-line editor: Return is a newline; the keypad's Enter is the button.
{
  const page = await build(
    KEYS('<vf-text-area id="area" label="Notes" value="one"></vf-text-area>')
  )
  const focused = await page.evaluate(OPEN_KEYS)
  check('keys: a text area takes focus on open', focused === 'area', focused)
  let clicks = await keys(page, 'Enter')
  let value = await page.evaluate(() => document.getElementById('area').value)
  check('keys: Return in a text area inserts a newline, not a press', clicks.length === 0 && value === 'one\n', `${JSON.stringify(value)} ${clicks.join()}`)
  clicks = await keys(page, 'NumpadEnter')
  value = await page.evaluate(() => document.getElementById('area').value)
  check('keys: keypad Enter in a text area activates the default button, no newline', clicks.join() === 'ok' && value === 'one\n', `${JSON.stringify(value)} ${clicks.join()}`)
  await page.close()
}

// A form: the field's implicit submission runs once, and the dialog does not
// press the same button a second time.
{
  const page = await build(
    KEYS(
      `<form id="form">
        <vf-text-field id="field" name="n" label="Name" value="x"></vf-text-field>
        <vf-button id="cancel">Cancel</vf-button>
        <vf-button id="ok" type="submit" variant="default">OK</vf-button>
      </form>`,
      ''
    )
  )
  await page.evaluate(() => {
    window.__submits = 0
    document.getElementById('form').addEventListener('submit', (e) => {
      e.preventDefault()
      window.__submits++
    })
  })
  const focused = await page.evaluate(OPEN_KEYS)
  check('keys: form — the text field takes focus on open', focused === 'field', focused)
  const clicks = await keys(page, 'Enter')
  const submits = await page.evaluate(() => window.__submits)
  check('keys: form — Enter in the field submits once, through the default button once', clicks.join() === 'ok' && submits === 1, `${clicks.join()} / ${submits} submits`)
  await page.close()
}

// autofocus names the initial control; with no default button Enter is inert.
{
  const page = await build(
    KEYS(
      `<vf-text-field id="first" label="First"></vf-text-field>
       <vf-text-field id="second" label="Second" autofocus></vf-text-field>`,
      '<vf-button slot="buttons" id="cancel">Cancel</vf-button>'
    )
  )
  const focused = await page.evaluate(OPEN_KEYS)
  check('keys: autofocus wins over the first text field', focused === 'second', focused)
  const clicks = await keys(page, 'Enter')
  const open = await page.evaluate(() => document.getElementById('dlg').open)
  check('keys: with no default button, Enter presses nothing and the dialog stays open', clicks.length === 0 && open, `${clicks.join()} open=${open}`)
  await page.evaluate(CLOSE)
  await page.close()
}

await report(browser)
