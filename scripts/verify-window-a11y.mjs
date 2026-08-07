/**
 * Verifies the window/desktop AT cluster (ACCESSIBILITY-REVIEW §4.4, §8.3,
 * §9.3, §9.4): windows and the desktop as assistive-technology citizens.
 *
 *  - §9.3 NO BANNERS: the title bar is a <div>, not a <header> — a bare
 *    <header> maps to the `banner` landmark even inside a shadow root, so
 *    every window and dialog used to publish an unnamed banner to landmark
 *    navigation. The full AX tree must contain zero.
 *  - §9.4 NAMED FRAMES: a window's frame is `role="group"` named by its title
 *    patch (aria-labelledby), the way vf-dialog's <dialog> already is — group
 *    rather than region deliberately, so a desktop of windows doesn't pollute
 *    the landmark list. The utility windoid's title patch is display:none and
 *    must still name it (AccName resolves hidden labelledby targets).
 *  - §4.4 REACHABLE WHEN INACTIVE: an inactive window draws no widgets
 *    (transparent ink — the bare System 7 bar) but keeps them in the tree and
 *    the tab order, so Tab can land on "Close Bravo", the desktop's focusin
 *    raise activates the window under the arriving focus, and a static-body
 *    background window can be closed by keyboard end to end.
 *  - §8.3 DOM ORDER FOLLOWS Z: raising a window re-orders the slotted windows
 *    (bottom-most first) at pointer-gesture end, so sequential focus order
 *    matches the visual stack and Shift+Tab mirrors Tab exactly. Deferred
 *    while a pointer is down (a DOM move would clear the drag's pointer
 *    capture); never run from a focus-driven raise (moving the window focus
 *    just entered would re-order the sequence mid-traversal); focus surviving
 *    its own window's move is restored without re-raising its window.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:window-a11y
 */
import { attr, check, launch, makeBuild, results, walk } from './harness.mjs'

const browser = await launch()

const build = makeBuild(browser)

/** The AX node computed for a shadow part of a vf-* host, via CDP. */
async function axForPart(page, cdp, hostId, partName) {
  const doc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const host = walk(doc.root, (n) => attr(n, 'id') === hostId)
  const el = host && walk(host, (n) => attr(n, 'part') === partName)
  if (!el) return null
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId: el.nodeId,
    fetchRelatives: false,
  })
  return nodes[0] ?? null
}

/** id-or-part label of the innermost focused element, for traversal logs. */
const STOP_LABEL = `(() => {
  let el = document.activeElement
  let host = null
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    host = el
    el = el.shadowRoot.activeElement
  }
  if (!el || el === document.body) return 'body'
  if (host) return host.id + ':' + (el.getAttribute('part') ?? el.tagName.toLowerCase())
  return el.id || el.tagName.toLowerCase()
})()`

/** DOM order of the desktop's slotted windows, by id. */
const WINDOW_ORDER = `[...document.getElementById('desk').children]
  .filter((el) => el.tagName === 'VF-WINDOW').map((el) => el.id)`

/* ────────────────────────────────────────────────────────────────────────────
   1. §9.3 — zero banner landmarks; §9.4 — the frame is a named group
   ──────────────────────────────────────────────────────────────────────── */
{
  // No open modal on this page: an open <dialog> makes everything else inert,
  // and inert nodes are AX-ignored — which would hollow out both the banner
  // scan and the group checks. The dialog gets its own page below.
  const page = await build(`
    <vf-desktop id="desk" style="height:600px">
      <vf-window id="w1" heading="Alpha" closable zoomable
        style="width:260px;height:140px"><p>Body</p></vf-window>
      <vf-window id="w2" heading="Bravo" closable
        style="width:260px;height:140px"><p>Body</p></vf-window>
      <vf-window id="pal" heading="Tools" variant="utility" closable
        style="width:180px;height:120px"><p>Palette</p></vf-window>
      <vf-window id="untitled" closable
        style="width:260px;height:140px"><p>Body</p></vf-window>
    </vf-desktop>
  `)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')

  const { nodes: all } = await cdp.send('Accessibility.getFullAXTree')
  const banners = all.filter((n) => n.role?.value === 'banner')
  check('no window publishes a banner landmark',
    banners.length === 0, `${banners.length} banner nodes`)

  const frame = await axForPart(page, cdp, 'w1', 'frame')
  check('window frame computes role=group', frame?.role?.value === 'group',
    frame?.role?.value ?? 'no node')
  check('…named by its title patch', frame?.name?.value === 'Alpha',
    frame?.name?.value ?? 'no name')

  const utility = await axForPart(page, cdp, 'pal', 'frame')
  check('utility windoid is named through its hidden title patch',
    utility?.role?.value === 'group' && utility?.name?.value === 'Tools',
    `${utility?.role?.value}/${utility?.name?.value}`)

  await page.evaluate(() => {
    document.getElementById('w1').heading = 'Renamed'
  })
  await page.evaluate(() => document.getElementById('w1').updateComplete)
  const renamed = await axForPart(page, cdp, 'w1', 'frame')
  check('the group name tracks a heading change', renamed?.name?.value === 'Renamed',
    renamed?.name?.value ?? 'no name')

  const bare = await page.evaluate(() =>
    document.getElementById('untitled').shadowRoot
      .querySelector('[part=frame]').getAttribute('aria-labelledby')
  )
  check('an untitled window points aria-labelledby at nothing (unnamed group, not an empty IDREF)',
    bare === null, String(bare))

  await page.close()
}
{
  // The dialog's page: the open modal is the one non-inert subtree, so its
  // own would-be banner (the old <header> bar) is exactly what the scan sees.
  const page = await build(`
    <vf-dialog id="dlg" heading="Save Changes" width="200" height="120" open>
      <p>Body</p>
    </vf-dialog>
  `)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const { nodes: all } = await cdp.send('Accessibility.getFullAXTree')
  const banners = all.filter((n) => n.role?.value === 'banner')
  check('an open dialog publishes no banner landmark either',
    banners.length === 0, `${banners.length} banner nodes`)
  const dlg = all.find((n) => n.role?.value === 'dialog')
  check('the dialog still computes its name off the (now div) title bar',
    dlg?.name?.value === 'Save Changes', dlg?.name?.value ?? 'no dialog node')
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2. §4.4 — a background window is reachable, activated, and closable by
      keyboard; its unpainted widgets are still real AX nodes
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <button id="before">before</button>
    <vf-desktop id="desk" style="height:600px">
      <vf-window id="w1" heading="Behind" closable zoomable
        style="width:260px;height:140px"><p>Static text only</p></vf-window>
      <vf-window id="w2" heading="Front" closable
        style="width:260px;height:140px"><p>Static text only</p></vf-window>
    </vf-desktop>
  `)
  // Slot seeding makes the last window (w2) topmost and active; w1 is the
  // background window, and its body holds nothing focusable — the exact
  // shape that used to be unreachable by keyboard entirely.
  const state = await page.evaluate(() => ({
    w1: document.getElementById('w1').hasAttribute('active'),
    w2: document.getElementById('w2').hasAttribute('active'),
  }))
  check('fixture: w2 is the active window, w1 the background one',
    !state.w1 && state.w2, JSON.stringify(state))

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const inactiveBox = await axForPart(page, cdp, 'w1', 'close-box')
  check('the inactive close box is a real AX button (not display:none-dropped)',
    inactiveBox?.role?.value === 'button' && !inactiveBox?.ignored,
    `${inactiveBox?.role?.value}, ignored ${inactiveBox?.ignored}`)
  check('…with the heading-qualified name', inactiveBox?.name?.value === 'Close Behind',
    inactiveBox?.name?.value ?? 'no name')

  // Tab from outside: the first stop inside the desktop must be the
  // background window's close box — and landing there must activate it.
  await page.evaluate(() => document.getElementById('before').focus())
  await page.keyboard.press('Tab')
  const landed = await page.evaluate(STOP_LABEL)
  check('Tab reaches the background window\'s close box', landed === 'w1:close-box', landed)

  const after = await page.evaluate(() => {
    const w1 = document.getElementById('w1')
    const box = w1.shadowRoot.querySelector('[part=close-box]')
    const cs = getComputedStyle(box)
    return {
      w1Active: w1.hasAttribute('active'),
      w2Active: document.getElementById('w2').hasAttribute('active'),
      border: cs.borderTopColor,
      stripes: getComputedStyle(w1.shadowRoot.querySelector('.vf-stripes')).display,
    }
  })
  check('…which activates the window (focusin raise)', after.w1Active && !after.w2Active,
    JSON.stringify(after))
  check('…and repaints its widgets and stripes under the arriving focus',
    after.border === 'rgb(0, 0, 0)' && after.stripes !== 'none',
    `border ${after.border}, stripes ${after.stripes}`)

  // Close it: Enter on the focused (native button) close box fires vf-close.
  const closed = page.evaluate(() =>
    new Promise((resolve) => {
      document.getElementById('w1').addEventListener(
        'vf-close', (e) => resolve(e.detail), { once: true })
    })
  )
  await page.keyboard.press('Enter')
  check('Enter on it fires vf-close — a static-body window is closable by keyboard',
    (await closed).reason === 'close', JSON.stringify(await closed))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   3. §8.3 — DOM order follows z-order at pointer-gesture end (deferred while
      the pointer is down), and a background window still drags in the same
      gesture that raises it (the capture must survive)
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-desktop id="desk" style="height:600px">
      <div id="bar">not a window</div>
      <vf-window id="w1" heading="Alpha" movable style="width:260px;height:140px"><p>B</p></vf-window>
      <vf-window id="w2" heading="Bravo" movable style="width:260px;height:140px"><p>B</p></vf-window>
    </vf-desktop>
  `)
  // w2 seeded topmost; DOM [w1, w2] already matches z. Press w1's body and
  // hold: it raises (z + active) but the DOM must not move under the pointer.
  const w1Body = await page.evaluate(() => {
    const r = document.getElementById('w1').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.8 }
  })
  await page.mouse.move(w1Body.x, w1Body.y)
  await page.mouse.down()
  const held = await page.evaluate(`({
    order: ${WINDOW_ORDER},
    active: document.getElementById('w1').hasAttribute('active'),
    z1: +document.getElementById('w1').style.zIndex,
    z2: +document.getElementById('w2').style.zIndex,
  })`)
  check('mid-press: the raise is live (z, active) but the DOM has not moved',
    held.active && held.z1 > held.z2 && held.order.join() === 'w1,w2',
    JSON.stringify(held))
  await page.mouse.up()
  const released = await page.evaluate(WINDOW_ORDER)
  check('on release the DOM re-orders to match the stack (bottom-most first)',
    released.join() === 'w2,w1', released.join())
  const barFirst = await page.evaluate(
    () => document.getElementById('desk').children[0].id
  )
  check('non-window desktop content keeps its position', barFirst === 'bar', barFirst)

  // Drag the (now background) w2 by its title bar, fast enough that the
  // pointer leaves the bar between events: only a surviving pointer capture
  // keeps the drag alive, which is why the DOM sync must wait for pointerup.
  const bar2 = await page.evaluate(() => {
    const b = document.getElementById('w2').shadowRoot
      .querySelector('[part=title-bar]').getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.move(bar2.x, bar2.y)
  await page.mouse.down()
  await page.mouse.move(bar2.x + 200, bar2.y + 150, { steps: 2 })
  await page.mouse.up()
  // The origin is stated in system px (PlacementController), so compare in the
  // unit the gesture was measured in: CSS px = system px x the scale in force.
  const dragged = await page.evaluate(`({
    left: (document.getElementById('w2').left || 0) * ${'parseFloat(getComputedStyle(document.getElementById("w2")).getPropertyValue("--vf-scale"))'},
    top: (document.getElementById('w2').top || 0) * ${'parseFloat(getComputedStyle(document.getElementById("w2")).getPropertyValue("--vf-scale"))'},
    order: ${WINDOW_ORDER},
  })`)
  check('a background window raises AND drags in one gesture (capture survives)',
    dragged.left >= 190 && dragged.top >= 140, `${dragged.left},${dragged.top}`)
  check('…and the DOM order is synced after that gesture too',
    dragged.order.join() === 'w1,w2', dragged.order.join())
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4. §8.3 — focus survives its own window's move without re-raising it, and
      §4.4 means deactivation never drops focus to <body>
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-desktop id="desk" style="height:600px">
      <vf-window id="w1" heading="Alpha" closable style="width:220px;height:120px"><p>B</p></vf-window>
      <vf-window id="w2" heading="Bravo" closable style="width:220px;height:120px"><p>B</p></vf-window>
      <vf-window id="w3" heading="Charlie" closable movable style="width:220px;height:120px"><p>B</p></vf-window>
    </vf-desktop>
  `)
  // Keyboard-raise w1 (focus its close box): z changes, DOM deliberately
  // doesn't — a focus-driven raise must never move nodes mid-traversal.
  await page.evaluate(() => {
    document.getElementById('w1').shadowRoot.querySelector('[part=close-box]').focus()
  })
  const raised = await page.evaluate(`({
    order: ${WINDOW_ORDER},
    active: document.getElementById('w1').hasAttribute('active'),
  })`)
  check('a focus-driven raise changes z/active but never DOM order',
    raised.active && raised.order.join() === 'w1,w2,w3', JSON.stringify(raised))

  // Now press w3's title bar. The drag preventDefault keeps focus where it
  // is; at gesture end the sync must move w1 (which HOLDS focus) after w2 —
  // and the focus restore must not re-raise w1 over w3.
  const bar3 = await page.evaluate(() => {
    const b = document.getElementById('w3').shadowRoot
      .querySelector('[part=title-bar]').getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.move(bar3.x, bar3.y)
  await page.mouse.down()
  await page.mouse.up()
  const end = await page.evaluate(`({
    order: ${WINDOW_ORDER},
    stop: ${STOP_LABEL},
    w1Active: document.getElementById('w1').hasAttribute('active'),
    w3Active: document.getElementById('w3').hasAttribute('active'),
    z1: +document.getElementById('w1').style.zIndex,
    z3: +document.getElementById('w3').style.zIndex,
  })`)
  check('the gesture-end sync moves the focus-holding window into stack order',
    end.order.join() === 'w2,w1,w3', end.order.join())
  check('focus survives its own window\'s move (not dropped to <body>)',
    end.stop === 'w1:close-box', end.stop)
  check('…without re-raising that window over the one just clicked',
    end.w3Active && !end.w1Active && end.z3 > end.z1,
    `active w1=${end.w1Active} w3=${end.w3Active}, z ${end.z1}/${end.z3}`)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. §8.3 + §4.4 — the traversal is symmetric (the review measured 3 stops
      forward, 7 in reverse), and the utility tier sorts after the document
      tier in the DOM as it does in z
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <button id="before">before</button>
    <vf-desktop id="desk" style="height:600px">
      <vf-window id="w1" heading="Alpha" closable zoomable
        style="width:260px;height:140px"><button id="a1">a1</button></vf-window>
      <vf-window id="w2" heading="Bravo" closable zoomable
        style="width:260px;height:140px"><button id="b1">b1</button></vf-window>
    </vf-desktop>
    <button id="after">after</button>
  `)
  const sweep = async (key, from, until) => {
    await page.evaluate(
      (id) => document.getElementById(id).focus(), from)
    const stops = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(key)
      const label = await page.evaluate(STOP_LABEL)
      if (label === until || label === 'body') break
      stops.push(label)
    }
    return stops
  }
  const forward = await sweep('Tab', 'before', 'after')
  const reverse = await sweep('Shift+Tab', 'after', 'before')
  check('forward Tab visits every stop in both windows',
    forward.join() === 'w1:close-box,w1:zoom-box,a1,w2:close-box,w2:zoom-box,b1',
    forward.join())
  check('Shift+Tab is its exact mirror (the review measured 3 vs 7 here)',
    reverse.join() === [...forward].reverse().join(), reverse.join())
  await page.close()
}
{
  const page = await build(`
    <vf-desktop id="desk" style="height:600px">
      <vf-window id="pal" heading="Tools" variant="utility"
        style="width:180px;height:120px"><p>P</p></vf-window>
      <vf-window id="w1" heading="Alpha" style="width:220px;height:120px"><p>B</p></vf-window>
      <vf-window id="w2" heading="Bravo" style="width:220px;height:120px"><p>B</p></vf-window>
    </vf-desktop>
  `)
  await page.evaluate(() => {
    const desk = document.getElementById('desk')
    desk.bringToFront(document.getElementById('w1'))
  })
  const order = await page.evaluate(WINDOW_ORDER)
  check('a programmatic raise syncs immediately, floating tier last in the DOM',
    order.join() === 'w2,w1,pal', order.join())
  const palActive = await page.evaluate(
    () => document.getElementById('pal').hasAttribute('active')
  )
  check('the palette rides the sort without losing its active state', palActive)
  await page.close()
}

await browser.close()

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
