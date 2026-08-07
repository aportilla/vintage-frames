/**
 * Verifies the name-bridge cluster from ACCESSIBILITY-REVIEW.md — the
 * accessible-name, description and constraint-validation contract across the
 * shadow boundary, closed 2026-08-01:
 *
 *  - NAME BRIDGE (§6.1): on the controls whose role lives on a shadow-internal
 *    node (the fields, vf-select, vf-swatch), a consumer's host-level
 *    aria-labelledby / aria-label / associated <label for> resolves to the
 *    inner focusable element's accessible name — in html-aam precedence —
 *    with the explicit `label` property still winning, and a post-upgrade
 *    attribute write landing too.
 *  - DESCRIPTION (§6.2): the `description` property (and a bridged host
 *    aria-describedby) reaches AT as the inner control's computed description,
 *    via the shadow-internal hidden-span idiom; no empty reference is left
 *    behind when there is nothing to say.
 *  - VALIDATION (§7.1): `required` fails constraint validation with
 *    valueMissing on the fields, select, checkbox and radio group;
 *    form.reportValidity() actually blocks; :invalid matches on the host;
 *    disabled/readonly bar validation per HTML; setCustomValidity() is the
 *    native channel; the validationMessage joins the description node so AT
 *    hears the error where it hears the hint; and Enter-in-a-field no longer
 *    submits past a failing constraint.
 *  - NAME-FROM-CONTENT (§6.3): vf-label's aria route declines a target whose
 *    name is computed from its own content (vf-checkbox with slotted text,
 *    vf-button, native <button>) instead of stamping over it — while a
 *    text-less target still receives the caption, and the property route is
 *    untouched.
 *
 *   npm run dev            # in another shell (port 5173)
 *   npm run verify:names
 */
import { attr, ax, axFor, check, launch, makeBuild, results, walk } from './harness.mjs'

const browser = await launch()

const build = makeBuild(browser, { viewport: { width: 1200, height: 700 } })

/** The AX node computed for a shadow part of a vf-* host (verify-window-a11y's
 * idiom), or for the host itself when partName is null. */
const axName = (node) => node?.name?.value ?? ''
const axDescription = (node) => node?.description?.value ?? ''

/* ────────────────────────────────────────────────────────────────────────────
   1. §6.1 — the name bridge on the fields
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <label for="tf">Name:</label>
    <vf-text-field id="tf"></vf-text-field>

    <vf-text-field id="al" aria-label="Street"></vf-text-field>

    <span id="cap">City</span>
    <vf-text-field id="alb" aria-labelledby="cap"></vf-text-field>

    <span id="both-cap">Referenced</span>
    <label for="both">Labeled</label>
    <vf-text-field id="both" aria-labelledby="both-cap" aria-label="Attribute"></vf-text-field>

    <vf-text-field id="prop" aria-label="Loses"></vf-text-field>

    <vf-text-field id="late"></vf-text-field>

    <label for="ta">Notes</label>
    <vf-text-area id="ta"></vf-text-area>

    <label for="nf">Count</label>
    <vf-number-field id="nf"></vf-number-field>
  `)
  const cdp = await ax(page)

  check(
    'field: <label for> names the inner input',
    axName(await axFor(cdp, 'tf', 'input')) === 'Name:'
  )
  check(
    'field: host aria-label names the inner input',
    axName(await axFor(cdp, 'al', 'input')) === 'Street'
  )
  check(
    'field: host aria-labelledby resolves in the host tree scope',
    axName(await axFor(cdp, 'alb', 'input')) === 'City'
  )
  check(
    'field: html-aam precedence — aria-labelledby beats aria-label and <label>',
    axName(await axFor(cdp, 'both', 'input')) === 'Referenced'
  )

  await page.evaluate(async () => {
    const el = document.getElementById('prop')
    el.label = 'Wins'
    await el.updateComplete
  })
  check(
    'field: the label property beats every host channel',
    axName(await axFor(cdp, 'prop', 'input')) === 'Wins'
  )

  await page.evaluate(async () => {
    const el = document.getElementById('late')
    el.setAttribute('aria-label', 'After upgrade')
    await el.updateComplete
  })
  check(
    'field: an aria-label written after upgrade still lands',
    axName(await axFor(cdp, 'late', 'input')) === 'After upgrade'
  )

  check(
    'text-area: <label for> names the inner textarea',
    axName(await axFor(cdp, 'ta', 'textarea')) === 'Notes'
  )
  check(
    'number-field: <label for> names the inner spinbutton',
    axName(await axFor(cdp, 'nf', 'input')) === 'Count'
  )

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2. §6.1/§6.10 — the same bridge on vf-select and vf-swatch
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <label for="sel">Install Location</label>
    <vf-select id="sel">
      <vf-option value="hd">Macintosh HD</vf-option>
      <vf-option value="fd">Floppy</vf-option>
    </vf-select>

    <vf-swatch id="sw" color="#ff6600" aria-label="Orange"></vf-swatch>
    <vf-swatch id="sw-bare" color="#ff6600"></vf-swatch>
  `)
  const cdp = await ax(page)

  check(
    'select: <label for> names the combobox control',
    axName(await axFor(cdp, 'sel', 'control')) === 'Install Location'
  )
  check(
    'swatch: host aria-label reaches the inner button (§6.10)',
    axName(await axFor(cdp, 'sw', 'button')) === 'Orange'
  )
  check(
    'swatch: unnamed still falls back to the color value',
    axName(await axFor(cdp, 'sw-bare', 'button')) === '#ff6600'
  )

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   3. §6.2 — the description channel
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-text-field id="desc" label="Password" description="At least 8 characters."></vf-text-field>

    <span id="hint">Digits only.</span>
    <vf-text-field id="bridged" label="PIN" aria-describedby="hint"></vf-text-field>

    <vf-text-field id="plain" label="Plain"></vf-text-field>

    <label for="seld">Disk</label>
    <vf-select id="seld" description="Pick the install target.">
      <vf-option value="hd">Macintosh HD</vf-option>
    </vf-select>

    <vf-swatch id="swd" color="#ff6600" label="Fill" description="Applies to the selection."></vf-swatch>

    <span id="swhint">Double-click to edit.</span>
    <vf-swatch id="swb" color="#0000ff" label="Pen" aria-describedby="swhint"></vf-swatch>

    <vf-swatch id="swplain" color="#00ff00" label="Bare"></vf-swatch>
  `)
  const cdp = await ax(page)

  check(
    'description property reaches AT as the computed description',
    axDescription(await axFor(cdp, 'desc', 'input')) === 'At least 8 characters.'
  )
  check(
    'host aria-describedby is bridged to the inner control',
    axDescription(await axFor(cdp, 'bridged', 'input')) === 'Digits only.'
  )
  check(
    'no description → no aria-describedby reference at all',
    await page.evaluate(
      () =>
        document
          .getElementById('plain')
          .shadowRoot.querySelector('input')
          .getAttribute('aria-describedby') === null &&
        document.getElementById('plain').shadowRoot.querySelector('#description') === null
    )
  )
  check(
    'select: description reaches the combobox control',
    axDescription(await axFor(cdp, 'seld', 'control')) === 'Pick the install target.'
  )

  // vf-swatch was the one shadow-role control with no description channel at
  // all: its role sits on the inner <button>, so unlike the host-role controls
  // it had no native aria-describedby to fall back on either.
  check(
    'swatch: description property reaches the inner button (§6.2)',
    axDescription(await axFor(cdp, 'swd', 'button')) === 'Applies to the selection.'
  )
  check(
    'swatch: host aria-describedby is bridged to the inner button',
    axDescription(await axFor(cdp, 'swb', 'button')) === 'Double-click to edit.'
  )
  check(
    'swatch: no description → no reference and no span',
    await page.evaluate(
      () =>
        document
          .getElementById('swplain')
          .shadowRoot.querySelector('button')
          .getAttribute('aria-describedby') === null &&
        document.getElementById('swplain').shadowRoot.querySelector('#description') === null
    )
  )

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4. §7.1 — constraint validation
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <form id="f">
      <vf-text-field id="tf" name="tf" label="Name" required></vf-text-field>
      <vf-checkbox id="cb" name="cb" required>Agree</vf-checkbox>
      <vf-radio-group id="rg" name="rg" label="Mode" required>
        <vf-radio value="a">A</vf-radio>
        <vf-radio value="b">B</vf-radio>
      </vf-radio-group>
      <vf-select id="sel" name="sel" label="Disk" required>
        <vf-option value="hd">Macintosh HD</vf-option>
      </vf-select>
    </form>
    <form id="f2">
      <vf-text-field id="off" name="off" label="Disabled" required disabled></vf-text-field>
      <vf-text-field id="ro" name="ro" label="Readonly" required readonly></vf-text-field>
    </form>
  `)
  const cdp = await ax(page)

  const empty = await page.evaluate(() => {
    const tf = document.getElementById('tf')
    return {
      report: document.getElementById('f').reportValidity(),
      checkTf: tf.checkValidity(),
      valueMissing: tf.validity.valueMissing,
      willValidate: tf.willValidate,
      message: tf.validationMessage,
      invalidMatches: ['tf', 'cb', 'rg'].map((id) =>
        document.getElementById(id).matches(':invalid')
      ),
      selValid: document.getElementById('sel').checkValidity(),
    }
  })
  check('form.reportValidity() is false with required controls empty', empty.report === false)
  check('checkValidity() false / valueMissing true / willValidate true on the empty field',
    empty.checkTf === false && empty.valueMissing === true && empty.willValidate === true)
  check(
    'the field reports the native valueMissing message',
    empty.message === 'Please fill out this field.',
    JSON.stringify(empty.message)
  )
  check(
    ':invalid matches on field, checkbox and radio group hosts',
    empty.invalidMatches.every(Boolean),
    JSON.stringify(empty.invalidMatches)
  )
  check(
    'select: an adopted first option satisfies required (native parity)',
    empty.selValid === true
  )

  const axInvalid = await axFor(cdp, 'tf', 'input')
  check(
    'invalid required field: message routed into the computed description',
    axDescription(axInvalid) === 'Please fill out this field.'
  )
  check(
    'invalid required field: aria-invalid on the inner control',
    await page.evaluate(() =>
      document.getElementById('tf').shadowRoot.querySelector('input').getAttribute('aria-invalid') === 'true'
    )
  )
  check(
    'required mirrors aria-required onto the inner control',
    await page.evaluate(() =>
      document.getElementById('tf').shadowRoot.querySelector('input').getAttribute('aria-required') === 'true'
    )
  )

  const filled = await page.evaluate(async () => {
    const tf = document.getElementById('tf')
    const cb = document.getElementById('cb')
    const rg = document.getElementById('rg')
    const sel = document.getElementById('sel')
    tf.value = 'Adam'
    cb.checked = true
    rg.value = 'a'
    await Promise.all([tf.updateComplete, cb.updateComplete, rg.updateComplete])
    const report = document.getElementById('f').reportValidity()
    // A programmatic clear on the select is the no-commitment state.
    sel.value = ''
    await sel.updateComplete
    return {
      report,
      invalidMatches: ['tf', 'cb', 'rg'].map((id) =>
        document.getElementById(id).matches(':invalid')
      ),
      ariaInvalidGone:
        tf.shadowRoot.querySelector('input').getAttribute('aria-invalid') === null,
      selMissing: sel.validity.valueMissing,
      selMessage: sel.validationMessage,
    }
  })
  check('filling every control turns form.reportValidity() true', filled.report === true)
  check(
    ':invalid clears on all three hosts',
    filled.invalidMatches.every((m) => m === false)
  )
  check('aria-invalid clears with validity', filled.ariaInvalidGone)
  check(
    'select: a cleared value is valueMissing with the native select message',
    filled.selMissing === true && filled.selMessage === 'Please select an item in the list.',
    JSON.stringify(filled.selMessage)
  )

  const barred = await page.evaluate(() => {
    return {
      report: document.getElementById('f2').reportValidity(),
      disabledWillValidate: document.getElementById('off').willValidate,
      readonlyWillValidate: document.getElementById('ro').willValidate,
    }
  })
  check(
    'disabled and readonly bar constraint validation (form still submits)',
    barred.report === true &&
      barred.disabledWillValidate === false &&
      barred.readonlyWillValidate === false,
    JSON.stringify(barred)
  )

  const custom = await page.evaluate(async () => {
    const cb = document.getElementById('cb')
    cb.setCustomValidity('Not yet.')
    await cb.updateComplete
    const invalid = {
      check: cb.checkValidity(),
      customError: cb.validity.customError,
      message: cb.validationMessage,
      matches: cb.matches(':invalid'),
    }
    cb.setCustomValidity('')
    await cb.updateComplete
    return { invalid, clearedCheck: cb.checkValidity() }
  })
  check(
    'setCustomValidity installs a custom error with exactly that message',
    custom.invalid.check === false &&
      custom.invalid.customError === true &&
      custom.invalid.message === 'Not yet.' &&
      custom.invalid.matches === true
  )
  check('setCustomValidity("") clears it', custom.clearedCheck === true)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. §7.1 — Enter in a field no longer submits past a failing constraint
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <form id="f">
      <vf-text-field id="tf" name="tf" label="Name" required></vf-text-field>
    </form>
  `)
  const submits = await page.evaluate(async () => {
    const form = document.getElementById('f')
    const tf = document.getElementById('tf')
    const seen = []
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      seen.push('submit')
    })
    const enter = () => {
      const input = tf.shadowRoot.querySelector('input')
      input.focus()
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true })
      )
    }
    enter()
    await new Promise((r) => setTimeout(r, 20))
    const whileInvalid = seen.length
    tf.value = 'typed'
    await tf.updateComplete
    enter()
    await new Promise((r) => setTimeout(r, 20))
    return { whileInvalid, afterFill: seen.length }
  })
  check('Enter while valueMissing submits nothing', submits.whileInvalid === 0)
  check('Enter after filling submits once', submits.afterFill === 1)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   6. §6.3 — vf-label declines a name from content, still names the nameless
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-label for="cb" id="cap1">Caption</vf-label>
    <vf-checkbox id="cb">Keep me</vf-checkbox>

    <vf-label for="cb2">Adopted caption</vf-label>
    <vf-checkbox id="cb2"></vf-checkbox>

    <vf-label for="vb">Button caption</vf-label>
    <vf-button id="vb">Revert</vf-button>

    <vf-label for="nb">Native caption</vf-label>
    <button id="nb">Apply</button>

    <vf-label for="ni">Input caption</vf-label>
    <input id="ni" type="text">

    <vf-label for="tfp">Field caption</vf-label>
    <vf-text-field id="tfp"></vf-text-field>
  `)
  const cdp = await ax(page)

  check(
    'checkbox with slotted text keeps its own name (no stamp)',
    (await page.evaluate(() =>
      document.getElementById('cb').hasAttribute('aria-labelledby')
    )) === false && axName(await axFor(cdp, 'cb')) === 'Keep me'
  )
  check(
    'text-less checkbox is named by the caption (stamped)',
    (await page.evaluate(() =>
      document.getElementById('cb2').hasAttribute('aria-labelledby')
    )) === true && axName(await axFor(cdp, 'cb2')) === 'Adopted caption'
  )
  check(
    'vf-button keeps its own name (no stamp)',
    await page.evaluate(
      () => !document.getElementById('vb').hasAttribute('aria-labelledby')
    )
  )
  check(
    'native <button> keeps its own name (no stamp)',
    await page.evaluate(
      () => !document.getElementById('nb').hasAttribute('aria-labelledby')
    )
  )
  check(
    'native <input> still takes the caption via aria-labelledby',
    await page.evaluate(
      () => document.getElementById('ni').hasAttribute('aria-labelledby')
    )
  )
  check(
    'vf-text-field still takes the caption via the label property',
    await page.evaluate(() => document.getElementById('tfp').label === 'Field caption')
  )

  await page.close()
}

await browser.close()

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
