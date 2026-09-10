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
 *    window's content region (frame's inner edge, below the title bar, with
 *    no inset of its own — the DITL convention), a dialog's
 *    content area, a stack's box, a fieldset's border interior, and a scroll
 *    area's *scrolled plane*, so a placed child travels with the content.
 *  - FIXED: `fixed` holds a placement against the visible region of the
 *    nearest scrolling ancestor — the flag alone is (0,0), the flow content
 *    behind it starts at the plane's origin, and removing the flag or the
 *    pair unwinds the whole recipe.
 *  - ORIGIN: `origin` names which point of the element's own box the pair
 *    places — nine keywords, measured in whole system px, never a transform.
 *    Each lands its named point on (L, T) at dpr 1, 2 and 3; an odd size's
 *    leftover half goes toward the start; a relabel re-centers and
 *    re-right-aligns and is announced; a scale step keeps the point; a drag
 *    writes the origin-point pair and the clamp holds the box; `fixed` takes
 *    it; `placementAt(x, y, child)` folds the child's offset in; unset and
 *    `top left` write exactly the plain inline style; an unknown value warns
 *    once and places as `top left`.
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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/** Repo root, for reading the manifest the UNIVERSAL group enumerates. */
const ROOT = new URL('..', import.meta.url).pathname

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
  // border, no inset of its own), so the placed child and the flow sibling
  // both sit exactly on it.
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
    'anchors: …and a flow sibling starts at that corner too (no inset)',
    near(influx.x, body.x) && near(influx.y, body.y),
    `${(influx.x - body.x).toFixed(2)} / ${(influx.y - body.y).toFixed(2)} from .body`
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
  // Dialog: (0,0) is the content region's corner — the frame's inner edge,
  // right below the title bar, measured here off the inner band itself — with
  // no inset, so a flow sibling starts on it too.
  const page = await build(`
    <vf-dialog id="dlg" heading="Options" width="340" height="180" open>
      <vf-checkbox id="indlg" left="24" top="16">E</vf-checkbox>
      <vf-button id="dlgflow">F</vf-button>
    </vf-dialog>
  `)
  const inner = await page.evaluate(() => {
    const band = document
      .getElementById('dlg')
      .shadowRoot.querySelector('.vf-modal-frame-inner')
    const r = band.getBoundingClientRect()
    const s = getComputedStyle(band)
    return {
      x: r.left + parseFloat(s.borderLeftWidth),
      y: r.top + parseFloat(s.borderTopWidth),
    }
  })
  const [indlg, dlgflow] = await Promise.all([rect(page, 'indlg'), rect(page, 'dlgflow')])
  check(
    "anchors: a dialog anchors placed children to the frame's inner edge",
    near(indlg.x - inner.x, 24 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(indlg.y - inner.y, 16 * DEVICE_PX_PER_SYSTEM_PX),
    `${indlg.x - inner.x} × ${indlg.y - inner.y}px CSS`
  )
  check(
    "anchors: …and a dialog's flow sibling starts at that corner too (no inset)",
    near(dlgflow.x, inner.x) && near(dlgflow.y, inner.y),
    `${(dlgflow.x - inner.x).toFixed(2)} / ${(dlgflow.y - inner.y).toFixed(2)} from the inner edge`
  )
  await page.close()
}

/* ── FIXED ────────────────────────────────────────────────────────────────
   `fixed` is the same placement held against the VISIBLE region of the
   nearest scrolling ancestor rather than its plane: the child keeps its
   stated top/left while the content scrolls under it, the flag alone is
   (0,0), and the flow content behind it starts at the plane's origin — the
   sticky box underneath has had its footprint erased. Removing the flag is
   ordinary placement again (it rides the plane); removing the pair as well
   is flow, and both leave none of the recipe's inline declarations behind. */

{
  const page = await build(`
    <vf-scroll-area id="sa" style="width:300px;height:200px">
      <vf-button id="held" fixed left="10" top="10">Tool</vf-button>
      <vf-label id="origin" fixed>At origin</vf-label>
      <div id="flow" style="height:1200px"></div>
    </vf-scroll-area>
  `)
  // The viewport's content origin — where the plane's (0,0) is — measured
  // from the viewport itself, padding (the border-floor mod() term) included.
  const origin = () =>
    page.evaluate(() => {
      const vp = document.getElementById('sa').shadowRoot.querySelector('.viewport')
      const r = vp.getBoundingClientRect()
      const s = getComputedStyle(vp)
      return { x: r.left + parseFloat(s.paddingLeft), y: r.top + parseFloat(s.paddingTop) }
    })
  const scrollBy = (y) =>
    page.evaluate((v) => {
      document.getElementById('sa').shadowRoot.querySelector('.viewport').scrollTop = v
    }, y)
  const settle = () =>
    page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    )
  const inline = (id) =>
    page.evaluate((i) => {
      const s = document.getElementById(i).style
      return {
        position: s.position,
        leftovers: ['display', 'max-width', 'z-index']
          .map((prop) => s.getPropertyValue(prop))
          .join(''),
        margin: s.margin,
        computed: getComputedStyle(document.getElementById(i)).position,
      }
    }, id)

  const o = await origin()
  let [held, atOrigin, flow] = await Promise.all([
    rect(page, 'held'),
    rect(page, 'origin'),
    rect(page, 'flow'),
  ])
  check(
    'fixed: a fixed child sits at its stated top/left against the viewport',
    near(held.x - o.x, 10 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(held.y - o.y, 10 * DEVICE_PX_PER_SYSTEM_PX),
    `${held.x - o.x} × ${held.y - o.y}px CSS`
  )
  check(
    'fixed: the flag alone places at (0,0)',
    near(atOrigin.x - o.x, 0) && near(atOrigin.y - o.y, 0),
    `${atOrigin.x - o.x} × ${atOrigin.y - o.y}px CSS`
  )
  check(
    'fixed: the flow content behind two fixed children starts at the plane origin',
    near(flow.x - o.x, 0) && near(flow.y - o.y, 0),
    `${flow.x - o.x} × ${flow.y - o.y}px CSS`
  )

  await scrollBy(300)
  await settle()
  ;[held, atOrigin, flow] = await Promise.all([
    rect(page, 'held'),
    rect(page, 'origin'),
    rect(page, 'flow'),
  ])
  check(
    'fixed: …and both hold there while the content scrolls',
    near(held.x - o.x, 10 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(held.y - o.y, 10 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(atOrigin.y - o.y, 0) &&
      near(flow.y - o.y, -300),
    `held at ${held.y - o.y}, origin at ${atOrigin.y - o.y}, flow at ${flow.y - o.y}`
  )
  const fixedStyle = await inline('held')
  check(
    'fixed: the recipe is position: sticky on the host, blockified and shrink-wrapped',
    fixedStyle.computed === 'sticky' && fixedStyle.leftovers === 'flexfit-content1',
    `${fixedStyle.computed}; display/max-width/z-index "${fixedStyle.leftovers}"`
  )

  // Off: ordinary placement again — it rides the plane, so at scroll 300 the
  // stated top: 10 is 300px above where it was holding.
  await page.evaluate(() => {
    const el = document.getElementById('held')
    el.removeAttribute('fixed')
    return el.updateComplete
  })
  await settle()
  held = await rect(page, 'held')
  const placedStyle = await inline('held')
  check(
    'fixed: removing the flag returns the child to placement on the plane',
    placedStyle.computed === 'absolute' &&
      near(held.y - o.y, 10 * DEVICE_PX_PER_SYSTEM_PX - 300),
    `${placedStyle.computed} at ${held.y - o.y}px CSS`
  )
  check(
    'fixed: …with the recipe unwound (margin back to 0)',
    placedStyle.leftovers === '' && placedStyle.margin === '0px',
    `display/max-width/z-index "${placedStyle.leftovers}", margin "${placedStyle.margin}"`
  )

  // Off entirely: flow, nothing left behind.
  await page.evaluate(() => {
    const el = document.getElementById('origin')
    el.removeAttribute('fixed')
    return el.updateComplete
  })
  const flowStyle = await inline('origin')
  check(
    'fixed: removing the flag with no pair returns the child to flow, unwound',
    flowStyle.computed !== 'sticky' &&
      flowStyle.position === '' &&
      flowStyle.leftovers === '' &&
      flowStyle.margin === '',
    `${flowStyle.computed}; position "${flowStyle.position}", leftovers "${flowStyle.leftovers}", margin "${flowStyle.margin}"`
  )
  await page.close()
}

/* ── ORIGIN ───────────────────────────────────────────────────────────────
   `origin` names which point of the element's own box `left`/`top` place:
   nine keywords, vertical then horizontal, `top left` the default. The point
   is measured — the border box in whole system px, the pair less ⌈w·fx⌉ and
   ⌈h·fy⌉ — never a transform, and kept current by a ResizeObserver. */

const ORIGINS = {
  'top left': [0, 0],
  'top center': [0.5, 0],
  'top right': [1, 0],
  'center left': [0, 0.5],
  center: [0.5, 0.5],
  'center right': [1, 0.5],
  'bottom left': [0, 1],
  'bottom center': [0.5, 1],
  'bottom right': [1, 1],
}

/** Two frames: the ResizeObserver delivers after layout, before paint. */
const settleFrames = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )

for (const dpr of DENSITIES) {
  const scale = scaleAt(dpr)
  const names = Object.keys(ORIGINS)
  const page = await build(
    `
    <div id="p" style="position:relative;width:900px;height:600px">
      ${names
        .map((o, i) => `<vf-button id="o${i}" origin="${o}" left="120" top="90">Cancel</vf-button>`)
        .join('\n')}
    </div>
  `,
    dpr
  )
  const p = await rect(page, 'p')
  const misses = []
  const offGrid = []
  for (const [i, name] of names.entries()) {
    const [fx, fy] = ORIGINS[name]
    const r = await rect(page, `o${i}`)
    // The offset the kit derives: the border box rounded to whole system px,
    // the fraction of it taken, the ceiling sending an odd half to the start.
    const w = Math.round(r.w / scale)
    const h = Math.round(r.h / scale)
    const corner = { x: 120 - Math.ceil(w * fx), y: 90 - Math.ceil(h * fy) }
    const dx = (r.x - p.x) * dpr
    const dy = (r.y - p.y) * dpr
    if (!near(dx, devicePxFor(corner.x, scale, dpr)) || !near(dy, devicePxFor(corner.y, scale, dpr))) {
      misses.push(`${name}: ${dx},${dy} vs ${devicePxFor(corner.x, scale, dpr)},${devicePxFor(corner.y, scale, dpr)}`)
    }
    if (
      Math.abs(dx - Math.round(dx)) > gridTolerance(scale, dpr) ||
      Math.abs(dy - Math.round(dy)) > gridTolerance(scale, dpr)
    ) {
      offGrid.push(`${name}: ${dx},${dy}`)
    }
  }
  check(
    `dpr ${dpr}: each of the nine origins lands its named point on (120, 90)`,
    misses.length === 0,
    misses.join(' | ') || 'all nine, measured against each box'
  )
  check(
    `dpr ${dpr}: …and every box corner stays on whole device pixels`,
    offGrid.length === 0,
    offGrid.join(' | ') ||
      'all nine' + (holdableScale(scale) ? '' : ' (3× device: 4/3 is not a holdable scale)')
  )
  await page.close()
}

{
  // The tie rule: an odd width under a center origin puts the leftover half
  // on the left, an odd height on top — ⌈w/2⌉ off the pair, not w/2.
  const page = await build(`
    <div id="p" style="position:relative;width:900px;height:600px">
      <vf-label id="odd" origin="center" width="71" height="33" left="200" top="100">Odd</vf-label>
      <vf-label id="even" origin="center" width="70" height="32" left="200" top="100">Even</vf-label>
    </div>
  `)
  const scale = scaleAt(1)
  const [p, odd, even] = await Promise.all([rect(page, 'p'), rect(page, 'odd'), rect(page, 'even')])
  const oddSys = { w: Math.round(odd.w / scale), h: Math.round(odd.h / scale) }
  check(
    'origin: an odd width under a center origin puts the leftover half on the left, an odd height on top',
    oddSys.w % 2 === 1 &&
      oddSys.h % 2 === 1 &&
      near(200 * scale - odd.x + p.x, Math.ceil(oddSys.w / 2) * scale) &&
      near(100 * scale - odd.y + p.y, Math.ceil(oddSys.h / 2) * scale),
    `${oddSys.w} × ${oddSys.h}: ${(200 * scale - odd.x + p.x) / scale} left of the point, ${(100 * scale - odd.y + p.y) / scale} above`
  )
  check(
    'origin: …and an even one splits exactly',
    near(200 * scale - even.x + p.x, (Math.round(even.w / scale) / 2) * scale) &&
      near(100 * scale - even.y + p.y, (Math.round(even.h / scale) / 2) * scale),
    `${Math.round(even.w / scale)} × ${Math.round(even.h / scale)}: ${(200 * scale - even.x + p.x) / scale} left, ${(100 * scale - even.y + p.y) / scale} above`
  )
  await page.close()
}

{
  // The observer: a relabel changes the box, and the named point stays put —
  // re-centered, re-right-aligned — with the rewrite announced like any
  // other placement write, so a scroll area re-measures under it.
  const page = await build(`
    <div id="p" style="position:relative;width:900px;height:600px">
      <vf-button id="c" origin="top center" left="300" top="40">OK</vf-button>
      <vf-button id="r" origin="bottom right" left="300" top="200">OK</vf-button>
    </div>
  `)
  const scale = scaleAt(1)
  const p = await rect(page, 'p')
  const before = await rect(page, 'c')
  const announced = await page.evaluate(() => {
    let n = 0
    document.getElementById('p').addEventListener('vf-placement-change', () => n++)
    document.getElementById('c').textContent = 'Cancel everything'
    document.getElementById('r').textContent = 'Cancel everything'
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(n)))
    )
  })
  const [c, r] = await Promise.all([rect(page, 'c'), rect(page, 'r')])
  const cw = Math.round(c.w / scale)
  check(
    'origin: a relabel re-centers on the same point',
    c.w > before.w && near(c.x - p.x, (300 - Math.ceil(cw / 2)) * scale),
    `${cw} wide now, corner at ${(c.x - p.x) / scale} (point 300 less ⌈${cw}/2⌉ = ${300 - Math.ceil(cw / 2)})`
  )
  check(
    'origin: …and re-right-aligns, bottom edge held too',
    near(r.right - p.x, 300 * scale) && near(r.bottom - p.y, 200 * scale),
    `right edge at ${(r.right - p.x) / scale}, bottom at ${(r.bottom - p.y) / scale}`
  )
  check(
    "origin: the observer's rewrite is announced as vf-placement-change",
    announced >= 2,
    `${announced} announced for two relabels`
  )
  await page.close()
}

{
  // A scale step changes what a system px costs in CSS px, not the box's
  // size in system px: the observer fires, derives the same offset, and
  // rewrites nothing — the point holds in the art's own unit.
  const page = await build(`
    <div id="p" style="--vf-scale:1;position:relative;width:900px;height:600px">
      <vf-button id="c" origin="top center" left="300" top="40">Cancel</vf-button>
    </div>
  `)
  const inline = () =>
    page.evaluate(() => {
      const s = document.getElementById('c').style
      return `${s.left}|${s.top}`
    })
  const inlineBefore = await inline()
  await page.evaluate(() => document.getElementById('p').style.setProperty('--vf-scale', '2'))
  await settleFrames(page)
  const [p, c, inlineAfter] = await Promise.all([rect(page, 'p'), rect(page, 'c'), inline()])
  const w = Math.round(c.w / 2)
  check(
    'origin: a scale step keeps the named point where it was, in system px',
    near(c.x - p.x, (300 - Math.ceil(w / 2)) * 2) && inlineAfter === inlineBefore,
    `corner at ${(c.x - p.x) / 2} system px for a ${w}-wide box; inline ${inlineAfter === inlineBefore ? 'unchanged' : `rewritten to ${inlineAfter}`}`
  )
  await page.close()
}

{
  // Gestures: the pair is the origin point, so a drag writes the point's
  // pair, the box follows the pointer, and the clamp holds the BOX inside
  // the container — vf-icon's whole-icon rule, converted around the offset.
  const page = await build(`
    <vf-desktop id="desk" width="512" height="342">
      <vf-icon id="ico" label="Disk" movable selectable origin="top center" left="256" top="40" style="width:64px"></vf-icon>
    </vf-desktop>
  `)
  const scale = scaleAt(1)
  const desk = await rect(page, 'desk')
  const seeded = await rect(page, 'ico')
  const iw = Math.round(seeded.w / scale)
  check(
    'origin: a movable icon with an origin sits with its named point on the pair',
    near(seeded.x - desk.x, (256 - Math.ceil(iw / 2)) * scale) && near(seeded.y - desk.y, 40 * scale),
    `corner at ${(seeded.x - desk.x) / scale} × ${(seeded.y - desk.y) / scale} for a ${iw}-wide icon`
  )
  const moved = await dragBy(page, 'ico', 60, 30, 16)
  const stated = await page.evaluate(() => {
    const i = document.getElementById('ico')
    return { left: i.left, top: i.top }
  })
  check(
    'origin: a drag keeps the box under the pointer and writes the origin-point pair',
    near(moved.dx, 60) &&
      near(moved.dy, 30) &&
      stated.left === 256 + 60 / scale &&
      stated.top === 40 + 30 / scale,
    `moved ${moved.dx} × ${moved.dy}px CSS; left=${stated.left} top=${stated.top}`
  )
  // Far past the right edge: the box stops at the raster's edge (512 − w),
  // and the pair reads that corner plus the offset.
  await dragBy(page, 'ico', 600, 0, 16)
  const clamped = await rect(page, 'ico')
  const clampedPair = await page.evaluate(() => document.getElementById('ico').left)
  check(
    'origin: …and the clamp holds the box, not the point, inside the container',
    near(clamped.right - desk.x, 512 * scale) && clampedPair === 512 - iw + Math.ceil(iw / 2),
    `right edge at ${(clamped.right - desk.x) / scale}, left=${clampedPair} (expected ${512 - iw + Math.ceil(iw / 2)})`
  )
  await page.close()
}

{
  // `fixed` with an origin: the sticky thresholds carry the offset, so the
  // named point holds against the viewport while the content scrolls.
  const page = await build(`
    <vf-scroll-area id="sa" style="width:300px;height:200px">
      <vf-button id="held" fixed origin="top center" left="150" top="10">Tool</vf-button>
      <div style="height:1200px"></div>
    </vf-scroll-area>
  `)
  const scale = scaleAt(1)
  const o = await page.evaluate(() => {
    const vp = document.getElementById('sa').shadowRoot.querySelector('.viewport')
    const r = vp.getBoundingClientRect()
    const s = getComputedStyle(vp)
    return { x: r.left + parseFloat(s.paddingLeft), y: r.top + parseFloat(s.paddingTop) }
  })
  const centered = (r) => {
    const w = Math.round(r.w / scale)
    return near(r.x - o.x, (150 - Math.ceil(w / 2)) * scale) && near(r.y - o.y, 10 * scale)
  }
  let held = await rect(page, 'held')
  check(
    'origin: fixed with an origin holds the named point against the viewport',
    centered(held),
    `corner at ${(held.x - o.x) / scale} × ${(held.y - o.y) / scale}`
  )
  await page.evaluate(() => {
    document.getElementById('sa').shadowRoot.querySelector('.viewport').scrollTop = 300
  })
  await settleFrames(page)
  held = await rect(page, 'held')
  check(
    'origin: …and while the content scrolls under it',
    centered(held),
    `corner at ${(held.x - o.x) / scale} × ${(held.y - o.y) / scale} at scroll 300`
  )
  await page.close()
}

{
  // Drops: placementAt's pair is the corner's; with the child it is the pair
  // to write to THAT child, its offset folded in. Unset and `top left` are
  // the plain path — byte-identical inline styles. An unknown value places
  // as `top left` and says so once per element, not once per update.
  const page = await build(`
    <vf-window id="win" heading="Drop" width="300" height="200" style="position:relative">
      <vf-button id="child" origin="top center" left="150" top="60">Cancel</vf-button>
    </vf-window>
    <div id="p" style="position:relative;width:900px;height:300px">
      <vf-button id="bare" left="40" top="25">OK</vf-button>
      <vf-button id="tl" origin="top left" left="40" top="25">OK</vf-button>
      <vf-button id="typo" origin="centre" left="40" top="25">OK</vf-button>
    </div>
  `)
  const scale = scaleAt(1)
  const at = await page.evaluate(() => {
    const win = document.getElementById('win')
    const child = document.getElementById('child')
    const r = child.getBoundingClientRect()
    return {
      plain: win.placementAt(r.left, r.top),
      withChild: win.placementAt(r.left, r.top, child),
      pair: { left: child.left, top: child.top },
      width: r.width,
    }
  })
  const cw = Math.round(at.width / scale)
  check(
    "origin: placementAt(x, y, child) returns the pair that lands the child's corner there",
    at.withChild.left === at.pair.left &&
      at.withChild.top === at.pair.top &&
      at.plain.left === at.pair.left - Math.ceil(cw / 2) &&
      at.plain.top === at.pair.top,
    `with child ${at.withChild.left},${at.withChild.top}; corner's pair ${at.plain.left},${at.plain.top}; stated ${at.pair.left},${at.pair.top}`
  )

  const styles = await page.evaluate(() =>
    ['bare', 'tl'].map((id) => {
      const s = document.getElementById(id).style
      return `${s.left}|${s.top}`
    })
  )
  check(
    'origin: unset and top left write exactly the same inline style',
    styles[0] === styles[1] && styles[0].includes('var(--vf-scale') && styles[0].includes('40px'),
    styles.join(' vs ')
  )

  const [p, typo] = await Promise.all([rect(page, 'p'), rect(page, 'typo')])
  check(
    'origin: an unknown value places as top left',
    near(typo.x - p.x, 40 * scale) && near(typo.y - p.y, 25 * scale),
    `${(typo.x - p.x) / scale} × ${(typo.y - p.y) / scale} system px`
  )
  await page.evaluate(() => {
    const el = document.getElementById('typo')
    el.top = 26
    return el.updateComplete
  })
  const warned = page.vfWarnings.filter((w) => w.includes('origin="centre"'))
  check(
    'origin: …and warns once per element, not per update',
    warned.length === 1,
    warned[0] ?? `${warned.length} warnings`
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

{
  // UNIVERSAL: the rule itself, enumerated rather than trusted. Every element
  // the kit defines takes the pair — including the rows a container normally
  // owns (vf-option, vf-menu-item, vf-list-item) and a bar's vf-menu, which
  // were excluded until the rule was made exceptionless. Read off the manifest
  // so a new component joins this check by existing, not by being remembered
  // here.
  const tags = JSON.parse(readFileSync(join(ROOT, 'custom-elements.json'), 'utf8'))
    .modules.flatMap((m) => m.declarations ?? [])
    .filter((d) => d.customElement && d.tagName)
    .map((d) => d.tagName)
    .sort()

  // vf-dialog is the one documented difference and is asserted on its own
  // terms below: its host is `display: contents` and the box that moves is the
  // top-layer <dialog>, whose containing block the platform fixes to the
  // viewport.
  const placeable = tags.filter((t) => t !== 'vf-dialog')
  const page = await build(
    `<div id="anchor" style="position:relative;width:800px;height:600px">
       ${placeable.map((t) => `<${t} data-tag="${t}" top="12" left="20"></${t}>`).join('\n')}
     </div>`
  )
  check(
    'universal: the manifest lists every component this check covers',
    tags.length === 32,
    `${tags.length} elements (${placeable.length} placeable + vf-dialog)`
  )
  const placed = await page.evaluate(() =>
    [...document.querySelectorAll('[data-tag]')].map((el) => {
      const anchor = document.getElementById('anchor').getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return {
        tag: el.dataset.tag,
        position: getComputedStyle(el).position,
        dx: box.left - anchor.left,
        dy: box.top - anchor.top,
      }
    })
  )
  const notAbsolute = placed.filter((p) => p.position !== 'absolute')
  check(
    'universal: every component takes top/left — no exceptions',
    notAbsolute.length === 0,
    notAbsolute.length === 0
      ? `${placed.length}/${placed.length} absolutely positioned`
      : notAbsolute.map((p) => `${p.tag}:${p.position}`).join(' ')
  )
  // The offsets land where they were stated, in the art's own unit — the rows
  // included, which is the half that would have silently done nothing before.
  const scale = scaleAt(1)
  const misplaced = placed.filter(
    (p) => !near(p.dx, 20 * scale) || !near(p.dy, 12 * scale)
  )
  check(
    'universal: …and each lands at the stated system-px origin',
    misplaced.length === 0,
    misplaced.length === 0
      ? `all at (20,12) system px = (${20 * scale},${12 * scale}) CSS px`
      : misplaced.map((p) => `${p.tag}:${p.dx},${p.dy}`).join(' ')
  )
  await page.close()

  // `fixed` on the same terms: every placeable component takes it, is held
  // by the sticky engine, and — thirty of them stacked at the same origin,
  // each with its footprint erased — lands at the stated coordinates against
  // the page (the nearest scroll container here) at scroll 0.
  const fixedPage = await build(
    `<div id="anchor" style="position:relative;width:800px;height:600px">
       ${placeable.map((t) => `<${t} data-tag="${t}" fixed top="12" left="20"></${t}>`).join('\n')}
     </div>`
  )
  const held = await fixedPage.evaluate(() =>
    [...document.querySelectorAll('[data-tag]')].map((el) => {
      const anchor = document.getElementById('anchor').getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return {
        tag: el.dataset.tag,
        position: getComputedStyle(el).position,
        dx: box.left - anchor.left,
        dy: box.top - anchor.top,
      }
    })
  )
  const notSticky = held.filter((p) => p.position !== 'sticky')
  check(
    'universal: every component takes fixed — no exceptions',
    notSticky.length === 0,
    notSticky.length === 0
      ? `${held.length}/${held.length} held by the sticky engine`
      : notSticky.map((p) => `${p.tag}:${p.position}`).join(' ')
  )
  const adrift = held.filter((p) => !near(p.dx, 20 * scale) || !near(p.dy, 12 * scale))
  check(
    'universal: …and each holds at the stated system-px origin',
    adrift.length === 0,
    adrift.length === 0
      ? `all at (20,12) system px with no flow footprint between them`
      : adrift.map((p) => `${p.tag}:${p.dx},${p.dy}`).join(' ')
  )
  await fixedPage.close()
}

{
  // vf-dialog's own terms: it takes the same pair, in the same unit, against
  // the viewport — showModal() puts the box in the top layer, whose containing
  // block is not the parent. Asserted here so "every component takes the pair"
  // covers all 32 without pretending the coordinate space is the same.
  const page = await build(`
    <div style="position:relative;left:120px;top:80px">
      <vf-dialog id="d" heading="Placed" width="200" height="120" top="40" left="60"></vf-dialog>
    </div>
  `)
  await page.evaluate(() => document.getElementById('d').show())
  const box = await page.evaluate(() =>
    document.getElementById('d').shadowRoot.querySelector('dialog').getBoundingClientRect()
  )
  const scale = scaleAt(1)
  check(
    'universal: vf-dialog takes the pair too — against the viewport',
    near(box.left, 60 * scale) && near(box.top, 40 * scale),
    `(${box.left},${box.top}) CSS px, viewport-anchored despite the offset parent`
  )
  await page.close()
}

await browser.close()

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
