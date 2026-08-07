/**
 * Verifies the consumer-contract cluster from ACCESSIBILITY-REVIEW.md — the
 * promises a web component makes to the page *around* it, closed 2026-08-01:
 *
 *  - REMOVAL (§8.2): unmounting an open vf-dialog (the standard framework
 *    pattern — no close() call) runs the same teardown the close funnel does:
 *    vf-close fires on the removed element, `open` and the pinned margins
 *    reconcile, focus returns to the invoker, and a re-append mounts closed.
 *  - OVERFLOW (§9.1): a modal whose content is taller than its declared (or
 *    viewport-capped) box scrolls it under a System 7 rail with the action
 *    buttons pinned reachable — instead of clipping or spilling them
 *    off-screen unscrollably. Inert while content fits: no rail, no tab stop.
 *  - NATIVE EVENTS (§7.2): every form-associated control fires the native
 *    input/change pair from its user-interaction paths — with native flags
 *    (input composed, change not), exactly once per gesture (the fields'
 *    composed inner input must NOT be double-fired), and never from a
 *    programmatic value set.
 *  - PASS-THROUGH (§7.3): the input-behavior attributes (autocomplete,
 *    inputmode, enterkeyhint, maxlength, pattern, spellcheck, autocapitalize)
 *    reach the inner native control, including when set after first render.
 *  - SWATCH FIELDSET (§7.6): <fieldset disabled> reaches vf-swatch (now
 *    form-associated for the disabled contract), while it still submits
 *    nothing; :state(form-disabled) is visible to consumer CSS.
 *  - LABEL STALENESS (§6.4): an in-place text edit to a vf-label caption
 *    (Text.data, the Lit/React update path — no slotchange) re-derives the
 *    pushed accessible name.
 *
 *   npm run dev             # in another shell (port 5173)
 *   npm run verify:contract
 */
import { check, launch, makeBuild, results } from './harness.mjs'

const browser = await launch()

const build = makeBuild(browser, {
  viewport: { width: 1200, height: 700 },
  // Synchronous selection blinks (the kit honors prefers-reduced-motion), so
  // a select/menu commit lands before the next evaluate — the probe idiom
  // every keyboard-driving verify script here uses.
  reducedMotion: true,
})

/* ────────────────────────────────────────────────────────────────────────────
   1. REMOVAL — §8.2: unmounting an open modal is a close path
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <button id="opener">Open</button>
    <vf-dialog id="dlg" heading="Doomed" width="320" height="160">
      <vf-paragraph>Body</vf-paragraph>
      <vf-button slot="buttons" variant="default">OK</vf-button>
    </vf-dialog>
  `)

  const r = await page.evaluate(async () => {
    const dlg = document.getElementById('dlg')
    const opener = document.getElementById('opener')
    const events = []
    dlg.addEventListener('vf-close', (e) => events.push(e.detail.reason))

    opener.focus()
    dlg.show()
    await dlg.updateComplete
    const native = dlg.shadowRoot.querySelector('dialog')
    const openedModal = native.open && dlg.open

    // The framework-unmount path: remove, never call close().
    dlg.remove()
    // The teardown routes through the queued native close event.
    await new Promise((res) => setTimeout(res, 50))

    const afterRemove = {
      events: [...events],
      openProp: dlg.open,
      openAttr: dlg.hasAttribute('open'),
      nativeOpen: native.open,
      // The written origin (left/top/right/bottom/margin), not just margins:
      // a modal states its placement in system px on the top-layer box now.
      margins: ['left', 'top', 'right', 'bottom', 'margin']
        .map((p) => native.style.getPropertyValue(p))
        .join(''),
      focusRestored: document.activeElement === opener,
    }

    // Re-append: must mount closed, not open-but-non-modal.
    document.body.appendChild(dlg)
    await dlg.updateComplete
    const remounted = {
      nativeOpen: native.open,
      visible: getComputedStyle(native).display !== 'none',
    }
    return { openedModal, afterRemove, remounted }
  })

  check('removal: dialog opened modally first', r.openedModal)
  check(
    'removal: vf-close fired once on the removed element',
    r.afterRemove.events.length === 1 && r.afterRemove.events[0] === 'close',
    JSON.stringify(r.afterRemove.events)
  )
  check(
    'removal: open property and attribute reconciled to closed',
    r.afterRemove.openProp === false && r.afterRemove.openAttr === false
  )
  check('removal: native dialog closed', r.afterRemove.nativeOpen === false)
  check(
    'removal: the written placement is cleared',
    r.afterRemove.margins === '',
    JSON.stringify(r.afterRemove.margins)
  )
  check('removal: focus restored to the invoker', r.afterRemove.focusRestored)
  check(
    'removal: re-append mounts closed and invisible',
    r.remounted.nativeOpen === false && r.remounted.visible === false
  )
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2. OVERFLOW — §9.1: over-stuffed modals scroll; buttons stay reachable
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-dialog id="fits" heading="Fits" width="320" height="200" open>
      <vf-paragraph>Short.</vf-paragraph>
      <vf-button slot="buttons" variant="default">OK</vf-button>
    </vf-dialog>
  `)
  const fits = await page.evaluate(() => {
    const dlg = document.getElementById('fits')
    const content = dlg.shadowRoot.querySelector('.content')
    const frame = dlg.shadowRoot.querySelector('.content-wrap .vf-scroll-frame')
    return {
      overflowAttr: content.getAttribute('data-overflow-y'),
      tabindex: content.getAttribute('tabindex'),
      role: content.getAttribute('role'),
      frameShown: getComputedStyle(frame).display !== 'none',
      overflowY: getComputedStyle(content).overflowY,
    }
  })
  check(
    'overflow: a fitting dialog has no rail, no stop, no role, no frame',
    fits.overflowAttr === 'false' &&
      fits.tabindex === null &&
      fits.role === null &&
      fits.frameShown === false,
    JSON.stringify(fits)
  )
  // The CSS has to agree with the controller. `auto` here let a dialog the kit
  // had judged non-overflowing still scroll under the wheel: the body face's
  // negative half-leading spills 2 inkless system px past the block box (see
  // LEADING_SPILL_SYS, scroll-state.ts), which the controller ignores by design
  // and `auto` cannot. A fixed info dialog rubber-banded with no rail to
  // explain it.
  check(
    'overflow: a fitting dialog is not a user-scrollable box at all',
    fits.overflowY === 'hidden',
    `overflow-y: ${fits.overflowY}`
  )

  // The symptom itself: a real wheel over the content must not move it.
  const box = await page.evaluate(() => {
    const c = document.getElementById('fits').shadowRoot.querySelector('.content')
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.move(box.x, box.y)
  await page.mouse.wheel(0, 240)
  await page.waitForTimeout(120)
  const wheeled = await page.evaluate(
    () => document.getElementById('fits').shadowRoot.querySelector('.content').scrollTop
  )
  check(
    'overflow: the wheel cannot scroll a fitting dialog',
    wheeled === 0,
    `scrollTop=${wheeled}`
  )
  await page.close()
}
{
  // 40 paragraphs in a 200-system-px box: over-stuffed by any measure.
  const page = await build(`
    <vf-dialog id="stuffed" heading="Stuffed" width="360" height="200" open>
      ${Array.from({ length: 40 }, (_, i) => `<vf-paragraph>Line ${i + 1} of the body copy.</vf-paragraph>`).join('')}
      <vf-button slot="buttons">Cancel</vf-button>
      <vf-button id="ok" slot="buttons" variant="default">OK</vf-button>
    </vf-dialog>
  `)
  const r = await page.evaluate(() => {
    const dlg = document.getElementById('stuffed')
    const content = dlg.shadowRoot.querySelector('.content')
    const frame = dlg.shadowRoot.querySelector('.content-wrap .vf-scroll-frame')
    const ok = document.getElementById('ok')
    const okRect = ok.getBoundingClientRect()
    const before = content.scrollTop
    content.scrollTop = 99999
    const scrolled = content.scrollTop > before
    return {
      overflowAttr: content.getAttribute('data-overflow-y'),
      scrollable: content.scrollHeight - content.clientHeight > 1,
      scrolled,
      overflowY: getComputedStyle(content).overflowY,
      tabindex: content.getAttribute('tabindex'),
      role: content.getAttribute('role'),
      frameShown: getComputedStyle(frame).display !== 'none',
      okOnScreen:
        okRect.top >= 0 &&
        okRect.bottom <= window.innerHeight &&
        okRect.height > 0,
    }
  })
  check('overflow: over-stuffed sized dialog measures scrollable', r.scrollable && r.overflowAttr === 'true')
  check('overflow: the content region actually scrolls', r.scrolled)
  // The other half of the invariant the fitting case asserts: user-scrollable
  // exactly when the controller flagged overflow, never otherwise.
  check(
    'overflow: a genuinely overflowing dialog reserves the real scroll channel',
    r.overflowY === 'scroll',
    `overflow-y: ${r.overflowY}`
  )
  check('overflow: scrollable region is a keyboard stop with a role', r.tabindex === '0' && r.role === 'group')
  check('overflow: the System 7 rail frame is shown', r.frameShown)
  check('overflow: the default button stays on-screen (footer pinned)', r.okOnScreen)

  const clicked = await page.evaluate(async () => {
    let hit = false
    document.getElementById('ok').addEventListener('click', () => (hit = true))
    const rect = document.getElementById('ok').getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, hit }
  })
  await page.mouse.click(clicked.x, clicked.y)
  const hit = await page.evaluate(() => window.__okHit)
  // (listener above closed over a local; re-assert via a fresh listener)
  await page.evaluate(() => {
    window.__okHit = false
    document.getElementById('ok').addEventListener('click', () => (window.__okHit = true))
  })
  await page.mouse.click(clicked.x, clicked.y)
  const okClickable = await page.evaluate(() => window.__okHit)
  check('overflow: the default button is clickable', okClickable === true, String(hit))
  await page.close()
}
{
  // No declared height + a viewport-taller body: the UA max-height caps the
  // box, and the frame must shrink into it instead of spilling past it.
  const page = await build(`
    <vf-dialog id="auto" heading="Auto" width="360" open>
      ${Array.from({ length: 60 }, (_, i) => `<vf-paragraph>Line ${i + 1}.</vf-paragraph>`).join('')}
      <vf-button id="ok2" slot="buttons" variant="default">OK</vf-button>
    </vf-dialog>
  `)
  const r = await page.evaluate(() => {
    const dlg = document.getElementById('auto')
    const frame = dlg.shadowRoot.querySelector('.vf-frame')
    const fr = frame.getBoundingClientRect()
    const ok = document.getElementById('ok2').getBoundingClientRect()
    return {
      frameInViewport: fr.top >= 0 && fr.bottom <= window.innerHeight + 1,
      okOnScreen: ok.top >= 0 && ok.bottom <= window.innerHeight && ok.height > 0,
    }
  })
  check('overflow: undeclared-height frame stays inside the viewport', r.frameInViewport)
  check('overflow: undeclared-height dialog keeps its button on-screen', r.okOnScreen)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   3. NATIVE EVENTS — §7.2: the native input/change pair, native semantics
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <form id="f">
      <vf-checkbox id="cb" name="cb" value="yes">Check</vf-checkbox>
      <vf-radio-group id="rg" name="rg" value="a">
        <vf-radio id="ra" value="a">A</vf-radio>
        <vf-radio id="rb" value="b">B</vf-radio>
      </vf-radio-group>
      <vf-text-field id="tf" name="tf"></vf-text-field>
      <vf-number-field id="nf" name="nf" value="5"></vf-number-field>
      <vf-select id="sel" name="sel" value="a">
        <vf-option value="a">Alpha</vf-option>
        <vf-option value="b">Beta</vf-option>
      </vf-select>
      <vf-slider id="sl" name="sl" value="50"></vf-slider>
    </form>
  `)
  await page.evaluate(() => {
    window.__log = []
    const f = document.getElementById('f')
    for (const type of ['input', 'change']) {
      f.addEventListener(type, (e) => {
        // Only the native events: CustomEvents here would be a kit bug.
        window.__log.push({
          type,
          target: e.target.id,
          composed: e.composed,
          custom: e instanceof CustomEvent,
        })
      })
    }
  })
  const take = () => page.evaluate(() => window.__log.splice(0))

  // Checkbox: one input + one change per toggle, native flags.
  await page.click('#cb')
  let log = await take()
  check(
    'native: checkbox toggle fires input+change once, at the checkbox',
    log.length === 2 &&
      log[0].type === 'input' &&
      log[1].type === 'change' &&
      log.every((e) => e.target === 'cb' && !e.custom),
    JSON.stringify(log)
  )
  check(
    'native: input is composed, change is not',
    log[0].composed === true && log[1].composed === false
  )

  // Text field: exactly ONE input per keystroke (no host re-dispatch), change on blur.
  await page.focus('#tf')
  await page.keyboard.type('abc')
  log = await take()
  check(
    'native: text field types 3 keys → exactly 3 input events, 0 change',
    log.filter((e) => e.type === 'input').length === 3 &&
      log.filter((e) => e.type === 'change').length === 0,
    JSON.stringify(log.map((e) => e.type))
  )
  await page.evaluate(() => document.getElementById('tf').shadowRoot.querySelector('input').blur())
  log = await take()
  check(
    'native: text field blur commits → exactly 1 change, at the host',
    log.length === 1 && log[0].type === 'change' && log[0].target === 'tf',
    JSON.stringify(log)
  )

  // Number field stepper: input+change per step (a native spinner's pair).
  await page.evaluate(() => {
    const nf = document.getElementById('nf')
    const hit = nf.shadowRoot.querySelector('.hit.up')
    hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerId: 7 }))
    hit.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true, pointerId: 7 }))
  })
  log = await take()
  check(
    'native: number-field step fires input+change once each, at the host',
    log.filter((e) => e.type === 'input' && e.target === 'nf').length === 1 &&
      log.filter((e) => e.type === 'change' && e.target === 'nf').length === 1,
    JSON.stringify(log)
  )

  // Select: keyboard pick commits input+change (through the blink, which
  // reduced motion makes synchronous).
  await page.evaluate(() => document.getElementById('sel').focus())
  await page.keyboard.press(' ')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
  log = await take()
  check(
    'native: select pick fires input+change once each, at the host',
    log.filter((e) => e.type === 'input' && e.target === 'sel').length === 1 &&
      log.filter((e) => e.type === 'change' && e.target === 'sel').length === 1,
    JSON.stringify(log)
  )

  // Slider: a key step is input + change (a native range's pair).
  await page.evaluate(() => document.getElementById('sl').focus())
  await page.keyboard.press('ArrowRight')
  log = await take()
  check(
    'native: slider key step fires input+change once each',
    log.filter((e) => e.type === 'input' && e.target === 'sl').length === 1 &&
      log.filter((e) => e.type === 'change' && e.target === 'sl').length === 1,
    JSON.stringify(log)
  )

  // Radio group: arrow pick fires the pair from the GROUP (the form surface).
  await page.evaluate(() => document.getElementById('ra').focus())
  await page.keyboard.press('ArrowDown')
  log = await take()
  check(
    'native: radio-group arrow pick fires input+change once each, at the group',
    log.filter((e) => e.type === 'input').length === 1 &&
      log.filter((e) => e.type === 'change').length === 1 &&
      log.every((e) => e.target === 'rg'),
    JSON.stringify(log)
  )

  // Programmatic writes fire NOTHING — native semantics.
  await page.evaluate(async () => {
    document.getElementById('cb').checked = false
    document.getElementById('tf').value = 'set'
    document.getElementById('sl').value = 10
    document.getElementById('sel').value = 'a'
    document.getElementById('nf').value = '9'
    document.getElementById('rg').value = 'a'
    await Promise.all(
      ['cb', 'tf', 'sl', 'sel', 'nf', 'rg'].map((id) => document.getElementById(id).updateComplete)
    )
  })
  log = await take()
  check('native: programmatic value writes fire nothing', log.length === 0, JSON.stringify(log))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4. PASS-THROUGH — §7.3: input-behavior attributes reach the inner control
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-text-field id="tf" autocomplete="email" inputmode="numeric"
      enterkeyhint="search" maxlength="5" pattern="[a-z]+"
      spellcheck="false" autocapitalize="words"></vf-text-field>
    <vf-text-area id="ta" autocomplete="street-address" maxlength="10"
      spellcheck="false"></vf-text-area>
    <vf-number-field id="nf"></vf-number-field>
    <vf-number-field id="nf2" inputmode="numeric" autocomplete="on"></vf-number-field>
    <vf-text-field id="bare"></vf-text-field>
  `)
  const attrs = (id, sel, names) =>
    page.evaluate(
      ([i, s, list]) => {
        const el = document.getElementById(i).shadowRoot.querySelector(s)
        return Object.fromEntries(list.map((n) => [n, el.getAttribute(n)]))
      },
      [id, sel, names]
    )

  const tf = await attrs('tf', 'input', [
    'autocomplete', 'inputmode', 'enterkeyhint', 'maxlength', 'pattern', 'spellcheck', 'autocapitalize',
  ])
  check(
    'pass-through: all seven land on vf-text-field’s inner input',
    tf.autocomplete === 'email' &&
      tf.inputmode === 'numeric' &&
      tf.enterkeyhint === 'search' &&
      tf.maxlength === '5' &&
      tf.pattern === '[a-z]+' &&
      tf.spellcheck === 'false' &&
      tf.autocapitalize === 'words',
    JSON.stringify(tf)
  )

  const ta = await attrs('ta', 'textarea', ['autocomplete', 'maxlength', 'spellcheck'])
  check(
    'pass-through: vf-text-area forwards its set',
    ta.autocomplete === 'street-address' && ta.maxlength === '10' && ta.spellcheck === 'false',
    JSON.stringify(ta)
  )

  const nf = await attrs('nf', 'input', ['inputmode', 'autocomplete'])
  const nf2 = await attrs('nf2', 'input', ['inputmode', 'autocomplete'])
  check(
    'pass-through: number field keeps decimal/off defaults, host overrides win',
    nf.inputmode === 'decimal' && nf.autocomplete === 'off' &&
      nf2.inputmode === 'numeric' && nf2.autocomplete === 'on',
    JSON.stringify({ nf, nf2 })
  )

  const bare = await attrs('bare', 'input', ['autocomplete', 'maxlength', 'spellcheck'])
  check(
    'pass-through: an unset attribute is absent on the inner control',
    bare.autocomplete === null && bare.maxlength === null && bare.spellcheck === null,
    JSON.stringify(bare)
  )

  // Set AFTER first render: the observed-attribute path must re-render.
  const late = await page.evaluate(async () => {
    const el = document.getElementById('bare')
    el.setAttribute('maxlength', '3')
    await el.updateComplete
    return el.shadowRoot.querySelector('input').getAttribute('maxlength')
  })
  check('pass-through: attribute set after render reaches the inner control', late === '3')

  // The platform actually enforces it: maxlength bounds typing.
  await page.focus('#bare')
  await page.keyboard.type('abcdefg')
  const bounded = await page.evaluate(() => document.getElementById('bare').value)
  check('pass-through: forwarded maxlength actually bounds typing', bounded === 'abc', bounded)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. SWATCH FIELDSET — §7.6: <fieldset disabled> reaches vf-swatch
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <form id="f">
      <fieldset id="fs">
        <vf-swatch id="sw" color="#ff6600" name="ignored"></vf-swatch>
      </fieldset>
    </form>
  `)
  const r = await page.evaluate(async () => {
    const sw = document.getElementById('sw')
    const fs = document.getElementById('fs')
    const button = () => sw.shadowRoot.querySelector('button')
    window.__clicks = 0
    sw.addEventListener('click', () => window.__clicks++)

    const before = {
      disabled: button().disabled,
      isDisabled: sw.isDisabled,
    }
    fs.disabled = true
    await new Promise((r2) => setTimeout(r2, 0))
    await sw.updateComplete
    const during = {
      disabled: button().disabled,
      isDisabled: sw.isDisabled,
      state: sw.matches(':state(form-disabled)'),
      submits: [...new FormData(document.getElementById('f')).keys()],
    }
    button().click()
    const clicksWhileDisabled = window.__clicks
    fs.disabled = false
    await new Promise((r2) => setTimeout(r2, 0))
    await sw.updateComplete
    const after = { disabled: button().disabled, isDisabled: sw.isDisabled }
    button().click()
    return { before, during, after, clicksWhileDisabled, clicksAfter: window.__clicks }
  })
  check('swatch: enabled by default', r.before.disabled === false && r.before.isDisabled === false)
  check(
    'swatch: <fieldset disabled> disables the inner button',
    r.during.disabled === true && r.during.isDisabled === true,
    JSON.stringify(r.during)
  )
  check('swatch: the fieldset-disabled state is visible to consumer CSS', r.during.state === true)
  check('swatch: still submits nothing', r.during.submits.length === 0, JSON.stringify(r.during.submits))
  check('swatch: a disabled palette takes no clicks', r.clicksWhileDisabled === 0)
  check(
    'swatch: re-enabling restores interaction',
    r.after.disabled === false && r.after.isDisabled === false && r.clicksAfter === 1
  )
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   6. LABEL STALENESS — §6.4: in-place text edits re-derive the pushed name
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-label id="lb" for="tf">Name:</vf-label>
    <vf-text-field id="tf"></vf-text-field>
  `)
  const r = await page.evaluate(async () => {
    const lb = document.getElementById('lb')
    const tf = document.getElementById('tf')
    const initial = tf.label
    // The framework path: write .data on the existing Text node. No node is
    // added or removed, so slotchange never fires.
    lb.firstChild.data = 'Full name:'
    await new Promise((r2) => setTimeout(r2, 0))
    await tf.updateComplete
    const afterEdit = {
      label: tf.label,
      inner: tf.shadowRoot.querySelector('input').getAttribute('aria-label'),
    }
    lb.remove()
    await new Promise((r2) => setTimeout(r2, 0))
    return { initial, afterEdit, afterRemove: tf.label }
  })
  check('label: the caption named the control initially', r.initial === 'Name:', r.initial)
  check(
    'label: an in-place Text.data edit re-derives the name',
    r.afterEdit.label === 'Full name:' && r.afterEdit.inner === 'Full name:',
    JSON.stringify(r.afterEdit)
  )
  check('label: removing the label still takes the name back', r.afterRemove === '', r.afterRemove)
  await page.close()
}

await browser.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
