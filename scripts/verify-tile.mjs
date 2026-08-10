/**
 * Verifies that every tiled fill rasterizes 1-bit — including at the scales a
 * CSS length cannot hold.
 *
 * A CSS repeating fill is ONE paint-snapped box holding N unsnapped repeats,
 * each placed at `k × tileSize` where the tile size is a single stored length
 * the engine quantizes to its layout grid. The error compounds with `k` until
 * the art smears gray. The span construction (src/styles/recipes/tile.ts)
 * makes the stored length exact for every *density-ladder* scale — but zoom
 * mints scales with arbitrary prime denominators (20/17 at Safari's 85%,
 * 30/23 at its 115%) that no finite lattice can hold. TILE-GRID-PLAN.md /
 * ZOOM-TILE-DRIFT.md carry the full analysis.
 *
 * The five converted surfaces (desktop dither, windoid dots, swatch
 * checker, barber stripes, title-bar racing stripes) therefore no longer
 * repeat in CSS (src/tile-grid.ts):
 *
 * - KIT ART renders as one whole-surface raster at one image px per system
 *   px, stretched 100%/100% under image-rendering: pixelated. Nearest-
 *   neighbor sampling can only produce source colors, and one box has no
 *   interior seams — measured here as ZERO impure pixels at every density,
 *   including 1.7 and 2.3 (scales 20/17 and 30/23, the emulated proxy for
 *   Safari's broken zoom rungs; real ⌘± cannot be driven headlessly).
 *
 * - CONSUMER pattern tokens render as a flat grid of absolutely placed tiles
 *   at the token's documented 30/60-px tile geometry. Each tile's box is one
 *   single-multiplication calc() quantized once, so boxes are exactly T×n
 *   device px with coincident seams at EVERY scale (asserted); the raster is
 *   pixel-pure at every ladder scale (asserted). At a zoom-minted scale the
 *   engine antialiases each box's fractional painted edge, so what remains
 *   there is a bounded per-seam hairline — never surface-wide smear.
 *
 * The title-bar racing stripes joined 2026-08-09 with a per-engine split
 * (vfStripes, src/styles/recipes/pattern.ts) after a three-engine ×
 * eight-density measurement of every candidate:
 *
 * - Blink pixel-snaps a painted BOX to whole CSS px, not device px. Inside
 *   the bar's floored frame border (layer origin on a half CSS px at scale
 *   3/2) that killed every box-shaped mechanism: placed solid rows painted
 *   a 1.5-CSS-px stripe as 2 or 4 device rows and FUSED neighbors at dpr 3;
 *   the whole-surface raster resampled into the CSS-rounded box and dropped
 *   a device row (one stripe thin at dpr 2/3); inline SVG rects wobbled a
 *   stripe's position under the stretched viewBox. The gradient's stops are
 *   the one paint that lands at device precision inside the rounded box —
 *   so Blink and WebKit KEEP the repeating-linear-gradient, asserted here
 *   at the integer densities; the fractional densities keep their shipped
 *   soft edge (printed, not failed — the same residual the gradient always
 *   had there).
 *
 * - Gecko device-snaps solid boxes (headless parity with its gradient at
 *   every density), and its GPU WebRender gradient pipeline is what softens
 *   a hard stop at default zoom (the reported bug). So Gecko alone renders
 *   the six stripes as placed spans — display-gated by @supports
 *   (-moz-appearance: none); this Chromium harness can only guard their
 *   template, which it does.
 *
 * No consumer pattern token (token: null — the active-window signal is not
 * a themeable texture).
 *
 * The scroll trough cannot convert (a pseudo-element hosts no children) and
 * keeps the span arithmetic, checked here; headless Chromium paints no
 * ::-webkit-scrollbar skin, so arithmetic is all that can guard it.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:tile
 */
import { ORIGIN, check, decodePng, launch, report, devicePxPerSystemPxAt } from './harness.mjs'

/** Chromium's layout grid; Gecko's app unit is 1/60 and the same argument holds. */
const LAYOUT_UNIT = 1 / 64

/** The density ladder — every scale the span construction holds exactly. */
const LADDER = [1, 1.25, 1.5, 2, 2.5, 3]
/** …plus the two broken-rung proxies (scales 20/17 and 30/23). */
const DENSITIES = [1, 1.25, 1.5, 1.7, 2, 2.3, 2.5, 3]

/**
 * Every converted surface: the motif (restated as data, the way the source
 * states it), the documented tile span, its pattern token, and where its fill
 * layer and exact-fill elements live in the shadow tree.
 */
const SURFACES = [
  {
    name: 'desktop dither',
    markup: '<vf-desktop id="desk" width="240" height="160"></vf-desktop>',
    host: '#desk',
    layer: '.screen',
    token: '--vf-desktop-pattern',
    motif: { w: 2, h: 2, rects: [[0, 0, 2, 2, '#ffffff'], [0, 0, 1, 1, '#000000'], [1, 1, 1, 1, '#000000']] },
    tile: 30,
    tiles: 48, // ceil(240/30) × ceil(160/30)
  },
  {
    name: 'windoid dots  ',
    markup:
      '<vf-window id="windoid" variant="utility" heading="Tools" width="240" height="60"></vf-window>',
    host: '#windoid',
    layer: '.vf-dots',
    token: '--vf-dots-pattern',
    motif: { w: 2, h: 2, rects: [[0, 0, 1, 1, '#000000']] },
    tile: 30,
    tiles: 8, // ceil((240 − 2 borders) / 30) × 1
    // The close/zoom widgets overlap the layer's band (≤17 system px from
    // either end, box + patch ring); their own edges are not the tiling's.
    padSysX: 20,
    // The layer's origin sits inside a floored border (see insetLayer below).
    insetLayer: true,
  },
  {
    name: 'swatch checker',
    markup: '<vf-swatch id="sw"></vf-swatch>',
    host: '#sw',
    layer: '.fill',
    token: '--vf-swatch-checker',
    motif: { w: 4, h: 4, rects: [[0, 0, 4, 4, '#ffffff'], [0, 0, 2, 2, '#c0c0c0'], [2, 2, 2, 2, '#c0c0c0']] },
    tile: 60,
    tiles: 1, // the 20×14 fill of the default 24×18 swatch
  },
  {
    name: 'barber stripes',
    markup: '<vf-progress-bar id="pb" indeterminate style="width:240px"></vf-progress-bar>',
    host: '#pb',
    layer: '.fill',
    token: '--vf-progress-stripes',
    motif: {
      w: 12,
      h: 12,
      rects: [
        [0, 0, 6, 1], [1, 1, 6, 1], [2, 2, 6, 1], [3, 3, 6, 1], [4, 4, 6, 1],
        [5, 5, 6, 1], [6, 6, 6, 1], [0, 7, 1, 1], [7, 7, 5, 1], [0, 8, 2, 1],
        [8, 8, 4, 1], [0, 9, 3, 1], [9, 9, 3, 1], [0, 10, 4, 1], [10, 10, 2, 1],
        [0, 11, 5, 1], [11, 11, 1, 1],
      ],
    },
    tile: 60,
    tiles: null, // strip width follows the measured track — count not asserted
    insetLayer: true,
  },
  {
    name: 'title stripes ',
    // No heading: the centered title patch is hidden by page CSS below — a
    // centered box's fractional edges would count impure at zoom-minted
    // scales, and the patch is verify-chrome's story, not the stripes'.
    markup: '<vf-window id="doc" width="240" height="80"></vf-window>',
    host: '#doc',
    layer: '.vf-stripes',
    token: null, // no consumer art — the stripes are not a themeable texture
    stripes: true, // engine-split paint, not a tile fill (see the header)
    // The close box and its patch ring overlap the band's left end.
    padSysX: 20,
  },
]

/** Densities where the stripes' gradient is asserted whole-and-pure (the
 * integer ladder; the fractional densities keep their shipped soft edge). */
const STRIPE_PURE_DPRS = [1, 2, 3]

/**
 * Densities where a surface's consumer-path (placed tile grid) raster is
 * asserted pixel-pure. Whole-origin surfaces hold at the entire ladder. An
 * `insetLayer` surface sits inside a border Chromium floors, which lands the
 * whole grid on a fractional device offset at dpr 1.25/1.5/2.5 — every tile
 * still measures T×n with coincident seams (asserted at all densities), but
 * the engine antialiases each box's fractional painted edge, leaving a
 * per-seam hairline. That is the old "inset residual" reduced from
 * surface-wide smear to a few seam lines; the kit's own raster path has no
 * seams and is asserted zero everywhere. Printed, not failed — same policy
 * the old script applied to the same three surfaces.
 */
const consumerPureDensities = (s) => (s.insetLayer ? [1, 2, 3] : LADDER)

/** lcm(motif, 15) — the span recipe's own rule, restated because this is plain JS. */
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
const spanOf = (motif) => (motif * 15) / gcd(motif, 15)

const browser = await launch()

/**
 * A page holding all four surfaces at whole-CSS-px origins. `consumerArt`
 * builds each motif as a raster tile in-page (canvas → PNG data URI) and sets
 * it as the surface's pattern token BEFORE the kit loads, so the components'
 * first render takes the consumer-token path.
 */
async function build(dpr, { consumerArt = false, reducedMotion = true, bodyStyle = '' } = {}) {
  const page = await browser.newPage({
    viewport: { width: 900, height: 800 },
    deviceScaleFactor: dpr,
  })
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(
    '<!doctype html><meta charset="utf-8"><style>body{margin:0}' +
      '[id]{position:absolute;left:0}' +
      '#desk{top:0}#windoid{top:340px}#sw{top:440px}#pb{top:520px}#doc{top:600px}' +
      '#doc::part(title){display:none}' +
      bodyStyle +
      '</style><body>' +
      SURFACES.map((s) => s.markup).join('')
  )
  if (consumerArt) {
    await page.evaluate(
      (motifs) => {
        for (const [token, m] of motifs) {
          const span = m.span
          const cell = document.createElement('canvas')
          cell.width = m.w
          cell.height = m.h
          const cc = cell.getContext('2d')
          for (const [x, y, w, h, fill] of m.rects) {
            cc.fillStyle = fill ?? '#000000'
            cc.fillRect(x, y, w, h)
          }
          const tile = document.createElement('canvas')
          tile.width = span
          tile.height = span
          const tc = tile.getContext('2d')
          tc.fillStyle = tc.createPattern(cell, 'repeat')
          tc.fillRect(0, 0, span, span)
          document.documentElement.style.setProperty(token, `url("${tile.toDataURL('image/png')}")`)
        }
      },
      SURFACES.filter((s) => s.token).map((s) => [s.token, { ...s.motif, span: s.tile }])
    )
  }
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

/**
 * Impure pixels in a layer's interior.
 *
 * The screenshot is of the HOST — every host sits at a whole-CSS-px page
 * origin whose device product is whole at all eight densities, so the capture
 * is never resampled (a clip at a fractional device offset is, and a layer
 * inside a floored border sits at one). The layer's region is then cut out of
 * the host buffer in device space, stepped in from every edge: a box's own
 * edge legitimately covers a partial device pixel at an unholdable scale —
 * the fill's interior is the claim, the box edge is every box's separate
 * story. `padSysX` additionally clears elements that legitimately overlap
 * the band (the windoid's widgets).
 */
async function impureIn(page, s, dpr, n) {
  const r = await page.evaluate(
    ([hostSel, layerSel]) => {
      const host = document.querySelector(hostSel)
      const layer = host.shadowRoot.querySelector(layerSel)
      const hr = host.getBoundingClientRect()
      const lr = layer.getBoundingClientRect()
      return { hx: hr.left, hy: hr.top, lx: lr.left, ly: lr.top, lw: lr.width, lh: lr.height }
    },
    [s.host, s.layer]
  )
  const { width, height, bpp, data } = decodePng(await page.locator(s.host).screenshot())
  const padX = Math.max(4, (s.padSysX ?? 0) * n)
  const x0 = Math.ceil((r.lx - r.hx) * dpr) + padX
  const x1 = Math.floor((r.lx - r.hx + r.lw) * dpr) - padX
  const y0 = Math.ceil((r.ly - r.hy) * dpr)
  const y1 = Math.floor((r.ly - r.hy + r.lh) * dpr)
  const padY = Math.max(2, Math.min(4, Math.floor((y1 - y0) / 4)))
  let impure = 0
  let counted = 0
  for (let y = Math.max(0, y0 + padY); y < Math.min(height, y1 - padY); y++)
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
      const i = (y * width + x) * bpp
      const [red, g, b] = [data[i], data[i + 1], data[i + 2]]
      const pure =
        (red === 0 && g === 0 && b === 0) ||
        (red === 255 && g === 255 && b === 255) ||
        (red === 192 && g === 192 && b === 192)
      if (!pure) impure++
      counted++
    }
  return { impure, counted }
}

// ── the arithmetic, including the surface the page cannot render ──────────
for (const motif of [1, 2, 3, 4, 12]) {
  const span = spanOf(motif)
  const holdableEverywhere = [1, 3 / 2, 4 / 3, 8 / 5, 6 / 5, 5 / 4].every(
    (s) => Math.abs((span * s) / LAYOUT_UNIT - Math.round((span * s) / LAYOUT_UNIT)) < 1e-9
  )
  check(
    `a ${motif}-system-px motif spans ${span}: whole motifs, holdable at every derived scale`,
    span % motif === 0 && holdableEverywhere,
    `${span / motif} motifs`
  )
}
check(
  'the scroll trough states the same spans (4×2 motif → 60×30)',
  spanOf(4) === 60 && spanOf(2) === 30,
  'not rendered: headless Chromium paints no ::-webkit-scrollbar skin'
)

// ── kit art: the whole-surface raster, zero gray at EVERY density ─────────
for (const dpr of DENSITIES) {
  const page = await build(dpr)
  const n = devicePxPerSystemPxAt(dpr)
  console.log(`\ndpr ${dpr}  (1 system px = ${n} device px)  — kit art`)

  for (const s of SURFACES) {
    if (s.stripes) {
      // The Gecko spans: display-gated off in this Chromium harness, so
      // only their template can be guarded here — six rows on the 2px
      // rhythm, each top one multiplication against --vf-scale.
      const spans = await page.evaluate(
        ([host, layer]) =>
          [
            ...document.querySelector(host).shadowRoot.querySelector(layer).children,
          ].map((el) => el.style.top),
        [s.host, s.layer]
      )
      const wantTops = [0, 2, 4, 6, 8, 10].map((r) => `calc(var(--vf-scale, 1) * ${r}px)`)
      check(
        `${s.name}: six Gecko stripe rows in the template, on the 2px rhythm`,
        spans.length === 6 && spans.every((t, i) => t === wantTops[i]),
        spans.join(' ')
      )
      // The gradient, at the densities Blink holds it whole: six black runs
      // down the band, each exactly n device rows on a 2n rhythm. Deliberately
      // NOT anchored to the layer's rect — Blink rounds the painted box to
      // whole CSS px, so the band may sit a device row off its layout rect;
      // uniformity is the art's claim, the box edge is every box's story.
      if (STRIPE_PURE_DPRS.includes(dpr)) {
        const r = await page.evaluate(
          ([hostSel, layerSel]) => {
            const host = document.querySelector(hostSel)
            const lr = host.shadowRoot.querySelector(layerSel).getBoundingClientRect()
            const hr = host.getBoundingClientRect()
            return { x: lr.left - hr.left, y: lr.top - hr.top, h: lr.height }
          },
          [s.host, s.layer]
        )
        const png = decodePng(await page.locator(s.host).screenshot())
        const y0 = Math.floor(r.y * dpr) - 1
        const y1 = Math.ceil((r.y + r.h) * dpr) + 1
        let bad = ''
        for (const colSys of [25, 80, 150]) {
          const x = Math.ceil(r.x * dpr) + colSys * n
          const found = []
          let start = null
          for (let y = y0; y <= y1; y++) {
            const i = (y * png.width + x) * png.bpp
            const black =
              png.data[i] === 0 && png.data[i + 1] === 0 && png.data[i + 2] === 0
            if (black && start === null) start = y
            if (!black && start !== null) {
              found.push({ start, len: y - start })
              start = null
            }
          }
          const even =
            found.length === 6 &&
            found.every((v) => v.len === n) &&
            found.every((v, i) => i === 0 || v.start - found[i - 1].start === 2 * n)
          if (!even)
            bad += ` col${colSys}:[${found.map((v) => `${v.start}+${v.len}`).join(' ')}]`
        }
        check(
          `${s.name}: six whole ${n}-device-px stripes on the ${2 * n}-px rhythm`,
          bad === '',
          bad || '3 columns even'
        )
        const { impure, counted } = await impureIn(page, s, dpr, n)
        check(`${s.name}: rasterizes 1-bit`, impure === 0, `${impure}/${counted} impure`)
      } else {
        const { impure, counted } = await impureIn(page, s, dpr, n)
        console.log(
          `  --   ${s.name}: ${impure}/${counted} impure (the gradient's shipped soft ` +
            `edge inside the floored border; see STRIPE_PURE_DPRS)`
        )
      }
      continue
    }
    const raster = await page.evaluate(
      ([host, layer]) => {
        const el = document.querySelector(host).shadowRoot.querySelector(layer)
        const r = el?.querySelector('.vf-tile-raster')
        if (!r) return null
        const box = r.getBoundingClientRect()
        return { w: box.width, h: box.height }
      },
      [s.host, s.layer]
    )
    if (!raster) {
      check(`${s.name}: whole-surface raster rendered`, false, `${s.host} ${s.layer}`)
      continue
    }
    // The raster box (ceiled to whole tiles where the surface overdraws) must
    // land on whole device pixels: width in system px times n.
    const devW = Math.round(raster.w * dpr)
    check(
      `${s.name}: raster box is whole device px (${devW} = sys × ${n})`,
      devW % n === 0 && Math.abs(raster.w * dpr - devW) < dpr * LAYOUT_UNIT + 1e-6,
      `${(raster.w * dpr).toFixed(3)} device px`
    )
    const { impure, counted } = await impureIn(page, s, dpr, n)
    check(`${s.name}: rasterizes 1-bit`, impure === 0, `${impure}/${counted} impure`)
  }
  await page.close()
}

// ── consumer art: the placed tile grid at the documented geometry ─────────
for (const dpr of DENSITIES) {
  const page = await build(dpr, { consumerArt: true })
  const n = devicePxPerSystemPxAt(dpr)
  const onLadder = LADDER.includes(dpr)
  console.log(`\ndpr ${dpr}  (1 system px = ${n} device px)  — consumer pattern tokens`)

  for (const s of SURFACES) {
    if (!s.token) continue // kit-art-only surface (the stripes take no token)
    const rects = await page.evaluate(
      ([host, layer]) => {
        const el = document.querySelector(host).shadowRoot.querySelector(layer)
        const tiles = el ? [...el.querySelectorAll('.vf-tile')] : []
        return tiles.map((t) => {
          const r = t.getBoundingClientRect()
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        })
      },
      [s.host, s.layer]
    )
    if (rects.length === 0) {
      check(`${s.name}: tile grid rendered`, false, `${s.host} ${s.layer}`)
      continue
    }
    // The seam theorem, asserted directly: every box exactly T×n device px,
    // and adjacent snapped edges coincide (same row ⇒ right_k === left_k+1).
    const snap = (v) => Math.round(v * dpr)
    let badBox = 0
    let badSeam = 0
    const byRow = new Map()
    for (const r of rects) {
      if (
        snap(r.right) - snap(r.left) !== s.tile * n ||
        snap(r.bottom) - snap(r.top) !== s.tile * n
      ) {
        badBox++
      }
      const row = snap(r.top)
      if (!byRow.has(row)) byRow.set(row, [])
      byRow.get(row).push(r)
    }
    for (const row of byRow.values()) {
      row.sort((a, b) => a.left - b.left)
      for (let i = 1; i < row.length; i++) {
        if (snap(row[i - 1].right) !== snap(row[i].left)) badSeam++
      }
    }
    const countOk = s.tiles === null || rects.length === s.tiles
    check(
      `${s.name}: ${rects.length} tiles, each ${s.tile}×${n}·sys device px, seams coincide`,
      countOk && badBox === 0 && badSeam === 0,
      `${badBox} bad boxes, ${badSeam} bad seams`
    )
    if (consumerPureDensities(s).includes(dpr)) {
      const { impure, counted } = await impureIn(page, s, dpr, n)
      check(`${s.name}: consumer raster art is 1-bit`, impure === 0, `${impure}/${counted} impure`)
    } else {
      const { impure, counted } = await impureIn(page, s, dpr, n)
      console.log(
        `  --   ${s.name}: ${impure}/${counted} impure (bounded per-seam hairline — ` +
          `${onLadder ? 'floored-border layer origin' : 'zoom-minted scale'}; see consumerPureDensities)`
      )
    }
  }
  await page.close()
}

// ── the barber's phase: steps() advances the strip one cell per cycle ─────
//
// Each step moves the strip 3 whole system px = 3n device px in layout. The
// PAINTED shift can be 3n ± 1: the track's floored border lands the strip's
// absolute position on an exact half device pixel, and the engine's
// round-half-to-even tie-break alternates the residue (measured 10/8/10/8 at
// dpr 2 — averaging exactly 3n, wrapping exactly per cycle, invisible at
// 10Hz). So the assertions are: every step is a WHOLE-pixel translation of
// 1-bit art (a zero-residual match exists — no smear, no resample), each
// within 1 device px of 3n, three steps sum to 9n ± 1, and the next cycle's
// first step renders byte-identical to this cycle's (the seamless wrap).
{
  const dpr = 2
  const n = devicePxPerSystemPxAt(dpr)
  const page = await build(dpr, { reducedMotion: false })
  const paused = await page.evaluate(() => {
    const strip = document.querySelector('#pb').shadowRoot.querySelector('.vf-tile-strip')
    const [anim] = strip.getAnimations()
    if (!anim) return null
    anim.pause()
    return anim.playState
  })
  check('barber strip animation is steppable', paused === 'paused', String(paused))
  const settle = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const at = async (t) => {
    await page.evaluate((v) => {
      const strip = document.querySelector('#pb').shadowRoot.querySelector('.vf-tile-strip')
      strip.getAnimations()[0].currentTime = v
    }, t)
    await settle()
    return decodePng(await page.locator('#pb .fill').screenshot())
  }
  /** The whole-pixel translation from imgA to imgB, or null if none matches exactly. */
  const exactShift = (imgB, imgA, around) => {
    for (let s = around - 2; s <= around + 2; s++) {
      let mismatched = 0
      for (let y = 3; y < imgA.height - 3 && !mismatched; y++)
        for (let x = 3 + Math.max(0, s); x < imgA.width - 3 + Math.min(0, s); x++) {
          const ib = (y * imgB.width + x) * imgB.bpp
          const ia = (y * imgA.width + (x - s)) * imgA.bpp
          if (
            imgB.data[ib] !== imgA.data[ia] ||
            imgB.data[ib + 1] !== imgA.data[ia + 1] ||
            imgB.data[ib + 2] !== imgA.data[ia + 2]
          ) {
            mismatched++
            break
          }
        }
      if (!mismatched) return s
    }
    return null
  }
  const steps = []
  for (const t of [50, 150, 250, 350, 450]) steps.push(await at(t))
  const shifts = []
  for (let i = 1; i < 4; i++) shifts.push(exactShift(steps[i], steps[i - 1], 3 * n))
  const total = shifts.reduce((a, b) => a + (b ?? 0), 0)
  check(
    'each barber step is a whole-pixel translation of 1-bit art, 3n ± 1 device px',
    shifts.every((s) => s !== null && Math.abs(s - 3 * n) <= 1),
    `shifts ${shifts.join(', ')} (n = ${n})`
  )
  check(
    `three steps advance 9 system px (${3 * 3 * n} ± 1 device px)`,
    Math.abs(total - 9 * n) <= 1,
    `${total} device px`
  )
  check(
    'the cycle wraps seamlessly (next cycle byte-identical)',
    exactShift(steps[4], steps[0], 0) === 0,
    'currentTime 50 vs 450'
  )
  const barber = SURFACES[3]
  const { impure, counted } = await impureIn(page, barber, dpr, n)
  check('the stepped strip stays 1-bit', impure === 0, `${impure}/${counted} impure`)
  await page.close()
}

// ── grid-snap interplay: a knocked-off-grid tile grid recovers to zero ────
{
  const dpr = 2
  const page = await build(dpr, {
    consumerArt: true,
    bodyStyle: '#desk{top:0.35px;left:0.35px}',
  })
  const before = await impureIn(page, SURFACES[0], dpr, devicePxPerSystemPxAt(dpr))
  await page.evaluate(() => import('/src/index.js').then((m) => m.applyGridSnap()))
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  const after = await impureIn(page, SURFACES[0], dpr, devicePxPerSystemPxAt(dpr))
  console.log(`\nsnap interplay: ${before.impure} impure off-grid → ${after.impure} after applyGridSnap()`)
  check('desktop tile grid recovers to 1-bit under applyGridSnap()', after.impure === 0, `${after.impure} impure`)
  await page.close()
}

await report(browser)
