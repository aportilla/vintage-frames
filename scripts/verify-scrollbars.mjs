/**
 * Verifies the kit-drawn scroll rails (SCROLL-RAILS-PLAN.md) — headless,
 * finally: the old `::-webkit-scrollbar` skin was the one surface `npm test`
 * could not see (headless Chromium paints no scrollbar skins), where the DOM
 * rail is pixel-assertable at three densities like everything else.
 *
 * What it defends, at dpr 1 / 2 / 3:
 *
 * 1. RAIL ANATOMY on an overflowing vf-scroll-area: 1-system-px divider, the
 *    14px channel, 15px arrow cells with the traced glyph ink on its exact
 *    rows, the fixed 16px thumb with its borders, the 4×2 dot lattice at the
 *    trough's own phase — and zero intermediate-gray pixels: the whole rail
 *    is 1-bit art on the device grid.
 *
 * 2. THE 2026-08-09 REGRESSION CLASS: the same component with its box edges
 *    knocked off the whole-CSS-px lattice (a 0.5px margin; an odd-system-px
 *    offset inside a vf-window at scale 1.5 — the regime where WebKit shifted
 *    or shrank a native rail) renders the identical run pattern, just
 *    translated. Native scrollbars made this assertion impossible; for the
 *    DOM rail the defect class is unrepresentable, and this holds it so.
 *
 * 3. ALWAYS-A-RAIL states, previously unverifiable headless: the idle rail
 *    (white channel + divider, no dither/thumb/arrows) and the
 *    inactive-window blanking of both axes.
 *
 * 4. THE FIXED THUMB: 16 system px regardless of content length (System 7's
 *    thumb is a box, not a proportion), whole-system-px travel, and the
 *    degenerate decision table (track shorter than the thumb drops the thumb;
 *    a rail too short for its arrows reads as the bare rail).
 *
 * 5. INTERACTIONS (trusted input): thumb drag writes scrollTop and stays
 *    snapped; trough press pages by a viewport minus one line and repeats;
 *    arrow press steps one 16px line, repeats on hold, and holds the pressed
 *    glyph; wheel over the viewport still scrolls natively; the native bar is
 *    really hidden (no gutter).
 *
 * 6. A11Y: the rail subtree is aria-hidden and absent from the accessibility
 *    tree; the viewport's role/name/tab-stop contract is untouched.
 *
 *   npm run dev               # in another shell (port 5173)
 *   npm run verify:scrollbars
 */
import {
  check,
  decodePng,
  devicePxPerSystemPxAt,
  launch,
  makeBuild,
  report,
  ax,
  axFor,
  axRole,
  within,
} from './harness.mjs'

/** The fixture's declared box, in system px. Multiples of 3 so the CSS size
 *  is whole at every ladder scale (210 × 4/3 = 280) and screenshots never
 *  resample. */
const W = 210
const H = 150

const sysSize = `width:calc(var(--vf-scale,1)*${W}px);height:calc(var(--vf-scale,1)*${H}px)`

const TALL = '<div style="height:1200px;width:8px"></div>'
const SHORT = '<div style="height:8px;width:8px"></div>'

const browser = await launch()
const build = makeBuild(browser, { settle: true })

/* ── helpers ─────────────────────────────────────────────────────────────── */

const pxAt = (png, x, y) => {
  const i = (y * png.width + x) * png.bpp
  return [png.data[i], png.data[i + 1], png.data[i + 2]]
}
const isInk = ([r, g, b]) => r < 32 && g < 32 && b < 32
const isPaper = ([r, g, b]) => r > 224 && g > 224 && b > 224
const isPure = ([r, g, b]) =>
  (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)

/** Impure (neither pure black nor pure white) pixels in a device-px region. */
function impureIn(png, x0, y0, x1, y1) {
  let impure = 0
  for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x++)
      if (!isPure(pxAt(png, x, y))) impure++
  return impure
}

/** Run-length pattern of one device row: [['b', 3], ['w', 12], …]. */
function rowRuns(png, y, x0, x1) {
  const runs = []
  for (let x = x0; x < x1; x++) {
    const p = pxAt(png, x, y)
    const kind = isInk(p) ? 'b' : isPaper(p) ? 'w' : '?'
    const last = runs[runs.length - 1]
    if (last && last[0] === kind) last[1]++
    else runs.push([kind, 1])
  }
  return runs
}
const sig = (runs) => runs.map(([k, n]) => `${k}${n}`).join(' ')
const parseSig = (s) =>
  s.split(' ').map((r) => [r[0], parseInt(r.slice(1), 10)])

/**
 * Whether two run signatures agree within `tol` device px per run — same run
 * count, same colors, no intermediate grays anywhere.
 *
 * tol 0 is exact. tol 1 absorbs the two sub-CSS-px wobbles the kit knowingly
 * carries: Chromium floors the 1-system-px border to a whole CSS px (the
 * open border-floor issue — so a run bounded by a border can sit one device
 * px off its system-px ideal, and the leftover slack lands on a neighboring
 * white run), and paint anchors on half-CSS-px layout positions can snap
 * either way. Both are ≤1 device px by construction; the defect class this
 * script guards (an engine quantizing rail geometry to whole CSS px) is ≥1
 * CSS px = 2–4 device px, which tol 1 still catches.
 */
function runsAgree(a, b, tol) {
  const ra = parseSig(a)
  const rb = parseSig(b)
  if (ra.length !== rb.length) return false
  return ra.every(
    ([kind, len], i) =>
      kind !== '?' &&
      rb[i][0] === kind &&
      Math.abs(len - rb[i][1]) <= tol
  )
}

/** First ink column at row `y`, scanning right from `x`. */
function findInk(png, y, x) {
  while (x < png.width && !isInk(pxAt(png, x, y))) x++
  return x
}

/** The rects a rail test needs, all in page CSS px. */
async function railRects(page, hostSel, axis = 'vertical') {
  return page.evaluate(
    ([sel, ax]) => {
      const host = document.querySelector(sel)
      const root = host.shadowRoot
      const pick = (q) => {
        const el = root.querySelector(q)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, width: r.width, height: r.height }
      }
      return {
        host: (() => {
          const r = host.getBoundingClientRect()
          return { left: r.left, top: r.top, width: r.width, height: r.height }
        })(),
        rail: pick(`.vf-rail--${ax}`),
        track: pick(`.vf-rail--${ax} .vf-rail-track`),
        thumb: pick(`.vf-rail--${ax} .vf-rail-thumb`),
        corner: pick('.vf-rail-corner'),
        viewport: (() => {
          const v = root.querySelector('.viewport')
          return {
            clientWidth: v.clientWidth,
            clientHeight: v.clientHeight,
            offsetWidth: v.offsetWidth,
            offsetHeight: v.offsetHeight,
            scrollTop: v.scrollTop,
            scrollHeight: v.scrollHeight,
          }
        })(),
      }
    },
    [hostSel, axis]
  )
}

/* ── 1. anatomy + states, dpr 1 / 2 / 3 ─────────────────────────────────── */

for (const dpr of [1, 2, 3]) {
  const n = devicePxPerSystemPxAt(dpr)
  console.log(`\ndpr ${dpr}  (1 system px = ${n} device px)`)
  const page = await build(
    `<vf-scroll-area id="sa" style="position:absolute;top:0;left:0;${sysSize}">${TALL}</vf-scroll-area>
     <vf-scroll-area id="idle" style="position:absolute;top:0;left:600px;${sysSize}">${SHORT}</vf-scroll-area>`,
    dpr
  )

  // The engine floors the 1-system-px border to a whole CSS px (the open
  // border-floor issue, kit-wide) — every line the rail draws as a border is
  // `bd` device px, and run tolerances below absorb where the leftover slack
  // lands. tol 0 (exact) at dpr 1; ±1 device per run at dpr 2/3, where
  // half-CSS-px paint anchors and the unholdable 4/3 scale wobble boundaries
  // by one device px (the documented hairline class).
  const bd = Math.round(
    (await page.evaluate(() =>
      parseFloat(
        getComputedStyle(
          document.querySelector('#sa').shadowRoot.querySelector('.vf-rail')
        ).borderLeftWidth
      )
    )) * dpr
  )
  const tol = dpr === 1 ? 0 : 1

  const r = await railRects(page, '#sa')
  check(
    'rail is the 15px inside the frame',
    Math.round(r.rail.width * dpr) === 15 * n,
    `${(r.rail.width * dpr).toFixed(2)} device px`
  )
  check(
    'track spans the rail minus two 15px arrow cells',
    Math.round(r.track.height * dpr) === H * n - 2 * bd - 30 * n,
    `${(r.track.height * dpr).toFixed(2)} device px (border ${bd})`
  )
  check(
    'thumb is the fixed 16px box across the channel',
    Math.round(r.thumb.height * dpr) === 16 * n &&
      Math.round(r.thumb.width * dpr) === 15 * n - bd,
    `${(r.thumb.width * dpr).toFixed(2)}×${(r.thumb.height * dpr).toFixed(2)}`
  )
  check(
    'native bar really hidden: no gutter on the viewport',
    r.viewport.offsetWidth === r.viewport.clientWidth,
    `offset ${r.viewport.offsetWidth} vs client ${r.viewport.clientWidth}`
  )

  // Pixel anatomy. Host sits at page (0,0) with a whole-device box, so the
  // screenshot is never resampled. Each probe row's runs are anchored at the
  // painted divider and read through to the host's right edge, frame line
  // included.
  const png = decodePng(await page.locator('#sa').screenshot())
  const railLeft = Math.round(r.rail.left * dpr)
  const dividerX = findInk(png, 100 * n, railLeft - 2)
  const row = (sysY) => sig(rowRuns(png, sysY * n, dividerX, W * n))

  check(
    'rail region is 1-bit (zero intermediate grays)',
    impureIn(png, railLeft - 2, 0, W * n, H * n) === 0,
    `${impureIn(png, railLeft - 2, 0, W * n, H * n)} impure`
  )
  let dividerInk = true
  let frameInk = true
  for (let y = 0; y < H * n; y++) {
    if (!isInk(pxAt(png, dividerX, y))) dividerInk = false
    if (!isInk(pxAt(png, W * n - 1, y))) frameInk = false
  }
  check('divider column solid frame to frame', dividerInk)
  check('frame column solid', frameInk)

  // Arrow row: sprite row 8 of the ▲ (ink at sprite cols 2–5 and 10–13).
  check(
    'decrement arrow ink on its traced row',
    runsAgree(
      row(8),
      `b${bd} w${n} b${4 * n} w${4 * n} b${4 * n} w${n} b${bd}`,
      tol
    ),
    row(8)
  )
  // Thumb row (scrollTop 0 → thumb spans sys rows 16–32; row 24): the
  // divider and thumb border merge on the left, the thumb border and frame
  // on the right, with the 12px face between.
  check(
    'thumb crosses the channel with 1px inset borders',
    runsAgree(row(24), `b${2 * bd} w${14 * n - 2 * bd} b${2 * bd}`, tol),
    row(24)
  )
  // Trough rows: sys row 100 → trough row 84 (even → dots at channel cols
  // 0, 4, 8, 12; the col-0 dot merges with the divider), row 101 odd (dots
  // at 2, 6, 10).
  check(
    'trough dot lattice at the 4×2 motif phase (even row)',
    runsAgree(
      row(100),
      `b${bd + n} w${3 * n} b${n} w${3 * n} b${n} w${3 * n} b${n} w${n} b${bd}`,
      tol
    ),
    row(100)
  )
  check(
    'trough dot lattice (odd row: dots at cols 2, 6, 10)',
    runsAgree(
      row(101),
      `b${bd} w${2 * n} b${n} w${3 * n} b${n} w${3 * n} b${n} w${3 * n} b${bd}`,
      tol
    ),
    row(101)
  )

  // Whole-system-px thumb travel at an arbitrary scroll position.
  await page.evaluate(() => {
    const v = document.querySelector('#sa').shadowRoot.querySelector('.viewport')
    v.scrollTop = (v.scrollHeight - v.clientHeight) * 0.37
  })
  await page.evaluate(
    () => new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)))
  )
  const mid = await railRects(page, '#sa')
  const travelDev = (mid.thumb.top - mid.track.top) * dpr
  check(
    'thumb travel lands on whole system px',
    travelDev > 0 && Math.abs(travelDev - Math.round(travelDev)) < 0.02 &&
      Math.round(travelDev) % n === 0,
    `${travelDev.toFixed(3)} device px (n = ${n})`
  )

  // Idle rail: white channel, divider stays, no arrows, no dither, no thumb.
  const idle = decodePng(await page.locator('#idle').screenshot())
  const idleDividerX = findInk(idle, 100 * n, railLeft - 2)
  const idleRow = (sysY) =>
    sig(rowRuns(idle, sysY * n, idleDividerX, W * n))
  const bare = `b${bd} w${14 * n} b${bd}`
  check(
    'idle rail: bare white channel on its traced rows',
    runsAgree(idleRow(8), bare, tol) &&
      runsAgree(idleRow(24), bare, tol) &&
      runsAgree(idleRow(100), bare, tol),
    idleRow(100)
  )
  let idleDivider = true
  for (let y = 0; y < H * n; y++)
    if (!isInk(pxAt(idle, idleDividerX, y))) idleDivider = false
  check('idle rail keeps its divider', idleDivider)

  await page.close()
}

/* ── 2. the off-lattice regression class (dpr 2, scale 1.5) ─────────────── */
{
  const dpr = 2
  const n = devicePxPerSystemPxAt(dpr)
  console.log('\noff-lattice regression (dpr 2)')
  const page = await build(
    `<vf-scroll-area id="aligned" style="position:absolute;top:0;left:0;${sysSize}">${TALL}</vf-scroll-area>
     <vf-scroll-area id="shifted" style="position:absolute;top:0;left:400.5px;${sysSize}">${TALL}</vf-scroll-area>
     <vf-window id="win" heading="Odd" width="240" height="200" style="position:absolute;top:200px;left:0">
       <vf-scroll-area id="inwin" top="12" left="12" style="${sysSize}">${TALL}</vf-scroll-area>
     </vf-window>`,
    dpr
  )
  const shot = decodePng(await page.screenshot())

  /**
   * The rail's run signature on three probe rows (arrow ink, thumb, trough),
   * each anchored at the painted divider and read through the frame line —
   * so instances at different paint anchors compare structurally.
   */
  async function railSig(sel) {
    const r = await railRects(page, sel)
    const left = Math.round(r.rail.left * dpr)
    const top = Math.round(r.host.top * dpr)
    const right = Math.round((r.rail.left + r.rail.width) * dpr) + 3
    const probes = [8, 24, 100].map((sys) => {
      const y = top + sys * n
      const dividerX = findInk(shot, top + 100 * n, left - 2)
      return sig(rowRuns(shot, y, dividerX, right))
    })
    const impure = impureIn(shot, left - 2, top, right, top + H * n)
    return { probes, impure }
  }

  const aligned = await railSig('#aligned')
  const shifted = await railSig('#shifted')
  const inwin = await railSig('#inwin')

  // What the DOM rail guarantees BY CONSTRUCTION, wherever its box lands:
  // every ink run identical (±1 device for the floored-border lines), the
  // channel within the border-floor slack, and zero grays. The old WebKit
  // defect classes (rail shifted a device px off its frame; rail shrunk a
  // whole CSS px, channel 40/41dp) all violate these bounds. What is NOT
  // asserted: the white slack's side — paint distributes the floored
  // border's half-CSS-px leftovers by snap direction (the open border-floor
  // wobble, shared with every kit frame).
  const bd = 2 // the floored 1-system-px border at dpr 2 (asserted above)
  const inkRuns = (probe) =>
    parseSig(probe).filter(([k]) => k === 'b').map(([, w]) => w)
  const agreeInk = (a, b) =>
    a.probes.every((p, i) => {
      const ia = inkRuns(p)
      const ib = inkRuns(b.probes[i])
      return (
        ia.length === ib.length &&
        ia.every((w, j) => Math.abs(w - ib[j]) <= 1)
      )
    })
  const channelOf = (probe) => {
    const runs = parseSig(probe)
    while (runs.length && runs[runs.length - 1][0] === 'w') runs.pop()
    return runs.reduce((sum, [, w]) => sum + w, 0) - 2 * bd
  }
  const channelOk = (s) =>
    s.probes.every((p) => {
      const c = channelOf(p)
      return c >= 14 * n && c <= 14 * n + 2 * (n - bd)
    })

  check(
    'aligned rail is 1-bit, channel in bounds',
    aligned.impure === 0 && channelOk(aligned),
    `${aligned.impure} impure; ${aligned.probes.join(' | ')}`
  )
  check(
    'half-CSS-px-shifted rail: same ink structure, channel in bounds, 1-bit',
    shifted.impure === 0 && agreeInk(shifted, aligned) && channelOk(shifted),
    `${shifted.impure} impure; ${shifted.probes.join(' | ')}`
  )
  check(
    'odd-system-px offset in a window: same ink structure, in bounds, 1-bit',
    inwin.impure === 0 && agreeInk(inwin, aligned) && channelOk(inwin),
    `${inwin.impure} impure; ${inwin.probes.join(' | ')}`
  )
  await page.close()
}

/* ── 3. inactive window + degenerate tracks + both axes (dpr 1) ─────────── */
{
  const n = devicePxPerSystemPxAt(1)
  console.log('\nstates (dpr 1)')
  const page = await build(
    `<vf-window id="win" heading="W" width="260" height="200" style="position:absolute;top:0;left:0">
       <vf-scroll-area id="inwin" top="4" left="4" style="${sysSize}">${TALL}</vf-scroll-area>
     </vf-window>
     <vf-scroll-area id="deg1" style="position:absolute;top:300px;left:0;width:calc(var(--vf-scale,1)*210px);height:calc(var(--vf-scale,1)*45px)">${TALL}</vf-scroll-area>
     <vf-scroll-area id="deg2" style="position:absolute;top:400px;left:0;width:calc(var(--vf-scale,1)*210px);height:calc(var(--vf-scale,1)*31px)">${TALL}</vf-scroll-area>
     <vf-scroll-area id="both" axis="both" style="position:absolute;top:300px;left:300px;${sysSize}">
       <div style="height:1200px;width:1200px"></div>
     </vf-scroll-area>`,
    1
  )

  // Inactive window blanks the rail (both the trough and the controls).
  const blanked = await page.evaluate(async () => {
    const win = document.querySelector('#win')
    win.active = false
    await win.updateComplete
    await document.querySelector('#inwin').updateComplete
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const root = document.querySelector('#inwin').shadowRoot
    const hidden = (q) =>
      getComputedStyle(root.querySelector(q)).display === 'none'
    return {
      thumb: hidden('.vf-rail-thumb'),
      trough: hidden('.vf-rail-trough'),
      button: hidden('.vf-rail-button--decrement'),
    }
  })
  check(
    'inactive window blanks thumb, trough and arrows',
    blanked.thumb && blanked.trough && blanked.button,
    JSON.stringify(blanked)
  )
  await page.evaluate(async () => {
    const win = document.querySelector('#win')
    win.active = true
    await win.updateComplete
  })

  // Degenerate decision table.
  const deg = await page.evaluate(() => {
    const state = (sel) => {
      const root = document.querySelector(sel).shadowRoot
      const rail = root.querySelector('.vf-rail')
      return {
        degenerate: rail.getAttribute('data-degenerate'),
        thumb: getComputedStyle(root.querySelector('.vf-rail-thumb')).display,
        button: getComputedStyle(root.querySelector('.vf-rail-button--decrement'))
          .display,
      }
    }
    return { deg1: state('#deg1'), deg2: state('#deg2') }
  })
  check(
    'track shorter than the thumb drops the thumb, keeps the arrows',
    deg.deg1.degenerate === 'thumb' &&
      deg.deg1.thumb === 'none' &&
      deg.deg1.button !== 'none',
    JSON.stringify(deg.deg1)
  )
  check(
    'rail too short for its arrows reads as the bare rail',
    deg.deg2.degenerate === 'rail' &&
      deg.deg2.thumb === 'none' &&
      deg.deg2.button === 'none',
    JSON.stringify(deg.deg2)
  )

  // Both axes: horizontal rail + corner cell geometry.
  const b = await railRects(page, '#both', 'horizontal')
  check(
    'horizontal rail is 15px tall with the fixed 16px thumb',
    Math.round(b.rail.height) === 15 * n &&
      Math.round(b.thumb.width) === 16 * n &&
      Math.round(b.thumb.height) === 14 * n,
    `rail ${b.rail.height}, thumb ${b.thumb.width}×${b.thumb.height}`
  )
  check(
    'corner cell is 15×15 in the frame corner',
    b.corner !== null &&
      Math.round(b.corner.width) === 15 * n &&
      Math.round(b.corner.height) === 15 * n,
    b.corner ? `${b.corner.width}×${b.corner.height}` : 'missing'
  )
  const bothPng = decodePng(await page.locator('#both').screenshot())
  check(
    'both-axes rails and corner are 1-bit',
    impureIn(bothPng, (W - 16) * n, 0, W * n, H * n) === 0 &&
      impureIn(bothPng, 0, (H - 16) * n, W * n, H * n) === 0,
    'rail bands'
  )
  await page.close()
}

/* ── 3b. compositions: window edge rails + dialog on-demand rail (dpr 1) ── */
{
  const n = devicePxPerSystemPxAt(1)
  console.log('\ncompositions (dpr 1)')
  const page = await build(
    `<vf-window id="doc" heading="Read Me" scrollbars="both" resizable width="240" height="180" style="position:absolute;top:0;left:0">
       <div style="height:900px;width:900px"></div>
     </vf-window>
     <vf-dialog id="dlg" heading="Info" width="300" height="200">
       <vf-paragraph>Short.</vf-paragraph>
     </vf-dialog>`,
    1
  )

  // The document window's grow box lands exactly over the rail corner cell.
  const geo = await page.evaluate(() => {
    const win = document.querySelector('#doc')
    const area = win.shadowRoot.querySelector('vf-scroll-area')
    const corner = area.shadowRoot
      .querySelector('.vf-rail-corner')
      .getBoundingClientRect()
    const grow = win.shadowRoot
      .querySelector('[part=grow-box]')
      .getBoundingClientRect()
    return {
      corner: [corner.left, corner.top, corner.width, corner.height],
      grow: [grow.left, grow.top, grow.width, grow.height],
    }
  })
  check(
    'grow box sits exactly over the rail corner cell',
    geo.corner.every((v, i) => Math.abs(v - geo.grow[i]) < 0.6),
    JSON.stringify(geo)
  )
  // The edge rails assert real ink headless — the thing the native skin
  // never could. Right rail band of the 240×180 window, below the title bar.
  const doc = decodePng(await page.locator('#doc').screenshot())
  check(
    'document window edge rails are 1-bit',
    impureIn(doc, 224 * n, 20 * n, 240 * n, 176 * n) === 0 &&
      impureIn(doc, 2 * n, 164 * n, 224 * n, 179 * n) === 0,
    'right and bottom rail bands'
  )

  // The dialog rail is on-demand: absent while the content fits, present —
  // with its boxing frame — once it overflows, per the documented contract.
  const railState = () =>
    page.evaluate(() => {
      const root = document.querySelector('#dlg').shadowRoot
      const display = (q) => getComputedStyle(root.querySelector(q)).display
      const content = root.querySelector('.content')
      return {
        rail: display('.vf-rail'),
        frame: display('.scroll-frame'),
        overflowY: getComputedStyle(content).overflowY,
        scrollTop: content.scrollTop,
      }
    })
  await page.evaluate(() => document.querySelector('#dlg').show())
  await page.evaluate(async () => {
    await document.querySelector('#dlg').updateComplete
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
  const fitting = await railState()
  check(
    'fitting dialog shows no rail at all',
    fitting.rail === 'none' && fitting.frame === 'none' &&
      fitting.overflowY === 'hidden',
    JSON.stringify(fitting)
  )
  await page.evaluate(async () => {
    const tall = document.createElement('div')
    tall.style.height = '600px'
    document.querySelector('#dlg').appendChild(tall)
    await document.querySelector('#dlg').updateComplete
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
  const stuffed = await railState()
  check(
    'over-stuffed dialog grows the rail and its boxing frame',
    stuffed.rail === 'grid' && stuffed.frame === 'block' &&
      stuffed.overflowY === 'scroll',
    JSON.stringify(stuffed)
  )
  // …and the rail drives the region: one arrow click, one 16px line.
  const arrow = await page.evaluate(() => {
    const r = document
      .querySelector('#dlg')
      .shadowRoot.querySelector('.vf-rail-button--increment')
      .getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.click(arrow.x, arrow.y)
  const after = await railState()
  check(
    'dialog rail arrow scrolls the content region',
    after.scrollTop === 16 * n,
    `${after.scrollTop}`
  )
  await page.close()
}

/* ── 4. interactions (dpr 1, trusted input) ─────────────────────────────── */
{
  console.log('\ninteractions (dpr 1)')
  const page = await build(
    `<vf-scroll-area id="sa" label="Notes" style="position:absolute;top:0;left:0;${sysSize}">${TALL}</vf-scroll-area>`,
    1
  )
  const scrollTop = () =>
    page.evaluate(
      () => document.querySelector('#sa').shadowRoot.querySelector('.viewport').scrollTop
    )
  const setScrollTop = (v) =>
    page.evaluate((val) => {
      document.querySelector('#sa').shadowRoot.querySelector('.viewport').scrollTop = val
    }, v)

  // Wheel over the viewport scrolls natively.
  await page.mouse.move(80, 80)
  await page.mouse.wheel(0, 120)
  await within(
    page.waitForFunction(
      () =>
        document.querySelector('#sa').shadowRoot.querySelector('.viewport')
          .scrollTop > 0
    ),
    3000
  )
  check('wheel over the viewport scrolls natively', (await scrollTop()) > 0)

  // Arrow click: one 16px line.
  await setScrollTop(100)
  const r = await railRects(page, '#sa')
  const railX = r.rail.left + r.rail.width / 2
  const incY = r.host.top + H - 1 - 7 // middle of the increment cell
  await page.mouse.click(railX, incY)
  check('increment arrow steps one 16px line', (await scrollTop()) === 116, `${await scrollTop()}`)
  const decY = r.host.top + 8
  await page.mouse.click(railX, decY)
  check('decrement arrow steps back one line', (await scrollTop()) === 100, `${await scrollTop()}`)

  // Arrow hold: pressed state + auto-repeat.
  await page.mouse.move(railX, incY)
  await page.mouse.down()
  const pressed = await page.evaluate(
    () =>
      document
        .querySelector('#sa')
        .shadowRoot.querySelector('.vf-rail-button--increment')
        .hasAttribute('data-pressed')
  )
  await page.waitForTimeout(600)
  await page.mouse.up()
  const afterHold = await scrollTop()
  check('held arrow carries data-pressed (solid glyph)', pressed)
  check(
    'held arrow auto-repeats after the hold beat',
    afterHold >= 100 + 16 * 4,
    `${afterHold} after 600ms`
  )
  const released = await page.evaluate(
    () =>
      document
        .querySelector('#sa')
        .shadowRoot.querySelector('.vf-rail-button--increment')
        .hasAttribute('data-pressed')
  )
  check('release clears the pressed state', !released)

  // Trough press: one viewport minus one line, toward the press.
  await setScrollTop(0)
  const r2 = await railRects(page, '#sa')
  const page1 = r2.viewport.clientHeight - 16
  await page.mouse.click(railX, r2.track.top + r2.track.height - 5)
  check(
    'trough press pages by a viewport minus one line',
    (await scrollTop()) === page1,
    `${await scrollTop()} vs ${page1}`
  )

  // Trough hold: keeps paging while held (and the thumb hasn't reached it).
  await setScrollTop(0)
  await page.mouse.move(railX, r2.track.top + r2.track.height - 5)
  await page.mouse.down()
  await page.waitForTimeout(500)
  await page.mouse.up()
  check(
    'held trough press auto-repeats',
    (await scrollTop()) >= page1 * 2,
    `${await scrollTop()}`
  )

  // Thumb drag: live, axis-locked, proportional.
  await setScrollTop(0)
  await page.evaluate(
    () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
  )
  const r3 = await railRects(page, '#sa')
  const range = r3.viewport.scrollHeight - r3.viewport.clientHeight
  const travel = r3.track.height - 16
  const thumbCx = r3.thumb.left + r3.thumb.width / 2
  const thumbCy = r3.thumb.top + r3.thumb.height / 2
  await page.mouse.move(thumbCx, thumbCy)
  await page.mouse.down()
  await page.mouse.move(thumbCx + 30, thumbCy + 40, { steps: 8 }) // +30 x: axis-locked
  const during = await scrollTop()
  await page.mouse.up()
  const expected = (40 / travel) * range
  check(
    'thumb drag scrolls live and axis-locked',
    Math.abs(during - expected) <= range / travel + 1,
    `${during.toFixed(1)} vs ${expected.toFixed(1)}`
  )
  const r4 = await railRects(page, '#sa')
  check(
    'dragged thumb rests on a whole system px',
    Math.abs(
      r4.thumb.top - r4.track.top - Math.round(r4.thumb.top - r4.track.top)
    ) < 0.02,
    `${(r4.thumb.top - r4.track.top).toFixed(3)}`
  )

  // A press on the rail must not move focus (pointer-only chrome).
  await page.evaluate(() => {
    const v = document.querySelector('#sa').shadowRoot.querySelector('.viewport')
    v.focus()
  })
  await page.mouse.click(railX, incY)
  const focusHeld = await page.evaluate(
    () =>
      document.querySelector('#sa').shadowRoot.activeElement?.className.includes(
        'viewport'
      ) ?? false
  )
  check('rail press leaves focus where it was', focusHeld)

  /* ── 5. a11y: rail invisible to AT, viewport contract intact ──────────── */
  const cdp = await ax(page)
  const viewportAx = await axFor(cdp, 'sa', 'viewport')
  check(
    'viewport keeps its region role and name',
    axRole(viewportAx) === 'region' && viewportAx?.name?.value === 'Notes',
    `${axRole(viewportAx)} "${viewportAx?.name?.value}"`
  )
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const railRoles = nodes.filter(
    (node) =>
      !node.ignored &&
      ['scrollbar', 'button', 'slider'].includes(node.role?.value)
  )
  check(
    'no rail part reaches the accessibility tree',
    railRoles.length === 0,
    railRoles.map((node) => node.role.value).join(', ') || 'none'
  )
  const railHidden = await page.evaluate(
    () =>
      document
        .querySelector('#sa')
        .shadowRoot.querySelector('.vf-rail')
        .getAttribute('aria-hidden') === 'true'
  )
  check('rail subtree is aria-hidden', railHidden)
  await page.close()
}

await report(browser)
