/**
 * Verifies the 2026-07-31 keyboard-model + small-ARIA pass
 * (ACCESSIBILITY-REVIEW.md §5.2, §5.4, §6.5, §6.7, §6.8, §7.4, §7.5, §7.7,
 * §8.5, §8.6, §10.2, §10.3, §10.4, §10.5):
 *
 *   - bar menus: Home/End while open, Enter/Space opens AND enters, shared
 *     first-letter type-ahead (bar, standalone menu, and vf-select)
 *   - vf-list multiple mode: Home/End/type-ahead move the cursor without
 *     destroying the selection; Shift(+Ctrl)+Home/End extend; Shift+Space
 *     selects anchor→cursor; Ctrl/Meta+A selects all
 *   - conditional tab stops: vf-scroll-area only when it overflows (role
 *     region/group when it is a stop), a disabled vf-list's viewport
 *   - roles: menubar ownership chain, standalone menu label = button,
 *     vf-menu-bar label property
 *   - vf-img: a failed load doesn't clamp the box to 0×0 over the alt text
 *   - forms: Enter submits via the form's default button (submitter identity
 *     + name/value), formStateRestoreCallback, :state(form-disabled)
 *   - internal menu handshakes are composed:false and a standalone toggle
 *     survives a consumer's preventDefault-everything delegation
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:key-models
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

const MARKUP = `
  <vf-menu-bar id="bar" label="Site">
    <vf-menu id="file" label="File">
      <vf-menu-item id="f-new" value="new">New Window</vf-menu-item>
      <vf-menu-item id="f-open" value="open">Open…</vf-menu-item>
      <vf-menu-item id="f-print" value="print" disabled>Print…</vf-menu-item>
      <vf-menu-item id="f-quit" value="quit">Quit</vf-menu-item>
    </vf-menu>
    <vf-menu id="edit" label="Edit">
      <vf-menu-item value="copy">Copy</vf-menu-item>
    </vf-menu>
  </vf-menu-bar>

  <vf-menu id="lone" label="Actions">
    <vf-menu-item id="l-dup" value="duplicate">Duplicate</vf-menu-item>
    <vf-menu-item id="l-share" value="share">Sharing…</vf-menu-item>
  </vf-menu>

  <vf-select id="sel">
    <vf-option value="a">Apple</vf-option>
    <vf-option value="b">Banana</vf-option>
    <vf-option value="c">Cherry</vf-option>
  </vf-select>

  <vf-list id="multi" multiple label="Cities" style="width: 200px">
    <vf-list-item id="r0" value="ann">Ann Arbor</vf-list-item>
    <vf-list-item id="r1" value="ber">Berlin</vf-list-item>
    <vf-list-item id="r2" value="cai">Cairo</vf-list-item>
    <vf-list-item id="r3" value="dub">Dublin</vf-list-item>
    <vf-list-item id="r4" value="ede">Edessa</vf-list-item>
  </vf-list>

  <vf-list id="dis" disabled label="Dimmed" style="width: 200px; --vf-list-max-height: 40px">
    <vf-list-item value="one">One</vf-list-item>
    <vf-list-item value="two">Two</vf-list-item>
    <vf-list-item value="three">Three</vf-list-item>
    <vf-list-item value="four">Four</vf-list-item>
  </vf-list>
  <vf-list id="dis-fit" disabled label="Dimmed, fits" style="width: 200px">
    <vf-list-item value="only">Only</vf-list-item>
  </vf-list>

  <vf-scroll-area id="sa-fit" style="width: 200px; height: 200px">
    <p style="margin:0">fits</p>
  </vf-scroll-area>
  <vf-scroll-area id="sa-over" style="width: 200px; height: 100px">
    <div style="height: 2000px">tall</div>
  </vf-scroll-area>
  <vf-scroll-area id="sa-named" label="Release notes" style="width: 200px; height: 100px">
    <div style="height: 2000px">tall</div>
  </vf-scroll-area>

  <vf-img id="img-bad"><img src="/no-such-file.png" alt="Macintosh HD"></vf-img>
  <vf-img id="img-bad-sized" width="16" height="16"><img src="/no-such-file-2.png" alt="sized"></vf-img>

  <form id="form">
    <vf-text-field id="tf" name="q" value="typed"></vf-text-field>
    <vf-button id="go" type="submit" name="action" value="save">Save</vf-button>
  </form>
  <form id="form-bare">
    <vf-text-field id="tf2" name="q2" value="typed2"></vf-text-field>
  </form>
  <form id="form-states">
    <fieldset id="fs">
      <vf-checkbox id="cb" name="cb" value="yes" checked>Follow</vf-checkbox>
    </fieldset>
  </form>
  <vf-slider id="sl" min="0" max="100" value="10" label="Volume"></vf-slider>
`

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()
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
    [...document.querySelectorAll('vf-menu-bar, vf-menu, vf-menu-item, vf-select, vf-list, vf-list-item, vf-scroll-area, vf-img, vf-text-field, vf-button, vf-checkbox, vf-slider')].map(
      (e) => e.updateComplete
    )
  )
)
// Two frames so ScrollStateController's first measure lands and re-renders.
await page.evaluate(
  () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
)

const activeId = () => page.evaluate(() => document.activeElement?.id ?? null)

// ───────────────────────────── §6.5 / §6.7 / §6.8 — the menu role chain ──

// Host roles and names are read from the computed AX tree, not from
// attributes: the kit writes host ARIA through ElementInternals (§6.11), so
// the values are defaults that never land on the tag. The shadow-internal
// roles below are ordinary template attributes and still read directly.
const cdp = await page.context().newCDPSession(page)
await cdp.send('DOM.enable')
await cdp.send('Accessibility.enable')
async function axHost(id) {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: `#${id}`,
  })
  if (!nodeId) return { role: null, name: '' }
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  })
  const n = nodes[0]
  return { role: n?.role?.value ?? null, name: n?.name?.value ?? '' }
}

let s = await page.evaluate(() => ({
  innerBar: document
    .getElementById('bar')
    .shadowRoot.querySelector('.bar')
    .getAttribute('role'),
  menuLabel: document
    .getElementById('file')
    .shadowRoot.querySelector('.label')
    .getAttribute('role'),
  loneHost: document.getElementById('lone').getAttribute('role'),
  loneLabel: document
    .getElementById('lone')
    .shadowRoot.querySelector('.label')
    .getAttribute('role'),
}))
const bar = await axHost('bar')
const menuHost = await axHost('file')
check('vf-menu-bar names itself from its label property', bar.name === 'Site', `name=${bar.name}`)
check('the bar keeps role=menubar', bar.role === 'menubar', `role=${bar.role}`)
check('the shadow .bar is presentation (ownership chain)', s.innerBar === 'presentation')
check('a menu host in a bar is role=none', menuHost.role === 'none', `role=${menuHost.role}`)
check('…and its label is the menuitem', s.menuLabel === 'menuitem')
check('a standalone menu host takes no role', s.loneHost === null, `role=${s.loneHost}`)
check('…and its label is a button (APG menu button)', s.loneLabel === 'button')

// Asserted on the COMPUTED role, not the attribute the consumer themselves
// wrote — which the component could never have removed and so proved nothing.
// The mechanism is no longer a first-connect latch either: the kit's role is
// an internals default, and an attribute simply outranks it (§6.11).
await page.evaluate(async () => {
  const bar = document.createElement('vf-menu-bar')
  bar.id = 'authoredBar'
  bar.setAttribute('role', 'toolbar')
  document.body.append(bar)
  await bar.updateComplete
})
const authoredBar = await axHost('authoredBar')
check(
  'a consumer role on the bar outranks the internals default',
  authoredBar.role === 'toolbar',
  `role=${authoredBar.role}`
)
await page.evaluate(() => document.getElementById('authoredBar').remove())

// ─────────────────────── §5.2 — Enter enters; Home/End in an open bar menu ──

await page.evaluate(() => document.getElementById('file').focus())
await page.keyboard.press('Enter')
check('Enter on a bar title opens the menu', await page.evaluate(() => document.getElementById('file').open))
check('…and moves focus to the first item', (await activeId()) === 'f-new', `focus=${await activeId()}`)
await page.keyboard.press('End')
check('End jumps to the last enabled item', (await activeId()) === 'f-quit', `focus=${await activeId()}`)
await page.keyboard.press('Home')
check('Home jumps back to the first', (await activeId()) === 'f-new', `focus=${await activeId()}`)

// ───────────────────────────── §5.4 — type-ahead in the open bar menu ──

await page.keyboard.press('q')
check('typing "q" moves focus to Quit', (await activeId()) === 'f-quit', `focus=${await activeId()}`)
await page.keyboard.press('o')
// 1s later the prefix resets; "qo" mid-window matches nothing and stays put.
check('a quick "q"+"o" is one prefix, no match, focus stays', (await activeId()) === 'f-quit', `focus=${await activeId()}`)
await page.waitForTimeout(1200)
await page.keyboard.press('o')
check('after the reset, "o" finds Open…', (await activeId()) === 'f-open', `focus=${await activeId()}`)
await page.keyboard.press('Escape')
check('Escape still closes', !(await page.evaluate(() => document.getElementById('file').open)))

// ───────────────────────────── §5.4 — type-ahead standalone ──

await page.evaluate(() => document.getElementById('lone').focus())
await page.keyboard.press('Enter')
check('standalone Enter opens and enters', (await activeId()) === 'l-dup', `focus=${await activeId()}`)
await page.keyboard.press('s')
check('standalone type-ahead finds Sharing…', (await activeId()) === 'l-share', `focus=${await activeId()}`)
await page.keyboard.press('Escape')

// ───────────────────────────── §5.4 — type-ahead in vf-select ──

await page.evaluate(() => document.getElementById('sel').focus())
await page.keyboard.press('ArrowDown') // opens
await page.waitForTimeout(50)
await page.keyboard.press('c')
s = await page.evaluate(() =>
  [...document.querySelectorAll('#sel vf-option')].map((o) => o.active)
)
check('typing "c" in the open select highlights Cherry', String(s) === 'false,false,true', `active=[${s}]`)
await page.keyboard.press('Escape')

// ──────────────── §10.2 / §10.3 — the multiple-selection keyboard model ──

const multi = () =>
  page.evaluate(() => ({
    values: [...document.getElementById('multi').values],
    focused: document.activeElement?.id ?? null,
  }))

await page.locator('#r0').click()
await page.locator('#r2').click({ modifiers: ['Shift'] })
s = await multi()
check('Shift+click builds the starting range', String(s.values) === 'ann,ber,cai', `values=[${s.values}]`)

await page.keyboard.press('End')
s = await multi()
check('End moves the cursor only — the selection survives', String(s.values) === 'ann,ber,cai' && s.focused === 'r4', `values=[${s.values}] focus=${s.focused}`)
await page.keyboard.press('Home')
s = await multi()
check('Home too', String(s.values) === 'ann,ber,cai' && s.focused === 'r0', `values=[${s.values}] focus=${s.focused}`)

await page.keyboard.press('d')
s = await multi()
check('type-ahead moves the cursor only', String(s.values) === 'ann,ber,cai' && s.focused === 'r3', `values=[${s.values}] focus=${s.focused}`)
await page.keyboard.press(' ')
s = await multi()
check('…and Space adds the reached row', String(s.values) === 'ann,ber,cai,dub', `values=[${s.values}]`)

await page.keyboard.press('Shift+Home')
s = await multi()
check('Shift+Home extends from the anchor to the first row', String(s.values) === 'ann,ber,cai,dub' && s.focused === 'r0', `values=[${s.values}] focus=${s.focused}`)
await page.keyboard.press('Control+Shift+End')
s = await multi()
check('Ctrl+Shift+End extends to the last', String(s.values) === 'dub,ede' && s.focused === 'r4', `values=[${s.values}] focus=${s.focused}`)

await page.keyboard.press('Meta+a')
s = await multi()
check('Cmd+A selects every enabled row', String(s.values) === 'ann,ber,cai,dub,ede', `values=[${s.values}]`)

await page.locator('#r1').click()
await page.evaluate(() => {
  const list = document.getElementById('multi')
  list.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, composed: true })
  )
  list.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, composed: true })
  )
})
await page.evaluate(() => document.getElementById('r3')?.focus())
await page.keyboard.press('Shift+ ')
s = await multi()
check('Shift+Space selects the run from the anchor to the cursor', String(s.values) === 'ber,cai,dub', `values=[${s.values}]`)

// ──────────────── §8.6 — a disabled list stays keyboard-scrollable ──

s = await page.evaluate(() => {
  const tab = (id) =>
    document.getElementById(id).shadowRoot.querySelector('.list').getAttribute('tabindex')
  return { over: tab('dis'), fits: tab('dis-fit'), enabled: tab('multi') }
})
check('a disabled, overflowing list makes its viewport the tab stop', s.over === '0', `tabindex=${s.over}`)
check('a disabled list that fits does not', s.fits === null, `tabindex=${s.fits}`)
check('an enabled list never does (the rows are the stops)', s.enabled === null, `tabindex=${s.enabled}`)
s = await page.evaluate(() => {
  const list = document.getElementById('dis')
  list.focus()
  const vp = list.shadowRoot.querySelector('.list')
  return list.shadowRoot.activeElement === vp
})
check('host focus() reaches the disabled viewport', s === true)

// ──────────────── §8.5 — vf-scroll-area: conditional stop, always a role ──

s = await page.evaluate(() => {
  const vp = (id) => {
    const el = document.getElementById(id).shadowRoot.querySelector('.viewport')
    return { tab: el.getAttribute('tabindex'), role: el.getAttribute('role') }
  }
  return { fit: vp('sa-fit'), over: vp('sa-over'), named: vp('sa-named') }
})
check('a fitting scroll area is not a tab stop', s.fit.tab === null, `tabindex=${s.fit.tab}`)
check('…and carries no role', s.fit.role === null, `role=${s.fit.role}`)
check('an overflowing one is', s.over.tab === '0', `tabindex=${s.over.tab}`)
check('…as an (unnamed) group', s.over.role === 'group', `role=${s.over.role}`)
check('a labelled one is a named region', s.named.tab === '0' && s.named.role === 'region', `tabindex=${s.named.tab} role=${s.named.role}`)

s = await page.evaluate(async () => {
  const sa = document.getElementById('sa-fit')
  sa.querySelector('p').style.height = '2000px'
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await sa.updateComplete
  const vp = sa.shadowRoot.querySelector('.viewport')
  return { tab: vp.getAttribute('tabindex'), role: vp.getAttribute('role') }
})
check('content growth promotes it live', s.tab === '0' && s.role === 'group', `tabindex=${s.tab} role=${s.role}`)

// ──────────────── §10.4 — a failed vf-img keeps its alt text renderable ──

await page.waitForFunction(() => {
  const img = document.querySelector('#img-bad img')
  return img.complete && img.naturalWidth === 0
})
await page.evaluate(() =>
  Promise.all([...document.querySelectorAll('vf-img')].map((e) => e.updateComplete))
)
s = await page.evaluate(() => {
  const box = (id) => {
    const r = document.getElementById(id).shadowRoot.querySelector('.frame').getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  }
  return { bad: box('img-bad'), sized: box('img-bad-sized') }
})
check('an undeclared failed image is not clamped to 0×0', s.bad.w > 0 && s.bad.h > 0, `${s.bad.w}×${s.bad.h}`)
check('a declared box still holds through the failure', s.sized.w === 48 && s.sized.h === 48, `${s.sized.w}×${s.sized.h} (16 sys px at 3×)`)

// ──────────────── §7.5 — Enter submits through the form's default button ──

s = await page.evaluate(() => {
  return new Promise((resolve) => {
    const form = document.getElementById('form')
    form.addEventListener(
      'submit',
      (e) => {
        e.preventDefault()
        resolve({
          submitter: e.submitter?.tagName ?? null,
          data: [...new FormData(form, e.submitter ?? undefined).entries()],
        })
      },
      { once: true }
    )
    const tf = document.getElementById('tf')
    tf.focus()
    tf.shadowRoot
      .querySelector('input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }))
  })
})
check('Enter in a field submits with a real submitter', s?.submitter === 'BUTTON', `submitter=${s?.submitter}`)
check(
  "…and the default button's name/value ride along, as a click's do",
  JSON.stringify(s?.data) === JSON.stringify([["q", "typed"], ["action", "save"]]),
  JSON.stringify(s?.data)
)

s = await page.evaluate(() => {
  return new Promise((resolve) => {
    const form = document.getElementById('form-bare')
    form.addEventListener(
      'submit',
      (e) => {
        e.preventDefault()
        resolve({ submitter: e.submitter?.tagName ?? null })
      },
      { once: true }
    )
    const tf = document.getElementById('tf2')
    tf.focus()
    tf.shadowRoot
      .querySelector('input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }))
  })
})
check('a form with no submit button still falls back to requestSubmit()', s?.submitter === null, `submitter=${s?.submitter}`)

s = await page.evaluate(() => {
  return new Promise((resolve) => {
    const form = document.getElementById('form')
    let submitted = false
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      submitted = true
    })
    document.getElementById('go').disabled = true
    requestAnimationFrame(() => {
      const tf = document.getElementById('tf')
      tf.shadowRoot
        .querySelector('input')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }))
      setTimeout(() => {
        document.getElementById('go').disabled = false
        resolve(submitted)
      }, 50)
    })
  })
})
check('a disabled default button means Enter submits nothing (as HTML)', s === false)

// The check above toggled .disabled true→false. The re-enable reaches the
// shadow DOM via formDisabledCallback fired during Lit's own attribute
// reflection, which VfFormControl re-requests from a microtask (the
// reflection-swallow fix) — give that one turn to land, then assert it did.
s = await page.evaluate(async () => {
  const go = document.getElementById('go')
  await new Promise((r) => setTimeout(r))
  await go.updateComplete
  return go.shadowRoot.querySelector('button').disabled
})
check('re-enabling via the property re-enables the inner button', s === false, `inner disabled=${s}`)

s = await page.evaluate(() => {
  return new Promise((resolve) => {
    const form = document.getElementById('form')
    form.addEventListener(
      'submit',
      (e) => {
        e.preventDefault()
        resolve(e.submitter?.tagName ?? null)
      },
      { once: true }
    )
    document.getElementById('go').click()
  })
})
check('host click() reaches the inner button (submits with a submitter)', s === 'BUTTON', `submitter=${s}`)

// ──────────────── §7.4 / §7.7 — restore state, :state(form-disabled) ──

s = await page.evaluate(() => {
  const tf = document.getElementById('tf2')
  tf.formStateRestoreCallback('restored', 'restore')
  const cb = document.getElementById('cb')
  cb.checked = false
  cb.formStateRestoreCallback('yes', 'restore')
  const sl = document.getElementById('sl')
  sl.formStateRestoreCallback('42', 'restore')
  return { tf: tf.value, cb: cb.checked, sl: sl.value }
})
check('a restored field takes the stored string back as value', s.tf === 'restored', `value=${s.tf}`)
check('a restored checkbox re-checks (state means the flag)', s.cb === true)
check('a restored slider parses back to its number', s.sl === 42, `value=${s.sl}`)

s = await page.evaluate(async () => {
  const cb = document.getElementById('cb')
  const before = cb.matches(':state(form-disabled)')
  document.getElementById('fs').disabled = true
  await cb.updateComplete
  const during = cb.matches(':state(form-disabled)')
  document.getElementById('fs').disabled = false
  await cb.updateComplete
  const after = cb.matches(':state(form-disabled)')
  return { before, during, after }
})
check(
  ':state(form-disabled) tracks an ancestor <fieldset disabled>',
  s.before === false && s.during === true && s.after === false,
  `${s.before}/${s.during}/${s.after}`
)

// ──────────────── §10.5 — internal handshakes stay the kit's own ──

s = await page.evaluate(() => {
  return new Promise((resolve) => {
    document.addEventListener(
      'vf-menu-close-request',
      (e) => resolve({ composed: e.composed }),
      { once: true }
    )
    // Activate a standalone item directly (reduced-motion-independent: wait
    // for the event rather than a timing).
    const item = document.getElementById('l-dup')
    document.getElementById('lone').open = true
    item.activate()
    // Blink runs ~250ms; the listener resolves when the request lands.
  })
})
check('vf-menu-close-request no longer crosses shadow roots', s.composed === false, `composed=${s.composed}`)

s = await page.evaluate(async () => {
  // The hostile consumer: a delegated listener that cancels everything it
  // doesn't recognise.
  const cancelAll = (e) => {
    if (e.type.startsWith('vf-menu-')) e.preventDefault()
  }
  document.addEventListener('vf-menu-toggle-request', cancelAll)
  const lone = document.getElementById('lone')
  lone.open = false
  await lone.updateComplete
  lone.focus()
  lone.shadowRoot
    .querySelector('.label')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await lone.updateComplete
  const opened = lone.open
  lone.open = false
  document.removeEventListener('vf-menu-toggle-request', cancelAll)
  return opened
})
check('a standalone menu opens despite a cancel-everything delegate', s === true)

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
