/**
 * Verifies `vf-stack` — the kit's layout primitive.
 *
 * It exists because a consumer's stylesheet often *cannot* say "8 system px".
 * Scaling is default-on and per component: `ScaleController` sets `--vf-scale`
 * on the component's own host, not on the document, so `var(--vf-scale, 1)` in
 * page CSS resolves only where the rule's element happens to sit inside a `vf-*`
 * ancestor and inherit it. Inside a window body it does; for a plain `<div>`
 * holding two buttons on an ordinary page it does not, and the fallback `1`
 * silently renders an 8px gap around 3×-sized controls. Seven groups:
 *
 *  - SYSTEM PX: `gap` and `pad` measure exactly N × 3 device px at dpr 1, 2 and
 *    3 — the whole claim, in the one unit the art is drawn in.
 *  - SCOPE: the A/B. A stack with no `vf-*` ancestor spaces correctly; a
 *    hand-written `calc(var(--vf-scale, 1) * Npx)` div beside it does not. If
 *    this ever reads "both correct", the fixture stopped reproducing the fault
 *    and the check is worthless.
 *  - GEOMETRY: the content governs the box — a column is as wide as its widest
 *    child, a row as tall as its tallest, and neither claims a parent's width
 *    it was never given. The box shrink-wraps while staying block-level, so it
 *    never sits on a line box and picks up its parent's leading.
 *  - FILL: `fill-width`/`fill-height` name the outcome, so each resolves to the
 *    main axis or the cross axis by direction. The cross axis always has a size;
 *    the main axis only has slack if one was declared, and a fill with nothing
 *    to take is inert rather than an error. A stack reads both about itself,
 *    for the parents that aren't stacks.
 *  - AXES: `place` defaults per direction (start down a column, center across a
 *    row) and each named value lands — including the safety net that an
 *    unrecognized value falls back to the default instead of stretching.
 *  - NESTING: a nested stack keeps its own gap rather than inheriting one.
 *  - TRANSPARENCY: the stack imposes no face, line box or color on what it
 *    wraps — a layout box must not change how content reads.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:stack
 */
import {
  check,
  devicePxPerSystemPxAt,
  launch,
  makeBuild,
  results,
  scaleAt,
  devicePxFor,
} from './harness.mjs'

const DENSITIES = (process.env.VF_STACK_DPR ?? '1,2,3').split(',').map(Number)

/**
 * Device pixels per system pixel at the density under test — derived, not
 * constant (src/zoom.ts): 1 at dpr 1, 3 at dpr 2, 4 at dpr 3. Reassigned at the
 * top of each density's pass below.
 */
let DEVICE_PX_PER_SYSTEM_PX = devicePxPerSystemPxAt(1)

const browser = await launch()

/** Markup FIRST, module SECOND — the same upgrade order as the other scripts. */
const build = makeBuild(browser, { settle: true })
const rect = (page, id) =>
  page.evaluate((i) => {
    const r = document.getElementById(i).getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom }
  }, id)

/** The CSS-px space between two stacked boxes. */
async function gapBetween(page, a, b, axis = 'y') {
  const [ra, rb] = await Promise.all([rect(page, a), rect(page, b)])
  return axis === 'y' ? rb.y - ra.bottom : rb.x - ra.right
}

const widths = (page, ids) =>
  page.evaluate(
    (list) =>
      Object.fromEntries(
        list.map((i) => [i, document.getElementById(i).getBoundingClientRect().width])
      ),
    ids
  )

const heights = (page, ids) =>
  page.evaluate(
    (list) =>
      Object.fromEntries(
        list.map((i) => [i, document.getElementById(i).getBoundingClientRect().height])
      ),
    ids
  )

const near = (a, b) => Math.abs(a - b) < 0.001

/* ── SYSTEM PX ────────────────────────────────────────────────────────────
   One system px is DEVICE_PX_PER_SYSTEM_PX device px at every density, by the
   scale contract (scale × dpr is always 3). A gap declared as N system px must
   therefore measure exactly N × 3 device px — whatever the display is doing. */

for (const dpr of DENSITIES) {
  DEVICE_PX_PER_SYSTEM_PX = devicePxPerSystemPxAt(dpr)
  const page = await build(
    `
    <vf-stack id="col" gap="12">
      <div id="a" style="height:12px"></div>
      <div id="b" style="height:12px"></div>
    </vf-stack>
    <vf-stack id="row" direction="row" gap="7">
      <div id="c" style="width:12px;height:12px"></div>
      <div id="d" style="width:12px;height:12px"></div>
    </vf-stack>
    <vf-stack id="padded" pad="10 4 6 2"><div id="e" style="height:12px"></div></vf-stack>
  `,
    dpr
  )

  // On a true 3× device the scale is 4/3, which the engine's 1/64-CSS-px
  // layout grid cannot hold, so the figure to assert is the ideal SNAPPED to
  // that grid — exact, rather than the ideal with a tolerance hung off it.
  // Every scale a 1× or 2× display derives, at any zoom, is holdable and this
  // resolves to the ideal itself.
  const scale = scaleAt(dpr)
  const colGap = (await gapBetween(page, 'a', 'b')) * dpr
  check(
    `dpr ${dpr}: gap="12" down a column is 12 system px`,
    near(colGap, devicePxFor(12, scale, dpr)),
    `${colGap} device px`
  )

  const rowGap = (await gapBetween(page, 'c', 'd', 'x')) * dpr
  check(
    `dpr ${dpr}: gap="7" across a row is 7 system px`,
    near(rowGap, devicePxFor(7, scale, dpr)),
    `${rowGap} device px`
  )

  const pads = await page.evaluate((d) => {
    const s = getComputedStyle(document.getElementById('padded'))
    return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(
      (v) => parseFloat(v) * d
    )
  }, dpr)
  // The ideal, not the grid-snapped figure the gaps above use: padding is read
  // back through getComputedStyle, which resolves the calc() at full precision.
  // Only a *used* value — what getBoundingClientRect reports — is quantized.
  const want = [10, 4, 6, 2].map((n) => n * DEVICE_PX_PER_SYSTEM_PX)
  check(
    `dpr ${dpr}: pad="10 4 6 2" is CSS shorthand order, in system px`,
    pads.every((v, i) => near(v, want[i])),
    `${pads.join('/')} device px`
  )

  await page.close()
}

// Every group below builds at the default density, so put the target back.
DEVICE_PX_PER_SYSTEM_PX = devicePxPerSystemPxAt(1)

/* ── SCOPE ────────────────────────────────────────────────────────────────
   The fixture that justifies the component. This page sets no --vf-scale and
   calls no applyScale(), so nothing but a vf-* host has one in scope. The
   stack spaces its children in system px anyway; the hand-written calc()
   beside it silently falls back to 1 and comes out too tight.

   Built at dpr 2 deliberately: the kit derives its scale from the display, and
   at dpr 1 that derivation IS 1 — the same number the fallback produces — so
   the fixture would agree with the bug it exists to catch. At dpr 2 the scale
   is 1.5 and the two answers separate. */

{
  const SCOPE_DPR = 2
  const scope = scaleAt(SCOPE_DPR)
  const page = await build(
    `
    <vf-stack id="s" gap="12">
      <div id="sa" style="height:12px"></div>
      <div id="sb" style="height:12px"></div>
    </vf-stack>
    <div style="display:flex;flex-direction:column;gap:calc(var(--vf-scale, 1) * 12px)">
      <div id="ha" style="height:12px"></div>
      <div id="hb" style="height:12px"></div>
    </div>
  `,
    SCOPE_DPR
  )

  const stackGap = await gapBetween(page, 'sa', 'sb')
  const handGap = await gapBetween(page, 'ha', 'hb')
  check(
    'scope: a stack with no vf-* ancestor still spaces in system px',
    near(stackGap, 12 * scope),
    `${stackGap}px CSS`
  )
  check(
    'scope: the hand-written calc() beside it does NOT (fixture still bites)',
    near(handGap, 12) && handGap < stackGap,
    `${handGap}px CSS — the --vf-scale fallback of 1`
  )
  await page.close()
}

/* ── GEOMETRY ─────────────────────────────────────────────────────────────
   The content governs the box. A column is as wide as its widest child and a
   row as tall as its tallest; nothing is stretched to a size nobody declared.
   The box shrink-wraps (width: fit-content) while staying BLOCK-level, which is
   the difference between "as big as its content" and "as big as its content,
   plus whatever leading the parent's line box imposes on an inline-level box
   shorter than the strut" — 2 system px, in the case that found it. */

{
  const page = await build(`
    <div style="width:600px">
      <vf-stack id="col">
        <div id="narrow" style="width:80px;height:12px"></div>
        <div id="wide" style="width:140px;height:12px"></div>
      </vf-stack>
    </div>
    <div style="height:300px">
      <vf-stack id="row" direction="row">
        <div id="short" style="width:12px;height:20px"></div>
        <div id="tall" style="width:12px;height:44px"></div>
      </vf-stack>
    </div>
    <vf-stack id="sized" width="260" height="90"><div style="height:12px"></div></vf-stack>
    <!-- an 18px stack inside a 40px line box: block-level, so it takes 18 -->
    <div id="leading" style="font-size:16px;line-height:40px;width:300px">
      <vf-stack id="shortstack"><div style="width:20px;height:18px"></div></vf-stack>
    </div>
  `)

  const col = await rect(page, 'col')
  check(
    'geometry: a column is as wide as its widest child',
    near(col.w, 140),
    `${col.w}px, the widest child being 140`
  )
  check(
    'geometry: …and does not take its parent’s width (shrink-wrapped)',
    col.w < 600,
    `${col.w}px inside a 600px block`
  )

  const row = await rect(page, 'row')
  check(
    'geometry: a row is as tall as its tallest child',
    near(row.h, 44),
    `${row.h}px, the tallest child being 44`
  )
  check(
    'geometry: …and does not take its parent’s height',
    row.h < 300,
    `${row.h}px inside a 300px block`
  )

  const display = await page.evaluate(
    () => getComputedStyle(document.getElementById('col')).display
  )
  check('geometry: the host is block-level flex', display === 'flex', display)

  // The regression this rule exists for: inline-level, this box sat on a line
  // box it could not be shorter than, and a short stack silently gained the
  // parent's leading. Block-level, an 18px stack in a 40px line box is 18px,
  // and the block around it is 18px too.
  const [shortStack, leading] = await Promise.all([
    rect(page, 'shortstack'),
    rect(page, 'leading'),
  ])
  check(
    'geometry: a stack shorter than its parent’s line box gains no leading',
    near(shortStack.h, 18) && near(leading.h, 18),
    `${shortStack.h}px stack in a ${leading.h}px block, line-height 40`
  )

  const sized = await rect(page, 'sized')
  check(
    'geometry: a declared width/height overrides the content, in system px',
    near(sized.w, 260 * DEVICE_PX_PER_SYSTEM_PX) &&
      near(sized.h, 90 * DEVICE_PX_PER_SYSTEM_PX),
    `${sized.w} × ${sized.h} CSS px at scale 3`
  )
  await page.close()
}

/* ── FILL ─────────────────────────────────────────────────────────────────
   fill-width and fill-height name the OUTCOME, not an axis: each compiles to
   the main axis or the cross axis depending on which way the stack runs, so
   the markup means the same thing wherever it lands. What follows from that is
   one rule about geometry rather than vocabulary — the cross axis always has a
   size, the main axis only has slack if one was declared. */

{
  const page = await build(`
    <!-- cross axis: a column's width always exists, so this always works -->
    <vf-stack id="c1" style="width:200px">
      <div id="c1fill" fill-width style="height:12px"></div>
      <div id="c1keep" style="width:40px;height:12px"></div>
    </vf-stack>

    <!-- main axis: a row divides the slack a declared width creates -->
    <vf-stack id="r1" direction="row" gap="10" style="width:300px">
      <div id="r1fixed" style="width:80px;height:12px"></div>
      <div id="r1fill" fill-width style="height:12px"></div>
    </vf-stack>

    <!-- …and with no declared width there is no slack: inert, not an error -->
    <vf-stack id="r2" direction="row" gap="10">
      <div id="r2fixed" style="width:80px;height:12px"></div>
      <div id="r2fill" fill-width style="width:40px;height:12px"></div>
    </vf-stack>

    <!-- two main-axis fills come out equal (the zeroed flex basis) -->
    <vf-stack id="r3" direction="row">
      <div id="r3a" fill-width style="width:40px;height:12px"></div>
      <div id="r3b" fill-width style="width:120px;height:12px"></div>
    </vf-stack>

    <!-- the mirror image, down the other axis -->
    <vf-stack id="c2" style="height:200px">
      <div id="c2top" style="height:40px;width:12px"></div>
      <div id="c2fill" fill-height style="width:12px"></div>
    </vf-stack>
    <vf-stack id="r4" direction="row">
      <div id="r4tall" style="height:50px;width:12px"></div>
      <div id="r4fill" fill-height style="width:12px"></div>
    </vf-stack>

    <!-- a stack reads both about itself, for parents that aren't stacks -->
    <div style="width:500px">
      <vf-stack id="self" fill-width><div style="width:10px;height:12px"></div></vf-stack>
    </div>
    <div style="height:240px">
      <vf-stack id="selftall" fill-height><div style="width:10px;height:12px"></div></vf-stack>
    </div>
  `)

  const w = await widths(page, [
    'c1fill',
    'c1keep',
    'r1fill',
    'r2fill',
    'r3a',
    'r3b',
    'self',
  ])
  const h = await heights(page, ['c2fill', 'r4fill', 'selftall'])

  check(
    'fill: fill-width down a column takes the stack’s width',
    near(w.c1fill, 200),
    `${w.c1fill}px of 200`
  )
  check(
    'fill: a child that asks for nothing keeps its own size',
    near(w.c1keep, 40),
    `${w.c1keep}px`
  )
  check(
    'fill: fill-width across a row divides the declared slack',
    near(w.r1fill, 300 - 80 - 10 * DEVICE_PX_PER_SYSTEM_PX),
    `${w.r1fill}px of ${300 - 80 - 30} expected`
  )
  check(
    'fill: …and is inert in a row with no width to divide',
    near(w.r2fill, 40),
    `${w.r2fill}px — its own size, there being no slack`
  )
  check(
    'fill: two main-axis fills come out equal',
    near(w.r3a, w.r3b),
    `${w.r3a}px / ${w.r3b}px from natural widths of 40 and 120`
  )
  check(
    'fill: fill-height down a column divides the declared slack',
    near(h.c2fill, 160),
    `${h.c2fill}px of 160`
  )
  check(
    'fill: fill-height across a row takes the stack’s height',
    near(h.r4fill, 50),
    `${h.r4fill}px of the tallest child’s 50`
  )
  check(
    'fill: a stack fills a parent that is not a stack',
    near(w.self, 500) && near(h.selftall, 240),
    `${w.self}px wide of 500, ${h.selftall}px tall of 240`
  )
  await page.close()
}

/* ── AXES ─────────────────────────────────────────────────────────────────
   place is the only placement the stack owns, and its default is the one
   piece of behavior that reads differently per direction — a column of fields
   starts at the panel edge, a caption beside a control centers on it. */

{
  const page = await build(`
    <vf-stack id="colauto" style="width:200px">
      <div id="cauto" style="width:40px;height:12px"></div>
    </vf-stack>
    <vf-stack id="rowauto" direction="row" style="width:200px;height:60px">
      <div id="rauto" style="width:12px;height:12px"></div>
    </vf-stack>
    <vf-stack id="colcenter" place="center" style="width:200px">
      <div id="ccenter" style="width:40px;height:12px"></div>
    </vf-stack>
    <vf-stack id="colend" place="end" style="width:200px">
      <div id="cend" style="width:40px;height:12px"></div>
    </vf-stack>
    <vf-stack id="rowstart" direction="row" place="start" style="width:200px;height:60px">
      <div id="rstart" style="width:12px;height:12px"></div>
    </vf-stack>
    <vf-stack id="stale" place="stretch" style="width:200px">
      <div id="staleChild" style="width:40px;height:12px"></div>
    </vf-stack>
  `)

  const [colauto, cauto] = await Promise.all([rect(page, 'colauto'), rect(page, 'cauto')])
  check(
    'axes: a column starts its children by default',
    near(cauto.x, colauto.x) && near(cauto.w, 40),
    `${cauto.x - colauto.x}px from the left edge, ${cauto.w}px wide (not stretched)`
  )

  const [rowauto, rauto] = await Promise.all([rect(page, 'rowauto'), rect(page, 'rauto')])
  check(
    'axes: a row centers its children by default',
    near(rauto.y - rowauto.y, (rowauto.h - rauto.h) / 2),
    `${(rauto.y - rowauto.y).toFixed(1)}px from the top of a ${rowauto.h}px row`
  )

  const [colcenter, ccenter] = await Promise.all([
    rect(page, 'colcenter'),
    rect(page, 'ccenter'),
  ])
  check(
    'axes: place="center" centers on the cross axis',
    near(ccenter.x - colcenter.x, (colcenter.w - ccenter.w) / 2),
    `${ccenter.x - colcenter.x}px from the left of a 200px column`
  )

  const [colend, cend] = await Promise.all([rect(page, 'colend'), rect(page, 'cend')])
  check(
    'axes: place="end" is what a right-aligned action row is made of',
    near(cend.right, colend.right),
    `right edges ${cend.right} / ${colend.right}`
  )

  const [rowstart, rstart] = await Promise.all([rect(page, 'rowstart'), rect(page, 'rstart')])
  check(
    'axes: place="start" overrides a row’s centering default',
    near(rstart.y, rowstart.y),
    `${rstart.y - rowstart.y}px from the top`
  )

  const staleChild = await rect(page, 'staleChild')
  check(
    'axes: an unrecognized place falls back to the default, never to stretch',
    near(staleChild.w, 40),
    `place="stretch" left the 40px child at ${staleChild.w}px`
  )
  await page.close()
}

/* ── NESTING ──────────────────────────────────────────────────────────────
   The gap is written as the real (non-inherited) CSS property rather than a
   custom property, precisely so a nested stack never picks up its parent's
   spacing. A tokenized gap would have. */

{
  const page = await build(`
    <vf-stack id="outer" gap="24">
      <div id="oa" style="height:12px"></div>
      <vf-stack id="inner">
        <div id="ia" style="height:12px"></div>
        <div id="ib" style="height:12px"></div>
      </vf-stack>
    </vf-stack>
  `)
  const outerGap = await gapBetween(page, 'oa', 'inner')
  const innerGap = await gapBetween(page, 'ia', 'ib')
  check(
    'nesting: the outer gap applies',
    near(outerGap, 24 * DEVICE_PX_PER_SYSTEM_PX),
    `${outerGap}px CSS`
  )
  check('nesting: the inner stack keeps its own default of 0', near(innerGap, 0), `${innerGap}px CSS`)
  await page.close()
}

/* ── TRANSPARENCY ─────────────────────────────────────────────────────────
   vfBase dresses a host as chrome (body face, a 1.25 ratio line box, black,
   unselectable). A stack holds no text of its own, so wrapping content in one
   must not change how that content reads — and a ratio line-height landing on
   slotted prose is the exact rule-2 fault the kit warns pages about. */

{
  const page = await build(`
    <div style="font-family: Georgia, serif; font-size: 17px; line-height: 28px; color: rgb(20, 20, 20)">
      <p id="outside">Ordinary page copy.</p>
      <vf-stack><p id="inside">Ordinary page copy.</p></vf-stack>
    </div>
    <vf-stack id="ends" place="end"><p id="endcopy">Copy in an action row.</p></vf-stack>
    <vf-stack id="centers" place="center"><p id="centercopy">Copy in a centered stack.</p></vf-stack>
    <vf-stack id="legacy" align="end"><p id="legacycopy">Copy under the old spelling.</p></vf-stack>
    <div style="text-align: right">
      <vf-stack id="rightish"><p id="rightcopy">The page’s own alignment.</p></vf-stack>
    </div>
    <vf-window id="win" heading="W" width="200" height="120">
      <p id="inwindow">Chrome copy.</p>
      <vf-stack><p id="instack">Chrome copy.</p></vf-stack>
    </vf-window>
  `)

  const styles = await page.evaluate(() =>
    ['outside', 'inside', 'inwindow', 'instack'].map((id) => {
      const s = getComputedStyle(document.getElementById(id))
      return {
        id,
        font: s.fontFamily,
        line: s.lineHeight,
        color: s.color,
        select: s.userSelect,
      }
    })
  )
  const by = Object.fromEntries(styles.map((s) => [s.id, s]))
  const same = (a, b) =>
    a.font === b.font && a.line === b.line && a.color === b.color && a.select === b.select

  check(
    'transparency: a stack imposes nothing on page copy',
    same(by.outside, by.inside),
    `${by.inside.font.split(',')[0]} / ${by.inside.line} / ${by.inside.color}`
  )
  check(
    'transparency: inside a window it still inherits the window',
    same(by.inwindow, by.instack),
    `${by.instack.font.split(',')[0]} / ${by.instack.line} / select ${by.inwindow.select} vs ${by.instack.select}`
  )

  // Why the cross-axis attribute is `place` and not `align`: `align` is a
  // legacy HTML presentation attribute, and Blink maps it to text-align on ANY
  // element — so align="end" right-aligned every run of copy inside an action
  // row, and align="center" centered it. The rename is the fix; the host's
  // text-align reset is the belt, checked here against the old spelling so
  // markup that predates the rename stays harmless. The last case proves the
  // reset didn't also swallow the page's own alignment.
  const aligned = await page.evaluate(() =>
    ['endcopy', 'centercopy', 'legacycopy', 'rightcopy'].map(
      (id) => getComputedStyle(document.getElementById(id)).textAlign
    )
  )
  check(
    'transparency: place= does not touch text-align',
    aligned[0] === 'start' && aligned[1] === 'start',
    `place="end" → ${aligned[0]}, place="center" → ${aligned[1]}`
  )
  check(
    'transparency: the legacy align= spelling is neutralized too',
    aligned[2] === 'start',
    `align="end" → ${aligned[2]}`
  )
  check(
    'transparency: …and the page’s own text-align still passes through',
    aligned[3] === 'right',
    `${aligned[3]}`
  )
  await page.close()
}

await browser.close()

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
