/**
 * Verifies explicit placement — `top`/`left` in system px (src/position.ts).
 *
 * A DITL resource laid a dialog out by stating each item's rectangle in the
 * window's own coordinates; the kit's second layout mechanism is that model:
 * set `top` and/or `left` (whole system px) on almost any component and it is
 * absolutely positioned within its parent, no stylesheet involved. Groups:
 *
 *  - SYSTEM PX: `top`/`left` measure exactly N × 3 device px at dpr 1, 2 and 3,
 *    and land on whole device pixels — the coordinates are in the art's unit.
 *  - DEFAULTS: setting one coordinate makes the other 0; setting neither leaves
 *    the element in normal flow; removing both returns it to flow with every
 *    inline declaration unwound.
 *  - OVERRIDES: the stated offsets are the whole story — a consumer margin or
 *    right/bottom cannot shift or stretch a placed box.
 *  - ANCHORS: each kit container is a deliberate positioning parent — a
 *    window's content region (frame's inner edge, below the title bar — the
 *    12px inset governs flow content only, the DITL convention), a dialog's
 *    content area, a stack's box, a fieldset's border interior, and a scroll
 *    area's *scrolled plane*, so a placed child travels with the content.
 *  - LIVE: the offsets are calc()s against --vf-scale, not resolved numbers,
 *    so a pinned scale in scope repositions without any property write.
 *  - INTERPLAY: placement seeds vf-window drag / vf-icon moves; a drag then
 *    owns the coordinates — re-activating the window must NOT snap it back to
 *    its authored position — and writing the property again re-places it.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:position
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'
const DENSITIES = (process.env.VF_POSITION_DPR ?? '1,2,3').split(',').map(Number)

/** Device pixels per system pixel — the kit's constant (src/scale.ts). */
const DEVICE_PX_PER_SYSTEM_PX = 3

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()

/** Markup FIRST, module SECOND — the same upgrade order as the other scripts. */
async function build(markup, dpr = 1) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: dpr,
  })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${markup}`)
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  return page
}

const rect = (page, id) =>
  page.evaluate((i) => {
    const r = document.getElementById(i).getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom }
  }, id)

const near = (a, b) => Math.abs(a - b) < 0.001

/* ── SYSTEM PX ────────────────────────────────────────────────────────────
   One system px is 3 device px at every density (scale × dpr is always 3), so
   left="40" top="25" must measure exactly 120 × 75 device px from the parent's
   origin — whatever the display is doing — and land on whole device pixels. */

for (const dpr of DENSITIES) {
  const page = await build(
    `
    <div id="parent" style="position:relative;width:900px;height:600px">
      <vf-button id="placed" left="40" top="25">OK</vf-button>
    </div>
  `,
    dpr
  )
  const [parent, placed] = await Promise.all([rect(page, 'parent'), rect(page, 'placed')])
  const dx = (placed.x - parent.x) * dpr
  const dy = (placed.y - parent.y) * dpr
  check(
    `dpr ${dpr}: left="40" top="25" is 120 × 75 device px from the parent`,
    near(dx, 40 * DEVICE_PX_PER_SYSTEM_PX) && near(dy, 25 * DEVICE_PX_PER_SYSTEM_PX),
    `${dx} × ${dy} device px`
  )
  check(
    `dpr ${dpr}: …and the origin lands on whole device pixels`,
    near(dx, Math.round(dx)) && near(dy, Math.round(dy)),
    `${dx} / ${dy}`
  )
  await page.close()
}

/* ── DEFAULTS ─────────────────────────────────────────────────────────────
   Either coordinate alone is a complete placement — the other is 0. Neither
   set is normal flow, and removing both puts the element back where flow
   would have had it, with the inline declarations unwound. */

{
  const page = await build(`
    <div id="p" style="position:relative;width:900px;height:600px">
      <vf-checkbox id="leftonly" left="60">A</vf-checkbox>
      <vf-checkbox id="toponly" top="45">B</vf-checkbox>
      <vf-checkbox id="flow">C</vf-checkbox>
      <vf-checkbox id="flow2">D</vf-checkbox>
    </div>
  `)
  const [p, leftonly, toponly] = await Promise.all([
    rect(page, 'p'),
    rect(page, 'leftonly'),
    rect(page, 'toponly'),
  ])
  check(
    'defaults: left alone puts top at 0',
    near(toponly.x - p.x, 0) && near(leftonly.y - p.y, 0),
    `left-only sits at y ${leftonly.y - p.y}, top-only at x ${toponly.x - p.x}`
  )
  check(
    'defaults: top alone puts left at 0',
    near(toponly.y - p.y, 45 * DEVICE_PX_PER_SYSTEM_PX),
    `${toponly.y - p.y}px CSS`
  )

  // The two unplaced checkboxes are the only children in flow: layout starts
  // them at the parent's origin as if the placed pair weren't there, and the
  // second follows the first (inline-level hosts share a line box).
  const [flow, flow2] = await Promise.all([rect(page, 'flow'), rect(page, 'flow2')])
  check(
    'defaults: unplaced siblings stay in normal flow',
    near(flow.y, p.y) && (flow2.x >= flow.right || flow2.y >= flow.bottom),
    `first at y ${flow.y - p.y}, second follows at ${flow2.x - flow.right} × ${flow2.y - flow.y}`
  )

  // Remove both → back exactly where flow had its sibling pair, and none of
  // our six inline declarations left behind.
  await page.evaluate(() => {
    const el = document.getElementById('leftonly')
    el.removeAttribute('left')
    return el.updateComplete
  })
  const [released, releasedStyle] = await Promise.all([
    rect(page, 'leftonly'),
    page.evaluate(() => {
      const s = document.getElementById('leftonly').style
      return ['position', 'top', 'left', 'right', 'bottom', 'margin']
        .map((prop) => s.getPropertyValue(prop))
        .join('')
    }),
  ])
  check(
    'defaults: removing both coordinates returns the element to flow',
    near(released.y, p.y) && releasedStyle === '',
    `back at the flow origin, inline styles ${releasedStyle === '' ? 'unwound' : `left: "${releasedStyle}"`}`
  )
  await page.close()
}

/* ── OVERRIDES ────────────────────────────────────────────────────────────
   The stated offsets are the whole story. CSS positions an absolute box's
   MARGIN edge, and an auto-width box with both horizontal edges set stretches
   to span them — so a consumer margin or right/bottom would shift or widen a
   placed control if the mixin didn't release them (the vf-icon seed logic). */

{
  const page = await build(`
    <style>#styled { margin: 14px; right: 10px; bottom: 10px }</style>
    <div id="p" style="position:relative;width:900px;height:600px">
      <vf-button id="styled" left="40" top="25">OK</vf-button>
      <vf-button id="bare" left="400" top="25">OK</vf-button>
    </div>
  `)
  const [p, styled, bare] = await Promise.all([
    rect(page, 'p'),
    rect(page, 'styled'),
    rect(page, 'bare'),
  ])
  check(
    'overrides: a consumer margin cannot shift a placed box',
    near(styled.x - p.x, 40 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(styled.y - p.y, 25 * DEVICE_PX_PER_SYSTEM_PX),
    `${styled.x - p.x} × ${styled.y - p.y}px CSS`
  )
  check(
    'overrides: consumer right/bottom cannot stretch it',
    near(styled.w, bare.w) && near(styled.h, bare.h),
    `${styled.w} × ${styled.h} vs the bare button's ${bare.w} × ${bare.h}`
  )
  await page.close()
}

/* ── ANCHORS ──────────────────────────────────────────────────────────────
   "Positioned within its parent" is only true if the parent is a containing
   block, so each kit container is one on purpose — and each anchor is a spec'd
   spot, measured here against the container's own shadow geometry rather than
   hardcoded chrome metrics. */

{
  const page = await build(`
    <vf-window id="win" heading="Layout" width="300" height="200" style="position:relative">
      <vf-button id="atorigin" left="0" top="0">A</vf-button>
      <vf-button id="influx">B</vf-button>
    </vf-window>
    <vf-stack id="stack" width="200" pad="8" style="margin-top:20px">
      <vf-checkbox id="instack" left="30" top="10">C</vf-checkbox>
    </vf-stack>
    <vf-fieldset id="fs" legend="Group" style="width:400px">
      <vf-radio id="infs" left="20" top="30">D</vf-radio>
    </vf-fieldset>
  `)

  // Window: (0,0) is the content region's corner — the frame's inner edge,
  // right below the title bar. The .body's padding box IS that corner (no
  // border of its own), so the placed child sits exactly on it while the flow
  // sibling is 12px further in.
  const body = await page.evaluate(() => {
    const r = document
      .getElementById('win')
      .shadowRoot.querySelector('.body')
      .getBoundingClientRect()
    return { x: r.left, y: r.top }
  })
  const [atorigin, influx] = await Promise.all([rect(page, 'atorigin'), rect(page, 'influx')])
  check(
    'anchors: window (0,0) is the content region corner, below the title bar',
    near(atorigin.x, body.x) && near(atorigin.y, body.y),
    `${(atorigin.x - body.x).toFixed(2)} / ${(atorigin.y - body.y).toFixed(2)} from .body`
  )
  check(
    'anchors: …while the 12px inset still governs the flow sibling',
    near(influx.x - body.x, 12 * DEVICE_PX_PER_SYSTEM_PX),
    `${influx.x - body.x}px CSS`
  )

  const [stack, instack] = await Promise.all([rect(page, 'stack'), rect(page, 'instack')])
  check(
    'anchors: a stack is a containing block (pad, like any padding, is flow-only)',
    near(instack.x - stack.x, 30 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(instack.y - stack.y, 10 * DEVICE_PX_PER_SYSTEM_PX),
    `${instack.x - stack.x} × ${instack.y - stack.y}px CSS`
  )

  // Fieldset: the .fieldset box (positioned, 1px border) anchors children just
  // inside its border.
  const fsBox = await page.evaluate(() => {
    const el = document.getElementById('fs').shadowRoot.querySelector('.fieldset')
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return { x: r.left + parseFloat(s.borderLeftWidth), y: r.top + parseFloat(s.borderTopWidth) }
  })
  const infs = await rect(page, 'infs')
  check(
    'anchors: a fieldset anchors just inside its border',
    near(infs.x - fsBox.x, 20 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(infs.y - fsBox.y, 30 * DEVICE_PX_PER_SYSTEM_PX),
    `${infs.x - fsBox.x} × ${infs.y - fsBox.y}px CSS`
  )
  await page.close()
}

{
  // Scroll area: the anchor is the scrolled plane, not the frame — a placed
  // child must travel with the content under it.
  const page = await build(`
    <vf-scroll-area id="sa" style="width:300px;height:200px">
      <div style="height:1200px">
        <vf-checkbox id="rider" left="20" top="300">R</vf-checkbox>
      </div>
    </vf-scroll-area>
  `)
  const before = await rect(page, 'rider')
  await page.evaluate(() => {
    document.getElementById('sa').shadowRoot.querySelector('.viewport').scrollTop = 100
  })
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  const after = await rect(page, 'rider')
  check(
    'anchors: a scroll area anchors placed children to the scrolled plane',
    near(before.y - after.y, 100),
    `moved ${before.y - after.y}px CSS for a 100px scroll`
  )
  await page.close()
}

{
  // Dialog: the content area (.content-wrap) is the pre-existing positioned
  // wrapper, so placed children measure from where dialog content starts.
  const page = await build(`
    <vf-dialog id="dlg" heading="Options" width="340" height="180" open>
      <vf-checkbox id="indlg" left="24" top="16">E</vf-checkbox>
    </vf-dialog>
  `)
  const wrap = await page.evaluate(() => {
    const r = document
      .getElementById('dlg')
      .shadowRoot.querySelector('.content-wrap')
      .getBoundingClientRect()
    return { x: r.left, y: r.top }
  })
  const indlg = await rect(page, 'indlg')
  check(
    'anchors: a dialog anchors placed children to its content area',
    near(indlg.x - wrap.x, 24 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(indlg.y - wrap.y, 16 * DEVICE_PX_PER_SYSTEM_PX),
    `${indlg.x - wrap.x} × ${indlg.y - wrap.y}px CSS`
  )
  await page.close()
}

/* ── LIVE ─────────────────────────────────────────────────────────────────
   The offsets are written as calc(var(--vf-scale, 1) * Npx), resolved at
   paint time — the vf-stack rule. A pinned scale in scope beats the
   per-component default, and the placement follows without a property write. */

{
  const page = await build(`
    <div id="p" style="--vf-scale:1;position:relative;width:900px;height:600px">
      <vf-button id="pinned" left="40" top="25">OK</vf-button>
    </div>
  `)
  const [p, pinned] = await Promise.all([rect(page, 'p'), rect(page, 'pinned')])
  check(
    'live: a pinned --vf-scale: 1 in scope resolves left="40" to 40 CSS px',
    near(pinned.x - p.x, 40) && near(pinned.y - p.y, 25),
    `${pinned.x - p.x} × ${pinned.y - p.y}px CSS`
  )
  await page.close()
}

/* ── INTERPLAY ────────────────────────────────────────────────────────────
   vf-window drag and vf-icon moves write THROUGH these properties, in system
   px (PlacementController), seeding from computed style the first time so an
   authored `left: 10%` or plain flow reads correctly. The claims: placement
   seeds the gesture, a later unrelated update never re-asserts the authored
   coordinates over a user's move, and writing a property again deliberately
   re-places that one axis. */

{
  const page = await build(`
    <vf-desktop id="desk" width="512" height="342">
      <vf-window id="w1" heading="Alpha" movable width="200" height="120" left="40" top="30"></vf-window>
      <vf-window id="w2" heading="Beta" movable width="200" height="120" left="280" top="30"></vf-window>
    </vf-desktop>
  `)
  const desk = await rect(page, 'desk')
  const seeded = await rect(page, 'w1')
  check(
    'interplay: a window placed with top/left sits there on the desktop raster',
    near(seeded.x - desk.x, 40 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(seeded.y - desk.y, 30 * DEVICE_PX_PER_SYSTEM_PX),
    `${seeded.x - desk.x} × ${seeded.y - desk.y}px CSS`
  )

  // Drag Alpha by its title bar: 60 CSS px right, 30 down.
  await page.mouse.move(seeded.x + 100, seeded.y + 8)
  await page.mouse.down()
  await page.mouse.move(seeded.x + 160, seeded.y + 38, { steps: 4 })
  await page.mouse.up()
  const dragged = await rect(page, 'w1')
  check(
    'interplay: the placed window still drags',
    near(dragged.x - seeded.x, 60) && near(dragged.y - seeded.y, 30),
    `moved ${dragged.x - seeded.x} × ${dragged.y - seeded.y}px CSS`
  )

  // Activate Beta, then Alpha again — two rounds of `active` updates on Alpha.
  // If anything re-applied the authored coordinates, Alpha would snap back.
  const beta = await rect(page, 'w2')
  await page.mouse.click(beta.x + 100, beta.y + 8)
  await page.mouse.click(dragged.x + 100, dragged.y + 8)
  const after = await rect(page, 'w1')
  check(
    'interplay: re-activating never snaps a dragged window back',
    near(after.x, dragged.x) && near(after.y, dragged.y),
    `at ${after.x - desk.x} × ${after.y - desk.y}, drag put it at ${dragged.x - desk.x} × ${dragged.y - desk.y}`
  )

  // Writing a property again is the deliberate re-place — of THAT axis. The
  // drag states both coordinates in the same properties, so the axis left
  // alone keeps where the user put it rather than reverting to the markup.
  const draggedLeft = await page.evaluate(() => {
    const w = document.getElementById('w1')
    w.top = 90
    return w.updateComplete.then(() => w.left)
  })
  const replaced = await rect(page, 'w1')
  check(
    'interplay: setting a coordinate property re-places that axis',
    near(replaced.y - desk.y, 90 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(replaced.x - desk.x, draggedLeft * DEVICE_PX_PER_SYSTEM_PX),
    `${replaced.x - desk.x} × ${replaced.y - desk.y}px CSS, left reads ${draggedLeft}`
  )
  check(
    'interplay: a drag states the origin in system px on the host',
    draggedLeft === 40 + 60 / DEVICE_PX_PER_SYSTEM_PX,
    `left=${draggedLeft} system px after a 60 CSS px drag from 40`
  )
  await page.close()
}

{
  // vf-icon: place with left only, then nudge with the keyboard — the seed
  // must read the computed calc (60 system px), not jump to 0.
  const page = await build(`
    <vf-desktop id="desk" width="512" height="342">
      <vf-icon id="ico" label="Disk" movable selectable left="60" top="40" style="width:64px">
      </vf-icon>
    </vf-desktop>
  `)
  const desk = await rect(page, 'desk')
  await page.evaluate(() => document.getElementById('ico').focus())
  await page.keyboard.press('ArrowRight')
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  const nudged = await rect(page, 'ico')
  check(
    'interplay: an arrow key moves a placed icon one system px from its placement',
    near(nudged.x - desk.x, 61 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(nudged.y - desk.y, 40 * DEVICE_PX_PER_SYSTEM_PX),
    `${nudged.x - desk.x} × ${nudged.y - desk.y}px CSS`
  )
  await page.close()
}

await browser.close()

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
