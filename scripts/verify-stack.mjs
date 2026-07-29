/**
 * Verifies `vf-stack` — the kit's layout primitive.
 *
 * It exists because a consumer's stylesheet often *cannot* say "8 system px".
 * Scaling is default-on and per component: `ScaleController` sets `--vf-scale`
 * on the component's own host, not on the document, so `var(--vf-scale, 1)` in
 * page CSS resolves only where the rule's element happens to sit inside a `vf-*`
 * ancestor and inherit it. Inside a window body it does; for a plain `<div>`
 * holding two buttons on an ordinary page it does not, and the fallback `1`
 * silently renders an 8px gap around 3×-sized controls. Six groups:
 *
 *  - SYSTEM PX: `gap` and `pad` measure exactly N × 3 device px at dpr 1, 2 and
 *    3 — the whole claim, in the one unit the art is drawn in.
 *  - SCOPE: the A/B. A stack with no `vf-*` ancestor spaces correctly; a
 *    hand-written `calc(var(--vf-scale, 1) * Npx)` div beside it does not. If
 *    this ever reads "both correct", the fixture stopped reproducing the fault
 *    and the check is worthless.
 *  - CHILDREN: `grow` takes the slack, and a plain child does not shrink —
 *    classic boxes are the size they are.
 *  - AXES: `align="auto"` resolves per direction (stretch in a column, center
 *    in a row), and each named `align`/`justify` value lands.
 *  - NESTING: a nested stack keeps its own gap rather than inheriting one.
 *  - TRANSPARENCY: the stack imposes no face, line box or color on what it
 *    wraps — a layout box must not change how content reads.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:stack
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'
const DENSITIES = (process.env.VF_STACK_DPR ?? '1,2,3').split(',').map(Number)

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

/** The CSS-px space between two stacked boxes. */
async function gapBetween(page, a, b, axis = 'y') {
  const [ra, rb] = await Promise.all([rect(page, a), rect(page, b)])
  return axis === 'y' ? rb.y - ra.bottom : rb.x - ra.right
}

const CELL = '<div class="cell" style="width:40px;height:12px;background:#000"></div>'

/* ── SYSTEM PX ────────────────────────────────────────────────────────────
   One system px is DEVICE_PX_PER_SYSTEM_PX device px at every density, by the
   scale contract (scale × dpr is always 3). A gap declared as N system px must
   therefore measure exactly N × 3 device px — whatever the display is doing. */

for (const dpr of DENSITIES) {
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

  const colGap = (await gapBetween(page, 'a', 'b')) * dpr
  check(
    `dpr ${dpr}: gap="12" down a column is 12 system px`,
    Math.abs(colGap - 12 * DEVICE_PX_PER_SYSTEM_PX) < 0.001,
    `${colGap} device px`
  )

  const rowGap = (await gapBetween(page, 'c', 'd', 'x')) * dpr
  check(
    `dpr ${dpr}: gap="7" across a row is 7 system px`,
    Math.abs(rowGap - 7 * DEVICE_PX_PER_SYSTEM_PX) < 0.001,
    `${rowGap} device px`
  )

  const pads = await page.evaluate((d) => {
    const s = getComputedStyle(document.getElementById('padded'))
    return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(
      (v) => parseFloat(v) * d
    )
  }, dpr)
  const want = [10, 4, 6, 2].map((n) => n * DEVICE_PX_PER_SYSTEM_PX)
  check(
    `dpr ${dpr}: pad="10 4 6 2" is CSS shorthand order, in system px`,
    pads.every((v, i) => Math.abs(v - want[i]) < 0.001),
    `${pads.join('/')} device px`
  )

  await page.close()
}

/* ── SCOPE ────────────────────────────────────────────────────────────────
   The fixture that justifies the component. This page sets no --vf-scale and
   calls no applyScale(), so nothing but a vf-* host has one in scope. The
   stack spaces its children in system px anyway; the hand-written calc()
   beside it silently falls back to 1 and comes out 3× too tight. */

{
  const page = await build(`
    <vf-stack id="s" gap="12">
      <div id="sa" style="height:12px"></div>
      <div id="sb" style="height:12px"></div>
    </vf-stack>
    <div style="display:flex;flex-direction:column;gap:calc(var(--vf-scale, 1) * 12px)">
      <div id="ha" style="height:12px"></div>
      <div id="hb" style="height:12px"></div>
    </div>
  `)

  const stackGap = await gapBetween(page, 'sa', 'sb')
  const handGap = await gapBetween(page, 'ha', 'hb')
  check(
    'scope: a stack with no vf-* ancestor still spaces in system px',
    Math.abs(stackGap - 12 * DEVICE_PX_PER_SYSTEM_PX) < 0.001,
    `${stackGap}px CSS`
  )
  check(
    'scope: the hand-written calc() beside it does NOT (fixture still bites)',
    Math.abs(handGap - 12) < 0.001 && handGap < stackGap,
    `${handGap}px CSS — the --vf-scale fallback of 1`
  )
  await page.close()
}

/* ── CHILDREN ─────────────────────────────────────────────────────────────
   No shrinking by default (a window is a fixed box whose overflow is clipped,
   not a layout that squeezes its controls); `grow` is the opt-in. */

{
  const page = await build(`
    <vf-stack id="r" direction="row" gap="10" style="width:300px">
      <div id="fixed" style="width:80px;height:12px"></div>
      <div id="grower" grow style="height:12px"></div>
    </vf-stack>
    <vf-stack id="tight" direction="row" gap="10" style="width:100px">
      <div id="wide1" style="width:80px;height:12px"></div>
      <div id="wide2" style="width:80px;height:12px"></div>
    </vf-stack>
  `)

  const [fixed, grower] = await Promise.all([rect(page, 'fixed'), rect(page, 'grower')])
  check(
    'children: grow takes the slack',
    Math.abs(grower.w - (300 - 80 - 10 * DEVICE_PX_PER_SYSTEM_PX)) < 0.001,
    `${grower.w}px of ${300 - 80 - 30} expected`
  )
  check('children: a plain child keeps its size', Math.abs(fixed.w - 80) < 0.001, `${fixed.w}px`)

  const [w1, w2] = await Promise.all([rect(page, 'wide1'), rect(page, 'wide2')])
  check(
    'children: a plain child does not shrink to fit',
    Math.abs(w1.w - 80) < 0.001 && Math.abs(w2.w - 80) < 0.001,
    `${w1.w}px / ${w2.w}px in a 100px stack`
  )
  await page.close()
}

/* ── AXES ─────────────────────────────────────────────────────────────────
   align="auto" is the one piece of implicit behavior in the API: the two axes
   want opposite things, so the default is named rather than hidden. */

{
  const page = await build(`
    <vf-stack id="col" style="width:200px"><div id="ca" style="height:12px"></div></vf-stack>
    <vf-stack id="row" direction="row" style="width:200px;height:60px">
      <div id="ra" style="width:12px;height:12px"></div>
    </vf-stack>
    <vf-stack id="colstart" align="start" style="width:200px">
      <div id="csa" style="height:12px"></div>
    </vf-stack>
    <vf-stack id="rowend" direction="row" justify="end" style="width:200px">
      <div id="rea" style="width:12px;height:12px"></div>
    </vf-stack>
    <vf-stack id="rowbetween" direction="row" justify="between" style="width:200px">
      <div id="rba" style="width:12px;height:12px"></div>
      <div id="rbb" style="width:12px;height:12px"></div>
    </vf-stack>
    <vf-stack gap="8" style="width:400px">
      <vf-button id="c-button">OK</vf-button>
      <vf-select id="c-select" value="Geneva"><vf-option>Geneva</vf-option></vf-select>
      <vf-text-field id="c-field" value="short"></vf-text-field>
      <vf-fieldset id="c-fieldset" legend="Group"><vf-label>in it</vf-label></vf-fieldset>
      <vf-separator id="c-separator"></vf-separator>
      <vf-progress-bar id="c-progress" value="40" max="100"></vf-progress-bar>
    </vf-stack>
    <vf-stack gap="8" align="stretch" style="width:400px">
      <vf-button id="c-stretched">Asked for by name</vf-button>
    </vf-stack>
    <vf-stack gap="8" style="width:700px">
      <vf-text-field id="c-field-wide" value="short"></vf-text-field>
    </vf-stack>
  `)

  const ca = await rect(page, 'ca')
  check('axes: auto stretches down a column', Math.abs(ca.w - 200) < 0.001, `${ca.w}px of 200`)

  const [row, ra] = await Promise.all([rect(page, 'row'), rect(page, 'ra')])
  check(
    'axes: auto centers across a row',
    Math.abs(ra.y - row.y - (row.h - ra.h) / 2) < 0.001,
    `${(ra.y - row.y).toFixed(1)}px from the top of a ${row.h}px row`
  )

  const ctrls = await page.evaluate(() => {
    const w = (id) => document.getElementById(id).getBoundingClientRect().width
    return {
      button: w('c-button'),
      select: w('c-select'),
      field: w('c-field'),
      fieldset: w('c-fieldset'),
      separator: w('c-separator'),
      progress: w('c-progress'),
      stretched: w('c-stretched'),
      fieldWide: w('c-field-wide'),
    }
  })
  check(
    'axes: a stretching column never resizes a control',
    ctrls.button < 400 && ctrls.select < 400,
    `button ${Math.round(ctrls.button)} / select ${Math.round(ctrls.select)} in a 400px column`
  )
  check(
    'axes: a control wider than the panel is capped, not stretched',
    Math.abs(ctrls.field - 400) < 0.001 && ctrls.fieldWide > 400 && ctrls.fieldWide < 700,
    `the same field: ${Math.round(ctrls.field)} in a 400px column, ${Math.round(ctrls.fieldWide)} in a 700px one`
  )
  check(
    'axes: …but what genuinely fills a panel still stretches',
    Math.abs(ctrls.fieldset - 400) < 0.001 &&
      Math.abs(ctrls.separator - 400) < 0.001 &&
      Math.abs(ctrls.progress - 400) < 0.001,
    `fieldset ${ctrls.fieldset} / separator ${ctrls.separator} / progress ${ctrls.progress}`
  )
  check(
    'axes: align="stretch" is asked for by name, so it stretches a control too',
    Math.abs(ctrls.stretched - 400) < 0.001,
    `${ctrls.stretched}px of 400`
  )

  const csa = await rect(page, 'csa')
  check(
    'axes: align="start" overrides the column default',
    csa.w < 200,
    `${csa.w}px (not stretched)`
  )

  const [rowend, rea] = await Promise.all([rect(page, 'rowend'), rect(page, 'rea')])
  check(
    'axes: justify="end" pushes to the end of the main axis',
    Math.abs(rea.right - rowend.right) < 0.001,
    `right edges ${rea.right} / ${rowend.right}`
  )

  const [rb, rba, rbb] = await Promise.all([
    rect(page, 'rowbetween'),
    rect(page, 'rba'),
    rect(page, 'rbb'),
  ])
  check(
    'axes: justify="between" splits the free space',
    Math.abs(rba.x - rb.x) < 0.001 && Math.abs(rbb.right - rb.right) < 0.001,
    `${rba.x - rb.x}px / ${rb.right - rbb.right}px from the edges`
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
    Math.abs(outerGap - 24 * DEVICE_PX_PER_SYSTEM_PX) < 0.001,
    `${outerGap}px CSS`
  )
  check(
    'nesting: the inner stack keeps its own default of 0',
    Math.abs(innerGap) < 0.001,
    `${innerGap}px CSS`
  )
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
  await page.close()
}

await browser.close()

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
