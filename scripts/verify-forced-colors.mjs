/**
 * Verifies the kit under forced-colors mode (Windows High Contrast) —
 * ACCESSIBILITY-REVIEW.md §2.1–2.5. Forced colors is the one channel where
 * the OS overrides the kit's ONLY semantic channel (color), and the fix has
 * one umbrella (the vfBase token remap to system colors, which survive the
 * forced cascade) plus per-site work for the three paint kinds the remap
 * can't reach: gradients (deleted — rescued with forced-color-adjust),
 * url() tiles (preserved with literal ink — re-inked as masks), and
 * box-shadows (never painted — replaced or exempted).
 *
 * Everything is asserted against rendered pixels or resolved colors under
 * CDP emulation, on the DARK forced theme — the one where literal-black ink
 * actually disappears (the light theme coincides with the kit's own palette
 * and hides every §2 failure). A light-theme spot check and a normal-mode
 * leak guard bracket it: every forced-colors rule is @media-scoped, so the
 * default rendering must not move at all.
 *
 * The scrollbar rail is the one deliberate residual: author scrollbar styles
 * are consulted and forced (measured), but mask-image is IGNORED on
 * ::-webkit-scrollbar pseudos (also measured), so the arrow sprites cannot
 * follow the theme and render as empty bordered boxes on dark themes — see
 * the note in src/styles/recipes/scrollbars.ts. Headless can't paint author
 * scrollbar skins at all, so that residual is recorded, not asserted.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:forced-colors
 */
import { ORIGIN, SCALE, check, decodePng, launch, report } from './harness.mjs'

/** Headless Chromium runs at dpr 1, where the kit derives 1 device px per system px. */
const S = 3 // pinned on the fixture body: these are raster measurements

const rgbAt = (png, x, y) => {
  const i = (Math.round(y) * png.width + Math.round(x)) * png.bpp
  return [png.data[i], png.data[i + 1], png.data[i + 2]]
}
const near = (a, b, tol = 12) => a.every((c, i) => Math.abs(c - b[i]) <= tol)

/** Count pixels in a rect near a color. */
function count(png, x0, y0, w, h, color, tol = 12) {
  let n = 0
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
    for (let x = Math.round(x0); x < Math.round(x0 + w); x++)
      if (near(rgbAt(png, x, y), color, tol)) n++
  return n
}

const browser = await launch()

/** A page with the kit loaded and every vf-* element upgraded. */
async function build(markup) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;padding:24px;--vf-scale:3">${markup}` +
      // Probe elements resolving the forced palette at runtime, so the pixel
      // expectations below come from the emulated theme rather than guesses.
      `<div id="sys-probe" style="position:absolute;left:-100px;color:CanvasText;background-color:Canvas"></div>` +
      `<div id="hl-probe" style="position:absolute;left:-100px;color:HighlightText;background-color:Highlight"></div>`
  )
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await settle(page)
  return page
}

const settle = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

const parseRgb = (s) => {
  const m = s.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/)
  return m ? { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null
}

/** The forced palette as this run's theme resolves it, from the probe divs. */
async function palette(page) {
  const raw = await page.evaluate(() => {
    const sys = getComputedStyle(document.getElementById('sys-probe'))
    const hl = getComputedStyle(document.getElementById('hl-probe'))
    return {
      canvasText: sys.color,
      canvas: sys.backgroundColor,
      highlight: hl.backgroundColor,
      highlightText: hl.color,
    }
  })
  const ink = parseRgb(raw.canvasText).rgb
  const surface = parseRgb(raw.canvas).rgb
  const hl = parseRgb(raw.highlight)
  // Highlight can carry alpha (it does in Chromium's emulated themes); what a
  // screenshot shows is the composite over Canvas.
  const highlight = hl.rgb.map((c, i) => Math.round(c * hl.a + surface[i] * (1 - hl.a)))
  return { ink, surface, highlight, highlightText: parseRgb(raw.highlightText).rgb }
}

const rect = (page, id, sel) =>
  page.evaluate(
    ([elId, s]) => {
      const host = document.getElementById(elId)
      const el = s ? host.shadowRoot.querySelector(s) : host
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    },
    [id, sel]
  )

const shotOf = async (page, box, pad = 6) =>
  decodePng(
    await page.screenshot({
      clip: { x: box.x - pad, y: box.y - pad, width: box.w + 2 * pad, height: box.h + 2 * pad },
    })
  )

// ═══ The main fixture, checked dark-forced first, then the brackets ════════
const page = await build(
  '<div style="display:flex;flex-direction:column;gap:24px;align-items:flex-start">' +
    '<vf-button id="btn">OK</vf-button>' +
    '<vf-checkbox id="cb" checked>Keep</vf-checkbox>' +
    '<vf-progress-bar id="pb" value="60" style="width:300px"></vf-progress-bar>' +
    '<vf-progress-bar id="pbi" indeterminate style="width:300px"></vf-progress-bar>' +
    // Rows need distinct values: value defaults to '', and the list adopting
    // the selected row's '' as its own value would then select every row.
    '<vf-list id="list" style="width:200px">' +
    '<vf-list-item id="row1" value="a" selected>Alpha</vf-list-item>' +
    '<vf-list-item id="row2" value="b">Beta</vf-list-item>' +
    '</vf-list>' +
    '<vf-swatch id="sw" color="#ff6600"></vf-swatch>' +
    '<vf-window id="doc" heading="Document" width="260" height="90" active></vf-window>' +
    '<vf-window id="pal" heading="" variant="utility" width="260" height="60" active></vf-window>' +
    '<vf-scroll-area id="sa" label="Notes" style="width:200px;height:60px">' +
    '<p style="margin:0;height:200px">tall</p></vf-scroll-area>' +
    '</div>'
)

// ── normal mode first: none of the forced branches may leak ───────────────
{
  const leak = await page.evaluate(() => {
    const sr = (id, sel) => document.getElementById(id).shadowRoot.querySelector(sel)
    const stripes = getComputedStyle(sr('pbi', '.fill.stripes'))
    const strip = getComputedStyle(sr('pbi', '.vf-tile-strip'))
    const stripRaster = getComputedStyle(sr('pbi', '.vf-tile-strip .vf-tile-raster'))
    const dotsRaster = getComputedStyle(sr('pal', '.vf-dots .vf-tile-raster'))
    const close = getComputedStyle(sr('doc', '.close'))
    const fill = getComputedStyle(sr('sw', '.fill'))
    return {
      // The art rides the exact-fill raster (src/tile-grid.ts), painted as a
      // raster data URI, visible, with the layer unmasked and the animation
      // on the strip — the forced-colors branches must not leak into any of
      // that in normal mode.
      stripRasterImage: stripRaster.backgroundImage.startsWith('url("data:image/png'),
      stripRasterShown: stripRaster.display !== 'none',
      stripesMask: stripes.maskImage,
      stripAnim: strip.animationName,
      dotsImage: dotsRaster.backgroundImage.startsWith('url("data:image/png'),
      dotsShown: dotsRaster.display !== 'none',
      closeShadow: close.boxShadow !== 'none',
      closeAdjust: close.forcedColorAdjust,
      fillAdjust: fill.forcedColorAdjust,
      fillChecker: fill.backgroundImage.includes('url("data:image/svg+xml'),
    }
  })
  check(
    'normal mode: the barber strip paints its raster art, unmasked, animated by vf-barber',
    leak.stripRasterImage &&
      leak.stripRasterShown &&
      leak.stripesMask === 'none' &&
      leak.stripAnim === 'vf-barber',
    `mask=${leak.stripesMask} anim=${leak.stripAnim}`
  )
  check(
    'normal mode: the windoid dots paint their raster art',
    leak.dotsImage && leak.dotsShown
  )
  check(
    'normal mode: the close box keeps its box-shadow patch and default color adjust',
    leak.closeShadow && leak.closeAdjust === 'auto',
    `adjust=${leak.closeAdjust}`
  )
  check(
    'normal mode: the swatch fill is not exempted and shows its checker',
    leak.fillAdjust === 'auto' && leak.fillChecker,
    `adjust=${leak.fillAdjust}`
  )
}

// ── dark forced theme: the one where literal black ink disappears ─────────
await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' })
await settle(page)
const P = await palette(page)
check(
  'the emulated dark forced theme inverts the pair (the precondition for every check below)',
  P.ink.every((c) => c > 192) && P.surface.every((c) => c < 64),
  `CanvasText=${P.ink} Canvas=${P.surface}`
)

// §2 umbrella: the tokens resolve to the system pair inside a shadow root.
{
  const tok = await page.evaluate(() => {
    const box = document.getElementById('cb').shadowRoot.querySelector('.box')
    const cs = getComputedStyle(box)
    return { border: cs.borderTopColor, well: cs.backgroundColor }
  })
  check(
    '§2.2 the vfBase token remap reaches component paint (checkbox border=CanvasText, well=Canvas)',
    near(parseRgb(tok.border).rgb, P.ink) && near(parseRgb(tok.well).rgb, P.surface),
    `border=${tok.border} well=${tok.well}`
  )
}

// §2.3: the button's difference-of-silhouettes survives.
{
  const box = await rect(page, 'btn', 'button')
  const png = await shotOf(page, box)
  const pad = 6
  // The frame: the top edge's center column must be ink; before the fix the
  // whole silhouette forced to Canvas and the button vanished into the page.
  const frameInk = count(png, pad + box.w / 2 - S, pad, 2 * S, S, P.ink)
  const glyphInk = count(png, pad + S, pad + S, box.w - 2 * S, box.h - 2 * S, P.ink)
  check(
    '§2.3 the button frame paints in CanvasText (the silhouette is back)',
    frameInk >= S,
    `${frameInk} ink px on the top edge`
  )
  check('§2.3 the label glyphs paint in CanvasText', glyphInk > 20, `${glyphInk} ink px`)

  // Pressed: the face inverts to CanvasText and the label to Canvas.
  await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2)
  await page.mouse.down()
  await settle(page)
  const pressed = await shotOf(page, box)
  const face = count(pressed, pad + 4 * S, pad + 4 * S, box.w - 8 * S, box.h - 8 * S, P.ink)
  check(
    '§2.3 pressed: the face inverts to CanvasText',
    face > ((box.w - 8 * S) * (box.h - 8 * S)) / 2,
    `${face} ink px in the face interior`
  )
  await page.mouse.up()
  await settle(page)
}

// §2.1: keyboard focus draws the dashed underline in the forced ink.
{
  // Park focus on the page first — the pressed-button check above left focus
  // on the button, and Tab from there would land on the checkbox.
  await page.mouse.click(4, 4)
  await page.keyboard.press('Tab')
  await settle(page)
  const label = await rect(page, 'btn', '.label')
  const face = await rect(page, 'btn', 'button')
  const png = await shotOf(page, face)
  const pad = 6
  // Row 15 of the 20px face (verify:focus pins this in normal mode).
  const y = pad + 15 * S + Math.round(S / 2)
  const x0 = pad + (label.x - face.x)
  // Dash runs along the rule row: alternating S-wide ink and gaps.
  const runs = []
  let start = null
  for (let x = Math.round(x0); x < Math.round(x0 + label.w); x++) {
    const ink = near(rgbAt(png, x, y), P.ink)
    if (ink && start === null) start = x
    else if (!ink && start !== null) {
      runs.push([start, x])
      start = null
    }
  }
  if (start !== null) runs.push([start, Math.round(x0 + label.w)])
  check(
    '§2.1 the focus underline paints under forced colors (forced-color-adjust rescue)',
    runs.length > 4,
    `${runs.length} dashes on face row 15`
  )
  check(
    '§2.1 …still 1 system px on, 1 off, in the forced ink',
    runs.length > 4 &&
      runs.every(([a, b]) => b - a === S) &&
      runs.every(([a], i) => i === 0 || a - runs[i - 1][1] === S),
    `widths=${[...new Set(runs.map(([a, b]) => b - a))]}`
  )
  const outline = await page.evaluate(
    () => getComputedStyle(document.getElementById('btn').shadowRoot.querySelector('button')).outlineStyle
  )
  check('§2.1 …and it is the kit\'s own mark: the UA outline stays off', outline === 'none', outline)
}

// §2.2: the selection inversion lands on the user's Highlight pair. Sampled
// over the rows' left half — the right edge sits under the list's permanent
// scroll rail, which headless paints its own way.
{
  const row = await rect(page, 'row1', null)
  const png = await shotOf(page, row, 0)
  const half = row.w / 2 - 2
  const bg = count(png, 2, 2, half, row.h - 4, P.highlight, 16)
  const text = count(png, 2, 2, half, row.h - 4, P.highlightText, 16)
  check(
    '§2.2 the selected row fills with Highlight and its text with HighlightText',
    bg > (half * (row.h - 4)) / 2 && text > 20,
    `bg=${bg} text=${text} of ${half * (row.h - 4)}`
  )
  const row2 = await rect(page, 'row2', null)
  const png2 = await shotOf(page, row2, 0)
  const plain = count(png2, 2, 2, half, row2.h - 4, P.surface, 16)
  check(
    '§2.2 an unselected row stays on Canvas (the inversion is a real state again)',
    plain > (half * (row2.h - 4)) * 0.6,
    `${plain} surface px of ${half * (row2.h - 4)}`
  )
}

// §2.4: the progress bar reads again.
{
  const track = await rect(page, 'pb', '.track')
  const png = await shotOf(page, track, 0)
  const inside = (fx) => rgbAt(png, track.w * fx, track.h / 2)
  check(
    '§2.4 determinate: the fill paints in CanvasText and the track in Canvas',
    near(inside(0.2), P.ink) && near(inside(0.9), P.surface),
    `20%=${inside(0.2)} 90%=${inside(0.9)}`
  )
  const stripes = await rect(page, 'pbi', '.track')
  const spng = await shotOf(page, stripes, 0)
  const total = (stripes.w - 4 * S) * (stripes.h - 4 * S)
  const inkPx = count(spng, 2 * S, 2 * S, stripes.w - 4 * S, stripes.h - 4 * S, P.ink)
  const surfacePx = count(spng, 2 * S, 2 * S, stripes.w - 4 * S, stripes.h - 4 * S, P.surface)
  check(
    '§2.4 indeterminate: the barber stripes re-ink as a mask — both colors present',
    inkPx > total * 0.25 && surfacePx > total * 0.25,
    `ink=${inkPx} surface=${surfacePx} of ${total}`
  )
}

// §2.5: the windoid dot bar re-inks; the desktop decision is flat (vf-desktop).
{
  const dots = await rect(page, 'pal', '.vf-dots')
  const png = await shotOf(page, dots, 0)
  // Sample the right half, clear of the 7×7 utility close box on the left.
  const w = dots.w / 2 - 4
  const total = w * dots.h
  const inkPx = count(png, dots.w / 2, 0, w, dots.h, P.ink)
  check(
    '§2.5 the windoid dot dither paints in CanvasText (~25% density)',
    inkPx > total * 0.12 && inkPx < total * 0.45,
    `${inkPx} ink px of ${total}`
  )
}

// §2.5/§2.2: the document window's racing stripes and widget patch survive.
{
  const bar = await rect(page, 'doc', '.vf-title-bar')
  const box = await rect(page, 'doc', '.close')
  const png = await shotOf(page, bar, 0)
  // Stripes between the close box's patch and the title patch.
  const x = box.x - bar.x + box.w + 4 * S
  const stripeInk = count(png, x, 3 * S, 4 * S, bar.h - 6 * S, P.ink)
  check(
    'the active window\'s racing stripes paint in CanvasText (forced-color-adjust rescue)',
    stripeInk > 3 * (bar.h - 6 * S),
    `${stripeInk} ink px beside the close box`
  )
  // The 1px patch ring around the widget: pure Canvas, no stripe crosses it.
  const ringX = box.x - bar.x - S
  const ringInk = count(png, ringX, box.y - bar.y, S, box.h, P.ink)
  check(
    'the close box\'s white patch ring is back (box-shadow via forced-color-adjust)',
    ringInk === 0,
    `${ringInk} ink px in the ring band`
  )
  // Pressed: the go-away sunburst repaints as a mask in CanvasText.
  await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2)
  await page.mouse.down()
  await settle(page)
  const pressed = await shotOf(page, box, 0)
  const spokes = count(pressed, S, S, box.w - 2 * S, box.h - 2 * S, P.ink)
  check(
    '§2.5 the pressed sunburst re-inks as a mask',
    spokes > 40,
    `${spokes} spoke px while pressed`
  )
  // Release well away so no vf-close fires.
  await page.mouse.move(4, 690)
  await page.mouse.up()
  await settle(page)
}

// The swatch shows its actual color: fill is content, exempted.
{
  const fill = await rect(page, 'sw', '.fill')
  const png = await shotOf(page, fill, 0)
  const center = rgbAt(png, fill.w / 2, fill.h / 2)
  check(
    'the swatch still shows its color (forced-color-adjust: the fill is content)',
    near(center, [255, 102, 0], 8),
    `center=${center}`
  )
}

// Canary: the ring-carrying controls still get their dotted outline. The
// scroll viewport is a tab stop (its content overflows), so walk focus to it.
{
  await page.mouse.click(4, 4)
  let focused = false
  for (let i = 0; i < 20 && !focused; i++) {
    await page.keyboard.press('Tab')
    focused = await page.evaluate(() => {
      const sa = document.getElementById('sa')
      return sa.shadowRoot.activeElement?.classList.contains('viewport') ?? false
    })
  }
  const ring = await page.evaluate(() => {
    const vp = document.getElementById('sa').shadowRoot.querySelector('.viewport')
    const cs = getComputedStyle(vp)
    return { style: cs.outlineStyle, color: cs.outlineColor }
  })
  check(
    'the dotted focus ring survives forced colors on its own (outline-color is forced, not deleted)',
    focused && ring.style === 'dotted',
    `focused=${focused} ${JSON.stringify(ring)}`
  )
}

// ── light forced theme spot check: same repairs, other polarity ───────────
await page.emulateMedia({ forcedColors: 'active', colorScheme: 'light' })
await settle(page)
{
  const L = await palette(page)
  const track = await rect(page, 'pb', '.track')
  const png = await shotOf(page, track, 0)
  const fillPx = rgbAt(png, track.w * 0.2, track.h / 2)
  const box = await rect(page, 'btn', 'button')
  const bpng = await shotOf(page, box)
  const frameInk = count(bpng, 6 + box.w / 2 - S, 6, 2 * S, S, L.ink)
  check(
    'light forced theme: fill and silhouette hold with the inverse pair',
    near(fillPx, L.ink) && frameInk >= S,
    `fill=${fillPx} ink=${L.ink} frame=${frameInk}`
  )
}

await page.close()
await report(browser)
