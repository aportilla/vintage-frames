/**
 * Verifies the pattern library and the `pattern` fill — src/patterns.ts,
 * src/pattern-fill.ts and `vf-container pattern="…"` (docs/PATTERNS.md).
 *
 * 1. The library: 38 entries in palette order, eight bytes each, none
 *    duplicated; the three QuickDraw constants and the windoid dots are the
 *    bytes the kit's own surfaces always drew; the attribute grammar
 *    (`parsePattern`) takes names and spaced or unspaced hex of either case
 *    and refuses everything else, prototype names included.
 * 2. The kit's dithers ARE library patterns: `patternMotif` of gray-50 /
 *    dots / gray-25 rasterizes pixel-identical to the 2×2 / 2×2 / 4×2 rect
 *    motifs the desktop, windoid bar and scroll trough were authored with —
 *    restated here as data, so the equivalence outlives the constants.
 * 3. A declared container is 1-bit at all eight densities — the ladder plus
 *    1.7 and 2.3, the emulated stand-ins for Safari's zoom-minted scales —
 *    its raster a whole count of device px, its ink the pattern's density;
 *    a hex literal paints byte-identically to the name it spells; a slotted
 *    image is NOT pixelated by the box's own nearest-neighbor setting.
 * 4. A measured container (fill-width, shrink-wrapped height) covers its
 *    box, re-encodes when the box grows, and stays 1-bit.
 * 5. An unpatterned container paints nothing; unsetting the attribute
 *    unwinds everything the fill wrote.
 * 6. An unrecognized value warns once per element and paints nothing.
 * 7. Forced colors flatten the fill to one color.
 * 8. A patterned container knocked off the device grid recovers to 1-bit by
 *    itself — the always-on snap, on the same box the fill paints.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:pattern
 */
import {
  check,
  decodePng,
  devicePxPerSystemPxAt,
  impureIn,
  launch,
  makeBuild,
  report,
} from './harness.mjs'

/** The density ladder plus the two broken-rung proxies (scales 20/17, 30/23). */
const DENSITIES = [1, 1.25, 1.5, 1.7, 2, 2.3, 2.5, 3]

const browser = await launch()
const build = makeBuild(browser, { settle: true })

/** Two animation frames, for a write that lands after the page settled. */
const frames = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )

/** Set a host's `pattern` property and wait for the render it causes. */
async function setPattern(page, id, value) {
  await page.evaluate(([id, value]) => {
    document.querySelector(id).pattern = value
  }, [id, value])
  await page.evaluate((id) => document.querySelector(id).updateComplete, id)
  await frames(page)
}

/** The container's shadow box: its computed background and the fill's footprint. */
const boxStyle = (page, id) =>
  page.evaluate((id) => {
    const box = document.querySelector(id).shadowRoot.querySelector('.box')
    const cs = getComputedStyle(box)
    return {
      size: cs.backgroundSize.split(' ').map(parseFloat),
      image: cs.backgroundImage.startsWith('url("data:image/png'),
      rendering: cs.imageRendering,
      patterned: box.classList.contains('vf-patterned'),
      inlineImage: box.style.getPropertyValue('--_vf-pattern-image') !== '',
      inlineSize: box.style.getPropertyValue('--_vf-pattern-size'),
    }
  }, id)

/**
 * The interior of a host screenshot, stepped in `pad` device px from every
 * edge (a box edge legitimately covers a partial device pixel at an
 * unholdable scale; the fill's interior is the claim): the impure count and
 * the ink fraction.
 */
function interior(png, pad = 4) {
  const { impure, counted } = impureIn(png, pad, pad, png.width - pad, png.height - pad)
  let ink = 0
  for (let y = pad; y < png.height - pad; y++) {
    for (let x = pad; x < png.width - pad; x++) {
      const i = (y * png.width + x) * png.bpp
      if (png.data[i] === 0 && png.data[i + 1] === 0 && png.data[i + 2] === 0) ink++
    }
  }
  return { impure, counted, ink: counted ? ink / counted : 0 }
}

/** Whether every pixel of a screenshot is the one color. */
function allPixels(png, [r, g, b]) {
  for (let i = 0; i < png.data.length; i += png.bpp) {
    if (png.data[i] !== r || png.data[i + 1] !== g || png.data[i + 2] !== b) return false
  }
  return true
}

const MAGENTA = [255, 0, 255]
const BLACK = [0, 0, 0]

// ── 1. the library ─────────────────────────────────────────────────────────
{
  const page = await build('')
  const lib = await page.evaluate(async () => {
    const m = await import('/src/index.js')
    const names = m.PATTERN_NAMES
    const hex = (n) => m.patternHex(m.PATTERNS[n])
    const none = [1, 2, 3, 4, 5, 6, 7, 8]
    return {
      count: names.length,
      first: names[0],
      last: names[names.length - 1],
      bytesOk: names.every(
        (n) =>
          m.PATTERNS[n].length === 8 &&
          m.PATTERNS[n].every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
      ),
      distinct: new Set(names.map(hex)).size,
      gray50: hex('gray-50'),
      gray25: hex('gray-25'),
      gray75: hex('gray-75'),
      dots: hex('dots'),
      roundTrip: names.every((n) => {
        const p = m.parsePattern(hex(n))
        return p !== null && m.patternHex(p) === hex(n)
      }),
      byName: names.every((n) => m.parsePattern(n) === m.PATTERNS[n]),
      spaced: m.patternHex(m.parsePattern('dd 77 DD 77 dd 77 DD 77') ?? none),
      padded: m.patternHex(m.parsePattern('  bricks  ') ?? none) === hex('bricks'),
      refused: [
        '',
        '   ',
        'nope',
        'Bricks',
        'DD77DD77DD77DD7',
        'DD77DD77DD77DD77DD',
        'GG77DD77DD77DD77',
        'constructor',
        '__proto__',
        'toString',
        'hasOwnProperty',
        null,
        undefined,
      ].map((v) => m.parsePattern(v)),
      size: m.PATTERN_SIZE,
    }
  })
  check(
    '38 patterns in palette order, black first and stones last',
    lib.count === 38 && lib.first === 'black' && lib.last === 'stones',
    `${lib.count}: ${lib.first} … ${lib.last}`
  )
  check(
    'every entry is eight bytes 0–255, and no two are alike',
    lib.bytesOk && lib.distinct === 38 && lib.size === 8,
    `${lib.distinct} distinct`
  )
  check(
    'gray-50 / gray-25 / gray-75 are QuickDraw gray / ltGray / dkGray (AA55 / 8822 / DD77)',
    lib.gray50 === 'AA55AA55AA55AA55' &&
      lib.gray25 === '8822882288228822' &&
      lib.gray75 === 'DD77DD77DD77DD77',
    `${lib.gray50} ${lib.gray25} ${lib.gray75}`
  )
  check('dots is the windoid dither (AA00)', lib.dots === 'AA00AA00AA00AA00', lib.dots)
  check(
    'hex round-trips every entry; a name resolves to the library tuple itself',
    lib.roundTrip && lib.byName
  )
  check(
    'spaced lower-case hex and a padded name parse',
    lib.spaced === 'DD77DD77DD77DD77' && lib.padded,
    lib.spaced
  )
  check(
    'empty, unknown, case-changed, wrong-length, non-hex and prototype names are refused',
    lib.refused.every((r) => r === null),
    lib.refused.map((r) => (r === null ? 'null' : 'ACCEPTED')).join(' ')
  )

  // ── 2. the kit's dithers are library patterns ────────────────────────────
  const motifs = await page.evaluate(async () => {
    const m = await import('/src/index.js')
    const raster = (w, h, rects) => {
      const cell = document.createElement('canvas')
      cell.width = w
      cell.height = h
      const cc = cell.getContext('2d')
      for (const [x, y, rw, rh, fill] of rects) {
        cc.fillStyle = fill ?? '#000000'
        cc.fillRect(x, y, rw, rh)
      }
      const out = document.createElement('canvas')
      out.width = 16
      out.height = 16
      const oc = out.getContext('2d')
      oc.fillStyle = oc.createPattern(cell, 'repeat')
      oc.fillRect(0, 0, 16, 16)
      return [...oc.getImageData(0, 0, 16, 16).data]
    }
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
    // The motifs the three surfaces were authored with, as data.
    const legacy = {
      desktop: [2, 2, [[0, 0, 2, 2, '#ffffff'], [0, 0, 1, 1, '#000000'], [1, 1, 1, 1, '#000000']]],
      dots: [2, 2, [[0, 0, 1, 1, '#000000']]],
      trough: [4, 2, [[0, 0, 1, 1], [2, 1, 1, 1]]],
    }
    const lib = {
      desktop: m.patternMotif(m.PATTERNS['gray-50'], '#000000', '#ffffff'),
      dots: m.patternMotif(m.PATTERNS['dots']),
      trough: m.patternMotif(m.PATTERNS['gray-25']),
    }
    const out = {}
    for (const k of Object.keys(legacy)) {
      const [w, h, rects] = legacy[k]
      out[k] = {
        pixels: same(raster(w, h, rects), raster(lib[k].width, lib[k].height, lib[k].rects)),
        cell: `${lib[k].width}×${lib[k].height}`,
        rects: JSON.stringify(lib[k].rects),
      }
    }
    const bricks = m.patternMotif(m.PATTERNS['bricks'])
    out.bricks = `${bricks.width}×${bricks.height}`
    out.black = JSON.stringify(m.patternMotif(m.PATTERNS['black']).rects)
    out.white = m.patternMotif(m.PATTERNS['white']).rects.length
    out.fullGray = m.patternRects(m.PATTERNS['gray-50']).length
    return out
  })
  check(
    'gray-50 on its minimal cell IS the desktop dither (2×2, opaque white + two black px)',
    motifs.desktop.pixels && motifs.desktop.cell === '2×2',
    motifs.desktop.rects
  )
  check(
    'dots on its minimal cell IS the windoid dither (2×2, one black px)',
    motifs.dots.pixels && motifs.dots.cell === '2×2',
    motifs.dots.rects
  )
  check(
    'gray-25 on its minimal cell IS the scroll trough (4×2, dots at (0,0) and (2,1))',
    motifs.trough.pixels && motifs.trough.cell === '4×2',
    motifs.trough.rects
  )
  check(
    'an 8-period pattern keeps the 8×8 cell; black is one rect; white has none; full-cell gray-50 is 32 runs',
    motifs.bricks === '8×8' &&
      motifs.black === '[[0,0,1,1,"#000000"]]' &&
      motifs.white === 0 &&
      motifs.fullGray === 32,
    `bricks ${motifs.bricks}, black ${motifs.black}, white ${motifs.white} rects, gray-50 ${motifs.fullGray} runs`
  )
  await page.close()
}

// ── 3. a declared container at eight densities ─────────────────────────────
const DECLARED = '<vf-container id="c" width="120" height="72" pattern="bricks"></vf-container>'
for (const dpr of DENSITIES) {
  const page = await build(DECLARED, { dpr })
  const n = devicePxPerSystemPxAt(dpr)
  const s = await boxStyle(page, '#c')
  // 120×72 declared → ceiled to whole cells plus one of overdraw: 128×80.
  const [bw, bh] = s.size
  check(
    `dpr ${dpr}: the raster is 128×80 system px = ${128 * n}×${80 * n} device px, pixelated`,
    s.patterned &&
      s.image &&
      s.rendering === 'pixelated' &&
      Math.abs(bw * dpr - 128 * n) < 0.01 &&
      Math.abs(bh * dpr - 80 * n) < 0.01,
    `${(bw * dpr).toFixed(3)}×${(bh * dpr).toFixed(3)} device px, ${s.rendering}`
  )
  const png = decodePng(await page.locator('#c').screenshot())
  const { impure, counted, ink } = interior(png)
  check(`dpr ${dpr}: the fill rasterizes 1-bit`, impure === 0, `${impure}/${counted} impure`)
  check(
    `dpr ${dpr}: the bricks are there (≈22/64 ink)`,
    Math.abs(ink - 22 / 64) < 0.04,
    `${(ink * 100).toFixed(1)}% ink`
  )
  await page.close()
}

{
  const page = await build(
    '<vf-container id="a" width="64" height="40" pattern="gray-75"></vf-container>' +
      '<vf-container id="b" width="64" height="40" pattern="dd 77 dd 77 DD 77 DD 77"></vf-container>' +
      '<vf-container id="p" width="40" height="40" pattern="dots"><img id="im" alt="" width="8" height="8"></vf-container>',
    { dpr: 2 }
  )
  const a = decodePng(await page.locator('#a').screenshot())
  const b = decodePng(await page.locator('#b').screenshot())
  check(
    'a hex literal paints byte-identically to the name it spells',
    a.width === b.width && a.height === b.height && a.data.equals(b.data),
    `${a.width}×${a.height}`
  )
  const rendering = await page.evaluate(() => ({
    box: getComputedStyle(
      document.querySelector('#p').shadowRoot.querySelector('.box')
    ).imageRendering,
    img: getComputedStyle(document.querySelector('#im')).imageRendering,
  }))
  check(
    'the box is pixelated, a slotted image is not (image-rendering handed back to the slot)',
    rendering.box === 'pixelated' && rendering.img === 'auto',
    `box ${rendering.box}, img ${rendering.img}`
  )
  await page.close()
}

// ── 4. a measured container ────────────────────────────────────────────────
{
  const page = await build(
    '<div id="wrap" style="width:200px"><vf-container id="m" fill-width pattern="gray-50">' +
      '<div style="height:40px"></div></vf-container></div>',
    { dpr: 2 }
  )
  // The observer's first measurement lands in a second update.
  await page.evaluate(() => document.querySelector('#m').updateComplete)
  await frames(page)
  const s1 = await boxStyle(page, '#m')
  const host = await page.evaluate(() => {
    const r = document.querySelector('#m').getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  check(
    'a measured fill covers the box it was given (fill-width in 200 CSS px, 40 tall)',
    s1.patterned && s1.size[0] >= host.w && s1.size[1] >= host.h,
    `raster ${s1.size[0]}×${s1.size[1]} CSS px over ${host.w}×${host.h}`
  )
  const i1 = interior(decodePng(await page.locator('#m').screenshot()))
  check(
    '…and rasterizes 1-bit at 50% ink',
    i1.impure === 0 && Math.abs(i1.ink - 0.5) < 0.02,
    `${i1.impure}/${i1.counted} impure, ${(i1.ink * 100).toFixed(1)}% ink`
  )
  await page.evaluate(() => {
    document.querySelector('#wrap').style.width = '300px'
  })
  await frames(page)
  await page.evaluate(() => document.querySelector('#m').updateComplete)
  await frames(page)
  const s2 = await boxStyle(page, '#m')
  const png2 = decodePng(await page.locator('#m').screenshot())
  const i2 = interior(png2)
  check(
    'a grown box re-encodes to cover the new width, still 1-bit',
    s2.size[0] >= 300 && s2.size[0] > s1.size[0] && i2.impure === 0 && png2.width === 600,
    `raster ${s2.size[0]}×${s2.size[1]} CSS px, shot ${png2.width} wide, ${i2.impure} impure`
  )
  await page.close()
}

// ── 5. unpatterned paints nothing; unsetting unwinds ───────────────────────
{
  const page = await build('<vf-container id="u" width="60" height="40"></vf-container>', {
    dpr: 2,
    bodyStyle: 'margin:0;background:#ff00ff',
  })
  const s0 = await boxStyle(page, '#u')
  check(
    'an unpatterned container paints nothing',
    !s0.patterned &&
      !s0.inlineImage &&
      s0.rendering === 'auto' &&
      allPixels(decodePng(await page.locator('#u').screenshot()), MAGENTA),
    `patterned ${s0.patterned}, inline image ${s0.inlineImage}, ${s0.rendering}`
  )
  await setPattern(page, '#u', 'black')
  const s1 = await boxStyle(page, '#u')
  check(
    'pattern="black" paints the whole box black',
    s1.patterned && allPixels(decodePng(await page.locator('#u').screenshot()), BLACK)
  )
  await setPattern(page, '#u', null)
  const s2 = await boxStyle(page, '#u')
  check(
    'unsetting the pattern unwinds the fill — class, inline properties and paint',
    !s2.patterned &&
      !s2.inlineImage &&
      s2.inlineSize === '' &&
      allPixels(decodePng(await page.locator('#u').screenshot()), MAGENTA),
    `patterned ${s2.patterned}, inline image ${s2.inlineImage}, size "${s2.inlineSize}"`
  )
  await page.close()
}

// ── 6. an unrecognized value ───────────────────────────────────────────────
{
  const page = await build('<vf-container id="b" width="40" height="40"></vf-container>', {
    dpr: 2,
    bodyStyle: 'margin:0;background:#ff00ff',
  })
  const warnings = []
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text())
  })
  await setPattern(page, '#b', 'nope')
  const s1 = await boxStyle(page, '#b')
  check(
    'an unknown pattern warns once and paints nothing',
    warnings.length === 1 &&
      /vf-container: unknown pattern "nope"/.test(warnings[0]) &&
      !s1.patterned &&
      allPixels(decodePng(await page.locator('#b').screenshot()), MAGENTA),
    `${warnings.length} warning(s): ${warnings.join(' | ')}`
  )
  await setPattern(page, '#b', 'bricks')
  const s2 = await boxStyle(page, '#b')
  await setPattern(page, '#b', 'still nope')
  const s3 = await boxStyle(page, '#b')
  check(
    'a later valid value paints; a later bad one paints nothing and warns no further',
    s2.patterned && !s3.patterned && warnings.length === 1,
    `${warnings.length} warning(s)`
  )
  await page.close()
}

// ── 7. forced colors ───────────────────────────────────────────────────────
{
  const page = await build(
    '<vf-container id="f" width="80" height="48" pattern="bricks"></vf-container>',
    { dpr: 2, forcedColors: 'active' }
  )
  const png = decodePng(await page.locator('#f').screenshot())
  const colors = new Set()
  for (let i = 0; i < png.data.length; i += png.bpp) {
    colors.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`)
  }
  const s = await boxStyle(page, '#f')
  check(
    'forced colors flatten the fill to one color, the pattern still resolved',
    colors.size === 1 && s.patterned,
    [...colors].join(' | ')
  )
  await page.close()
}

// ── 8. snap interplay ──────────────────────────────────────────────────────
{
  const page = await build(
    '<vf-container id="s" width="120" height="72" pattern="gray-50" ' +
      'style="position:absolute;top:0.35px;left:0.35px"></vf-container>',
    { dpr: 2 }
  )
  await frames(page)
  const offGrid = await page.evaluate(async () => {
    const { truePixelRatio } = await import('/src/index.js')
    const dpr = truePixelRatio()
    const r = document.getElementById('s').getBoundingClientRect()
    const err = (v) => Math.abs(v * dpr - Math.round(v * dpr))
    return +Math.max(err(r.left), err(r.top)).toFixed(3)
  })
  const { impure, counted } = interior(decodePng(await page.locator('#s').screenshot()))
  check('the perturbation lands on the host', offGrid > 0.05, `${offGrid} device px`)
  check(
    'a patterned container knocked off the grid recovers to 1-bit by itself',
    impure === 0,
    `${impure}/${counted} impure`
  )
  await page.close()
}

await report(browser)
