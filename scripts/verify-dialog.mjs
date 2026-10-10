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
 *    keeps its own Enter; `autofocus` names the initial control; `autoselect`
 *    names it too and selects its text on every open, a value set just
 *    before or on `vf-show` included; a form's implicit submission runs
 *    once, not twice. `select()` after a value write selects the new value.
 *  - ANSWERS: a `<form method="dialog">` (or a button's `formmethod="dialog"`)
 *    closes the dialog with the submitting button's value as `returnValue`,
 *    and `vf-close` carries it; a cancelled submit, a plain button and a form
 *    of another method don't close it; Enter in a field answers with the
 *    ringed button; Escape, `close()` and removal carry none; `close(value)`
 *    does; each open clears it.
 *  - REOPEN: `show()` straight after `close()`, before that close's native
 *    `close` event (it is queued) — the event used to close the dialog that
 *    had just opened. The dialog stays open, and the close is announced once,
 *    with its value, before the open's `vf-show`.
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
    <vf-button variant="default">OK</vf-button>
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
  <vf-button id="cancel">Cancel</vf-button>
  <vf-button id="ok" variant="default">OK</vf-button>
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
  const selection = () =>
    page.evaluate(() => {
      const input = document.getElementById('field').shadowRoot.querySelector('input')
      return [input.selectionStart, input.selectionEnd, input.value.length]
    })
  // The page says whether the default text is selected: here, on vf-show.
  await page.evaluate(() => {
    window.__shows = []
    document.getElementById('dlg').addEventListener('vf-show', (e) => {
      window.__shows.push(e.detail.focus?.id ?? null)
      if (window.__selectOnShow) e.detail.focus.select()
    })
  })
  const focused = await page.evaluate(OPEN_KEYS)
  check('keys: the first text field takes focus on open', focused === 'field', focused)
  let sel = await selection()
  check('keys: …with its text left as it is: the kit selects nothing itself', sel[0] === sel[1], sel.join())
  check(
    'keys: vf-show fires once on open, naming the element focused',
    (await page.evaluate(() => window.__shows.join())) === 'field'
  )
  const clicks = await keys(page, 'Enter')
  check('keys: Enter in a text field activates the default button', clicks.join() === 'ok', clicks.join())
  await page.evaluate(() => {
    window.__selectOnShow = true
    document.getElementById('dlg').close()
  })
  await page.evaluate(OPEN_KEYS)
  sel = await selection()
  check(
    'keys: a vf-show handler that calls select() opens the dialog with the whole text selected',
    sel[0] === 0 && sel[1] === sel[2] && sel[2] > 0,
    sel.join()
  )
  await page.close()
}

// select() on each of the three fields selects its whole value.
{
  const page = await build(`
    <vf-text-field id="t" label="T" value="name"></vf-text-field>
    <vf-number-field id="n" label="N" value="42"></vf-number-field>
    <vf-text-area id="a" label="A" value="two\nlines"></vf-text-area>
  `)
  const all = await page.evaluate(() =>
    ['t', 'n', 'a'].map((id) => {
      const el = document.getElementById(id)
      el.focus()
      el.select()
      const inner = el.shadowRoot.querySelector('.vf-field')
      return inner.selectionStart === 0 && inner.selectionEnd === inner.value.length && inner.value.length > 0
    })
  )
  check('select() selects the whole value of a text field, a number field and a text area', all.every(Boolean), all.join())
  const pending = await page.evaluate(async () => {
    const el = document.getElementById('t')
    el.focus()
    el.value = 'renamed'
    el.select()
    await el.updateComplete
    const inner = el.shadowRoot.querySelector('.vf-field')
    return [inner.value, inner.selectionStart, inner.selectionEnd].join()
  })
  check('select() right after a value write selects the new value once it renders', pending === 'renamed,0,7', pending)
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
      '<vf-button id="cancel">Cancel</vf-button>'
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

// autoselect takes the initial focus with the text selected, on every open,
// for a value set just before show() and for one set on vf-show.
{
  const page = await build(
    KEYS(
      `<vf-text-field id="first" label="First" value="keep"></vf-text-field>
       <vf-text-field id="name" label="Name" value="untitled" autoselect></vf-text-field>`
    )
  )
  await page.evaluate(() => {
    window.__shows = []
    document.getElementById('dlg').addEventListener('vf-show', (e) => {
      window.__shows.push(e.detail.focus?.id ?? null)
      if (window.__seedOnShow) document.getElementById('name').value = window.__seedOnShow
    })
  })
  /** Seed the field (or leave it to vf-show), open, type one character; the field's value. */
  const askThenType = async (seed, onShow = null) => {
    const focused = await page.evaluate(
      ([v, s]) => {
        window.__seedOnShow = s
        if (v !== null) document.getElementById('name').value = v
        document.getElementById('dlg').show()
        return document.activeElement?.id ?? ''
      },
      [seed, onShow]
    )
    await page.keyboard.type('x')
    const value = await page.evaluate(() => document.getElementById('name').value)
    await page.evaluate(CLOSE)
    return { focused, value }
  }
  let r = await askThenType('untitled 2')
  check('keys: autoselect takes the initial focus ahead of an earlier text field', r.focused === 'name', r.focused)
  check('keys: …with a value set just before show() selected: one character replaces it', r.value === 'x', r.value)
  check('keys: …and vf-show names it', (await page.evaluate(() => window.__shows.join())) === 'name')
  r = await askThenType('untitled 3')
  check('keys: autoselect selects again on the next open', r.value === 'x', r.value)
  r = await askThenType(null, 'from vf-show')
  check('keys: autoselect selects a value set in a vf-show handler', r.value === 'x', r.value)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   6. ANSWERS — returnValue, a dialog-method form, close(value)
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <button id="opener">Open</button>
    <iframe name="sink" style="display:none"></iframe>
    <vf-dialog id="dlg" heading="Ask" width="360" height="220">
      <form id="form" method="dialog" novalidate>
        <vf-text-field id="field" label="Name" value="x"></vf-text-field>
        <vf-button id="cancel" type="submit" value="cancel">Cancel</vf-button>
        <vf-button id="ok" type="submit" value="ok" variant="default">OK</vf-button>
        <vf-button id="more" value="more">More…</vf-button>
      </form>
      <form id="other" action="about:blank" target="sink">
        <vf-button id="get" type="submit" value="get">Get</vf-button>
        <vf-button id="alt" type="submit" value="alt" formmethod="dialog">Alt</vf-button>
      </form>
    </vf-dialog>
  `)
  /** Open, and resolve the returnValue the open left. */
  const open = () =>
    page.evaluate(async () => {
      const dlg = document.getElementById('dlg')
      if (!window.__closes) {
        window.__closes = []
        dlg.addEventListener('vf-close', (e) => window.__closes.push(e.detail))
      }
      window.__closes.length = 0
      document.getElementById('opener').focus()
      dlg.show()
      await dlg.updateComplete
      return dlg.returnValue
    })
  /** The dialog after the queued native close has had its turn. */
  const after = () =>
    page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 50))
      const dlg = document.getElementById('dlg')
      return { open: dlg.open, returnValue: dlg.returnValue, closes: [...window.__closes] }
    })
  const press = async (id) => {
    const at = await page.evaluate((i) => {
      const r = document.getElementById(i).getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, id)
    await page.mouse.click(at.x, at.y)
  }
  const closedWithValue = (s, value) =>
    !s.open && s.closes.length === 1 && s.closes[0].reason === 'close' && s.closes[0].returnValue === value

  await open()
  await press('cancel')
  let s = await after()
  check('answers: a dialog-method submit closes with the button’s value', closedWithValue(s, 'cancel') && s.returnValue === 'cancel', JSON.stringify(s))

  const cleared = await open()
  check('answers: returnValue clears on open', cleared === '', JSON.stringify(cleared))
  await press('more')
  s = await after()
  check('answers: a button that isn’t a submit button doesn’t close', s.open && s.closes.length === 0, JSON.stringify(s))

  await page.evaluate(() => document.getElementById('field').focus())
  await page.keyboard.press('Enter')
  s = await after()
  check('answers: Enter in a field answers with the ringed button, though Cancel comes first', closedWithValue(s, 'ok'), JSON.stringify(s))

  // Return in a number field commits the clamped value, then submits.
  const size = await build(`
    <vf-dialog id="dlg" heading="Size" width="360" height="220">
      <form id="form" method="dialog" novalidate>
        <vf-number-field id="size" label="Size" min="1" max="64"></vf-number-field>
        <vf-button id="cancel" type="submit" value="cancel">Cancel</vf-button>
        <vf-button id="ok" type="submit" value="ok" variant="default">OK</vf-button>
      </form>
    </vf-dialog>
  `)
  await size.evaluate(async () => {
    const dlg = document.getElementById('dlg')
    const field = document.getElementById('size')
    window.__log = []
    for (const type of ['vf-change', 'change']) field.addEventListener(type, () => window.__log.push(`${type} ${field.value}`))
    document.getElementById('form').addEventListener('submit', () => window.__log.push('submit'))
    dlg.addEventListener('vf-close', (e) => window.__log.push(`close ${e.detail.returnValue} ${field.value}`))
    dlg.show()
    await dlg.updateComplete
  })
  await size.keyboard.type('999')
  await size.keyboard.press('Enter')
  await size.waitForFunction(() => !document.getElementById('dlg').open)
  await size.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
  const log = await size.evaluate(() => window.__log)
  check(
    'answers: Return in a number field commits it clamped, then submits; the value reads 64 at the close, announced once',
    log.join() === 'vf-change 64,change 64,submit,close ok 64',
    log.join(' / ')
  )
  await size.close()

  await open()
  await page.evaluate(() =>
    document.getElementById('form').addEventListener('submit', (e) => e.preventDefault(), { once: true })
  )
  await press('ok')
  s = await after()
  check('answers: a cancelled submit leaves the dialog open', s.open && s.closes.length === 0, JSON.stringify(s))
  await press('ok')
  s = await after()
  check('answers: …and the next one closes it', closedWithValue(s, 'ok'), JSON.stringify(s))

  await open()
  await press('get')
  s = await after()
  check('answers: a form of another method doesn’t close the dialog', s.open && s.closes.length === 0, JSON.stringify(s))
  await press('alt')
  s = await after()
  check('answers: formmethod="dialog" on the button does', closedWithValue(s, 'alt'), JSON.stringify(s))

  await open()
  await page.keyboard.press('Escape')
  s = await after()
  check('answers: Escape carries no value', !s.open && s.closes[0]?.reason === 'escape' && s.closes[0]?.returnValue === null && s.returnValue === '', JSON.stringify(s))

  await open()
  await page.evaluate(() => document.getElementById('dlg').close('later'))
  s = await after()
  check('answers: close(value) carries the value', closedWithValue(s, 'later') && s.returnValue === 'later', JSON.stringify(s))
  await open()
  await page.evaluate(() => document.getElementById('dlg').close())
  s = await after()
  check('answers: close() alone carries none', closedWithValue(s, null), JSON.stringify(s))

  await open()
  const removed = await page.evaluate(async () => {
    document.getElementById('dlg').remove()
    await new Promise((r) => setTimeout(r, 50))
    return [...window.__closes]
  })
  check('answers: removal closes with none', removed.length === 1 && removed[0].returnValue === null, JSON.stringify(removed))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   7. REOPEN — asked again before the last close's native `close` event came
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-dialog id="dlg" heading="Again" width="360" height="160">
      <vf-text-field id="field" label="Name" value="x"></vf-text-field>
    </vf-dialog>
  `)
  const r = await page.evaluate(async () => {
    const dlg = document.getElementById('dlg')
    const log = []
    dlg.addEventListener('vf-show', () => log.push('show'))
    dlg.addEventListener('vf-close', (e) => log.push(`close ${e.detail.reason} ${e.detail.returnValue}`))
    dlg.show()
    await dlg.updateComplete
    const native = dlg.shadowRoot.querySelector('dialog')
    const late = new Promise((resolve) => native.addEventListener('close', resolve, { once: true }))
    dlg.close('first')
    dlg.show()
    const returnValue = dlg.returnValue
    // The first close's native event, then whatever it set off.
    await late
    await dlg.updateComplete
    return { open: dlg.open, nativeOpen: native.open, returnValue, log }
  })
  check('reopen: show() right after close() leaves the dialog open once that close\'s native event comes', r.open && r.nativeOpen, JSON.stringify(r))
  check(
    'reopen: …the close is announced once, with its value, before the open; the open starts with no answer',
    r.log.join(' / ') === 'show / close close first / show' && r.returnValue === '',
    `${r.log.join(' / ')}; returnValue ${JSON.stringify(r.returnValue)}`
  )
  await page.close()
}

await report(browser)
