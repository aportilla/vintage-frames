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
 *  - CONTRACT: the movable contract, which is what makes a gesture safe outside
 *    a kit container — a movable host states its own top/left, and its
 *    positioning parent is a box with a size. Both halves warn, both stay
 *    usable when broken, a met contract drags exactly and says nothing, and a
 *    component nobody asked to move takes no position, tab stop or role at all.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:position
 */
import {
  ORIGIN,
  check,
  devicePxPerSystemPxAt,
  launch,
  results,
  scaleAt,
  devicePxFor,
  gridTolerance,
  holdableScale,
} from './harness.mjs'

const DENSITIES = (process.env.VF_POSITION_DPR ?? '1,2,3').split(',').map(Number)

/**
 * Device pixels per system pixel at the density under test — derived, not
 * constant (src/zoom.ts): 1 at dpr 1, 3 at dpr 2, 4 at dpr 3. Reassigned at the
 * top of each density's pass below.
 */
let DEVICE_PX_PER_SYSTEM_PX = devicePxPerSystemPxAt(1)

const browser = await launch()

/** Markup FIRST, module SECOND — the same upgrade order as the other scripts. */
async function build(markup, dpr = 1) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: dpr,
  })
  // The CONTRACT group asserts on these; every other group ignores them.
  // Lit's own dev-mode notices (`lit.dev/msg/…`) are not the kit talking — one
  // of them, the update-after-update from vf-icon's plate measurement, fires on
  // every icon and would drown the silence checks.
  page.vfWarnings = []
  page.on('console', (m) => {
    if (m.type() === 'warning' && !m.text().includes('lit.dev/msg')) {
      page.vfWarnings.push(m.text())
    }
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
  DEVICE_PX_PER_SYSTEM_PX = devicePxPerSystemPxAt(dpr)
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
  const scale = scaleAt(dpr)
  check(
    `dpr ${dpr}: left="40" top="25" is ${40 * DEVICE_PX_PER_SYSTEM_PX} × ${25 * DEVICE_PX_PER_SYSTEM_PX} device px from the parent`,
    near(dx, devicePxFor(40, scale, dpr)) && near(dy, devicePxFor(25, scale, dpr)),
    `${dx} × ${dy} device px`
  )
  check(
    `dpr ${dpr}: …and the origin lands on whole device pixels`,
    Math.abs(dx - Math.round(dx)) <= gridTolerance(scale, dpr) &&
      Math.abs(dy - Math.round(dy)) <= gridTolerance(scale, dpr),
    `${dx} / ${dy}` + (holdableScale(scale) ? '' : ' (3× device: 4/3 is not a holdable scale)')
  )
  await page.close()
}

// Every group below builds at the default density, so put the target back.
DEVICE_PX_PER_SYSTEM_PX = devicePxPerSystemPxAt(1)

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

/* ── CONTRACT ─────────────────────────────────────────────────────────────
   The movable contract, which is what makes a gesture safe outside a kit
   container: a host that moves under a gesture states its own `top`/`left`,
   and its positioning parent is a box with a size. Neither half can be
   supplied by the component, and both used to fail silently — so each is a
   console warning here, plus the behavior that has to survive the misuse.

   The failure the frozen-bounds fix exists for: with no stated origin the host
   is in normal flow, so its first move takes it out, an auto-height parent
   collapses to whatever is left, and a clamp re-measured per move would then
   hold the rest of the gesture inside a box the host never sat in — walking it
   to the parent's origin while the user drags the other way. */

/**
 * Drag `id` by (dx, dy) CSS px, grabbing its horizontal centre `grabY` below
 * its top edge — the title bar on a window, the art cell on an icon. Centre,
 * not a fixed inset: the icons here are sized in raw CSS px and are narrower
 * than a window's title bar is long.
 */
async function dragBy(page, id, dx, dy, grabY) {
  const before = await rect(page, id)
  const grabX = before.x + before.w / 2
  await page.mouse.move(grabX, before.y + grabY)
  await page.mouse.down()
  await page.mouse.move(grabX + dx, before.y + grabY + dy, { steps: 5 })
  await page.mouse.up()
  await page.evaluate((i) => document.getElementById(i).updateComplete, id)
  const after = await rect(page, id)
  return { before, after, dx: after.x - before.x, dy: after.y - before.y }
}

const warnedAbout = (page, fragment) => page.vfWarnings.some((w) => w.includes(fragment))

{
  // Unplaced, in an auto-height static parent — the case that used to fling the
  // window to the top of the page on the second pointermove.
  const page = await build(`
    <div style="padding:40px">
      <vf-window id="win" heading="Panel" movable width="240" height="140"></vf-window>
    </div>
  `)
  const moved = await dragBy(page, 'win', 30, 30, 9)
  check(
    'contract: a movable host still in normal flow warns',
    warnedAbout(page, 'in normal flow'),
    page.vfWarnings.join(' | ') || 'no warning'
  )
  check(
    'contract: …and the drag still follows the pointer instead of collapsing',
    moved.dy > 0,
    `moved ${moved.dx} × ${moved.dy}px CSS (a re-measured clamp gave −31)`
  )
  await page.close()
}

{
  // Placed, but the positioning parent has no box: the clamp has no range, so
  // it falls back to the viewport rather than pinning the host to the origin.
  const page = await build(`
    <div style="position:relative">
      <vf-window id="win" heading="Panel" movable width="240" height="140" top="20" left="20"></vf-window>
    </div>
  `)
  const moved = await dragBy(page, 'win', 30, 30, 9)
  check(
    'contract: a positioning parent with no box warns',
    warnedAbout(page, 'no box'),
    page.vfWarnings.join(' | ') || 'no warning'
  )
  check(
    'contract: …and the viewport fallback keeps the gesture usable',
    near(moved.dx, 30) && near(moved.dy, 30),
    `moved ${moved.dx} × ${moved.dy}px CSS`
  )
  await page.close()
}

{
  // Out of flow is what the contract actually asks for, and a stylesheet's own
  // `position: absolute` satisfies it — a faux desktop places its icons exactly
  // this way, and seed() reads the computed offsets. This must not warn: it is
  // the older hand-written form of the same thing, not a fault.
  const page = await build(`
    <style>
      #ico { position: absolute; left: calc(var(--vf-scale, 1) * 20px);
             top: calc(var(--vf-scale, 1) * 30px); }
    </style>
    <vf-desktop id="desk" width="512" height="342">
      <vf-icon id="ico" label="Disk" movable selectable style="width:64px"></vf-icon>
    </vf-desktop>
  `)
  const moved = await dragBy(page, 'ico', 30, 30, 16)
  check(
    'contract: a stylesheet-positioned movable host is out of flow, so it is silent',
    page.vfWarnings.length === 0,
    page.vfWarnings.join(' | ') || 'silent'
  )
  check(
    'contract: …and seeds from its computed offsets',
    near(moved.dx, 30) && near(moved.dy, 30),
    `moved ${moved.dx} × ${moved.dy}px CSS from a CSS-stated origin`
  )
  await page.close()
}

{
  // The contract met, on both components. A stated origin is authoritative, so
  // the seed needs no measuring and no lattice rounding: 30 CSS px at scale 3
  // is exactly 10 system px, with no ±1 hitch on the first move.
  const page = await build(`
    <div style="position:relative;height:700px">
      <vf-window id="win" heading="Panel" movable width="240" height="140" top="20" left="20"></vf-window>
    </div>
    <vf-desktop id="desk" width="512" height="342">
      <vf-icon id="ico" label="Disk" movable selectable left="60" top="40" style="width:64px"></vf-icon>
    </vf-desktop>
  `)
  const win = await dragBy(page, 'win', 30, 30, 9)
  const ico = await dragBy(page, 'ico', 30, 30, 16)
  check(
    'contract: a placed window drags exactly, with no seed hitch',
    near(win.dx, 30) && near(win.dy, 30),
    `moved ${win.dx} × ${win.dy}px CSS`
  )
  check(
    'contract: …and so does a placed icon',
    near(ico.dx, 30) && near(ico.dy, 30),
    `moved ${ico.dx} × ${ico.dy}px CSS`
  )
  // 30 CSS px of pointer travel is 30 / scale system px — the scale is derived
  // from the display, so the figure cannot be written down as a constant.
  const step = 30 / scaleAt(1)
  check(
    'contract: …stated in system px on the hosts',
    (await page.evaluate(() => {
      const w = document.getElementById('win')
      const i = document.getElementById('ico')
      return `${w.left},${w.top} ${i.left},${i.top}`
    })) === `${20 + step},${20 + step} ${60 + step},${40 + step}`,
    await page.evaluate(() => {
      const w = document.getElementById('win')
      const i = document.getElementById('ico')
      return `${w.left},${w.top} ${i.left},${i.top}`
    })
  )
  check(
    'contract: …and a met contract says nothing',
    page.vfWarnings.length === 0,
    page.vfWarnings.join(' | ') || 'silent'
  )
  await page.close()
}

{
  // The standalone guarantee, held as a test rather than as a claim: components
  // that were never asked to move take no position, no tab stop and no role,
  // and lay out under the page's own CSS like any other element.
  const page = await build(`
    <div id="row" style="display:flex;gap:16px;padding:20px">
      <vf-icon id="a" label="One" style="width:64px"></vf-icon>
      <vf-icon id="b" label="Two" style="width:64px"></vf-icon>
      <vf-window id="w" heading="Panel" width="240" height="140"></vf-window>
    </div>
  `)
  const inert = await page.evaluate(() =>
    ['a', 'b', 'w'].map((id) => {
      const e = document.getElementById(id)
      return {
        id,
        position: getComputedStyle(e).position,
        inlineTop: e.style.top,
        inlineLeft: e.style.left,
        tabindex: e.getAttribute('tabindex'),
      }
    })
  )
  check(
    'contract: an unasked component writes no placement of its own',
    inert.every((e) => e.inlineTop === '' && e.inlineLeft === ''),
    inert.map((e) => `${e.id}:${e.position}`).join(' ')
  )
  // Computed, not attribute-read: the kit writes host ARIA through internals
  // (SPEC §2), so `getAttribute('role')` is null for every component whatever
  // its role computes to — which would make the "no role" half of this
  // contract pass vacuously. `generic` is the AX tree's way of saying the
  // element took no role of its own.
  const cdpPos = await page.context().newCDPSession(page)
  await cdpPos.send('DOM.enable')
  await cdpPos.send('Accessibility.enable')
  const axRole = async (id) => {
    const { root } = await cdpPos.send('DOM.getDocument', { depth: -1, pierce: true })
    const { nodeId } = await cdpPos.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `#${id}`,
    })
    const { nodes } = await cdpPos.send('Accessibility.getPartialAXTree', {
      nodeId,
      fetchRelatives: false,
    })
    return nodes[0]?.role?.value ?? null
  }
  const roles = { a: await axRole('a'), b: await axRole('b'), w: await axRole('w') }
  check(
    'contract: …takes no tab stop and no role',
    inert.every((e) => e.tabindex === null) &&
      Object.values(roles).every((r) => r === 'generic'),
    inert.map((e) => `${e.id}:${e.tabindex}/${roles[e.id]}`).join(' ')
  )
  const laid = await page.evaluate(() => {
    const r = document.getElementById('row').getBoundingClientRect()
    const a = document.getElementById('a').getBoundingClientRect()
    return { rowTop: r.top, aTop: a.top }
  })
  check(
    'contract: …and stays in the page’s own flow',
    near(laid.aTop - laid.rowTop, 20),
    `${laid.aTop - laid.rowTop}px CSS below the row's border edge (20px padding)`
  )
  check(
    'contract: …silently',
    page.vfWarnings.length === 0,
    page.vfWarnings.join(' | ') || 'silent'
  )
  await page.close()
}

await browser.close()

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
