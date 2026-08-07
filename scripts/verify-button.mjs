/**
 * Verifies `vf-button`'s contract as a form control and as a named control —
 * the half of the component that isn't pixels, and so isn't covered by
 * `verify:buttons` (the clip-path traces) or `verify:focus` (the dashed rule).
 *
 * What it defends, and why each line is here:
 *
 *  - NAME/DESCRIPTION. The role lives on a `<button>` inside the shadow root,
 *    where a host-level `aria-label` cannot reach it — so an icon button
 *    labelled the ordinary way used to be announced by its glyph. The bridge
 *    mirrors `aria-labelledby`/`aria-label` inward and renders `description`
 *    (or a host `aria-describedby`) as a shadow-internal span. A `<label for>`
 *    deliberately does NOT name it: a `<button>` is not a labelable element,
 *    which `verify:names` asserts from the other side.
 *  - THE ENUMERATED `type`. `type="SUBMIT"` is a valid spelling of a submit
 *    button. Compared case-sensitively it passed the "not a plain button"
 *    guard and failed the "is a submit" one, so it submitted with its
 *    name/value dropped — the action taken and the payload lost, in that
 *    order. Anything unrecognized resolves to `button` (the kit's
 *    missing-value default), not to HTML's `submit`.
 *  - CANCELLATION. HTML runs a button's activation behavior after its click
 *    has finished propagating, which is what makes `preventDefault()` on the
 *    button cancel the submission. The component's listener is on the INNER
 *    button — first on that path, not last — so the action is deferred to the
 *    window. Both phases must cancel; `stopPropagation()`, which cancels
 *    nothing in HTML, must not.
 *  - ONE CLICK PER PRESS. The submission goes through a transient native
 *    proxy (a form-associated custom element cannot be a submitter). The
 *    proxy's own click must not reach the form as a second click for one
 *    press.
 *  - SUBMITTER IDENTITY. `event.submitter` can never BE the `vf-button`. It
 *    is the proxy — parented to the host and unslotted, so
 *    `submitter.closest('vf-button')` gets back to the component, which is as
 *    close as the platform allows.
 *  - THE DISABLED RING. A default button dims its outer ring with its label.
 *    Both routes into disabled have to do it, and only one of them is an
 *    attribute.
 *  - THE METRICS. Pinned because nothing else pins them, which is how the
 *    small button's padding and SPEC drifted apart.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:button
 */
import { attr, ax, axFor, check, launch, makeBuild, report, walk } from './harness.mjs'

const browser = await launch()

/** A page with the kit loaded and every vf-* element upgraded. */
const build = makeBuild(browser, {
  viewport: { width: 900, height: 500 },
  bodyStyle: 'margin:0;background:#fff;padding:24px',
})

/* ══════════════════════════════ 1. the name and description bridge ═══════ */
{
  const page = await build(`
    <vf-button id="content">Save</vf-button>
    <vf-button id="al" aria-label="Close window">×</vf-button>
    <span id="cap">Referenced caption</span>
    <vf-button id="alb" aria-labelledby="cap">×</vf-button>
    <vf-button id="both" aria-labelledby="cap" aria-label="Attribute">×</vf-button>
    <vf-button id="desc" description="Writes to disk">Save</vf-button>
    <span id="hint">Bridged hint</span>
    <vf-button id="dby" aria-describedby="hint">Save</vf-button>
    <label for="lbl">Caption</label><vf-button id="lbl">Save</vf-button>
  `)
  const cdp = await ax(page)
  const name = async (id) => (await axFor(cdp, id, 'button'))?.name?.value ?? ''
  const desc = async (id) => (await axFor(cdp, id, 'button'))?.description?.value ?? ''

  check('slotted content still names a plain button', (await name('content')) === 'Save',
    await name('content'))
  check('a host aria-label names the inner button', (await name('al')) === 'Close window',
    await name('al'))
  check('a host aria-labelledby resolves and names it',
    (await name('alb')) === 'Referenced caption', await name('alb'))
  check('aria-labelledby beats aria-label (html-aam precedence)',
    (await name('both')) === 'Referenced caption', await name('both'))
  check('description reaches the inner button', (await desc('desc')) === 'Writes to disk',
    await desc('desc'))
  check('a host aria-describedby is bridged the same way',
    (await desc('dby')) === 'Bridged hint', await desc('dby'))
  // The deliberate non-bridge: a caption never names a button, native or ours.
  check('a <label for> does NOT override the button\'s own name',
    (await name('lbl')) === 'Save', await name('lbl'))
  check(
    'an undescribed button advertises no description target',
    (await page.evaluate(() =>
      document.getElementById('content').shadowRoot.querySelector('button').hasAttribute('aria-describedby')
    )) === false
  )
  // Written after upgrade: the attributes are observed, not reactive properties.
  await page.evaluate(async () => {
    const el = document.getElementById('content')
    el.setAttribute('aria-label', 'Renamed later')
    await el.updateComplete
  })
  check('an aria-label written after upgrade re-renders the bridge',
    (await name('content')) === 'Renamed later', await name('content'))
  await page.close()
}

/* ══════════════════════════════ 2. `type` as an enumerated attribute ═════ */
{
  const page = await build(`
    <form id="f">
      <vf-button id="lower" type="submit" name="go" value="1">a</vf-button>
      <vf-button id="upper" type="SUBMIT" name="go" value="1">b</vf-button>
      <vf-button id="bogus" type="wat" name="go" value="1">c</vf-button>
      <vf-button id="plain" name="go" value="1">d</vf-button>
    </form>
  `)
  const fire = (id) =>
    page.evaluate((btnId) => {
      const f = document.getElementById('f')
      let payload = 'no submit'
      const h = (e) => {
        e.preventDefault()
        payload = [...new FormData(f, e.submitter)].map(([k, v]) => `${k}=${v}`).join('&')
      }
      f.addEventListener('submit', h)
      document.getElementById(btnId).click()
      f.removeEventListener('submit', h)
      return payload
    }, id)

  check('type="submit" submits with its name/value', (await fire('lower')) === 'go=1',
    await fire('lower'))
  check('type="SUBMIT" is the same button (ASCII case-insensitive)',
    (await fire('upper')) === 'go=1', await fire('upper'))
  check('an unrecognized type resolves to the default and does nothing',
    (await fire('bogus')) === 'no submit', await fire('bogus'))
  check('no type at all does nothing (the kit\'s missing-value default)',
    (await fire('plain')) === 'no submit', await fire('plain'))
  check(
    'type reflects, as it does on a native button',
    await page.evaluate(async () => {
      const b = document.getElementById('plain')
      b.type = 'reset'
      await b.updateComplete
      return b.getAttribute('type') === 'reset'
    })
  )
  await page.close()
}

/* ══════════════════════════════ 3. cancellation, both phases ═════════════ */
{
  const page = await build(
    `<form id="f"><vf-button id="b" type="submit" name="go" value="1">Save</vf-button></form>`
  )
  const run = (mode) =>
    page.evaluate(async (how) => {
      const f = document.getElementById('f')
      const b = document.getElementById('b')
      let submitted = false
      const onSubmit = (e) => { e.preventDefault(); submitted = true }
      f.addEventListener('submit', onSubmit)
      const cancel = (e) => {
        if (how === 'stop') e.stopPropagation()
        else e.preventDefault()
      }
      if (how !== 'none') b.addEventListener('click', cancel, how === 'capture')
      b.click()
      // The stopPropagation branch finishes a task later, by design.
      await new Promise((r) => setTimeout(r, 0))
      b.removeEventListener('click', cancel, how === 'capture')
      f.removeEventListener('submit', onSubmit)
      return submitted
    }, mode)

  check('with nothing cancelling, it submits (guards the checks below)', await run('none'))
  check('preventDefault() in the BUBBLE phase cancels the submission — the ' +
    'ordinary spelling, and the one that used to be ignored', (await run('bubble')) === false)
  check('preventDefault() in the capture phase still cancels it',
    (await run('capture')) === false)
  check('stopPropagation() cancels nothing, as in HTML', await run('stop'))
  await page.close()
}

/* ══════════════════════════════ 4. one click per press ══════════════════ */
{
  const page = await build(
    `<form id="f"><vf-button id="b" type="submit" name="go" value="1">Save</vf-button></form>`
  )
  const seen = await page.evaluate(() => {
    const f = document.getElementById('f')
    const clicks = []
    f.addEventListener('submit', (e) => e.preventDefault())
    f.addEventListener('click', (e) => clicks.push(e.target.tagName.toLowerCase()))
    document.getElementById('b').click()
    return clicks
  })
  check('the form sees exactly one click for one press — the proxy\'s own ' +
    'does not escape it', seen.length === 1 && seen[0] === 'vf-button', seen.join(','))
  await page.close()
}

/* ══════════════════════════════ 5. submitter identity ═══════════════════ */
{
  const page = await build(
    `<form id="f"><vf-button id="b" type="submit" name="go" value="1">Save</vf-button></form>`
  )
  const r = await page.evaluate(() => {
    const f = document.getElementById('f')
    const b = document.getElementById('b')
    const slot = b.shadowRoot.querySelector('slot')
    const before = slot.assignedNodes().length
    let seen = null
    let midFlight = null
    f.addEventListener('submit', (e) => {
      e.preventDefault()
      seen = {
        resolvesToHost: e.submitter?.closest('vf-button') === b,
        name: e.submitter?.name,
        value: e.submitter?.value,
        form: e.submitter?.form === f,
        isTheHost: e.submitter === b,
      }
      // While it exists, the proxy must still be off the flattened tree —
      // that is what keeps it out of layout, the a11y tree, and the shadow
      // button's own click path.
      midFlight = {
        elementChildren: b.children.length,
        unslotted: e.submitter?.assignedSlot === null,
        boxes: e.submitter?.getClientRects().length,
        assigned: slot.assignedNodes().length,
      }
    })
    b.click()
    return { ...seen, before, midFlight, after: slot.assignedNodes().length, leftBehind: b.children.length }
  })
  check('event.submitter.closest("vf-button") is the button that submitted',
    r.resolvesToHost)
  check('…carrying its name and value', r.name === 'go' && r.value === '1',
    `${r.name}=${r.value}`)
  check('…and still owned by the form', r.form)
  check('the platform will not let it BE the host (documented, not a defect)',
    r.isTheHost === false)
  check(
    'the proxy is unslotted while it exists — no box, and the label\'s own ' +
      'slot assignment never moves',
    r.midFlight?.unslotted === true &&
      r.midFlight?.boxes === 0 &&
      r.midFlight?.assigned === r.before,
    JSON.stringify(r.midFlight)
  )
  check('…and it leaves no trace behind it', r.leftBehind === 0 && r.after === r.before,
    `children=${r.leftBehind} assigned ${r.before}→${r.after}`)
  await page.close()
}

/* ══════════════════════════════ 6. the form* overrides ══════════════════ */
{
  const page = await build(`
    <form id="f" method="get" action="/base">
      <vf-text-field id="req" name="q" required></vf-text-field>
      <vf-button id="strict" type="submit">Save</vf-button>
      <vf-button id="draft" type="submit" formnovalidate
                 formaction="/draft" formmethod="post" formtarget="_blank"
                 formenctype="text/plain">Save Draft</vf-button>
    </form>
  `)
  const r = await page.evaluate(async () => {
    const f = document.getElementById('f')
    const log = { strict: 'no submit', draft: null }
    const h = (e) => {
      e.preventDefault()
      const s = e.submitter
      const key = s?.closest('vf-button')?.id
      log[key] = {
        action: new URL(s.formAction, location.href).pathname,
        method: s.formMethod,
        target: s.formTarget,
        enctype: s.formEnctype,
        noValidate: s.formNoValidate,
      }
    }
    f.addEventListener('submit', h)
    document.getElementById('strict').click()
    await new Promise((r) => setTimeout(r, 0))
    const strict = log.strict
    document.getElementById('draft').click()
    await new Promise((r) => setTimeout(r, 0))
    return { strict, draft: log.draft }
  })
  check('a plain submit button still honors the form\'s constraints',
    r.strict === 'no submit', JSON.stringify(r.strict))
  check('formnovalidate submits past a failing required',
    r.draft !== null && r.draft.noValidate === true, JSON.stringify(r.draft))
  check('formaction reaches the submission', r.draft?.action === '/draft', r.draft?.action)
  check('formmethod reaches the submission', r.draft?.method === 'post', r.draft?.method)
  check('formtarget reaches the submission', r.draft?.target === '_blank', r.draft?.target)
  check('formenctype reaches the submission', r.draft?.enctype === 'text/plain', r.draft?.enctype)
  await page.close()
}

/* ══════════════════════════════ 7. reset, and the disabled gate ═════════ */
{
  const page = await build(`
    <form id="f">
      <vf-text-field id="tf" name="t" value="orig"></vf-text-field>
      <vf-button id="rb" type="reset">Revert</vf-button>
      <vf-button id="db" type="submit" disabled>Off</vf-button>
    </form>
    <form id="g"><fieldset id="fs">
      <vf-button id="fb" type="submit">In a disabled fieldset</vf-button>
    </fieldset></form>
  `)
  const reset = await page.evaluate(async () => {
    const tf = document.getElementById('tf')
    tf.value = 'edited'
    await tf.updateComplete
    document.getElementById('rb').click()
    await tf.updateComplete
    return tf.value
  })
  check('type="reset" resets the form', reset === 'orig', reset)

  const cancelled = await page.evaluate(async () => {
    const tf = document.getElementById('tf')
    tf.value = 'edited again'
    await tf.updateComplete
    const f = document.getElementById('f')
    const cancel = (e) => e.preventDefault()
    f.addEventListener('reset', cancel)
    document.getElementById('rb').click()
    await tf.updateComplete
    f.removeEventListener('reset', cancel)
    return tf.value
  })
  check('a cancelled reset event leaves the form alone', cancelled === 'edited again',
    cancelled)

  const disabled = await page.evaluate(async () => {
    const out = {}
    for (const [key, formId, btnId] of [['attr', 'f', 'db'], ['fieldset', 'g', 'fb']]) {
      if (key === 'fieldset') {
        document.getElementById('fs').disabled = true
        await document.getElementById(btnId).updateComplete
      }
      let submitted = false
      const form = document.getElementById(formId)
      const h = (e) => { e.preventDefault(); submitted = true }
      form.addEventListener('submit', h)
      document.getElementById(btnId).click()
      await new Promise((r) => setTimeout(r, 0))
      form.removeEventListener('submit', h)
      out[key] = submitted
    }
    return out
  })
  check('a disabled button never submits', disabled.attr === false)
  check('…nor does one inside a <fieldset disabled>', disabled.fieldset === false)
  await page.close()
}

/* ══════════════════════════════ 8. the default ring dims either way ═════ */
{
  const page = await build(`
    <form>
      <vf-button id="live" variant="default">Install</vf-button>
      <vf-button id="attr" variant="default" disabled>Install</vf-button>
      <fieldset id="fs"><vf-button id="fsb" variant="default">Install</vf-button></fieldset>
    </form>
  `)
  const r = await page.evaluate(async () => {
    document.getElementById('fs').disabled = true
    const b = document.getElementById('fsb')
    await b.updateComplete
    await new Promise((r) => queueMicrotask(r))
    await b.updateComplete
    const read = (id) => {
      const el = document.getElementById(id)
      return {
        ring: getComputedStyle(el, '::before').backgroundColor,
        label: getComputedStyle(el.shadowRoot.querySelector('button')).color,
      }
    }
    return { live: read('live'), attr: read('attr'), fieldset: read('fsb') }
  })
  const DIM = 'rgb(192, 192, 192)'
  const INK = 'rgb(0, 0, 0)'
  check('an enabled default button rings in ink', r.live.ring === INK && r.live.label === INK,
    JSON.stringify(r.live))
  check('disabled by attribute: ring and label dim together',
    r.attr.ring === DIM && r.attr.label === DIM, JSON.stringify(r.attr))
  check('disabled by an ancestor <fieldset disabled>: the same, via :state()',
    r.fieldset.ring === DIM && r.fieldset.label === DIM, JSON.stringify(r.fieldset))
  await page.close()
}

/* ══════════════════════════════ 9. click() and implicit submission ══════ */
{
  const page = await build(`<div id="host"></div>`)
  const early = await page.evaluate(async () => {
    const b = document.createElement('vf-button')
    b.textContent = 'Go'
    let fired = 0
    b.addEventListener('click', () => fired++)
    document.getElementById('host').append(b)
    b.click() // before the first render lands
    const before = fired
    await b.updateComplete
    b.click()
    return { before, after: fired }
  })
  check('click() fires before the first render, as a native button\'s does',
    early.before === 1, `${early.before} event(s)`)
  check('…and after it', early.after === 2, `${early.after} events`)
  await page.close()
}
{
  const page = await build(`
    <form id="f">
      <vf-text-field id="t" name="q" value="typed"></vf-text-field>
      <vf-button id="b" type="submit" name="go" value="1">Save</vf-button>
    </form>
  `)
  const r = await page.evaluate(async () => {
    let payload = 'no submit'
    document.getElementById('f').addEventListener('submit', (e) => {
      e.preventDefault()
      payload = [...new FormData(e.target, e.submitter)].map(([k, v]) => `${k}=${v}`).join('&')
    })
    const input = document.getElementById('t').shadowRoot.querySelector('input')
    input.focus()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true })
    )
    await new Promise((r) => setTimeout(r, 30))
    return payload
  })
  check('Enter in a field still submits through the default vf-button',
    r === 'q=typed&go=1', r)
  await page.close()
}

/* ══════════════════════════════ 10. the metrics, pinned ═════════════════ */
{
  const page = await build(
    `<vf-button id="n">Button</vf-button><vf-button id="s" size="small">Button</vf-button>`
  )
  const m = await page.evaluate(() => {
    const read = (id) => {
      const host = document.getElementById(id)
      const cs = getComputedStyle(host.shadowRoot.querySelector('button'))
      const scale = parseFloat(getComputedStyle(host).getPropertyValue('--vf-scale'))
      return {
        height: parseFloat(cs.height) / scale,
        minWidth: parseFloat(cs.minWidth) / scale,
        padding: parseFloat(cs.paddingLeft) / scale,
        face: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
        hostOutline: getComputedStyle(host).outlineStyle,
      }
    }
    return { normal: read('n'), small: read('s') }
  })
  check('the button face is 20 system px, min-width 64, padding 14',
    m.normal.height === 20 && m.normal.minWidth === 64 && m.normal.padding === 14,
    JSON.stringify(m.normal))
  check('size=small is 16 tall and 48 wide, sharing the 14px padding',
    m.small.height === 16 && m.small.minWidth === 48 && m.small.padding === 14,
    JSON.stringify(m.small))
  check('the tall button sets the chrome face, the small one the body face',
    m.normal.face === 'Chicago' && m.small.face === 'Geneva',
    `${m.normal.face} / ${m.small.face}`)

  await page.keyboard.press('Tab')
  const outlines = await page.evaluate(() => {
    const host = document.getElementById('n')
    return {
      host: getComputedStyle(host).outlineStyle,
      inner: getComputedStyle(host.shadowRoot.querySelector('button')).outlineStyle,
    }
  })
  check('a focused button carries no UA outline, on the host or the inner button',
    outlines.host === 'none' && outlines.inner === 'none', JSON.stringify(outlines))
  await page.close()
}

await report(browser)
