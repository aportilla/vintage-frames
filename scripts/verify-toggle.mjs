/**
 * Verifies `VfToggleControl` — the mixin vf-checkbox and vf-radio share for
 * their interaction skeleton (click/Space→activate + the auto-repeat guard),
 * their ARIA mirroring, and their self-managed host tabindex.
 *
 * The extraction was a pure refactor, so — as with verify:chrome — the
 * load-bearing checks assert the two controls behave *identically where they
 * are supposed to*, not merely that each is individually correct. That is the
 * check a future one-sided edit trips, which is the entire point of hoisting
 * the skeleton. Five groups:
 *
 *  - SHARED: the vfToggle layout metrics are equal BETWEEN the two controls.
 *  - SKELETON: click, Space, and *held* Space activate exactly once on both;
 *    a disabled control never activates, via the mixin's single gate.
 *  - CANCELLATION: `preventDefault()` in either phase stops the state change,
 *    the way it stops a native checkbox — the mixin defers its activation to
 *    the end of the click's propagation to make that possible. Includes the
 *    two cases that are easy to get backwards: `stopPropagation()` cancels
 *    nothing, and a control disabled mid-propagation must not act.
 *  - ARIA: role/checked/disabled read out of Chromium's real AX tree.
 *  - TABINDEX: the ownership latch, including the reconnect case that the
 *    extraction FIXED — a standalone radio used to stop self-managing after a
 *    disconnect/reconnect (our own `tabIndex = 0` write leaves a `tabindex`
 *    attribute that a per-connect re-test misreads as consumer-authored), so
 *    disabling it no longer removed it from the tab order. Checkbox latched
 *    ownership on first connect and was always correct; radio now matches.
 *  - DIVERGENT: the differences that MUST survive the shared skeleton —
 *    vf-checkbox is form-associated and vf-radio deliberately is not, and a
 *    grouped radio never self-checks (the group is the single source of truth).
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:toggle
 */
import { check, launch, makeBuild, report } from './harness.mjs'

/** Headless Chromium runs at dpr 1, so the default scale is 3/1. */
const S = 3

const browser = await launch()

/** Markup FIRST, module SECOND — the upgrade order verify:scale depends on. */
const build = makeBuild(browser)
const hostProps = (page, id, props) =>
  page.evaluate(
    ([hostId, wanted]) => {
      const cs = getComputedStyle(document.getElementById(hostId))
      return Object.fromEntries(wanted.map((p) => [p, cs.getPropertyValue(p)]))
    },
    [id, props]
  )

const partProps = (page, id, part, props) =>
  page.evaluate(
    ([hostId, sel, wanted]) => {
      const el = document.getElementById(hostId).shadowRoot.querySelector(`[part=${sel}]`)
      if (!el) return null
      const cs = getComputedStyle(el)
      const out = Object.fromEntries(wanted.map((p) => [p, cs.getPropertyValue(p)]))
      const r = el.getBoundingClientRect()
      out._w = +r.width.toFixed(2)
      out._h = +r.height.toFixed(2)
      return out
    },
    [id, part, props]
  )

/** Computed role/checked/disabled straight out of Chromium's AX tree. */
async function axNode(page, id) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('Accessibility.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: `#${id}`,
  })
  if (!nodeId) return null
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  })
  const n = nodes.find((x) => x.role?.value && x.ignored === false)
  if (!n) return { ignored: true }
  const prop = (name) => n.properties?.find((p) => p.name === name)?.value?.value ?? null
  return { role: n.role?.value ?? null, checked: prop('checked'), disabled: prop('disabled') }
}

/* ────────────────────────────────────────────────────────────────────────────
   1. SHARED — both toggles render the same vfToggle skeleton
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-checkbox id="cb">Label</vf-checkbox>
    <vf-radio id="rd" value="a">Label</vf-radio>
    <vf-checkbox id="cbOff" disabled>Label</vf-checkbox>
    <vf-radio id="rdOff" value="a" disabled>Label</vf-radio>
  `)

  const HOST = ['display', 'align-items', 'gap', 'cursor']
  const cbHost = await hostProps(page, 'cb', HOST)
  const rdHost = await hostProps(page, 'rd', HOST)
  for (const p of HOST) {
    check(`host ${p} identical across checkbox/radio`, cbHost[p] === rdHost[p],
      `${cbHost[p]} vs ${rdHost[p]}`)
  }
  check(`host gap is 6px x${S}`, cbHost.gap === `${6 * S}px`, cbHost.gap)
  check('host is inline-flex', cbHost.display === 'inline-flex', cbHost.display)

  // The well: 13x13 on both, the focus ring's target rather than the host.
  const cbBox = await partProps(page, 'cb', 'box', ['width', 'height'])
  const rdCircle = await partProps(page, 'rd', 'circle', ['width', 'height'])
  check(`checkbox box is 13x13 x${S}`, cbBox._w === 13 * S && cbBox._h === 13 * S,
    `${cbBox._w}x${cbBox._h}`)
  check('radio circle matches the checkbox box',
    rdCircle._w === cbBox._w && rdCircle._h === cbBox._h,
    `${rdCircle._w}x${rdCircle._h}`)

  // Disabled dims the LABEL on both; the 1-bit chrome stays black (SPEC §1).
  const cbLabelOn = await partProps(page, 'cb', 'label', ['color'])
  const rdLabelOn = await partProps(page, 'rd', 'label', ['color'])
  const cbLabelOff = await partProps(page, 'cbOff', 'label', ['color'])
  const rdLabelOff = await partProps(page, 'rdOff', 'label', ['color'])
  check('enabled label color identical across checkbox/radio',
    cbLabelOn.color === rdLabelOn.color, `${cbLabelOn.color} vs ${rdLabelOn.color}`)
  check('disabled label color identical across checkbox/radio',
    cbLabelOff.color === rdLabelOff.color, `${cbLabelOff.color} vs ${rdLabelOff.color}`)
  check('disabled label actually dims', cbLabelOff.color !== cbLabelOn.color,
    `${cbLabelOn.color} -> ${cbLabelOff.color}`)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2. SKELETON — click / Space / held Space, and the single disabled gate
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-checkbox id="cb">A</vf-checkbox>
    <vf-radio id="rd" value="solo">B</vf-radio>
    <vf-checkbox id="cbOff" disabled>C</vf-checkbox>
    <vf-radio id="rdOff" value="off" disabled>D</vf-radio>
  `)
  await page.evaluate(() => {
    window.__ev = []
    document.addEventListener('vf-change', (e) =>
      window.__ev.push({ id: e.target.id, detail: e.detail, bubbles: e.bubbles, composed: e.composed })
    )
  })
  const drain = () => page.evaluate(() => window.__ev.splice(0))
  const checkedOf = (id) =>
    page.evaluate((i) => document.getElementById(i).checked, id)

  await page.click('#cb')
  let ev = await drain()
  check('click activates checkbox (1 event)', ev.length === 1 && (await checkedOf('cb')) === true,
    JSON.stringify(ev))
  check('checkbox vf-change bubbles + composed', ev[0]?.bubbles === true && ev[0]?.composed === true)

  await page.click('#rd')
  ev = await drain()
  check('click activates radio (1 event)', ev.length === 1 && (await checkedOf('rd')) === true,
    JSON.stringify(ev))
  check('radio vf-change bubbles + composed', ev[0]?.bubbles === true && ev[0]?.composed === true)

  // Focus lands on the control itself — both activate() paths call focus().
  check('activation focuses the control',
    (await page.evaluate(() => document.activeElement?.id)) === 'rd')

  await page.focus('#cb')
  await page.keyboard.press(' ')
  ev = await drain()
  check('Space activates checkbox (1 event)', ev.length === 1, JSON.stringify(ev))

  // Held Space: three keydowns, the 2nd/3rd carrying repeat=true.
  await page.keyboard.down(' ')
  await page.keyboard.down(' ')
  await page.keyboard.down(' ')
  await page.keyboard.up(' ')
  ev = await drain()
  check('held Space activates checkbox exactly once', ev.length === 1, `${ev.length} events`)

  await page.focus('#rd')
  await page.keyboard.down(' ')
  await page.keyboard.down(' ')
  await page.keyboard.up(' ')
  ev = await drain()
  check('held Space on an already-selected radio never re-fires', ev.length === 0,
    `${ev.length} events`)

  // The mixin's single gate: a disabled toggle never activates, either input.
  await page.click('#cbOff', { force: true })
  check('disabled checkbox ignores click',
    (await drain()).length === 0 && (await checkedOf('cbOff')) === false)
  await page.click('#rdOff', { force: true })
  check('disabled radio ignores click',
    (await drain()).length === 0 && (await checkedOf('rdOff')) === false)

  await page.evaluate(() => {
    const e = document.getElementById('cbOff')
    e.focus()
    e.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    const r = document.getElementById('rdOff')
    r.focus()
    r.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
  })
  check('disabled toggles ignore Space (both)', (await drain()).length === 0)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2b. CANCELLATION — preventDefault() stops the state change, as on a native
       checkbox. The mixin registers its click listener in the constructor, so
       it is first in the host's own listener list and used to beat every
       consumer listener; nothing read `defaultPrevented` either, so not even a
       capture-phase cancel landed. Both controls, both phases.
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-checkbox id="cbBub">A</vf-checkbox>
    <vf-radio id="rdBub" value="bub">B</vf-radio>
    <vf-checkbox id="cbCap">C</vf-checkbox>
    <vf-radio id="rdCap" value="cap">D</vf-radio>
    <vf-checkbox id="cbStop">E</vf-checkbox>
    <vf-checkbox id="cbKey">F</vf-checkbox>
    <vf-checkbox id="cbLive">G</vf-checkbox>
    <vf-checkbox id="cbFree">H</vf-checkbox>
  `)

  const out = await page.evaluate(async () => {
    const r = {}
    const settle = async (el) => {
      // stopPropagation() routes the action through a task, never a microtask.
      await new Promise((res) => setTimeout(res, 0))
      await el.updateComplete
      return el.checked
    }

    // Bubble phase, on the host itself.
    for (const id of ['cbBub', 'rdBub']) {
      const el = document.getElementById(id)
      el.addEventListener('click', (e) => e.preventDefault())
      el.click()
      r[id] = await settle(el)
    }

    // Capture phase, from an ancestor — the only spelling that used to work.
    for (const id of ['cbCap', 'rdCap']) {
      const el = document.getElementById(id)
      document.addEventListener(
        'click',
        (e) => {
          if (e.target === el) e.preventDefault()
        },
        { capture: true }
      )
      el.click()
      r[id] = await settle(el)
    }

    // stopPropagation() cancels NOTHING in HTML — a native control still acts.
    // The event never reaches the window, so the fallback task has to pick it up.
    const stop = document.getElementById('cbStop')
    stop.addEventListener('click', (e) => e.stopPropagation())
    stop.click()
    r.cbStop = await settle(stop)

    // Space synthesises a click, so it inherits the same cancellation.
    const key = document.getElementById('cbKey')
    key.addEventListener('click', (e) => e.preventDefault())
    key.focus()
    key.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    r.cbKey = await settle(key)

    // Disabled DURING propagation: the gate is at the far end of the deferral,
    // so the state that decides is the one when the action runs.
    const live = document.getElementById('cbLive')
    live.addEventListener('click', () => {
      live.disabled = true
    })
    live.click()
    r.cbLive = await settle(live)

    // Control: nothing cancels, so it still activates.
    const free = document.getElementById('cbFree')
    free.click()
    r.cbFree = await settle(free)
    return r
  })

  check('bubble-phase preventDefault() on the host cancels the checkbox', out.cbBub === false, `checked=${out.cbBub}`)
  check('bubble-phase preventDefault() on the host cancels the radio', out.rdBub === false, `checked=${out.rdBub}`)
  check('capture-phase preventDefault() cancels the checkbox', out.cbCap === false, `checked=${out.cbCap}`)
  check('capture-phase preventDefault() cancels the radio', out.rdCap === false, `checked=${out.rdCap}`)
  check('stopPropagation() cancels nothing — it still activates', out.cbStop === true, `checked=${out.cbStop}`)
  check('Space follows click: preventDefault() cancels it too', out.cbKey === false, `checked=${out.cbKey}`)
  check('disabling mid-propagation stops the activation', out.cbLive === false, `checked=${out.cbLive}`)
  check('uncancelled click still activates (control)', out.cbFree === true, `checked=${out.cbFree}`)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   3. ARIA — the mirroring the mixin now owns, read from the real AX tree
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-checkbox id="cb">A</vf-checkbox>
    <vf-checkbox id="cbOn" checked>B</vf-checkbox>
    <vf-checkbox id="cbOff" disabled>C</vf-checkbox>
    <vf-radio id="rd" value="a">D</vf-radio>
    <vf-radio id="rdOn" value="a" checked>E</vf-radio>
    <vf-radio id="rdOff" value="a" disabled>F</vf-radio>
  `)
  check('checkbox exposes role=checkbox', (await axNode(page, 'cb')).role === 'checkbox')
  check('radio exposes role=radio', (await axNode(page, 'rd')).role === 'radio')
  check('checkbox aria-checked mirrors state',
    (await axNode(page, 'cb')).checked === 'false' &&
      (await axNode(page, 'cbOn')).checked === 'true')
  check('radio aria-checked mirrors state',
    (await axNode(page, 'rd')).checked === 'false' &&
      (await axNode(page, 'rdOn')).checked === 'true')
  check('checkbox aria-disabled mirrors state', (await axNode(page, 'cbOff')).disabled === true)
  check('radio aria-disabled mirrors state', (await axNode(page, 'rdOff')).disabled === true)

  // Live update, not just first paint.
  await page.evaluate(async () => {
    const e = document.getElementById('cb')
    e.checked = true
    await e.updateComplete
  })
  check('checkbox aria-checked follows a runtime change',
    (await axNode(page, 'cb')).checked === 'true')
  await page.evaluate(async () => {
    const e = document.getElementById('rd')
    e.checked = true
    await e.updateComplete
  })
  check('radio aria-checked follows a runtime change',
    (await axNode(page, 'rd')).checked === 'true')

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4. TABINDEX — the ownership latch (incl. the reconnect case this pass fixed)
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-checkbox id="cb">A</vf-checkbox>
    <vf-radio id="rd" value="a">B</vf-radio>
    <vf-checkbox id="cbFixed" tabindex="-1">C</vf-checkbox>
    <vf-radio id="rdFixed" value="a" tabindex="-1">D</vf-radio>
    <vf-radio-group id="grp" value="a">
      <vf-radio id="ga" value="a">A</vf-radio>
      <vf-radio id="gb" value="b">B</vf-radio>
    </vf-radio-group>
    <div id="parking"></div>
  `)

  const log = await page.evaluate(async () => {
    const el = (id) => document.getElementById(id)
    const out = {}
    const settle = (e) => e.updateComplete

    for (const id of ['cb', 'rd', 'cbFixed', 'rdFixed', 'ga', 'gb']) {
      out[`${id}.initial`] = el(id).tabIndex
    }
    for (const id of ['cb', 'rd', 'cbFixed', 'rdFixed']) {
      const e = el(id)
      e.disabled = true
      await settle(e)
      out[`${id}.disabled`] = e.tabIndex
      e.disabled = false
      await settle(e)
      out[`${id}.reenabled`] = e.tabIndex
    }
    // Disconnect → reconnect → disable: ownership must survive the round trip.
    for (const id of ['cb', 'rd']) {
      const e = el(id)
      const parent = e.parentNode
      const next = e.nextSibling
      e.remove()
      await new Promise((r) => requestAnimationFrame(r))
      parent.insertBefore(e, next)
      await settle(e)
      out[`${id}.reconnected`] = e.tabIndex
      e.disabled = true
      await settle(e)
      out[`${id}.reconnectedDisabled`] = e.tabIndex
      e.disabled = false
      await settle(e)
    }
    // Re-parenting in and out of a group flips who owns the tab stop.
    const moved = el('gb')
    el('parking').appendChild(moved)
    await settle(moved)
    out['gb.outOfGroup'] = moved.tabIndex
    moved.disabled = true
    await settle(moved)
    out['gb.outOfGroupDisabled'] = moved.tabIndex
    moved.disabled = false
    await settle(moved)

    const lone = el('rd')
    el('grp').appendChild(lone)
    await settle(lone)
    await settle(el('grp'))
    out['rd.intoGroup'] = lone.tabIndex
    return out
  })

  check('checkbox is focusable by default', log['cb.initial'] === 0, `${log['cb.initial']}`)
  check('standalone radio is focusable by default', log['rd.initial'] === 0, `${log['rd.initial']}`)
  check('disabled leaves the tab order (both)',
    log['cb.disabled'] === -1 && log['rd.disabled'] === -1,
    `cb=${log['cb.disabled']} rd=${log['rd.disabled']}`)
  check('re-enabling restores the tab stop (both)',
    log['cb.reenabled'] === 0 && log['rd.reenabled'] === 0,
    `cb=${log['cb.reenabled']} rd=${log['rd.reenabled']}`)
  check('a consumer tabindex is never clobbered (both)',
    log['cbFixed.initial'] === -1 && log['rdFixed.initial'] === -1 &&
      log['cbFixed.reenabled'] === -1 && log['rdFixed.reenabled'] === -1,
    `cb=${log['cbFixed.reenabled']} rd=${log['rdFixed.reenabled']}`)
  check('ownership survives a reconnect (both focusable again)',
    log['cb.reconnected'] === 0 && log['rd.reconnected'] === 0,
    `cb=${log['cb.reconnected']} rd=${log['rd.reconnected']}`)
  // ↓ THE FIX: pre-extraction, rd.reconnectedDisabled was 0 — the radio had
  //   silently stopped self-managing and stayed in the tab order while disabled.
  check('disabling after a reconnect still leaves the tab order (both)',
    log['cb.reconnectedDisabled'] === -1 && log['rd.reconnectedDisabled'] === -1,
    `cb=${log['cb.reconnectedDisabled']} rd=${log['rd.reconnectedDisabled']}`)
  check('the group owns its children’s roving tab stop',
    log['ga.initial'] === 0 && log['gb.initial'] === -1,
    `ga=${log['ga.initial']} gb=${log['gb.initial']}`)
  check('a radio moved OUT of a group self-manages again',
    log['gb.outOfGroup'] === 0 && log['gb.outOfGroupDisabled'] === -1,
    `${log['gb.outOfGroup']} / ${log['gb.outOfGroupDisabled']}`)
  check('a radio moved INTO a group stands down', log['rd.intoGroup'] === -1,
    `${log['rd.intoGroup']}`)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. DIVERGENT — what the shared skeleton must NOT have unified
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <form id="f">
      <vf-checkbox id="cb" name="cb" value="yes" checked>A</vf-checkbox>
      <vf-checkbox id="cbOff" name="cbOff" value="yes" checked disabled>B</vf-checkbox>
      <vf-radio id="rd" value="lone">C</vf-radio>
      <vf-radio-group id="grp" name="grp" value="a">
        <vf-radio id="ga" value="a">A</vf-radio>
        <vf-radio id="gb" value="b">B</vf-radio>
      </vf-radio-group>
    </form>
    <fieldset id="fs" disabled style="border:0;padding:0;margin:0">
      <vf-checkbox id="fsCb">D</vf-checkbox>
      <vf-radio id="fsRd" value="x">E</vf-radio>
    </fieldset>
  `)

  const assoc = await page.evaluate(() => ({
    cb: document.getElementById('cb').constructor.formAssociated ?? false,
    rd: document.getElementById('rd').constructor.formAssociated ?? false,
  }))
  check('vf-checkbox stays form-associated', assoc.cb === true)
  check('vf-radio stays NON-form-associated', assoc.rd === false)

  const entries = await page.evaluate(() =>
    [...new FormData(document.getElementById('f')).entries()]
  )
  check('checked checkbox submits its value',
    entries.some(([k, v]) => k === 'cb' && v === 'yes'), JSON.stringify(entries))
  check('disabled checkbox submits nothing', !entries.some(([k]) => k === 'cbOff'))
  check('a lone radio submits nothing', !entries.some(([k]) => k === 'lone' || k === 'rd'))
  check('the group submits on the radios’ behalf',
    entries.some(([k, v]) => k === 'grp' && v === 'a'))

  // An ancestor <fieldset disabled> reaches the form-associated checkbox only.
  const fs = await page.evaluate(() => ({
    cbTab: document.getElementById('fsCb').tabIndex,
    rdTab: document.getElementById('fsRd').tabIndex,
  }))
  check('fieldset[disabled] disables the checkbox (formDisabledCallback)', fs.cbTab === -1,
    `${fs.cbTab}`)
  check('fieldset[disabled] does NOT reach the non-form-associated radio', fs.rdTab === 0,
    `${fs.rdTab}`)

  // Selection ownership: a grouped radio must not self-check.
  await page.evaluate(() => {
    window.__ev = []
    document.addEventListener('vf-change', (e) => window.__ev.push(e.target.id))
  })
  await page.click('#gb')
  const grouped = await page.evaluate(() => ({
    ga: document.getElementById('ga').checked,
    gb: document.getElementById('gb').checked,
    value: document.getElementById('grp').value,
  }))
  check('clicking a grouped radio leaves exactly one checked',
    grouped.gb === true && grouped.ga === false && grouped.value === 'b',
    JSON.stringify(grouped))

  await page.click('#gb')
  const again = await page.evaluate(() => window.__ev.length)
  check('re-clicking the selected radio does not re-fire', again === 2, `${again} events total`)

  // …while a standalone radio still toggles itself visually.
  await page.click('#rd')
  check('a standalone radio still self-checks',
    (await page.evaluate(() => document.getElementById('rd').checked)) === true)

  // A checkbox, unlike a radio, activates when already checked (it toggles off).
  await page.click('#cb')
  check('an already-checked checkbox toggles off',
    (await page.evaluate(() => document.getElementById('cb').checked)) === false)

  await page.close()
}

await report(browser)
