/**
 * Verifies the 1px rule — `vfRule` (src/styles/recipes/rule.ts) and
 * `vf-container rule="…"`.
 *
 * The rule is a border, and shares the kit's border-floor residual
 * (docs/THREE-X-DISPLAYS.md): Chromium floors a fractional border-width to
 * whole CSS px, so above 1× the line paints thinner than a system px — 1
 * device px at 1.5×, 2 at 2×, 3 at 3× — exactly as the window frame, the
 * panel border and the menu bar's own rule do. What is asserted here is
 * therefore the kit's actual contract: the line is whole device px with no
 * gray, flush to the box's edge, content begins directly inside it, and a
 * container's rule is the SAME line as the menu bar's at every density.
 *
 * 1. The grammar (`parseRule`): edge names in any order, repeats dropped,
 *    returned in top/right/bottom/left order; blank or unset is no edges;
 *    anything else refuses the whole value. `ruleClasses` names the classes.
 * 2. `rule="bottom"` on a declared 60×24 box at dpr 1/2/3: the host box is
 *    still 60×24 system px (the rule is inside it), the rule is a uniform
 *    band of whole device px along the bottom edge — at least one, at most a
 *    system px — with nothing above it, the box's computed border is on that
 *    edge alone, and the band is as thick as `vf-menu-bar`'s rule. At 1.5×
 *    the floored border is 1.5 device px and its rendering depends on where
 *    the box sits (the border-floor wobble), so that rung is printed, not
 *    asserted.
 * 3. `rule="top left"`: both edges ink, and a child placed at `top="0"
 *    left="0"` begins directly inside the painted line on both axes. All four
 *    edges frame a box.
 * 4. With `pattern`: the fill's paper reaches the rule, its phase begins
 *    directly inside a top rule (gray-50's first row under the ink), and the
 *    whole box stays 1-bit.
 * 5. A measured strip (`fill-width`) draws the rule across the width it gets.
 * 6. An unrecognized value warns once and draws nothing; a later valid value
 *    draws; unsetting unwinds the classes and the paint.
 * 7. The kit's own bands are the recipe: `vf-menu-bar`'s bar wears
 *    `vf-rule-bottom`, `vf-window`'s status strip `vf-rule-top`, each with a
 *    border on that edge alone, and each paints its band of ink.
 * 8. Forced colors: the rule survives as the second of exactly two colors.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:rule
 */
import {
  check,
  decodePng,
  devicePxPerSystemPxAt,
  impureIn,
  launch,
  makeBuild,
  report,
  rgb,
} from './harness.mjs'

const browser = await launch()
const build = makeBuild(browser, { settle: true })

/** Two animation frames, for a write that lands after the page settled. */
const frames = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )

/** Set a host's `rule` property and wait for the render it causes. */
async function setRule(page, id, value) {
  await page.evaluate(([id, value]) => {
    document.querySelector(id).rule = value
  }, [id, value])
  await page.evaluate((id) => document.querySelector(id).updateComplete, id)
  await frames(page)
}

/** The container's shadow box: its rule classes and computed border widths. */
const boxInfo = (page, id) =>
  page.evaluate((id) => {
    const host = document.querySelector(id)
    const box = host.shadowRoot.querySelector('.box')
    const cs = getComputedStyle(box)
    const r = host.getBoundingClientRect()
    return {
      classes: [...box.classList].filter((c) => c.startsWith('vf-rule-')),
      borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(
        parseFloat
      ),
      host: { width: r.width, height: r.height },
    }
  }, id)

const MAGENTA = 'magenta'
const isBlack = (png, x, y) => rgb(png, x, y).every((c) => c < 32)
const isWhite = (png, x, y) => rgb(png, x, y).every((c) => c > 224)
const isMagenta = (png, x, y) => {
  const [r, g, b] = rgb(png, x, y)
  return r > 224 && g < 32 && b > 224
}

/** Whether every pixel in [x0,x1)×[y0,y1) satisfies `test`. */
function every(png, x0, y0, x1, y1, test) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) if (!test(png, x, y)) return false
  }
  return true
}

/** Contiguous ink rows from the bottom edge up, at column x. */
function inkFromBottom(png, x) {
  let t = 0
  while (t < png.height && isBlack(png, x, png.height - 1 - t)) t++
  return t
}
/** Contiguous ink rows from the top edge down, at column x. */
function inkFromTop(png, x) {
  let t = 0
  while (t < png.height && isBlack(png, x, t)) t++
  return t
}
/** Contiguous ink columns from the left edge in, at row y. */
function inkFromLeft(png, y) {
  let t = 0
  while (t < png.width && isBlack(png, t, y)) t++
  return t
}

const near = (a, b, tol = 0.01) => Math.abs(a - b) < tol

// ── 1. the grammar ─────────────────────────────────────────────────────────
{
  const page = await build('')
  const g = await page.evaluate(async () => {
    const m = await import('/src/index.js')
    const p = (v) => JSON.stringify(m.parseRule(v))
    return {
      edges: JSON.stringify(m.RULE_EDGES),
      one: p('bottom'),
      two: p('top bottom'),
      ordered: p('left top'),
      repeats: p('bottom  bottom'),
      padded: p('  top  '),
      all: p('left bottom right top'),
      blank: [p(''), p('   '), p(null), p(undefined)],
      refused: ['nope', 'Top', 'top,bottom', 'all', 'top nope', 'constructor', '__proto__'].map(
        (v) => m.parseRule(v)
      ),
      classes: m.ruleClasses(['top', 'bottom']),
      none: m.ruleClasses([]),
    }
  })
  check(
    'RULE_EDGES is top/right/bottom/left',
    g.edges === '["top","right","bottom","left"]',
    g.edges
  )
  check(
    'edge names parse in any order, repeats dropped, returned in shorthand order',
    g.one === '["bottom"]' &&
      g.two === '["top","bottom"]' &&
      g.ordered === '["top","left"]' &&
      g.repeats === '["bottom"]' &&
      g.padded === '["top"]' &&
      g.all === '["top","right","bottom","left"]',
    `${g.one} ${g.two} ${g.ordered} ${g.repeats} ${g.padded} ${g.all}`
  )
  check('blank and unset are no edges', g.blank.every((v) => v === '[]'), g.blank.join(' '))
  check(
    'unknown, case-changed, comma-joined, "all", mixed and prototype tokens refuse the whole value',
    g.refused.every((v) => v === null),
    g.refused.map((v) => (v === null ? 'null' : 'ACCEPTED')).join(' ')
  )
  check(
    'ruleClasses names one class per edge',
    g.classes === 'vf-rule-top vf-rule-bottom' && g.none === '',
    `"${g.classes}" / "${g.none}"`
  )
  await page.close()
}

// ── 2. rule="bottom" on the density ladder, against the menu bar's own rule ─
// The integer rungs: 1 CSS px is whole device px there, so a floored border
// is a whole band. At a fractional density (1.5× below) the floored 1 CSS px
// is 1.5 device px and Chromium distributes the half by snap direction — the
// border-floor wobble (src/scale.ts) — so that rung is measured and printed,
// not asserted: the residual is the kit's, documented, and not the rule's.
for (const dpr of [1, 2, 3]) {
  const page = await build(
    '<vf-container id="r" width="60" height="24" rule="bottom"></vf-container>' +
      '<vf-menu-bar id="mb" label="Menus" style="width:60px"></vf-menu-bar>',
    { dpr, bodyStyle: `margin:0;background:${MAGENTA}` }
  )
  const n = devicePxPerSystemPxAt(dpr)
  const info = await boxInfo(page, '#r')
  check(
    `dpr ${dpr}: the host box is still 60×24 system px — the rule is inside it`,
    near(info.host.width * dpr, 60 * n) && near(info.host.height * dpr, 24 * n),
    `${(info.host.width * dpr).toFixed(3)}×${(info.host.height * dpr).toFixed(3)} device px`
  )
  check(
    `dpr ${dpr}: the box's border is on the bottom edge alone, at least 1 CSS px`,
    info.classes.join(' ') === 'vf-rule-bottom' &&
      info.borders[2] >= 1 &&
      info.borders[0] === 0 &&
      info.borders[1] === 0 &&
      info.borders[3] === 0,
    `${info.classes.join(' ')}; ${info.borders.join('/')} CSS px`
  )
  const png = decodePng(await page.locator('#r').screenshot())
  const H = 24 * n
  const W = 60 * n
  const t = inkFromBottom(png, 0)
  const uniform = every(png, 0, H - t, W, H, isBlack) && every(png, 0, 0, W, H - t, isMagenta)
  check(
    `dpr ${dpr}: the rule is a uniform band of ${t} whole device px on the bottom edge (1 ≤ ${t} ≤ ${n}), no gray, nothing above it`,
    png.width === W && png.height === H && t >= 1 && t <= n && uniform,
    `${png.width}×${png.height}, ${t} rows`
  )
  const bar = decodePng(await page.locator('#mb').screenshot())
  const tb = inkFromBottom(bar, Math.floor(bar.width / 2))
  check(
    `dpr ${dpr}: a container's rule is the menu bar's line — ${tb} device px there too`,
    tb === t,
    `container ${t}, menu bar ${tb}`
  )
  await page.close()
}
{
  const dpr = 1.5
  const page = await build(
    '<vf-container id="r" width="60" height="24" rule="bottom"></vf-container>' +
      '<vf-menu-bar id="mb" label="Menus" style="width:60px"></vf-menu-bar>',
    { dpr, bodyStyle: `margin:0;background:${MAGENTA}` }
  )
  const png = decodePng(await page.locator('#r').screenshot())
  const bar = decodePng(await page.locator('#mb').screenshot())
  const gray = (p) => {
    const { impure } = impureIn(p, 0, 0, p.width, p.height, [[255, 0, 255]])
    return impure
  }
  console.log(
    `      dpr 1.5 (border-floor residual, printed not asserted): container band ` +
      `${inkFromBottom(png, 0)} device px with ${gray(png)} gray px, ` +
      `menu bar band ${inkFromBottom(bar, Math.floor(bar.width / 2))} with ${gray(bar)} gray px`
  )
  await page.close()
}

// ── 3. top left, all four, and the placed-child origin ─────────────────────
{
  const dpr = 2
  const n = devicePxPerSystemPxAt(dpr)
  const page = await build(
    '<vf-container id="f" width="40" height="24" rule="top left">' +
      '<vf-container id="k" width="8" height="8" top="0" left="0" pattern="black"></vf-container>' +
      '</vf-container>' +
      '<vf-container id="q" width="30" height="24" rule="top right bottom left"></vf-container>',
    { dpr, bodyStyle: `margin:0;background:${MAGENTA}` }
  )
  const f = decodePng(await page.locator('#f').screenshot())
  // The rule's thickness, read where the child cannot reach: the far column
  // and the bottom row.
  const t = inkFromTop(f, f.width - 1)
  const tl = inkFromLeft(f, f.height - 1)
  check(
    'rule="top left": a band of ink along the top and the left, the same thickness on both',
    t >= 1 &&
      t <= n &&
      tl === t &&
      every(f, 0, 0, f.width, t, isBlack) &&
      every(f, 0, 0, t, f.height, isBlack) &&
      every(f, t, 20 * n, f.width, f.height, isMagenta),
    `top ${t}, left ${tl}, ${f.width}×${f.height}`
  )
  const origin = await page.evaluate(() => {
    const host = document.querySelector('#f')
    const box = host.shadowRoot.querySelector('.box')
    const cs = getComputedStyle(box)
    const f = host.getBoundingClientRect()
    const k = document.querySelector('#k').getBoundingClientRect()
    return {
      dx: k.left - f.left,
      dy: k.top - f.top,
      borderLeft: parseFloat(cs.borderLeftWidth),
      borderTop: parseFloat(cs.borderTopWidth),
    }
  })
  // The child's black begins on the first row/column after the rule's band —
  // no gap, no overlap — and its box origin is the box's border width in.
  check(
    'a child placed at top="0" left="0" begins directly inside the rule on both axes',
    near(origin.dx, origin.borderLeft) &&
      near(origin.dy, origin.borderTop) &&
      every(f, t, t, t + 8 * n, t + 8 * n, isBlack) &&
      isMagenta(f, t + 8 * n, t + 8 * n) &&
      isMagenta(f, t, t + 8 * n) &&
      isMagenta(f, t + 8 * n, t),
    `child at (${origin.dx}, ${origin.dy}) CSS px, border ${origin.borderLeft}/${origin.borderTop}`
  )
  const q = decodePng(await page.locator('#q').screenshot())
  const W = 30 * n
  const H = 24 * n
  const tq = inkFromTop(q, Math.floor(W / 2))
  check(
    'all four edges frame the box; the interior is untouched',
    tq >= 1 &&
      every(q, 0, 0, W, tq, isBlack) &&
      every(q, 0, H - tq, W, H, isBlack) &&
      every(q, 0, 0, tq, H, isBlack) &&
      every(q, W - tq, 0, W, H, isBlack) &&
      every(q, tq, tq, W - tq, H - tq, isMagenta),
    `${q.width}×${q.height}, band ${tq}`
  )
  await page.close()
}

// ── 4. with a pattern ──────────────────────────────────────────────────────
{
  const dpr = 2
  const n = devicePxPerSystemPxAt(dpr)
  const page = await build(
    '<vf-container id="p" width="48" height="24" pattern="gray-50" rule="top"></vf-container>' +
      '<vf-container id="w" width="48" height="24" pattern="white" rule="bottom"></vf-container>',
    { dpr, bodyStyle: `margin:0;background:${MAGENTA}` }
  )
  const p = decodePng(await page.locator('#p').screenshot())
  const t = inkFromTop(p, 1 * n) // an unpainted column of the pattern's first row
  // The pattern's row r spans device rows [t + r·n, t + (r+1)·n).
  const row = (r) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((x) => (isBlack(p, x * n, t + r * n) ? '#' : '.')).join('')
  const { impure, counted } = impureIn(p, 0, 0, p.width, p.height)
  check(
    "gray-50 under a top rule: the rule's band is ink across, the pattern's first row (AA) begins directly under it",
    t >= 1 &&
      t <= n &&
      every(p, 0, 0, p.width, t, isBlack) &&
      row(0) === '#.#.#.#.' &&
      row(1) === '.#.#.#.#',
    `band ${t}: ${row(0)} / ${row(1)}`
  )
  check('…and the whole box is 1-bit', impure === 0, `${impure}/${counted} impure`)
  const w = decodePng(await page.locator('#w').screenshot())
  const H = 24 * n
  const tw = inkFromBottom(w, 0)
  check(
    'pattern="white" with rule="bottom": white paper to the rule, the rule\'s band ink',
    tw >= 1 &&
      tw <= n &&
      every(w, 0, 0, 48 * n, H - tw, isWhite) &&
      every(w, 0, H - tw, 48 * n, H, isBlack),
    `${w.width}×${w.height}, band ${tw}`
  )
  await page.close()
}

// ── 5. a measured strip ────────────────────────────────────────────────────
{
  const dpr = 2
  const n = devicePxPerSystemPxAt(dpr)
  const page = await build(
    '<div style="width:200px"><vf-container id="m" fill-width height="24" rule="bottom"></vf-container></div>',
    { dpr, bodyStyle: `margin:0;background:${MAGENTA}` }
  )
  const m = decodePng(await page.locator('#m').screenshot())
  const H = 24 * n
  const t = inkFromBottom(m, 0)
  check(
    'a fill-width strip draws the rule across the width it gets (200 CSS px), nothing above it',
    m.width === 200 * dpr &&
      m.height === H &&
      t >= 1 &&
      every(m, 0, H - t, m.width, H, isBlack) &&
      every(m, 0, 0, m.width, H - t, isMagenta),
    `${m.width}×${m.height}, band ${t}`
  )
  await page.close()
}

// ── 6. an unrecognized value; unsetting ────────────────────────────────────
{
  const page = await build('<vf-container id="b" width="40" height="24"></vf-container>', {
    dpr: 2,
    bodyStyle: `margin:0;background:${MAGENTA}`,
  })
  const warnings = []
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text())
  })
  const allMagenta = async () => {
    const png = decodePng(await page.locator('#b').screenshot())
    return every(png, 0, 0, png.width, png.height, isMagenta)
  }
  await setRule(page, '#b', 'bottom nope')
  const s1 = await boxInfo(page, '#b')
  check(
    'an unknown edge refuses the whole value: warns once, draws nothing',
    warnings.length === 1 &&
      /vf-container: unknown rule "bottom nope"/.test(warnings[0]) &&
      s1.classes.length === 0 &&
      (await allMagenta()),
    `${warnings.length} warning(s): ${warnings.join(' | ')}; classes [${s1.classes}]`
  )
  await setRule(page, '#b', 'top')
  const s2 = await boxInfo(page, '#b')
  await setRule(page, '#b', 'still nope')
  const s3 = await boxInfo(page, '#b')
  check(
    'a later valid value draws; a later bad one draws nothing and warns no further',
    s2.classes.join(' ') === 'vf-rule-top' && s3.classes.length === 0 && warnings.length === 1,
    `[${s2.classes}] → [${s3.classes}], ${warnings.length} warning(s)`
  )
  await setRule(page, '#b', 'bottom')
  await setRule(page, '#b', null)
  const s4 = await boxInfo(page, '#b')
  check(
    'unsetting the rule unwinds the classes, the border and the paint',
    s4.classes.length === 0 && s4.borders.every((b) => b === 0) && (await allMagenta()),
    `[${s4.classes}] ${s4.borders.join('/')}`
  )
  await page.close()
}

// ── 7. the kit's own bands ─────────────────────────────────────────────────
{
  const dpr = 2
  const n = devicePxPerSystemPxAt(dpr)
  const page = await build(
    '<vf-menu-bar id="mb" label="Menus"></vf-menu-bar>' +
      '<vf-window id="w" width="120" height="80" style="position:absolute;top:40px;left:0"><span slot="status">ok</span></vf-window>',
    { dpr }
  )
  const bands = await page.evaluate(() => {
    const read = (el) => {
      const cs = getComputedStyle(el)
      return {
        classes: [...el.classList].filter((c) => c.startsWith('vf-rule-')).join(' '),
        borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(
          parseFloat
        ),
      }
    }
    return {
      bar: read(document.querySelector('#mb').shadowRoot.querySelector('.bar')),
      status: read(document.querySelector('#w').shadowRoot.querySelector('.status')),
    }
  })
  check(
    "vf-menu-bar's bar is vf-rule-bottom — a border on that edge alone",
    bands.bar.classes === 'vf-rule-bottom' &&
      bands.bar.borders[2] >= 1 &&
      bands.bar.borders[0] === 0 &&
      bands.bar.borders[1] === 0 &&
      bands.bar.borders[3] === 0,
    `${bands.bar.classes}; ${bands.bar.borders.join('/')} CSS px`
  )
  check(
    "vf-window's status strip is vf-rule-top — a border on that edge alone",
    bands.status.classes === 'vf-rule-top' &&
      bands.status.borders[0] >= 1 &&
      bands.status.borders[1] === 0 &&
      bands.status.borders[2] === 0 &&
      bands.status.borders[3] === 0,
    `${bands.status.classes}; ${bands.status.borders.join('/')} CSS px`
  )
  const bar = decodePng(await page.locator('#mb').screenshot())
  const bH = 20 * n
  const tb = inkFromBottom(bar, Math.floor(bar.width / 2))
  check(
    'the menu bar paints its rule: a band of ink along the bottom, white directly above it',
    bar.height === bH &&
      tb >= 1 &&
      tb <= n &&
      every(bar, 0, bH - tb, bar.width, bH, isBlack) &&
      every(bar, 0, bH - tb - n, bar.width, bH - tb, isWhite),
    `${bar.width}×${bar.height}, band ${tb}`
  )
  // The strip out of the window's own screenshot, by geometry: its box sits on
  // a half CSS px inside the flexed frame, and an element screenshot rounds a
  // fractional clip outward to whole CSS px, adding a row that isn't the strip.
  const win = decodePng(await page.locator('#w').screenshot())
  const geo = await page.evaluate(() => {
    const host = document.querySelector('#w')
    const strip = host.shadowRoot.querySelector('.status').getBoundingClientRect()
    const w = host.getBoundingClientRect()
    return { top: strip.top - w.top, left: strip.left - w.left, width: strip.width, height: strip.height }
  })
  const y0 = Math.round(geo.top * dpr)
  const x0 = Math.round(geo.left * dpr)
  const x1 = x0 + Math.round(geo.width * dpr)
  const xm = Math.floor((x0 + x1) / 2)
  // The strip's edge is on a half CSS px here (the body flexes to what the
  // frame leaves), and Blink quantizes sub-CSS-px paint per box — the
  // border-floor wobble (src/scale.ts) — so the band may sit one device px
  // off the edge. Find it within that, then hold it to the same shape.
  let ys = y0 - 1
  while (ys < y0 + 2 && !isBlack(win, xm, ys)) ys++
  let ts = 0
  while (ts < win.height - ys && isBlack(win, xm, ys + ts)) ts++
  check(
    'the status strip paints its rule: a band of ink along the top, white directly below it',
    near(geo.height * dpr, 15 * n) &&
      Math.abs(ys - y0) <= 1 &&
      ts >= 1 &&
      ts <= n &&
      every(win, x0, ys, x1, ys + ts, isBlack) &&
      every(win, x0 + n, ys + ts, x1 - n, ys + ts + n, isWhite),
    `strip ${Math.round(geo.width * dpr)}×${Math.round(geo.height * dpr)} at (${x0}, ${y0}), band ${ts} from row ${ys}`
  )
  await page.close()
}

// ── 8. forced colors ───────────────────────────────────────────────────────
{
  const dpr = 2
  const page = await build(
    '<vf-container id="f" width="60" height="24" rule="bottom"></vf-container>',
    { dpr, forcedColors: 'active' }
  )
  const png = decodePng(await page.locator('#f').screenshot())
  const key = (x, y) => rgb(png, x, y).join(',')
  const colors = new Set()
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) colors.add(key(x, y))
  }
  const faceColor = key(0, 0)
  const ruleColor = key(0, png.height - 1)
  let t = 0
  while (t < png.height && key(0, png.height - 1 - t) === ruleColor) t++
  check(
    'forced colors: exactly two colors, the rule a uniform band of the second along the bottom',
    colors.size === 2 &&
      ruleColor !== faceColor &&
      t >= 1 &&
      every(png, 0, png.height - t, png.width, png.height, (p, x, y) => key(x, y) === ruleColor) &&
      every(png, 0, 0, png.width, png.height - t, (p, x, y) => key(x, y) === faceColor),
    `${[...colors].join(' | ')}, band ${t}`
  )
  await page.close()
}

await report(browser)
