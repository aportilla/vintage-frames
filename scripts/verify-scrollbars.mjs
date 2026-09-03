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
 *    (arrows drawn on a bare white channel + divider, no dither/thumb, and
 *    the drawn arrows inert — an active window's no-overflow bar keeps its
 *    arrows) and the inactive-window blanking of both axes, arrows included.
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
 * 7. RECONNECT: a window the desktop's DOM-order sync re-inserts (a raise)
 *    comes back with a live rail — degenerate state cleared on a show, the
 *    thumb still following scroll writes — with the overflow state held
 *    constant across the move, so no re-render masks a dead controller.
 *
 * 8. CONTENT GROWTH: the scrolled plane sizes to its content, so a row
 *    gaining a cell moves the thumb and flips the idle rail live with no
 *    scroll and no resize; copy still wraps; a row nested in an auto-width
 *    wrapper still counts; a sticky child holds; and measure() picks up a
 *    scroll-range change that moves no box.
 *
 * 9. FIXED CHILDREN (dpr 1 and 2): a `fixed` placement holds at its stated
 *    top/left against the viewport on both axes, through vf-window's slot
 *    into the built-in area too; the flow content behind it starts at the
 *    plane's origin and the plane neither grows nor overflows for it; a
 *    stated top past a short plane still lands (the plane is never shorter
 *    than the viewport); and it paints over a later placed sibling.
 *
 *   npm run dev               # in another shell (port 5173)
 *   npm run verify:scrollbars
 */
import {
  check,
  decodePng,
  devicePxPerSystemPxAt,
  impureIn as impurePixels,
  launch,
  makeBuild,
  report,
  scaleAt,
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
/** Impure (neither pure black nor pure white) pixels in a device-px region —
 *  the harness's count, as the bare number this script's checks read. */
const impureIn = (png, x0, y0, x1, y1) => impurePixels(png, x0, y0, x1, y1).impure

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

  // Idle rail: arrows stay drawn (active context), divider stays, and the
  // channel between them is bare — no dither, no thumb.
  const idle = decodePng(await page.locator('#idle').screenshot())
  const idleDividerX = findInk(idle, 100 * n, railLeft - 2)
  const idleRow = (sysY) =>
    sig(rowRuns(idle, sysY * n, idleDividerX, W * n))
  const bare = `b${bd} w${14 * n} b${bd}`
  check(
    'idle rail keeps its arrows (decrement ink on its traced row)',
    runsAgree(
      idleRow(8),
      `b${bd} w${n} b${4 * n} w${4 * n} b${4 * n} w${n} b${bd}`,
      tol
    ),
    idleRow(8)
  )
  check(
    'idle rail: bare white channel on its track rows',
    runsAgree(idleRow(24), bare, tol) && runsAgree(idleRow(100), bare, tol),
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

/* ── 3c. single-axis corner cell + no inset (dpr 1) ─────────────────────── */
{
  const n = devicePxPerSystemPxAt(1)
  console.log('\nsingle-axis corner + no inset (dpr 1)')
  const WIDE = '<div style="height:8px;width:900px"></div>'
  const page = await build(
    `<vf-window id="h" heading="Strip" scrollbars="horizontal" resizable width="240" height="120" style="position:absolute;top:0;left:0">
       ${WIDE}
     </vf-window>
     <vf-window id="v" heading="Column" scrollbars="vertical" resizable width="240" height="120" style="position:absolute;top:0;left:260px">
       ${TALL}
     </vf-window>
     <vf-window id="s" heading="Status" scrollbars="horizontal" resizable width="240" height="120" style="position:absolute;top:140px;left:0">
       ${WIDE}
       <span slot="status">40px x 40px</span>
     </vf-window>
     <vf-window id="fixed" heading="Fixed" scrollbars="horizontal" width="240" height="120" style="position:absolute;top:140px;left:260px">
       ${WIDE}
     </vf-window>
     <vf-scroll-area id="bare" axis="horizontal" style="position:absolute;top:280px;left:0;${sysSize}">
       ${WIDE}
     </vf-scroll-area>
     <vf-window id="c" heading="Header" scrollbars="vertical" resizable header-height="20" width="240" height="120" style="position:absolute;top:280px;left:260px">
       <span slot="header">7 items</span>
       ${TALL}
     </vf-window>`,
    1
  )

  const geo = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return [r.left, r.top, r.width, r.height]
    }
    const areaOf = (id) => {
      const host = document.getElementById(id)
      return host.tagName === 'VF-SCROLL-AREA'
        ? host
        : host.shadowRoot.querySelector('vf-scroll-area')
    }
    const read = (id) => {
      const host = document.getElementById(id)
      const area = areaOf(id)
      const root = area.shadowRoot
      const corner = root.querySelector('.vf-rail-corner')
      const rail = root.querySelector('.vf-rail')
      const viewport = root.querySelector('[part=viewport]')
      const grow = host.shadowRoot?.querySelector('[part=grow-box]')
      const status = host.shadowRoot?.querySelector('[part=status-bar]')
      const header = host.shadowRoot?.querySelector('[part=header]')
      const frame = host.shadowRoot?.querySelector('[part=frame]')
      const content = host.querySelector(':scope > :not([slot])') ?? host.firstElementChild
      return {
        area: rect(area),
        corner: corner ? rect(corner) : null,
        rail: rect(rail),
        grow: grow ? rect(grow) : null,
        status: status ? rect(status) : null,
        header: header && getComputedStyle(header).display !== 'none' ? rect(header) : null,
        frame: frame ? rect(frame) : null,
        content: rect(content),
        padding: getComputedStyle(viewport).paddingLeft,
        cornerFlag: area.hasAttribute('corner'),
      }
    }
    return {
      h: read('h'),
      v: read('v'),
      s: read('s'),
      fixed: read('fixed'),
      bare: read('bare'),
      c: read('c'),
    }
  })
  const same = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.6)
  const eq = (a, b) => Math.abs(a - b) < 0.6

  // Horizontal rail + grow box: the corner cell is reserved, the grow box sits
  // exactly over it, and the rail stops 15px short of the frame's inner edge.
  const h = geo.h
  check(
    'horizontal rail: a resizable window reserves the corner cell',
    h.cornerFlag && h.corner !== null && same(h.corner, h.grow),
    JSON.stringify({ corner: h.corner, grow: h.grow })
  )
  check(
    'horizontal rail stops at the corner cell',
    h.corner !== null &&
      eq(h.rail[0] + h.rail[2], h.corner[0]) &&
      eq(h.corner[0] + h.corner[2], h.area[0] + h.area[2] - n),
    JSON.stringify({ rail: h.rail, corner: h.corner, area: h.area })
  )
  // Vertical rail: the same cell, under the rail's down arrow.
  const v = geo.v
  check(
    'vertical rail: a resizable window reserves the corner cell',
    v.cornerFlag && v.corner !== null && same(v.corner, v.grow),
    JSON.stringify({ corner: v.corner, grow: v.grow })
  )
  check(
    'vertical rail stops at the corner cell',
    v.corner !== null &&
      eq(v.rail[1] + v.rail[3], v.corner[1]) &&
      eq(v.corner[1] + v.corner[3], v.area[1] + v.area[3] - n),
    JSON.stringify({ rail: v.rail, corner: v.corner, area: v.area })
  )
  // With a status strip the grow box lives in the strip: no corner, and the
  // rail runs edge to edge onto the strip's rule.
  const s = geo.s
  check(
    'status strip: no corner cell, the rail runs edge to edge',
    !s.cornerFlag &&
      s.corner === null &&
      eq(s.rail[0] + s.rail[2], s.area[0] + s.area[2] - n) &&
      s.grow[1] >= s.status[1] - 0.6,
    JSON.stringify({ rail: s.rail, area: s.area, grow: s.grow, status: s.status })
  )
  check(
    'a fixed window reserves no corner',
    !geo.fixed.cornerFlag && geo.fixed.corner === null,
    JSON.stringify(geo.fixed.corner)
  )
  // A header spans the whole window width above the rails: the area's top
  // frame line lands on the header's rule (the 1px overhang), so the
  // vertical rail's top arrow begins under the header, and the header runs
  // across the rail's column to the frame's inner edge — the same column the
  // rail ends on.
  const c = geo.c
  check(
    'header: the vertical rail begins under the header',
    c.header !== null &&
      eq(c.header[3], 20 * n) &&
      eq(c.area[1], c.header[1] + c.header[3] - n) &&
      eq(c.rail[1], c.header[1] + c.header[3]) &&
      eq(c.header[0] + c.header[2], c.rail[0] + c.rail[2]),
    JSON.stringify({ header: c.header, rail: c.rail, area: c.area })
  )
  check(
    'header: the grow box still lands in the corner cell',
    c.cornerFlag && c.corner !== null && same(c.corner, c.grow),
    JSON.stringify({ corner: c.corner, grow: c.grow })
  )

  // No inset: the viewport's padding is the border-floor term alone (0 at a
  // whole scale), so content starts at the frame's inner edge — one system
  // px from the window's frame box — in every composition.
  check(
    'the built-in viewport has no inset: content starts inside the frame',
    h.padding === '0px' && eq(h.content[0], h.area[0] + n),
    JSON.stringify({ padding: h.padding, content: h.content, area: h.area })
  )
  check(
    'the status-strip window has none either',
    geo.s.padding === '0px' && eq(geo.s.content[0], geo.s.area[0] + n),
    JSON.stringify({ padding: geo.s.padding })
  )
  check(
    'a bare scroll area has no inset of its own',
    geo.bare.padding === '0px' && eq(geo.bare.content[0], geo.bare.area[0] + n),
    JSON.stringify({ padding: geo.bare.padding })
  )
  check('a bare single-axis scroll area reserves no corner', geo.bare.corner === null)

  // The corner cell and the rail beside it are 1-bit like the rest.
  const strip = decodePng(await page.locator('#h').screenshot())
  check(
    'single-axis rail and corner are 1-bit',
    impureIn(strip, 2 * n, (120 - 16) * n, (240 - 1) * n, (120 - 1) * n) === 0,
    'bottom rail band incl. the corner'
  )
  await page.close()
}

/* ── 3d. reconnect: the desktop's DOM-order sync moves a raised window ──── */
{
  console.log('\nreconnect after a desktop raise (dpr 1)')
  // A raised window that sits before a lower one in the DOM is re-inserted by
  // vf-desktop's sync task (_syncDomOrder), which disconnects and reconnects
  // everything inside it. Lit schedules no update on a reconnect, so a
  // controller that wired only in hostUpdated came back dead. Both fixtures
  // hold the overflow state constant across the raise — a flip re-renders
  // the area, whose hostUpdated re-wires the rail and masks the defect.
  const desktop = (ringStyle, content) => `
    <vf-desktop id="d" width="800" height="600">
      <vf-window id="ring" variant="utility" movable resizable scrollbars="horizontal"
                 width="240" height="120" top="20" left="20" style="${ringStyle}">${content}</vf-window>
      <vf-window id="tools" variant="utility" movable width="120" height="200" top="20" left="400"></vf-window>
      <vf-window id="doc" heading="Doc" movable width="300" height="200" top="250" left="20"></vf-window>
    </vf-desktop>`
  const ringState = (page) =>
    page.evaluate(() => {
      const area = document
        .getElementById('ring')
        .shadowRoot.querySelector('vf-scroll-area')
      const rail = area.shadowRoot.querySelector('.vf-rail--horizontal')
      const viewport = area.shadowRoot.querySelector('.viewport')
      return {
        degenerate: rail.getAttribute('data-degenerate'),
        overflowX: viewport.getAttribute('data-overflow-x'),
        arrowsDrawn:
          getComputedStyle(rail.querySelector('.vf-rail-button--decrement'))
            .display !== 'none',
        thumb: rail.querySelector('.vf-rail-thumb').style.translate,
        first: document.querySelector('#d > vf-window').id,
      }
    })
  // The sync is a 0 ms task after the raise: flush it, then give the shown
  // box's ResizeObserver its frame.
  const settleRaise = async (page) => {
    await page.evaluate(() => new Promise((r) => setTimeout(r, 30)))
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    )
  }
  const scrollRing = (page, x) =>
    page.evaluate((x) => {
      const area = document
        .getElementById('ring')
        .shadowRoot.querySelector('vf-scroll-area')
      area.shadowRoot.querySelector('.viewport').scrollLeft = x
    }, x)

  // (a) Hidden with a row that fits, shown and raised in one tick (a
  // windoid's first open): the rail measured degenerate while hidden and
  // must clear on the show, arrows and all, with nothing else re-rendering.
  {
    const page = await build(
      desktop('display:none', '<div style="height:8px;width:100px"></div>'),
      1
    )
    await page.evaluate(() => {
      const ring = document.getElementById('ring')
      ring.style.display = ''
      document.getElementById('d').bringToFront(ring)
    })
    await settleRaise(page)
    const s = await ringState(page)
    check(
      'raise moved the shown window (fixture premise)',
      s.first !== 'ring',
      `first in DOM: ${s.first}`
    )
    check(
      'shown after a raise: degenerate state cleared, arrows drawn',
      s.degenerate === null && s.arrowsDrawn && s.overflowX === 'false',
      JSON.stringify(s)
    )
    await page.close()
  }

  // (b) Visible and overflowing, raised: the overflow state never changes,
  // and the thumb must still follow scroll writes after the move.
  {
    const page = await build(
      desktop('', '<div style="height:8px;width:900px"></div>'),
      1
    )
    const before = await ringState(page)
    await page.evaluate(() =>
      document.getElementById('d').bringToFront(document.getElementById('ring'))
    )
    await settleRaise(page)
    const moved = await ringState(page)
    check(
      'raise moved the visible window, overflow unchanged (fixture premise)',
      moved.first !== 'ring' &&
        before.overflowX === 'true' &&
        moved.overflowX === 'true',
      `first: ${moved.first}, overflow ${before.overflowX} -> ${moved.overflowX}`
    )
    await scrollRing(page, 300)
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    )
    const scrolled = await ringState(page)
    check(
      'thumb follows scrollLeft after the move',
      scrolled.thumb !== '' && scrolled.thumb !== moved.thumb,
      `${moved.thumb} -> ${scrolled.thumb}`
    )
    await page.close()
  }
}

/* ── 3e. content growth: the scrolled plane sizes to its content ────────── */
{
  console.log('\ncontent growth (dpr 1)')
  // The wrapper the slot renders into is `width: fit-content; min-width:
  // 100%`: never narrower than the viewport, and as wide as content that
  // cannot wrap, so the controllers' ResizeObserver on it sees horizontal
  // growth the way it always saw vertical (a block wrapper's auto width is
  // the viewport's whatever the row does). Copy still wraps: fit-content is
  // the shrink-to-fit width, not max-content.
  const tile = '<div style="width:64px;height:64px;flex:none;background:#000"></div>'
  const row = (count) => `<div id="row" style="display:flex">${tile.repeat(count)}</div>`
  const area = (inner) =>
    `<vf-scroll-area id="sa" axis="horizontal" style="position:absolute;top:0;left:0;width:240px;height:120px">${inner}</vf-scroll-area>`
  const frames = (page) =>
    page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    )
  const state = (page) =>
    page.evaluate(() => {
      const root = document.getElementById('sa').shadowRoot
      const viewport = root.querySelector('.viewport')
      return {
        plane: root.querySelector('.content').getBoundingClientRect().width,
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        overflowX: viewport.getAttribute('data-overflow-x'),
        thumb: root.querySelector('.vf-rail-thumb').style.translate,
      }
    })
  const addTile = (page) =>
    page.evaluate(() => {
      const t = document.createElement('div')
      t.style.cssText = 'width:64px;height:64px;flex:none;background:#000'
      document.getElementById('row').append(t)
    })
  const scrollTo = (page, x) =>
    page.evaluate((x) => {
      document.getElementById('sa').shadowRoot.querySelector('.viewport').scrollLeft = x
    }, x)

  // A row growing while scrolled: the thumb moves with no scroll, no resize.
  {
    const page = await build(area(row(12)), 1)
    await scrollTo(page, 200)
    await frames(page)
    const before = await state(page)
    await addTile(page)
    await frames(page)
    const after = await state(page)
    check(
      'the scrolled plane is as wide as the row',
      Math.abs(before.plane - before.scrollWidth) < 1 &&
        Math.abs(after.plane - after.scrollWidth) < 1,
      `${before.plane}/${before.scrollWidth} -> ${after.plane}/${after.scrollWidth}`
    )
    check(
      'a wider row moves the thumb with no scroll and no resize',
      after.thumb !== before.thumb,
      `${before.thumb} -> ${after.thumb}`
    )
    await page.close()
  }

  // A row that outgrows the viewport flips the idle rail live.
  {
    const page = await build(area(row(3)), 1)
    const idle = await state(page)
    await addTile(page)
    await frames(page)
    const live = await state(page)
    check(
      'idle rail goes live when the row outgrows the viewport',
      idle.overflowX === 'false' && live.overflowX === 'true',
      `${idle.overflowX} -> ${live.overflowX} (${live.scrollWidth} > ${live.clientWidth})`
    )
    await page.close()
  }

  // Copy still wraps: the plane stays the viewport's width and the
  // paragraph keeps its wrapped height.
  {
    const copy =
      '<vf-paragraph>' +
      'The quick brown fox jumps over the lazy dog. '.repeat(12) +
      '</vf-paragraph>'
    const page = await build(area(copy), 1)
    const s = await state(page)
    const p = await page.evaluate(() => {
      const r = document.querySelector('vf-paragraph').getBoundingClientRect()
      return { w: r.width, h: r.height }
    })
    check(
      'copy wraps: the plane stays the viewport width',
      Math.abs(s.plane - s.clientWidth) < 1 && p.w === s.clientWidth && p.h > 3 * 12,
      `plane ${s.plane}, viewport ${s.clientWidth}, paragraph ${p.w}×${p.h}`
    )
    await page.close()
  }

  // The row nested in an auto-width wrapper: intrinsic width propagates up,
  // which an observer on the slotted elements alone could never see.
  {
    const page = await build(area(`<div>${row(12)}</div>`), 1)
    await scrollTo(page, 200)
    await frames(page)
    const before = await state(page)
    await addTile(page)
    await frames(page)
    const after = await state(page)
    check(
      'a row nested in an auto-width wrapper still moves the thumb',
      after.thumb !== before.thumb,
      `${before.thumb} -> ${after.thumb}`
    )
    await page.close()
  }

  // A sticky child's containing block is the whole plane: it holds at the
  // viewport's left edge across the scroll (a controls strip over a row).
  {
    const strip =
      '<div id="strip" style="position:sticky;left:0;width:100px;height:12px;background:#000"></div>'
    const page = await build(area(strip + row(12)), 1)
    await scrollTo(page, 300)
    await frames(page)
    const r = await page.evaluate(() => ({
      strip: document.getElementById('strip').getBoundingClientRect().left,
      viewport: document
        .getElementById('sa')
        .shadowRoot.querySelector('.viewport')
        .getBoundingClientRect().left,
    }))
    check(
      'a sticky child holds at the viewport edge while the row scrolls',
      Math.abs(r.strip - r.viewport) < 2,
      `${r.strip} vs ${r.viewport}`
    )
    await page.close()
  }

  // measure(): a scroll-range change that moves no box — a placed child
  // moved out of view through `left` — is the consumer's to report.
  {
    const page = await build(
      area('<vf-container id="c" top="0" left="0" width="64" height="64"></vf-container>'),
      1
    )
    const idle = await state(page)
    await page.evaluate(() => {
      document.getElementById('c').left = 600
    })
    await page.evaluate(() => document.getElementById('c').updateComplete)
    await frames(page)
    const moved = await state(page)
    await page.evaluate(() => document.getElementById('sa').measure())
    const measured = await state(page)
    check(
      'measure() picks up a placed child moved out of view',
      idle.overflowX === 'false' && measured.overflowX === 'true',
      `${idle.overflowX} -> ${moved.overflowX} (before measure) -> ${measured.overflowX}`
    )
    await page.close()
  }
}

/* ── 3f. fixed children: a placement held against the viewport ─────────── */
{
  console.log('\nfixed children (dpr 1, 2)')
  // `fixed` (src/position.ts) is `position: sticky` with the placement's own
  // offsets and the sticky box's flow footprint erased. What the plane owes
  // it is `min-height: 100%`: a sticky box cannot leave its containing block,
  // so a plane shorter than the viewport would clamp a stated top to the
  // plane's bottom edge.
  const frames = (page) =>
    page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    )
  const tall = '<div id="flow" style="height:1000px;background:#ddd"></div>'
  const wide = '<div id="flow" style="height:1000px;width:1500px;background:#ddd"></div>'
  const short = '<div id="flow" style="height:50px"></div>'
  const s1 = '<vf-button id="s1" fixed top="10" left="10">Tool</vf-button>'
  const s2 = '<vf-label id="s2" fixed top="40" left="150">Sticky label</vf-label>'
  const over = '<vf-container id="over" top="10" left="10" width="100" height="30"></vf-container>'
  const areaOf = (inner, attrs = '') =>
    `<vf-scroll-area id="sa" ${attrs} style="width:300px;height:200px">${inner}</vf-scroll-area>`
  const SA = `document.getElementById('sa')`
  const WIN_SA = `document.getElementById('win').shadowRoot.querySelector('vf-scroll-area')`
  /** Everything relative to the viewport's content origin (padding included). */
  const measure = (page, saExpr = SA) =>
    page.evaluate(`(() => {
      const sa = ${saExpr}
      const vp = sa.shadowRoot.querySelector('.viewport')
      const plane = sa.shadowRoot.querySelector('.content').getBoundingClientRect()
      const vr = vp.getBoundingClientRect()
      const cs = getComputedStyle(vp)
      const ox = vr.left + parseFloat(cs.paddingLeft)
      const oy = vr.top + parseFloat(cs.paddingTop)
      const rel = (id) => {
        const e = document.getElementById(id)
        if (!e) return null
        const r = e.getBoundingClientRect()
        return { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height }
      }
      const hit = document.elementFromPoint(ox + 15, oy + 15)
      return {
        s1: rel('s1'), s2: rel('s2'), flow: rel('flow'),
        planeW: plane.width, planeH: plane.height,
        overflowY: vp.dataset.overflowY,
        hit: hit && (hit.id || hit.tagName.toLowerCase()),
      }
    })()`)
  const scrollTo = async (page, y, x = 0, saExpr = SA) => {
    await page.evaluate(`(() => {
      const vp = ${saExpr}.shadowRoot.querySelector('.viewport')
      vp.scrollTop = ${y}; vp.scrollLeft = ${x}
    })()`)
    await frames(page)
  }
  const near = (a, b) => Math.abs(a - b) < 1 / 64 + 1e-6
  const at = (r, x, y, k) => r && near(r.x, x * k) && near(r.y, y * k)
  const fmt = (r) => (r ? `(${r.x},${r.y})` : 'missing')

  for (const dpr of [1, 2]) {
    const k = scaleAt(dpr)
    const tag = `dpr ${dpr}:`

    // Two fixed children over tall copy: both hold, the copy starts at the
    // plane's origin, the plane is the copy's box and nothing else.
    {
      const page = await build(areaOf(s1 + s2 + tall), dpr)
      let m = await measure(page)
      check(
        `${tag} two fixed children sit at their stated top/left`,
        at(m.s1, 10, 10, k) && at(m.s2, 150, 40, k),
        `${fmt(m.s1)} ${fmt(m.s2)}`
      )
      check(
        `${tag} the flow content behind them starts at the plane origin`,
        m.flow.x === 0 && m.flow.y === 0,
        fmt(m.flow)
      )
      check(
        `${tag} the plane is the flow content's box — no footprint, no growth`,
        near(m.planeW, m.flow.w) && near(m.planeH, 1000),
        `plane ${m.planeW}×${m.planeH}, flow ${m.flow.w}×${m.flow.h}`
      )
      await scrollTo(page, 300)
      m = await measure(page)
      check(
        `${tag} …and hold there after a 300px scroll`,
        at(m.s1, 10, 10, k) && at(m.s2, 150, 40, k) && near(m.flow.y, -300),
        `${fmt(m.s1)} ${fmt(m.s2)} flow at ${m.flow.y}`
      )
      check(`${tag} a fixed child is what the pointer finds over it`, m.hit === 's1', String(m.hit))
      await page.close()
    }

    // Both axes: a wide row grows the plane, the fixed child holds on X too.
    {
      const page = await build(areaOf(s1 + wide, 'axis="both"'), dpr)
      await scrollTo(page, 300, 200)
      const m = await measure(page)
      check(
        `${tag} holds on both axes over a plane the row grew`,
        near(m.planeW, 1500) && at(m.s1, 10, 10, k) && near(m.flow.x, -200) && near(m.flow.y, -300),
        `plane ${m.planeW}, s1 ${fmt(m.s1)}, flow ${fmt(m.flow)}`
      )
      await page.close()
    }

    // Short content: the stated top is past the content's height and still
    // lands, and the plane's min-height adds no overflow.
    {
      const page = await build(
        areaOf('<vf-button id="s1" fixed top="100" left="10">Tool</vf-button>' + short),
        dpr
      )
      const m = await measure(page)
      check(
        `${tag} a stated top past a short plane still lands`,
        at(m.s1, 10, 100, k),
        fmt(m.s1)
      )
      check(
        `${tag} …and the plane's viewport-height floor overflows nothing`,
        m.overflowY === 'false',
        `overflow-y ${m.overflowY}`
      )
      await page.close()
    }

    // Through vf-window[scrollbars]: the child crosses the window's slot into
    // the built-in area and holds against its viewport.
    {
      const page = await build(
        `<vf-window id="win" heading="Doc" width="300" height="200" scrollbars="vertical">${s1 + tall}</vf-window>`,
        dpr
      )
      await scrollTo(page, 300, 0, WIN_SA)
      const m = await measure(page, WIN_SA)
      check(
        `${tag} holds inside vf-window[scrollbars] too`,
        at(m.s1, 10, 10, k) && near(m.flow.y, -300),
        `${fmt(m.s1)} flow at ${m.flow.y}`
      )
      await page.close()
    }

    // Paint order: a later placed sibling over the same spot loses to it.
    {
      const page = await build(areaOf(s1 + over + tall), dpr)
      const m = await measure(page)
      check(
        `${tag} paints over a later placed sibling`,
        m.hit === 's1',
        `pointer finds ${m.hit}`
      )
      await page.close()
    }
  }
}

/* ── 4. interactions (dpr 1, trusted input) ─────────────────────────────── */
{
  console.log('\ninteractions (dpr 1)')
  const page = await build(
    `<vf-scroll-area id="sa" label="Notes" style="position:absolute;top:0;left:0;${sysSize}">${TALL}</vf-scroll-area>
     <vf-scroll-area id="idle" style="position:absolute;top:0;left:600px;${sysSize}">${SHORT}</vf-scroll-area>`,
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

  // The idle rail's arrows are drawn (active context) but inert: a press
  // neither hilites the glyph nor scrolls — there is nothing to drive.
  const idleR = await railRects(page, '#idle')
  await page.mouse.move(
    idleR.rail.left + idleR.rail.width / 2,
    idleR.host.top + 8
  )
  await page.mouse.down()
  const idleState = await page.evaluate(() => {
    const btn = document
      .querySelector('#idle')
      .shadowRoot.querySelector('.vf-rail-button--decrement')
    return {
      drawn: getComputedStyle(btn).display !== 'none',
      pressed: btn.hasAttribute('data-pressed'),
    }
  })
  await page.mouse.up()
  check(
    'idle arrows are drawn but inert (no pressed state)',
    idleState.drawn && !idleState.pressed,
    JSON.stringify(idleState)
  )

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
