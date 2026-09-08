/**
 * Verifies the Finder drag — what a `vf-icon` drag reports and what the page
 * can do with it — plus `vf-icon-field`, `target`, `placementAt` and the
 * re-measure a moved child triggers.
 *
 * Groups:
 *
 *  - EVENTS: a press with no lattice step fires nothing; the first step fires
 *    vf-drag-start then vf-drag; the release fires one cancelable vf-drop
 *    with the pointer, whole system px on the lattice, and the outline's
 *    origin (the frame's box plus the delta); a drop cancelled with
 *    preventDefault() leaves left/top untouched; uncancelled, the position is
 *    the proposal, clamped whole when it ran past the edge.
 *  - CANCEL: Escape mid-drag fires vf-drag-cancel, no vf-drop, and writes
 *    nothing; pointercancel the same; the Escape never reaches an enclosing
 *    dialog.
 *  - REPARENT: an icon filed into another field inside the vf-drop handler
 *    is still selected, and a press outside then deselects it — the
 *    outside-press listener survives the re-parent.
 *  - TOUCH: the frame's computed touch-action is none when movable.
 *  - FIELD: through the accessibility tree, a vf-icon-field is a
 *    multiselectable listbox named from `label`, its selectable icons are
 *    options with aria-selected, a consumer role on the tag wins, `size` on
 *    the field drives every icon's art, an unplaced field is a zero-height
 *    block whose placed icons anchor to the desktop's raster, and a placed
 *    and sized field is the anchor.
 *  - TARGET: the art's filter with and without `color`, the plate untouched,
 *    no aria-selected, and a press elsewhere clears nothing.
 *  - PLACEMENT AT: a scrolled `scrollbars="both"` window, a plain window, a
 *    bezeled desktop and a bare scroll area each convert a child's own rect
 *    corner back into that child's `left`/`top`.
 *  - RE-MEASURE: a placed icon in a `scrollbars="both"` window nudged (and
 *    set) past the viewport flips the viewport's data-overflow-y with no box
 *    resizing; `vf-window.measure()` reaches the same attribute.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:icon-drag
 */
import { check, launch, makeBuild, report } from './harness.mjs'

/** A solid 32×32 square stands in for art: the cell is reserved, not measured. */
const ART32 =
  'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27%3E%3Crect width=%2732%27 height=%2732%27 fill=%27%23000%27/%3E%3C/svg%3E'
const ART16 =
  'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27%3E%3Crect width=%2716%27 height=%2716%27 fill=%27%23000%27/%3E%3C/svg%3E'

const browser = await launch()
const build = makeBuild(browser, { bodyStyle: 'margin:0;padding:40px' })

const icon = (attrs = '', label = 'Read Me') =>
  `<vf-icon label="${label}" ${attrs}>
     <vf-img slot="large"><img src="${ART32}" alt=""></vf-img>
     <vf-img slot="small"><img src="${ART16}" alt=""></vf-img>
   </vf-icon>`

/** Record every drag event reaching the document, in order. */
const record = (page) =>
  page.evaluate(() => {
    globalThis.__log = []
    for (const type of ['vf-drag-start', 'vf-drag', 'vf-drop', 'vf-drag-cancel']) {
      document.addEventListener(type, (e) => {
        globalThis.__log.push({
          type,
          id: e.target.id,
          detail: e.detail,
          cancelable: e.cancelable,
          bubbles: e.bubbles,
          composed: e.composed,
        })
      })
    }
  })
const log = (page) => page.evaluate(() => globalThis.__log)
const clearLog = (page) => page.evaluate(() => void (globalThis.__log = []))

/** The icon's placement, its frame box in CSS px, and the scale in force. */
const state = (page, id) =>
  page.evaluate((i) => {
    const el = document.getElementById(i)
    const f = el.shadowRoot.querySelector('.frame').getBoundingClientRect()
    return {
      left: el.left,
      top: el.top,
      x: f.x,
      y: f.y,
      w: f.width,
      h: f.height,
      scale: parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale')),
    }
  }, id)

const near = (a, b) => Math.abs(a - b) < 0.001
const settle = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/** Press on the icon's art, travel by (dx, dy) CSS px in steps, hold. */
async function pressAndMove(page, id, dx, dy, steps = 4) {
  const s = await state(page, id)
  await page.mouse.move(s.x + 10, s.y + 10)
  await page.mouse.down()
  await page.mouse.move(s.x + 10 + dx, s.y + 10 + dy, { steps })
  return s
}

// ── EVENTS ──────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
     </div>`
  )
  await record(page)
  const before = await state(page, 'ico')
  const scale = before.scale

  // A press that wiggles inside its lattice cell: never a drag.
  await page.mouse.move(before.x + 10, before.y + 10)
  await page.mouse.down()
  await page.mouse.move(before.x + 10.3, before.y + 10.2)
  await page.mouse.up()
  const still = await state(page, 'ico')
  check(
    'EVENTS  a press that never leaves its lattice cell fires nothing',
    (await log(page)).length === 0,
    JSON.stringify((await log(page)).map((e) => e.type))
  )
  check(
    'EVENTS  …and writes nothing',
    still.left === 20 && still.top === 20,
    `${still.left},${still.top}`
  )

  // A drag: 60 right, 30 down, in four steps, held before the release.
  await clearLog(page)
  await pressAndMove(page, 'ico', 60, 30)
  const mid = await log(page)
  check(
    'EVENTS  the first step fires vf-drag-start, then vf-drag on each changed step',
    mid.length >= 2 &&
      mid[0].type === 'vf-drag-start' &&
      mid.slice(1).every((e) => e.type === 'vf-drag'),
    mid.map((e) => e.type).join(',')
  )
  check(
    'EVENTS  vf-drag-start carries the seed origin in the container',
    mid[0]?.detail.left === 20 && mid[0]?.detail.top === 20,
    JSON.stringify(mid[0]?.detail)
  )
  check(
    'EVENTS  every event bubbles and composes, and no drop fires before the release',
    mid.every((e) => e.bubbles && e.composed && e.id === 'ico') &&
      !mid.some((e) => e.type === 'vf-drop')
  )
  await page.mouse.up()
  const all = await log(page)
  const drops = all.filter((e) => e.type === 'vf-drop')
  const drop = drops[0]
  check(
    'EVENTS  the release fires exactly one vf-drop, cancelable',
    drops.length === 1 && drop.cancelable && all[all.length - 1].type === 'vf-drop',
    all.map((e) => e.type).join(',')
  )
  check(
    'EVENTS  clientX/clientY is the pointer at the release',
    near(drop?.detail.clientX, before.x + 70) && near(drop?.detail.clientY, before.y + 40),
    `${drop?.detail.clientX},${drop?.detail.clientY} vs ${before.x + 70},${before.y + 40}`
  )
  const dx = 60 / scale
  const dy = 30 / scale
  check(
    'EVENTS  left/top is the proposal in the container: whole system px, origin plus the delta',
    Number.isInteger(drop?.detail.left) &&
      Number.isInteger(drop?.detail.top) &&
      drop?.detail.left === 20 + dx &&
      drop?.detail.top === 20 + dy,
    `${drop?.detail.left},${drop?.detail.top} (want ${20 + dx},${20 + dy})`
  )
  check(
    "EVENTS  x/y is the frame's box at the press plus the delta, in CSS px",
    near(drop?.detail.x, before.x + 60) && near(drop?.detail.y, before.y + 30),
    `${drop?.detail.x},${drop?.detail.y} vs ${before.x + 60},${before.y + 30}`
  )
  const after = await state(page, 'ico')
  check(
    'EVENTS  uncancelled, the icon lands on the proposal',
    after.left === drop?.detail.left && after.top === drop?.detail.top,
    `${after.left},${after.top}`
  )
  check(
    'EVENTS  …placed as a live system-px length',
    await page.evaluate(() => document.getElementById('ico').style.left.includes('--vf-scale'))
  )

  // A cancelled drop: the page takes the gesture, the kit writes nothing.
  await page.evaluate(() => {
    document.addEventListener('vf-drop', (e) => {
      if (globalThis.__cancelDrop) e.preventDefault()
    })
    globalThis.__cancelDrop = true
  })
  await clearLog(page)
  await pressAndMove(page, 'ico', 30, 20)
  await page.mouse.up()
  const cancelledDrop = (await log(page)).find((e) => e.type === 'vf-drop')
  const held = await state(page, 'ico')
  check(
    'EVENTS  a drop cancelled with preventDefault() still reports the proposal',
    cancelledDrop?.detail.left === after.left + 30 / scale &&
      cancelledDrop?.detail.top === after.top + 20 / scale,
    JSON.stringify(cancelledDrop?.detail)
  )
  check(
    'EVENTS  …and leaves left/top untouched',
    held.left === after.left && held.top === after.top,
    `${held.left},${held.top} (was ${after.left},${after.top})`
  )
  await page.evaluate(() => void (globalThis.__cancelDrop = false))

  // Past the far edge: the proposal keeps going, the write is clamped whole.
  await clearLog(page)
  await pressAndMove(page, 'ico', 4000, 4000)
  await page.mouse.up()
  const far = (await log(page)).find((e) => e.type === 'vf-drop')
  const pinned = await state(page, 'ico')
  const desk = await page.evaluate(() => {
    const d = document.getElementById('desk').getBoundingClientRect()
    return { right: d.right, bottom: d.bottom, w: d.width, h: d.height }
  })
  const maxLeft = (desk.w - pinned.w) / scale
  const maxTop = (desk.h - pinned.h) / scale
  check(
    'EVENTS  dragged past the edge, the write is the proposal clamped whole in the container',
    pinned.left === Math.min(far?.detail.left, maxLeft) &&
      pinned.top === Math.min(far?.detail.top, maxTop) &&
      pinned.x + pinned.w <= desk.right + 0.001 &&
      pinned.y + pinned.h <= desk.bottom + 0.001,
    `landed ${pinned.left},${pinned.top}; proposal ${far?.detail.left},${far?.detail.top}; max ${maxLeft},${maxTop}`
  )
  await page.close()
}

// ── CANCEL ──────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
     </div>`
  )
  await record(page)

  const s0 = await state(page, 'ico')
  await pressAndMove(page, 'ico', 50, 30, 3)
  await page.keyboard.press('Escape')
  const afterEsc = await state(page, 'ico')
  await page.mouse.up()
  const esc = await log(page)
  check(
    'CANCEL  Escape mid-drag fires vf-drag-cancel and no vf-drop',
    esc.some((e) => e.type === 'vf-drag-cancel') && !esc.some((e) => e.type === 'vf-drop'),
    esc.map((e) => e.type).join(',')
  )
  const afterUp = await state(page, 'ico')
  check(
    'CANCEL  …and writes nothing, before the release or after it',
    afterEsc.left === s0.left &&
      afterEsc.top === s0.top &&
      afterUp.left === s0.left &&
      afterUp.top === s0.top,
    `${afterEsc.left},${afterEsc.top} then ${afterUp.left},${afterUp.top} (was ${s0.left},${s0.top})`
  )

  // pointercancel — the platform abandoning the gesture — the same way. The
  // mouse pointer's id is 1, so a synthesized cancel with it is the one the
  // controller is waiting on.
  await clearLog(page)
  await pressAndMove(page, 'ico', 50, 30, 3)
  await page.evaluate(() => {
    document
      .getElementById('ico')
      .shadowRoot.querySelector('.frame')
      .dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true, composed: true }))
  })
  await page.mouse.up()
  const pc = await log(page)
  const afterPc = await state(page, 'ico')
  check(
    'CANCEL  pointercancel fires vf-drag-cancel, no vf-drop, and writes nothing',
    pc.some((e) => e.type === 'vf-drag-cancel') &&
      !pc.some((e) => e.type === 'vf-drop') &&
      afterPc.left === s0.left &&
      afterPc.top === s0.top,
    `${pc.map((e) => e.type).join(',')} at ${afterPc.left},${afterPc.top}`
  )

  // The gesture machinery is clean afterwards: the next drag lands.
  await clearLog(page)
  await pressAndMove(page, 'ico', 30, 30, 3)
  await page.mouse.up()
  const next = await state(page, 'ico')
  check(
    'CANCEL  the next drag after a cancel lands normally',
    (await log(page)).some((e) => e.type === 'vf-drop') &&
      next.left === s0.left + 30 / s0.scale &&
      next.top === s0.top + 30 / s0.scale,
    `${next.left},${next.top}`
  )
  await page.close()
}

{
  // Inside a modal: the Escape that cancels the drag never reaches the
  // dialog, which would otherwise read it as a dismissal.
  const page = await build(
    `<vf-dialog id="dlg" heading="Files" width="340" height="220" open>
       ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
     </vf-dialog>`
  )
  await record(page)
  await page.evaluate(() => {
    globalThis.__closes = 0
    document.addEventListener('vf-close', () => globalThis.__closes++)
  })
  await pressAndMove(page, 'ico', 40, 20, 3)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(40)
  const still = await page.evaluate(() => ({
    open: document.getElementById('dlg').open,
    closes: globalThis.__closes,
  }))
  check(
    'CANCEL  Escape mid-drag cancels the drag and leaves an enclosing dialog open',
    still.open && still.closes === 0 && (await log(page)).some((e) => e.type === 'vf-drag-cancel'),
    JSON.stringify(still)
  )
  await page.close()
}

// ── REPARENT ────────────────────────────────────────────────────────────────
// Filing at the drop: the handler cancels the default action, moves the icon
// into another field and places it there. The icon stays selected, and —
// the fault this fixes — a press elsewhere still clears it afterwards.
{
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       <vf-icon-field id="a" label="A">
         ${icon('id="ico" width="64" selectable movable left="20" top="20"')}
       </vf-icon-field>
       <vf-icon-field id="b" label="B"></vf-icon-field>
       <div id="elsewhere" style="position:absolute;left:400px;top:300px;width:120px;height:60px">outside</div>
     </div>`
  )
  await record(page)
  await page.locator('#ico').click()
  check(
    'REPARENT  the press selected the icon',
    await page.evaluate(() => document.getElementById('ico').selected)
  )
  await page.evaluate(() => {
    document.addEventListener(
      'vf-drop',
      (e) => {
        e.preventDefault()
        document.getElementById('b').append(e.target)
        e.target.left = e.detail.left + 100
        e.target.top = e.detail.top
      },
      { once: true }
    )
  })
  await pressAndMove(page, 'ico', 40, 20)
  await page.mouse.up()
  await page.evaluate(() => document.getElementById('ico').updateComplete)
  const filed = await page.evaluate(() => {
    const el = document.getElementById('ico')
    return { parent: el.parentElement.id, selected: el.selected, left: el.left, top: el.top }
  })
  check(
    'REPARENT  the handler filed the icon into the other field, still selected',
    filed.parent === 'b' && filed.selected && filed.left === 160 && filed.top === 40,
    JSON.stringify(filed)
  )
  // No click was lost to the re-insert: the icon is not double-selected or
  // stuck — a press elsewhere clears it, through the re-attached listener.
  await page.locator('#elsewhere').click()
  check(
    'REPARENT  …and a press outside then deselects it (the listener survived the move)',
    (await page.evaluate(() => document.getElementById('ico').selected)) === false
  )
  await page.close()
}

// ── TOUCH ───────────────────────────────────────────────────────────────────
{
  const page = await build(
    `${icon('id="m" width="64" movable left="0" top="0"')}${icon('id="s" width="64" selectable')}`
  )
  const touch = await page.evaluate(() =>
    ['m', 's'].map(
      (id) =>
        getComputedStyle(document.getElementById(id).shadowRoot.querySelector('.frame'))
          .touchAction
    )
  )
  check(
    'TOUCH  a movable frame is touch-action: none, so a touch drags instead of panning',
    touch[0] === 'none',
    touch[0]
  )
  check('TOUCH  a frame that cannot be dragged leaves touch scrolling alone', touch[1] === 'auto', touch[1])
  await page.close()
}

// ── FIELD ───────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342">
       <vf-icon-field id="field" label="Desktop">
         ${icon('id="owned" width="64" selectable left="20" top="30"', 'Macintosh HD')}
         ${icon('id="second" width="64" selectable left="100" top="30"', 'Trash')}
       </vf-icon-field>
       <vf-icon-field id="custom" role="group" label="Custom"></vf-icon-field>
       <vf-icon-field id="boxed" label="Boxed" left="200" top="100" width="200" height="120">
         ${icon('id="inbox" width="64" selectable left="10" top="10"', 'Boxed')}
       </vf-icon-field>
       <div id="elsewhere" style="position:absolute;left:400px;top:280px;width:100px;height:40px">outside</div>
     </vf-desktop>`
  )
  // Computed, not attribute-read: the field writes ARIA through internals,
  // so nothing lands on the tag.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('Accessibility.enable')
  const ax = async (id) => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${id}` })
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const n = nodes[0]
    const prop = (name) => n?.properties?.find((p) => p.name === name)?.value?.value ?? null
    return {
      role: n?.role?.value ?? null,
      name: n?.name?.value ?? '',
      multiselectable: prop('multiselectable'),
      selected: prop('selected'),
    }
  }

  const field = await ax('field')
  check(
    'FIELD  a vf-icon-field is a multiselectable listbox named from label',
    field.role === 'listbox' && field.name === 'Desktop' && field.multiselectable === true,
    JSON.stringify(field)
  )
  const owned = await ax('owned')
  check(
    'FIELD  a selectable icon inside it is an option with aria-selected',
    owned.role === 'option' && owned.name === 'Macintosh HD' && owned.selected === false,
    JSON.stringify(owned)
  )
  const custom = await ax('custom')
  check('FIELD  a consumer role on the tag wins', custom.role === 'group', JSON.stringify(custom))
  check(
    'FIELD  the field writes no role attribute of its own',
    await page.evaluate(() => !document.getElementById('field').hasAttribute('role'))
  )

  // size is the view's: one attribute on the field, every icon follows.
  const artWidth = (id) =>
    page.evaluate((i) => {
      const el = document.getElementById(i)
      const s = parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale'))
      return el.shadowRoot.querySelector('.art').getBoundingClientRect().width / s
    }, id)
  await page.evaluate(async () => {
    const f = document.getElementById('field')
    f.size = 'small'
    await f.updateComplete
    await Promise.all([...f.querySelectorAll('vf-icon')].map((i) => i.updateComplete))
  })
  check(
    'FIELD  size="small" on the field paints every icon in the 16×16 cell',
    (await artWidth('owned')) === 16 && (await artWidth('second')) === 16,
    `${await artWidth('owned')}, ${await artWidth('second')}`
  )
  await page.evaluate(async () => {
    const f = document.getElementById('field')
    f.size = 'large'
    await f.updateComplete
    await Promise.all([...f.querySelectorAll('vf-icon')].map((i) => i.updateComplete))
  })
  check(
    'FIELD  …and a later change follows',
    (await artWidth('owned')) === 32 && (await artWidth('second')) === 32
  )
  // An icon arriving later takes the view's size too.
  await page.evaluate(async () => {
    const f = document.getElementById('field')
    f.size = 'small'
    await f.updateComplete
    const late = document.createElement('vf-icon')
    late.id = 'late'
    late.label = 'Late'
    f.append(late)
    await late.updateComplete
  })
  await page.waitForTimeout(30)
  check(
    'FIELD  an icon slotted later takes the field’s size',
    (await page.evaluate(() => document.getElementById('late').size)) === 'small'
  )
  check(
    'FIELD  an icon outside any field keeps its own size',
    (await page.evaluate(() => document.getElementById('inbox').size)) === 'large'
  )
  // The late icon was never placed, so it sits in flow and would give the
  // field a line box of its own height — take it out before measuring the
  // field's neutrality.
  await page.evaluate(() => document.getElementById('late').remove())

  // Layout-neutral: a field of placed icons is a zero-height block, and the
  // icons anchor to the desktop's raster as if the field weren't there.
  const geometry = await page.evaluate(() => {
    const desk = document.getElementById('desk')
    const screen = desk.shadowRoot.querySelector('.screen').getBoundingClientRect()
    const field = document.getElementById('field').getBoundingClientRect()
    const owned = document.getElementById('owned').getBoundingClientRect()
    const boxed = document.getElementById('boxed').getBoundingClientRect()
    const inbox = document.getElementById('inbox').getBoundingClientRect()
    const s = parseFloat(getComputedStyle(desk).getPropertyValue('--vf-scale'))
    return {
      fieldHeight: field.height,
      fieldPosition: getComputedStyle(document.getElementById('field')).position,
      ownedFromScreen: [(owned.left - screen.left) / s, (owned.top - screen.top) / s],
      boxedFromScreen: [(boxed.left - screen.left) / s, (boxed.top - screen.top) / s],
      boxedSize: [boxed.width / s, boxed.height / s],
      inboxFromBoxed: [(inbox.left - boxed.left) / s, (inbox.top - boxed.top) / s],
    }
  })
  check(
    'FIELD  an unplaced field of placed icons is a zero-height in-flow block',
    geometry.fieldHeight === 0 && geometry.fieldPosition === 'static',
    `${geometry.fieldHeight}px, ${geometry.fieldPosition}`
  )
  check(
    "FIELD  …so its placed icons anchor to the desktop's raster",
    near(geometry.ownedFromScreen[0], 20) && near(geometry.ownedFromScreen[1], 30),
    geometry.ownedFromScreen.join(',')
  )
  check(
    'FIELD  a placed and sized field is a box at its stated rectangle',
    near(geometry.boxedFromScreen[0], 200) &&
      near(geometry.boxedFromScreen[1], 100) &&
      near(geometry.boxedSize[0], 200) &&
      near(geometry.boxedSize[1], 120),
    `${geometry.boxedFromScreen.join(',')} ${geometry.boxedSize.join('×')}`
  )
  check(
    '  …and the anchor its icons place against',
    near(geometry.inboxFromBoxed[0], 10) && near(geometry.inboxFromBoxed[1], 10),
    geometry.inboxFromBoxed.join(',')
  )

  // Moved between two fields: still an option, and still cleared by a press
  // outside once selected.
  await page.locator('#owned').click()
  await page.evaluate(async () => {
    document.getElementById('boxed').append(document.getElementById('owned'))
    await document.getElementById('owned').updateComplete
  })
  const moved = await ax('owned')
  check(
    'FIELD  an icon moved between two fields keeps option, and its selection',
    moved.role === 'option' && moved.selected === true,
    JSON.stringify(moved)
  )
  await page.locator('#elsewhere').click()
  check(
    'FIELD  …and a press outside still clears it after the move',
    (await page.evaluate(() => document.getElementById('owned').selected)) === false
  )
  await page.close()
}

// ── TARGET ──────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<vf-icon-field label="Desktop">
       ${icon('id="t" width="64" selectable target', 'Folder')}
       ${icon('id="tc" width="64" selectable color target', 'Color')}
       ${icon('id="plain" width="64" selectable', 'Plain')}
     </vf-icon-field>
     <div id="elsewhere" style="height:60px">outside</div>`
  )
  const look = (id) =>
    page.evaluate((i) => {
      const el = document.getElementById(i)
      const art = getComputedStyle(el.shadowRoot.querySelector('.art'))
      const plate = getComputedStyle(el.shadowRoot.querySelector('.name'))
      return { filter: art.filter, bg: plate.backgroundColor, color: plate.color }
    }, id)
  const t = await look('t')
  const tc = await look('tc')
  const plain = await look('plain')
  check('TARGET  the art inverts under target', t.filter === 'invert(1)', t.filter)
  check('TARGET  …and darkens under target with color', tc.filter === 'brightness(0.5)', tc.filter)
  check('TARGET  without it the art is untouched', plain.filter === 'none', plain.filter)
  check(
    'TARGET  the plate keeps its colors — no selection semantics',
    t.bg === 'rgb(255, 255, 255)' && t.color === 'rgb(0, 0, 0)',
    `${t.bg} on ${t.color}`
  )
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('Accessibility.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#t' })
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
  const selected = nodes[0]?.properties?.find((p) => p.name === 'selected')?.value?.value ?? null
  check('TARGET  no aria-selected comes with it', selected === false, String(selected))
  await page.evaluate(() => {
    globalThis.__selects = 0
    document.addEventListener('vf-select', () => globalThis.__selects++)
  })
  await page.locator('#elsewhere').click()
  const after = await page.evaluate(() => ({
    t: document.getElementById('t').target,
    tc: document.getElementById('tc').target,
    selects: globalThis.__selects,
  }))
  check(
    'TARGET  a press elsewhere clears nothing and fires nothing',
    after.t && after.tc && after.selects === 0,
    JSON.stringify(after)
  )
  await page.close()
}

// ── PLACEMENT AT ────────────────────────────────────────────────────────────
{
  const page = await build(
    `<vf-desktop id="desk" width="512" height="342" bezel="5">
       ${icon('id="di" width="64" left="40" top="60"', 'Disk')}
       <vf-window id="win" heading="Docs" width="300" height="200" scrollbars="both" left="100" top="40">
         ${icon('id="wi" width="64" left="30" top="250"', 'Deep')}
       </vf-window>
       <vf-window id="plain" heading="Plain" width="200" height="120" left="150" top="200">
         ${icon('id="pi" width="64" left="12" top="8"', 'Flat')}
       </vf-window>
     </vf-desktop>
     <vf-scroll-area id="sa" style="width:300px;height:200px">
       <div style="height:800px">${icon('id="si" width="64" left="24" top="300"', 'Rider')}</div>
     </vf-scroll-area>`
  )
  // Scroll the document window and the bare area partway, so the offset is
  // in play for both.
  await page.evaluate(() => {
    document
      .getElementById('win')
      .shadowRoot.querySelector('vf-scroll-area')
      .shadowRoot.querySelector('.viewport').scrollTop = 120
    document.getElementById('sa').shadowRoot.querySelector('.viewport').scrollTop = 150
  })
  await settle(page)
  const probe = (container, child) =>
    page.evaluate(
      ([c, k]) => {
        const r = document.getElementById(k).getBoundingClientRect()
        const at = document.getElementById(c).placementAt(r.left, r.top)
        const el = document.getElementById(k)
        return { at, want: { left: el.left, top: el.top } }
      },
      [container, child]
    )
  const cases = [
    ['a scrolled scrollbars="both" window', 'win', 'wi'],
    ['a plain window body', 'plain', 'pi'],
    ['a bezeled desktop', 'desk', 'di'],
    ['a bare scroll area, scrolled', 'sa', 'si'],
  ]
  for (const [what, container, child] of cases) {
    const r = await probe(container, child)
    check(
      `PLACEMENT AT  ${what} converts a child's own corner back into its left/top`,
      r.at.left === r.want.left && r.at.top === r.want.top,
      `${r.at.left},${r.at.top} (want ${r.want.left},${r.want.top})`
    )
  }
  // The result is whole system px on the lattice even from a fractional point.
  const fractional = await page.evaluate(() => {
    const r = document.getElementById('di').getBoundingClientRect()
    return document.getElementById('desk').placementAt(r.left + 0.4, r.top + 0.3)
  })
  check(
    'PLACEMENT AT  a fractional point still lands on whole system px',
    Number.isInteger(fractional.left) && Number.isInteger(fractional.top),
    JSON.stringify(fractional)
  )
  await page.close()
}

// ── RE-MEASURE ──────────────────────────────────────────────────────────────
{
  const page = await build(
    `<vf-desktop width="512" height="342">
       <vf-window id="win" heading="Docs" width="300" height="200" scrollbars="both" left="20" top="20">
         ${icon('id="ico" width="64" selectable movable left="20" top="20"', 'Doc')}
       </vf-window>
     </vf-desktop>`
  )
  const overflow = () =>
    page.evaluate(() =>
      document
        .getElementById('win')
        .shadowRoot.querySelector('vf-scroll-area')
        .shadowRoot.querySelector('.viewport')
        .getAttribute('data-overflow-y')
    )
  const planeHeight = () =>
    page.evaluate(
      () =>
        document
          .getElementById('win')
          .shadowRoot.querySelector('vf-scroll-area')
          .shadowRoot.querySelector('.content')
          .getBoundingClientRect().height
    )
  check('RE-MEASURE  the icon fits at first', (await overflow()) === 'false', await overflow())
  const planeBefore = await planeHeight()

  // Nudge it past the viewport with the keyboard: 30 × 8 = 240 system px.
  await page.evaluate(() => document.getElementById('ico').focus())
  for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowDown')
  await page.evaluate(() => document.getElementById('ico').updateComplete)
  check(
    'RE-MEASURE  nudged past the viewport, the rail goes live with no box resizing',
    (await overflow()) === 'true' && (await planeHeight()) === planeBefore,
    `${await overflow()}, plane ${planeBefore} → ${await planeHeight()}`
  )

  // Set from code: the same funnel.
  await page.evaluate(async () => {
    const el = document.getElementById('ico')
    el.top = 20
    await el.updateComplete
  })
  check('RE-MEASURE  a top set from code re-measures too (back to fitting)', (await overflow()) === 'false')

  // measure(): a move the kit cannot see (an inline style, not the property)
  // is stale until the window is asked.
  await page.evaluate(() => {
    document.getElementById('ico').style.top = 'calc(var(--vf-scale, 1) * 400px)'
  })
  await settle(page)
  const stale = await overflow()
  await page.evaluate(() => document.getElementById('win').measure())
  check(
    'RE-MEASURE  vf-window.measure() reaches the built-in area',
    stale === 'false' && (await overflow()) === 'true',
    `${stale} → ${await overflow()}`
  )
  check(
    'RE-MEASURE  measure() is a no-op on a window without scrollbars',
    await page.evaluate(() => {
      const w = document.createElement('vf-window')
      w.measure()
      return true
    })
  )
  await page.close()
}

await report(browser)
