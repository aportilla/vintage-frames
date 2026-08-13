/**
 * Verifies the update-cycle contract: every component does its form-value,
 * ARIA and child-sync work once per *relevant* change — not once per render —
 * and still does all of it when something relevant actually changes.
 *
 * Why this suite is built out of call counts rather than rendered state: the
 * work it guards is **idempotent**. A component that re-runs `setFormValue`,
 * re-writes six ARIA properties and re-loops every child on every unrelated
 * re-render produces byte-identical output to one that doesn't, so no
 * geometry, ARIA or event assertion in any existing suite can see the
 * difference. The only observable is how many times the work runs, which means
 * instrumenting `ElementInternals`, the reactive accessors the child loops
 * write, and `ResizeObserver` — all of it installed *before* the module is
 * imported, since components attach their internals during construction.
 *
 * The counts cut both ways. Under-gating shows up as a count that grows on an
 * unrelated re-render; over-gating shows up as work that fails to run when it
 * must — which is why every scenario that asserts "didn't run" is paired with
 * one asserting "still runs". The sharpest of those pairs is the ancestor
 * `<fieldset disabled>` case: it travels `formDisabledCallback` -> the
 * protected `formDisabled` state, which `keyof this` can't name, so a gate
 * written as `changed.has('disabled')` compiles, looks complete, and silently
 * stops clearing the submitted value of a disabled control.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:updates
 */
import { ORIGIN, check, launch, report } from './harness.mjs'

const browser = await launch()

/**
 * Instrumentation installed before the module import — components attach their
 * ElementInternals in the constructor, so a later patch would miss them.
 */
const INSTRUMENT = () => {
  const counts = {
    formValue: {},
    aria: {},
    prop: {},
    roCreated: 0,
    roObserve: 0,
    roDisconnect: 0,
  }
  window.__c = counts
  const owner = new WeakMap()
  const bump = (bucket, key) => {
    bucket[key] = (bucket[key] ?? 0) + 1
  }
  const idOf = (el) => el?.id || el?.tagName?.toLowerCase() || '?'

  const attach = HTMLElement.prototype.attachInternals
  HTMLElement.prototype.attachInternals = function () {
    const internals = attach.call(this)
    owner.set(internals, this)
    return internals
  }

  const setFormValue = ElementInternals.prototype.setFormValue
  ElementInternals.prototype.setFormValue = function (...args) {
    bump(counts.formValue, idOf(owner.get(this)))
    return setFormValue.apply(this, args)
  }

  for (const prop of [
    'ariaValueNow', 'ariaValueMin', 'ariaValueMax', 'ariaLabel',
    'ariaDisabled', 'ariaOrientation', 'ariaChecked',
  ]) {
    const desc = Object.getOwnPropertyDescriptor(ElementInternals.prototype, prop)
    if (!desc?.set) continue
    Object.defineProperty(ElementInternals.prototype, prop, {
      ...desc,
      set(value) {
        bump(counts.aria, `${idOf(owner.get(this))}.${prop}`)
        desc.set.call(this, value)
      },
    })
  }

  const RO = window.ResizeObserver
  window.ResizeObserver = class extends RO {
    constructor(callback) {
      super(callback)
      counts.roCreated++
    }
    observe(...args) {
      counts.roObserve++
      return super.observe(...args)
    }
    disconnect(...args) {
      counts.roDisconnect++
      return super.disconnect(...args)
    }
  }

  /**
   * Count writes to a reactive property on a component prototype. The child
   * loops (`syncRadios`, `#applySelection`, `#syncItems`) write one of these
   * per child per pass, so `writes / childCount` is the number of passes.
   */
  window.__watchProp = (ctor, prop) => {
    const desc = Object.getOwnPropertyDescriptor(ctor.prototype, prop)
    if (!desc?.set) return false
    Object.defineProperty(ctor.prototype, prop, {
      ...desc,
      set(value) {
        bump(counts.prop, `${ctor.name}.${prop}`)
        desc.set.call(this, value)
      },
    })
    return true
  }
}

/** Parse-time page build: markup first, module second (see verify:scale). */
async function build(markup) {
  const page = await browser.newPage()
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(markup)
  await page.evaluate(INSTRUMENT)
  await page.evaluate(() => import('/src/index.js'))
  await settle(page)
  return page
}

const settle = (page) =>
  page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    ).then(() => new Promise((r) => requestAnimationFrame(() => r())))
  )

const counts = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__c)))

/** Run `fn`, then report how much each counter moved while it ran. */
async function delta(page, fn) {
  const before = await counts(page)
  await fn()
  await settle(page)
  const after = await counts(page)
  const diff = { formValue: {}, aria: {}, prop: {} }
  for (const bucket of ['formValue', 'aria', 'prop']) {
    for (const key of new Set([...Object.keys(before[bucket]), ...Object.keys(after[bucket])])) {
      const d = (after[bucket][key] ?? 0) - (before[bucket][key] ?? 0)
      if (d !== 0) diff[bucket][key] = d
    }
  }
  for (const key of ['roCreated', 'roObserve', 'roDisconnect']) diff[key] = after[key] - before[key]
  return diff
}

/** A re-render with an empty `changed` map — the purest "unrelated update". */
const rerender = (page, id, times = 3) =>
  page.evaluate(
    async ({ id, times }) => {
      const el = document.getElementById(id)
      for (let i = 0; i < times; i++) {
        el.requestUpdate()
        await el.updateComplete
      }
    },
    { id, times }
  )

/* ────────────────────────────────────────────────────────────────────────────
   1. THE FIELDS — vf-text-field / -area / -number-field via VfTextControlBase
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <form id="f">
      <vf-text-field id="t" name="t" value="abc"></vf-text-field>
      <vf-text-area id="ta" name="ta" value="line"></vf-text-area>
      <vf-number-field id="n" name="n" value="5" min="0" max="10" step="1"></vf-number-field>
    </form>`)

  const initial = await counts(page)
  for (const id of ['t', 'ta', 'n']) {
    check(`#${id} submits its value on first update`, (initial.formValue[id] ?? 0) >= 1,
      `setFormValue x${initial.formValue[id] ?? 0}`)
  }

  const idle = await delta(page, () => Promise.all([rerender(page, 't'), rerender(page, 'ta'), rerender(page, 'n')]))
  for (const id of ['t', 'ta', 'n']) {
    check(`#${id} does no form work on an unrelated re-render`, (idle.formValue[id] ?? 0) === 0,
      `setFormValue x${idle.formValue[id] ?? 0} over 3 renders`)
  }

  // The realistic version of the same thing: the stepper's `pressed` state
  // re-renders the number field on press AND on release, around one value change.
  const stepper = await delta(page, async () => {
    const box = await page.locator('#n').boundingBox()
    await page.mouse.move(box.x + box.width - 8, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.waitForTimeout(60)
    await page.mouse.up()
  })
  check('#n stepper press re-syncs once per value change, not per render',
    stepper.formValue.n === 1, `setFormValue x${stepper.formValue.n}`)

  const typed = await delta(page, async () => {
    await page.locator('#t').click()
    await page.keyboard.type('XY')
  })
  check('#t still re-syncs on every keystroke', typed.formValue.t === 2,
    `setFormValue x${typed.formValue.t} for 2 keystrokes`)

  const entries = () =>
    page.evaluate(() => [...new FormData(document.getElementById('f')).entries()]
      .map(([k, v]) => `${k}=${v}`).sort().join(','))
  check('fields submit their values', await entries() === 'n=6,t=abcXY,ta=line', await entries())

  // Over-gating guard 1: the `disabled` property path.
  const disabled = await delta(page, () =>
    page.evaluate(() => { document.getElementById('t').disabled = true }))
  check('#t re-syncs when disabled', (disabled.formValue.t ?? 0) === 1, `x${disabled.formValue.t ?? 0}`)
  check('a disabled field submits nothing', await entries() === 'n=6,ta=line', await entries())

  await page.evaluate(() => { document.getElementById('t').disabled = false })
  await settle(page)
  check('re-enabling restores the submitted value', await entries() === 'n=6,t=abcXY,ta=line', await entries())

  // Over-gating guard 2: the ancestor <fieldset disabled> path, which reaches
  // the protected `formDisabled` state and never touches `disabled`.
  const viaFieldset = await delta(page, () =>
    page.evaluate(() => {
      const form = document.getElementById('f')
      const fieldset = document.createElement('fieldset')
      fieldset.id = 'fs'
      fieldset.disabled = true
      form.parentElement.insertBefore(fieldset, form)
      fieldset.appendChild(form)
    }))
  check('<fieldset disabled> re-syncs every field',
    ['t', 'ta', 'n'].every((id) => (viaFieldset.formValue[id] ?? 0) >= 1),
    JSON.stringify(viaFieldset.formValue))
  check('a fieldset-disabled field submits nothing', await entries() === '', `"${await entries()}"`)

  await page.evaluate(() => { document.getElementById('fs').disabled = false })
  await settle(page)
  check('re-enabling the fieldset restores every value',
    await entries() === 'n=6,t=abcXY,ta=line', await entries())

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2. VF-SLIDER — six internals writes + a tab stop, per render
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="wrap" style="width: 300px">
      <form id="f"><vf-slider id="s" name="s" value="30" min="0" max="100" step="5" label="Vol"></vf-slider></form>
    </div>`)

  const initial = await counts(page)
  check('slider sets every ARIA property on first update',
    ['ariaValueMin', 'ariaValueMax', 'ariaValueNow', 'ariaLabel', 'ariaDisabled', 'ariaOrientation']
      .every((p) => (initial.aria[`s.${p}`] ?? 0) >= 1),
    JSON.stringify(initial.aria))
  check('slider sets ariaOrientation exactly once (constant, moved to the constructor)',
    initial.aria['s.ariaOrientation'] === 1, `x${initial.aria['s.ariaOrientation']}`)

  const idle = await delta(page, () => rerender(page, 's'))
  check('slider does no form work on an unrelated re-render',
    (idle.formValue.s ?? 0) === 0, `x${idle.formValue.s ?? 0}`)
  check('slider writes no ARIA on an unrelated re-render',
    Object.keys(idle.aria).length === 0, JSON.stringify(idle.aria))

  // The realistic unrelated re-render: focusing toggles the `focusRing` state.
  const focused = await delta(page, () => page.locator('#s').focus())
  check('focusing the slider does no form/ARIA work',
    (focused.formValue.s ?? 0) === 0 && Object.keys(focused.aria).length === 0,
    JSON.stringify({ ...focused.formValue, ...focused.aria }))

  // …and so is a resize: the rail is regenerated, the value is untouched.
  const resized = await delta(page, async () => {
    await page.evaluate(() => { document.getElementById('wrap').style.width = '520px' })
    await page.waitForTimeout(80)
  })
  check('resizing the rail does no form/ARIA work',
    (resized.formValue.s ?? 0) === 0 && Object.keys(resized.aria).length === 0,
    JSON.stringify({ ...resized.formValue, ...resized.aria }))

  // Over-gating guards: the writes that must still happen.
  const keyed = await delta(page, async () => {
    await page.locator('#s').focus()
    await page.keyboard.press('ArrowRight')
  })
  check('a value change still re-syncs the form value', keyed.formValue.s === 1, `x${keyed.formValue.s}`)
  check('a value change still writes ariaValueNow', keyed.aria['s.ariaValueNow'] === 1,
    `x${keyed.aria['s.ariaValueNow']}`)
  check('a value change writes no valuemin/valuemax/label',
    !keyed.aria['s.ariaValueMin'] && !keyed.aria['s.ariaValueMax'] && !keyed.aria['s.ariaLabel'],
    JSON.stringify(keyed.aria))

  const bounded = await delta(page, () =>
    page.evaluate(() => { document.getElementById('s').max = 200 }))
  check('a max change still writes ariaValueMax', bounded.aria['s.ariaValueMax'] === 1,
    `x${bounded.aria['s.ariaValueMax']}`)

  const labelled = await delta(page, () =>
    page.evaluate(() => { document.getElementById('s').label = 'Speed' }))
  check('a label change still writes ariaLabel', labelled.aria['s.ariaLabel'] === 1,
    `x${labelled.aria['s.ariaLabel']}`)

  const off = await delta(page, () =>
    page.evaluate(() => { document.getElementById('s').disabled = true }))
  check('disabling still writes ariaDisabled and the form value',
    off.aria['s.ariaDisabled'] === 1 && off.formValue.s === 1,
    JSON.stringify({ ...off.formValue, ...off.aria }))
  check('a disabled slider leaves the tab order',
    await page.evaluate(() => document.getElementById('s').tabIndex) === -1)

  const ax = await axNode(page, 's')
  check('the slider AX node still carries its values',
    ax?.role === 'slider' && ax.props.includes('valuemax=200') && ax.props.includes('valuemin=0'),
    JSON.stringify(ax))

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   3. VF-RADIO-GROUP — the child loop, once per selection
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <form id="f">
      <vf-radio-group id="g" name="g" value="b" label="Fruit">
        <vf-radio id="ra" value="a">A</vf-radio>
        <vf-radio id="rb" value="b">B</vf-radio>
        <vf-radio id="rc" value="c">C</vf-radio>
      </vf-radio-group>
    </form>`)
  const RADIOS = 3
  const watched = await page.evaluate(async () => {
    const m = await import('/src/index.js')
    return window.__watchProp(m.VfRadio, 'groupDisabled')
  })
  check('instrument attached to VfRadio.groupDisabled', watched === true)

  const idle = await delta(page, () => rerender(page, 'g'))
  check('radio group does no form work on an unrelated re-render',
    (idle.formValue.g ?? 0) === 0, `x${idle.formValue.g ?? 0}`)
  check('radio group does not re-loop its children on an unrelated re-render',
    (idle.prop['VfRadio.groupDisabled'] ?? 0) === 0,
    `x${idle.prop['VfRadio.groupDisabled'] ?? 0} child writes over 3 renders`)

  const clicked = await delta(page, () => page.locator('#ra').click())
  check('a selection loops the children exactly once',
    clicked.prop['VfRadio.groupDisabled'] === RADIOS,
    `${clicked.prop['VfRadio.groupDisabled']} child writes, expected ${RADIOS}`)
  check('a selection re-syncs the form value once', clicked.formValue.g === 1,
    `x${clicked.formValue.g}`)

  const arrowed = await delta(page, () => page.keyboard.press('ArrowDown'))
  check('an arrow-key selection loops the children exactly once',
    arrowed.prop['VfRadio.groupDisabled'] === RADIOS,
    `${arrowed.prop['VfRadio.groupDisabled']} child writes, expected ${RADIOS}`)

  // Over-gating guard: an external write has no synchronous sync behind it.
  const external = await delta(page, () =>
    page.evaluate(() => { document.getElementById('g').value = 'c' }))
  check('an external value write still loops the children',
    external.prop['VfRadio.groupDisabled'] === RADIOS,
    `${external.prop['VfRadio.groupDisabled'] ?? 0} child writes, expected ${RADIOS}`)
  check('an external value write lands on the children',
    await page.evaluate(() => ({
      checked: [...document.querySelectorAll('vf-radio')].map((r) => r.checked),
      tab: [...document.querySelectorAll('vf-radio')].map((r) => r.tabIndex),
    })).then((s) => JSON.stringify(s) === JSON.stringify({ checked: [false, false, true], tab: [-1, -1, 0] })),
    JSON.stringify(await page.evaluate(() =>
      [...document.querySelectorAll('vf-radio')].map((r) => `${r.checked}/${r.tabIndex}`))))

  const disabled = await delta(page, () =>
    page.evaluate(() => { document.getElementById('g').disabled = true }))
  // The group reflects `disabled`, and its own subtree observer sees that
  // attribute land on itself — so this ran the child loop twice until the
  // observer learned to ignore the host's own attribute records.
  check('disabling the group loops the children exactly once',
    disabled.prop['VfRadio.groupDisabled'] === RADIOS,
    `${disabled.prop['VfRadio.groupDisabled'] ?? 0} child writes, expected ${RADIOS}`)
  check('a disabled group dims and un-tabs its children',
    await page.evaluate(() =>
      [...document.querySelectorAll('vf-radio')].every((r) => r.groupDisabled && r.tabIndex === -1)))
  check('a disabled group submits nothing',
    await page.evaluate(() => [...new FormData(document.getElementById('f')).keys()].length) === 0)

  // A radio added inside wrapper markup still re-syncs (the mutation observer
  // path, which must not be gated behind the sync key).
  const added = await delta(page, async () => {
    await page.evaluate(() => {
      document.getElementById('g').disabled = false
      const wrap = document.createElement('div')
      const radio = document.createElement('vf-radio')
      radio.setAttribute('value', 'd')
      radio.textContent = 'D'
      wrap.appendChild(radio)
      document.getElementById('g').appendChild(wrap)
    })
    await page.waitForTimeout(50)
  })
  check('a dynamically added radio is synced by the group',
    (added.prop['VfRadio.groupDisabled'] ?? 0) >= 4,
    `${added.prop['VfRadio.groupDisabled'] ?? 0} child writes`)
  check('the added radio adopts the group tabindex model',
    await page.evaluate(() => document.querySelector('vf-radio[value=d]').tabIndex) === -1)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4. VF-LIST — #applySelection, once per interaction
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-list id="l" label="Fonts">
      <vf-list-item value="a">Alpha</vf-list-item>
      <vf-list-item value="b">Bravo</vf-list-item>
      <vf-list-item value="c">Charlie</vf-list-item>
      <vf-list-item value="d">Delta</vf-list-item>
    </vf-list>`)
  const ITEMS = 4
  const watched = await page.evaluate(async () => {
    const m = await import('/src/index.js')
    return window.__watchProp(m.VfListItem, 'selected')
  })
  check('instrument attached to VfListItem.selected', watched === true)

  const idle = await delta(page, () => rerender(page, 'l'))
  check('list does not re-apply its selection on an unrelated re-render',
    (idle.prop['VfListItem.selected'] ?? 0) === 0,
    `x${idle.prop['VfListItem.selected'] ?? 0} row writes over 3 renders`)

  const clicked = await delta(page, () => page.locator('vf-list-item[value=b]').click())
  check('a click applies the selection exactly once',
    clicked.prop['VfListItem.selected'] === ITEMS,
    `${clicked.prop['VfListItem.selected']} row writes, expected ${ITEMS}`)

  const arrowed = await delta(page, () => page.keyboard.press('ArrowDown'))
  check('an arrow key applies the selection exactly once',
    arrowed.prop['VfListItem.selected'] === ITEMS,
    `${arrowed.prop['VfListItem.selected']} row writes, expected ${ITEMS}`)

  const typed = await delta(page, () => page.keyboard.type('a'))
  check('a type-ahead jump applies the selection exactly once',
    typed.prop['VfListItem.selected'] === ITEMS,
    `${typed.prop['VfListItem.selected']} row writes, expected ${ITEMS}`)

  // Over-gating guards: external writes must still reach the rows.
  const external = await delta(page, () =>
    page.evaluate(() => { document.getElementById('l').value = 'd' }))
  check('an external value write still applies to the rows',
    external.prop['VfListItem.selected'] === ITEMS,
    `${external.prop['VfListItem.selected'] ?? 0} row writes, expected ${ITEMS}`)
  check('an external value write selects the right row',
    await page.evaluate(() =>
      [...document.querySelectorAll('vf-list-item')].map((i) => i.selected).join()) === 'false,false,false,true')

  const externalValues = await delta(page, () =>
    page.evaluate(() => { document.getElementById('l').values = ['b'] }))
  check('an external values write still applies to the rows',
    externalValues.prop['VfListItem.selected'] === ITEMS,
    `${externalValues.prop['VfListItem.selected'] ?? 0} row writes, expected ${ITEMS}`)
  check('an external values write selects the right row',
    await page.evaluate(() => document.getElementById('l').value) === 'b')

  // Re-writing the value the rows already carry is the case the gate skips;
  // the selection must still be correct afterwards.
  const same = await delta(page, () =>
    page.evaluate(() => { document.getElementById('l').value = 'b' }))
  check('re-writing the current value does no row work',
    (same.prop['VfListItem.selected'] ?? 0) === 0,
    `x${same.prop['VfListItem.selected'] ?? 0}`)
  check('the selection survives the skipped pass',
    await page.evaluate(() =>
      [...document.querySelectorAll('vf-list-item')].map((i) => i.selected).join()) === 'false,true,false,false')

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. TRACKWIDTHCONTROLLER — one observer, one observe, resumed on reconnect
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="wrap" style="width: 300px">
      <vf-slider id="s" value="50"></vf-slider>
      <vf-progress-bar id="p" value="50"></vf-progress-bar>
    </div>`)

  const initial = await counts(page)
  // 2 component-own observers plus the ONE shared grid-snap scheduler observer
  // (always-on; it watches documentElement and each host).
  check('one ResizeObserver per component plus the shared snap scheduler',
    initial.roCreated === 3, `${initial.roCreated} created`)
  // 2 tracks + the scheduler's documentElement + its 2 hosts.
  check('each track and host is observed exactly once',
    initial.roObserve === 5, `${initial.roObserve} observe() calls`)

  const idle = await delta(page, async () => {
    await rerender(page, 's', 4)
    await rerender(page, 'p', 4)
  })
  check('re-rendering does not re-observe the track',
    idle.roObserve === 0, `${idle.roObserve} extra observe() calls over 8 renders`)

  const railWidth = () =>
    page.evaluate(() => ({
      rail: document.getElementById('s').shadowRoot.querySelector('.rail')?.getAttribute('width'),
      fill: document.getElementById('p').shadowRoot.querySelector('.fill')?.getAttribute('style'),
    }))
  const setWidth = async (px) => {
    await page.evaluate((w) => { document.getElementById('wrap').style.width = `${w}px` }, px)
    await page.waitForTimeout(80)
    await settle(page)
  }

  await setWidth(300)
  const at300 = await railWidth()
  await setWidth(600)
  const at600 = await railWidth()
  check('the rail tracks the track width', at300.rail !== at600.rail, `${at300.rail} -> ${at600.rail}`)
  check('the progress fill tracks the track width', at300.fill !== at600.fill,
    `${at300.fill} -> ${at600.fill}`)

  // Disconnect + reconnect: the observer must be torn down and resumed, or the
  // geometry freezes at whatever width it had when it left the document.
  const cycle = await delta(page, async () => {
    await page.evaluate(() => {
      for (const id of ['s', 'p']) {
        const el = document.getElementById(id)
        const parent = el.parentElement
        el.remove()
        parent.appendChild(el)
      }
    })
  })
  check('disconnecting tears the observers down', cycle.roDisconnect === 2,
    `${cycle.roDisconnect} disconnect() calls`)
  // 2 tracks re-observed by the components, 2 hosts by the snap scheduler.
  check('reconnecting re-observes without creating a second observer',
    cycle.roObserve === 4 && cycle.roCreated === 0,
    `${cycle.roObserve} observe(), ${cycle.roCreated} created`)

  await setWidth(240)
  const afterCycle = await railWidth()
  check('the rail still tracks the width after a reconnect',
    afterCycle.rail !== at600.rail && afterCycle.rail !== at300.rail,
    `${afterCycle.rail} at 240 vs ${at300.rail} at 300`)
  check('the progress fill still tracks the width after a reconnect',
    afterCycle.fill !== at600.fill && afterCycle.fill !== at300.fill,
    `${afterCycle.fill}`)

  // A second cycle: the first can pass on an observer that was never actually
  // disconnected, since re-observing a live observer is idempotent.
  await page.evaluate(() => {
    for (const id of ['s', 'p']) {
      const el = document.getElementById(id)
      const parent = el.parentElement
      el.remove()
      parent.appendChild(el)
    }
  })
  await settle(page)
  await setWidth(420)
  const afterSecond = await railWidth()
  check('the rail tracks the width after a second reconnect',
    afterSecond.rail !== afterCycle.rail, `${afterCycle.rail} -> ${afterSecond.rail}`)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   AX helper — Chromium's computed tree, not our own attributes
   ──────────────────────────────────────────────────────────────────────── */
async function axNode(page, id) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const doc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const walk = (node, match) => {
    if (match(node)) return node
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
      const found = walk(child, match)
      if (found) return found
    }
    return null
  }
  const attr = (node, name) => {
    const a = node.attributes ?? []
    for (let i = 0; i < a.length; i += 2) if (a[i] === name) return a[i + 1]
    return null
  }
  const host = walk(doc.root, (n) => attr(n, 'id') === id)
  if (!host) return null
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId: host.nodeId,
    fetchRelatives: false,
  })
  const node = nodes.find((n) => n.role?.value && n.role.value !== 'generic')
  return node
    ? {
        role: node.role.value,
        name: node.name?.value ?? null,
        props: (node.properties ?? []).map((p) => `${p.name}=${p.value?.value}`).sort(),
      }
    : null
}

await report(browser)
